-- Jersey number must be unique within a club. Adds:
--   1. assign_jersey_number_for_position() RPC: returns first free number
--      following the canonical Brazilian positional map, or any 1..99 fallback.
--   2. transfer_player / process_single_transfer / admin_assign_player_to_club:
--      auto-assign jersey when none is set.
--   3. create_player_profile: leave jersey NULL (free agent has no club).
--      Only mutated if a jersey ever needs auto-assignment on creation.
--   4. Backfill: per-club duplicates remap newer players to a free number.
--   5. UNIQUE partial index on (club_id, jersey_number) once duplicates fixed.

-- ──────────────────────────────────────────────────────────────────
-- 1) Position → preferred jersey list (canonical Brazilian default)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._jersey_preferred_for_position(p_position TEXT)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(p_position, ''))
    WHEN 'GK'  THEN ARRAY[1, 12, 22]
    WHEN 'LB'  THEN ARRAY[6, 16, 26]
    WHEN 'LWB' THEN ARRAY[6, 16, 26]
    WHEN 'CB'  THEN ARRAY[3, 4, 13, 14]
    WHEN 'RB'  THEN ARRAY[2, 15, 25]
    WHEN 'RWB' THEN ARRAY[2, 15, 25]
    WHEN 'DM'  THEN ARRAY[5, 17, 18]
    WHEN 'CDM' THEN ARRAY[5, 17, 18]
    WHEN 'CM'  THEN ARRAY[8, 20]
    WHEN 'CAM' THEN ARRAY[10, 21]
    WHEN 'LM'  THEN ARRAY[11, 19]
    WHEN 'LW'  THEN ARRAY[11, 19]
    WHEN 'RM'  THEN ARRAY[7, 23]
    WHEN 'RW'  THEN ARRAY[7, 23]
    WHEN 'CF'  THEN ARRAY[9, 24]
    WHEN 'ST'  THEN ARRAY[9, 24]
    ELSE ARRAY[]::INTEGER[]
  END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 2) RPC: pick first available jersey number for a club + position
--    1) try positional preferences (in order)
--    2) fall back to first free 1..99
--    Returns NULL if club_id is NULL.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_jersey_number_for_position(
  p_club_id TEXT,
  p_position TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taken INTEGER[];
  v_pref INTEGER[];
  v_n INTEGER;
BEGIN
  IF p_club_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(jersey_number), ARRAY[]::INTEGER[])
    INTO v_taken
    FROM public.player_profiles
   WHERE club_id = p_club_id
     AND jersey_number IS NOT NULL;

  v_pref := public._jersey_preferred_for_position(p_position);

  -- Try preferred numbers in order
  IF v_pref IS NOT NULL THEN
    FOREACH v_n IN ARRAY v_pref LOOP
      IF NOT (v_n = ANY(v_taken)) THEN
        RETURN v_n;
      END IF;
    END LOOP;
  END IF;

  -- Fallback: first free 1..99
  FOR v_n IN 1..99 LOOP
    IF NOT (v_n = ANY(v_taken)) THEN
      RETURN v_n;
    END IF;
  END LOOP;

  -- Club is impossibly full (>99 players). Return NULL — caller decides.
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_jersey_number_for_position(TEXT, TEXT) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────
-- 3) Backfill: remap duplicates within a club.
--    For each club's duplicate jersey_number, the player with the OLDEST
--    created_at keeps it. Newer players get a new number from the
--    positional map (or fallback). Done iteratively until no dupes left.
-- ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dupe RECORD;
  v_new_number INTEGER;
  v_iter INT := 0;
