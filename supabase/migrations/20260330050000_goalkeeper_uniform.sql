-- ============================================================
-- Add goalkeeper uniform (uniform_number = 3)
-- ============================================================

-- Expand CHECK constraint to allow 3
ALTER TABLE public.club_uniforms DROP CONSTRAINT IF EXISTS club_uniforms_uniform_number_check;
ALTER TABLE public.club_uniforms ADD CONSTRAINT club_uniforms_uniform_number_check CHECK (uniform_number IN (1, 2, 3));

-- Create GK uniform for all clubs that don't have one yet
INSERT INTO public.club_uniforms (club_id, uniform_number, shirt_color, number_color, pattern, stripe_color)
SELECT c.id, 3, '#111111', '#FFFFFF', 'solid', '#FFFFFF'
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM club_uniforms cu WHERE cu.club_id = c.id AND cu.uniform_number = 3
);
