-- ═══════════════════════════════════════════════════════════
-- Club position demand: technical boards signal which positions
-- they are actively trying to sign. Surfaces in the onboarding
-- field-selector as "K clubes procurando" so new players can choose
-- understaffed / in-demand positions on purpose.
--
-- v1 scope:
--   • Human-managed clubs only. Bot clubs do NOT express demand here —
--     if signal turns out too thin we can auto-populate based on
--     roster gaps, but that is deliberately out of scope for now.
--   • Toggle model (row exists ↔ position is "wanted"). No priority
--     tiers yet — column is reserved for future use.
--
-- Surface:
--   • toggle_club_position_demand(pos)  — flip for caller's club.
--   • get_my_club_demand()              — list active demand for caller.
--   • get_position_demand_counts()      — aggregate, 16 rows, for onboarding.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE public.club_position_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN (
    'GK','CB','LB','RB','LWB','RWB',
    'DM','CDM','CM','LM','RM','CAM',
    'LW','RW','CF','ST'
  )),
  priority INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, position)
);

CREATE INDEX idx_club_pos_demand_position ON public.club_position_demand(position);
CREATE INDEX idx_club_pos_demand_club ON public.club_position_demand(club_id);

ALTER TABLE public.club_position_demand ENABLE ROW LEVEL SECURITY;

-- Managers can read their own demand rows (bulk aggregates go through
-- the SECURITY DEFINER function below; direct reads are never used for
-- other clubs' demand).
CREATE POLICY "Managers view own demand"
  ON public.club_position_demand
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM clubs c
    JOIN manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE c.id = club_position_demand.club_id AND mp.user_id = auth.uid()
  ));

-- All writes go through RPCs (no direct INSERT/UPDATE/DELETE).

-- Toggle demand for caller's club. Returns TRUE if the position is now
-- in demand, FALSE if it was removed.
CREATE OR REPLACE FUNCTION public.toggle_club_position_demand(p_position TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_now_active BOOLEAN;
BEGIN
  IF p_position NOT IN ('GK','CB','LB','RB','LWB','RWB','DM','CDM','CM','LM','RM','CAM','LW','RW','CF','ST') THEN
    RAISE EXCEPTION 'Invalid position';
  END IF;

  SELECT c.id INTO v_club_id
  FROM clubs c
  JOIN manager_profiles mp ON mp.id = c.manager_profile_id
  WHERE mp.user_id = auth.uid()
  LIMIT 1;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No club found for this user';
  END IF;

  IF EXISTS (SELECT 1 FROM club_position_demand WHERE club_id = v_club_id AND position = p_position) THEN
    DELETE FROM club_position_demand WHERE club_id = v_club_id AND position = p_position;
    v_now_active := FALSE;
  ELSE
    INSERT INTO club_position_demand (club_id, position) VALUES (v_club_id, p_position);
    v_now_active := TRUE;
  END IF;

  RETURN v_now_active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_club_position_demand(TEXT) TO authenticated;

-- List current demand for caller's club.
CREATE OR REPLACE FUNCTION public.get_my_club_demand()
RETURNS TABLE (pos TEXT, priority INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.position AS pos, d.priority
  FROM club_position_demand d
  JOIN clubs c ON c.id = d.club_id
  JOIN manager_profiles mp ON mp.id = c.manager_profile_id
  WHERE mp.user_id = auth.uid()
  ORDER BY d.position;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_club_demand() TO authenticated;

-- Aggregate for the onboarding field-selector. All 16 positions, with
-- 0 when no club is asking.
CREATE OR REPLACE FUNCTION public.get_position_demand_counts()
RETURNS TABLE (pos TEXT, demand_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.pos, COALESCE(c.cnt, 0)::INT AS demand_count
  FROM (VALUES
    ('GK'),('CB'),('LB'),('RB'),('LWB'),('RWB'),
    ('DM'),('CDM'),('CM'),('LM'),('RM'),('CAM'),
    ('LW'),('RW'),('CF'),('ST')
  ) AS p(pos)
  LEFT JOIN (
    SELECT position, count(*)::INT AS cnt
    FROM club_position_demand
    GROUP BY position
  ) c ON c.position = p.pos
  ORDER BY p.pos;
$$;

GRANT EXECUTE ON FUNCTION public.get_position_demand_counts() TO authenticated, anon;
