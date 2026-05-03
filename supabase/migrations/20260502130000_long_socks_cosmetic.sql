-- Seed the "Meião Comprido" cosmetic if it doesn't already exist. The
-- avatar uses its active state (no color, no side) to switch the sock
-- render from the short ankle band to a tall sock that reaches up to where
-- the shin guard sits. Idempotent: safe to re-run.

INSERT INTO public.store_items (category, name, name_pt, name_en, description, description_pt, description_en, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Meião Comprido', 'Meião Comprido', 'Long Socks',
       'Estilo profissional', 'Estilo profissional', 'Pro look',
       4000, NULL, NULL, 'permanent', NULL, NULL, true, 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Meião Comprido', 'Long Socks')
);
