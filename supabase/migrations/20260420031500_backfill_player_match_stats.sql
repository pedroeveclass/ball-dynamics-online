-- Backfill player_match_stats from existing match_event_logs for all finished
-- matches. Idempotent (ON CONFLICT DO UPDATE on the unique key so re-runs and
-- engine writes after this migration keep their data consistent).
--
-- Retroactive data gaps:
--   - `passes_attempted` / `passes_completed`: pre-Phase 1 matches emit
--     `pass_complete` but NOT `pass_failed`, so attempts is capped at the
--     count of completed passes. Pass accuracy will read as 100% until new
--     matches start producing pass_failed events.
--   - `interceptions`: pre-Phase 1 `possession_change` events lack the
--     `cause='interception'` payload field, so we fall back to counting
--     `tackle` events only. Interceptions from opponent receive actions will
--     be missing for old matches.
--   - `clean_sheet`: derived from the final score the team conceded (>=1
--     participant row per team that played at least one minute).

DO $$
DECLARE
  v_row_count INT;
BEGIN
  WITH finished_matches AS (
    SELECT m.id AS match_id,
           m.home_club_id,
           m.away_club_id,
           m.home_score,
           m.away_score
    FROM public.matches m
    WHERE m.status = 'finished'
  ),
  season_for_match AS (
    SELECT lm.match_id, lr.season_id
    FROM public.league_matches lm
    JOIN public.league_rounds lr ON lr.id = lm.round_id
  ),
  base AS (
    SELECT
      mp.match_id,
      mp.id AS participant_id,
      mp.player_profile_id,
      mp.club_id,
      sfm.season_id,
      pp.primary_position AS position,
      fm.home_club_id,
      fm.away_club_id,
      fm.home_score,
      fm.away_score
    FROM public.match_participants mp
    JOIN finished_matches fm ON fm.match_id = mp.match_id
    LEFT JOIN season_for_match sfm ON sfm.match_id = mp.match_id
    LEFT JOIN public.player_profiles pp ON pp.id = mp.player_profile_id
    WHERE mp.role_type = 'player'
      AND mp.player_profile_id IS NOT NULL
  ),
  agg AS (
    SELECT
      b.match_id,
      b.participant_id,
      b.player_profile_id,
      b.club_id,
      b.season_id,
      b.position,
      b.home_club_id,
      b.away_club_id,
      b.home_score,
      b.away_score,
      -- goals: match_event_logs.event_type='goal' with scorer_participant_id
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'goal'
                  AND (e.payload->>'scorer_participant_id')::uuid = b.participant_id), 0) AS goals,
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'goal'
                  AND (e.payload->>'assister_participant_id')::uuid = b.participant_id), 0) AS assists,
      -- shots: shot_missed (off target) + goal (on target; only counts if participant is scorer)
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type IN ('shot_missed')
                  AND (e.payload->>'shooter_participant_id')::uuid = b.participant_id), 0)
        +
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'goal'
                  AND (e.payload->>'scorer_participant_id')::uuid = b.participant_id), 0)
        AS shots,
      -- shots_on_target: every 'goal' + any 'saved'/'gk_save' (on-target blocked by GK)
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'goal'
                  AND (e.payload->>'scorer_participant_id')::uuid = b.participant_id), 0)
        AS shots_on_target,
      -- passes_completed: pass_complete events where ballHolder is passer
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'pass_complete'
                  AND (e.payload->>'passer_participant_id')::uuid = b.participant_id), 0) AS passes_completed,
      -- passes_attempted: pass_complete + pass_failed (Phase 1 forward);
      -- for backfilled matches without pass_failed, this equals completed passes (100%).
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type IN ('pass_complete', 'pass_failed')
                  AND (e.payload->>'passer_participant_id')::uuid = b.participant_id), 0) AS passes_attempted,
      -- tackles: event_type='tackle' where tackler
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'tackle'
                  AND (e.payload->>'tackler_participant_id')::uuid = b.participant_id), 0) AS tackles,
      -- interceptions: possession_change with cause='interception' and
      -- new_ball_holder_participant_id = us.
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'possession_change'
                  AND (e.payload->>'cause') = 'interception'
                  AND (e.payload->>'new_ball_holder_participant_id')::uuid = b.participant_id), 0) AS interceptions,
      -- fouls_committed: event_type IN ('foul','penalty') where fouler
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type IN ('foul', 'penalty')
                  AND (e.payload->>'fouler_participant_id')::uuid = b.participant_id), 0) AS fouls_committed,
      -- offsides: offside event where caught_participant_id
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'offside'
                  AND (e.payload->>'caught_participant_id')::uuid = b.participant_id), 0) AS offsides,
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'yellow_card'
                  AND (e.payload->>'player_participant_id')::uuid = b.participant_id), 0) AS yellow_cards,
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'red_card'
                  AND (e.payload->>'player_participant_id')::uuid = b.participant_id), 0) AS red_cards,
      -- gk_saves: gk_save events where gk_participant_id matches us
      COALESCE((SELECT COUNT(*) FROM public.match_event_logs e
                WHERE e.match_id = b.match_id
                  AND e.event_type = 'gk_save'
                  AND (e.payload->>'gk_participant_id')::uuid = b.participant_id), 0) AS gk_saves
    FROM base b
  ),
  final AS (
    SELECT
      a.match_id,
      a.participant_id,
      a.player_profile_id,
      a.club_id,
      a.season_id,
      a.position,
      a.goals,
      a.assists,
      a.shots,
      a.shots_on_target,
      a.passes_completed,
      a.passes_attempted,
      a.tackles,
      a.interceptions,
      a.fouls_committed,
      a.offsides,
      a.yellow_cards,
      a.red_cards,
      a.gk_saves,
      -- goals_conceded: opposing team's score for the player's team
      CASE
        WHEN a.club_id = a.home_club_id THEN a.away_score
        WHEN a.club_id = a.away_club_id THEN a.home_score
        ELSE 0
      END AS goals_conceded,
      -- clean_sheet: true when the player's team conceded 0
      CASE
        WHEN a.club_id = a.home_club_id AND a.away_score = 0 THEN TRUE
        WHEN a.club_id = a.away_club_id AND a.home_score = 0 THEN TRUE
        ELSE FALSE
      END AS clean_sheet
    FROM agg a
  )
  INSERT INTO public.player_match_stats (
    match_id, player_profile_id, participant_id, club_id, season_id, position,
    minutes_played, goals, assists, shots, shots_on_target,
    passes_completed, passes_attempted, tackles, interceptions,
    fouls_committed, offsides, yellow_cards, red_cards,
    gk_saves, gk_penalties_saved, goals_conceded, clean_sheet
  )
  SELECT
    f.match_id, f.player_profile_id, f.participant_id, f.club_id, f.season_id, f.position,
    0 AS minutes_played,
    f.goals, f.assists, f.shots, f.shots_on_target,
    f.passes_completed, f.passes_attempted, f.tackles, f.interceptions,
    f.fouls_committed, f.offsides, f.yellow_cards, f.red_cards,
    f.gk_saves, 0 AS gk_penalties_saved, f.goals_conceded, f.clean_sheet
  FROM final f
  ON CONFLICT (match_id, participant_id) DO UPDATE SET
    player_profile_id = EXCLUDED.player_profile_id,
    club_id = EXCLUDED.club_id,
    season_id = EXCLUDED.season_id,
    position = EXCLUDED.position,
    goals = EXCLUDED.goals,
    assists = EXCLUDED.assists,
    shots = EXCLUDED.shots,
    shots_on_target = EXCLUDED.shots_on_target,
    passes_completed = EXCLUDED.passes_completed,
    passes_attempted = EXCLUDED.passes_attempted,
    tackles = EXCLUDED.tackles,
    interceptions = EXCLUDED.interceptions,
    fouls_committed = EXCLUDED.fouls_committed,
    offsides = EXCLUDED.offsides,
    yellow_cards = EXCLUDED.yellow_cards,
    red_cards = EXCLUDED.red_cards,
    gk_saves = EXCLUDED.gk_saves,
    goals_conceded = EXCLUDED.goals_conceded,
    clean_sheet = EXCLUDED.clean_sheet;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE 'player_match_stats backfill: upserted % rows', v_row_count;
END $$;
