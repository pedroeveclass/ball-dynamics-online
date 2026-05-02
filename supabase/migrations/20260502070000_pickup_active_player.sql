-- ═══════════════════════════════════════════════════════════
-- Pickup RPCs: resolve caller's ACTIVE player_profile.
--
-- Bug: the previous implementations resolved the caller's player via
--   SELECT id FROM player_profiles WHERE user_id = auth.uid();
-- with no ORDER BY and no respect for profiles.active_player_profile_id.
-- For users with 2+ players this returned an indeterminate row, so a
-- user choosing Player 1 in the UI could end up joining as Player 2.
--
-- Fix: read profiles.active_player_profile_id first, fall back to the
-- oldest player_profile only if it is null.
-- ═══════════════════════════════════════════════════════════

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
  SELECT COALESCE(
    p.active_player_profile_id,
    (SELECT pp.id FROM public.player_profiles pp
       WHERE pp.user_id = auth.uid()
       ORDER BY pp.created_at ASC LIMIT 1)
  ) INTO v_profile_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No player profile for current user';
  END IF;

  IF p_format NOT IN ('5v5','11v11') THEN
    RAISE EXCEPTION 'Invalid format: %', p_format;
  END IF;

  IF p_kickoff_at < now() + INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'Kickoff must be at least 2 minutes from now';
  END IF;
  IF p_kickoff_at > now() + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'Kickoff cannot be more than 7 days away';
  END IF;

  IF p_team_side NOT IN ('home','away') THEN
    RAISE EXCEPTION 'Invalid team_side: %', p_team_side;
  END IF;
  v_allowed := public.pickup_slot_ids(p_format);
  IF NOT (p_slot_id = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid slot_id % for format %', p_slot_id, p_format;
  END IF;

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
  SELECT COALESCE(
    p.active_player_profile_id,
    (SELECT pp.id FROM public.player_profiles pp
       WHERE pp.user_id = auth.uid()
       ORDER BY pp.created_at ASC LIMIT 1)
  ) INTO v_profile_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

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

  INSERT INTO public.pickup_game_participants (
    pickup_game_id, player_profile_id, team_side, slot_id
  ) VALUES (
    p_pickup_id, v_profile_id, p_team_side, p_slot_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_pickup_game(UUID, TEXT, TEXT) TO authenticated;

-- ── leave_pickup_game ──
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
  SELECT COALESCE(
    p.active_player_profile_id,
    (SELECT pp.id FROM public.player_profiles pp
       WHERE pp.user_id = auth.uid()
       ORDER BY pp.created_at ASC LIMIT 1)
  ) INTO v_profile_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

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
  SELECT COALESCE(
    p.active_player_profile_id,
    (SELECT pp.id FROM public.player_profiles pp
       WHERE pp.user_id = auth.uid()
       ORDER BY pp.created_at ASC LIMIT 1)
  ) INTO v_profile_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

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
