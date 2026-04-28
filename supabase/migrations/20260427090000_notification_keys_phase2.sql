-- ═══════════════════════════════════════════════════════════
-- Phase 2 of notification i18n: migrate the contract-related
-- triggers/RPCs to emit i18n_key + i18n_params alongside the
-- legacy PT title/body.
--
-- Functions touched:
--   - fire_player → emits 'fired' with { club } params
--   - accept_mutual_exit → emits 'mutual_exit_accepted' with { club }
--
-- These are full CREATE OR REPLACE redefinitions because Postgres
-- doesn't support patching a single statement inside a function.
-- The bodies are byte-for-byte identical to 20260329030000_atomic_rpcs.sql
-- except for the INSERT INTO notifications block at the end.
-- ═══════════════════════════════════════════════════════════

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
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'p_player_id is required'; END IF;
  IF p_club_id IS NULL THEN RAISE EXCEPTION 'p_club_id is required'; END IF;

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

  IF p_fine_amount > 0 THEN
    SELECT cf.balance INTO v_club_balance FROM club_finances cf WHERE cf.club_id = p_club_id;
    IF v_club_balance IS NULL THEN RAISE EXCEPTION 'Club finances record not found'; END IF;
    IF v_club_balance < p_fine_amount THEN
      RAISE EXCEPTION 'Insufficient club balance. Required: %, Available: %', p_fine_amount, v_club_balance;
    END IF;
  END IF;

  UPDATE contracts
     SET status = 'terminated', terminated_at = now(), termination_type = 'fired', updated_at = now()
   WHERE id = v_contract_id;

  UPDATE player_profiles SET club_id = NULL, updated_at = now() WHERE id = p_player_id;

  IF p_fine_amount > 0 THEN
    UPDATE club_finances
       SET balance = balance - p_fine_amount,
           weekly_wage_bill = GREATEST(0, weekly_wage_bill - v_weekly_salary),
           updated_at = now()
     WHERE club_id = p_club_id;
  ELSE
    UPDATE club_finances
       SET weekly_wage_bill = GREATEST(0, weekly_wage_bill - v_weekly_salary), updated_at = now()
     WHERE club_id = p_club_id;
  END IF;

  SELECT pp.user_id INTO v_user_id FROM player_profiles pp WHERE pp.id = p_player_id;
  SELECT cl.name INTO v_club_name FROM clubs cl WHERE cl.id = p_club_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, i18n_key, i18n_params)
    VALUES (
      v_user_id,
      'Dispensado',
      'Voce foi dispensado do ' || COALESCE(v_club_name, 'clube') || '.',
      'contract',
      'fired',
      jsonb_build_object('club', COALESCE(v_club_name, 'clube'))
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fire_player(UUID, UUID, NUMERIC) TO authenticated;

-- ─── accept_mutual_exit ────────────────────────────────────

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
  IF p_agreement_id IS NULL THEN RAISE EXCEPTION 'p_agreement_id is required'; END IF;
  IF p_contract_id IS NULL THEN RAISE EXCEPTION 'p_contract_id is required'; END IF;
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'p_player_id is required'; END IF;

  SELECT cma.status INTO v_agreement_status
    FROM contract_mutual_agreements cma
   WHERE cma.id = p_agreement_id
     AND cma.contract_id = p_contract_id
     AND cma.requested_by = 'player'
     AND cma.status = 'pending';

  IF v_agreement_status IS NULL THEN
    RAISE EXCEPTION 'No pending player-requested mutual agreement found for this contract';
  END IF;

  SELECT c.status, c.club_id, c.weekly_salary
    INTO v_contract_status, v_club_id_text, v_weekly_salary
    FROM contracts c
   WHERE c.id = p_contract_id;

  IF v_contract_status IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF v_contract_status <> 'active' THEN
    RAISE EXCEPTION 'Contract is not active (current status: %)', v_contract_status;
  END IF;

  v_club_id := v_club_id_text::UUID;

  UPDATE contract_mutual_agreements
     SET status = 'accepted', resolved_at = now()
   WHERE id = p_agreement_id;

  UPDATE contracts
     SET status = 'terminated', terminated_at = now(), termination_type = 'mutual_agreement', updated_at = now()
   WHERE id = p_contract_id;

  UPDATE player_profiles SET club_id = NULL, updated_at = now() WHERE id = p_player_id;

  SELECT COALESCE(SUM(c.weekly_salary), 0) INTO v_new_wage_bill
    FROM contracts c
   WHERE c.club_id = v_club_id_text AND c.status = 'active';

  UPDATE club_finances
     SET weekly_wage_bill = v_new_wage_bill, updated_at = now()
   WHERE club_id = v_club_id;

  SELECT pp.user_id INTO v_user_id FROM player_profiles pp WHERE pp.id = p_player_id;
  SELECT cl.name INTO v_club_name FROM clubs cl WHERE cl.id = v_club_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, i18n_key, i18n_params)
    VALUES (
      v_user_id,
      'Saida aceita!',
      COALESCE(v_club_name, 'Seu clube') || ' aceitou sua solicitacao de saida por comum acordo.',
      'contract',
      'mutual_exit_accepted',
      jsonb_build_object('club', COALESCE(v_club_name, 'Seu clube'))
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_mutual_exit(UUID, UUID, UUID) TO authenticated;
