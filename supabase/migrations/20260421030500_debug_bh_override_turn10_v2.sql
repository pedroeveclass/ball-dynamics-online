-- DEBUG v2: filter events strictly by payload->>'turn_number' for turn 10
DO $$
DECLARE
  v_match_id UUID := 'e9018c1c-fe0f-4433-97b8-6e75f5effc8e';
  v_t        RECORD;
  v_evt      RECORD;
BEGIN
  -- All relevant turns (9, 10, 11) to see the flow
  RAISE NOTICE '[DEBUG] Turns 9-11 for match %:', v_match_id;
  FOR v_t IN
    SELECT id, turn_number, phase, ball_holder_participant_id, set_piece_type, ball_x, ball_y, created_at
      FROM public.match_turns
     WHERE match_id = v_match_id AND turn_number BETWEEN 9 AND 11
     ORDER BY turn_number, id
  LOOP
    RAISE NOTICE '[DEBUG] turn %: id=% phase=% BH=% set_piece=% ball=(%, %) created=%',
                 v_t.turn_number, v_t.id, v_t.phase, v_t.ball_holder_participant_id,
                 v_t.set_piece_type, v_t.ball_x, v_t.ball_y, v_t.created_at;
  END LOOP;

  RAISE NOTICE '[DEBUG] Events for turn_number=10 (filtered by payload):';
  FOR v_evt IN
    SELECT event_type, title, body, payload, created_at
      FROM public.match_event_logs
     WHERE match_id = v_match_id
       AND (payload->>'turn_number')::int = 10
     ORDER BY created_at ASC
  LOOP
    RAISE NOTICE '[DEBUG]   %: % | payload.ball_holder=% action_type=%',
                 v_evt.event_type, v_evt.title,
                 v_evt.payload->>'ball_holder_participant_id',
                 v_evt.payload->>'action_type';
  END LOOP;

  RAISE NOTICE '[DEBUG] Events for turn_number=9 (previous turn):';
  FOR v_evt IN
    SELECT event_type, title, payload, created_at
      FROM public.match_event_logs
     WHERE match_id = v_match_id
       AND (payload->>'turn_number')::int = 9
     ORDER BY created_at ASC
  LOOP
    RAISE NOTICE '[DEBUG]   %: % | payload.action_type=% bh=%',
                 v_evt.event_type, v_evt.title,
                 v_evt.payload->>'action_type',
                 v_evt.payload->>'ball_holder_participant_id';
  END LOOP;
END $$;
