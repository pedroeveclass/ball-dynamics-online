-- ═══════════════════════════════════════════════════════════
-- Manager (coach) visual appearance.
--
-- Same JSONB shape as player_profiles.appearance. Until now,
-- coach faces were generated deterministically from manager id
-- via seededAppearance() — no persistence, no customization.
-- Now coaches go through the same forced one-shot creator the
-- players use: NULL appearance → redirect to the creator on
-- next login; filled appearance → render from stored choices.
--
-- The outfit (black dress shirt, black pants, black shoes) is
-- NOT stored here: it's hardcoded in <PlayerAvatar outfit="coach">
-- so every coach shares the same formal look.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.manager_profiles
  ADD COLUMN IF NOT EXISTS appearance JSONB;

-- Partial index for the "managers who still need to customize"
-- redirect check on login.
CREATE INDEX IF NOT EXISTS manager_profiles_appearance_null_idx
  ON public.manager_profiles (user_id)
  WHERE appearance IS NULL;
