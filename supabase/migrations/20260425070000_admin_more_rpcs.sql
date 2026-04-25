-- ═══════════════════════════════════════════════════════════
-- More admin RPCs:
--   • Match: force_start, simulate, restart
--   • Player: set_energy, grant_store_item, reset_avatar
-- finalize_match isn't an RPC — the client invokes the existing
-- match-engine-lab edge function with action='finish_match' so all
-- persistence (energy, discipline, stats, standings) reuses one path.
-- ═══════════════════════════════════════════════════════════


-- ─── admin_force_start_match ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_force_start_match(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status INTO v_status FROM public.matches WHERE id = p_match_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF v_status <> 'scheduled' THEN
    RAISE EXCEPTION 'Match is not scheduled (current: %)', v_status;
  END IF;

  UPDATE public.matches
  SET scheduled_at = now() - INTERVAL '1 second'
  WHERE id = p_match_id;

  -- Wake the engine cron immediately so it picks the match up now.
  PERFORM public.trigger_match_engine(0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_force_start_match(UUID) TO authenticated;


-- ─── admin_simulate_match ───────────────────────────────────
-- Stamp final score + standings without running engine ticks.
-- Use case: scheduled match that should resolve "on paper" right
-- now. NULL scores → random 0-3 each.
CREATE OR REPLACE FUNCTION public.admin_simulate_match(
  p_match_id UUID,
  p_home_score INT DEFAULT NULL,
  p_away_score INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_home INT;
  v_away INT;
  v_league_match RECORD;
  v_round RECORD;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF v_match.status = 'finished' THEN
    RAISE EXCEPTION 'Match already finished';
  END IF;

  v_home := COALESCE(p_home_score, FLOOR(random() * 4)::INT);
  v_away := COALESCE(p_away_score, FLOOR(random() * 4)::INT);

  -- Resolve any active turns so realtime subscribers don't tick further.
  UPDATE public.match_turns
  SET status = 'resolved', resolved_at = now()
  WHERE match_id = p_match_id AND status = 'active';

  UPDATE public.matches
  SET status = 'finished',
      home_score = v_home,
      away_score = v_away,
      finished_at = now(),
      started_at = COALESCE(started_at, now())
  WHERE id = p_match_id;

  INSERT INTO public.match_event_logs (match_id, event_type, title, body)
  VALUES (
    p_match_id,
    'final_whistle',
    FORMAT('🏁 Apito final! %s – %s', v_home, v_away),
    'Resultado simulado pelo admin.'
  );

  -- Standings (league matches only) — incremental update like finish_match.
  SELECT * INTO v_league_match FROM public.league_matches WHERE match_id = p_match_id;
  IF v_league_match IS NOT NULL THEN
    SELECT * INTO v_round FROM public.league_rounds WHERE id = v_league_match.round_id;
    IF v_round IS NOT NULL THEN
      INSERT INTO public.league_standings (
        season_id, club_id, played, won, drawn, lost,
        goals_for, goals_against, points
      )
      VALUES (
        v_round.season_id, v_match.home_club_id, 1,
        (CASE WHEN v_home > v_away THEN 1 ELSE 0 END),
        (CASE WHEN v_home = v_away THEN 1 ELSE 0 END),
        (CASE WHEN v_home < v_away THEN 1 ELSE 0 END),
        v_home, v_away,
        (CASE WHEN v_home > v_away THEN 3 WHEN v_home = v_away THEN 1 ELSE 0 END)
      )
      ON CONFLICT (season_id, club_id) DO UPDATE SET
        played = public.league_standings.played + 1,
        won = public.league_standings.won + (CASE WHEN v_home > v_away THEN 1 ELSE 0 END),
        drawn = public.league_standings.drawn + (CASE WHEN v_home = v_away THEN 1 ELSE 0 END),
        lost = public.league_standings.lost + (CASE WHEN v_home < v_away THEN 1 ELSE 0 END),
        goals_for = public.league_standings.goals_for + v_home,
        goals_against = public.league_standings.goals_against + v_away,
        points = public.league_standings.points + (CASE WHEN v_home > v_away THEN 3 WHEN v_home = v_away THEN 1 ELSE 0 END),
        updated_at = now();

      INSERT INTO public.league_standings (
        season_id, club_id, played, won, drawn, lost,
        goals_for, goals_against, points
      )
      VALUES (
        v_round.season_id, v_match.away_club_id, 1,
        (CASE WHEN v_away > v_home THEN 1 ELSE 0 END),
        (CASE WHEN v_away = v_home THEN 1 ELSE 0 END),
        (CASE WHEN v_away < v_home THEN 1 ELSE 0 END),
        v_away, v_home,
        (CASE WHEN v_away > v_home THEN 3 WHEN v_away = v_home THEN 1 ELSE 0 END)
      )
      ON CONFLICT (season_id, club_id) DO UPDATE SET
        played = public.league_standings.played + 1,
        won = public.league_standings.won + (CASE WHEN v_away > v_home THEN 1 ELSE 0 END),
        drawn = public.league_standings.drawn + (CASE WHEN v_away = v_home THEN 1 ELSE 0 END),
        lost = public.league_standings.lost + (CASE WHEN v_away < v_home THEN 1 ELSE 0 END),
        goals_for = public.league_standings.goals_for + v_away,
        goals_against = public.league_standings.goals_against + v_home,
        points = public.league_standings.points + (CASE WHEN v_away > v_home THEN 3 WHEN v_away = v_home THEN 1 ELSE 0 END),
        updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object('home_score', v_home, 'away_score', v_away);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_simulate_match(UUID, INT, INT) TO authenticated;


-- ─── admin_restart_match ────────────────────────────────────
-- Wipe match children and reset to a fresh scheduled state.
-- If the match was already finished, undo its standings impact.
CREATE OR REPLACE FUNCTION public.admin_restart_match(
  p_match_id UUID,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_league_match RECORD;
  v_round RECORD;
  v_home INT;
  v_away INT;
  v_target_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_target_at := COALESCE(p_scheduled_at, now() + INTERVAL '5 minutes');

  -- Undo standings if the match was finished and is part of a league round.
  IF v_match.status = 'finished' THEN
    SELECT * INTO v_league_match FROM public.league_matches WHERE match_id = p_match_id;
    IF v_league_match IS NOT NULL THEN
      SELECT * INTO v_round FROM public.league_rounds WHERE id = v_league_match.round_id;
      IF v_round IS NOT NULL THEN
        v_home := COALESCE(v_match.home_score, 0);
        v_away := COALESCE(v_match.away_score, 0);

        UPDATE public.league_standings SET
          played = GREATEST(played - 1, 0),
          won = GREATEST(won - (CASE WHEN v_home > v_away THEN 1 ELSE 0 END), 0),
          drawn = GREATEST(drawn - (CASE WHEN v_home = v_away THEN 1 ELSE 0 END), 0),
          lost = GREATEST(lost - (CASE WHEN v_home < v_away THEN 1 ELSE 0 END), 0),
          goals_for = GREATEST(goals_for - v_home, 0),
          goals_against = GREATEST(goals_against - v_away, 0),
          points = GREATEST(points - (CASE WHEN v_home > v_away THEN 3 WHEN v_home = v_away THEN 1 ELSE 0 END), 0),
          updated_at = now()
        WHERE season_id = v_round.season_id AND club_id = v_match.home_club_id;

        UPDATE public.league_standings SET
          played = GREATEST(played - 1, 0),
          won = GREATEST(won - (CASE WHEN v_away > v_home THEN 1 ELSE 0 END), 0),
          drawn = GREATEST(drawn - (CASE WHEN v_away = v_home THEN 1 ELSE 0 END), 0),
          lost = GREATEST(lost - (CASE WHEN v_away < v_home THEN 1 ELSE 0 END), 0),
          goals_for = GREATEST(goals_for - v_away, 0),
          goals_against = GREATEST(goals_against - v_home, 0),
          points = GREATEST(points - (CASE WHEN v_away > v_home THEN 3 WHEN v_away = v_home THEN 1 ELSE 0 END), 0),
          updated_at = now()
        WHERE season_id = v_round.season_id AND club_id = v_match.away_club_id;
      END IF;
    END IF;
  END IF;

  -- Wipe child data in FK order.
  DELETE FROM public.match_actions WHERE match_id = p_match_id;
  DELETE FROM public.match_turns WHERE match_id = p_match_id;
  DELETE FROM public.match_event_logs WHERE match_id = p_match_id;
  DELETE FROM public.match_participants WHERE match_id = p_match_id;

  -- Tables that may not exist in every environment; ignore failures.
  BEGIN DELETE FROM public.player_match_stats WHERE match_id = p_match_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.match_chat WHERE match_id = p_match_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.match_snapshots WHERE match_id = p_match_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Reset the match row to a clean scheduled state.
  UPDATE public.matches SET
    status = 'scheduled',
    scheduled_at = v_target_at,
    started_at = NULL,
    finished_at = NULL,
    home_score = 0,
    away_score = 0,
    current_phase = NULL,
    current_turn_number = 0,
    current_half = 1,
    half_started_at = NULL,
    possession_club_id = NULL,
    injury_time_turns = 0,
    injury_time_start_turn = NULL,
    engine_cache = NULL
  WHERE id = p_match_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_restart_match(UUID, TIMESTAMPTZ) TO authenticated;


-- ─── admin_set_player_energy ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_player_energy(
  p_player_id UUID,
  p_energy INT
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
  v_new INT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT energy_max INTO v_max FROM public.player_profiles WHERE id = p_player_id;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  v_new := GREATEST(0, LEAST(v_max, p_energy));

  UPDATE public.player_profiles
  SET energy_current = v_new
  WHERE id = p_player_id;

  RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_player_energy(UUID, INT) TO authenticated;


-- ─── admin_grant_store_item ─────────────────────────────────
-- Bypasses money + daily-limit checks. Replaces existing
-- trainer/physio (since both are exclusive-by-category).
-- Boots/gloves/consumables land in inventory (active on equip).
CREATE OR REPLACE FUNCTION public.admin_grant_store_item(
  p_player_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
  v_status TEXT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id INTO v_user_id FROM public.player_profiles WHERE id = p_player_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Player not found or has no auth user';
  END IF;

  SELECT * INTO v_item FROM public.store_items WHERE id = p_item_id;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Store item not found';
  END IF;

  IF v_item.category IN ('trainer', 'physio') THEN
    UPDATE public.store_purchases sp
    SET status = 'replaced'
    FROM public.store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = p_player_id
      AND sp.status IN ('active', 'cancelling')
      AND si.category = v_item.category;
    v_status := 'active';
  ELSIF v_item.category IN ('boots', 'gloves', 'consumable') THEN
    v_status := 'inventory';
  ELSE
    v_status := 'active';
  END IF;

  INSERT INTO public.store_purchases (
    user_id, player_profile_id, store_item_id, level, status, expires_at
  )
  VALUES (
    v_user_id,
    p_player_id,
    p_item_id,
    COALESCE(v_item.level, 1),
    v_status,
    CASE WHEN v_item.duration = 'monthly' THEN now() + INTERVAL '30 days' ELSE NULL END
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_name', v_item.name,
    'status', v_status
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_grant_store_item(UUID, UUID) TO authenticated;


-- ─── admin_reset_avatar ─────────────────────────────────────
-- Nulls appearance fields so the user is bounced back into the
-- avatar creator on next route check (ProtectedRoute logic).
-- p_user_id is the auth user; resets appearance for both
-- player_profiles and manager_profiles owned by that user, plus
-- the profile-pic ref.
CREATE OR REPLACE FUNCTION public.admin_reset_avatar(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.player_profiles SET appearance = NULL WHERE user_id = p_user_id;
  UPDATE public.manager_profiles SET appearance = NULL WHERE user_id = p_user_id;
  UPDATE public.profiles SET avatar_char_ref = NULL WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_avatar(UUID) TO authenticated;
