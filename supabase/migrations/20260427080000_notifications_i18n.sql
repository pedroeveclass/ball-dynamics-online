-- ═══════════════════════════════════════════════════════════
-- notifications: introduce i18n_key + i18n_params for new
-- locale-aware messages.
--
-- Rendering rule on the client:
--   if (i18n_key) → render via i18next with i18n_params
--   else         → fallback to legacy title / body (already PT)
--
-- Migrating triggers/RPCs gradually: this migration only updates
-- the highest-traffic insert sites (welcome, fire, mutual exit,
-- forum). The rest keep writing PT title/body until they migrate
-- in a follow-up. Both code paths coexist forever — the client
-- handles both.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS i18n_key TEXT,
  ADD COLUMN IF NOT EXISTS i18n_params JSONB;

CREATE INDEX IF NOT EXISTS idx_notifications_i18n_key ON public.notifications(i18n_key) WHERE i18n_key IS NOT NULL;

-- ── Update create_player_profile to emit keys instead of PT text ──
DROP FUNCTION IF EXISTS public.create_player_profile(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, CHAR);

CREATE OR REPLACE FUNCTION public.create_player_profile(
  p_full_name TEXT,
  p_dominant_foot TEXT,
  p_primary_position TEXT,
  p_height TEXT,
  p_body_type TEXT,
  p_extra_points JSONB,
  p_country_code CHAR(2) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player_id UUID;
  v_is_gk BOOLEAN;
  v_attrs JSONB;
  v_key TEXT;
  v_val NUMERIC;
  v_total_extra INT := 0;
  v_extra INT;
  v_overall NUMERIC;

  v_existing_count INT := 0;
  v_charge_amount INT := 1000000;
  v_charge_player_id UUID;
  v_charge_balance NUMERIC;

  v_country CHAR(2);

  v_field_keys TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina',
    'drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto',
    'visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute'
  ];
  v_gk_keys TEXT[] := ARRAY[
    'reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um',
    'distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area'
  ];
  v_all_keys TEXT[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(trim(p_full_name)) < 2 THEN RAISE EXCEPTION 'Name too short'; END IF;
  IF p_dominant_foot NOT IN ('right', 'left') THEN RAISE EXCEPTION 'Invalid dominant foot'; END IF;
  IF p_primary_position NOT IN ('GK','CB','LB','RB','LWB','RWB','DM','CDM','CM','LM','RM','CAM','LW','RW','CF','ST') THEN
    RAISE EXCEPTION 'Invalid position';
  END IF;
  IF p_height NOT IN ('Muito Baixo','Baixo','Médio','Alto','Muito Alto') THEN RAISE EXCEPTION 'Invalid height'; END IF;

  v_country := upper(coalesce(p_country_code, ''));
  IF length(v_country) <> 2 OR NOT EXISTS (SELECT 1 FROM countries WHERE code = v_country) THEN
    SELECT country_code INTO v_country FROM profiles WHERE id = v_user_id;
    IF v_country IS NULL THEN v_country := 'BR'; END IF;
  END IF;

  v_is_gk := (p_primary_position = 'GK');
  v_all_keys := v_field_keys || v_gk_keys;

  IF v_is_gk THEN
    IF p_body_type NOT IN ('Goleiro Completo','Goleiro Felino','Goleiro Muralha') THEN RAISE EXCEPTION 'Invalid GK body type'; END IF;
  ELSE
    IF p_body_type NOT IN ('All Around','Condutor','Chutador','Velocista','Torre','Cão de Guarda') THEN RAISE EXCEPTION 'Invalid body type'; END IF;
  END IF;

  v_total_extra := 0;
  IF p_extra_points IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_extra_points) LOOP
      IF NOT (v_key = ANY(v_all_keys)) THEN RAISE EXCEPTION 'Invalid attribute key in extra_points: %', v_key; END IF;
      v_extra := (p_extra_points ->> v_key)::INT;
      IF v_extra < 0 THEN RAISE EXCEPTION 'Extra points cannot be negative for %', v_key; END IF;
      v_total_extra := v_total_extra + v_extra;
    END LOOP;
  END IF;

  IF v_total_extra <> 40 THEN RAISE EXCEPTION 'Extra points must sum to exactly 40, got %', v_total_extra; END IF;

  SELECT count(*) INTO v_existing_count FROM player_profiles WHERE user_id = v_user_id;

  IF v_existing_count > 0 THEN
    SELECT active_player_profile_id INTO v_charge_player_id FROM profiles WHERE id = v_user_id;

    IF v_charge_player_id IS NULL OR NOT EXISTS (SELECT 1 FROM player_profiles WHERE id = v_charge_player_id AND user_id = v_user_id) THEN
      SELECT id INTO v_charge_player_id FROM player_profiles WHERE user_id = v_user_id ORDER BY created_at LIMIT 1;
    END IF;

    SELECT money INTO v_charge_balance FROM player_profiles WHERE id = v_charge_player_id FOR UPDATE;

    IF v_charge_balance < v_charge_amount THEN
      RAISE EXCEPTION 'Saldo insuficiente para criar novo jogador (precisa de R$ %)', v_charge_amount;
    END IF;
  END IF;

  v_attrs := public.compute_onboarding_base_attrs(v_user_id, p_primary_position, p_height, p_body_type);

  IF p_extra_points IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_extra_points) LOOP
      v_extra := (p_extra_points ->> v_key)::INT;
      IF v_extra > 0 THEN
        v_val := LEAST(75, (v_attrs ->> v_key)::NUMERIC + v_extra);
        v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
      END IF;
    END LOOP;
  END IF;

  IF v_is_gk THEN
    v_overall := (
      (v_attrs ->> 'reflexo')::NUMERIC + (v_attrs ->> 'posicionamento_gol')::NUMERIC +
      (v_attrs ->> 'defesa_aerea')::NUMERIC + (v_attrs ->> 'pegada')::NUMERIC +
      (v_attrs ->> 'saida_gol')::NUMERIC + (v_attrs ->> 'um_contra_um')::NUMERIC +
      (v_attrs ->> 'tempo_reacao')::NUMERIC + (v_attrs ->> 'comando_area')::NUMERIC
    ) / 8;
  ELSE
    v_overall := (
      (v_attrs ->> 'velocidade')::NUMERIC * 1 + (v_attrs ->> 'aceleracao')::NUMERIC * 1 +
      (v_attrs ->> 'agilidade')::NUMERIC * 1 + (v_attrs ->> 'forca')::NUMERIC * 0.8 +
      (v_attrs ->> 'equilibrio')::NUMERIC * 0.7 + (v_attrs ->> 'resistencia')::NUMERIC * 0.8 +
      (v_attrs ->> 'pulo')::NUMERIC * 0.5 + (v_attrs ->> 'stamina')::NUMERIC * 0.8 +
      (v_attrs ->> 'drible')::NUMERIC * 1 + (v_attrs ->> 'controle_bola')::NUMERIC * 1 +
      (v_attrs ->> 'marcacao')::NUMERIC * 0.8 + (v_attrs ->> 'desarme')::NUMERIC * 0.8 +
      (v_attrs ->> 'um_toque')::NUMERIC * 0.8 + (v_attrs ->> 'curva')::NUMERIC * 0.6 +
      (v_attrs ->> 'passe_baixo')::NUMERIC * 1 + (v_attrs ->> 'passe_alto')::NUMERIC * 0.8 +
      (v_attrs ->> 'visao_jogo')::NUMERIC * 1 + (v_attrs ->> 'tomada_decisao')::NUMERIC * 0.9 +
      (v_attrs ->> 'antecipacao')::NUMERIC * 0.8 + (v_attrs ->> 'trabalho_equipe')::NUMERIC * 0.7 +
      (v_attrs ->> 'coragem')::NUMERIC * 0.6 + (v_attrs ->> 'posicionamento_ofensivo')::NUMERIC * 0.8 +
      (v_attrs ->> 'posicionamento_defensivo')::NUMERIC * 0.8 +
      (v_attrs ->> 'cabeceio')::NUMERIC * 0.5 + (v_attrs ->> 'acuracia_chute')::NUMERIC * 0.8 +
      (v_attrs ->> 'forca_chute')::NUMERIC * 0.7
    ) / 21.3;
  END IF;

  INSERT INTO player_profiles (user_id, full_name, age, dominant_foot, primary_position, archetype, height, overall, reputation, money, weekly_salary, energy_current, energy_max, country_code)
  VALUES (v_user_id, trim(p_full_name), 18, p_dominant_foot, p_primary_position, p_body_type, p_height, round(v_overall), 50, 5000, 0, 100, 100, v_country)
  RETURNING id INTO v_player_id;

  IF v_charge_player_id IS NOT NULL THEN
    UPDATE player_profiles SET money = money - v_charge_amount WHERE id = v_charge_player_id;
  END IF;

  UPDATE profiles SET active_player_profile_id = v_player_id WHERE id = v_user_id;

  INSERT INTO player_attributes (
    player_profile_id,
    velocidade, aceleracao, agilidade, forca, equilibrio, resistencia, pulo, stamina,
    drible, controle_bola, marcacao, desarme, um_toque, curva, passe_baixo, passe_alto,
    visao_jogo, tomada_decisao, antecipacao, trabalho_equipe, coragem,
    posicionamento_ofensivo, posicionamento_defensivo,
    cabeceio, acuracia_chute, forca_chute,
    reflexo, posicionamento_gol, defesa_aerea, pegada, saida_gol, um_contra_um,
    distribuicao_curta, distribuicao_longa, tempo_reacao, comando_area
  ) VALUES (
    v_player_id,
    (v_attrs ->> 'velocidade')::NUMERIC, (v_attrs ->> 'aceleracao')::NUMERIC,
    (v_attrs ->> 'agilidade')::NUMERIC, (v_attrs ->> 'forca')::NUMERIC,
    (v_attrs ->> 'equilibrio')::NUMERIC, (v_attrs ->> 'resistencia')::NUMERIC,
    (v_attrs ->> 'pulo')::NUMERIC, (v_attrs ->> 'stamina')::NUMERIC,
    (v_attrs ->> 'drible')::NUMERIC, (v_attrs ->> 'controle_bola')::NUMERIC,
    (v_attrs ->> 'marcacao')::NUMERIC, (v_attrs ->> 'desarme')::NUMERIC,
    (v_attrs ->> 'um_toque')::NUMERIC, (v_attrs ->> 'curva')::NUMERIC,
    (v_attrs ->> 'passe_baixo')::NUMERIC, (v_attrs ->> 'passe_alto')::NUMERIC,
    (v_attrs ->> 'visao_jogo')::NUMERIC, (v_attrs ->> 'tomada_decisao')::NUMERIC,
    (v_attrs ->> 'antecipacao')::NUMERIC, (v_attrs ->> 'trabalho_equipe')::NUMERIC,
    (v_attrs ->> 'coragem')::NUMERIC,
    (v_attrs ->> 'posicionamento_ofensivo')::NUMERIC, (v_attrs ->> 'posicionamento_defensivo')::NUMERIC,
    (v_attrs ->> 'cabeceio')::NUMERIC, (v_attrs ->> 'acuracia_chute')::NUMERIC,
    (v_attrs ->> 'forca_chute')::NUMERIC,
    (v_attrs ->> 'reflexo')::NUMERIC, (v_attrs ->> 'posicionamento_gol')::NUMERIC,
    (v_attrs ->> 'defesa_aerea')::NUMERIC, (v_attrs ->> 'pegada')::NUMERIC,
    (v_attrs ->> 'saida_gol')::NUMERIC, (v_attrs ->> 'um_contra_um')::NUMERIC,
    (v_attrs ->> 'distribuicao_curta')::NUMERIC, (v_attrs ->> 'distribuicao_longa')::NUMERIC,
    (v_attrs ->> 'tempo_reacao')::NUMERIC, (v_attrs ->> 'comando_area')::NUMERIC
  );

  INSERT INTO contracts (player_profile_id, status, weekly_salary, release_clause)
  VALUES (v_player_id, 'free_agent', 0, 0);

  -- ── Welcome notifications: now keyed (PT/EN renders client-side) ──
  -- Keep title/body filled with PT text as fallback for any client
  -- that's still on the legacy renderer.
  INSERT INTO notifications (user_id, type, title, body, i18n_key) VALUES
    (v_user_id, 'system',
      'Bem-vindo ao Football Identity!',
      'Seu atleta foi criado com sucesso. Explore o dashboard e prepare-se para sua carreira.',
      'welcome'),
    (v_user_id, 'training',
      'Treino Disponível',
      'Clique nos atributos na tela de Atributos para treinar e evoluir.',
      'training_available');

  RETURN v_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_player_profile(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, CHAR) TO authenticated;

