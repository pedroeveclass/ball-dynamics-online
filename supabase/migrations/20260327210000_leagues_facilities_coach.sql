-- ============================================================
-- Migration: Leagues, Facilities, Coach System
-- Date: 2026-03-27
-- Description: Adds league system, club facilities, coach types,
--              and contract termination support
-- ============================================================

-- ─── LEAGUES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'BR',
  division INT NOT NULL DEFAULT 1,
  max_teams INT NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'active',
  -- Default schedule (can be changed by voting)
  match_day_1 TEXT NOT NULL DEFAULT 'wednesday',
  match_day_2 TEXT NOT NULL DEFAULT 'sunday',
  match_time TEXT NOT NULL DEFAULT '21:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, active, finished, rest
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  next_season_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, live, finished
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.league_rounds(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  home_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  away_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  played INT NOT NULL DEFAULT 0,
  won INT NOT NULL DEFAULT 0,
  drawn INT NOT NULL DEFAULT 0,
  lost INT NOT NULL DEFAULT 0,
  goals_for INT NOT NULL DEFAULT 0,
  goals_against INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_id, club_id)
);

CREATE TABLE IF NOT EXISTS public.league_schedule_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  manager_profile_id UUID NOT NULL REFERENCES public.manager_profiles(id) ON DELETE CASCADE,
  preferred_day_1 TEXT NOT NULL DEFAULT 'wednesday',
  preferred_day_2 TEXT NOT NULL DEFAULT 'sunday',
  preferred_time TEXT NOT NULL DEFAULT '21:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id, manager_profile_id)
);

-- ─── CLUB FACILITIES ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  facility_type TEXT NOT NULL, -- 'souvenir_shop', 'sponsorship', 'training_center', 'stadium'
  level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  upgraded_at TIMESTAMPTZ,
  UNIQUE(club_id, facility_type)
);

-- ─── ALTER EXISTING TABLES ──────────────────────────────────

-- Add league reference and bot flag to clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES public.leagues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_bot_managed BOOLEAN NOT NULL DEFAULT false;

-- Add coach type to manager profiles
ALTER TABLE public.manager_profiles
  ADD COLUMN IF NOT EXISTS coach_type TEXT DEFAULT 'all_around';

-- Add termination fields to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination_type TEXT; -- 'fired', 'mutual_agreement'

