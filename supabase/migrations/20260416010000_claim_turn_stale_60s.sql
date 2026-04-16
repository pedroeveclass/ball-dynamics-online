-- Increase the stale-claim window on match-turn processing from 15s to 60s.
--
-- Symptom observed tonight (Criciuma match c70182db, turns 41 + 44): the match
-- flow log showed a goal banner "GOL 3-0" that never persisted to home_score
-- (stayed at 2). A second, visually similar ghost-goal event fired 3 minutes
-- later on the same match. On-field, the client briefly showed the goal
-- kickoff positioning and then reverted the state as if a GK save had happened
-- and the ball started from far back.
--
-- Root cause: `claim_match_turn_for_processing` originally treated a claim as
-- "stale" after 15s of silence on `processing_started_at`. The cron fires
-- every 1s. When a single turn-resolution run takes longer than 15s (heavy
-- bot reasoning, many participants, DB slowness), a second worker re-claims
-- the same active turn. Both run the resolution in parallel — each reads
-- `match.home_score = 2`, increments local `homeScore` to 3, emits its own
-- `event_type='goal'` row, and the last UPDATE on matches wins. The second
-- UPDATE can lose the increment (overwriting 3 with 2 if it took a different
-- branch), producing the ghost effect.
--
-- 60s is comfortably larger than the worst-case tick we've seen (~10–20s for
-- a busy resolution) but still short enough for a truly crashed engine to
-- recover within a minute.

CREATE OR REPLACE FUNCTION public.claim_match_turn_for_processing(
  p_match_id UUID,
  p_processing_token UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stale_after INTERVAL DEFAULT INTERVAL '60 seconds'
)
RETURNS SETOF public.match_turns
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.match_turns
  SET
    processing_started_at = p_now,
    processing_token = p_processing_token
  WHERE id = (
    SELECT id
    FROM public.match_turns
    WHERE match_id = p_match_id
      AND status = 'active'
      AND (
        processing_started_at IS NULL
        OR processing_started_at < (p_now - p_stale_after)
      )
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING *;
$$;
