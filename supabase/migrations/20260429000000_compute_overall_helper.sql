-- ═══════════════════════════════════════════════════════════
-- Fix overall divisor: 21.3 → 21.0 (real sum of weights)
--
-- The field-player overall formula divided by 21.3, but the
-- actual sum of weights is 21.0
-- (7×1 + 1×0.9 + 11×0.8 + 3×0.7 + 2×0.6 + 2×0.5).
-- Result: a player with all attrs=90 ended up with overall=89,
-- and growth was systematically capped ~1.4% below intent.
--
-- Fix-forward: extract the formula into a single helper
-- (`compute_player_overall`) and rewire the four call sites
-- (train_attribute, auto_train_attribute, apply_aging_decay,
-- create_player_profile) to call it. Then recompute every
-- player's overall from current attribute values.
-- ═══════════════════════════════════════════════════════════

-- ── 1. Helper: single source of truth for overall ──
CREATE OR REPLACE FUNCTION public.compute_player_overall(p_player_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_gk BOOLEAN;
  v_overall NUMERIC;
BEGIN
  SELECT (primary_position = 'GK') INTO v_is_gk
    FROM public.player_profiles WHERE id = p_player_profile_id;

  IF v_is_gk IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_is_gk THEN
    SELECT round((reflexo + posicionamento_gol + defesa_aerea + pegada
                + saida_gol + um_contra_um + tempo_reacao + comando_area) / 8.0)
      INTO v_overall
      FROM public.player_attributes
      WHERE player_profile_id = p_player_profile_id;
  ELSE
    SELECT round((
      velocidade*1 + aceleracao*1 + agilidade*1 + forca*0.8 + equilibrio*0.7 + resistencia*0.8 +
      pulo*0.5 + stamina*0.8 + drible*1 + controle_bola*1 + marcacao*0.8 + desarme*0.8 +
      um_toque*0.8 + curva*0.6 + passe_baixo*1 + passe_alto*0.8 + visao_jogo*1 +
      tomada_decisao*0.9 + antecipacao*0.8 + trabalho_equipe*0.7 + coragem*0.6 +
      posicionamento_ofensivo*0.8 + posicionamento_defensivo*0.8 +
      cabeceio*0.5 + acuracia_chute*0.8 + forca_chute*0.7
    ) / 21.0)
      INTO v_overall
      FROM public.player_attributes
      WHERE player_profile_id = p_player_profile_id;
  END IF;

  RETURN v_overall::INTEGER;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_player_overall(UUID) TO authenticated, service_role;


-- ── 2. train_attribute: route overall through helper ──
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
  v_cap INTEGER;
  v_fit_mult NUMERIC := 1.0;
  v_pace_factor CONSTANT NUMERIC := 0.40;

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
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT (p_attribute_key = ANY(v_all_keys)) THEN
    RAISE EXCEPTION 'Invalid attribute key: %', p_attribute_key;
  END IF;

  SELECT * INTO v_player FROM player_profiles
  WHERE id = p_player_profile_id AND user_id = v_user_id FOR UPDATE;
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Player not found or not owned by user';
  END IF;

  IF v_player.retirement_status = 'retired' THEN
    RAISE EXCEPTION 'Jogador aposentado não pode mais treinar.';
  END IF;

  IF v_player.energy_current < v_energy_cost THEN
    RAISE EXCEPTION 'Insufficient energy. Required: %, Available: %', v_energy_cost, v_player.energy_current;
  END IF;

  EXECUTE format('SELECT %I FROM player_attributes WHERE player_profile_id = $1', p_attribute_key)
    INTO v_current_val USING p_player_profile_id;
  IF v_current_val IS NULL THEN
    RAISE EXCEPTION 'Player attributes not found';
  END IF;

  v_cap := public.get_attribute_cap(
    v_player.archetype,
    v_player.height,
    v_player.primary_position,
    p_attribute_key
  );

  IF v_current_val >= v_cap THEN
    RAISE EXCEPTION 'Este atributo atingiu o limite do seu tipo (% | % | %) e não pode mais evoluir.',
      COALESCE(v_player.archetype, '-'),
      COALESCE(v_player.height, '-'),
      COALESCE(v_player.primary_position, '-');
  END IF;

  v_growth_rate := CASE
    WHEN v_player.age <= 20 THEN 1.5
    WHEN v_player.age <= 24 THEN 1.2
    WHEN v_player.age <= 29 THEN 1.0
    WHEN v_player.age <= 33 THEN 0.7
    WHEN v_player.age <= 36 THEN 0.4
    ELSE 0.2
  END;

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

  v_roll := random();
  IF v_roll < 0.10 THEN
    v_growth := v_growth_rate + random() * 0.30;
  ELSIF v_roll < 0.90 THEN
    v_growth := v_growth_rate + 0.30 + random() * 0.49;
  ELSE
    v_growth := v_growth_rate + 0.79 + random() * 0.20;
  END IF;

  v_growth := v_growth * v_tier_mult;

  v_club_id := v_player.club_id::UUID;
  IF v_club_id IS NOT NULL THEN
    SELECT mp.coach_type INTO v_coach_type
    FROM clubs c JOIN manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE c.id = v_club_id;
    v_coach_type := COALESCE(v_coach_type, 'all_around');

    v_coach_bonus := CASE v_coach_type
      WHEN 'defensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_defensive) THEN 0.15 ELSE 0 END
      WHEN 'offensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_offensive) THEN 0.15 ELSE 0 END
      WHEN 'technical' THEN CASE WHEN p_attribute_key = ANY(v_coach_technical) THEN 0.15 ELSE 0 END
      ELSE 0.10
    END;

    SELECT COALESCE(cf.level, 0) INTO v_tc_level
    FROM club_facilities cf WHERE cf.club_id = v_club_id AND cf.facility_type = 'training_center';

    v_tc_bonus := CASE v_tc_level
      WHEN 1 THEN 0.05 WHEN 2 THEN 0.10 WHEN 3 THEN 0.18 WHEN 4 THEN 0.28 WHEN 5 THEN 0.40 ELSE 0
    END;
  END IF;

  SELECT COALESCE(MAX(si.bonus_value), 0) / 100.0 INTO v_trainer_bonus
  FROM store_purchases sp
  JOIN store_items si ON si.id = sp.store_item_id AND si.category = 'trainer'
  WHERE sp.player_profile_id = p_player_profile_id AND sp.status IN ('active', 'cancelling');

  v_growth := v_growth * (1 + v_coach_bonus + v_tc_bonus + v_trainer_bonus);

  v_fit_mult := public.get_training_multiplier(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
  );
  v_growth := v_growth * v_fit_mult;

  v_growth := v_growth * v_pace_factor;

  v_growth := round(v_growth * 100) / 100.0;

  v_new_val := LEAST(v_cap, round((v_current_val + v_growth) * 100) / 100.0);

  EXECUTE format('UPDATE player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  INSERT INTO training_history (player_profile_id, attribute_key, old_value, new_value, growth)
  VALUES (p_player_profile_id, p_attribute_key, v_current_val, v_new_val, v_new_val - v_current_val);

  v_new_overall := public.compute_player_overall(p_player_profile_id);

  UPDATE player_profiles
  SET energy_current = energy_current - v_energy_cost,
      last_trained_at = now(),
      overall = v_new_overall,
      updated_at = now()
  WHERE id = p_player_profile_id;

  RETURN jsonb_build_object(
    'attribute', p_attribute_key,
    'old_value', v_current_val,
    'new_value', v_new_val,
    'growth', v_new_val - v_current_val,
    'cap', v_cap,
    'new_overall', v_new_overall,
    'energy_remaining', v_player.energy_current - v_energy_cost,
    'fit_multiplier', v_fit_mult,
    'pace_factor', v_pace_factor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.train_attribute(UUID, TEXT) TO authenticated;


-- ── 3. auto_train_attribute: route overall through helper ──
CREATE OR REPLACE FUNCTION public.auto_train_attribute(
  p_player_profile_id UUID,
  p_attribute_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_cap INTEGER;
  v_fit_mult NUMERIC := 1.0;
  v_pace_factor CONSTANT NUMERIC := 0.40;

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
  IF NOT (p_attribute_key = ANY(v_all_keys)) THEN
    RAISE EXCEPTION 'Invalid attribute key: %', p_attribute_key;
  END IF;

  SELECT * INTO v_player FROM public.player_profiles
    WHERE id = p_player_profile_id FOR UPDATE;
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF v_player.retirement_status = 'retired' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'retired');
  END IF;

  IF v_player.energy_current < v_energy_cost THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'insufficient_energy', 'energy', v_player.energy_current);
  END IF;

  EXECUTE format('SELECT %I FROM public.player_attributes WHERE player_profile_id = $1', p_attribute_key)
    INTO v_current_val USING p_player_profile_id;
  IF v_current_val IS NULL THEN
    RAISE EXCEPTION 'Player attributes not found';
  END IF;

  v_cap := public.get_attribute_cap(
    v_player.archetype,
    v_player.height,
    v_player.primary_position,
    p_attribute_key
  );
  IF v_current_val >= v_cap THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'at_cap', 'cap', v_cap, 'value', v_current_val);
  END IF;

  v_growth_rate := CASE
    WHEN v_player.age <= 20 THEN 1.5
    WHEN v_player.age <= 24 THEN 1.2
    WHEN v_player.age <= 29 THEN 1.0
    WHEN v_player.age <= 33 THEN 0.7
    WHEN v_player.age <= 36 THEN 0.4
    ELSE 0.2
  END;

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

  v_roll := random();
  IF v_roll < 0.10 THEN
    v_growth := v_growth_rate + random() * 0.30;
  ELSIF v_roll < 0.90 THEN
    v_growth := v_growth_rate + 0.30 + random() * 0.49;
  ELSE
    v_growth := v_growth_rate + 0.79 + random() * 0.20;
  END IF;

  v_growth := v_growth * v_tier_mult;

  v_club_id := v_player.club_id::UUID;
  IF v_club_id IS NOT NULL THEN
    SELECT mp.coach_type INTO v_coach_type
      FROM public.clubs c
      JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
      WHERE c.id = v_club_id;
    v_coach_type := COALESCE(v_coach_type, 'all_around');

    v_coach_bonus := CASE v_coach_type
      WHEN 'defensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_defensive) THEN 0.15 ELSE 0 END
      WHEN 'offensive' THEN CASE WHEN p_attribute_key = ANY(v_coach_offensive) THEN 0.15 ELSE 0 END
      WHEN 'technical' THEN CASE WHEN p_attribute_key = ANY(v_coach_technical) THEN 0.15 ELSE 0 END
      ELSE 0.10
    END;

    SELECT level INTO v_tc_level
      FROM public.club_facilities
      WHERE club_id = v_club_id AND facility_type = 'training_center';
    v_tc_level := COALESCE(v_tc_level, 0);

    v_tc_bonus := CASE v_tc_level
      WHEN 1 THEN 0.05
      WHEN 2 THEN 0.10
      WHEN 3 THEN 0.18
      WHEN 4 THEN 0.28
      WHEN 5 THEN 0.40
      ELSE 0
    END;
  END IF;

  SELECT COALESCE(MAX(si.bonus_value), 0) INTO v_trainer_bonus
    FROM public.store_purchases sp
    JOIN public.store_items si ON si.id = sp.store_item_id
    WHERE sp.player_profile_id = p_player_profile_id
      AND sp.status IN ('active','cancelling')
      AND si.category = 'trainer';
  v_trainer_bonus := COALESCE(v_trainer_bonus, 0) / 100;

  v_growth := v_growth * (1 + v_coach_bonus + v_tc_bonus + v_trainer_bonus);

  v_fit_mult := public.get_training_multiplier(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
  );
  v_growth := v_growth * v_fit_mult;

  v_growth := v_growth * v_pace_factor;

  v_new_val := LEAST(v_cap, v_current_val + v_growth);
  v_growth := v_new_val - v_current_val;

  EXECUTE format('UPDATE public.player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  v_new_overall := public.compute_player_overall(p_player_profile_id);

  UPDATE public.player_profiles
    SET energy_current = GREATEST(0, energy_current - v_energy_cost),
        last_trained_at = NOW(),
        overall = v_new_overall
    WHERE id = p_player_profile_id;

  INSERT INTO public.training_history (player_profile_id, attribute_key, old_value, new_value, growth, trained_at)
    VALUES (p_player_profile_id, p_attribute_key, v_current_val, v_new_val, v_growth, NOW());

  RETURN jsonb_build_object(
    'skipped', false,
    'attribute', p_attribute_key,
    'old_value', v_current_val,
    'new_value', v_new_val,
    'growth', v_growth,
    'new_overall', v_new_overall,
    'energy_remaining', GREATEST(0, v_player.energy_current - v_energy_cost),
    'fit_multiplier', v_fit_mult,
    'pace_factor', v_pace_factor
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) TO service_role;


-- ── 4. apply_aging_decay: route overall through helper ──
CREATE OR REPLACE FUNCTION public.apply_aging_decay(p_player_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age INT;
  v_key TEXT;
  v_decay NUMERIC;
  v_current NUMERIC;
  v_new_val NUMERIC;
  v_new_overall NUMERIC;
  v_is_gk BOOLEAN;
  v_total_lost NUMERIC := 0;
  v_all_keys TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina',
    'drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto',
    'visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute',
    'reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um',
    'distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area'
  ];
BEGIN
  SELECT age, (primary_position = 'GK')
    INTO v_age, v_is_gk
    FROM public.player_profiles
    WHERE id = p_player_profile_id;

  IF v_age IS NULL OR v_age < 33 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'under_33');
  END IF;

  FOREACH v_key IN ARRAY v_all_keys LOOP
    v_decay := public.get_aging_decay(v_age, public.get_attribute_decay_category(v_key));
    IF v_decay > 0 THEN
      EXECUTE format('SELECT %I FROM public.player_attributes WHERE player_profile_id = $1', v_key)
        INTO v_current USING p_player_profile_id;
      v_new_val := GREATEST(10, v_current - v_decay);
      IF v_new_val <> v_current THEN
        EXECUTE format('UPDATE public.player_attributes SET %I = $1 WHERE player_profile_id = $2', v_key)
          USING v_new_val, p_player_profile_id;
        v_total_lost := v_total_lost + (v_current - v_new_val);
      END IF;
    END IF;
  END LOOP;

  v_new_overall := public.compute_player_overall(p_player_profile_id);

  UPDATE public.player_profiles
    SET overall = v_new_overall, updated_at = NOW()
    WHERE id = p_player_profile_id;

  RETURN jsonb_build_object(
    'applied', true,
    'age', v_age,
    'total_lost', v_total_lost,
    'new_overall', v_new_overall
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_aging_decay(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_aging_decay(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_aging_decay(UUID) TO service_role;


-- ── 5. create_player_profile: route overall through helper ──
-- INSERT player_profiles with overall=0 placeholder, INSERT
-- player_attributes, then UPDATE overall via the helper. This
-- lets us drop the inline JSONB-based formula entirely.
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
  v_overall INTEGER;

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

  INSERT INTO player_profiles (user_id, full_name, age, dominant_foot, primary_position, archetype, height, overall, reputation, money, weekly_salary, energy_current, energy_max, country_code)
  VALUES (v_user_id, trim(p_full_name), 18, p_dominant_foot, p_primary_position, p_body_type, p_height, 0, 50, 5000, 0, 100, 100, v_country)
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

  v_overall := public.compute_player_overall(v_player_id);
  UPDATE player_profiles SET overall = v_overall WHERE id = v_player_id;

  INSERT INTO contracts (player_profile_id, status, weekly_salary, release_clause)
  VALUES (v_player_id, 'free_agent', 0, 0);

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


-- ── 6. Recompute every existing player's overall via the helper ──
UPDATE public.player_profiles
  SET overall = public.compute_player_overall(id)
  WHERE id IS NOT NULL;
