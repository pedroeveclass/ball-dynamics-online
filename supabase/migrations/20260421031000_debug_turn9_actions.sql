-- DEBUG: dump ALL match_actions (any status) for match e9018c1c-fe0f-4433-97b8-6e75f5effc8e turn 9
-- across ALL phase rows (ball_holder, positioning_defense, attacking_support, resolution).
DO $$
DECLARE
  v_match_id UUID := 'e9018c1c-fe0f-4433-97b8-6e75f5effc8e';
  v_turn_ids UUID[];
  v_act      RECORD;
BEGIN
  SELECT array_agg(id) INTO v_turn_ids
    FROM public.match_turns
   WHERE match_id = v_match_id AND turn_number = 9;

  RAISE NOTICE '[DEBUG] Turn 9 phase ids: %', v_turn_ids;

  RAISE NOTICE '[DEBUG] ALL match_actions for turn 9 (any status):';
  FOR v_act IN
    SELECT ma.id, mt.phase, ma.participant_id, ma.action_type,
           ma.controlled_by_type, ma.status, ma.target_x, ma.target_y, ma.created_at
      FROM public.match_actions ma
      JOIN public.match_turns mt ON mt.id = ma.match_turn_id
     WHERE ma.match_turn_id = ANY(v_turn_ids)
     ORDER BY mt.phase, ma.created_at
  LOOP
    RAISE NOTICE '[DEBUG]   phase=% id=% participant=% type=% ctrl=% status=% target=(%, %)',
                 v_act.phase, v_act.id, v_act.participant_id, v_act.action_type,
                 v_act.controlled_by_type, v_act.status, v_act.target_x, v_act.target_y;
  END LOOP;

  RAISE NOTICE '[DEBUG] Count by status:';
  FOR v_act IN
    SELECT status, count(*) AS n
      FROM public.match_actions
     WHERE match_turn_id = ANY(v_turn_ids)
     GROUP BY status
  LOOP
    RAISE NOTICE '[DEBUG]   %=%', v_act.status, v_act.n;
  END LOOP;
END $$;