BEGIN
  LOOP
    v_iter := v_iter + 1;
    EXIT WHEN v_iter > 200; -- safety stop

    SELECT pp.id, pp.club_id, pp.primary_position, pp.jersey_number
      INTO v_dupe
      FROM public.player_profiles pp
      JOIN (
        SELECT club_id, jersey_number
          FROM public.player_profiles
         WHERE club_id IS NOT NULL AND jersey_number IS NOT NULL
         GROUP BY club_id, jersey_number
        HAVING COUNT(*) > 1
      ) d ON d.club_id = pp.club_id AND d.jersey_number = pp.jersey_number
      WHERE pp.id NOT IN (
        SELECT DISTINCT ON (club_id, jersey_number) id
          FROM public.player_profiles
         WHERE club_id IS NOT NULL AND jersey_number IS NOT NULL
         ORDER BY club_id, jersey_number, created_at ASC
      )
      ORDER BY pp.created_at ASC
      LIMIT 1;

    EXIT WHEN NOT FOUND;

    v_new_number := public.assign_jersey_number_for_position(v_dupe.club_id, v_dupe.primary_position);

    UPDATE public.player_profiles
       SET jersey_number = v_new_number
     WHERE id = v_dupe.id;

    RAISE NOTICE '[jersey-backfill] club=% player=% pos=% old=% new=%',
      v_dupe.club_id, v_dupe.id, v_dupe.primary_position, v_dupe.jersey_number, v_new_number;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4) UNIQUE partial index — enforces one number per club from now on.
-- ──────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_player_profiles_club_jersey;
CREATE UNIQUE INDEX uq_player_profiles_club_jersey
  ON public.player_profiles (club_id, jersey_number)
  WHERE club_id IS NOT NULL AND jersey_number IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 5) transfer_player: auto-assign jersey when player has none at the
--    new club.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_player(
  p_player_id uuid,
  p_new_club_id text,
  p_old_contract_id uuid,
  p_new_salary integer,
  p_new_release_clause integer,
  p_contract_months integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_position TEXT;
  v_assigned INTEGER;
BEGIN
  -- Terminate old contract
  UPDATE contracts
     SET status = 'terminated', terminated_at = now(), termination_type = 'transfer'
   WHERE player_profile_id = p_player_id AND status = 'active';

  -- Create new contract
  INSERT INTO contracts (player_profile_id, club_id, weekly_salary, release_clause, start_date, end_date, status)
  VALUES (
    p_player_id,
    p_new_club_id,
    p_new_salary,
    p_new_release_clause,
    CURRENT_DATE,
    CURRENT_DATE + (p_contract_months || ' months')::interval,
    'active'
  );

  -- Pick a jersey number based on position. Always reassign on transfer
  -- so the player's previous number (which may now collide at the new
  -- club) is replaced by a free one. If the assignment helper returns
  -- NULL we leave it NULL.
  SELECT primary_position INTO v_position FROM player_profiles WHERE id = p_player_id;
  v_assigned := public.assign_jersey_number_for_position(p_new_club_id, v_position);

  -- Update player's club + jersey
  UPDATE player_profiles
     SET club_id = p_new_club_id,
         weekly_salary = p_new_salary,
         jersey_number = v_assigned
   WHERE id = p_player_id;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────
