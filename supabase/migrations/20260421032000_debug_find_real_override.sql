-- Scan ALL turns of match e9018c1c looking for the real BH-override bug pattern:
-- turn N had bot ball-action on BH AND emitted bh_dribble (not bh_pass/bh_shot)
DO $$
DECLARE
  v_match_id UUID := 'e9018c1c-fe0f-4433-97b8-6e75f5effc8e';
  v_turn_num INT;
  v_bh_id    UUID;
  v_phase_ids UUID[];
  v_bot_ball_count INT;
  v_human_move_count INT;
  v_emitted_dribble BOOL;
  v_emitted_pass_shot BOOL;
BEGIN
  FOR v_turn_num IN
    SELECT DISTINCT turn_number FROM public.match_turns WHERE match_id = v_match_id ORDER BY 1
  LOOP
    -- Get BH of this turn (from any phase row — should be consistent)
    SELECT ball_holder_participant_id INTO v_bh_id
      FROM public.match_turns
     WHERE match_id = v_match_id AND turn_number = v_turn_num
     LIMIT 1;

    IF v_bh_id IS NULL THEN CONTINUE; END IF;

    -- All phase ids for this turn
    SELECT array_agg(id) INTO v_phase_ids
      FROM public.match_turns
     WHERE match_id = v_match_id AND turn_number = v_turn_num;

    -- Count bot ball-actions for the BH across all phases
    SELECT count(*) INTO v_bot_ball_count
      FROM public.match_actions
     WHERE match_turn_id = ANY(v_phase_ids)
       AND participant_id = v_bh_id
       AND controlled_by_type = 'bot'
       AND action_type IN ('pass_low','pass_high','pass_launch','shoot_controlled','shoot_power','header_pass','header_shoot','cross');

    -- Count human move-like actions for the BH
    SELECT count(*) INTO v_human_move_count
      FROM public.match_actions
     WHERE match_turn_id = ANY(v_phase_ids)
       AND participant_id = v_bh_id
       AND controlled_by_type IN ('player','manager')
       AND action_type IN ('move','receive','block');

    -- What event type ended up emitted for this BH?
    v_emitted_dribble := EXISTS (
      SELECT 1 FROM public.match_event_logs
       WHERE match_id = v_match_id
         AND event_type = 'bh_dribble'
         AND (payload->>'turn_number')::int = v_turn_num
    );
    v_emitted_pass_shot := EXISTS (
      SELECT 1 FROM public.match_event_logs
       WHERE match_id = v_match_id
         AND event_type IN ('bh_pass','bh_shot')
         AND (payload->>'turn_number')::int = v_turn_num
    );

    -- Only output turns that have something interesting
    IF v_bot_ball_count > 0 OR (v_human_move_count > 0 AND v_emitted_dribble) THEN
      RAISE NOTICE '[SCAN] turn=% BH=% botBallActions=% humanMoves=% emittedDribble=% emittedPassOrShot=%',
                   v_turn_num, v_bh_id, v_bot_ball_count, v_human_move_count,
                   v_emitted_dribble, v_emitted_pass_shot;
    END IF;
  END LOOP;
END $$;
