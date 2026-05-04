-- ─────────────────────────────────────────────────────────────
-- Backfill player_match_stats.minutes_played
-- ─────────────────────────────────────────────────────────────
-- The match engine was hardcoding minutes_played=0 for every row,
-- which broke the season_fair_play HAVING clause (>= 270 min) and
-- understated minute-normalized metrics.
--
-- Heuristic (matches the engine fix): 90 if the participant played
-- the whole match, 45 if they were sent off (no per-minute red-card
-- tracking yet — substitutions don't exist in the engine).

UPDATE public.player_match_stats AS pms
SET minutes_played = CASE
  WHEN COALESCE(mp.is_sent_off, false) THEN 45
  ELSE 90
END
FROM public.match_participants AS mp
WHERE pms.participant_id = mp.id
  AND pms.minutes_played = 0;
