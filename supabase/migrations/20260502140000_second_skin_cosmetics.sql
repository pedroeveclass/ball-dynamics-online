-- Seeds the "Segunda Pele" cosmetics (compression top + tights). Each one
-- takes a single picked color that the avatar paints over the visible skin
-- areas of the arms (top) or legs (tights). Hand and feet stay bare so the
-- silhouette doesn't change. Idempotent — safe to re-run.

INSERT INTO public.store_items (category, name, name_pt, name_en, description, description_pt, description_en, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Camiseta Segunda Pele', 'Camiseta Segunda Pele', 'Compression Top',
       'Camada extra nos braços', 'Camada extra nos braços', 'Extra layer on the arms',
       5000, NULL, NULL, 'permanent', NULL, NULL, true, 16
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Camiseta Segunda Pele', 'Compression Top')
);

INSERT INTO public.store_items (category, name, name_pt, name_en, description, description_pt, description_en, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Calça Segunda Pele', 'Calça Segunda Pele', 'Compression Tights',
       'Camada extra nas pernas', 'Camada extra nas pernas', 'Extra layer on the legs',
       5000, NULL, NULL, 'permanent', NULL, NULL, true, 17
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Calça Segunda Pele', 'Compression Tights')
);

-- Pull "Faixa de Cabelo" off the shelf — the avatar can't render the
-- headband over the DiceBear-generated hair yet, so listing it would let
-- players pay for nothing visible.
UPDATE public.store_items
SET is_available = false
WHERE name IN ('Faixa de Cabelo', 'Headband');
