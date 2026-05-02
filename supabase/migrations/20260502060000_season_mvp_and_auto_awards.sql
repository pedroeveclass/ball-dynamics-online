-- ─────────────────────────────────────────────────────────────
-- Fase 2: Season MVP voting + Auto-Awards de temporada
-- ─────────────────────────────────────────────────────────────
-- Reaproveita o schema de Fase 1 (player_award_polls + votes +
-- awards). Quando uma temporada vira 'finished':
--   1) Persiste auto-awards: artilheiro, mais assistências,
--      mais desarmes, luva de ouro (GK c/ mais defesas), fair
--      play (menos cartões/min, com mínimo de minutos).
--   2) Abre poll de Season MVP com top-15 por rating médio.
-- close_due_award_polls() é estendido pra premiar 'season_mvp'.

-- ── 0. Hotfix Fase 1: rota correta é /league (não /liga) ─────
-- A Fase 1 deployada gravava notif.link='/liga?round=...' que não
-- bate com a rota registrada (/league). Re-emite a função e
-- conserta notificações já enviadas.

UPDATE public.notifications
SET link = REPLACE(link, '/liga?', '/league?')
WHERE link LIKE '/liga?%';

CREATE OR REPLACE FUNCTION public.open_round_mvp_poll(
  p_round_id UUID,
  p_send_notifications BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
  v_next_round_at TIMESTAMPTZ;
  v_closes_at TIMESTAMPTZ;
  v_candidates JSONB;
  v_poll_id UUID;
  v_link TEXT;
BEGIN
  SELECT lr.*, ls.league_id
  INTO v_round
  FROM public.league_rounds lr
  JOIN public.league_seasons ls ON ls.id = lr.season_id
  WHERE lr.id = p_round_id;

  IF v_round IS NULL THEN RETURN NULL; END IF;

  SELECT MIN(scheduled_at) INTO v_next_round_at
  FROM public.league_rounds
  WHERE season_id = v_round.season_id
    AND round_number > v_round.round_number;

  v_closes_at := COALESCE(v_next_round_at, now() + INTERVAL '7 days');
  v_candidates := public._compute_round_mvp_candidates(p_round_id);

  IF jsonb_array_length(v_candidates) = 0 THEN RETURN NULL; END IF;

  INSERT INTO public.player_award_polls (
    scope, scope_entity_id, candidates, opens_at, closes_at, status
  ) VALUES (
    'round_mvp', p_round_id, v_candidates, now(), v_closes_at, 'open'
  )
  ON CONFLICT (scope, scope_entity_id) DO UPDATE
    SET candidates = EXCLUDED.candidates,
        closes_at  = EXCLUDED.closes_at
    WHERE player_award_polls.status = 'open'
  RETURNING id INTO v_poll_id;

  IF v_poll_id IS NULL THEN
    SELECT id INTO v_poll_id
    FROM public.player_award_polls
    WHERE scope = 'round_mvp' AND scope_entity_id = p_round_id;
  END IF;

  IF p_send_notifications AND v_poll_id IS NOT NULL THEN
    v_link := '/league?round=' || p_round_id::text || '#mvp';
    INSERT INTO public.notifications (user_id, type, title, body, link, i18n_key, i18n_params)
    SELECT DISTINCT pp.user_id,
           'round_mvp_open',
           'MVP da Rodada ' || v_round.round_number,
           'A votação para MVP da Rodada ' || v_round.round_number || ' está aberta. Vote no melhor jogador!',
           v_link,
           'round_mvp_open',
           jsonb_build_object('round', v_round.round_number)
    FROM public.player_profiles pp
    WHERE pp.user_id IS NOT NULL;
  END IF;

  RETURN v_poll_id;
END;
$$;

-- ── 1. Candidatos de Season MVP ──────────────────────────────

CREATE OR REPLACE FUNCTION public._compute_season_mvp_candidates(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'avg_rating')::numeric DESC NULLS LAST), '[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT jsonb_build_object(
      'player_profile_id', pms.player_profile_id,
      'avg_rating', ROUND(AVG(pms.rating)::numeric, 2),
      'rating', ROUND(AVG(pms.rating)::numeric, 2),
      'matches', COUNT(*),
      'goals', SUM(pms.goals),
      'assists', SUM(pms.assists),
      'tackles', SUM(pms.tackles),
      'gk_saves', SUM(pms.gk_saves),
      'minutes_played', SUM(pms.minutes_played),
      'club_id', MAX(pms.club_id),
      'position', MAX(pms.position)
    ) AS c
    FROM public.player_match_stats pms
    WHERE pms.season_id = p_season_id
      AND pms.rating IS NOT NULL
    GROUP BY pms.player_profile_id
    HAVING COUNT(*) >= 3   -- mínimo 3 jogos pra entrar na votação
    ORDER BY AVG(pms.rating) DESC NULLS LAST
    LIMIT 15
  ) sub;

  RETURN COALESCE(v_candidates, '[]'::jsonb);
