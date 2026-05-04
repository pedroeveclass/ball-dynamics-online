-- Reset + replay standings for a season from finished league matches.
-- Engine calls this whenever a round closes, so any silent failure of the
-- per-match inline standings updates (3 paths in match-engine-lab,
-- including the bot-only fetch to league-scheduler) self-heals at round end.

CREATE OR REPLACE FUNCTION public.recalculate_season_standings(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.league_standings
     SET played = 0, won = 0, drawn = 0, lost = 0,
         goals_for = 0, goals_against = 0, points = 0,
         updated_at = now()
   WHERE season_id = p_season_id;

  WITH finished AS (
    SELECT m.home_club_id, m.away_club_id,
           COALESCE(m.home_score, 0) AS hs,
           COALESCE(m.away_score, 0) AS as_
      FROM public.league_matches lm
      JOIN public.matches m ON m.id = lm.match_id
      JOIN public.league_rounds lr ON lr.id = lm.round_id
     WHERE lr.season_id = p_season_id
       AND m.status = 'finished'
  ),
  per_club AS (
    SELECT home_club_id AS club_id, hs AS gf, as_ AS ga,
           (hs > as_) AS won, (hs = as_) AS drawn, (hs < as_) AS lost
      FROM finished
    UNION ALL
    SELECT away_club_id, as_, hs,
           (as_ > hs), (hs = as_), (as_ < hs)
      FROM finished
  ),
  agg AS (
    SELECT club_id,
           count(*)::int AS played,
           sum(CASE WHEN won THEN 1 ELSE 0 END)::int AS won,
           sum(CASE WHEN drawn THEN 1 ELSE 0 END)::int AS drawn,
           sum(CASE WHEN lost THEN 1 ELSE 0 END)::int AS lost,
           sum(gf)::int AS goals_for,
           sum(ga)::int AS goals_against,
           sum(CASE WHEN won THEN 3 WHEN drawn THEN 1 ELSE 0 END)::int AS points
      FROM per_club
     GROUP BY club_id
  )
  UPDATE public.league_standings ls
     SET played = agg.played,
         won = agg.won,
         drawn = agg.drawn,
         lost = agg.lost,
         goals_for = agg.goals_for,
         goals_against = agg.goals_against,
         points = agg.points,
         updated_at = now()
    FROM agg
   WHERE ls.season_id = p_season_id
     AND ls.club_id = agg.club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_season_standings(uuid) TO authenticated, service_role;
