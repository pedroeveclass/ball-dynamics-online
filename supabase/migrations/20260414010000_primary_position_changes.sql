-- Counter for how many times the player has changed their primary position.
-- First change is free (count goes 0 -> 1). Subsequent changes cost R$ 100k,
-- checked and deducted client-side in PlayerProfilePage.

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS primary_position_changes INTEGER NOT NULL DEFAULT 0;