END;
$$;

-- ── 2. Abre poll de Season MVP ───────────────────────────────

CREATE OR REPLACE FUNCTION public.open_season_mvp_poll(
  p_season_id UUID,
  p_send_notifications BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season RECORD;
  v_closes_at TIMESTAMPTZ;
  v_candidates JSONB;
  v_poll_id UUID;
  v_link TEXT;
BEGIN
  SELECT id, league_id, season_number, finished_at, next_season_at
  INTO v_season
  FROM public.league_seasons
  WHERE id = p_season_id;

  IF v_season IS NULL THEN
    RETURN NULL;
  END IF;

  -- Janela de votação até a próxima temporada começar (ou 14 dias).
  v_closes_at := COALESCE(v_season.next_season_at, now() + INTERVAL '14 days');

  v_candidates := public._compute_season_mvp_candidates(p_season_id);

  IF jsonb_array_length(v_candidates) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.player_award_polls (
    scope, scope_entity_id, candidates, opens_at, closes_at, status
  ) VALUES (
    'season_mvp', p_season_id, v_candidates, now(), v_closes_at, 'open'
  )
  ON CONFLICT (scope, scope_entity_id) DO UPDATE
    SET candidates = EXCLUDED.candidates,
        closes_at  = EXCLUDED.closes_at
    WHERE player_award_polls.status = 'open'
  RETURNING id INTO v_poll_id;

  IF v_poll_id IS NULL THEN
    SELECT id INTO v_poll_id
    FROM public.player_award_polls
    WHERE scope = 'season_mvp' AND scope_entity_id = p_season_id;
  END IF;

  IF p_send_notifications AND v_poll_id IS NOT NULL THEN
    v_link := '/league?season=' || p_season_id::text || '#season-mvp';
    INSERT INTO public.notifications (user_id, type, title, body, link, i18n_key, i18n_params)
    SELECT DISTINCT pp.user_id,
           'season_mvp_open',
           'MVP da Temporada ' || v_season.season_number,
           'A votação para MVP da Temporada ' || v_season.season_number || ' está aberta.',
           v_link,
           'season_mvp_open',
           jsonb_build_object('season', v_season.season_number)
    FROM public.player_profiles pp
    WHERE pp.user_id IS NOT NULL;
  END IF;

  RETURN v_poll_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_season_mvp_poll(UUID, BOOLEAN) TO service_role;

-- ── 3. RPC de voto pra Season MVP (mesma lógica do round) ────

CREATE OR REPLACE FUNCTION public.vote_season_mvp(
  p_poll_id UUID,
  p_candidate_player_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_poll RECORD;
  v_is_candidate BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO v_poll FROM public.player_award_polls
  WHERE id = p_poll_id AND scope = 'season_mvp';
  IF v_poll IS NULL THEN
    RAISE EXCEPTION 'poll not found';
  END IF;
  IF v_poll.status <> 'open' THEN
    RAISE EXCEPTION 'poll closed';
  END IF;
  IF now() > v_poll.closes_at THEN
    RAISE EXCEPTION 'poll expired';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_poll.candidates) AS c
    WHERE (c->>'player_profile_id')::uuid = p_candidate_player_profile_id
  ) INTO v_is_candidate;

  IF NOT v_is_candidate THEN
    RAISE EXCEPTION 'candidate not in poll';
  END IF;

  INSERT INTO public.player_award_votes (poll_id, voter_user_id, voted_player_profile_id)
  VALUES (p_poll_id, v_user, p_candidate_player_profile_id)
  ON CONFLICT (poll_id, voter_user_id) DO UPDATE
    SET voted_player_profile_id = EXCLUDED.voted_player_profile_id,
        created_at = now();

  RETURN jsonb_build_object('ok', true, 'voted_player_profile_id', p_candidate_player_profile_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_season_mvp(UUID, UUID) TO authenticated;

-- ── 4. Auto-awards de temporada ──────────────────────────────
-- Calcula e persiste premiações automáticas que não dependem de
-- voto: artilheiro, mais assistências, mais desarmes, luva de
-- ouro (GK com mais defesas), fair play (menos cartões/min com
-- mínimo de 270min).

CREATE OR REPLACE FUNCTION public.persist_season_auto_awards(p_season_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season RECORD;
  v_count INT := 0;
  v_pid UUID;
  v_metric NUMERIC;
BEGIN
  SELECT id, league_id, season_number INTO v_season
  FROM public.league_seasons WHERE id = p_season_id;
  IF v_season IS NULL THEN RETURN 0; END IF;

  -- Top scorer
  SELECT player_profile_id, SUM(goals)::numeric
  INTO v_pid, v_metric
  FROM public.player_match_stats
  WHERE season_id = p_season_id AND goals > 0
  GROUP BY player_profile_id
  ORDER BY SUM(goals) DESC, player_profile_id
  LIMIT 1;

  IF v_pid IS NOT NULL AND v_metric > 0 THEN
    INSERT INTO public.player_awards (
      player_profile_id, award_type, scope_entity_id,
      league_id, season_number, metric_value
    ) VALUES (
      v_pid, 'season_top_scorer', p_season_id,
      v_season.league_id, v_season.season_number, v_metric
    )
    ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;
    v_count := v_count + 1;
  END IF;

  -- Top assists
  SELECT player_profile_id, SUM(assists)::numeric
  INTO v_pid, v_metric
  FROM public.player_match_stats
  WHERE season_id = p_season_id AND assists > 0
  GROUP BY player_profile_id
  ORDER BY SUM(assists) DESC, player_profile_id
  LIMIT 1;

  IF v_pid IS NOT NULL AND v_metric > 0 THEN
    INSERT INTO public.player_awards (
      player_profile_id, award_type, scope_entity_id,
      league_id, season_number, metric_value
    ) VALUES (
      v_pid, 'season_top_assists', p_season_id,
      v_season.league_id, v_season.season_number, v_metric
    )
    ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;
    v_count := v_count + 1;
  END IF;

  -- Top tackles
  SELECT player_profile_id, SUM(tackles)::numeric
  INTO v_pid, v_metric
  FROM public.player_match_stats
  WHERE season_id = p_season_id AND tackles > 0
  GROUP BY player_profile_id
  ORDER BY SUM(tackles) DESC, player_profile_id
  LIMIT 1;

  IF v_pid IS NOT NULL AND v_metric > 0 THEN
    INSERT INTO public.player_awards (
      player_profile_id, award_type, scope_entity_id,
      league_id, season_number, metric_value
    ) VALUES (
      v_pid, 'season_top_tackles', p_season_id,
      v_season.league_id, v_season.season_number, v_metric
    )
    ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;
    v_count := v_count + 1;
  END IF;

  -- Golden Glove (GK com mais defesas; tiebreak: menos gols sofridos)
  SELECT player_profile_id, SUM(gk_saves)::numeric
  INTO v_pid, v_metric
  FROM public.player_match_stats
  WHERE season_id = p_season_id
    AND UPPER(COALESCE(position, '')) = 'GK'
    AND gk_saves > 0
  GROUP BY player_profile_id
  ORDER BY SUM(gk_saves) DESC, SUM(goals_conceded) ASC, player_profile_id
  LIMIT 1;

  IF v_pid IS NOT NULL AND v_metric > 0 THEN
    INSERT INTO public.player_awards (
      player_profile_id, award_type, scope_entity_id,
      league_id, season_number, metric_value
    ) VALUES (
      v_pid, 'season_golden_glove', p_season_id,
      v_season.league_id, v_season.season_number, v_metric
    )
    ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;
    v_count := v_count + 1;
  END IF;

  -- Fair Play: menor (yellow*1 + red*3) por 90min, mínimo 270min.
  -- Empate em zero cartões → mais minutos joga primeiro.
  WITH agg AS (
    SELECT player_profile_id,
           SUM(yellow_cards)::numeric + SUM(red_cards)*3::numeric AS pen,
           SUM(minutes_played)::numeric AS mins
    FROM public.player_match_stats
    WHERE season_id = p_season_id
    GROUP BY player_profile_id
    HAVING SUM(minutes_played) >= 270
  )
  SELECT player_profile_id, pen
  INTO v_pid, v_metric
  FROM agg
  ORDER BY (pen / NULLIF(mins, 0)) ASC, mins DESC, player_profile_id
  LIMIT 1;

  IF v_pid IS NOT NULL THEN
    INSERT INTO public.player_awards (
      player_profile_id, award_type, scope_entity_id,
      league_id, season_number, metric_value
    ) VALUES (
      v_pid, 'season_fair_play', p_season_id,
      v_season.league_id, v_season.season_number, v_metric
    )
    ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.persist_season_auto_awards(UUID) TO service_role;

-- ── 5. Estende close_due_award_polls pra cobrir season_mvp ───

CREATE OR REPLACE FUNCTION public.close_due_award_polls()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll RECORD;
  v_winner_id UUID;
  v_winner_votes INT;
  v_round RECORD;
  v_season RECORD;
  v_closed INT := 0;
BEGIN
  FOR v_poll IN
    SELECT *
    FROM public.player_award_polls
    WHERE status = 'open' AND closes_at <= now()
    ORDER BY closes_at
    LIMIT 50
  LOOP
    WITH tally AS (
      SELECT v.voted_player_profile_id AS pid, COUNT(*)::int AS votes
      FROM public.player_award_votes v
      WHERE v.poll_id = v_poll.id
      GROUP BY v.voted_player_profile_id
    ),
    cand_rating AS (
      SELECT (c->>'player_profile_id')::uuid AS pid,
             COALESCE((c->>'rating')::numeric,
                      (c->>'avg_rating')::numeric, 0) AS rating
      FROM jsonb_array_elements(v_poll.candidates) c
    )
    SELECT t.pid, t.votes
    INTO v_winner_id, v_winner_votes
    FROM tally t
    LEFT JOIN cand_rating cr ON cr.pid = t.pid
    ORDER BY t.votes DESC, cr.rating DESC NULLS LAST
    LIMIT 1;

    IF v_winner_id IS NOT NULL AND v_poll.scope = 'round_mvp' THEN
      SELECT lr.*, ls.league_id, ls.season_number
      INTO v_round
      FROM public.league_rounds lr
      JOIN public.league_seasons ls ON ls.id = lr.season_id
      WHERE lr.id = v_poll.scope_entity_id;

      INSERT INTO public.player_awards (
        player_profile_id, award_type, scope_entity_id,
        league_id, season_number, round_number, vote_count
      ) VALUES (
        v_winner_id, 'round_mvp', v_poll.scope_entity_id,
        v_round.league_id, v_round.season_number, v_round.round_number, v_winner_votes
      )
      ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, body, link, i18n_key, i18n_params)
      SELECT pp.user_id,
             'round_mvp_won',
             'Você foi o MVP da Rodada ' || v_round.round_number || '! 🏆',
             'Os colegas votaram em você como o melhor da Rodada ' || v_round.round_number || '.',
             '/league?round=' || v_poll.scope_entity_id::text || '#mvp',
             'round_mvp_won',
             jsonb_build_object('round', v_round.round_number, 'votes', v_winner_votes)
      FROM public.player_profiles pp
      WHERE pp.id = v_winner_id AND pp.user_id IS NOT NULL;

    ELSIF v_winner_id IS NOT NULL AND v_poll.scope = 'season_mvp' THEN
      SELECT id, league_id, season_number INTO v_season
      FROM public.league_seasons
      WHERE id = v_poll.scope_entity_id;

      INSERT INTO public.player_awards (
        player_profile_id, award_type, scope_entity_id,
        league_id, season_number, vote_count
      ) VALUES (
        v_winner_id, 'season_mvp', v_poll.scope_entity_id,
        v_season.league_id, v_season.season_number, v_winner_votes
      )
      ON CONFLICT (award_type, scope_entity_id, player_profile_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, body, link, i18n_key, i18n_params)
      SELECT pp.user_id,
             'season_mvp_won',
             'Você foi o MVP da Temporada ' || v_season.season_number || '! 🏆',
             'Os colegas escolheram você como o melhor jogador da temporada.',
             '/league?season=' || v_poll.scope_entity_id::text || '#season-mvp',
             'season_mvp_won',
             jsonb_build_object('season', v_season.season_number, 'votes', v_winner_votes)
      FROM public.player_profiles pp
      WHERE pp.id = v_winner_id AND pp.user_id IS NOT NULL;
    END IF;

    UPDATE public.player_award_polls
       SET status = 'closed',
           winner_player_profile_id = v_winner_id,
           winner_vote_count = v_winner_votes,
           closed_at = now()
     WHERE id = v_poll.id;

    v_closed := v_closed + 1;
  END LOOP;

  RETURN v_closed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_due_award_polls() TO service_role;

-- ── 6. Trigger: temporada finalizada ─────────────────────────

CREATE OR REPLACE FUNCTION public._on_league_season_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND COALESCE(OLD.status, '') <> 'finished' THEN
    BEGIN
      PERFORM public.persist_season_auto_awards(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'persist_season_auto_awards failed: %', SQLERRM;
    END;
    BEGIN
      PERFORM public.open_season_mvp_poll(NEW.id, TRUE);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'open_season_mvp_poll failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_season_finished_awards ON public.league_seasons;
CREATE TRIGGER league_season_finished_awards
  AFTER UPDATE OF status ON public.league_seasons
  FOR EACH ROW
  EXECUTE FUNCTION public._on_league_season_finished();

-- ── 7. Backfill: temporadas já finalizadas ───────────────────
-- Persiste auto-awards e abre Season MVP poll (se houver dados)
-- pra qualquer temporada já finalizada que ainda não tenha.

DO $$
DECLARE
  s RECORD;
  v_candidates JSONB;
BEGIN
  FOR s IN
    SELECT ls.id AS season_id, ls.next_season_at
    FROM public.league_seasons ls
    WHERE ls.status = 'finished'
  LOOP
    -- Auto-awards (idempotente via UNIQUE).
    BEGIN
      PERFORM public.persist_season_auto_awards(s.season_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Season MVP poll, sem notificações no backfill.
    IF NOT EXISTS (
      SELECT 1 FROM public.player_award_polls
      WHERE scope = 'season_mvp' AND scope_entity_id = s.season_id
    ) THEN
      v_candidates := public._compute_season_mvp_candidates(s.season_id);
      IF jsonb_array_length(v_candidates) > 0 THEN
        INSERT INTO public.player_award_polls (
          scope, scope_entity_id, candidates, opens_at, closes_at, status
        ) VALUES (
          'season_mvp', s.season_id, v_candidates,
          now(),
          COALESCE(s.next_season_at, now() + INTERVAL '30 days'),
          'open'
        );
      END IF;
    END IF;
  END LOOP;
END $$;
