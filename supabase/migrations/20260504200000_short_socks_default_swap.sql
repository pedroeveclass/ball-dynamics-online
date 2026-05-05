-- ============================================================
-- Flip the sock default: meião alto is now the baseline (free)
-- and meião baixo (short) becomes the purchasable cosmetic.
--
-- Existing "Meião Comprido" purchases keep their rows so we
-- don't lose history, but the item is delisted from the catalog
-- (is_available=false) — it no longer affects the rendered sock
-- since alto is now the default. Pedro can decide later whether
-- to refund those buyers via a separate UPDATE on store_purchases.
-- ============================================================

-- Disable the legacy long-socks item so it stops appearing in the store.
UPDATE public.store_items
SET is_available = false
WHERE name IN ('Meião Comprido', 'Long Socks');

-- Add the new short-socks item.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Meião Curto', 'Meião Curto', 'Short Socks',
       'Meião curto que vai só até o tornozelo',
       'Meião curto que vai só até o tornozelo',
       'Short ankle-height socks',
       3500, NULL, NULL, 'permanent', NULL, NULL, true, 41
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Meião Curto', 'Short Socks')
);
