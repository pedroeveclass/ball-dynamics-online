-- ═══════════════════════════════════════════════════════════
-- Training pace calibration + aging/decay/retirement system
--
-- Three coupled changes so the progression curve feels right:
--
-- 1. Training pace factor 0.40 on every growth calculation.
--    Current "ideal comum" scenario (age ≤20, FIT BOM 1.2×, CT lvl 3,
--    matched coach) was bringing an attribute 50→90 in ~25 sessions;
--    that gave ~2 temporadas for 6 attrs. Target is 6-7 temporadas.
--    0.40 slows the ganho ~2.5×; combined with aging it lands on
--    ~6.5 temp for a jovem 18 treinando 1×/dia.
--
-- 2. Aging: +1 age on every player_profiles row at season end
--    (humanos + bots). Growth rate already decays by age band
--    (1.5/1.2/1.0/0.7/0.4/0.2), so this plugs into the existing pace.
--
-- 3. Decay from 33+: season-end subtracts points per attribute based
--    on category (físico / técnico / mental / GK) and age band.
--    33-35 is gentle enough that focused training ~mantains, 36+
--    falls off a cliff. Starting 99, sum to age 38:
--      Físicos  : -(1.5+2+2.5+4+5+6) = 99 → 78
--      Técnicos : -(0+0.5+1+2+3+4)   = 99 → 88.5
--      Mentais  : -(0+0+0.5+1+2+3)   = 99 → 92.5
--
-- 4. Retirement:
--    - `retire_player()` — human, age ≥ 38, voluntary.
--      Releases from club, flips retirement_status='retired', keeps
--      the row so the shareable stats link persists. User can still
--      call delete_player_profile() to reset.
--    - Bots at age ≥ 40 auto-deleted in advance_all_player_ages
--      (só some do mundo mesmo).
-- ═══════════════════════════════════════════════════════════

-- ── 1. retirement_status column ───────────────────────────────
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS retirement_status TEXT NOT NULL DEFAULT 'active'
    CHECK (retirement_status IN ('active', 'retired'));

CREATE INDEX IF NOT EXISTS idx_player_profiles_retirement_status
  ON public.player_profiles(retirement_status)
  WHERE retirement_status = 'retired';

-- Age upper-bound used to be 45 in the original schema; with aging
-- enabled, humans who delay retirement can legitimately pass 45.
-- Keep the lower bound (16) and drop the ceiling.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.player_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%age%<=%45%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.player_profiles DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END$$;

ALTER TABLE public.player_profiles
  DROP CONSTRAINT IF EXISTS player_profiles_age_check;

ALTER TABLE public.player_profiles
  ADD CONSTRAINT player_profiles_age_check CHECK (age >= 16);


-- ── 2. train_attribute: add pace factor 0.40 ──────────────────
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

  v_cap := public.get_attribute_cap(v_player.archetype, v_player.height, p_attribute_key);

  IF v_current_val >= v_cap THEN
    RAISE EXCEPTION 'Este atributo atingiu o limite do seu tipo (% | %) e não pode mais evoluir.',
      COALESCE(v_player.archetype, '-'), COALESCE(v_player.height, '-');
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

  -- NEW: global pace factor 0.40 (calibrates 50→90 to ~6.5 temporadas
  -- for a young jogador with good fit/setup, assuming 1 training/day
  -- rotating across 6 primary attributes).
  v_growth := v_growth * v_pace_factor;

  v_growth := round(v_growth * 100) / 100.0;

  v_new_val := LEAST(v_cap, round((v_current_val + v_growth) * 100) / 100.0);

  EXECUTE format('UPDATE player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  INSERT INTO training_history (player_profile_id, attribute_key, old_value, new_value, growth)
  VALUES (p_player_profile_id, p_attribute_key, v_current_val, v_new_val, v_new_val - v_current_val);

  UPDATE player_profiles
  SET energy_current = energy_current - v_energy_cost,
      last_trained_at = now(),
      updated_at = now()
  WHERE id = p_player_profile_id;

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


-- ── 3. auto_train_attribute: same pace factor ─────────────────
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

  v_cap := public.get_attribute_cap(v_player.archetype, v_player.height, p_attribute_key);
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

  -- Pace factor — must mirror train_attribute or planner becomes cheese.
  v_growth := v_growth * v_pace_factor;

  v_new_val := LEAST(v_cap, v_current_val + v_growth);
  v_growth := v_new_val - v_current_val;

  EXECUTE format('UPDATE public.player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  IF v_player.primary_position = 'GK' THEN
    SELECT round((reflexo + posicionamento_gol + defesa_aerea + pegada + saida_gol + um_contra_um + tempo_reacao + comando_area) / 8.0)
      INTO v_new_overall
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
    ) / 21.3)
      INTO v_new_overall
      FROM public.player_attributes
      WHERE player_profile_id = p_player_profile_id;
  END IF;

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


