-- Match availability (presence check-in) — informative only.
-- Players toggle whether they intend to attend an upcoming league fixture.
-- The engine/lineup take NO action based on this; it's visible to the coach
-- so they know who confirmed. Absence of a row means "not confirmed".
--
-- Keyed on `league_match_id` (not `match_id`) because the row in `matches`
-- isn't materialized until ~5 min before kickoff, while `league_matches`
-- exists as soon as the calendar is built — so players can mark days ahead.

CREATE TABLE IF NOT EXISTS public.match_availability (
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  league_match_id UUID NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_profile_id, league_match_id)
);

CREATE INDEX IF NOT EXISTS idx_match_availability_league_match
  ON public.match_availability(league_match_id);

ALTER TABLE public.match_availability ENABLE ROW LEVEL SECURITY;

-- Player writes (insert/delete) their own availability row.
CREATE POLICY "match_availability_player_insert"
  ON public.match_availability FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.player_profiles
            WHERE id = player_profile_id AND user_id = auth.uid())
  );

CREATE POLICY "match_availability_player_delete"
  ON public.match_availability FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.player_profiles
            WHERE id = player_profile_id AND user_id = auth.uid())
  );

-- Public read so coaches can see the squad's confirmations and players can
-- see their own status. Matches the pattern used by player_suspensions.
CREATE POLICY "match_availability_read"
  ON public.match_availability FOR SELECT
  USING (true);
