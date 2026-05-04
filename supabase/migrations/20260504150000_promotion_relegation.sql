-- ─────────────────────────────────────────────────────────────
-- Auto promotion / relegation between adjacent divisions
-- ─────────────────────────────────────────────────────────────
-- For each country, walk every (division N, division N+1) pair of
-- active leagues. Take the just-finished season's bottom `count`
-- clubs of the upper division and swap them with the top `count`
-- clubs of the lower division. Both clubs.league_id rows flip;
-- a 'club' narrative + manager notification record the move.
--
-- Called by league-scheduler right after the recap step, BEFORE
-- start_next_season runs (so the new seasons get standings with
-- the post-swap club set).

CREATE OR REPLACE FUNCTION public.apply_promotion_relegation(
  p_finished_year INT,
  p_count INT DEFAULT 4,
  p_country TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_row RECORD;
  v_upper RECORD;
  v_lower RECORD;
  v_upper_season UUID;
  v_lower_season UUID;
  v_relegated UUID[];
  v_promoted UUID[];
  v_club_id UUID;
  v_club_name TEXT;
  v_upper_name TEXT;
  v_lower_name TEXT;
  v_user_id UUID;
  v_total_swaps INT := 0;
  v_pairs INT := 0;
BEGIN
  -- Iterate countries (filtered if p_country given)
  FOR v_country_row IN
    SELECT DISTINCT country FROM public.leagues
     WHERE status = 'active'
       AND (p_country IS NULL OR country = p_country)
  LOOP
    -- For each upper league in this country, find the league one division below
    FOR v_upper IN
      SELECT id, name, division FROM public.leagues
       WHERE country = v_country_row.country AND status = 'active'
       ORDER BY division
    LOOP
      SELECT id, name INTO v_lower
        FROM public.leagues
       WHERE country = v_country_row.country
         AND status = 'active'
         AND division = v_upper.division + 1;
      IF v_lower IS NULL THEN CONTINUE; END IF;
      v_pairs := v_pairs + 1;

      -- Both seasons must be finished at the target game year
      SELECT id INTO v_upper_season FROM public.league_seasons
       WHERE league_id = v_upper.id AND season_number = p_finished_year AND status = 'finished';
      SELECT id INTO v_lower_season FROM public.league_seasons
       WHERE league_id = v_lower.id AND season_number = p_finished_year AND status = 'finished';
      IF v_upper_season IS NULL OR v_lower_season IS NULL THEN CONTINUE; END IF;

      -- Bottom p_count of upper league (worst standings)
      SELECT ARRAY_AGG(club_id) INTO v_relegated
        FROM (
          SELECT club_id
            FROM public.league_standings
           WHERE season_id = v_upper_season
           ORDER BY points ASC, (goals_for - goals_against) ASC, goals_for ASC
           LIMIT p_count
        ) sub;

      -- Top p_count of lower league (best standings)
      SELECT ARRAY_AGG(club_id) INTO v_promoted
        FROM (
          SELECT club_id
            FROM public.league_standings
           WHERE season_id = v_lower_season
           ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC
           LIMIT p_count
        ) sub;

      v_upper_name := v_upper.name;
      v_lower_name := v_lower.name;

      -- RELEGATIONS: upper's bottom → lower league
      IF v_relegated IS NOT NULL THEN
        FOREACH v_club_id IN ARRAY v_relegated LOOP
          SELECT name INTO v_club_name FROM public.clubs WHERE id = v_club_id;
          UPDATE public.clubs SET league_id = v_lower.id WHERE id = v_club_id;

          INSERT INTO public.narratives (entity_type, entity_id, scope, season, body_pt, body_en, facts_json)
          VALUES (
            'club', v_club_id, 'relegation', p_finished_year,
            v_club_name || ' rebaixado: depois da temporada ' || p_finished_year || ' termina o ciclo na ' ||
              v_upper_name || ' e cai pra ' || v_lower_name || '. Reconstrução pesada à frente, e a torcida cobra reação imediata.',
            v_club_name || ' relegated: after season ' || p_finished_year || ' the spell in ' ||
              v_upper_name || ' ends and the club drops to ' || v_lower_name || '. Heavy rebuild ahead, with the crowd demanding an instant reaction.',
            jsonb_build_object('from_league', v_upper_name, 'to_league', v_lower_name, 'kind', 'relegation', 'finished_year', p_finished_year)
          );

          -- Notify human manager if any
          SELECT mp.user_id INTO v_user_id
            FROM public.clubs c
            JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
           WHERE c.id = v_club_id;
          IF v_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, title, body, link, read)
            VALUES (v_user_id, 'system',
                    'Rebaixamento confirmado',
                    v_club_name || ' caiu pra ' || v_lower_name || ' no fim da Temporada ' || p_finished_year,
                    '/club/' || v_club_id::text, false);
          END IF;
          v_total_swaps := v_total_swaps + 1;
        END LOOP;
      END IF;

      -- PROMOTIONS: lower's top → upper league
      IF v_promoted IS NOT NULL THEN
        FOREACH v_club_id IN ARRAY v_promoted LOOP
          SELECT name INTO v_club_name FROM public.clubs WHERE id = v_club_id;
          UPDATE public.clubs SET league_id = v_upper.id WHERE id = v_club_id;

          INSERT INTO public.narratives (entity_type, entity_id, scope, season, body_pt, body_en, facts_json)
          VALUES (
            'club', v_club_id, 'promotion', p_finished_year,
            v_club_name || ' está de volta à elite — campanha sólida na Temporada ' || p_finished_year ||
              ' garante o acesso da ' || v_lower_name || ' pra ' || v_upper_name || '. Festa nos bastidores, e expectativa enorme pra próxima temporada.',
            v_club_name || ' is back to the top — a solid Season ' || p_finished_year || ' campaign earns promotion from ' ||
              v_lower_name || ' to ' || v_upper_name || '. Celebration behind the scenes, huge expectations for next season.',
            jsonb_build_object('from_league', v_lower_name, 'to_league', v_upper_name, 'kind', 'promotion', 'finished_year', p_finished_year)
          );

          SELECT mp.user_id INTO v_user_id
            FROM public.clubs c
            JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
           WHERE c.id = v_club_id;
          IF v_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, title, body, link, read)
            VALUES (v_user_id, 'system',
                    'Acesso confirmado!',
                    v_club_name || ' subiu pra ' || v_upper_name || ' no fim da Temporada ' || p_finished_year,
                    '/club/' || v_club_id::text, false);
          END IF;
          v_total_swaps := v_total_swaps + 1;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'pairs_processed', v_pairs,
    'clubs_swapped', v_total_swaps,
    'finished_year', p_finished_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_promotion_relegation(INT, INT, TEXT) TO service_role;

-- Admin manual trigger (gated by is_admin_caller).
CREATE OR REPLACE FUNCTION public.admin_apply_promotion_relegation(
  p_finished_year INT,
  p_count INT DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN public.apply_promotion_relegation(p_finished_year, p_count, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_apply_promotion_relegation(INT, INT) TO authenticated;
