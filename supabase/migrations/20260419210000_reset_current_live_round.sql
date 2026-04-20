-- ═══════════════════════════════════════════════════════════
-- ONE-OFF: Cancel + re-kickoff the CURRENT Criciúma match so
-- it picks up the up-to-date active lineup.
--
-- Context: Round started with a stale lineup snapshot for
-- Criciúma despite the refresh logic in match-engine-lab.
-- Wipes in-flight state for that ONE match, returns it to
-- 'scheduled' with scheduled_at=now(), and refreshes its
-- home/away_lineup_id from `lineups WHERE is_active=true`.
-- The 1-minute cron then auto-starts it.
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_match_id   UUID;
  v_home_club  UUID;
  v_away_club  UUID;
  v_home_name  TEXT;
  v_away_name  TEXT;
BEGIN
  -- ── 1. Locate the most-recent non-finished match involving Criciúma ──
  SELECT m.id, m.home_club_id, m.away_club_id, ch.name, ca.name
    INTO v_match_id, v_home_club, v_away_club, v_home_name, v_away_name
    FROM public.matches m
    JOIN public.clubs ch ON ch.id = m.home_club_id
    JOIN public.clubs ca ON ca.id = m.away_club_id
   WHERE m.status IN ('live', 'scheduled')
     AND (ch.name ILIKE '%crici%' OR ca.name ILIKE '%crici%')
   ORDER BY COALESCE(m.started_at, m.scheduled_at) DESC
   LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION '[RESET-CRI] No live/scheduled Criciúma match found';
  END IF;

  RAISE NOTICE '[RESET-CRI] Target match % — % x %',
               v_match_id, v_home_name, v_away_name;

  -- ── 2. Wipe in-flight match state (FK-safe order) ──
  DELETE FROM public.match_actions ma
   USING public.match_turns mt
   WHERE ma.match_turn_id = mt.id
     AND mt.match_id = v_match_id;

  DELETE FROM public.match_turns       WHERE match_id = v_match_id;
  DELETE FROM public.match_event_logs  WHERE match_id = v_match_id;
  DELETE FROM public.match_participants WHERE match_id = v_match_id;

  -- ── 3. Reset match → scheduled, scores=0, lineups refreshed, due now ──
  -- NOTE: current_half, injury_time_turns have NOT NULL constraints — reset
  -- to 1 / 0 (engine overwrites both at kickoff anyway).
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
   WHERE id = v_match_id;

  RAISE NOTICE '[RESET-CRI] Match % reset — cron will kickoff within ~60s', v_match_id;
END $$;
