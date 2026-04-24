-- ═══════════════════════════════════════════════════════════
-- Pickup game RPCs: create / join / leave / cancel
--
-- All SECURITY DEFINER; client RPCs resolve the caller's player_profile
-- from auth.uid() rather than trusting input. Anti-spam guard: at most
-- 3 pickup games with status='open' may exist globally at any time.
-- ═══════════════════════════════════════════════════════════

-- Allowed slot IDs per formation, kept in SQL so RPCs can validate.
-- Keep in sync with src/lib/pickupSlots.ts.
CREATE OR REPLACE FUNCTION public.pickup_slot_ids(p_format TEXT)
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE p_format
    WHEN '5v5'   THEN ARRAY['GK','DEF1','DEF2','MC','ATA']
    WHEN '11v11' THEN ARRAY['GK','LB','CB1','CB2','RB','LM','CM1','CM2','RM','ST1','ST2']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

GRANT EXECUTE ON FUNCTION public.pickup_slot_ids(TEXT) TO authenticated, service_role;

-- ── create_pickup_game ──
CREATE OR REPLACE FUNCTION public.create_pickup_game(
  p_format TEXT,
  p_kickoff_at TIMESTAMPTZ,
  p_team_side TEXT,
  p_slot_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_pickup_id  UUID;
  v_open_count INT;
  v_formation  TEXT;
  v_allowed    TEXT[];
BEGIN
  -- Resolve caller's player_profile
  SELECT id INTO v_profile_id
    FROM public.player_profiles
    WHERE user_id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No player profile for current user';
  END IF;

  -- Validate format
  IF p_format NOT IN ('5v5','11v11') THEN
    RAISE EXCEPTION 'Invalid format: %', p_format;
  END IF;

  -- Validate kickoff window: at least 2 min in the future, at most 7 days.
  IF p_kickoff_at < now() + INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'Kickoff must be at least 2 minutes from now';
  END IF;
  IF p_kickoff_at > now() + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'Kickoff cannot be more than 7 days away';
  END IF;

  -- Validate team side + slot
  IF p_team_side NOT IN ('home','away') THEN
    RAISE EXCEPTION 'Invalid team_side: %', p_team_side;
  END IF;
  v_allowed := public.pickup_slot_ids(p_format);
  IF NOT (p_slot_id = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid slot_id % for format %', p_slot_id, p_format;
  END IF;

  -- Anti-spam: at most 3 open pickup games globally
  SELECT COUNT(*) INTO v_open_count
    FROM public.pickup_games
    WHERE status = 'open';
  IF v_open_count >= 3 THEN
    RAISE EXCEPTION 'Maximum of 3 open pickup games reached';
  END IF;

  v_formation := CASE p_format WHEN '5v5' THEN '5v5-custom' ELSE '4-4-2' END;

  INSERT INTO public.pickup_games (
    created_by_profile_id, format, formation, kickoff_at, status
  ) VALUES (
    v_profile_id, p_format, v_formation, p_kickoff_at, 'open'
  ) RETURNING id INTO v_pickup_id;

  INSERT INTO public.pickup_game_participants (
    pickup_game_id, player_profile_id, team_side, slot_id
  ) VALUES (
    v_pickup_id, v_profile_id, p_team_side, p_slot_id
  );

  RETURN v_pickup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pickup_game(TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ── join_pickup_game ──
CREATE OR REPLACE FUNCTION public.join_pickup_game(
  p_pickup_id UUID,
  p_team_side TEXT,
  p_slot_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_pickup     public.pickup_games;
  v_allowed    TEXT[];
BEGIN
  SELECT id INTO v_profile_id
    FROM public.player_profiles
    WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No player profile for current user';
  END IF;

  SELECT * INTO v_pickup FROM public.pickup_games WHERE id = p_pickup_id FOR UPDATE;
  IF v_pickup.id IS NULL THEN
    RAISE EXCEPTION 'Pickup game not found';
  END IF;
  IF v_pickup.status <> 'open' THEN
    RAISE EXCEPTION 'Pickup game is no longer open';
  END IF;

  IF p_team_side NOT IN ('home','away') THEN
    RAISE EXCEPTION 'Invalid team_side';
  END IF;
  v_allowed := public.pickup_slot_ids(v_pickup.format);
  IF NOT (p_slot_id = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid slot_id for this format';
  END IF;

  -- Unique (pickup_game_id, team_side, slot_id) + (pickup_game_id, player_profile_id)
  -- enforce the rest of the invariants atomically.
  INSERT INTO public.pickup_game_participants (
    pickup_game_id, player_profile_id, team_side, slot_id
  ) VALUES (
    p_pickup_id, v_profile_id, p_team_side, p_slot_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_pickup_game(UUID, TEXT, TEXT) TO authenticated;

-- ── leave_pickup_game ──
-- Creator staying put: per product spec, leaving does NOT cancel the game
-- — the creator can cancel it explicitly via cancel_pickup_game.
CREATE OR REPLACE FUNCTION public.leave_pickup_game(p_pickup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status     TEXT;
BEGIN
  SELECT id INTO v_profile_id
    FROM public.player_profiles
    WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No player profile for current user';
  END IF;

  SELECT status INTO v_status FROM public.pickup_games WHERE id = p_pickup_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pickup game not found';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cannot leave a pickup game that already started';
  END IF;

  DELETE FROM public.pickup_game_participants
    WHERE pickup_game_id = p_pickup_id
      AND player_profile_id = v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_pickup_game(UUID) TO authenticated;

-- ── cancel_pickup_game ──
CREATE OR REPLACE FUNCTION public.cancel_pickup_game(p_pickup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_pickup     public.pickup_games;
BEGIN
  SELECT id INTO v_profile_id
    FROM public.player_profiles
    WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No player profile for current user';
  END IF;

  SELECT * INTO v_pickup FROM public.pickup_games WHERE id = p_pickup_id FOR UPDATE;
  IF v_pickup.id IS NULL THEN
    RAISE EXCEPTION 'Pickup game not found';
  END IF;
  IF v_pickup.created_by_profile_id <> v_profile_id THEN
    RAISE EXCEPTION 'Only the creator can cancel this pickup game';
  END IF;
  IF v_pickup.status <> 'open' THEN
    RAISE EXCEPTION 'Pickup game is not open';
  END IF;

  UPDATE public.pickup_games
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_pickup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pickup_game(UUID) TO authenticated;

-- ── get_pickup_lobby ──
-- Returns the pickup row + all participants with display info (name, primary
-- position), bypassing player_profiles RLS which normally hides players from
-- other clubs. Safe because these fields are already public on /player/:id
-- and the teammate policy already exposes them within-club.
CREATE OR REPLACE FUNCTION public.get_pickup_lobby(p_pickup_id UUID)
RETURNS TABLE (
  participant_id UUID,
  player_profile_id UUID,
  full_name TEXT,
  primary_position TEXT,
  team_side TEXT,
  slot_id TEXT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pp2.id AS participant_id,
    pp2.player_profile_id,
    pf.full_name,
    pf.primary_position,
    pp2.team_side,
    pp2.slot_id
  FROM public.pickup_game_participants pp2
  LEFT JOIN public.player_profiles pf ON pf.id = pp2.player_profile_id
  WHERE pp2.pickup_game_id = p_pickup_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pickup_lobby(UUID) TO authenticated;
