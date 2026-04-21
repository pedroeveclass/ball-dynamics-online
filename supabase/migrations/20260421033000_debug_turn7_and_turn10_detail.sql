DO $$
DECLARE
  v_match_id UUID := 'e9018c1c-fe0f-4433-97b8-6e75f5effc8e';
  v_turn INT;
  v_ids UUID[];
  v_act RECORD;
  v_evt RECORD;
BEGIN
  FOREACH v_turn IN ARRAY ARRAY[7, 10, 11] LOOP
    RAISE NOTICE '══════════════════ TURN % ══════════════════', v_turn;
    SELECT array_agg(id) INTO v_ids
      FROM public.match_turns
     WHERE match_id = v_match_id AND turn_number = v_turn;

    RAISE NOTICE '[T%] Actions on BH (any status):', v_turn;
    FOR v_act IN
      SELECT mt.phase, ma.action_type, ma.controlled_by_type, ma.status, ma.created_at
        FROM public.match_actions ma
        JOIN public.match_turns mt ON mt.id = ma.match_turn_id
       WHERE ma.match_turn_id = ANY(v_ids)
         AND ma.participant_id = (
           SELECT ball_holder_participant_id FROM public.match_turns
            WHERE match_id = v_match_id AND turn_number = v_turn LIMIT 1
         )
       ORDER BY ma.created_at
    LOOP
      RAISE NOTICE '[T%]   phase=% type=% ctrl=% status=% created=%',
                   v_turn, v_act.phase, v_act.action_type, v_act.controlled_by_type,
                   v_act.status, v_act.created_at;
    END LOOP;

    RAISE NOTICE '[T%] Events for turn:', v_turn;
    FOR v_evt IN
      SELECT event_type, title, payload->>'action_type' AS a_type, created_at
        FROM public.match_event_logs
       WHERE match_id = v_match_id
         AND (payload->>'turn_number')::int = v_turn
       ORDER BY created_at
    LOOP
      RAISE NOTICE '[T%]   % [%]: %', v_turn, v_evt.event_type, v_evt.a_type, v_evt.title;
    END LOOP;
  END LOOP;
END $$;
