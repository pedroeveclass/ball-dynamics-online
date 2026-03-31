-- ============================================================
-- Add pattern and stripe_color to club_uniforms
-- Patterns: solid, stripe_vertical, stripe_diagonal,
--           stripe_double_vertical, stripe_triple_vertical
-- ============================================================

ALTER TABLE public.club_uniforms
  ADD COLUMN IF NOT EXISTS pattern TEXT NOT NULL DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS stripe_color TEXT NOT NULL DEFAULT '#FFFFFF';
