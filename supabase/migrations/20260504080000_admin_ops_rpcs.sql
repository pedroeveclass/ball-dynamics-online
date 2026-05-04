-- ─────────────────────────────────────────────────────────────
-- Admin operations panel — single-purpose SECURITY DEFINER RPCs
-- ─────────────────────────────────────────────────────────────
-- Each RPC checks is_admin() before doing anything. They wrap the
-- existing pipeline so /admin can fire the same flows we've been
-- running by hand via SQL/edge functions throughout the session.
--
-- Naming: all start with `admin_` and end with the verb. Returns
-- a JSONB summary so the UI can render a friendly toast.

-- ── Liga / Temporada ────────────────────────────────────────

-- Force-finish ALL seasons at the current game year (max season_number).
-- Triggers the pétreo cascade automatically.
CREATE OR REPLACE FUNCTION public.admin_force_finish_current_season()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT;
  v_count INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT MAX(season_number) INTO v_year
    FROM public.league_seasons WHERE status IN ('active', 'scheduled');
  IF v_year IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_open_season');
  END IF;

  UPDATE public.league_seasons
     SET status = 'finished',
         finished_at = NOW(),
         next_season_at = NOW() + INTERVAL '14 days'
   WHERE season_number = v_year
     AND status <> 'finished';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'game_year', v_year, 'seasons_finished', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_finish_current_season() TO authenticated;

-- Bump every round of a season forward (or backward) by N days.
CREATE OR REPLACE FUNCTION public.admin_bump_round_dates(p_season_id UUID, p_delta_days INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_delta_days IS NULL OR p_delta_days = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_delta');
  END IF;

  UPDATE public.league_rounds
     SET scheduled_at = scheduled_at + (p_delta_days || ' days')::INTERVAL
   WHERE season_id = p_season_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'rounds_shifted', v_count, 'delta_days', p_delta_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bump_round_dates(UUID, INT) TO authenticated;

-- Cascade league_rounds → 'finished' for a given season (defensive
-- when a manual flow leaves rounds open).
CREATE OR REPLACE FUNCTION public.admin_cascade_finish_rounds(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.league_rounds
     SET status = 'finished'
   WHERE season_id = p_season_id AND status <> 'finished';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'rounds_marked', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cascade_finish_rounds(UUID) TO authenticated;

-- ── Liga (CRUD) ─────────────────────────────────────────────

-- Delete an empty league (0 clubs, 0 seasons). Safety-checked.
CREATE OR REPLACE FUNCTION public.admin_delete_empty_league(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clubs INT;
  v_seasons INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT COUNT(*) INTO v_clubs FROM public.clubs WHERE league_id = p_league_id;
  SELECT COUNT(*) INTO v_seasons FROM public.league_seasons WHERE league_id = p_league_id;

  IF v_clubs > 0 OR v_seasons > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_empty', 'clubs', v_clubs, 'seasons', v_seasons);
  END IF;

  DELETE FROM public.leagues WHERE id = p_league_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_empty_league(UUID) TO authenticated;

-- Move a club between leagues (manual relegation/promotion).
CREATE OR REPLACE FUNCTION public.admin_move_club_to_league(p_club_id UUID, p_target_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT id, name INTO v_league FROM public.leagues WHERE id = p_target_league_id;
  IF v_league IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'league_not_found'); END IF;

  UPDATE public.clubs SET league_id = p_target_league_id WHERE id = p_club_id;
  RETURN jsonb_build_object('ok', true, 'target_league', v_league.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_move_club_to_league(UUID, UUID) TO authenticated;

-- ── Prêmios / MVP ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_open_round_mvp_poll(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_poll_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_poll_id := public.open_round_mvp_poll(p_round_id, TRUE);
  RETURN jsonb_build_object('ok', v_poll_id IS NOT NULL, 'poll_id', v_poll_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_open_round_mvp_poll(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_open_season_mvp_poll(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_poll_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_poll_id := public.open_season_mvp_poll(p_season_id, TRUE);
  RETURN jsonb_build_object('ok', v_poll_id IS NOT NULL, 'poll_id', v_poll_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_open_season_mvp_poll(UUID) TO authenticated;

-- Force a poll closed NOW (sets closes_at=now and runs the tally).
CREATE OR REPLACE FUNCTION public.admin_close_award_poll(p_poll_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_closed INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.player_award_polls SET closes_at = NOW() WHERE id = p_poll_id AND status = 'open';
  v_closed := public.close_due_award_polls();
  RETURN jsonb_build_object('ok', true, 'closed_count', v_closed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_close_award_poll(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_persist_season_auto_awards(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_count := public.persist_season_auto_awards(p_season_id);
  RETURN jsonb_build_object('ok', true, 'awards_persisted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_persist_season_auto_awards(UUID) TO authenticated;

-- ── Jogadores ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_run_aging(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_result := public.advance_all_player_ages(p_season_id);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_aging(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_apply_decay(p_player_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_result := public.apply_aging_decay(p_player_profile_id);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_apply_decay(UUID) TO authenticated;

-- Force-retire a player (bypasses the age >= 38 + ownership check
-- in retire_player). Useful for admin cleanup of old test rows.
CREATE OR REPLACE FUNCTION public.admin_retire_player(p_player_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_player RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT id, full_name, age FROM public.player_profiles WHERE id = p_player_profile_id INTO v_player;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
  END IF;

  UPDATE public.player_profiles
     SET retirement_status = 'retired',
         club_id = NULL,
         weekly_salary = 0,
         updated_at = NOW()
   WHERE id = p_player_profile_id;

  UPDATE public.contracts
     SET status = 'terminated', terminated_at = NOW(), termination_type = 'retirement'
   WHERE player_profile_id = p_player_profile_id AND status = 'active';

  DELETE FROM public.training_plans WHERE player_profile_id = p_player_profile_id;

  RETURN jsonb_build_object('ok', true, 'player', v_player.full_name, 'age', v_player.age);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_retire_player(UUID) TO authenticated;

-- ── Notificações ────────────────────────────────────────────

-- Mark every notification of a user as read.
CREATE OR REPLACE FUNCTION public.admin_mark_user_notifications_read(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.notifications SET read = true WHERE user_id = p_user_id AND read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'marked_read', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_user_notifications_read(UUID) TO authenticated;
