-- ═══════════════════════════════════════════════════════════
-- forum_categories: dual-language name + description.
-- Same pattern as store_items: name_pt/name_en + description_pt/en.
-- Legacy `name`/`description` columns remain as fallback.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.forum_categories
  ADD COLUMN IF NOT EXISTS name_pt TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS description_pt TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

UPDATE public.forum_categories SET name_pt = name WHERE name_pt IS NULL;
UPDATE public.forum_categories SET description_pt = description WHERE description_pt IS NULL;

UPDATE public.forum_categories SET name_en = CASE slug
  WHEN 'geral'          THEN 'General'
  WHEN 'taticas'        THEN 'Tactics'
  WHEN 'transferencias' THEN 'Transfers'
  WHEN 'sugestoes'      THEN 'Suggestions'
  WHEN 'bugs'           THEN 'Bugs'
  WHEN 'off-topic'      THEN 'Off-topic'
  ELSE name
END WHERE name_en IS NULL;

UPDATE public.forum_categories SET description_en = CASE slug
  WHEN 'geral'          THEN 'General discussion about the game'
  WHEN 'taticas'        THEN 'Strategies, formations and gameplay tips'
  WHEN 'transferencias' THEN 'Transfer market and negotiations'
  WHEN 'sugestoes'      THEN 'Ideas and suggestions for the game'
  WHEN 'bugs'           THEN 'Report bugs and technical issues'
  WHEN 'off-topic'      THEN 'Anything outside the FID universe'
  ELSE description
END WHERE description_en IS NULL;

ALTER TABLE public.forum_categories
  ALTER COLUMN name_pt SET NOT NULL,
  ALTER COLUMN name_en SET NOT NULL;
