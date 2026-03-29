-- ============================================================
-- Migration: Lineup tactical roles (captain, set piece takers)
-- ============================================================

ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS captain_player_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_kick_taker_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corner_right_taker_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corner_left_taker_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS throw_in_right_taker_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS throw_in_left_taker_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL;
