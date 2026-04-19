-- ═══════════════════════════════════════════════════════════
-- Player visual appearance (avatar system).
--
-- Each player_profile gets a JSONB `appearance` describing the
-- cosmetic choices the owner picked on creation: skin tone, hair,
-- face features, and (later) purchased gadgets.
--
-- NULL appearance = owner has not customized yet → the UI forces
-- them through the avatar creator on next login.
--
-- The team jersey is NOT stored here: it is derived at render
-- time from the player's current club so transfers automatically
-- update the visual without touching this column.
--
-- Shape (client-side TS type in src/lib/avatar.ts):
--   {
--     skinTone: string,          // hex palette key
--     hair: string,              // avataaars `top` id
--     hairColor: string,         // hex palette key
--     eyebrows: string,
--     eyes: string,
--     nose: string,
--     mouth: string,
--     facialHair: string | null,
--     facialHairColor: string | null,
--     accessories: string | null,
--     gadgets: Array<{ slot: string, id: string }>  // reserved for store
--   }
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS appearance JSONB;

-- Helpful partial index for the "players who still need to customize"
-- redirect check on login.
CREATE INDEX IF NOT EXISTS player_profiles_appearance_null_idx
  ON public.player_profiles (user_id)
  WHERE appearance IS NULL;
