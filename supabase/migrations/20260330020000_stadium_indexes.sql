-- ============================================================
-- Global index optimization for all frequently queried tables
-- Prevents timeouts and speeds up match engine + UI queries
-- ============================================================

-- ── Stadium tables (fix timeout on calculate_matchday_revenue) ──
CREATE INDEX IF NOT EXISTS idx_stadiums_club_id ON public.stadiums(club_id);
CREATE INDEX IF NOT EXISTS idx_stadium_sectors_stadium_id ON public.stadium_sectors(stadium_id);

-- ── Clubs ──
CREATE INDEX IF NOT EXISTS idx_clubs_manager_profile_id ON public.clubs(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_clubs_league_id ON public.clubs(league_id);
CREATE INDEX IF NOT EXISTS idx_clubs_is_bot_managed ON public.clubs(is_bot_managed);

-- ── Match participants (CRITICAL - queried 30+ times per turn) ──
CREATE INDEX IF NOT EXISTS idx_match_participants_match_id_role_type ON public.match_participants(match_id, role_type);
CREATE INDEX IF NOT EXISTS idx_match_participants_match_id_club_id ON public.match_participants(match_id, club_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_player_profile_id ON public.match_participants(player_profile_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_club_id ON public.match_participants(club_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_connected_user_id ON public.match_participants(connected_user_id);

-- ── Match actions (CRITICAL - queried 10+ times per turn) ──
CREATE INDEX IF NOT EXISTS idx_match_actions_match_turn_id_status ON public.match_actions(match_turn_id, status);
CREATE INDEX IF NOT EXISTS idx_match_actions_match_id ON public.match_actions(match_id);

-- ── Match turns (HIGH - queried every phase transition) ──
CREATE INDEX IF NOT EXISTS idx_match_turns_match_id_status ON public.match_turns(match_id, status);
CREATE INDEX IF NOT EXISTS idx_match_turns_match_id_turn_number ON public.match_turns(match_id, turn_number);

-- ── Match event logs ──
CREATE INDEX IF NOT EXISTS idx_match_event_logs_match_id ON public.match_event_logs(match_id);
CREATE INDEX IF NOT EXISTS idx_match_event_logs_match_id_event_type ON public.match_event_logs(match_id, event_type);

-- ── Contracts ──
CREATE INDEX IF NOT EXISTS idx_contracts_club_id_status ON public.contracts(club_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_player_profile_id ON public.contracts(player_profile_id);

-- ── Lineups ──
CREATE INDEX IF NOT EXISTS idx_lineups_club_id_is_active ON public.lineups(club_id, is_active);

-- ── Lineup slots ──
CREATE INDEX IF NOT EXISTS idx_lineup_slots_lineup_id ON public.lineup_slots(lineup_id);
CREATE INDEX IF NOT EXISTS idx_lineup_slots_player_profile_id ON public.lineup_slots(player_profile_id);

-- ── Player profiles ──
CREATE INDEX IF NOT EXISTS idx_player_profiles_club_id ON public.player_profiles(club_id);
CREATE INDEX IF NOT EXISTS idx_player_profiles_user_id ON public.player_profiles(user_id);
