-- Per-player age bump (+1 year + decay if applicable). The existing
-- `advance_all_player_ages` is bulk-by-season; this is the granular
-- admin tool for testing aging effects on a single player without
-- waiting for a season to end.

CREATE OR REPLACE FUNCTION public.admin_age_player_one_year(p_player_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player RECORD;
  v_decay_result JSONB;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT id, full_name, age, retirement_status
    INTO v_player
    FROM public.player_profiles
   WHERE id = p_player_profile_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
  END IF;
  IF v_player.retirement_status = 'retired' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_retired');
  END IF;

  UPDATE public.player_profiles
     SET age = age + 1, updated_at = NOW()
   WHERE id = p_player_profile_id;

  -- Decay only fires for age >= 33 (function returns applied=false otherwise).
  v_decay_result := public.apply_aging_decay(p_player_profile_id);

  RETURN jsonb_build_object(
    'ok', true,
    'player', v_player.full_name,
    'old_age', v_player.age,
    'new_age', v_player.age + 1,
    'decay_applied', COALESCE((v_decay_result->>'applied')::BOOLEAN, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_age_player_one_year(UUID) TO authenticated;
