-- ============================================================
-- Stadium Rework v3: levels 1-10, new revenue formula, new sectors
-- ============================================================

-- Allow stadium facility to go up to level 10
ALTER TABLE public.club_facilities DROP CONSTRAINT IF EXISTS club_facilities_level_check;
ALTER TABLE public.club_facilities ADD CONSTRAINT club_facilities_level_check CHECK (level >= 1 AND level <= 10);

-- ─── Update facility stats for stadium (levels 1-10, revenue=0, only cost) ──

DROP FUNCTION IF EXISTS public.get_facility_stats(TEXT, INT);
CREATE OR REPLACE FUNCTION public.get_facility_stats(p_facility_type TEXT, p_level INT)
RETURNS TABLE(weekly_revenue NUMERIC, weekly_cost NUMERIC, training_boost NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  CASE p_facility_type
    WHEN 'souvenir_shop' THEN
      CASE p_level
        WHEN 1 THEN RETURN QUERY SELECT 3000::NUMERIC, 500::NUMERIC, 0::NUMERIC;
        WHEN 2 THEN RETURN QUERY SELECT 6000::NUMERIC, 1000::NUMERIC, 0::NUMERIC;
        WHEN 3 THEN RETURN QUERY SELECT 12000::NUMERIC, 2000::NUMERIC, 0::NUMERIC;
        WHEN 4 THEN RETURN QUERY SELECT 22000::NUMERIC, 4000::NUMERIC, 0::NUMERIC;
        WHEN 5 THEN RETURN QUERY SELECT 40000::NUMERIC, 7000::NUMERIC, 0::NUMERIC;
        ELSE RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END CASE;
    WHEN 'sponsorship' THEN
      CASE p_level
        WHEN 1 THEN RETURN QUERY SELECT 5000::NUMERIC, 800::NUMERIC, 0::NUMERIC;
        WHEN 2 THEN RETURN QUERY SELECT 10000::NUMERIC, 1500::NUMERIC, 0::NUMERIC;
        WHEN 3 THEN RETURN QUERY SELECT 20000::NUMERIC, 3000::NUMERIC, 0::NUMERIC;
        WHEN 4 THEN RETURN QUERY SELECT 38000::NUMERIC, 6000::NUMERIC, 0::NUMERIC;
        WHEN 5 THEN RETURN QUERY SELECT 70000::NUMERIC, 10000::NUMERIC, 0::NUMERIC;
        ELSE RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END CASE;
    WHEN 'training_center' THEN
      CASE p_level
        WHEN 1 THEN RETURN QUERY SELECT 0::NUMERIC, 700::NUMERIC, 5::NUMERIC;
        WHEN 2 THEN RETURN QUERY SELECT 0::NUMERIC, 1500::NUMERIC, 10::NUMERIC;
        WHEN 3 THEN RETURN QUERY SELECT 0::NUMERIC, 3000::NUMERIC, 18::NUMERIC;
        WHEN 4 THEN RETURN QUERY SELECT 0::NUMERIC, 6000::NUMERIC, 28::NUMERIC;
        WHEN 5 THEN RETURN QUERY SELECT 0::NUMERIC, 10000::NUMERIC, 40::NUMERIC;
        ELSE RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END CASE;
    WHEN 'stadium' THEN
      -- Stadium: only maintenance cost, revenue comes from matchday
      CASE p_level
        WHEN 1 THEN RETURN QUERY SELECT 0::NUMERIC, 2000::NUMERIC, 0::NUMERIC;
        WHEN 2 THEN RETURN QUERY SELECT 0::NUMERIC, 3500::NUMERIC, 0::NUMERIC;
        WHEN 3 THEN RETURN QUERY SELECT 0::NUMERIC, 5500::NUMERIC, 0::NUMERIC;
        WHEN 4 THEN RETURN QUERY SELECT 0::NUMERIC, 8000::NUMERIC, 0::NUMERIC;
        WHEN 5 THEN RETURN QUERY SELECT 0::NUMERIC, 12000::NUMERIC, 0::NUMERIC;
        WHEN 6 THEN RETURN QUERY SELECT 0::NUMERIC, 18000::NUMERIC, 0::NUMERIC;
        WHEN 7 THEN RETURN QUERY SELECT 0::NUMERIC, 25000::NUMERIC, 0::NUMERIC;
        WHEN 8 THEN RETURN QUERY SELECT 0::NUMERIC, 35000::NUMERIC, 0::NUMERIC;
        WHEN 9 THEN RETURN QUERY SELECT 0::NUMERIC, 48000::NUMERIC, 0::NUMERIC;
        WHEN 10 THEN RETURN QUERY SELECT 0::NUMERIC, 65000::NUMERIC, 0::NUMERIC;
        ELSE RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END CASE;
    ELSE
      RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
  END CASE;
END;
$$;

-- ─── Update upgrade costs (levels 1-10) ──

DROP FUNCTION IF EXISTS public.get_facility_upgrade_cost(INT);
CREATE OR REPLACE FUNCTION public.get_facility_upgrade_cost(p_current_level INT)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  CASE p_current_level
    WHEN 1 THEN RETURN 50000;
    WHEN 2 THEN RETURN 150000;
    WHEN 3 THEN RETURN 400000;
    WHEN 4 THEN RETURN 1000000;
    WHEN 5 THEN RETURN 2500000;
    WHEN 6 THEN RETURN 5000000;
    WHEN 7 THEN RETURN 10000000;
    WHEN 8 THEN RETURN 20000000;
    WHEN 9 THEN RETURN 50000000;
    ELSE RETURN NULL; -- max level
  END CASE;
END;
$$;

-- ─── New matchday revenue function with price elasticity ──

DROP FUNCTION IF EXISTS public.calculate_matchday_revenue(UUID, INT);
CREATE OR REPLACE FUNCTION public.calculate_matchday_revenue(
  p_club_id UUID,
  p_opponent_reputation INT DEFAULT 20
)
RETURNS TABLE(
  sector_type TEXT,
  sector_label TEXT,
  capacity INT,
  ticket_price INT,
  expected_attendance INT,
  occupancy_pct NUMERIC,
  sector_revenue NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stadium_id UUID;
  v_stadium_quality INT;
  v_club_reputation INT;
  v_base_demand NUMERIC;
BEGIN
  SELECT s.id, s.quality, c.reputation
  INTO v_stadium_id, v_stadium_quality, v_club_reputation
  FROM stadiums s JOIN clubs c ON c.id = s.club_id
  WHERE s.club_id = p_club_id;

  IF v_stadium_id IS NULL THEN RETURN; END IF;

  -- Base demand factor (0.5 to 1.0) based on reputation and quality
  v_base_demand := 0.5 + (v_club_reputation + p_opponent_reputation + v_stadium_quality) / 600.0;
  v_base_demand := LEAST(1.0, v_base_demand);

  RETURN QUERY
  SELECT
    ss.sector_type,
    COALESCE(ss.sector_label, ss.sector_type),
    ss.capacity,
    ss.ticket_price::INT,
    -- Price elasticity: occupancy drops as price increases
    -- price_pct = 0 (cheapest) → full, price_pct = 1 (most expensive) → ~6%
    -- Revenue peaks at ~30% of price range
    LEAST(
      ss.capacity,
      GREATEST(0, FLOOR(
        ss.capacity * v_base_demand * (
          0.06 + 0.94 * POWER(
            GREATEST(0, 1.0 - (ss.ticket_price::NUMERIC - ss.min_price) / GREATEST(1, ss.max_price - ss.min_price)),
            0.8
          )
        )
      ))
    )::INT,
    -- Occupancy %
    ROUND(
      LEAST(100, GREATEST(0,
        v_base_demand * 100 * (
          0.06 + 0.94 * POWER(
            GREATEST(0, 1.0 - (ss.ticket_price::NUMERIC - ss.min_price) / GREATEST(1, ss.max_price - ss.min_price)),
            0.8
          )
        )
      )), 1
    ),
    -- Revenue
    (LEAST(
      ss.capacity,
      GREATEST(0, FLOOR(
        ss.capacity * v_base_demand * (
          0.06 + 0.94 * POWER(
            GREATEST(0, 1.0 - (ss.ticket_price::NUMERIC - ss.min_price) / GREATEST(1, ss.max_price - ss.min_price)),
            0.8
          )
        )
      ))
    ) * ss.ticket_price)::NUMERIC
  FROM stadium_sectors ss
  WHERE ss.stadium_id = v_stadium_id
  ORDER BY ss.capacity DESC;
END;
$$;

-- ─── Recreate sectors for all stadiums (5000 total capacity) ──

DELETE FROM public.stadium_sectors;

INSERT INTO public.stadium_sectors (stadium_id, sector_type, sector_label, capacity, ticket_price, min_price, max_price)
SELECT
  s.id,
  sector.type,
  sector.label,
  sector.cap,
  sector.default_price,
  sector.mn,
  sector.mx
FROM public.stadiums s
CROSS JOIN (
  VALUES
    ('norte',                'Norte (Popular)',       1500,   8,   3,  30),
    ('sul',                  'Sul (Popular)',         1500,   8,   3,  30),
    ('leste',                'Leste (Intermediário)',  800,  15,   6,  50),
    ('oeste',                'Oeste (Intermediário)',  800,  15,   6,  50),
    ('arquibancada_coberta', 'Arquibancada Coberta',   300,  30,  10,  80),
    ('camarote',             'Camarote (Premium)',      100,  60,  25, 200)
) AS sector(type, label, cap, default_price, mn, mx);

-- Update stadium capacity to 5000
UPDATE public.stadiums SET capacity = 5000;
