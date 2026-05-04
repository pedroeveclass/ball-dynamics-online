-- 2026-05-03: open_play (Movimentação Geral) is 12s instead of the default 10s.
-- The previous RPC hardcoded `10 seconds` for any non-resolution phase, which
-- ignored the longer 12s window the engine sets for the merged
-- attacking_support + defending_response phase.
CREATE OR REPLACE FUNCTION public.advance_match_phase(
  p_match_id uuid,
  p_next_phase text,
  p_turn_number integer,
  p_possession_club_id uuid,
  p_ball_holder_participant_id uuid,
  p_started_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_set_piece_type text,
  p_ball_x numeric DEFAULT NULL::numeric,
  p_ball_y numeric DEFAULT NULL::numeric
)
RETURNS TABLE(inserted_id uuid, inserted_phase text, inserted_turn_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_ends_at TIMESTAMPTZ;
BEGIN
  -- Phase duration is derived inside the RPC so created_at + duration = ends_at
  -- always holds, regardless of how long the engine took to reach this call.
  IF p_next_phase = 'resolution' THEN
    v_ends_at := v_now + INTERVAL '200 milliseconds';
  ELSIF p_next_phase = 'open_play' THEN
    v_ends_at := v_now + INTERVAL '12 seconds';
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
$function$;
