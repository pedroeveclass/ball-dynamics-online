-- DEBUG ONLY: dump the ball_holder / match_actions / event_logs for match
-- e9018c1c-fe0f-4433-97b8-6e75f5effc8e turn 10 to find why the BH-lock fix
-- did not fire. Pure NOTICE output; no writes.
DO $$
DECLARE
  v_match_id UUID := 'e9018c1c-fe0f-4433-97b8-6e75f5effc8e';
  v_turn     RECORD;
  v_act      RECORD;
  v_evt      RECORD;
  v_p        RECORD;
BEGIN
  -- Turn row
  SELECT id, turn_number, phase, ball_holder_participant_id, possession_club_id,
         set_piece_type, ball_x, ball_y
    INTO v_turn
    FROM public.match_turns
   WHERE match_id = v_match_id
     AND turn_number = 10
   ORDER BY id DESC
   LIMIT 1;

  IF v_turn.id IS NULL THEN
    RAISE NOTICE '[DEBUG] No turn_number=10 found for match %', v_match_id;
    RETURN;
  END IF;

  RAISE NOTICE '[DEBUG] turn.id=% phase=% BH=% possession=% set_piece=% ball=(%, %)',
               v_turn.id, v_turn.phase, v_turn.ball_holder_participant_id,
               v_turn.possession_club_id, v_turn.set_piece_type,
               v_turn.ball_x, v_turn.ball_y;

  -- BH participant details
  IF v_turn.ball_holder_participant_id IS NOT NULL THEN
    SELECT mp.id, mp.club_id, mp.role_type, mp.connected_user_id, pp.full_name
      INTO v_p
      FROM public.match_participants mp
      LEFT JOIN public.player_profiles pp ON pp.id = mp.player_profile_id
     WHERE mp.id = v_turn.ball_holder_participant_id;
    RAISE NOTICE '[DEBUG] BH participant=% club=% role=% connected_user=% name=%',
                 v_p.id, v_p.club_id, v_p.role_type, v_p.connected_user_id, v_p.full_name;
  END IF;

  -- All match_actions for this turn
  RAISE NOTICE '[DEBUG] match_actions for turn %:', v_turn.id;
  FOR v_act IN
    SELECT id, participant_id, action_type, controlled_by_type, status,
           target_x, target_y, created_at
      FROM public.match_actions
     WHERE match_turn_id = v_turn.id
     ORDER BY created_at ASC
  LOOP
    RAISE NOTICE '[DEBUG]   id=% participant=% type=% ctrl=% status=% target=(%, %) created=%',
                 v_act.id, v_act.participant_id, v_act.action_type,
                 v_act.controlled_by_type, v_act.status,
                 v_act.target_x, v_act.target_y, v_act.created_at;
  END LOOP;

  -- Event logs for this turn
  RAISE NOTICE '[DEBUG] match_event_logs for turn % (from body "Turno 10"):', v_turn.id;
  FOR v_evt IN
    SELECT event_type, title, body, created_at
      FROM public.match_event_logs
     WHERE match_id = v_match_id
       AND (body ILIKE '%Turno 10%' OR body ILIKE '%Turno 10.%' OR created_at BETWEEN
            (SELECT created_at FROM public.match_turns WHERE match_id = v_match_id AND turn_number = 9 ORDER BY id DESC LIMIT 1)
            AND
            (SELECT created_at FROM public.match_turns WHERE match_id = v_match_id AND turn_number = 11 ORDER BY id DESC LIMIT 1))
     ORDER BY created_at ASC
     LIMIT 20
  LOOP
    RAISE NOTICE '[DEBUG]   %: % | %', v_evt.event_type, v_evt.title, LEFT(v_evt.body, 120);
  END LOOP;
END $$;
