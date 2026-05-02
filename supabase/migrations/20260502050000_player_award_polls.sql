-- ─────────────────────────────────────────────────────────────
-- Player Award Polls (MVP-da-Rodada + Awards genéricos)
-- ─────────────────────────────────────────────────────────────
-- Phase 1: votação de MVP por rodada de liga.
-- Phase 2 (futuro): MVP da temporada + auto-awards (artilheiro,
-- assistências, desarmes, fair play, luva de ouro).
-- Phase 3 (futuro): troféus no perfil do jogador, prêmios em
-- dinheiro/itens da loja, Hall da Fama.
--
-- Schema é genérico via `scope` + `scope_entity_id` para suportar
-- todas as fases sem novas tabelas.

-- ── 1. Tabelas ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_award_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,                    -- 'round_mvp' | 'season_mvp' | (futuro)
  scope_entity_id UUID NOT NULL,          -- league_round.id ou league_season.id
  candidates JSONB NOT NULL DEFAULT '[]', -- snapshot dos candidatos no momento de abertura
  opens_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'closed'
  winner_player_profile_id UUID REFERENCES public.player_profiles(id) ON DELETE SET NULL,
  winner_vote_count INT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_award_polls_scope ON public.player_award_polls (scope, status);
CREATE INDEX IF NOT EXISTS idx_award_polls_entity ON public.player_award_polls (scope_entity_id);
CREATE INDEX IF NOT EXISTS idx_award_polls_due ON public.player_award_polls (closes_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.player_award_votes (
  poll_id UUID NOT NULL REFERENCES public.player_award_polls(id) ON DELETE CASCADE,
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voted_player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, voter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_award_votes_poll ON public.player_award_votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_award_votes_voted ON public.player_award_votes (voted_player_profile_id);

CREATE TABLE IF NOT EXISTS public.player_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  award_type TEXT NOT NULL,               -- 'round_mvp' | 'season_mvp' | 'season_top_scorer' | 'season_top_assists' | 'season_top_tackles' | 'season_clean_sheets' | 'season_fair_play'
  scope_entity_id UUID,                   -- round_id ou season_id de origem
  league_id UUID REFERENCES public.leagues(id) ON DELETE SET NULL,
  season_number INT,
  round_number INT,
  vote_count INT,
  metric_value NUMERIC,                   -- valor da métrica (gols/assists/etc) para auto-awards
  prize_money INT NOT NULL DEFAULT 0,
  prize_item_id UUID,                     -- futuro: store_items
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (award_type, scope_entity_id, player_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_player_awards_profile ON public.player_awards (player_profile_id);
CREATE INDEX IF NOT EXISTS idx_player_awards_type ON public.player_awards (award_type, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_awards_league_season ON public.player_awards (league_id, season_number);

-- ── 2. RLS ───────────────────────────────────────────────────

ALTER TABLE public.player_award_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_award_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_awards     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read polls" ON public.player_award_polls;
CREATE POLICY "Public read polls" ON public.player_award_polls FOR SELECT USING (true);

-- Votes: leitura pública (pra mostrar contagem); escrita só via RPC.
DROP POLICY IF EXISTS "Public read votes" ON public.player_award_votes;
CREATE POLICY "Public read votes" ON public.player_award_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read awards" ON public.player_awards;
CREATE POLICY "Public read awards" ON public.player_awards FOR SELECT USING (true);

-- ── 3. Helpers ───────────────────────────────────────────────

-- Calcula candidatos top-15 por rating numa rodada.
-- Retorna jsonb array já no formato que o cliente consome.
CREATE OR REPLACE FUNCTION public._compute_round_mvp_candidates(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'rating')::numeric DESC NULLS LAST), '[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT jsonb_build_object(
      'player_profile_id', pms.player_profile_id,
      'rating', pms.rating,
      'goals', pms.goals,
      'assists', pms.assists,
      'tackles', pms.tackles,
      'gk_saves', pms.gk_saves,
      'minutes_played', pms.minutes_played,
      'club_id', pms.club_id,
      'position', pms.position,
      'match_id', pms.match_id
    ) AS c
    FROM public.player_match_stats pms
    JOIN public.league_matches lm ON lm.match_id = pms.match_id
    WHERE lm.round_id = p_round_id
      AND pms.rating IS NOT NULL
    ORDER BY pms.rating DESC NULLS LAST
    LIMIT 15
  ) sub;

  RETURN COALESCE(v_candidates, '[]'::jsonb);
END;
$$;

-- ── 4. Abertura de poll (chamado por trigger) ────────────────

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

  IF v_round IS NULL THEN
    RETURN NULL;
  END IF;

  -- Próxima rodada da mesma temporada → fim da janela de votação.
  SELECT MIN(scheduled_at) INTO v_next_round_at
  FROM public.league_rounds
  WHERE season_id = v_round.season_id
    AND round_number > v_round.round_number;

  v_closes_at := COALESCE(v_next_round_at, now() + INTERVAL '7 days');

  v_candidates := public._compute_round_mvp_candidates(p_round_id);

  -- Sem candidatos (rodada sem stats) → não abre poll.
  IF jsonb_array_length(v_candidates) = 0 THEN
    RETURN NULL;
  END IF;

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

  -- Pode acontecer no path do ON CONFLICT WHERE: pegar id existente.
  IF v_poll_id IS NULL THEN
    SELECT id INTO v_poll_id
    FROM public.player_award_polls
    WHERE scope = 'round_mvp' AND scope_entity_id = p_round_id;
  END IF;

  -- Notificações: todos os usuários autenticados com algum
  -- player_profile (qualquer um pode votar conforme decidido).
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

GRANT EXECUTE ON FUNCTION public.open_round_mvp_poll(UUID, BOOLEAN) TO service_role;

-- ── 5. RPC de voto (autenticado) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.vote_round_mvp(
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

  SELECT * INTO v_poll FROM public.player_award_polls WHERE id = p_poll_id;
  IF v_poll IS NULL THEN
    RAISE EXCEPTION 'poll not found';
  END IF;
  IF v_poll.status <> 'open' THEN
    RAISE EXCEPTION 'poll closed';
  END IF;
  IF now() > v_poll.closes_at THEN
    RAISE EXCEPTION 'poll expired';
  END IF;

  -- Candidato precisa estar na lista snapshotada.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_poll.candidates) AS c
    WHERE (c->>'player_profile_id')::uuid = p_candidate_player_profile_id
  ) INTO v_is_candidate;

  IF NOT v_is_candidate THEN
    RAISE EXCEPTION 'candidate not in poll';
  END IF;

  -- Upsert: pode trocar voto enquanto poll estiver aberta.
  INSERT INTO public.player_award_votes (poll_id, voter_user_id, voted_player_profile_id)
  VALUES (p_poll_id, v_user, p_candidate_player_profile_id)
  ON CONFLICT (poll_id, voter_user_id) DO UPDATE
    SET voted_player_profile_id = EXCLUDED.voted_player_profile_id,
        created_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'voted_player_profile_id', p_candidate_player_profile_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_round_mvp(UUID, UUID) TO authenticated;

