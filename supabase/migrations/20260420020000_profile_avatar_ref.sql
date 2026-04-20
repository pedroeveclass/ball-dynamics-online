-- ═══════════════════════════════════════════════════════════
-- Profile "use character avatar" reference.
--
-- Lets a user set their account profile photo to be the visual of
-- one of their own characters (a player_profile or manager_profile
-- tied to their user_id). Storing a reference — rather than a
-- rendered image URL — means the account photo automatically
-- updates whenever the player edits their appearance or transfers
-- to a club with different colors.
--
-- Format: `avatar_char_ref` is a text column with the shape
--   "player:<uuid>"   — points at a player_profiles.id
--   "manager:<uuid>"  — points at a manager_profiles.id
-- NULL / empty → fall back to legacy `avatar_url` (emoji:, http URL,
-- or username initial).
--
-- Ownership is enforced client-side by filtering the picker on
-- `user_id = auth.uid()`. RLS on player_profiles / manager_profiles
-- still gates read access, so setting a stranger's character ref
-- would just render nothing (graceful degradation).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_char_ref TEXT;

COMMENT ON COLUMN public.profiles.avatar_char_ref IS
  'Optional reference to a character owned by this user, rendered as the profile photo. Shape: "player:<uuid>" or "manager:<uuid>". NULL → use avatar_url instead.';
