-- ═══════════════════════════════════════════════════════════
-- Just Cause Dismissal
-- Players inactive 30+ days can be fired without penalty
-- Bots can always be fired without penalty
-- ═══════════════════════════════════════════════════════════

-- Add last_match_at tracking to player_profiles
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS last_match_at TIMESTAMPTZ;

-- Function to update last_match_at when a player participates in a match
-- (Should be called at match end for all participants)
CREATE OR REPLACE FUNCTION update_player_last_match(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE player_profiles pp
  SET last_match_at = now()
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.player_profile_id = pp.id
    AND mp.role_type = 'player';
END;
$$;

-- Function to check if a player can be fired for just cause
CREATE OR REPLACE FUNCTION can_fire_just_cause(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    -- Bots always qualify
    (pp.user_id IS NULL)
    OR
    -- Human players inactive 30+ days
    (pp.last_match_at IS NULL AND pp.created_at < now() - INTERVAL '30 days')
    OR
    (pp.last_match_at IS NOT NULL AND pp.last_match_at < now() - INTERVAL '30 days')
  FROM player_profiles pp
  WHERE pp.id = p_player_id;
$$;

-- RPC to fire a player with just cause (no penalty)
CREATE OR REPLACE FUNCTION fire_player_just_cause(p_player_id UUID, p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_can_fire BOOLEAN;
BEGIN
  SELECT can_fire_just_cause(p_player_id) INTO v_can_fire;
  IF NOT v_can_fire THEN
    RAISE EXCEPTION 'Player does not qualify for just cause dismissal';
  END IF;

  -- Terminate contract without fine
  UPDATE contracts
  SET status = 'terminated', terminated_at = now(), termination_type = 'just_cause'
  WHERE player_profile_id = p_player_id AND club_id = p_club_id::TEXT AND status = 'active';

  -- Remove from club
  UPDATE player_profiles SET club_id = NULL, weekly_salary = 0 WHERE id = p_player_id;

  -- Remove from lineups
  DELETE FROM lineup_slots WHERE player_profile_id = p_player_id
    AND lineup_id IN (SELECT id FROM lineups WHERE club_id = p_club_id);

  -- Recalculate wage bill
  UPDATE club_finances SET weekly_wage_bill = (
    SELECT COALESCE(SUM(pp.weekly_salary), 0) FROM player_profiles pp WHERE pp.club_id = p_club_id::TEXT
  ) WHERE club_id = p_club_id;

  RETURN TRUE;
END;
$$;
