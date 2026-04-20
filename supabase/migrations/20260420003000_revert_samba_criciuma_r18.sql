-- ═══════════════════════════════════════════════════════════
-- RECOVERY: Undo the wrongly-simulated Samba All Stars x
-- Criciuma EC match (R18, 2026-06-04). The previous reset
-- accidentally brought its scheduled_at forward; cron auto-
-- started it and it ran to completion as a bot-only sim.
--
-- Steps:
-- 1. Wipe all match state (participants/actions/turns/events)
-- 2. Reset the match row to 'scheduled' for its R18 date
-- 3. Recompute ALL standings for the season from still-
--    finished matches (zeroing first, then rebuilding)
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_match_id  UUID := '850d7dbd-6189-41a1-b1a0-cfada20083cc';
  v_round_at  TIMESTAMPTZ;
  v_season_id UUID;
  v_fm        RECORD;
BEGIN
  -- Pull the round scheduled_at + season for this match
  SELECT lr.scheduled_at, lr.season_id
    INTO v_round_at, v_season_id
    FROM public.league_matches lm
    JOIN public.league_rounds lr ON lr.id = lm.round_id
   WHERE lm.match_id = v_match_id;

  IF v_round_at IS NULL THEN
    RAISE EXCEPTION '[REVERT] No round found for match %', v_match_id;
  END IF;

  RAISE NOTICE '[REVERT] Restoring match % to % (season %)',
               v_match_id, v_round_at, v_season_id;

  -- ── Wipe state (FK-safe order) ──
  DELETE FROM public.match_actions ma
   USING public.match_turns mt
   WHERE ma.match_turn_id = mt.id
     AND mt.match_id = v_match_id;
  DELETE FROM public.match_turns       WHERE match_id = v_match_id;
  DELETE FROM public.match_event_logs  WHERE match_id = v_match_id;
  DELETE FROM public.match_participants WHERE match_id = v_match_id;

  -- ── Reset match row to scheduled for its original round date ──
  UPDATE public.matches m
     SET status                 = 'scheduled',
         home_score             = 0,
         away_score              = 0,
         current_turn_number    = 0,
         current_phase          = NULL,
         possession_club_id     = NULL,
         current_half           = 1,
         half_started_at        = NULL,
         injury_time_turns      = 0,
         injury_time_start_turn = NULL,
         started_at             = NULL,
         finished_at            = NULL,
         scheduled_at           = v_round_at,
         home_lineup_id         = NULL,
         away_lineup_id         = NULL
   WHERE id = v_match_id;

  -- ── Recompute standings from scratch for the season ──
  UPDATE public.league_standings
     SET played = 0, won = 0, drawn = 0, lost = 0,
         goals_for = 0, goals_against = 0, points = 0,
         updated_at = now()
   WHERE season_id = v_season_id;

  FOR v_fm IN
    SELECT m.home_club_id, m.away_club_id,
           COALESCE(m.home_score, 0) AS hs,
           COALESCE(m.away_score, 0) AS as_
      FROM public.matches m
      JOIN public.league_matches lm ON lm.match_id = m.id
      JOIN public.league_rounds   lr ON lr.id = lm.round_id
     WHERE lr.season_id = v_season_id
       AND m.status = 'finished'
  LOOP
    -- Home
    UPDATE public.league_standings
       SET played        = played + 1,
           won           = won   + CASE WHEN v_fm.hs > v_fm.as_ THEN 1 ELSE 0 END,
           drawn         = drawn + CASE WHEN v_fm.hs = v_fm.as_ THEN 1 ELSE 0 END,
           lost          = lost  + CASE WHEN v_fm.hs < v_fm.as_ THEN 1 ELSE 0 END,
           goals_for     = goals_for     + v_fm.hs,
           goals_against = goals_against + v_fm.as_,
           points        = points + CASE WHEN v_fm.hs > v_fm.as_ THEN 3
                                         WHEN v_fm.hs = v_fm.as_ THEN 1
                                         ELSE 0 END,
           updated_at    = now()
     WHERE season_id = v_season_id AND club_id = v_fm.home_club_id;

    -- Away
    UPDATE public.league_standings
       SET played        = played + 1,
           won           = won   + CASE WHEN v_fm.as_ > v_fm.hs THEN 1 ELSE 0 END,
           drawn         = drawn + CASE WHEN v_fm.as_ = v_fm.hs THEN 1 ELSE 0 END,
           lost          = lost  + CASE WHEN v_fm.as_ < v_fm.hs THEN 1 ELSE 0 END,
           goals_for     = goals_for     + v_fm.as_,
           goals_against = goals_against + v_fm.hs,
           points        = points + CASE WHEN v_fm.as_ > v_fm.hs THEN 3
                                         WHEN v_fm.as_ = v_fm.hs THEN 1
                                         ELSE 0 END,
           updated_at    = now()
     WHERE season_id = v_season_id AND club_id = v_fm.away_club_id;
  END LOOP;

  RAISE NOTICE '[REVERT] Match % restored to scheduled @ %, standings recomputed',
               v_match_id, v_round_at;
END $$;
