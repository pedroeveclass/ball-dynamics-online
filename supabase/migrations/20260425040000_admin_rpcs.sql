-- ═══════════════════════════════════════════════════════════
-- Admin panel RPCs
-- RLS on clubs / club_finances / player_profiles / contracts is
-- owner-scoped (auth.uid() must match manager/player). Admin UI
-- plain UPDATEs therefore silently affect 0 rows. These
-- SECURITY DEFINER RPCs check profiles.is_admin and bypass RLS.
-- ═══════════════════════════════════════════════════════════

-- ─── helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_caller()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;


-- ─── admin_update_club ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_club(
  p_club_id UUID,
  p_name TEXT,
  p_short_name TEXT,
  p_primary_color TEXT,
  p_secondary_color TEXT,
  p_city TEXT,
  p_formation TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.clubs
  SET name = COALESCE(NULLIF(TRIM(p_name), ''), name),
      short_name = COALESCE(NULLIF(UPPER(TRIM(p_short_name)), ''), short_name),
      primary_color = COALESCE(NULLIF(p_primary_color, ''), primary_color),
      secondary_color = COALESCE(NULLIF(p_secondary_color, ''), secondary_color),
      city = NULLIF(TRIM(COALESCE(p_city, '')), '')
  WHERE id = p_club_id;

  IF p_formation IS NOT NULL AND p_formation <> '' THEN
    INSERT INTO public.club_settings (club_id, default_formation)
    VALUES (p_club_id, p_formation)
    ON CONFLICT (club_id) DO UPDATE SET default_formation = EXCLUDED.default_formation;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_club(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ─── admin_fire_manager ─────────────────────────────────────
-- Flags the club as bot-managed and clears the assistant. Keeps
-- manager_profile_id pointing at the former manager so historical
-- FKs stay intact (matches current UI intent: "volta a ser bot").
CREATE OR REPLACE FUNCTION public.admin_fire_manager(p_club_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.clubs
  SET is_bot_managed = true,
      assistant_manager_id = NULL
  WHERE id = p_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fire_manager(UUID) TO authenticated;


-- ─── admin_adjust_club_balance ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_adjust_club_balance(
  p_club_id UUID,
  p_amount BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance BIGINT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.club_finances (club_id, balance, weekly_wage_bill, projected_income, projected_expense)
  VALUES (p_club_id, p_amount, 0, 0, 0)
  ON CONFLICT (club_id) DO UPDATE
    SET balance = public.club_finances.balance + EXCLUDED.balance
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_club_balance(UUID, BIGINT) TO authenticated;


-- ─── admin_adjust_player_money ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_adjust_player_money(
  p_player_id UUID,
  p_amount BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_money BIGINT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.player_profiles
  SET money = COALESCE(money, 0) + p_amount
  WHERE id = p_player_id
  RETURNING money INTO v_new_money;

  IF v_new_money IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  RETURN v_new_money;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_player_money(UUID, BIGINT) TO authenticated;


-- ─── admin_search_players ───────────────────────────────────
-- Bypasses player_profiles RLS (which hides other users' rows).
CREATE OR REPLACE FUNCTION public.admin_search_players(p_query TEXT)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  primary_position TEXT,
  overall INTEGER,
  money INTEGER,
  club_id TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := '%' || regexp_replace(COALESCE(p_query, ''), '[%_\\]', '', 'g') || '%';

  RETURN QUERY
  SELECT pp.id, pp.full_name, pp.primary_position, pp.overall, pp.money, pp.club_id
  FROM public.player_profiles pp
  WHERE pp.full_name ILIKE v_q
  ORDER BY pp.full_name
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_players(TEXT) TO authenticated;


-- ─── admin_assign_player_to_club ────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_assign_player_to_club(
  p_player_id UUID,
  p_club_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.player_profiles
  SET club_id = p_club_id::TEXT
  WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  -- Terminate any other active contract
  UPDATE public.contracts
  SET status = 'terminated', terminated_at = now(), termination_type = 'admin_reassign'
  WHERE player_profile_id = p_player_id
    AND status = 'active'
    AND (club_id IS NULL OR club_id <> p_club_id::TEXT);

  -- Upsert active contract for the new club
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_player_to_club(UUID, UUID) TO authenticated;


-- ─── admin_remove_player_from_club ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_remove_player_from_club(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.player_profiles
  SET club_id = NULL, weekly_salary = 0
  WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  UPDATE public.contracts
  SET status = 'terminated', terminated_at = now(), termination_type = 'admin_release'
  WHERE player_profile_id = p_player_id AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_player_from_club(UUID) TO authenticated;
