-- ─────────────────────────────────────────────────────────────
-- Award milestones: every player_awards row → narratives row
-- ─────────────────────────────────────────────────────────────
-- Round MVP, Season MVP, and the five auto-awards (top scorer,
-- top assists, top tackles, golden glove, fair play) now emit a
-- milestone narrative on the player's timeline. Previously only
-- `season_top_scorer` had a milestone (via the engine), and Round
-- MVPs had no narrative trace at all — so the user only saw the
-- chip in the Trophy Room without any timeline entry.
--
-- Strategy: AFTER INSERT trigger on player_awards generates body
-- text from inline PT/EN templates and inserts into narratives.
-- The partial UNIQUE index on (entity_type, entity_id,
-- milestone_type) silently dedupes when the engine and this
-- trigger both target the same milestone_type (season_top_scorer).
--
-- Also extends notifications.type CHECK to include 'milestone' —
-- the engine's persistMilestone has been emitting that type for
-- weeks but the inserts were silently failing on CHECK violation
-- (no error surfaced because the call doesn't destructure the
-- result).

-- ── 0. Helper: build milestone_type for an award ────────────
-- Prefixed + season/round suffix so a player who wins the same
-- award across multiple seasons gets one milestone per occurrence
-- (the partial UNIQUE on (entity_id, milestone_type) would
-- otherwise collapse them all into a single row).

CREATE OR REPLACE FUNCTION public._award_milestone_type(
  p_award_type TEXT,
  p_season INT,
  p_round INT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'award_' || p_award_type ||
         CASE WHEN p_season IS NOT NULL THEN '_s' || p_season ELSE '' END ||
         CASE WHEN p_round  IS NOT NULL THEN '_r' || p_round  ELSE '' END;
$$;

-- ── 1. notifications.type CHECK: allow 'milestone' ───────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'contract'::text,
      'transfer'::text,
      'match'::text,
      'training'::text,
      'league'::text,
      'system'::text,
      'finance'::text,
      'energy'::text,
      'forum'::text,
      'store'::text,
      'round_mvp_open'::text,
      'round_mvp_won'::text,
      'season_mvp_open'::text,
      'season_mvp_won'::text,
      'milestone'::text
    ])
  );

-- ── 2. Trigger function: build milestone from player_awards row ─

CREATE OR REPLACE FUNCTION public._on_player_award_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_name TEXT;
  v_user_id UUID;
  v_body_pt TEXT;
  v_body_en TEXT;
  v_label_pt TEXT;
  v_metric INT;
  v_rows_inserted INT;
