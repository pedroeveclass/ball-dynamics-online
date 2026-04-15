-- Fix: delete_player_profile was failing with
--   "violates foreign key constraint contract_offers_player_profile_id_fkey"
-- because the previous version only cleaned player_transfers before the DELETE.
--
-- There are 3 NO ACTION FKs pointing at player_profiles:
--   * contract_offers.player_profile_id      → DELETE rows (history of offers)
--   * player_transfers.player_profile_id     → DELETE rows (transfer history)
--   * match_participants.player_profile_id   → SET NULL  (keep match history,
--                                                          just unlink the player)
--
-- Everything else (contracts, lineup_slots, player_attributes, training_history,
-- store_purchases, loans, discipline, suspensions) has ON DELETE CASCADE and
-- profiles.active_player_profile_id has ON DELETE SET NULL, so they don't need
-- manual handling.

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

  -- Clear NO-ACTION FKs before deleting the profile.
  UPDATE public.match_participants
     SET player_profile_id = NULL
   WHERE player_profile_id = p_player_id;

  DELETE FROM public.contract_offers  WHERE player_profile_id = p_player_id;
  DELETE FROM public.player_transfers WHERE player_profile_id = p_player_id;

  DELETE FROM public.player_profiles WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_player_profile(UUID) TO authenticated;
