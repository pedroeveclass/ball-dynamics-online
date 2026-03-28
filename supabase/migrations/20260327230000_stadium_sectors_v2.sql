-- ============================================================
-- Migration: Stadium Sectors v2
-- Replaces old 3-sector system with 6 realistic sectors
-- Adds ticket_price editability and match-day revenue support
-- ============================================================

-- Add suggested price range columns to stadium_sectors
ALTER TABLE public.stadium_sectors
  ADD COLUMN IF NOT EXISTS min_price NUMERIC NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_price NUMERIC NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS sector_label TEXT;

-- Allow managers to update their stadium sectors (ticket prices)
CREATE POLICY "Manager can update own stadium sectors"
ON public.stadium_sectors
FOR UPDATE
USING (
  stadium_id IN (
    SELECT s.id FROM public.stadiums s
    JOIN public.clubs c ON c.id = s.club_id
    JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE mp.user_id = auth.uid()
  )
);

-- Public read for stadium_sectors
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stadium_sectors' AND policyname = 'Public read stadium_sectors'
  ) THEN
    CREATE POLICY "Public read stadium_sectors" ON public.stadium_sectors FOR SELECT USING (true);
  END IF;
END $$;

-- ─── Match-day revenue calculation function ─────────────────
-- Given a club's stadium, reputation, and opponent reputation,
-- calculates expected attendance and revenue per sector.

CREATE OR REPLACE FUNCTION public.calculate_matchday_revenue(
  p_club_id UUID,
  p_opponent_reputation INT DEFAULT 20
)
RETURNS TABLE(
  sector_type TEXT,
  sector_label TEXT,
  capacity INT,
  ticket_price NUMERIC,
  expected_attendance INT,
  occupancy_pct NUMERIC,
  sector_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stadium_id UUID;
  v_stadium_quality INT;
  v_club_reputation INT;
  v_demand_factor NUMERIC;
BEGIN
  -- Get stadium and club data
  SELECT s.id, s.quality, c.reputation
  INTO v_stadium_id, v_stadium_quality, v_club_reputation
  FROM stadiums s
  JOIN clubs c ON c.id = s.club_id
  WHERE s.club_id = p_club_id;

  IF v_stadium_id IS NULL THEN
    RETURN;
  END IF;

  -- Base demand: average of club reputation, opponent reputation, and stadium quality
  -- Normalized to 0-1 range (attributes are 0-100)
  v_demand_factor := (v_club_reputation + p_opponent_reputation + v_stadium_quality) / 300.0;

  RETURN QUERY
  SELECT
    ss.sector_type,
    COALESCE(ss.sector_label, ss.sector_type) AS sector_label,
    ss.capacity,
    ss.ticket_price,
    -- Attendance calculation:
    -- Higher price relative to quality = lower occupancy
    -- price_ratio: how expensive is the ticket relative to what fans expect
    LEAST(
      ss.capacity,
      GREATEST(
        0,
        FLOOR(
          ss.capacity * v_demand_factor *
          GREATEST(0.1, 1.0 - (ss.ticket_price / (GREATEST(v_stadium_quality, 10) * 5.0)) + 0.5)
        )
      )
    )::INT AS expected_attendance,
    -- Occupancy percentage
    ROUND(
      LEAST(
        100,
        GREATEST(
          0,
          v_demand_factor * 100 *
          GREATEST(0.1, 1.0 - (ss.ticket_price / (GREATEST(v_stadium_quality, 10) * 5.0)) + 0.5)
        )
      ),
      1
    ) AS occupancy_pct,
    -- Revenue
    LEAST(
      ss.capacity,
      GREATEST(
        0,
        FLOOR(
          ss.capacity * v_demand_factor *
          GREATEST(0.1, 1.0 - (ss.ticket_price / (GREATEST(v_stadium_quality, 10) * 5.0)) + 0.5)
        )
      )
    ) * ss.ticket_price AS sector_revenue
  FROM stadium_sectors ss
  WHERE ss.stadium_id = v_stadium_id
  ORDER BY ss.capacity DESC;
END;
$$;
