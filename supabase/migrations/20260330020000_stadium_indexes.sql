-- ============================================================
-- Fix: Add indexes for stadium queries that were timing out
-- The calculate_matchday_revenue RPC joins stadiums + clubs + stadium_sectors
-- Without indexes on the FK columns, these JOINs do full table scans.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_stadiums_club_id ON public.stadiums(club_id);
CREATE INDEX IF NOT EXISTS idx_stadium_sectors_stadium_id ON public.stadium_sectors(stadium_id);
CREATE INDEX IF NOT EXISTS idx_clubs_manager_profile_id ON public.clubs(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_clubs_league_id ON public.clubs(league_id);
CREATE INDEX IF NOT EXISTS idx_clubs_is_bot_managed ON public.clubs(is_bot_managed);