-- ── 4. Attribute category classifier for decay ────────────────
-- 'fisico' : physical attrs that decay most aggressively with age
-- 'tecnico': skill attrs that decay slower
-- 'mental' : judgment/positioning attrs that barely decay
-- GK attrs split by the same reasoning.
CREATE OR REPLACE FUNCTION public.get_attribute_decay_category(p_attribute_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_attribute_key
    -- Físicos (campo)
    WHEN 'velocidade' THEN 'fisico'
    WHEN 'aceleracao' THEN 'fisico'
    WHEN 'agilidade' THEN 'fisico'
    WHEN 'forca' THEN 'fisico'
    WHEN 'pulo' THEN 'fisico'
    WHEN 'stamina' THEN 'fisico'
    WHEN 'resistencia' THEN 'fisico'
    WHEN 'equilibrio' THEN 'fisico'
    -- Físicos (GK)
    WHEN 'reflexo' THEN 'fisico'
    WHEN 'tempo_reacao' THEN 'fisico'

    -- Técnicos (campo)
    WHEN 'drible' THEN 'tecnico'
    WHEN 'controle_bola' THEN 'tecnico'
    WHEN 'marcacao' THEN 'tecnico'
    WHEN 'desarme' THEN 'tecnico'
    WHEN 'um_toque' THEN 'tecnico'
    WHEN 'curva' THEN 'tecnico'
    WHEN 'passe_baixo' THEN 'tecnico'
    WHEN 'passe_alto' THEN 'tecnico'
    WHEN 'cabeceio' THEN 'tecnico'
    WHEN 'acuracia_chute' THEN 'tecnico'
    WHEN 'forca_chute' THEN 'tecnico'
    WHEN 'posicionamento_ofensivo' THEN 'tecnico'
    WHEN 'posicionamento_defensivo' THEN 'tecnico'
    -- Técnicos (GK)
    WHEN 'pegada' THEN 'tecnico'
    WHEN 'defesa_aerea' THEN 'tecnico'
    WHEN 'saida_gol' THEN 'tecnico'
    WHEN 'um_contra_um' THEN 'tecnico'

    -- Mentais (campo)
    WHEN 'visao_jogo' THEN 'mental'
    WHEN 'tomada_decisao' THEN 'mental'
    WHEN 'antecipacao' THEN 'mental'
    WHEN 'trabalho_equipe' THEN 'mental'
    WHEN 'coragem' THEN 'mental'
    -- Mentais (GK)
    WHEN 'posicionamento_gol' THEN 'mental'
    WHEN 'comando_area' THEN 'mental'
    WHEN 'distribuicao_curta' THEN 'mental'
    WHEN 'distribuicao_longa' THEN 'mental'

    ELSE 'mental'
  END;
$$;


-- ── 5. Decay table per age + category ─────────────────────────
-- Uses NEW age (after +1 bump) as input.
CREATE OR REPLACE FUNCTION public.get_aging_decay(
  p_age INT,
  p_category TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_age < 33 THEN 0
    WHEN p_category = 'fisico' THEN
      CASE p_age
        WHEN 33 THEN 1.5
        WHEN 34 THEN 2.0
        WHEN 35 THEN 2.5
        WHEN 36 THEN 4.0
        WHEN 37 THEN 5.0
        WHEN 38 THEN 6.0
        ELSE 7.0
      END
    WHEN p_category = 'tecnico' THEN
      CASE p_age
        WHEN 33 THEN 0
        WHEN 34 THEN 0.5
        WHEN 35 THEN 1.0
        WHEN 36 THEN 2.0
        WHEN 37 THEN 3.0
        WHEN 38 THEN 4.0
        ELSE 5.0
      END
    WHEN p_category = 'mental' THEN
      CASE p_age
        WHEN 33 THEN 0
        WHEN 34 THEN 0
        WHEN 35 THEN 0.5
        WHEN 36 THEN 1.0
        WHEN 37 THEN 2.0
        WHEN 38 THEN 3.0
        ELSE 4.0
      END
    ELSE 0
  END;
$$;


-- ── 6. Apply decay to a single player (season-end internal) ───
-- Applied AFTER age +1. Uses current player.age (which was just bumped).
-- Floors every attr at 10 so the row never goes weird.
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

  -- Recompute overall
  IF v_is_gk THEN
    SELECT round((reflexo + posicionamento_gol + defesa_aerea + pegada + saida_gol + um_contra_um + tempo_reacao + comando_area) / 8.0)
      INTO v_new_overall
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
    ) / 21.3)
      INTO v_new_overall
      FROM public.player_attributes
      WHERE player_profile_id = p_player_profile_id;
  END IF;

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


