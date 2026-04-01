-- ═══════════════════════════════════════════════════════════
-- Bankruptcy & Club Reset System
-- Trigger: balance < -1,000,000 for 7+ consecutive days
-- Result: manager fired, facilities reset, players released
-- ═══════════════════════════════════════════════════════════

-- Add debt tracking to club_finances
ALTER TABLE club_finances ADD COLUMN IF NOT EXISTS debt_warning_since TIMESTAMPTZ;

-- Function to check and process bankruptcies (called by daily cron)
CREATE OR REPLACE FUNCTION check_bankruptcies()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_count INTEGER := 0;
  v_default_balance INTEGER := 200000;
  v_debt_threshold INTEGER := -1000000;
BEGIN
  -- Step 1: Mark clubs that just crossed the debt threshold
  UPDATE club_finances
  SET debt_warning_since = now()
  WHERE balance < v_debt_threshold AND debt_warning_since IS NULL;

  -- Step 2: Clear warning for clubs that recovered
  UPDATE club_finances
  SET debt_warning_since = NULL
  WHERE balance >= v_debt_threshold AND debt_warning_since IS NOT NULL;

  -- Step 3: Process clubs in debt for 7+ days
  FOR v_club IN
    SELECT cf.club_id, c.manager_profile_id, c.name
    FROM club_finances cf
    JOIN clubs c ON c.id = cf.club_id
    WHERE cf.debt_warning_since IS NOT NULL
      AND cf.debt_warning_since < now() - INTERVAL '7 days'
      AND c.manager_profile_id IS NOT NULL
  LOOP
    -- Release all players (set club_id = NULL, terminate contracts)
    UPDATE contracts SET status = 'terminated', terminated_at = now(), termination_type = 'bankruptcy'
    WHERE club_id = v_club.club_id::TEXT AND status = 'active';

    UPDATE player_profiles SET club_id = NULL, weekly_salary = 0
    WHERE club_id = v_club.club_id::TEXT;

    -- Reset facilities to level 1
    UPDATE club_facilities SET level = 1, upgraded_at = NULL
    WHERE club_id = v_club.club_id;

    -- Reset finances
    UPDATE club_finances SET
      balance = v_default_balance,
      weekly_wage_bill = 0,
      projected_income = 0,
      projected_expense = 0,
      debt_warning_since = NULL
    WHERE club_id = v_club.club_id;

    -- Reset coach training (if table exists)
    DELETE FROM coach_training WHERE club_id = v_club.club_id;

    -- Fire the manager (unlink from club)
    UPDATE clubs SET manager_profile_id = NULL WHERE id = v_club.club_id;

    -- Clear lineup
    DELETE FROM lineup_slots WHERE lineup_id IN (
      SELECT id FROM lineups WHERE club_id = v_club.club_id
    );
    DELETE FROM lineups WHERE club_id = v_club.club_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Function to get bankruptcy warning status for a club
CREATE OR REPLACE FUNCTION get_bankruptcy_status(p_club_id UUID)
RETURNS TABLE(
  is_in_debt BOOLEAN,
  balance NUMERIC,
  debt_since TIMESTAMPTZ,
  days_remaining INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    cf.balance < -1000000 AS is_in_debt,
    cf.balance,
    cf.debt_warning_since AS debt_since,
    CASE
      WHEN cf.debt_warning_since IS NOT NULL
      THEN GREATEST(0, 7 - EXTRACT(DAY FROM now() - cf.debt_warning_since)::INTEGER)
      ELSE NULL
    END AS days_remaining
  FROM club_finances cf
  WHERE cf.club_id = p_club_id;
$$;
