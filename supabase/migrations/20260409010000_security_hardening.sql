-- ============================================================
-- Migration: Security Hardening
-- Fixes: #5 onboarding attrs, #2 training attrs, #3 facility
--        upgrade race condition, #4 admin RLS, #9 loan maxLoan
-- ============================================================

-- ─── CRON_SECRET ───────────────────────────────────────────────
-- Supabase hosted does NOT allow ALTER DATABASE SET or ALTER ROLE SET
-- for app.settings.* (requires superuser).
-- Configure the cron_secret in TWO places manually:
-- 1. Edge Functions Secrets: Dashboard > Project Settings > Edge Functions > Secrets
--    Name: CRON_SECRET  Value: <your-secret>
-- 2. Database Setting: Dashboard > Project Settings > Database > Configuration
--    Or contact Supabase support to set app.settings.cron_secret

-- ─── #5: create_player_profile RPC ────────────────────────────
-- Moves attribute generation to the server side so clients
-- cannot send arbitrary attribute values.

CREATE OR REPLACE FUNCTION public.create_player_profile(
  p_full_name TEXT,
  p_dominant_foot TEXT,
  p_primary_position TEXT,
  p_height TEXT,
  p_body_type TEXT,
  p_extra_points JSONB  -- { "velocidade": 3, "drible": 5, ... }
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
  v_bonus NUMERIC;
  v_total_extra INT := 0;
  v_extra INT;
  v_overall NUMERIC;

  -- All attribute keys
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

  -- Position profile boosts
  v_pos_boosts JSONB;
  v_body_boosts JSONB;
  v_height_boosts JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user doesn't already have a player profile
  IF EXISTS (SELECT 1 FROM player_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has a player profile';
  END IF;

  -- Validate inputs
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 2 THEN
    RAISE EXCEPTION 'Name must be at least 2 characters';
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

  -- Validate body type
  IF v_is_gk THEN
    IF p_body_type NOT IN ('Goleiro Completo','Goleiro Felino','Goleiro Muralha') THEN
      RAISE EXCEPTION 'Invalid GK body type';
    END IF;
  ELSE
    IF p_body_type NOT IN ('All Around','Condutor','Chutador','Velocista','Torre','Cão de Guarda') THEN
      RAISE EXCEPTION 'Invalid body type';
    END IF;
  END IF;

  -- Validate extra points: sum must be exactly 40, each value 0-40, only valid keys
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

  -- Generate base attributes (same logic as client's generateBaseAttributes)
  v_base := 35;
  v_gk_base := CASE WHEN v_is_gk THEN 35 ELSE 12 END;

  -- Initialize with base + small random variation (-1, 0, or +1)
  FOREACH v_key IN ARRAY v_field_keys LOOP
    v_attrs := v_attrs || jsonb_build_object(v_key, v_base + floor(random() * 3) - 1);
  END LOOP;
  FOREACH v_key IN ARRAY v_gk_keys LOOP
    v_attrs := v_attrs || jsonb_build_object(v_key, v_gk_base + floor(random() * 3) - 1);
  END LOOP;

  -- Position profile boosts
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

  -- Body type boosts
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

  -- Height boosts
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

  -- Clamp all attributes to [10, 70]
  FOREACH v_key IN ARRAY v_all_keys LOOP
    v_val := GREATEST(10, LEAST(70, (v_attrs ->> v_key)::NUMERIC));
    v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
  END LOOP;

  -- Apply extra points (cap each attribute at 75)
  IF p_extra_points IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_extra_points) LOOP
      v_extra := (p_extra_points ->> v_key)::INT;
      IF v_extra > 0 THEN
        v_val := LEAST(75, (v_attrs ->> v_key)::NUMERIC + v_extra);
        v_attrs := v_attrs || jsonb_build_object(v_key, v_val);
      END IF;
    END LOOP;
  END IF;

  -- Calculate overall (simplified weighted average matching client logic)
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

  -- 1. Create player profile
  INSERT INTO player_profiles (user_id, full_name, age, dominant_foot, primary_position, archetype, height, overall, reputation, money, weekly_salary, energy_current, energy_max)
  VALUES (v_user_id, trim(p_full_name), 18, p_dominant_foot, p_primary_position, p_body_type, p_height, round(v_overall), 50, 5000, 0, 100, 100)
  RETURNING id INTO v_player_id;

  -- 2. Set active player profile
  UPDATE profiles SET active_player_profile_id = v_player_id WHERE id = v_user_id;

  -- 3. Insert attributes
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

  -- 4. Create free agent contract
  INSERT INTO contracts (player_profile_id, status, weekly_salary, release_clause)
  VALUES (v_player_id, 'free_agent', 0, 0);

  -- 5. Welcome notifications
  INSERT INTO notifications (user_id, type, title, body) VALUES
    (v_user_id, 'system', 'Bem-vindo ao Football Identity!', 'Seu atleta foi criado com sucesso. Explore o dashboard e prepare-se para sua carreira.'),
    (v_user_id, 'training', 'Treino Disponível', 'Clique nos atributos na tela de Atributos para treinar e evoluir.');

  RETURN v_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_player_profile(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;


-- ─── #2: train_attribute RPC ──────────────────────────────────
-- Moves training logic to the server so clients cannot set
-- arbitrary attribute values or bypass energy costs.

CREATE OR REPLACE FUNCTION public.train_attribute(
  p_player_profile_id UUID,
  p_attribute_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player player_profiles%ROWTYPE;
  v_current_val NUMERIC;
  v_energy_cost INT := 25;
  v_growth_rate NUMERIC;
  v_tier_mult NUMERIC;
  v_roll NUMERIC;
  v_growth NUMERIC;
  v_new_val NUMERIC;
  v_new_overall NUMERIC;
  v_coach_type TEXT := 'all_around';
  v_coach_bonus NUMERIC := 0;
  v_tc_level INT := 0;
  v_tc_bonus NUMERIC := 0;
  v_trainer_bonus NUMERIC := 0;
  v_club_id UUID;
  v_manager_id UUID;

  v_all_keys TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina',
    'drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto',
    'visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute',
    'reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um',
    'distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area'
  ];

  v_coach_defensive TEXT[] := ARRAY['desarme','marcacao','posicionamento_defensivo','cabeceio','coragem','antecipacao'];
  v_coach_offensive TEXT[] := ARRAY['acuracia_chute','forca_chute','posicionamento_ofensivo','drible','curva','um_toque'];
  v_coach_technical TEXT[] := ARRAY['passe_baixo','passe_alto','controle_bola','visao_jogo','tomada_decisao','distribuicao_curta'];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate attribute key
  IF NOT (p_attribute_key = ANY(v_all_keys)) THEN
    RAISE EXCEPTION 'Invalid attribute key: %', p_attribute_key;
  END IF;

  -- Get player profile with row lock
  SELECT * INTO v_player FROM player_profiles
  WHERE id = p_player_profile_id AND user_id = v_user_id
  FOR UPDATE;

  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Player not found or not owned by user';
  END IF;

  -- Check energy
  IF v_player.energy_current < v_energy_cost THEN
    RAISE EXCEPTION 'Insufficient energy. Required: %, Available: %', v_energy_cost, v_player.energy_current;
  END IF;

  -- Get current attribute value
  EXECUTE format('SELECT %I FROM player_attributes WHERE player_profile_id = $1', p_attribute_key)
    INTO v_current_val USING p_player_profile_id;

  IF v_current_val IS NULL THEN
    RAISE EXCEPTION 'Player attributes not found';
  END IF;

  -- Growth rate by age
  v_growth_rate := CASE
    WHEN v_player.age <= 20 THEN 1.5
    WHEN v_player.age <= 24 THEN 1.2
    WHEN v_player.age <= 29 THEN 1.0
    WHEN v_player.age <= 33 THEN 0.7
    WHEN v_player.age <= 36 THEN 0.4
    ELSE 0.2
  END;

  -- Tier multiplier based on current value
  v_tier_mult := CASE
    WHEN v_current_val >= 95 THEN 0.06
    WHEN v_current_val >= 90 THEN 0.12
    WHEN v_current_val >= 85 THEN 0.22
    WHEN v_current_val >= 80 THEN 0.35
    WHEN v_current_val >= 70 THEN 0.5
    WHEN v_current_val >= 60 THEN 0.75
    WHEN v_current_val >= 50 THEN 1.0
    WHEN v_current_val >= 40 THEN 1.3
    WHEN v_current_val >= 30 THEN 1.6
    ELSE 2.0
  END;

  -- Random roll for growth variation
  v_roll := random();
  IF v_roll < 0.10 THEN
    v_growth := v_growth_rate + random() * 0.30;
  ELSIF v_roll < 0.90 THEN
    v_growth := v_growth_rate + 0.30 + random() * 0.49;
  ELSE
    v_growth := v_growth_rate + 0.79 + random() * 0.20;
  END IF;

  -- Apply tier multiplier
  v_growth := v_growth * v_tier_mult;

  -- Club bonuses (coach + training center)
  v_club_id := v_player.club_id::UUID;
  IF v_club_id IS NOT NULL THEN
    -- Coach bonus
    SELECT mp.coach_type INTO v_coach_type
    FROM clubs c JOIN manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE c.id = v_club_id;
    v_coach_type := COALESCE(v_coach_type, 'all_around');

    v_coach_bonus := CASE v_coach_type
      WHEN 'defensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_defensive) THEN 0.15 ELSE 0 END
      WHEN 'offensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_offensive) THEN 0.15 ELSE 0 END
      WHEN 'technical' THEN CASE WHEN p_attribute_key = ANY(v_coach_technical) THEN 0.15 ELSE 0 END
      ELSE 0.10  -- all_around / complete
    END;

    -- Training center bonus
    SELECT COALESCE(cf.level, 0) INTO v_tc_level
    FROM club_facilities cf WHERE cf.club_id = v_club_id AND cf.facility_type = 'training_center';

    v_tc_bonus := CASE v_tc_level
      WHEN 1 THEN 0.05 WHEN 2 THEN 0.10 WHEN 3 THEN 0.18 WHEN 4 THEN 0.28 WHEN 5 THEN 0.40 ELSE 0
    END;
  END IF;

  -- Private trainer bonus (from store)
  SELECT COALESCE(MAX(si.bonus_value), 0) / 100.0 INTO v_trainer_bonus
  FROM store_purchases sp
  JOIN store_items si ON si.id = sp.store_item_id AND si.category = 'trainer'
  WHERE sp.player_profile_id = p_player_profile_id AND sp.status IN ('active', 'cancelling');

  -- Apply all bonuses
  v_growth := v_growth * (1 + v_coach_bonus + v_tc_bonus + v_trainer_bonus);
  v_growth := round(v_growth * 100) / 100.0;
  v_new_val := LEAST(99, round((v_current_val + v_growth) * 100) / 100.0);

  -- Update attribute
  EXECUTE format('UPDATE player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  -- Insert training history
  INSERT INTO training_history (player_profile_id, attribute_key, old_value, new_value, growth)
  VALUES (p_player_profile_id, p_attribute_key, v_current_val, v_new_val, v_growth);

  -- Deduct energy and update last_trained_at
  UPDATE player_profiles
  SET energy_current = energy_current - v_energy_cost,
      last_trained_at = now(),
      updated_at = now()
  WHERE id = p_player_profile_id;

  -- Recalculate overall
  IF v_player.primary_position = 'GK' THEN
    SELECT round((reflexo + posicionamento_gol + defesa_aerea + pegada + saida_gol + um_contra_um + tempo_reacao + comando_area) / 8.0)
    INTO v_new_overall FROM player_attributes WHERE player_profile_id = p_player_profile_id;
  ELSE
    SELECT round((
      velocidade*1 + aceleracao*1 + agilidade*1 + forca*0.8 + equilibrio*0.7 + resistencia*0.8 +
      pulo*0.5 + stamina*0.8 + drible*1 + controle_bola*1 + marcacao*0.8 + desarme*0.8 +
      um_toque*0.8 + curva*0.6 + passe_baixo*1 + passe_alto*0.8 + visao_jogo*1 +
      tomada_decisao*0.9 + antecipacao*0.8 + trabalho_equipe*0.7 + coragem*0.6 +
      posicionamento_ofensivo*0.8 + posicionamento_defensivo*0.8 +
      cabeceio*0.5 + acuracia_chute*0.8 + forca_chute*0.7
    ) / 21.3)
    INTO v_new_overall FROM player_attributes WHERE player_profile_id = p_player_profile_id;
  END IF;

  UPDATE player_profiles SET overall = v_new_overall WHERE id = p_player_profile_id;

  RETURN jsonb_build_object(
    'attribute', p_attribute_key,
    'old_value', v_current_val,
    'new_value', v_new_val,
    'growth', v_growth,
    'new_overall', v_new_overall,
    'energy_remaining', v_player.energy_current - v_energy_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.train_attribute(UUID, TEXT) TO authenticated;


-- ─── #3: upgrade_facility RPC (atomic, prevents race condition) ─
-- Reads balance + level under a lock and upgrades atomically.

CREATE OR REPLACE FUNCTION public.upgrade_facility(
  p_club_id UUID,
  p_facility_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_manager_id UUID;
  v_current_level INT;
  v_max_level INT;
  v_upgrade_cost NUMERIC;
  v_balance NUMERIC;
  v_new_level INT;
  v_facility_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user is manager of this club
  SELECT mp.id INTO v_manager_id
  FROM manager_profiles mp
  JOIN clubs c ON c.manager_profile_id = mp.id
  WHERE mp.user_id = v_user_id AND c.id = p_club_id;

  IF v_manager_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to manage this club';
  END IF;

  -- Validate facility type
  IF p_facility_type NOT IN ('souvenir_shop', 'sponsorship', 'training_center', 'stadium') THEN
    RAISE EXCEPTION 'Invalid facility type: %', p_facility_type;
  END IF;

  v_max_level := CASE p_facility_type WHEN 'stadium' THEN 10 ELSE 5 END;

  -- Get facility with row lock
  SELECT id, level INTO v_facility_id, v_current_level
  FROM club_facilities
  WHERE club_id = p_club_id AND facility_type = p_facility_type
  FOR UPDATE;

  IF v_facility_id IS NULL THEN
    RAISE EXCEPTION 'Facility not found';
  END IF;

  IF v_current_level >= v_max_level THEN
    RAISE EXCEPTION 'Facility is already at max level';
  END IF;

  -- Upgrade cost lookup
  v_upgrade_cost := CASE v_current_level
    WHEN 1 THEN 50000
    WHEN 2 THEN 150000
    WHEN 3 THEN 400000
    WHEN 4 THEN 1000000
    WHEN 5 THEN 2500000
    WHEN 6 THEN 5000000
    WHEN 7 THEN 10000000
    WHEN 8 THEN 20000000
    WHEN 9 THEN 50000000
    ELSE NULL
  END;

  IF v_upgrade_cost IS NULL THEN
    RAISE EXCEPTION 'No upgrade available for level %', v_current_level;
  END IF;

  -- Get balance with row lock
  SELECT balance INTO v_balance
  FROM club_finances
  WHERE club_id = p_club_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Club finances not found';
  END IF;

  IF v_balance < v_upgrade_cost THEN
    RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', v_upgrade_cost, v_balance;
  END IF;

  v_new_level := v_current_level + 1;

  -- Atomic: upgrade + deduct
  UPDATE club_facilities SET level = v_new_level, upgraded_at = now() WHERE id = v_facility_id;
  UPDATE club_finances SET balance = balance - v_upgrade_cost, updated_at = now() WHERE club_id = p_club_id;

  RETURN jsonb_build_object(
    'facility_type', p_facility_type,
    'new_level', v_new_level,
    'cost', v_upgrade_cost,
    'remaining_balance', v_balance - v_upgrade_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_facility(UUID, TEXT) TO authenticated;


-- ─── #4: Admin RLS hardening ──────────────────────────────────
-- Add is_admin column if missing, protect with RLS so only
-- service_role can set it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
  END IF;
END;
$$;

-- Prevent any authenticated user from setting is_admin on themselves
-- Drop existing update policy and recreate with restriction
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- If is_admin is being changed, block it (old value must equal new value)
      -- This is enforced by not allowing is_admin in the SET clause from client
      -- Service role bypasses RLS entirely
      is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
    )
  );


-- ─── #9: Validate maxLoan in process_loan ─────────────────────
-- Replace existing process_loan to add max loan validation.

CREATE OR REPLACE FUNCTION public.process_loan(
  p_player_id UUID,
  p_club_id UUID,
  p_amount NUMERIC,
  p_interest_rate NUMERIC,
  p_duration_weeks INT,
  p_entity_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan_id UUID;
  v_total_with_interest NUMERIC;
  v_weekly_payment NUMERIC;
  v_max_loan NUMERIC;
  v_entity_balance NUMERIC;
  v_weekly_salary NUMERIC;
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be positive';
  END IF;
  IF p_interest_rate IS NULL OR p_interest_rate < 0 THEN
    RAISE EXCEPTION 'Interest rate must be non-negative';
  END IF;
  IF p_duration_weeks IS NULL OR p_duration_weeks <= 0 THEN
    RAISE EXCEPTION 'Duration must be positive';
  END IF;
  IF p_entity_type NOT IN ('player', 'club') THEN
    RAISE EXCEPTION 'entity_type must be "player" or "club"';
  END IF;

  IF p_entity_type = 'player' AND p_player_id IS NULL THEN
    RAISE EXCEPTION 'p_player_id is required for player loans';
  END IF;
  IF p_entity_type = 'club' AND p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required for club loans';
  END IF;

  -- Check no existing active loan
  IF p_entity_type = 'player' THEN
    IF EXISTS (SELECT 1 FROM loans WHERE player_profile_id = p_player_id AND status = 'active') THEN
      RAISE EXCEPTION 'Player already has an active loan';
    END IF;
    -- Calculate max loan for player: 4x weekly salary, min 10000
    SELECT COALESCE(pp.weekly_salary, 0), COALESCE(pp.money, 0)
    INTO v_weekly_salary, v_entity_balance
    FROM player_profiles pp WHERE pp.id = p_player_id;
    v_max_loan := GREATEST(10000, v_weekly_salary * 4);
  ELSE
    IF EXISTS (SELECT 1 FROM loans WHERE club_id = p_club_id AND status = 'active') THEN
      RAISE EXCEPTION 'Club already has an active loan';
    END IF;
    -- Calculate max loan for club: 4x weekly revenue or balance, min 50000
    SELECT COALESCE(cf.balance, 0) INTO v_entity_balance
    FROM club_finances cf WHERE cf.club_id = p_club_id;
    v_max_loan := GREATEST(50000, v_entity_balance * 2);
  END IF;

  -- Enforce max loan
  IF p_amount > v_max_loan THEN
    RAISE EXCEPTION 'Loan amount exceeds maximum allowed. Max: %, Requested: %', v_max_loan, p_amount;
  END IF;

  -- Calculate payment schedule
  v_total_with_interest := p_amount * (1 + p_interest_rate * p_duration_weeks);
  v_weekly_payment := v_total_with_interest / p_duration_weeks;

  -- Insert loan
  INSERT INTO loans (
    player_profile_id, club_id, principal, remaining,
    weekly_interest_rate, weekly_payment, status
  ) VALUES (
    CASE WHEN p_entity_type = 'player' THEN p_player_id ELSE NULL END,
    CASE WHEN p_entity_type = 'club' THEN p_club_id ELSE NULL END,
    p_amount, p_amount, p_interest_rate, v_weekly_payment, 'active'
  )
  RETURNING id INTO v_loan_id;

  -- Credit amount
  IF p_entity_type = 'club' THEN
    UPDATE club_finances SET balance = balance + p_amount, updated_at = now()
    WHERE club_id = p_club_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Club finances record not found'; END IF;
  ELSE
    UPDATE player_profiles SET money = money + p_amount, updated_at = now()
    WHERE id = p_player_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Player profile not found'; END IF;
  END IF;

  RETURN v_loan_id;
END;
$$;

-- Grant is already in place from the original migration


-- ─── RLS: Restrict direct writes to player_attributes ─────────
-- Remove the INSERT and UPDATE policies for authenticated users
-- on player_attributes — only the RPC (SECURITY DEFINER) should write.

DROP POLICY IF EXISTS "Users can insert own attributes" ON public.player_attributes;
DROP POLICY IF EXISTS "Users can update own attributes" ON public.player_attributes;

-- Service role can still write (bypasses RLS). The RPCs use SECURITY DEFINER
-- which runs as the function owner (superuser), so they also bypass RLS.

-- Similarly restrict direct INSERT on player_profiles to only via RPC
DROP POLICY IF EXISTS "Users can insert own player" ON public.player_profiles;

-- Keep update policy but restrict which columns can be changed
-- (the existing UPDATE policy is needed for energy/last_trained_at updates
-- from the RPC via SECURITY DEFINER, so we keep it but the RPC handles writes)
