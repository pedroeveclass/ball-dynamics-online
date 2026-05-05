-- ============================================================
-- Manguito: single-arm sleeve cosmetic from shoulder to wrist.
-- Picks color at purchase + side (left/right) at equip — exactly
-- the same flow as Munhequeira / Biceps Band, so no new RPC params
-- are needed. Buyers who want the look on both arms buy twice.
-- ============================================================

INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Manguito', 'Manguito', 'Arm Sleeve',
       'Manguito de compressão (1 braço, ombro até o pulso)',
       'Manguito de compressão (1 braço, ombro até o pulso)',
       'Compression arm sleeve (one arm, shoulder to wrist)',
       3500, NULL, NULL, 'permanent', NULL, NULL, true, 42
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Manguito', 'Arm Sleeve')
);
