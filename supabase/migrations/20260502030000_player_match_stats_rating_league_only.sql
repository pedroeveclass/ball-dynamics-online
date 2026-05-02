-- Phase 1 prerequisites for the public-player Sofascore-style stats page:
--   1. Add `rating` column (numeric 4.0–10.0) to player_match_stats.
--   2. Drop friendly-team-vs-team rows; only league matches keep stats now.
--
-- The engine will compute rating at final_whistle (see persistMatchPlayerStats)
-- and stop persisting for non-league matches.

ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS rating numeric(3,1),
  ADD COLUMN IF NOT EXISTS position_samples jsonb;
-- position_samples: jsonb array of {x: number, y: number} sampled at each
-- resolution turn end. Used to render a per-match heatmap and aggregated
-- season heatmap on the public player profile.

-- Remove rows tied to a match_challenge that has no league_match counterpart.
DELETE FROM player_match_stats
WHERE match_id IN (
  SELECT mc.match_id
  FROM match_challenges mc
  WHERE mc.match_id IS NOT NULL
    AND mc.match_id NOT IN (
      SELECT lm.match_id FROM league_matches lm WHERE lm.match_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_pms_rating ON player_match_stats (rating)
  WHERE rating IS NOT NULL;

-- Backfill ratings for already-persisted league matches. Mirrors the formula
-- used by the engine in persistMatchPlayerStats.
UPDATE player_match_stats SET rating = LEAST(10.0, GREATEST(4.0,
    6.0
  + COALESCE(goals, 0) * 1.0
  + COALESCE(assists, 0) * 0.5
  + CASE WHEN COALESCE(passes_attempted, 0) >= 5
         THEN ((COALESCE(passes_completed, 0)::numeric / passes_attempted) - 0.7) * 1.5
         ELSE 0 END
  + COALESCE(tackles, 0) * 0.15
  + COALESCE(interceptions, 0) * 0.15
  + COALESCE(gk_saves, 0) * 0.2
  + CASE WHEN COALESCE(clean_sheet, false)
            AND (UPPER(COALESCE(position, '')) = 'GK'
              OR UPPER(COALESCE(position, '')) LIKE '%Z%'
              OR UPPER(COALESCE(position, '')) LIKE 'LD%'
              OR UPPER(COALESCE(position, '')) LIKE 'LE%')
         THEN 0.5 ELSE 0 END
  - COALESCE(fouls_committed, 0) * 0.1
  - COALESCE(yellow_cards, 0) * 0.3
  - COALESCE(red_cards, 0) * 1.5
  - CASE WHEN UPPER(COALESCE(position, '')) = 'GK'
         THEN COALESCE(goals_conceded, 0) * 0.3 ELSE 0 END
))::numeric(3,1)
WHERE rating IS NULL;

-- Backfill position_samples from match_turns.resolution_script.final_positions.
-- Aggregates one (x, y) sample per resolution turn for each participant.
WITH samples AS (
  SELECT
    mt.match_id,
    (kv.key)::uuid AS participant_id,
    jsonb_agg(
      jsonb_build_object(
        'x', (kv.value->>'x')::numeric,
        'y', (kv.value->>'y')::numeric
      )
      ORDER BY mt.turn_number
    ) FILTER (WHERE kv.value ? 'x' AND kv.value ? 'y') AS samples
  FROM match_turns mt
  CROSS JOIN LATERAL jsonb_each(mt.resolution_script->'final_positions') AS kv
  WHERE mt.phase = 'resolution'
    AND mt.resolution_script IS NOT NULL
    AND mt.resolution_script->'final_positions' IS NOT NULL
  GROUP BY mt.match_id, kv.key
)
UPDATE player_match_stats pms
SET position_samples = samples.samples
FROM samples
WHERE pms.match_id = samples.match_id
  AND pms.participant_id = samples.participant_id
  AND (pms.position_samples IS NULL OR jsonb_array_length(pms.position_samples) = 0);
