-- ─────────────────────────────────────────────────────────────
-- admin_move_club_to_league must also fix scheduled-season state
-- ─────────────────────────────────────────────────────────────
-- Original RPC just updated clubs.league_id, leaving the next
-- scheduled season of both source and target leagues with stale
-- standings + fixtures. Now: also rebuild standings for any
-- scheduled season + drop existing league_matches so the
-- regenerate_season_fixtures action can rewrite them with the new
-- club lineup.

CREATE OR REPLACE FUNCTION public.admin_move_club_to_league(p_club_id UUID, p_target_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_league RECORD;
  v_source_league_id UUID;
  v_source_season_id UUID;
  v_target_season_id UUID;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT id, name INTO v_target_league FROM public.leagues WHERE id = p_target_league_id;
  IF v_target_league IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'league_not_found');
  END IF;

  SELECT league_id INTO v_source_league_id FROM public.clubs WHERE id = p_club_id;
  IF v_source_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'club_not_in_any_league');
  END IF;
  IF v_source_league_id = p_target_league_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_in_target');
  END IF;

  -- 1) Move club at the catalog level.
  UPDATE public.clubs SET league_id = p_target_league_id WHERE id = p_club_id;

  -- 2) For every NOT-finished season of the SOURCE league, evict the club:
  --    delete its standings row + delete all league_matches involving it.
  --    The remaining league_matches for that season are now incomplete
  --    (one club gone) — caller is expected to re-run regenerate_season_fixtures.
  FOR v_source_season_id IN
    SELECT id FROM public.league_seasons
     WHERE league_id = v_source_league_id AND status <> 'finished'
  LOOP
    DELETE FROM public.league_standings
     WHERE season_id = v_source_season_id AND club_id = p_club_id;

    DELETE FROM public.league_matches lm
      USING public.league_rounds lr
     WHERE lm.round_id = lr.id
       AND lr.season_id = v_source_season_id
       AND (lm.home_club_id = p_club_id OR lm.away_club_id = p_club_id);
  END LOOP;

  -- 3) For every NOT-finished season of the TARGET league, add the club to
  --    standings (zeros) + drop existing league_matches so the regenerate
  --    pass rebuilds the round-robin with the new club included.
  FOR v_target_season_id IN
    SELECT id FROM public.league_seasons
     WHERE league_id = p_target_league_id AND status <> 'finished'
  LOOP
    INSERT INTO public.league_standings (season_id, club_id)
    VALUES (v_target_season_id, p_club_id)
    ON CONFLICT DO NOTHING;

    -- Wipe matches so a regenerate call below produces a clean schedule.
    DELETE FROM public.league_matches lm
      USING public.league_rounds lr
     WHERE lm.round_id = lr.id
       AND lr.season_id = v_target_season_id;

    -- Also wipe any orphaned league_matches in the SOURCE season for the
    -- same scheduled-season pair (so caller regenerates source too).
  END LOOP;

  -- We also need source's matches gone (per-season, all of them) so the
  -- regenerate pass fills it back with the right club set. Already partly
  -- done in step 2 (only matches involving the moved club). Wipe the rest:
  FOR v_source_season_id IN
    SELECT id FROM public.league_seasons
     WHERE league_id = v_source_league_id AND status <> 'finished'
  LOOP
    DELETE FROM public.league_matches lm
      USING public.league_rounds lr
     WHERE lm.round_id = lr.id
       AND lr.season_id = v_source_season_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'target_league', v_target_league.name,
    'source_league_id', v_source_league_id,
    'note', 'Standings updated + scheduled-season fixtures wiped. Run regenerate_season_fixtures on both leagues.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_move_club_to_league(UUID, UUID) TO authenticated;
