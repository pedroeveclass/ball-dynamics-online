-- Re-extract position_samples in canonical LTR coords (each player's club
-- always attacking → x=100). Mirrors x for:
--   home + 2H samples
--   away + 1H samples
-- Halftime is detected via the first 'halftime' event_log per match.

WITH halftime AS (
  SELECT match_id, MIN(created_at) AS ht_at
  FROM match_event_logs
  WHERE event_type = 'halftime'
  GROUP BY match_id
),
participants AS (
  SELECT id, match_id, club_id FROM match_participants
),
turn_samples AS (
  SELECT
    mt.match_id,
    (kv.key)::uuid AS participant_id,
    mt.turn_number,
    -- isSecondHalf: turn happened after the halftime event (or never if no halftime).
    CASE
      WHEN h.ht_at IS NOT NULL AND mt.created_at >= h.ht_at THEN true
      ELSE false
    END AS is_second_half,
    (kv.value->>'x')::numeric AS raw_x,
    (kv.value->>'y')::numeric AS raw_y
  FROM match_turns mt
  CROSS JOIN LATERAL jsonb_each(mt.resolution_script->'final_positions') AS kv
  LEFT JOIN halftime h ON h.match_id = mt.match_id
  WHERE mt.phase = 'resolution'
    AND mt.resolution_script IS NOT NULL
    AND mt.resolution_script->'final_positions' IS NOT NULL
    AND kv.value ? 'x' AND kv.value ? 'y'
),
canonicalized AS (
  SELECT
    ts.match_id,
    ts.participant_id,
    ts.turn_number,
    -- needs_mirror = (isHome == isSecondHalf) — captured via club_id check.
    CASE
      WHEN (p.club_id = m.home_club_id) = ts.is_second_half
      THEN 100 - ts.raw_x
      ELSE ts.raw_x
    END AS canon_x,
    ts.raw_y AS canon_y
  FROM turn_samples ts
  INNER JOIN participants p ON p.id = ts.participant_id AND p.match_id = ts.match_id
  INNER JOIN matches m ON m.id = ts.match_id
),
agg AS (
  SELECT
    match_id,
    participant_id,
    jsonb_agg(
      jsonb_build_object('x', canon_x, 'y', canon_y)
      ORDER BY turn_number
    ) AS samples
  FROM canonicalized
  GROUP BY match_id, participant_id
)
UPDATE player_match_stats pms
SET position_samples = agg.samples
FROM agg
WHERE pms.match_id = agg.match_id
  AND pms.participant_id = agg.participant_id;
