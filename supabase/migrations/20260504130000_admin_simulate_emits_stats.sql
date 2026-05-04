-- ─────────────────────────────────────────────────────────────
-- admin_simulate_match must emit match_participants + player_match_stats
-- ─────────────────────────────────────────────────────────────
-- Without participants/stats, the downstream pipeline (auto-awards,
-- season MVP candidates, season recap) has nothing to work with — the
-- whole season-end flow returns null/zero silently. Fix:
--   1) When simulating, snapshot each club's active lineup into
--      match_participants.
--   2) Generate synthetic player_match_stats: rating 5.5–8.5,
--      distribute goals randomly to attacking starters of the team
--      that scored, 90 min for everyone.
-- Also expose admin_backfill_match_stats(match_id) so previously-
-- simulated matches (Temp 2) can be repaired without re-simulating.

CREATE OR REPLACE FUNCTION public._gen_synthetic_match_data(
  p_match_id UUID,
  p_home_score INT,
  p_away_score INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_home_lineup UUID;
  v_away_lineup UUID;
  v_pp RECORD;
  v_part_id UUID;
  v_rating NUMERIC;
  v_goals INT;
  v_attackers UUID[];
  v_chosen UUID;
  v_i INT;
BEGIN
  SELECT id, home_club_id, away_club_id INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN RETURN; END IF;

  -- Snapshot each club's active lineup as participants. If a club has no
  -- lineup_slots populated (a known seed_serie_b miss), fall back to
  -- picking the first 11 players in the squad ordered by position.
  FOR v_pp IN
    WITH home_slots AS (
      SELECT ls.player_profile_id FROM public.lineups l
        JOIN public.lineup_slots ls ON ls.lineup_id = l.id
       WHERE l.club_id = v_match.home_club_id AND l.is_active = TRUE AND ls.role_type = 'starter'
    ), home_fallback AS (
      SELECT id AS player_profile_id FROM public.player_profiles
       WHERE club_id::text = v_match.home_club_id::text
       ORDER BY CASE primary_position
         WHEN 'GK' THEN 1 WHEN 'CB' THEN 2 WHEN 'LB' THEN 3 WHEN 'RB' THEN 4
         WHEN 'CDM' THEN 5 WHEN 'CM' THEN 6 WHEN 'CAM' THEN 7
         WHEN 'LM' THEN 8 WHEN 'RM' THEN 9 WHEN 'LW' THEN 10 WHEN 'RW' THEN 11
         WHEN 'ST' THEN 12 WHEN 'CF' THEN 13 ELSE 99 END
       LIMIT 11
    ),
    away_slots AS (
      SELECT ls.player_profile_id FROM public.lineups l
        JOIN public.lineup_slots ls ON ls.lineup_id = l.id
       WHERE l.club_id = v_match.away_club_id AND l.is_active = TRUE AND ls.role_type = 'starter'
    ), away_fallback AS (
      SELECT id AS player_profile_id FROM public.player_profiles
       WHERE club_id::text = v_match.away_club_id::text
       ORDER BY CASE primary_position
         WHEN 'GK' THEN 1 WHEN 'CB' THEN 2 WHEN 'LB' THEN 3 WHEN 'RB' THEN 4
         WHEN 'CDM' THEN 5 WHEN 'CM' THEN 6 WHEN 'CAM' THEN 7
         WHEN 'LM' THEN 8 WHEN 'RM' THEN 9 WHEN 'LW' THEN 10 WHEN 'RW' THEN 11
         WHEN 'ST' THEN 12 WHEN 'CF' THEN 13 ELSE 99 END
       LIMIT 11
    )
    SELECT 'home'::TEXT AS side, player_profile_id FROM home_slots
    UNION ALL SELECT 'home', player_profile_id FROM home_fallback
       WHERE NOT EXISTS (SELECT 1 FROM home_slots)
    UNION ALL SELECT 'away', player_profile_id FROM away_slots
    UNION ALL SELECT 'away', player_profile_id FROM away_fallback
       WHERE NOT EXISTS (SELECT 1 FROM away_slots)
  LOOP
    INSERT INTO public.match_participants (
      match_id, player_profile_id, club_id, role_type, is_bot, is_ready
    ) VALUES (
      p_match_id, v_pp.player_profile_id,
      CASE WHEN v_pp.side = 'home' THEN v_match.home_club_id ELSE v_match.away_club_id END,
      'player', TRUE, TRUE
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Resolve season for stats.
  DECLARE
    v_season_id UUID;
  BEGIN
    SELECT lr.season_id INTO v_season_id
      FROM public.league_matches lm
      JOIN public.league_rounds lr ON lr.id = lm.round_id
     WHERE lm.match_id = p_match_id;

    -- Distribute home goals to home attacking participants (positions
    -- containing W, ST, CF, CAM); fallback to any home participant.
    SELECT ARRAY_AGG(mp.id) INTO v_attackers
      FROM public.match_participants mp
      JOIN public.player_profiles pp ON pp.id = mp.player_profile_id
     WHERE mp.match_id = p_match_id
       AND mp.club_id = v_match.home_club_id
       AND (pp.primary_position IN ('ST','CF','LW','RW','CAM','LM','RM'));
    IF v_attackers IS NULL OR array_length(v_attackers, 1) = 0 THEN
      SELECT ARRAY_AGG(mp.id) INTO v_attackers
        FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.club_id = v_match.home_club_id;
    END IF;
    -- Track scorer counts per participant (we'll fill into pms below).
    CREATE TEMP TABLE IF NOT EXISTS _tmp_scorer_counts (participant_id UUID PRIMARY KEY, goals INT) ON COMMIT DROP;
    DELETE FROM _tmp_scorer_counts;
    IF v_attackers IS NOT NULL AND array_length(v_attackers, 1) > 0 THEN
      FOR v_i IN 1..p_home_score LOOP
        v_chosen := v_attackers[1 + FLOOR(random() * array_length(v_attackers, 1))::INT];
        IF v_chosen IS NULL THEN CONTINUE; END IF;
        INSERT INTO _tmp_scorer_counts(participant_id, goals) VALUES (v_chosen, 1)
          ON CONFLICT (participant_id) DO UPDATE SET goals = _tmp_scorer_counts.goals + 1;
      END LOOP;
    END IF;

    SELECT ARRAY_AGG(mp.id) INTO v_attackers
      FROM public.match_participants mp
      JOIN public.player_profiles pp ON pp.id = mp.player_profile_id
     WHERE mp.match_id = p_match_id
       AND mp.club_id = v_match.away_club_id
       AND (pp.primary_position IN ('ST','CF','LW','RW','CAM','LM','RM'));
    IF v_attackers IS NULL OR array_length(v_attackers, 1) = 0 THEN
      SELECT ARRAY_AGG(mp.id) INTO v_attackers
        FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.club_id = v_match.away_club_id;
    END IF;
    IF v_attackers IS NOT NULL AND array_length(v_attackers, 1) > 0 THEN
      FOR v_i IN 1..p_away_score LOOP
        v_chosen := v_attackers[1 + FLOOR(random() * array_length(v_attackers, 1))::INT];
        IF v_chosen IS NULL THEN CONTINUE; END IF;
        INSERT INTO _tmp_scorer_counts(participant_id, goals) VALUES (v_chosen, 1)
          ON CONFLICT (participant_id) DO UPDATE SET goals = _tmp_scorer_counts.goals + 1;
      END LOOP;
    END IF;

    -- Insert stats for every participant.
    INSERT INTO public.player_match_stats (
      match_id, participant_id, player_profile_id, club_id, season_id,
      position, minutes_played, goals, assists, shots, shots_on_target,
      passes_completed, passes_attempted, tackles, interceptions,
      fouls_committed, offsides, yellow_cards, red_cards, gk_saves,
      gk_penalties_saved, goals_conceded, clean_sheet, rating
    )
    SELECT
      p_match_id, mp.id, mp.player_profile_id, mp.club_id, v_season_id,
      pp.primary_position, 90,
      COALESCE(sc.goals, 0), 0, COALESCE(sc.goals, 0) + FLOOR(random() * 2)::INT, COALESCE(sc.goals, 0),
      10 + FLOOR(random() * 20)::INT, 12 + FLOOR(random() * 22)::INT,
      FLOOR(random() * 3)::INT, FLOOR(random() * 2)::INT,
      FLOOR(random() * 2)::INT, 0, 0, 0,
      CASE WHEN pp.primary_position = 'GK' THEN 2 + FLOOR(random() * 4)::INT ELSE 0 END,
      0,
      CASE WHEN mp.club_id = v_match.home_club_id THEN p_away_score ELSE p_home_score END,
      CASE
        WHEN mp.club_id = v_match.home_club_id AND p_away_score = 0 THEN TRUE
        WHEN mp.club_id = v_match.away_club_id AND p_home_score = 0 THEN TRUE
        ELSE FALSE
      END,
      ROUND((5.5 + random() * 3.0 + COALESCE(sc.goals, 0) * 0.6)::NUMERIC, 1)
    FROM public.match_participants mp
    JOIN public.player_profiles pp ON pp.id = mp.player_profile_id
    LEFT JOIN _tmp_scorer_counts sc ON sc.participant_id = mp.id
    WHERE mp.match_id = p_match_id
    ON CONFLICT (match_id, participant_id) DO NOTHING;
  END;
END;
$$;

-- Re-emit admin_simulate_match calling the helper at the end.
CREATE OR REPLACE FUNCTION public.admin_simulate_match(
  p_match_id UUID,
  p_home_score INT DEFAULT NULL,
  p_away_score INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_home INT;
  v_away INT;
  v_league_match RECORD;
  v_round RECORD;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status = 'finished' THEN RAISE EXCEPTION 'Match already finished'; END IF;

  v_home := COALESCE(p_home_score, FLOOR(random() * 4)::INT);
  v_away := COALESCE(p_away_score, FLOOR(random() * 4)::INT);

  UPDATE public.match_turns SET status = 'resolved', resolved_at = now()
   WHERE match_id = p_match_id AND status = 'active';

  UPDATE public.matches
     SET status = 'finished', home_score = v_home, away_score = v_away,
         finished_at = now(), started_at = COALESCE(started_at, now())
   WHERE id = p_match_id;

  INSERT INTO public.match_event_logs (match_id, event_type, title, body)
  VALUES (p_match_id, 'final_whistle', FORMAT('🏁 Apito final! %s – %s', v_home, v_away),
          'Resultado simulado pelo admin.');

  -- Standings (incremental).
  SELECT * INTO v_league_match FROM public.league_matches WHERE match_id = p_match_id;
  IF v_league_match IS NOT NULL THEN
    SELECT * INTO v_round FROM public.league_rounds WHERE id = v_league_match.round_id;
    IF v_round IS NOT NULL THEN
      INSERT INTO public.league_standings (season_id, club_id, played, won, drawn, lost, goals_for, goals_against, points)
      VALUES (v_round.season_id, v_match.home_club_id, 1,
        (CASE WHEN v_home > v_away THEN 1 ELSE 0 END),
        (CASE WHEN v_home = v_away THEN 1 ELSE 0 END),
        (CASE WHEN v_home < v_away THEN 1 ELSE 0 END),
        v_home, v_away,
        (CASE WHEN v_home > v_away THEN 3 WHEN v_home = v_away THEN 1 ELSE 0 END))
      ON CONFLICT (season_id, club_id) DO UPDATE SET
        played = public.league_standings.played + 1,
        won = public.league_standings.won + (CASE WHEN v_home > v_away THEN 1 ELSE 0 END),
        drawn = public.league_standings.drawn + (CASE WHEN v_home = v_away THEN 1 ELSE 0 END),
        lost = public.league_standings.lost + (CASE WHEN v_home < v_away THEN 1 ELSE 0 END),
        goals_for = public.league_standings.goals_for + v_home,
        goals_against = public.league_standings.goals_against + v_away,
        points = public.league_standings.points + (CASE WHEN v_home > v_away THEN 3 WHEN v_home = v_away THEN 1 ELSE 0 END),
        updated_at = now();
      INSERT INTO public.league_standings (season_id, club_id, played, won, drawn, lost, goals_for, goals_against, points)
      VALUES (v_round.season_id, v_match.away_club_id, 1,
        (CASE WHEN v_away > v_home THEN 1 ELSE 0 END),
        (CASE WHEN v_away = v_home THEN 1 ELSE 0 END),
        (CASE WHEN v_away < v_home THEN 1 ELSE 0 END),
        v_away, v_home,
        (CASE WHEN v_away > v_home THEN 3 WHEN v_away = v_home THEN 1 ELSE 0 END))
      ON CONFLICT (season_id, club_id) DO UPDATE SET
        played = public.league_standings.played + 1,
        won = public.league_standings.won + (CASE WHEN v_away > v_home THEN 1 ELSE 0 END),
        drawn = public.league_standings.drawn + (CASE WHEN v_away = v_home THEN 1 ELSE 0 END),
        lost = public.league_standings.lost + (CASE WHEN v_away < v_home THEN 1 ELSE 0 END),
        goals_for = public.league_standings.goals_for + v_away,
        goals_against = public.league_standings.goals_against + v_home,
        points = public.league_standings.points + (CASE WHEN v_away > v_home THEN 3 WHEN v_away = v_home THEN 1 ELSE 0 END),
        updated_at = now();
    END IF;
  END IF;

  -- NEW: emit synthetic participants + stats.
  PERFORM public._gen_synthetic_match_data(p_match_id, v_home, v_away);

  RETURN jsonb_build_object('home_score', v_home, 'away_score', v_away);
END;
$$;

-- Backfill RPC for already-simulated matches without stats.
CREATE OR REPLACE FUNCTION public.admin_backfill_match_stats(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_existing INT;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id, home_score, away_score, status INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'match_not_found'); END IF;
  IF v_match.status <> 'finished' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_finished'); END IF;

  SELECT COUNT(*) INTO v_existing FROM public.player_match_stats WHERE match_id = p_match_id;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stats_already_exist', 'count', v_existing);
  END IF;

  PERFORM public._gen_synthetic_match_data(p_match_id, v_match.home_score, v_match.away_score);
  SELECT COUNT(*) INTO v_existing FROM public.player_match_stats WHERE match_id = p_match_id;
  RETURN jsonb_build_object('ok', true, 'stats_inserted', v_existing);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_backfill_match_stats(UUID) TO authenticated;
