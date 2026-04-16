-- ═══════════════════════════════════════════════════════════
-- Manager / assistant sets a player's jersey number.
--
-- Before: the squad screen did a plain UPDATE on player_profiles, which
-- is blocked by the `Users can update own player` policy (auth.uid() =
-- user_id). The request returned 0 rows with no error, so the UI
-- *looked* like it saved but the number was never persisted.
--
-- This RPC is SECURITY DEFINER and re-checks that the caller is the
-- head coach or assistant of the player's current club, then writes.
-- ═══════════════════════════════════════════════════════════

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

  UPDATE public.player_profiles
     SET jersey_number = p_jersey_number
   WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_jersey_number(UUID, INTEGER) TO authenticated;