BEGIN
  SELECT full_name, user_id INTO v_player_name, v_user_id
  FROM public.player_profiles
  WHERE id = NEW.player_profile_id;

  IF v_player_name IS NULL THEN RETURN NEW; END IF;

  v_metric := COALESCE(NEW.metric_value, NEW.vote_count, 0)::INT;

  -- PT/EN templates per award_type. Numeric variables baked into
  -- the string so a fresh read of the timeline doesn't have to
  -- re-resolve them.
  IF NEW.award_type = 'round_mvp' THEN
    v_body_pt := 'MVP da Rodada ' || COALESCE(NEW.round_number, 0) ||
                 ' da Temporada ' || COALESCE(NEW.season_number, 0) || '! ' ||
                 v_player_name || ' foi eleito o melhor jogador da rodada pelos colegas — ' ||
                 'reconhecimento que vem direto de quem entendeu da partida em campo.';
    v_body_en := 'Round ' || COALESCE(NEW.round_number, 0) || ' MVP of Season ' ||
                 COALESCE(NEW.season_number, 0) || '! ' || v_player_name ||
                 ' was voted the round''s best player by his peers — recognition straight ' ||
                 'from those who understood the match on the pitch.';
    v_label_pt := '🏆 MVP da Rodada ' || COALESCE(NEW.round_number, 0);

  ELSIF NEW.award_type = 'season_mvp' THEN
    v_body_pt := 'MVP da Temporada ' || COALESCE(NEW.season_number, 0) || '! ' ||
                 v_player_name || ' foi eleito o melhor jogador da Liga numa votação que coroa ' ||
                 'um ano de regularidade absurda. Premiação individual máxima do calendário, ' ||
                 'daquelas que entram pra história pessoal do atleta.';
    v_body_en := 'Season ' || COALESCE(NEW.season_number, 0) || ' MVP! ' ||
                 v_player_name || ' was voted the League''s best player in a poll that crowns ' ||
                 'a year of absurd consistency. The calendar''s top individual prize, ' ||
                 'the kind that enters the athlete''s personal history.';
    v_label_pt := '🏆 MVP da Temporada ' || COALESCE(NEW.season_number, 0);

  ELSIF NEW.award_type = 'season_top_scorer' THEN
    v_body_pt := 'Chuteira de ouro pra ' || v_player_name || '! Terminou a Temporada ' ||
                 COALESCE(NEW.season_number, 0) || ' como artilheiro do campeonato com ' || v_metric ||
                 ' gols, premiação individual que coroa um ano de regularidade e talento. ' ||
                 'Nome cravado entre os destaques absolutos do ano.';
    v_body_en := 'Golden boot for ' || v_player_name || '! Finished Season ' ||
                 COALESCE(NEW.season_number, 0) || ' as the championship''s top scorer with ' ||
                 v_metric || ' goals, an individual prize that crowns a year of consistency ' ||
                 'and talent. Name carved among the year''s absolute standouts.';
    v_label_pt := '🏆 Artilheiro da Temporada';

  ELSIF NEW.award_type = 'season_top_assists' THEN
    v_body_pt := 'Garçom da temporada: ' || v_player_name || ' terminou a Temporada ' ||
                 COALESCE(NEW.season_number, 0) || ' como líder de assistências da Liga com ' ||
                 v_metric || ' passes decisivos. Visão de jogo, qualidade no passe e leitura ' ||
                 'tática se traduzem em números — e os companheiros agradecem.';
    v_body_en := 'Season playmaker: ' || v_player_name || ' finished Season ' ||
                 COALESCE(NEW.season_number, 0) || ' as the League''s assist leader with ' ||
                 v_metric || ' decisive passes. Game vision, passing quality, and tactical ' ||
                 'reading translate into numbers — and teammates appreciate every one.';
    v_label_pt := '🏆 Líder de Assistências';

  ELSIF NEW.award_type = 'season_top_tackles' THEN
    v_body_pt := 'Muralha da temporada: ' || v_player_name || ' foi o jogador que mais cortou ' ||
                 'jogadas adversárias na Temporada ' || COALESCE(NEW.season_number, 0) || ', com ' ||
                 v_metric || ' desarmes. Trabalho silencioso, posicionamento perfeito e timing ' ||
                 'cirúrgico na entrada da bola.';
    v_body_en := 'Season wall: ' || v_player_name || ' was the player who broke up the most ' ||
                 'opposition plays in Season ' || COALESCE(NEW.season_number, 0) || ', with ' ||
                 v_metric || ' tackles. Silent work, perfect positioning, and surgical ' ||
                 'timing on the ball.';
    v_label_pt := '🏆 Líder de Desarmes';

  ELSIF NEW.award_type = 'season_golden_glove' THEN
    v_body_pt := 'Luva de Ouro pra ' || v_player_name || '! Goleiro com mais defesas no ' ||
                 'campeonato na Temporada ' || COALESCE(NEW.season_number, 0) || ' (' || v_metric ||
                 ' defesas). Premiação que reconhece o trabalho silencioso de quem segura o ' ||
                 'time inteiro entre as traves.';
    v_body_en := 'Golden Glove for ' || v_player_name || '! Top-saving keeper of Season ' ||
                 COALESCE(NEW.season_number, 0) || ' (' || v_metric || ' saves). A prize that ' ||
                 'recognizes the silent work of holding the whole team together between the posts.';
    v_label_pt := '🏆 Luva de Ouro';

  ELSIF NEW.award_type = 'season_fair_play' THEN
    v_body_pt := 'Prêmio Fair Play da Temporada ' || COALESCE(NEW.season_number, 0) || ' pra ' ||
                 v_player_name || ', que terminou o ano como o jogador mais disciplinado da Liga. ' ||
                 'Reconhecimento da postura dentro de campo, daquele que joga duro mas sempre ' ||
                 'dentro das regras.';
    v_body_en := 'Fair Play award for Season ' || COALESCE(NEW.season_number, 0) || ' to ' ||
                 v_player_name || ', who finished the year as the League''s most disciplined ' ||
                 'player. Recognition of on-field posture — someone who plays hard but always ' ||
                 'inside the rules.';
    v_label_pt := '🏆 Fair Play';

  ELSE
    -- Unknown award type: skip silently.
    RETURN NEW;
  END IF;

  -- Insert milestone narrative. The partial UNIQUE on
  -- (entity_type, entity_id, milestone_type) silently dedupes if
  -- the engine already wrote a similar row (season_top_scorer).
  INSERT INTO public.narratives (
    entity_type, entity_id, scope, milestone_type,
    body_pt, body_en, facts_json, generated_at
  ) VALUES (
    'player', NEW.player_profile_id, 'milestone',
    public._award_milestone_type(NEW.award_type, NEW.season_number, NEW.round_number),
    v_body_pt, v_body_en,
    jsonb_build_object(
      'milestone_type', NEW.award_type,
      'season_number', NEW.season_number,
      'round_number', NEW.round_number,
      'metric_value', NEW.metric_value,
      'vote_count', NEW.vote_count
    ),
    NEW.awarded_at
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- Notification only fires when the narrative was actually
  -- inserted (not when it dedup'd) AND the player is human.
  -- Round/Season MVP already send their own *_won notifications —
  -- skip those to avoid double pings. Auto-awards have no other
  -- notification source, so we emit the milestone bell here.
  IF v_rows_inserted > 0
     AND v_user_id IS NOT NULL
     AND NEW.award_type NOT IN ('round_mvp', 'season_mvp') THEN
    INSERT INTO public.notifications (
      user_id, player_profile_id, type, title, body, link, read
    ) VALUES (
      v_user_id, NEW.player_profile_id, 'milestone',
      '🎉 Marco desbloqueado', v_label_pt,
      '/player/' || NEW.player_profile_id::text, false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_awards_emit_milestone ON public.player_awards;
CREATE TRIGGER player_awards_emit_milestone
  AFTER INSERT ON public.player_awards
  FOR EACH ROW
  EXECUTE FUNCTION public._on_player_award_insert();

-- ── 3. Backfill: replay every existing player_awards row ─────
-- Idempotent — partial UNIQUE on narratives swallows duplicates.
-- We reuse the trigger function logic by re-inserting through a
-- temp table or by calling the function manually. Simplest: run
-- the same body inline as a one-shot.

DO $$
DECLARE
  r RECORD;
  v_player_name TEXT;
  v_metric INT;
  v_body_pt TEXT;
  v_body_en TEXT;
BEGIN
  FOR r IN
    SELECT pa.*
    FROM public.player_awards pa
    ORDER BY pa.awarded_at ASC
  LOOP
    SELECT full_name INTO v_player_name FROM public.player_profiles WHERE id = r.player_profile_id;
    IF v_player_name IS NULL THEN CONTINUE; END IF;

    v_metric := COALESCE(r.metric_value, r.vote_count, 0)::INT;

    IF r.award_type = 'round_mvp' THEN
      v_body_pt := 'MVP da Rodada ' || COALESCE(r.round_number, 0) ||
                   ' da Temporada ' || COALESCE(r.season_number, 0) || '! ' ||
                   v_player_name || ' foi eleito o melhor jogador da rodada pelos colegas — ' ||
                   'reconhecimento que vem direto de quem entendeu da partida em campo.';
      v_body_en := 'Round ' || COALESCE(r.round_number, 0) || ' MVP of Season ' ||
                   COALESCE(r.season_number, 0) || '! ' || v_player_name ||
                   ' was voted the round''s best player by his peers — recognition straight ' ||
                   'from those who understood the match on the pitch.';
    ELSIF r.award_type = 'season_mvp' THEN
      v_body_pt := 'MVP da Temporada ' || COALESCE(r.season_number, 0) || '! ' ||
                   v_player_name || ' foi eleito o melhor jogador da Liga numa votação que coroa ' ||
                   'um ano de regularidade absurda. Premiação individual máxima do calendário, ' ||
                   'daquelas que entram pra história pessoal do atleta.';
      v_body_en := 'Season ' || COALESCE(r.season_number, 0) || ' MVP! ' ||
                   v_player_name || ' was voted the League''s best player in a poll that crowns ' ||
                   'a year of absurd consistency. The calendar''s top individual prize, ' ||
                   'the kind that enters the athlete''s personal history.';
    ELSIF r.award_type = 'season_top_scorer' THEN
      v_body_pt := 'Chuteira de ouro pra ' || v_player_name || '! Terminou a Temporada ' ||
                   COALESCE(r.season_number, 0) || ' como artilheiro do campeonato com ' || v_metric ||
                   ' gols, premiação individual que coroa um ano de regularidade e talento. ' ||
                   'Nome cravado entre os destaques absolutos do ano.';
      v_body_en := 'Golden boot for ' || v_player_name || '! Finished Season ' ||
                   COALESCE(r.season_number, 0) || ' as the championship''s top scorer with ' ||
                   v_metric || ' goals, an individual prize that crowns a year of consistency ' ||
                   'and talent. Name carved among the year''s absolute standouts.';
    ELSIF r.award_type = 'season_top_assists' THEN
      v_body_pt := 'Garçom da temporada: ' || v_player_name || ' terminou a Temporada ' ||
                   COALESCE(r.season_number, 0) || ' como líder de assistências da Liga com ' ||
                   v_metric || ' passes decisivos. Visão de jogo, qualidade no passe e leitura ' ||
                   'tática se traduzem em números — e os companheiros agradecem.';
      v_body_en := 'Season playmaker: ' || v_player_name || ' finished Season ' ||
                   COALESCE(r.season_number, 0) || ' as the League''s assist leader with ' ||
                   v_metric || ' decisive passes. Game vision, passing quality, and tactical ' ||
                   'reading translate into numbers — and teammates appreciate every one.';
    ELSIF r.award_type = 'season_top_tackles' THEN
      v_body_pt := 'Muralha da temporada: ' || v_player_name || ' foi o jogador que mais cortou ' ||
                   'jogadas adversárias na Temporada ' || COALESCE(r.season_number, 0) || ', com ' ||
                   v_metric || ' desarmes. Trabalho silencioso, posicionamento perfeito e timing ' ||
                   'cirúrgico na entrada da bola.';
      v_body_en := 'Season wall: ' || v_player_name || ' was the player who broke up the most ' ||
                   'opposition plays in Season ' || COALESCE(r.season_number, 0) || ', with ' ||
                   v_metric || ' tackles. Silent work, perfect positioning, and surgical ' ||
                   'timing on the ball.';
    ELSIF r.award_type = 'season_golden_glove' THEN
      v_body_pt := 'Luva de Ouro pra ' || v_player_name || '! Goleiro com mais defesas no ' ||
                   'campeonato na Temporada ' || COALESCE(r.season_number, 0) || ' (' || v_metric ||
                   ' defesas). Premiação que reconhece o trabalho silencioso de quem segura o ' ||
                   'time inteiro entre as traves.';
      v_body_en := 'Golden Glove for ' || v_player_name || '! Top-saving keeper of Season ' ||
                   COALESCE(r.season_number, 0) || ' (' || v_metric || ' saves). A prize that ' ||
                   'recognizes the silent work of holding the whole team together between the posts.';
    ELSIF r.award_type = 'season_fair_play' THEN
      v_body_pt := 'Prêmio Fair Play da Temporada ' || COALESCE(r.season_number, 0) || ' pra ' ||
                   v_player_name || ', que terminou o ano como o jogador mais disciplinado da Liga. ' ||
                   'Reconhecimento da postura dentro de campo, daquele que joga duro mas sempre ' ||
                   'dentro das regras.';
      v_body_en := 'Fair Play award for Season ' || COALESCE(r.season_number, 0) || ' to ' ||
                   v_player_name || ', who finished the year as the League''s most disciplined ' ||
                   'player. Recognition of on-field posture — someone who plays hard but always ' ||
                   'inside the rules.';
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.narratives (
      entity_type, entity_id, scope, milestone_type,
      body_pt, body_en, facts_json, generated_at
    ) VALUES (
      'player', r.player_profile_id, 'milestone',
      public._award_milestone_type(r.award_type, r.season_number, r.round_number),
      v_body_pt, v_body_en,
      jsonb_build_object(
        'milestone_type', r.award_type,
        'season_number', r.season_number,
        'round_number', r.round_number,
        'metric_value', r.metric_value,
        'vote_count', r.vote_count
      ),
      r.awarded_at
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
