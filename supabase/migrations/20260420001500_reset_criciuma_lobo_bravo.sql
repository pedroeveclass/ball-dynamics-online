-- ═══════════════════════════════════════════════════════════
-- ONE-OFF FIX: Restore the Samba x Criciúma match we mistakenly
-- reset earlier (it's a future R18 match), and list/dump all
-- LIVE matches so we can identify the actual Criciúma opponent
-- if name-based matching misses.
-- ═══════════════════════════════════════════════════════════

-- ── Part 1: Fix the Samba match (separate statement so it commits
--    independently of anything below) ──
UPDATE public.matches m
   SET scheduled_at = lr.scheduled_at
  FROM public.league_matches lm
  JOIN public.league_rounds  lr ON lr.id = lm.round_id
 WHERE lm.match_id = m.id
   AND m.id = '850d7dbd-6189-41a1-b1a0-cfada20083cc'
   AND m.status = 'scheduled';

-- ── Part 2: Reset the live Criciúma match (broader name match) ──
DO $$
DECLARE
  v_live_match_id UUID;
  v_home_name     TEXT;
  v_away_name     TEXT;
  v_rec           RECORD;
BEGIN
  -- Dump every live match for log visibility
  RAISE NOTICE '[DEBUG] Live matches right now:';
  FOR v_rec IN
    SELECT m.id, ch.name AS home, ca.name AS away
      FROM public.matches m
      JOIN public.clubs ch ON ch.id = m.home_club_id
      JOIN public.clubs ca ON ca.id = m.away_club_id
     WHERE m.status = 'live'
  LOOP
    RAISE NOTICE '[DEBUG]   % — % x %', v_rec.id, v_rec.home, v_rec.away;
  END LOOP;

  -- Match ANY live game that has Criciúma on one side
  SELECT m.id, ch.name, ca.name
    INTO v_live_match_id, v_home_name, v_away_name
    FROM public.matches m
    JOIN public.clubs ch ON ch.id = m.home_club_id
    JOIN public.clubs ca ON ca.id = m.away_club_id
   WHERE m.status = 'live'
     AND (ch.name ILIKE '%crici%' OR ca.name ILIKE '%crici%')
   ORDER BY m.started_at DESC
   LIMIT 1;

  IF v_live_match_id IS NULL THEN
    RAISE NOTICE '[RESET-CRI-LIVE] No live Criciúma match found — skipping reset';
    RETURN;
  END IF;

  RAISE NOTICE '[RESET-CRI-LIVE] Target match % — % x %',
               v_live_match_id, v_home_name, v_away_name;

  -- Wipe state (FK-safe order)
  DELETE FROM public.match_actions ma
   USING public.match_turns mt
   WHERE ma.match_turn_id = mt.id
     AND mt.match_id = v_live_match_id;
  DELETE FROM public.match_turns       WHERE match_id = v_live_match_id;
  DELETE FROM public.match_event_logs  WHERE match_id = v_live_match_id;
  DELETE FROM public.match_participants WHERE match_id = v_live_match_id;

  UPDATE public.matches m
     SET status                 = 'scheduled',
         home_score             = 0,
         away_score             = 0,
         current_turn_number    = 0,
         current_phase          = NULL,
         possession_club_id     = NULL,
         current_half           = 1,
         half_started_at        = NULL,
         injury_time_turns      = 0,
         injury_time_start_turn = NULL,
         started_at             = NULL,
         finished_at            = NULL,
         scheduled_at           = now(),
         home_lineup_id = (
           SELECT id FROM public.lineups
            WHERE club_id = m.home_club_id AND is_active = true LIMIT 1
         ),
         away_lineup_id = (
           SELECT id FROM public.lineups
            WHERE club_id = m.away_club_id AND is_active = true LIMIT 1
         )
   WHERE id = v_live_match_id;

  RAISE NOTICE '[RESET-CRI-LIVE] Match % reset — cron will kickoff within ~60s', v_live_match_id;
END $$;
