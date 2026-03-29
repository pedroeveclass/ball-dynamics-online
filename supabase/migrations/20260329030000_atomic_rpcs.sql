-- ============================================================
-- Migration: Atomic RPCs for multi-step operations
-- Replaces client-side multi-step patterns that can leave
-- data in inconsistent state.
-- ============================================================

-- ─── 1. fire_player ────────────────────────────────────────────
-- Terminates a player's contract, removes them from the club,
-- and deducts the rescission fine from club finances atomically.

CREATE OR REPLACE FUNCTION public.fire_player(
  p_player_id UUID,
  p_club_id UUID,
  p_fine_amount NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id UUID;
  v_weekly_salary NUMERIC;
  v_club_balance NUMERIC;
  v_user_id UUID;
  v_club_name TEXT;
BEGIN
  -- Validate inputs
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'p_player_id is required';
  END IF;
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required';
  END IF;

  -- Find the active contract for this player at this club
  SELECT c.id, c.weekly_salary
    INTO v_contract_id, v_weekly_salary
    FROM contracts c
   WHERE c.player_profile_id = p_player_id
     AND c.club_id = p_club_id::TEXT
     AND c.status = 'active'
   LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'No active contract found for this player at this club';
  END IF;

  -- Check club balance if there is a fine
  IF p_fine_amount > 0 THEN
    SELECT cf.balance INTO v_club_balance
      FROM club_finances cf
     WHERE cf.club_id = p_club_id;

    IF v_club_balance IS NULL THEN
      RAISE EXCEPTION 'Club finances record not found';
    END IF;

    IF v_club_balance < p_fine_amount THEN
      RAISE EXCEPTION 'Insufficient club balance. Required: %, Available: %', p_fine_amount, v_club_balance;
    END IF;
  END IF;

  -- 1. Terminate the contract
  UPDATE contracts
     SET status = 'terminated',
         terminated_at = now(),
         termination_type = 'fired',
         updated_at = now()
   WHERE id = v_contract_id;

  -- 2. Remove player from club
  UPDATE player_profiles
     SET club_id = NULL,
         updated_at = now()
   WHERE id = p_player_id;

  -- 3. Deduct fine and recalculate wage bill
  IF p_fine_amount > 0 THEN
    UPDATE club_finances
       SET balance = balance - p_fine_amount,
           weekly_wage_bill = GREATEST(0, weekly_wage_bill - v_weekly_salary),
           updated_at = now()
     WHERE club_id = p_club_id;
  ELSE
    UPDATE club_finances
       SET weekly_wage_bill = GREATEST(0, weekly_wage_bill - v_weekly_salary),
           updated_at = now()
     WHERE club_id = p_club_id;
  END IF;

  -- 4. Notify player if human-controlled
  SELECT pp.user_id INTO v_user_id
    FROM player_profiles pp
   WHERE pp.id = p_player_id;

  SELECT cl.name INTO v_club_name
    FROM clubs cl
   WHERE cl.id = p_club_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      v_user_id,
      'Dispensado',
      'Voce foi dispensado do ' || COALESCE(v_club_name, 'clube') || '.',
      'contract'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fire_player(UUID, UUID, NUMERIC) TO authenticated;


-- ─── 2. accept_mutual_exit ─────────────────────────────────────
-- Accepts a player's mutual exit request, terminates the contract,
-- and removes the player from the club atomically.

CREATE OR REPLACE FUNCTION public.accept_mutual_exit(
  p_agreement_id UUID,
  p_contract_id UUID,
  p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement_status TEXT;
  v_contract_status TEXT;
  v_club_id_text TEXT;
  v_club_id UUID;
  v_weekly_salary NUMERIC;
  v_new_wage_bill NUMERIC;
  v_user_id UUID;
  v_club_name TEXT;
BEGIN
  -- Validate inputs
  IF p_agreement_id IS NULL THEN
    RAISE EXCEPTION 'p_agreement_id is required';
  END IF;
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'p_contract_id is required';
  END IF;
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'p_player_id is required';
  END IF;

  -- Verify agreement exists and is pending
  SELECT cma.status INTO v_agreement_status
    FROM contract_mutual_agreements cma
   WHERE cma.id = p_agreement_id
     AND cma.contract_id = p_contract_id
     AND cma.requested_by = 'player'
     AND cma.status = 'pending';

  IF v_agreement_status IS NULL THEN
    RAISE EXCEPTION 'No pending player-requested mutual agreement found for this contract';
  END IF;

  -- Verify contract is active and get details
  SELECT c.status, c.club_id, c.weekly_salary
    INTO v_contract_status, v_club_id_text, v_weekly_salary
    FROM contracts c
   WHERE c.id = p_contract_id;

  IF v_contract_status IS NULL THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  IF v_contract_status <> 'active' THEN
    RAISE EXCEPTION 'Contract is not active (current status: %)', v_contract_status;
  END IF;

  v_club_id := v_club_id_text::UUID;

  -- 1. Accept the mutual agreement
  UPDATE contract_mutual_agreements
     SET status = 'accepted',
         resolved_at = now()
   WHERE id = p_agreement_id;

  -- 2. Terminate the contract
  UPDATE contracts
     SET status = 'terminated',
         terminated_at = now(),
         termination_type = 'mutual_agreement',
         updated_at = now()
   WHERE id = p_contract_id;

  -- 3. Remove player from club
  UPDATE player_profiles
     SET club_id = NULL,
         updated_at = now()
   WHERE id = p_player_id;

  -- 4. Recalculate wage bill from remaining active contracts
  SELECT COALESCE(SUM(c.weekly_salary), 0)
    INTO v_new_wage_bill
    FROM contracts c
   WHERE c.club_id = v_club_id_text
     AND c.status = 'active';

  UPDATE club_finances
     SET weekly_wage_bill = v_new_wage_bill,
         updated_at = now()
   WHERE club_id = v_club_id;

  -- 5. Notify player if human-controlled
  SELECT pp.user_id INTO v_user_id
    FROM player_profiles pp
   WHERE pp.id = p_player_id;

  SELECT cl.name INTO v_club_name
    FROM clubs cl
   WHERE cl.id = v_club_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      v_user_id,
      'Saida aceita!',
      COALESCE(v_club_name, 'Seu clube') || ' aceitou sua solicitacao de saida por comum acordo.',
      'contract'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_mutual_exit(UUID, UUID, UUID) TO authenticated;


-- ─── 3. process_loan ───────────────────────────────────────────
-- Creates a loan record and credits the amount to the borrower
-- (player money or club finances) atomically.

CREATE OR REPLACE FUNCTION public.process_loan(
  p_player_id UUID,
  p_club_id UUID,
  p_amount NUMERIC,
  p_interest_rate NUMERIC,
  p_duration_weeks INT,
  p_entity_type TEXT  -- 'player' or 'club'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan_id UUID;
  v_total_with_interest NUMERIC;
  v_weekly_payment NUMERIC;
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be positive';
  END IF;
  IF p_interest_rate IS NULL OR p_interest_rate < 0 THEN
    RAISE EXCEPTION 'Interest rate must be non-negative';
  END IF;
  IF p_duration_weeks IS NULL OR p_duration_weeks <= 0 THEN
    RAISE EXCEPTION 'Duration must be positive';
  END IF;
  IF p_entity_type NOT IN ('player', 'club') THEN
    RAISE EXCEPTION 'entity_type must be "player" or "club"';
  END IF;

  IF p_entity_type = 'player' AND p_player_id IS NULL THEN
    RAISE EXCEPTION 'p_player_id is required for player loans';
  END IF;
  IF p_entity_type = 'club' AND p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required for club loans';
  END IF;

  -- Check no existing active loan for this entity
  IF p_entity_type = 'player' THEN
    IF EXISTS (SELECT 1 FROM loans WHERE player_profile_id = p_player_id AND status = 'active') THEN
      RAISE EXCEPTION 'Player already has an active loan';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM loans WHERE club_id = p_club_id AND status = 'active') THEN
      RAISE EXCEPTION 'Club already has an active loan';
    END IF;
  END IF;

  -- Calculate payment schedule
  v_total_with_interest := p_amount * (1 + p_interest_rate * p_duration_weeks);
  v_weekly_payment := v_total_with_interest / p_duration_weeks;

  -- 1. Insert the loan record
  INSERT INTO loans (
    player_profile_id,
    club_id,
    principal,
    remaining,
    weekly_interest_rate,
    weekly_payment,
    status
  ) VALUES (
    CASE WHEN p_entity_type = 'player' THEN p_player_id ELSE NULL END,
    CASE WHEN p_entity_type = 'club' THEN p_club_id ELSE NULL END,
    p_amount,
    p_amount,
    p_interest_rate,
    v_weekly_payment,
    'active'
  )
  RETURNING id INTO v_loan_id;

  -- 2. Credit the amount to the entity
  IF p_entity_type = 'club' THEN
    UPDATE club_finances
       SET balance = balance + p_amount,
           updated_at = now()
     WHERE club_id = p_club_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Club finances record not found';
    END IF;
  ELSE
    UPDATE player_profiles
       SET money = money + p_amount,
           updated_at = now()
     WHERE id = p_player_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Player profile not found';
    END IF;
  END IF;

  RETURN v_loan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_loan(UUID, UUID, NUMERIC, NUMERIC, INT, TEXT) TO authenticated;


-- ─── 4. payoff_loan ────────────────────────────────────────────
-- Pays off a loan in full, deducting from the entity's balance
-- atomically. Fails if insufficient funds.

CREATE OR REPLACE FUNCTION public.payoff_loan(
  p_loan_id UUID,
  p_entity_type TEXT,   -- 'player' or 'club'
  p_entity_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC;
  v_loan_status TEXT;
  v_current_balance NUMERIC;
BEGIN
  -- Validate inputs
  IF p_loan_id IS NULL THEN
    RAISE EXCEPTION 'p_loan_id is required';
  END IF;
  IF p_entity_type NOT IN ('player', 'club') THEN
    RAISE EXCEPTION 'entity_type must be "player" or "club"';
  END IF;
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'p_entity_id is required';
  END IF;

  -- Get loan details with row lock to prevent concurrent payoffs
  SELECT l.remaining, l.status
    INTO v_remaining, v_loan_status
    FROM loans l
   WHERE l.id = p_loan_id
   FOR UPDATE;

  IF v_loan_status IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF v_loan_status <> 'active' THEN
    RAISE EXCEPTION 'Loan is not active (current status: %)', v_loan_status;
  END IF;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Loan has no remaining balance';
  END IF;

  -- Check sufficient funds
  IF p_entity_type = 'club' THEN
    SELECT cf.balance INTO v_current_balance
      FROM club_finances cf
     WHERE cf.club_id = p_entity_id
     FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'Club finances record not found';
    END IF;
    IF v_current_balance < v_remaining THEN
      RAISE EXCEPTION 'Insufficient club balance. Required: %, Available: %', v_remaining, v_current_balance;
    END IF;
  ELSE
    SELECT pp.money INTO v_current_balance
      FROM player_profiles pp
     WHERE pp.id = p_entity_id
     FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'Player profile not found';
    END IF;
    IF v_current_balance < v_remaining THEN
      RAISE EXCEPTION 'Insufficient player balance. Required: %, Available: %', v_remaining, v_current_balance;
    END IF;
  END IF;

  -- 1. Mark loan as paid
  UPDATE loans
     SET remaining = 0,
         status = 'paid',
         paid_at = now()
   WHERE id = p_loan_id;

  -- 2. Deduct from entity
  IF p_entity_type = 'club' THEN
    UPDATE club_finances
       SET balance = balance - v_remaining,
           updated_at = now()
     WHERE club_id = p_entity_id;
  ELSE
    UPDATE player_profiles
       SET money = money - v_remaining,
           updated_at = now()
     WHERE id = p_entity_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payoff_loan(UUID, TEXT, UUID) TO authenticated;