-- 6) process_single_transfer: same auto-assign on the buy-side.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_single_transfer(p_transfer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_transfer RECORD;
  v_buyer_balance NUMERIC;
  v_old_contract_id UUID;
  v_position TEXT;
  v_assigned INTEGER;
BEGIN
  SELECT * INTO v_transfer FROM player_transfers WHERE id = p_transfer_id AND status = 'pending';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT balance INTO v_buyer_balance FROM club_finances WHERE club_id = v_transfer.to_club_id;
  IF v_buyer_balance IS NULL OR v_buyer_balance < v_transfer.transfer_fee THEN
    UPDATE player_transfers SET status = 'failed', cancel_reason = 'Saldo insuficiente', cancelled_at = now() WHERE id = p_transfer_id;
    RETURN FALSE;
  END IF;

  IF v_transfer.transfer_fee > 0 THEN
    UPDATE club_finances SET balance = balance - v_transfer.transfer_fee WHERE club_id = v_transfer.to_club_id;
    IF v_transfer.from_club_id IS NOT NULL THEN
      UPDATE club_finances SET balance = balance + v_transfer.transfer_fee WHERE club_id = v_transfer.from_club_id;
    END IF;
  END IF;

  SELECT id INTO v_old_contract_id FROM contracts
   WHERE player_profile_id = v_transfer.player_profile_id AND status = 'active'
   LIMIT 1;

  IF v_old_contract_id IS NOT NULL THEN
    UPDATE contracts SET status = 'terminated', terminated_at = now(), termination_type = 'transfer' WHERE id = v_old_contract_id;
  END IF;

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

  SELECT primary_position INTO v_position FROM player_profiles WHERE id = v_transfer.player_profile_id;
  v_assigned := public.assign_jersey_number_for_position(v_transfer.to_club_id::TEXT, v_position);

  UPDATE player_profiles
     SET club_id = v_transfer.to_club_id::TEXT,
         weekly_salary = v_transfer.weekly_salary,
         jersey_number = v_assigned
   WHERE id = v_transfer.player_profile_id;

  IF v_transfer.from_club_id IS NOT NULL THEN
    UPDATE club_finances SET weekly_wage_bill = (
      SELECT COALESCE(SUM(pp.weekly_salary), 0) FROM player_profiles pp WHERE pp.club_id = v_transfer.from_club_id::TEXT
    ) WHERE club_id = v_transfer.from_club_id;
  END IF;
  UPDATE club_finances SET weekly_wage_bill = (
    SELECT COALESCE(SUM(pp.weekly_salary), 0) FROM player_profiles pp WHERE pp.club_id = v_transfer.to_club_id::TEXT
  ) WHERE club_id = v_transfer.to_club_id;

  UPDATE player_transfers SET status = 'completed', completed_at = now() WHERE id = p_transfer_id;

  RETURN TRUE;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────
-- 7) admin_assign_player_to_club: auto-assign jersey too.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_assign_player_to_club(
  p_player_id uuid,
  p_club_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_position TEXT;
  v_assigned INTEGER;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT primary_position INTO v_position FROM public.player_profiles WHERE id = p_player_id;
  v_assigned := public.assign_jersey_number_for_position(p_club_id::TEXT, v_position);

  UPDATE public.player_profiles
     SET club_id = p_club_id::TEXT,
         jersey_number = v_assigned
   WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  UPDATE public.contracts
     SET status = 'terminated', terminated_at = now(), termination_type = 'admin_reassign'
   WHERE player_profile_id = p_player_id
     AND status = 'active'
     AND (club_id IS NULL OR club_id <> p_club_id::TEXT);

  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
     WHERE player_profile_id = p_player_id
       AND club_id = p_club_id::TEXT
       AND status = 'active'
  ) THEN
    INSERT INTO public.contracts (
      player_profile_id, club_id, weekly_salary, release_clause,
      start_date, end_date, status
    ) VALUES (
      p_player_id, p_club_id::TEXT, 500, 5000,
      CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', 'active'
    );
  END IF;
END;
$function$;

-- ──────────────────────────────────────────────────────────────────
-- 8) set_player_jersey_number: friendly error when number already taken.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_player_jersey_number(
  p_player_id UUID,
  p_jersey_number INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id TEXT;
  v_taken_by UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_jersey_number IS NOT NULL AND (p_jersey_number < 0 OR p_jersey_number > 99) THEN
    RAISE EXCEPTION 'Jersey number must be between 0 and 99';
  END IF;

  SELECT club_id INTO v_club_id FROM public.player_profiles WHERE id = p_player_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Player is not under contract with any club';
  END IF;

  IF NOT public.current_user_can_edit_club(v_club_id::UUID) THEN
    RAISE EXCEPTION 'Only the head coach or assistant can change jersey numbers';
  END IF;

  IF p_jersey_number IS NOT NULL THEN
    SELECT id INTO v_taken_by
      FROM public.player_profiles
     WHERE club_id = v_club_id
       AND jersey_number = p_jersey_number
       AND id <> p_player_id
     LIMIT 1;
    IF v_taken_by IS NOT NULL THEN
      RAISE EXCEPTION 'Jersey number % is already in use by another player at this club', p_jersey_number;
    END IF;
  END IF;

  UPDATE public.player_profiles
     SET jersey_number = p_jersey_number
   WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_jersey_number(UUID, INTEGER) TO authenticated;
