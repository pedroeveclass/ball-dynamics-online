-- ─────────────────────────────────────────────────────────────
-- Refine player_match_stats.minutes_played for sent-off players
-- ─────────────────────────────────────────────────────────────
-- Previous backfill (20260504000100) used a flat 45 for any sent-off
-- participant. Now interpolate the actual game minute using
-- match_event_logs timestamps:
--   • half-1 start  = first event row created_at for the match
--   • halftime      = halftime event row created_at
--   • final whistle = final_whistle event row created_at
-- Linear interpolation gives the half-aware game minute (1..90).

WITH red_card_minutes AS (
  SELECT
    rc.payload->>'player_participant_id' AS participant_id,
    -- linear interpolation per half
    CASE
      WHEN rc.created_at <= COALESCE(ht.created_at, rc.created_at)
        THEN GREATEST(1, LEAST(45, ROUND(
          EXTRACT(EPOCH FROM (rc.created_at - first_ev.created_at))
          / GREATEST(1, EXTRACT(EPOCH FROM (ht.created_at - first_ev.created_at)))
          * 45.0
        )::int))
      ELSE GREATEST(46, LEAST(90, 45 + ROUND(
        EXTRACT(EPOCH FROM (rc.created_at - ht.created_at))
        / GREATEST(1, EXTRACT(EPOCH FROM (fw.created_at - ht.created_at)))
        * 45.0
      )::int))
    END AS game_minute
  FROM public.match_event_logs rc
  JOIN LATERAL (
    SELECT created_at FROM public.match_event_logs
    WHERE match_id = rc.match_id ORDER BY created_at ASC LIMIT 1
  ) first_ev ON TRUE
  LEFT JOIN public.match_event_logs ht
    ON ht.match_id = rc.match_id AND ht.event_type = 'halftime'
  LEFT JOIN public.match_event_logs fw
    ON fw.match_id = rc.match_id AND fw.event_type = 'final_whistle'
  WHERE rc.event_type = 'red_card'
    AND rc.payload->>'player_participant_id' IS NOT NULL
)
UPDATE public.player_match_stats AS pms
SET minutes_played = rcm.game_minute
FROM red_card_minutes rcm
WHERE pms.participant_id::text = rcm.participant_id
  AND pms.minutes_played IN (45, 90); -- only touch the binary-heuristic rows
