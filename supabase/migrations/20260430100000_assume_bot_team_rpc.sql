-- ──────────────────────────────────────────────────────────────────
-- assume_bot_team
--
-- The takeover-a-bot-team flow used to be two client-side UPDATEs in
-- sequence:
--   1) UPDATE clubs SET manager_profile_id = … (allowed by the
--      "Users can takeover bot-managed clubs" policy)
--   2) UPDATE stadiums SET name = … (gated by current_user_managed_club_id())
--
-- Step 2 silently failed because of how the helper resolves the
-- caller's managed club — manager-takes-club + same-request stadium
-- rename is exactly the kind of write the manager-RLS-writes memo
-- warns about. Symptom for Cronos taking over Maré: the stadium kept
-- the original name "Estádio da Paz" even though he typed "Arena
-- Atlantida" in the dialog.
--
-- This RPC does both updates atomically as SECURITY DEFINER, after
-- verifying the caller owns the target manager_profile and the club
-- is currently bot-managed. The takeover policy on clubs stays — the
-- RPC is just the single supported path going forward.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assume_bot_team(
  p_club_id UUID,
  p_manager_profile_id UUID,
  p_club_name TEXT,
  p_short_name TEXT,
  p_primary_color TEXT,
  p_secondary_color TEXT,
  p_city TEXT,
  p_stadium_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_user_id UUID;
  v_is_bot BOOLEAN;
  v_stadium_id UUID;
BEGIN
  IF p_club_id IS NULL OR p_manager_profile_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id and p_manager_profile_id are required';
  END IF;
  IF p_club_name IS NULL OR length(trim(p_club_name)) = 0 THEN
    RAISE EXCEPTION 'club name cannot be empty';
  END IF;

  -- Caller must own the manager_profile being assigned.
  SELECT user_id INTO v_owner_user_id
    FROM manager_profiles
   WHERE id = p_manager_profile_id;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'manager profile not found';
  END IF;
  IF v_owner_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot use a manager profile that is not yours';
  END IF;

  -- Club must currently be bot-managed (you can't steal a human's club).
  SELECT is_bot_managed INTO v_is_bot FROM clubs WHERE id = p_club_id;
  IF v_is_bot IS NULL THEN
    RAISE EXCEPTION 'club not found';
  END IF;
  IF coalesce(v_is_bot, false) <> true THEN
    RAISE EXCEPTION 'club is not bot-managed';
  END IF;

  -- 1. Take over the club.
  UPDATE clubs
     SET manager_profile_id = p_manager_profile_id,
         name               = trim(p_club_name),
         short_name         = upper(trim(p_short_name)),
         primary_color      = p_primary_color,
         secondary_color    = p_secondary_color,
         city               = NULLIF(trim(coalesce(p_city, '')), ''),
         is_bot_managed     = false,
         updated_at         = now()
   WHERE id = p_club_id;

  -- 2. Rename the stadium (one-stadium-per-club today; if more, picks
  --    the oldest by created_at to stay deterministic).
  IF p_stadium_name IS NOT NULL AND length(trim(p_stadium_name)) > 0 THEN
    SELECT id INTO v_stadium_id
      FROM stadiums
     WHERE club_id = p_club_id
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_stadium_id IS NOT NULL THEN
      UPDATE stadiums
         SET name = trim(p_stadium_name)
       WHERE id = v_stadium_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'club_id', p_club_id,
    'stadium_id', v_stadium_id,
    'stadium_renamed', v_stadium_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assume_bot_team(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
