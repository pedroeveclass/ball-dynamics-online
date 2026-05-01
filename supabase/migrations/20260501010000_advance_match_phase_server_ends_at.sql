-- Compute ends_at INSIDE advance_match_phase to eliminate the drift between
-- the engine's `Date.now() + 10s` calculation and the actual INSERT time.
--
-- Symptom that motivated this: ball_holder phase rows were ending up with
-- dur_s = 6.65s, 7.78s, 8.89s instead of the intended 10s. Cause: the engine
-- computed `nextPhaseEnd = Date.now() + 10s` early in the resolution branch,
-- then performed several seconds of work (matches UPDATE, ball persistence,
-- post-goal logic, async batched RPCs) BEFORE invoking advance_match_phase.
-- By the time the INSERT executed, `created_at = NOW()` had drifted 1-3s
-- ahead of the pre-computed `ends_at`.
--
-- Fix: the RPC now ignores p_ends_at (kept only for backward-compat with the
-- existing engine signature) and derives the duration from p_next_phase:
--   - resolution: 200ms (matches the engine's RESOLUTION_KICKOFF_DELAY_MS,
--     this turn is just a kicker for the next tick, not a planning window)
--   - everything else: 10s (matches PHASE_DURATION_MS / POSITIONING_PHASE_DURATION_MS)
--
-- started_at is also derived from the same pinned NOW() so the two timestamps
-- are guaranteed coherent for the duration calculation. p_started_at is
-- ignored for the same reason.

CREATE OR REPLACE FUNCTION public.advance_match_phase(
  p_match_id UUID,
  p_next_phase TEXT,
  p_turn_number INT,
  p_possession_club_id UUID,
  p_ball_holder_participant_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_set_piece_type TEXT,
  p_ball_x NUMERIC DEFAULT NULL,
  p_ball_y NUMERIC DEFAULT NULL
)
RETURNS TABLE(inserted_id UUID, inserted_phase TEXT, inserted_turn_number INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_ends_at TIMESTAMPTZ;
BEGIN
  -- Phase duration is derived inside the RPC so created_at + duration = ends_at
  -- always holds, regardless of how long the engine took to reach this call.
  IF p_next_phase = 'resolution' THEN
    v_ends_at := v_now + INTERVAL '200 milliseconds';
  ELSE
    v_ends_at := v_now + INTERVAL '10 seconds';
  END IF;

  UPDATE matches SET current_phase = p_next_phase WHERE id = p_match_id;

  INSERT INTO match_turns (
    match_id, turn_number, phase,
    possession_club_id, ball_holder_participant_id,
    started_at, ends_at, status, set_piece_type,
    ball_x, ball_y
  ) VALUES (
    p_match_id, p_turn_number, p_next_phase,
    p_possession_club_id, p_ball_holder_participant_id,
    v_now, v_ends_at, 'active', p_set_piece_type,
    p_ball_x, p_ball_y
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, p_next_phase, p_turn_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_match_phase(UUID, TEXT, INT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC) TO service_role;