-- ── 7. Internal helper: delete a bot completely ───────────────
-- Mirrors the NO-ACTION FK cleanup done by delete_player_profile (see
-- 20260413050000 + 20260413060000) but skips auth/ownership checks
-- because the caller is always service_role at season-end. Bots with
-- an active contract get their contract row wiped by the CASCADE on
-- contracts.player_profile_id.
CREATE OR REPLACE FUNCTION public._delete_bot_player(p_player_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_bot BOOLEAN;
BEGIN
  SELECT (user_id IS NULL) INTO v_is_bot
    FROM public.player_profiles
    WHERE id = p_player_profile_id;

  IF v_is_bot IS NULL THEN
    RETURN; -- already gone
  END IF;

  IF NOT v_is_bot THEN
    RAISE EXCEPTION 'Cannot use _delete_bot_player on a human-owned player (id=%)', p_player_profile_id;
  END IF;

  -- Null-out match_participants rows pointing at lineup_slots owned by
  -- this player (NO ACTION FK would block the cascade otherwise).
  UPDATE public.match_participants
     SET lineup_slot_id = NULL
   WHERE lineup_slot_id IN (
     SELECT id FROM public.lineup_slots WHERE player_profile_id = p_player_profile_id
   );

  -- Null-out match_participants rows pointing at the player directly
  -- (keep match history, just unlink).
  UPDATE public.match_participants
     SET player_profile_id = NULL
   WHERE player_profile_id = p_player_profile_id;

  -- Wipe NO-ACTION FK rows that would block the profile DELETE.
  DELETE FROM public.contract_offers  WHERE player_profile_id = p_player_profile_id;
  DELETE FROM public.player_transfers WHERE player_profile_id = p_player_profile_id;

  DELETE FROM public.player_profiles WHERE id = p_player_profile_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._delete_bot_player(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._delete_bot_player(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._delete_bot_player(UUID) TO service_role;


-- ── 8. Season-end batch: bump age, apply decay, cull old bots ─
-- Called by match-engine-lab when league_seasons.status flips to
-- 'finished'. Idempotent via p_season_id tagging on the log.
CREATE TABLE IF NOT EXISTS public.season_aging_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL UNIQUE,
  players_aged INT NOT NULL,
  players_decayed INT NOT NULL,
  humans_retired INT NOT NULL,
  bots_deleted INT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.advance_all_player_ages(p_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_player RECORD;
  v_aged INT := 0;
  v_decayed INT := 0;
  v_humans_retired INT := 0;
  v_bots_deleted INT := 0;
  v_decay_result JSONB;
BEGIN
  -- Idempotency guard: each season triggers this exactly once.
  SELECT * INTO v_existing FROM public.season_aging_log WHERE season_id = p_season_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'already_ran',
      'players_aged', v_existing.players_aged,
      'ran_at', v_existing.ran_at
    );
  END IF;

  -- Pre-bump: cull bots currently at age ≥ 39. After the bump they'd
  -- be 40+ anyway (and would qualify for deletion); removing them first
  -- avoids updating rows we're about to delete.
  FOR v_player IN
    SELECT id FROM public.player_profiles
      WHERE user_id IS NULL AND age >= 39
  LOOP
    PERFORM public._delete_bot_player(v_player.id);
    v_bots_deleted := v_bots_deleted + 1;
  END LOOP;

  -- +1 age on every active player (skip already-retired humans)
  UPDATE public.player_profiles
    SET age = age + 1,
        updated_at = NOW()
    WHERE retirement_status = 'active';
  GET DIAGNOSTICS v_aged = ROW_COUNT;

  -- Apply decay to players now ≥33 (covers the age we just bumped to).
  FOR v_player IN
    SELECT id FROM public.player_profiles
      WHERE retirement_status = 'active' AND age >= 33
  LOOP
    v_decay_result := public.apply_aging_decay(v_player.id);
    IF (v_decay_result->>'applied')::BOOLEAN THEN
      v_decayed := v_decayed + 1;
    END IF;
  END LOOP;

  -- Log run for idempotency.
  INSERT INTO public.season_aging_log (season_id, players_aged, players_decayed, humans_retired, bots_deleted)
    VALUES (p_season_id, v_aged, v_decayed, v_humans_retired, v_bots_deleted);

  RETURN jsonb_build_object(
    'skipped', false,
    'players_aged', v_aged,
    'players_decayed', v_decayed,
    'humans_retired', v_humans_retired,
    'bots_deleted', v_bots_deleted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_all_player_ages(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_all_player_ages(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_all_player_ages(UUID) TO service_role;


-- ── 9. Voluntary retirement (human) ───────────────────────────
-- Only the owner can call this, only on their own player, only if
-- age ≥ 38. Player is released from club (club_id = NULL) and
-- retirement_status flips to 'retired'. Shareable stats link keeps
-- working because the row stays in player_profiles.
CREATE OR REPLACE FUNCTION public.retire_player(p_player_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player player_profiles%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_player
    FROM public.player_profiles
    WHERE id = p_player_profile_id AND user_id = v_user_id
    FOR UPDATE;
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'Player not found or not owned by user';
  END IF;

  IF v_player.retirement_status = 'retired' THEN
    RAISE EXCEPTION 'Jogador já está aposentado';
  END IF;

  IF v_player.age < 38 THEN
    RAISE EXCEPTION 'Jogador precisa ter ao menos 38 anos para aposentar (atual: %)', v_player.age;
  END IF;

  -- Release from club contract if any. player_contracts table and any
  -- lineup slots cascade on club_id/lineup changes elsewhere; we just
  -- null the club and trigger existing cleanup RPCs by touching the row.
  UPDATE public.player_profiles
    SET retirement_status = 'retired',
        club_id = NULL,
        weekly_salary = 0,
        updated_at = NOW()
    WHERE id = p_player_profile_id;

  -- Wipe auto-training plan so the cron stops picking them up.
  DELETE FROM public.training_plans
    WHERE player_profile_id = p_player_profile_id;

  -- Terminate any active contract so the player is truly free-agent.
  UPDATE public.contracts
    SET status = 'terminated',
        updated_at = NOW()
    WHERE player_profile_id = p_player_profile_id
      AND status = 'active';

  RETURN jsonb_build_object(
    'retired', true,
    'player_id', p_player_profile_id,
    'age', v_player.age
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.retire_player(UUID) TO authenticated;


-- ── 10. delete_player_profile: allow retired human to reset ───
-- Current rule blocks delete when club_id IS NOT NULL. Retired players
-- always have club_id = NULL so they already fit; no change needed.
-- (Explicit sanity here so future readers aren't surprised.)

COMMENT ON COLUMN public.player_profiles.retirement_status IS
  'active | retired. Retired humans keep row for stats link; bots deleted at age ≥ 40 in advance_all_player_ages.';
