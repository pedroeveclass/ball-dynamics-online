-- ═══════════════════════════════════════════════════════════
-- Human counts per primary_position.
--
-- Powers the visual field-selector in onboarding: new users see
-- how many HUMAN players already exist in each of the 16 positions
-- so they can choose understaffed spots on purpose.
--
-- Rules (from design):
--   • Only primary_position counts (secondary does not).
--   • Free agents (club_id NULL) DO count.
--   • Bots are excluded — bots are player_profiles rows with
--     user_id IS NULL (see 20260329050000_fill_old_clubs_with_bots.sql).
--   • All 16 positions appear in the result, even with count 0.
--
-- RLS on player_profiles restricts SELECT to the user's own profile,
-- so this aggregate lives in a SECURITY DEFINER function.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_human_counts_by_position()
RETURNS TABLE (pos TEXT, human_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.pos, COALESCE(c.cnt, 0)::INT AS human_count
  FROM (VALUES
    ('GK'),('CB'),('LB'),('RB'),('LWB'),('RWB'),
    ('DM'),('CDM'),('CM'),('LM'),('RM'),('CAM'),
    ('LW'),('RW'),('CF'),('ST')
  ) AS p(pos)
  LEFT JOIN (
    SELECT primary_position, count(*)::INT AS cnt
    FROM player_profiles
    WHERE user_id IS NOT NULL
    GROUP BY primary_position
  ) c ON c.primary_position = p.pos
  ORDER BY p.pos;
$$;

GRANT EXECUTE ON FUNCTION public.get_human_counts_by_position() TO authenticated, anon;
