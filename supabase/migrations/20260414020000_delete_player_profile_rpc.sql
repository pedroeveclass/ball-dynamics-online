-- RPC to let a user reset (delete) one of their own player profiles.
-- Must run as SECURITY DEFINER because:
--   1. player_profiles has no DELETE RLS policy by design
--   2. player_transfers FK lacks ON DELETE CASCADE and must be cleaned first
--
-- Business rule: only free agents (club_id IS NULL) can be deleted — a player
-- under contract has obligations to the club and cannot simply vanish.

CREATE OR REPLACE FUNCTION public.delete_player_profile(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_club_id TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id, club_id
    INTO v_owner_id, v_club_id
  FROM public.player_profiles
  WHERE id = p_player_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'Not authorized to delete this player';
  END IF;

  IF v_club_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reset player while under contract with a club';
  END IF;

  -- player_transfers FK has no CASCADE — wipe rows manually first.
  DELETE FROM public.player_transfers WHERE player_profile_id = p_player_id;

  -- Everything else cascades (attributes, contracts, training history,
  -- lineup slots, store purchases, loans, discipline, suspensions) or is
  -- SET NULL (lineup roles, profiles.active_player_profile_id).
  DELETE FROM public.player_profiles WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_profile(UUID) TO authenticated;
