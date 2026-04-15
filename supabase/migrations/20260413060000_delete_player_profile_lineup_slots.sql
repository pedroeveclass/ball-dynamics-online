-- Fix: delete_player_profile was failing at the CASCADE on lineup_slots with
--   "violates foreign key constraint match_participants_lineup_slot_id_fkey"
-- because match_participants.lineup_slot_id is NO ACTION. When the cascade
-- tried to remove the player's lineup_slots, match_participants still
-- referenced them.
--
-- Null out the lineup_slot_id on match_participants for any slot owned by the
-- player before the DELETE fires.

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

  -- Unlink match_participants from the player AND from any lineup_slot this
  -- player owns (the lineup_slots themselves will be wiped by the cascade
  -- from player_profiles, which is NO ACTION against match_participants).
  UPDATE public.match_participants
     SET lineup_slot_id = NULL
   WHERE lineup_slot_id IN (
     SELECT id FROM public.lineup_slots WHERE player_profile_id = p_player_id
   );

  UPDATE public.match_participants
     SET player_profile_id = NULL
   WHERE player_profile_id = p_player_id;

  DELETE FROM public.contract_offers  WHERE player_profile_id = p_player_id;
  DELETE FROM public.player_transfers WHERE player_profile_id = p_player_id;

  DELETE FROM public.player_profiles WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_profile(UUID) TO authenticated;
