-- ============================================================
-- Migration: Club Uniforms (Home + Away kits)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.club_uniforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  uniform_number INT NOT NULL CHECK (uniform_number IN (1, 2)),
  shirt_color TEXT NOT NULL,
  number_color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, uniform_number)
);

CREATE INDEX IF NOT EXISTS idx_club_uniforms_club ON public.club_uniforms(club_id);

-- Add uniform choice to matches (which uniform each team is wearing)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_uniform INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS away_uniform INT NOT NULL DEFAULT 2;

-- RLS
ALTER TABLE public.club_uniforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read uniforms" ON public.club_uniforms FOR SELECT USING (true);

CREATE POLICY "Manager can update own uniforms" ON public.club_uniforms
  FOR UPDATE USING (
    club_id IN (
      SELECT c.id FROM public.clubs c
      JOIN public.manager_profiles mp ON c.manager_profile_id = mp.id
      WHERE mp.user_id = auth.uid()
    )
  );

-- Seed default uniforms for all existing clubs
-- Uniform 1 (home): club primary_color shirt, secondary_color numbers
-- Uniform 2 (away): white shirt, primary_color numbers
INSERT INTO public.club_uniforms (club_id, uniform_number, shirt_color, number_color)
SELECT c.id, 1, c.primary_color, c.secondary_color
FROM public.clubs c
ON CONFLICT (club_id, uniform_number) DO NOTHING;

INSERT INTO public.club_uniforms (club_id, uniform_number, shirt_color, number_color)
SELECT c.id, 2, '#FFFFFF', c.primary_color
FROM public.clubs c
ON CONFLICT (club_id, uniform_number) DO NOTHING;
