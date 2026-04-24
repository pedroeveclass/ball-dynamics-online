-- ═══════════════════════════════════════════════════════════
-- Jogos de Várzea (pickup matches)
--
-- Anyone (player role) can create a casual match, pick a kickoff time,
-- and let other humans apply to specific slots on either side. When
-- kickoff arrives, a cron materializes a real `matches` row and fills
-- every empty slot with a bot, then hands off to the existing engine.
--
-- Two permanent shell clubs ("Várzea — Casa" / "Várzea — Visitante")
-- host every pickup match, so `matches.home_club_id` / `away_club_id`
-- stay NOT NULL without touching the engine. No league_id / league_match
-- is ever attached, which is what keeps these matches out of
-- `player_match_stats` (the clean_stats_non_competitive rule already
-- filters them — see 20260421010000_clean_stats_non_competitive.sql).
-- ═══════════════════════════════════════════════════════════

-- ── 1. match_type on `matches` so engine + clients can branch ──
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'league';

COMMENT ON COLUMN public.matches.match_type IS
  'league | challenge | pickup | test — league is the default for pre-existing rows.';

-- ── 2. Shell bot managers + clubs for Várzea ──
DO $$
DECLARE
  v_home_mgr_id UUID;
  v_away_mgr_id UUID;
  v_home_club_id UUID;
  v_away_club_id UUID;
BEGIN
  -- Home side
  SELECT id INTO v_home_club_id FROM public.clubs WHERE name = 'Várzea — Casa';
  IF v_home_club_id IS NULL THEN
    INSERT INTO public.manager_profiles (user_id, full_name, reputation, money, coach_type)
    VALUES (NULL, 'Várzea Casa (Bot)', 20, 0, 'all_around')
    RETURNING id INTO v_home_mgr_id;

    INSERT INTO public.clubs (
      manager_profile_id, name, short_name,
      primary_color, secondary_color, city,
      reputation, status, league_id, is_bot_managed
    ) VALUES (
      v_home_mgr_id, 'Várzea — Casa', 'VAR',
      '#22c55e', '#ffffff', 'Várzea',
      20, 'active', NULL, true
    ) RETURNING id INTO v_home_club_id;
  END IF;

  -- Away side
  SELECT id INTO v_away_club_id FROM public.clubs WHERE name = 'Várzea — Visitante';
  IF v_away_club_id IS NULL THEN
    INSERT INTO public.manager_profiles (user_id, full_name, reputation, money, coach_type)
    VALUES (NULL, 'Várzea Visitante (Bot)', 20, 0, 'all_around')
    RETURNING id INTO v_away_mgr_id;

    INSERT INTO public.clubs (
      manager_profile_id, name, short_name,
      primary_color, secondary_color, city,
      reputation, status, league_id, is_bot_managed
    ) VALUES (
      v_away_mgr_id, 'Várzea — Visitante', 'VAR',
      '#ef4444', '#ffffff', 'Várzea',
      20, 'active', NULL, true
    ) RETURNING id INTO v_away_club_id;
  END IF;
END $$;

-- Helper to resolve the two shell clubs without relying on hardcoded UUIDs.
CREATE OR REPLACE FUNCTION public.pickup_home_club_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clubs WHERE name = 'Várzea — Casa' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pickup_away_club_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clubs WHERE name = 'Várzea — Visitante' LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pickup_home_club_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pickup_away_club_id() TO authenticated, service_role;

-- ── 3. pickup_games ──
CREATE TABLE IF NOT EXISTS public.pickup_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('5v5','11v11')),
  formation TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','materialized','live','finished','cancelled')),
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_games_status_kickoff
  ON public.pickup_games(status, kickoff_at);

CREATE INDEX IF NOT EXISTS idx_pickup_games_created_by
  ON public.pickup_games(created_by_profile_id);

-- ── 4. pickup_game_participants ──
CREATE TABLE IF NOT EXISTS public.pickup_game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_game_id UUID NOT NULL REFERENCES public.pickup_games(id) ON DELETE CASCADE,
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  team_side TEXT NOT NULL CHECK (team_side IN ('home','away')),
  slot_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pickup_game_id, team_side, slot_id),
  UNIQUE (pickup_game_id, player_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_pickup_participants_game
  ON public.pickup_game_participants(pickup_game_id);

CREATE INDEX IF NOT EXISTS idx_pickup_participants_profile
  ON public.pickup_game_participants(player_profile_id);

-- ── 5. RLS ──
ALTER TABLE public.pickup_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_game_participants ENABLE ROW LEVEL SECURITY;

-- Public read (authenticated): everyone sees open/running pickup games.
DROP POLICY IF EXISTS "pickup_games_read" ON public.pickup_games;
CREATE POLICY "pickup_games_read"
  ON public.pickup_games FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pickup_participants_read" ON public.pickup_game_participants;
CREATE POLICY "pickup_participants_read"
  ON public.pickup_game_participants FOR SELECT
  USING (true);

-- No direct INSERT/UPDATE/DELETE — all mutations go through SECURITY DEFINER
-- RPCs (create_pickup_game / join_pickup_game / leave_pickup_game /
-- cancel_pickup_game / materialize_pickup_game). This mirrors the pattern
-- used for training_history, store_purchases, and anywhere else RLS is
-- easier to keep correct by routing through functions.

GRANT SELECT ON public.pickup_games TO authenticated;
GRANT SELECT ON public.pickup_game_participants TO authenticated;
