-- ─────────────────────────────────────────────────────────────
-- Fix: _compute_season_mvp_candidates fails with "function max(uuid)"
-- ─────────────────────────────────────────────────────────────
-- Original used MAX(pms.club_id) for the candidate snapshot, but
-- club_id is a UUID and PostgreSQL has no max(uuid) aggregate.
-- The exception bubbled up to open_season_mvp_poll() and was caught
-- silently by the trigger's EXCEPTION WHEN OTHERS, so no Season MVP
-- poll ever opened.
--
-- Fix: use (array_agg(...))[1] to pick an arbitrary club/position
-- per player. Semantically equivalent to MAX for a non-ordered key.

CREATE OR REPLACE FUNCTION public._compute_season_mvp_candidates(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'avg_rating')::numeric DESC NULLS LAST), '[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT jsonb_build_object(
      'player_profile_id', pms.player_profile_id,
      'avg_rating', ROUND(AVG(pms.rating)::numeric, 2),
      'rating', ROUND(AVG(pms.rating)::numeric, 2),
      'matches', COUNT(*),
      'goals', SUM(pms.goals),
      'assists', SUM(pms.assists),
      'tackles', SUM(pms.tackles),
      'gk_saves', SUM(pms.gk_saves),
      'minutes_played', SUM(pms.minutes_played),
      'club_id', (array_agg(pms.club_id ORDER BY pms.match_id DESC))[1],
      'position', (array_agg(pms.position ORDER BY pms.match_id DESC))[1]
    ) AS c
    FROM public.player_match_stats pms
    WHERE pms.season_id = p_season_id
      AND pms.rating IS NOT NULL
    GROUP BY pms.player_profile_id
    HAVING COUNT(*) >= 3
    ORDER BY AVG(pms.rating) DESC NULLS LAST
    LIMIT 15
  ) sub;

  RETURN COALESCE(v_candidates, '[]'::jsonb);
END;
$$;
