-- ============================================================
-- SEED: Replace old stadium sectors with new 6-sector system
-- Run AFTER the migration 20260327230000_stadium_sectors_v2.sql
-- ============================================================

-- Delete all old sectors
DELETE FROM public.stadium_sectors;

-- Insert new sectors for every stadium
INSERT INTO public.stadium_sectors (stadium_id, sector_type, sector_label, capacity, ticket_price, min_price, max_price)
SELECT
  s.id,
  sector.type,
  sector.label,
  sector.capacity,
  sector.default_price,
  sector.min_price,
  sector.max_price
FROM public.stadiums s
CROSS JOIN (
  VALUES
    ('norte',                'Norte (Popular)',       2000,  15,   5,  80),
    ('sul',                  'Sul (Popular)',         2000,  15,   5,  80),
    ('leste',                'Leste (Intermediário)', 1500,  35,  10, 150),
    ('oeste',                'Oeste (Intermediário)', 1500,  35,  10, 150),
    ('arquibancada_coberta', 'Arquibancada Coberta',   800,  60,  20, 250),
    ('camarote',             'Camarote (Premium)',      200, 150,  50, 500)
) AS sector(type, label, capacity, default_price, min_price, max_price);

-- Update stadium total capacity to match sum of sectors (8000)
UPDATE public.stadiums SET capacity = 8000;