-- ── Update forum trigger to use i18n keys ──
-- Re-emit the trigger function body (defined in 20260416070000)
-- but writing i18n_key + i18n_params on top of legacy fields.
CREATE OR REPLACE FUNCTION public.forum_comment_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic record;
  v_actor_name TEXT;
  v_title TEXT;
  v_body TEXT;
  v_link TEXT;
BEGIN
  SELECT id, title, author_id INTO v_topic FROM public.forum_topics WHERE id = NEW.topic_id;
  IF v_topic IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;
  IF v_actor_name IS NULL THEN v_actor_name := 'alguém'; END IF;

  v_title := 'Nova resposta no fórum';
  v_body := v_actor_name || ' comentou em "' || v_topic.title || '"';
  v_link := '/forum/t/' || v_topic.id::text;

  INSERT INTO public.notifications (user_id, type, title, body, link, i18n_key, i18n_params)
  SELECT DISTINCT uid, 'forum', v_title, v_body, v_link,
         'forum_comment',
         jsonb_build_object('actor', v_actor_name, 'topic', v_topic.title)
  FROM (
    SELECT v_topic.author_id AS uid
    UNION
    SELECT DISTINCT author_id AS uid
    FROM public.forum_comments
    WHERE topic_id = NEW.topic_id AND author_id IS NOT NULL
  ) all_uids
  WHERE uid IS NOT NULL AND uid <> NEW.author_id;

  RETURN NEW;
END;
$$;
