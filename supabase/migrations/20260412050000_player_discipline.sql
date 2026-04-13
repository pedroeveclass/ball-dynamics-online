-- Player discipline: accumulate yellow cards across league season and track
-- remaining match suspensions (3 yellow accumulated = 1 match; red = 1 match).
-- Applied at match end by the engine (see match-engine-lab `finalize_match` flow).

CREATE TABLE IF NOT EXISTS public.player_discipline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  yellow_cards_accumulated INTEGER NOT NULL DEFAULT 0,
  red_cards_accumulated INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_discipline_unique UNIQUE (player_profile_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_player_discipline_player
  ON public.player_discipline(player_profile_id);

CREATE INDEX IF NOT EXISTS idx_player_discipline_season
  ON public.player_discipline(season_id);

CREATE TABLE IF NOT EXISTS public.player_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_id UUID REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  source_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  source_reason TEXT NOT NULL CHECK (source_reason IN ('yellow_accumulation', 'red_card')),
  matches_remaining INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_suspensions_active
  ON public.player_suspensions(player_profile_id, season_id)
  WHERE matches_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_player_suspensions_player
  ON public.player_suspensions(player_profile_id);

ALTER TABLE public.player_discipline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_suspensions ENABLE ROW LEVEL SECURITY;

-- Public read, service-role write (engine runs as service role).
CREATE POLICY "player_discipline_read"
  ON public.player_discipline FOR SELECT
  USING (true);

CREATE POLICY "player_suspensions_read"
  ON public.player_suspensions FOR SELECT
  USING (true);
