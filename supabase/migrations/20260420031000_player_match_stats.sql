-- Per-match aggregated stats per player, populated by the match engine on
-- finalization (see match-engine-lab `persistMatchPlayerStats`) and read by
-- CareerStatsBlock (position-specific extras on PlayerProfilePage /
-- PublicPlayerPage).
--
-- Source of truth is still `match_event_logs`; this table is a materialized
-- cache indexed for fast SUM() queries per player / per season / per club.

CREATE TABLE IF NOT EXISTS public.player_match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.match_participants(id) ON DELETE SET NULL,
  club_id UUID,
  season_id UUID,
  position TEXT,
  minutes_played INT NOT NULL DEFAULT 0,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  shots INT NOT NULL DEFAULT 0,
  shots_on_target INT NOT NULL DEFAULT 0,
  passes_completed INT NOT NULL DEFAULT 0,
  passes_attempted INT NOT NULL DEFAULT 0,
  tackles INT NOT NULL DEFAULT 0,
  interceptions INT NOT NULL DEFAULT 0,
  fouls_committed INT NOT NULL DEFAULT 0,
  offsides INT NOT NULL DEFAULT 0,
  yellow_cards INT NOT NULL DEFAULT 0,
  red_cards INT NOT NULL DEFAULT 0,
  gk_saves INT NOT NULL DEFAULT 0,
  gk_penalties_saved INT NOT NULL DEFAULT 0,
  goals_conceded INT NOT NULL DEFAULT 0,
  clean_sheet BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_match_stats_unique UNIQUE (match_id, participant_id)
);

CREATE INDEX IF NOT EXISTS player_match_stats_profile_season_idx
  ON public.player_match_stats (player_profile_id, season_id);

CREATE INDEX IF NOT EXISTS player_match_stats_club_season_idx
  ON public.player_match_stats (club_id, season_id);

CREATE INDEX IF NOT EXISTS player_match_stats_profile_idx
  ON public.player_match_stats (player_profile_id);

-- RLS mirroring player_discipline: public read, service-role write.
ALTER TABLE public.player_match_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_match_stats_read" ON public.player_match_stats;
CREATE POLICY "player_match_stats_read"
  ON public.player_match_stats FOR SELECT
  USING (true);
