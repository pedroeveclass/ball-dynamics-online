-- ============================================================
-- Migration: Multi-player support (multiple characters per user)
-- ============================================================

-- Add active_player_profile_id to profiles to track which character is active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_player_profile_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL;

-- The unique index on player_profiles.user_id was already made partial
-- (WHERE user_id IS NOT NULL) for bots. But we need to REMOVE it entirely
-- so human users can have multiple player_profiles.
DROP INDEX IF EXISTS public.player_profiles_user_id_key;

-- No unique constraint on user_id anymore — multiple players per user allowed