-- Add mutual agreement request tracking
CREATE TABLE IF NOT EXISTS public.contract_mutual_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL, -- 'club' or 'player'
  requested_by_id UUID NOT NULL, -- manager_profile_id or player_profile_id
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ─── INDEXES ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clubs_league ON public.clubs(league_id);
CREATE INDEX IF NOT EXISTS idx_clubs_bot_managed ON public.clubs(is_bot_managed);
CREATE INDEX IF NOT EXISTS idx_league_standings_season ON public.league_standings(season_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_points ON public.league_standings(season_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_league_rounds_season ON public.league_rounds(season_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_round ON public.league_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_club_facilities_club ON public.club_facilities(club_id);
CREATE INDEX IF NOT EXISTS idx_contract_mutual_club ON public.contract_mutual_agreements(contract_id);

-- ─── RLS POLICIES ───────────────────────────────────────────

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_schedule_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_mutual_agreements ENABLE ROW LEVEL SECURITY;

-- Public read access for league data
CREATE POLICY "Public read leagues" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Public read league_seasons" ON public.league_seasons FOR SELECT USING (true);
CREATE POLICY "Public read league_rounds" ON public.league_rounds FOR SELECT USING (true);
CREATE POLICY "Public read league_matches" ON public.league_matches FOR SELECT USING (true);
CREATE POLICY "Public read league_standings" ON public.league_standings FOR SELECT USING (true);

-- Managers can vote on schedule
CREATE POLICY "Managers can read votes" ON public.league_schedule_votes FOR SELECT USING (true);
CREATE POLICY "Managers can upsert own vote" ON public.league_schedule_votes
  FOR ALL USING (
    manager_profile_id IN (
      SELECT id FROM public.manager_profiles WHERE user_id = auth.uid()
    )
  );

-- Club facilities: public read, manager write
CREATE POLICY "Public read facilities" ON public.club_facilities FOR SELECT USING (true);
CREATE POLICY "Manager can update facilities" ON public.club_facilities
  FOR UPDATE USING (
    club_id IN (
      SELECT c.id FROM public.clubs c
      JOIN public.manager_profiles mp ON c.manager_profile_id = mp.id
      WHERE mp.user_id = auth.uid()
    )
  );

-- Mutual agreements: involved parties can read/write
CREATE POLICY "Read own mutual agreements" ON public.contract_mutual_agreements
  FOR SELECT USING (true);
CREATE POLICY "Create mutual agreements" ON public.contract_mutual_agreements
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Update mutual agreements" ON public.contract_mutual_agreements
  FOR UPDATE USING (true);

-- ─── FACILITY REVENUE/COST HELPER FUNCTION ──────────────────

CREATE OR REPLACE FUNCTION public.get_facility_stats(p_facility_type TEXT, p_level INT)
RETURNS TABLE(weekly_revenue NUMERIC, weekly_cost NUMERIC, training_boost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      CASE p_level
        WHEN 1 THEN RETURN QUERY SELECT 4000::NUMERIC, 2000::NUMERIC, 0::NUMERIC;
        WHEN 2 THEN RETURN QUERY SELECT 8000::NUMERIC, 4000::NUMERIC, 0::NUMERIC;
        WHEN 3 THEN RETURN QUERY SELECT 15000::NUMERIC, 7000::NUMERIC, 0::NUMERIC;
        WHEN 4 THEN RETURN QUERY SELECT 28000::NUMERIC, 12000::NUMERIC, 0::NUMERIC;
        WHEN 5 THEN RETURN QUERY SELECT 50000::NUMERIC, 20000::NUMERIC, 0::NUMERIC;
        ELSE RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END CASE;
    ELSE
      RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
  END CASE;
END;
$$;

-- ─── FACILITY UPGRADE COST FUNCTION ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_facility_upgrade_cost(p_current_level INT)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE p_current_level
    WHEN 1 THEN RETURN 50000;
    WHEN 2 THEN RETURN 150000;
    WHEN 3 THEN RETURN 400000;
    WHEN 4 THEN RETURN 1000000;
    ELSE RETURN NULL; -- max level
  END CASE;
END;
$$;

-- ─── CRON JOBS ──────────────────────────────────────────────

-- League matches: runs at default game times (Wed + Sun at 21h BRT = 00:00 UTC next day)
-- Day 0 = Sunday, Day 3 = Wednesday
SELECT cron.schedule(
  'league-process-rounds',
  '0 0 * * 1,4',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"process_due_rounds"}'::jsonb
    ) AS request_id;
  $$
);

-- Weekly finances: runs every Monday at 03:00 UTC (midnight BRT)
SELECT cron.schedule(
  'weekly-finances',
  '0 3 * * 1',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/weekly-finances',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Apply schedule votes: runs daily at 06:00 UTC to check if majority changed
SELECT cron.schedule(
  'league-apply-votes',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"apply_votes"}'::jsonb
    ) AS request_id;
  $$
);

-- ─── Function to update league cron when schedule changes ───

CREATE OR REPLACE FUNCTION public.update_league_cron_schedule(
  p_day_1 TEXT,
  p_day_2 TEXT,
  p_time TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_day_1 INT;
  cron_day_2 INT;
  cron_hour INT;
  cron_expr TEXT;
BEGIN
  -- Map day names to cron day numbers (0=Sun, 1=Mon, ..., 6=Sat)
  -- We add 3 hours for BRT→UTC offset and use next day if needed
  cron_day_1 := CASE p_day_1
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 3 END;
  cron_day_2 := CASE p_day_2
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 0 END;

  -- Convert BRT time to UTC (BRT = UTC-3)
  cron_hour := CAST(SPLIT_PART(p_time, ':', 1) AS INT) + 3;
  -- If hour overflows to next day, adjust
  IF cron_hour >= 24 THEN
    cron_hour := cron_hour - 24;
    cron_day_1 := (cron_day_1 + 1) % 7;
    cron_day_2 := (cron_day_2 + 1) % 7;
  END IF;

  cron_expr := '0 ' || cron_hour || ' * * ' || cron_day_1 || ',' || cron_day_2;

  -- Update the cron job
  PERFORM cron.unschedule('league-process-rounds');
  PERFORM cron.schedule(
    'league-process-rounds',
    cron_expr,
    $$
      SELECT net.http_post(
        url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{"action":"process_due_rounds"}'::jsonb
      ) AS request_id;
    $$
  );
END;
$$;