-- ── 6. Fechamento de poll (cron / engine) ────────────────────

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
  v_closed INT := 0;
BEGIN
  FOR v_poll IN
    SELECT *
    FROM public.player_award_polls
    WHERE status = 'open' AND closes_at <= now()
    ORDER BY closes_at
    LIMIT 50
  LOOP
    -- Tally: most votes; tiebreak = maior rating do candidato no snapshot.
    WITH tally AS (
      SELECT v.voted_player_profile_id AS pid, COUNT(*)::int AS votes
      FROM public.player_award_votes v
      WHERE v.poll_id = v_poll.id
      GROUP BY v.voted_player_profile_id
    ),
    cand_rating AS (
      SELECT (c->>'player_profile_id')::uuid AS pid,
             COALESCE((c->>'rating')::numeric, 0) AS rating
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

      -- Notifica o ganhador.
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

-- ── 7. Trigger: rodada finalizada → abre poll ────────────────

CREATE OR REPLACE FUNCTION public._on_league_round_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND COALESCE(OLD.status, '') <> 'finished' THEN
    -- Best-effort; never block the round-status transition.
    BEGIN
      PERFORM public.open_round_mvp_poll(NEW.id, TRUE);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'open_round_mvp_poll failed: %', SQLERRM;
    END;
    -- Aproveita pra fechar polls vencidos (evita cron dedicado).
    BEGIN
      PERFORM public.close_due_award_polls();
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'close_due_award_polls failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_round_finished_open_mvp ON public.league_rounds;
CREATE TRIGGER league_round_finished_open_mvp
  AFTER UPDATE OF status ON public.league_rounds
  FOR EACH ROW
  EXECUTE FUNCTION public._on_league_round_finished();

-- ── 8. Cron diário (safety net pra fechar polls em rodadas
--      finais de temporada que não têm próxima rodada) ────────

DO $$ BEGIN PERFORM cron.unschedule('close-award-polls-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'close-award-polls-daily',
      '0 6 * * *',  -- 06:00 UTC = 03:00 BRT
      $cron$ SELECT public.close_due_award_polls(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron schedule skipped: %', SQLERRM;
END $$;

-- ── 9. Backfill: abre polls pra todas as rodadas já
--      finalizadas, com closes_at = now() + 30 days, SEM
--      enviar notificações (evita inundar inboxes em prod). ───

DO $$
DECLARE
  r RECORD;
  v_candidates JSONB;
BEGIN
  FOR r IN
    SELECT lr.id AS round_id, lr.round_number, lr.season_id
    FROM public.league_rounds lr
    WHERE lr.status = 'finished'
      AND NOT EXISTS (
        SELECT 1 FROM public.player_award_polls p
        WHERE p.scope = 'round_mvp' AND p.scope_entity_id = lr.id
      )
    ORDER BY lr.round_number
  LOOP
    v_candidates := public._compute_round_mvp_candidates(r.round_id);
    IF jsonb_array_length(v_candidates) = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.player_award_polls (
      scope, scope_entity_id, candidates, opens_at, closes_at, status
    ) VALUES (
      'round_mvp', r.round_id, v_candidates,
      now(),
      -- Pra teste em rodadas antigas: janela de 30 dias a partir de agora.
      now() + INTERVAL '30 days',
      'open'
    );
  END LOOP;
END $$;
