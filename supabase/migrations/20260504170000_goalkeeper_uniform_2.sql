-- ============================================================
-- Add a second goalkeeper uniform (uniform_number = 4 → "GK away")
--
-- Mirrors the home/away split outfield kits already have. Variant
-- 1 of the player profile uses uniform 3 (home GK), variant 2 uses
-- uniform 4 (away GK). Defaulting to bright yellow because GK kits
-- traditionally contrast with both teams' outfield kits.
-- ============================================================

-- Expand CHECK to allow 4
ALTER TABLE public.club_uniforms DROP CONSTRAINT IF EXISTS club_uniforms_uniform_number_check;
ALTER TABLE public.club_uniforms ADD CONSTRAINT club_uniforms_uniform_number_check CHECK (uniform_number IN (1, 2, 3, 4));

-- Seed uniform 4 for every existing club that doesn't have it yet
INSERT INTO public.club_uniforms (club_id, uniform_number, shirt_color, number_color, pattern, stripe_color)
SELECT c.id, 4, '#FFD600', '#000000', 'solid', '#000000'
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM club_uniforms cu WHERE cu.club_id = c.id AND cu.uniform_number = 4
);
