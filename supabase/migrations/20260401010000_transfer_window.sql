-- ═══════════════════════════════════════════════════════════
-- Transfer Window System
-- Window: Day 01-05 of each month
-- Transfers outside window are "pending" until next window opens
-- ═══════════════════════════════════════════════════════════

-- Transfer requests table
CREATE TABLE IF NOT EXISTS player_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES player_profiles(id),
  from_club_id UUID REFERENCES clubs(id),
  to_club_id UUID NOT NULL REFERENCES clubs(id),
  transfer_fee INTEGER NOT NULL DEFAULT 0,
  weekly_salary INTEGER NOT NULL DEFAULT 0,
  release_clause INTEGER NOT NULL DEFAULT 0,
  contract_months INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  window_month TEXT, -- e.g. '2026-04' — which window will process this
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_player_transfers_status ON player_transfers(status);
CREATE INDEX idx_player_transfers_player ON player_transfers(player_profile_id);
CREATE INDEX idx_player_transfers_window ON player_transfers(window_month, status);

-- RLS: managers can see their club's transfers, players can see their own
ALTER TABLE player_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers see own club transfers" ON player_transfers
  FOR SELECT USING (
    from_club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
    OR to_club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
    OR player_profile_id IN (SELECT id FROM player_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Managers can insert transfers for their club" ON player_transfers
  FOR INSERT WITH CHECK (
    to_club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
  );

CREATE POLICY "Involved parties can update transfers" ON player_transfers
  FOR UPDATE USING (
    from_club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
    OR to_club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
    OR player_profile_id IN (SELECT id FROM player_profiles WHERE user_id = auth.uid())
  );

-- Function to check if transfer window is currently open
CREATE OR REPLACE FUNCTION is_transfer_window_open()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXTRACT(DAY FROM now()) BETWEEN 1 AND 5;
$$;

-- Function to get next window month for pending transfers
CREATE OR REPLACE FUNCTION get_next_window_month()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(DAY FROM now()) <= 5 THEN to_char(now(), 'YYYY-MM')
    ELSE to_char(now() + INTERVAL '1 month', 'YYYY-MM')
  END;
$$;

-- RPC to request a transfer
CREATE OR REPLACE FUNCTION request_transfer(
  p_player_id UUID,
  p_from_club_id UUID,
  p_to_club_id UUID,
  p_transfer_fee INTEGER,
  p_weekly_salary INTEGER,
  p_release_clause INTEGER,
  p_contract_months INTEGER DEFAULT 6
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_window_open BOOLEAN;
  v_window_month TEXT;
  v_existing_pending UUID;
BEGIN
  -- Check if player already has a pending transfer
  SELECT id INTO v_existing_pending
  FROM player_transfers
  WHERE player_profile_id = p_player_id AND status = 'pending'
  LIMIT 1;

  IF v_existing_pending IS NOT NULL THEN
    RAISE EXCEPTION 'Player already has a pending transfer';
  END IF;

  v_window_open := is_transfer_window_open();

  IF v_window_open THEN
    v_window_month := to_char(now(), 'YYYY-MM');
  ELSE
    v_window_month := to_char(now() + INTERVAL '1 month', 'YYYY-MM');
  END IF;

  INSERT INTO player_transfers (
    player_profile_id, from_club_id, to_club_id,
    transfer_fee, weekly_salary, release_clause, contract_months,
    status, window_month
  ) VALUES (
    p_player_id, p_from_club_id, p_to_club_id,
    p_transfer_fee, p_weekly_salary, p_release_clause, p_contract_months,
    CASE WHEN v_window_open THEN 'pending' ELSE 'pending' END,
    v_window_month
  ) RETURNING id INTO v_id;

  -- If window is open, process immediately
  IF v_window_open THEN
    PERFORM process_single_transfer(v_id);
  END IF;

  RETURN v_id;
END;
$$;

-- RPC to process a single transfer (called during window or immediately)
CREATE OR REPLACE FUNCTION process_single_transfer(p_transfer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_buyer_balance NUMERIC;
  v_old_contract_id UUID;
BEGIN
  SELECT * INTO v_transfer FROM player_transfers WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Check buyer has funds
  SELECT balance INTO v_buyer_balance FROM club_finances WHERE club_id = v_transfer.to_club_id;
  IF v_buyer_balance IS NULL OR v_buyer_balance < v_transfer.transfer_fee THEN
    UPDATE player_transfers SET status = 'failed', cancel_reason = 'Saldo insuficiente', cancelled_at = now() WHERE id = p_transfer_id;
    RETURN FALSE;
  END IF;

  -- Deduct transfer fee from buyer
  IF v_transfer.transfer_fee > 0 THEN
    UPDATE club_finances SET balance = balance - v_transfer.transfer_fee WHERE club_id = v_transfer.to_club_id;
    -- Credit seller (if from_club exists)
    IF v_transfer.from_club_id IS NOT NULL THEN
      UPDATE club_finances SET balance = balance + v_transfer.transfer_fee WHERE club_id = v_transfer.from_club_id;
    END IF;
  END IF;

  -- Terminate old contract
  SELECT id INTO v_old_contract_id FROM contracts
  WHERE player_profile_id = v_transfer.player_profile_id AND status = 'active'
  LIMIT 1;

  IF v_old_contract_id IS NOT NULL THEN
    UPDATE contracts SET status = 'terminated', terminated_at = now(), termination_type = 'transfer' WHERE id = v_old_contract_id;
  END IF;

  -- Create new contract
  INSERT INTO contracts (player_profile_id, club_id, weekly_salary, release_clause, start_date, end_date, status)
  VALUES (
    v_transfer.player_profile_id,
    v_transfer.to_club_id::TEXT,
    v_transfer.weekly_salary,
    v_transfer.release_clause,
    CURRENT_DATE,
    CURRENT_DATE + (v_transfer.contract_months * 30),
    'active'
  );

  -- Update player profile
  UPDATE player_profiles SET club_id = v_transfer.to_club_id::TEXT, weekly_salary = v_transfer.weekly_salary WHERE id = v_transfer.player_profile_id;

  -- Recalculate wage bills
  IF v_transfer.from_club_id IS NOT NULL THEN
    UPDATE club_finances SET weekly_wage_bill = (
      SELECT COALESCE(SUM(pp.weekly_salary), 0) FROM player_profiles pp WHERE pp.club_id = v_transfer.from_club_id::TEXT
    ) WHERE club_id = v_transfer.from_club_id;
  END IF;
  UPDATE club_finances SET weekly_wage_bill = (
    SELECT COALESCE(SUM(pp.weekly_salary), 0) FROM player_profiles pp WHERE pp.club_id = v_transfer.to_club_id::TEXT
  ) WHERE club_id = v_transfer.to_club_id;

  -- Mark transfer complete
  UPDATE player_transfers SET status = 'completed', completed_at = now() WHERE id = p_transfer_id;

  RETURN TRUE;
END;
$$;

-- RPC to cancel a pending transfer
CREATE OR REPLACE FUNCTION cancel_transfer(p_transfer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE player_transfers
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelado pelo usuário'
  WHERE id = p_transfer_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

-- Function to process all pending transfers for current window (called by cron on day 01)
CREATE OR REPLACE FUNCTION process_transfer_window()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_current_month TEXT := to_char(now(), 'YYYY-MM');
  v_transfer RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_transfer IN
    SELECT id FROM player_transfers
    WHERE status = 'pending' AND window_month = v_current_month
    ORDER BY requested_at ASC
  LOOP
    IF process_single_transfer(v_transfer.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
