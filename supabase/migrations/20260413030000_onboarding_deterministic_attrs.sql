-- ═══════════════════════════════════════════════════════════
-- Onboarding: make base attribute generation deterministic.
--
-- Problem: the client preview used Math.random() to apply a ±1 jitter
-- to each base attribute, then the server's create_player_profile RPC
-- also used random() for the SAME jitter independently. Different
-- seeds → different values → the persisted player didn't match what
-- the user saw while distributing points.
--
-- Fix: drop the jitter in the RPC (client has the same change).
-- Base = 35 for every field attribute, 12 for GK attrs (or 35 when
-- the player is a goalkeeper). Position / body / height boosts and
-- user-distributed extra points are all deterministic, so the
-- preview now matches persistence exactly.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_player_profile(
  p_full_name TEXT,
  p_dominant_foot TEXT,
  p_primary_position TEXT,
  p_height TEXT,
  p_body_type TEXT,
  p_extra_points JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player_id UUID;
  v_base NUMERIC;
  v_gk_base NUMERIC;
  v_is_gk BOOLEAN;
  v_attrs JSONB := '{}';
  v_key TEXT;
  v_val NUMERIC;
  v_total_extra INT := 0;
  v_extra INT;
  v_overall NUMERIC;

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

  v_pos_boosts JSONB;
  v_body_boosts JSONB;
  v_height_boosts JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM player_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has a player profile';
  END IF;

  IF length(trim(p_full_name)) < 2 THEN
    RAISE EXCEPTION 'Name too short';
  END IF;
  IF p_dominant_foot NOT IN ('right', 'left') THEN
    RAISE EXCEPTION 'Invalid dominant foot';
  END IF;
  IF p_primary_position NOT IN ('GK','CB','LB','RB','DM','CM','CAM','LW','RW','ST') THEN
    RAISE EXCEPTION 'Invalid position';
  END IF;
  IF p_height NOT IN ('Muito Baixo','Baixo','Médio','Alto','Muito Alto') THEN
    RAISE EXCEPTION 'Invalid height';
  END IF;

  v_is_gk := (p_primary_position = 'GK');
  v_all_keys := v_field_keys || v_gk_keys;

  IF v_is_gk THEN
    IF p_body_type NOT IN ('Goleiro Completo','Goleiro Felino','Goleiro Muralha') THEN
      RAISE EXCEPTION 'Invalid GK body type';
    END IF;
  ELSE
    IF p_body_type NOT IN ('All Around','Condutor','Chutador','Velocista','Torre','Cão de Guarda') THEN
      RAISE EXCEPTION 'Invalid body type';
    END IF;
  END IF;

  v_total_extra := 0;
  IF p_extra_points IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_extra_points) LOOP
      IF NOT (v_key = ANY(v_all_keys)) THEN
        RAISE EXCEPTION 'Invalid attribute key in extra_points: %', v_key;
      END IF;
      v_extra := (p_extra_points ->> v_key)::INT;
      IF v_extra < 0 THEN
        RAISE EXCEPTION 'Extra points cannot be negative for %', v_key;
      END IF;
      v_total_extra := v_total_extra + v_extra;
    END LOOP;
  END IF;

  IF v_total_extra <> 40 THEN
    RAISE EXCEPTION 'Extra points must sum to exactly 40, got %', v_total_extra;
  END IF;

  v_base := 35;
  v_gk_base := CASE WHEN v_is_gk THEN 35 ELSE 12 END;

  -- Deterministic base (no jitter) — preview now matches persistence.
  FOREACH v_key IN ARRAY v_field_keys LOOP
    v_attrs := v_attrs || jsonb_build_object(v_key, v_base);
  END LOOP;
  FOREACH v_key IN ARRAY v_gk_keys LOOP
    v_attrs := v_attrs || jsonb_build_object(v_key, v_gk_base);
  END LOOP;

  v_pos_boosts := CASE p_primary_position
    WHEN 'GK' THEN '{"reflexo":15,"posicionamento_gol":12,"pegada":10,"defesa_aerea":10,"saida_gol":8,"tempo_reacao":10,"comando_area":8,"velocidade":-10,"drible":-15,"acuracia_chute":-15}'::JSONB
    WHEN 'CB' THEN '{"marcacao":8,"desarme":8,"forca":6,"cabeceio":6,"posicionamento_defensivo":8,"coragem":6,"drible":-5,"posicionamento_ofensivo":-5}'::JSONB
    WHEN 'LB' THEN '{"velocidade":6,"aceleracao":6,"resistencia":6,"posicionamento_defensivo":4,"marcacao":4}'::JSONB
    WHEN 'RB' THEN '{"velocidade":6,"aceleracao":6,"resistencia":6,"posicionamento_defensivo":4,"marcacao":4}'::JSONB
    WHEN 'DM' THEN '{"marcacao":6,"desarme":8,"posicionamento_defensivo":8,"antecipacao":6,"trabalho_equipe":4}'::JSONB
    WHEN 'CM' THEN '{"passe_baixo":6,"visao_jogo":4,"tomada_decisao":4,"trabalho_equipe":4,"resistencia":4}'::JSONB
    WHEN 'CAM' THEN '{"visao_jogo":8,"passe_baixo":6,"drible":6,"um_toque":6,"posicionamento_ofensivo":6}'::JSONB
    WHEN 'LW' THEN '{"velocidade":8,"aceleracao":6,"drible":8,"agilidade":6,"posicionamento_ofensivo":4}'::JSONB
    WHEN 'RW' THEN '{"velocidade":8,"aceleracao":6,"drible":8,"agilidade":6,"posicionamento_ofensivo":4}'::JSONB
    WHEN 'ST' THEN '{"acuracia_chute":8,"forca_chute":6,"posicionamento_ofensivo":8,"cabeceio":4,"antecipacao":4}'::JSONB
    ELSE '{}'::JSONB
  END;

  FOR v_key IN SELECT jsonb_object_keys(v_pos_boosts) LOOP
    v_val := GREATEST(10, LEAST(65, COALESCE((v_attrs ->> v_key)::NUMERIC, 30) + (v_pos_boosts ->> v_key)::NUMERIC));
    v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
  END LOOP;

  v_body_boosts := CASE p_body_type
    WHEN 'All Around' THEN '{"velocidade":3,"forca":3,"drible":3,"passe_baixo":3,"acuracia_chute":3,"cabeceio":3,"marcacao":3,"visao_jogo":3,"resistencia":3,"controle_bola":3}'::JSONB
    WHEN 'Condutor' THEN '{"controle_bola":6,"passe_baixo":6,"passe_alto":5,"drible":5,"um_toque":5,"visao_jogo":4,"curva":4,"tomada_decisao":3}'::JSONB
    WHEN 'Chutador' THEN '{"acuracia_chute":7,"forca_chute":6,"curva":4,"posicionamento_ofensivo":4,"antecipacao":3,"cabeceio":3}'::JSONB
    WHEN 'Velocista' THEN '{"velocidade":7,"aceleracao":6,"agilidade":5,"stamina":5,"resistencia":4,"equilibrio":3,"drible":3}'::JSONB
    WHEN 'Torre' THEN '{"cabeceio":7,"pulo":6,"forca":6,"equilibrio":4,"posicionamento_defensivo":3,"posicionamento_ofensivo":3,"defesa_aerea":3}'::JSONB
    WHEN 'Cão de Guarda' THEN '{"marcacao":7,"desarme":6,"posicionamento_defensivo":6,"coragem":5,"antecipacao":4,"forca":4,"trabalho_equipe":3}'::JSONB
    WHEN 'Goleiro Completo' THEN '{"reflexo":4,"posicionamento_gol":4,"defesa_aerea":3,"pegada":3,"saida_gol":3,"um_contra_um":3,"tempo_reacao":3,"comando_area":3,"distribuicao_curta":3,"distribuicao_longa":3}'::JSONB
    WHEN 'Goleiro Felino' THEN '{"reflexo":7,"um_contra_um":6,"saida_gol":5,"agilidade":5,"tempo_reacao":4,"aceleracao":3,"velocidade":2}'::JSONB
    WHEN 'Goleiro Muralha' THEN '{"defesa_aerea":7,"comando_area":6,"pegada":5,"pulo":5,"forca":4,"posicionamento_gol":3,"cabeceio":2}'::JSONB
    ELSE '{}'::JSONB
  END;

  FOR v_key IN SELECT jsonb_object_keys(v_body_boosts) LOOP
    v_val := GREATEST(10, LEAST(65, COALESCE((v_attrs ->> v_key)::NUMERIC, 30) + (v_body_boosts ->> v_key)::NUMERIC));
    v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
  END LOOP;

  v_height_boosts := CASE p_height
    WHEN 'Muito Baixo' THEN '{"velocidade":6,"agilidade":5,"aceleracao":4,"cabeceio":-5,"pulo":-4,"forca":-3}'::JSONB
    WHEN 'Baixo' THEN '{"velocidade":3,"agilidade":3,"cabeceio":-2,"pulo":-2}'::JSONB
    WHEN 'Médio' THEN '{}'::JSONB
    WHEN 'Alto' THEN '{"cabeceio":3,"pulo":3,"forca":2,"velocidade":-2,"agilidade":-2}'::JSONB
    WHEN 'Muito Alto' THEN '{"cabeceio":6,"pulo":5,"forca":4,"velocidade":-5,"agilidade":-4,"aceleracao":-3}'::JSONB
    ELSE '{}'::JSONB
  END;

  FOR v_key IN SELECT jsonb_object_keys(v_height_boosts) LOOP
    v_val := GREATEST(10, LEAST(65, COALESCE((v_attrs ->> v_key)::NUMERIC, 30) + (v_height_boosts ->> v_key)::NUMERIC));
    v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
  END LOOP;

  FOREACH v_key IN ARRAY v_all_keys LOOP
    v_val := GREATEST(10, LEAST(70, (v_attrs ->> v_key)::NUMERIC));
    v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
  END LOOP;

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
      (v_attrs ->> 'reflexo')::NUMERIC +
      (v_attrs ->> 'posicionamento_gol')::NUMERIC +
      (v_attrs ->> 'defesa_aerea')::NUMERIC +
      (v_attrs ->> 'pegada')::NUMERIC +
      (v_attrs ->> 'saida_gol')::NUMERIC +
      (v_attrs ->> 'um_contra_um')::NUMERIC +
      (v_attrs ->> 'tempo_reacao')::NUMERIC +
      (v_attrs ->> 'comando_area')::NUMERIC
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

  INSERT INTO player_profiles (user_id, full_name, age, dominant_foot, primary_position, archetype, height, overall, reputation, money, weekly_salary, energy_current, energy_max)
  VALUES (v_user_id, trim(p_full_name), 18, p_dominant_foot, p_primary_position, p_body_type, p_height, round(v_overall), 50, 5000, 0, 100, 100)
  RETURNING id INTO v_player_id;

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

  INSERT INTO notifications (user_id, type, title, body) VALUES
    (v_user_id, 'system', 'Bem-vindo ao Football Identity!', 'Seu atleta foi criado com sucesso. Explore o dashboard e prepare-se para sua carreira.'),
    (v_user_id, 'training', 'Treino Disponível', 'Clique nos atributos na tela de Atributos para treinar e evoluir.');

  RETURN v_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_player_profile(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
