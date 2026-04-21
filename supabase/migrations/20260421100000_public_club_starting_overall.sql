-- ═══════════════════════════════════════════════════════════
-- Public RPC: average overall of a club's active starting XI.
--
-- The public club page (/club/:id) shows an aggregate team
-- overall to anyone — including anonymous visitors. lineups /
-- lineup_slots remain RLS-protected (club members only), so we
-- expose only the aggregate via SECURITY DEFINER.
--
-- Returns NULL when the club has no active lineup yet (e.g. a
-- freshly-seeded bot club), letting the UI fall back gracefully.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_club_starting_overall(p_club_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ROUND(AVG(pp.overall))::int
  FROM public.lineups l
  JOIN public.lineup_slots ls ON ls.lineup_id = l.id
  JOIN public.player_profiles pp ON pp.id = ls.player_profile_id
  WHERE l.club_id = p_club_id
    AND l.is_active = true
    AND ls.role_type = 'starter';
$$;

GRANT EXECUTE ON FUNCTION public.get_club_starting_overall(UUID) TO anon, authenticated;
