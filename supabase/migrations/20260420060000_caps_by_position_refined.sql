-- ═══════════════════════════════════════════════════════════
-- Attribute caps: add a POSITION layer on top of archetype + height.
--
-- Tiers for the new layer:
--   CORE        = 99 (no cap from this layer)
--   SUPPORTING  = 88 (soft ceiling — reuses existing CAP_SOFT)
--   IRRELEVANT  = 75 (new hard position cap — CAP_POS_HARD)
--   WALL        = 70 (CAP_POS_WALL — GK on outfield attrs)
--
-- Refined rule (important): an archetype's EXPLICIT per-attribute tier
-- REPLACES both the GK blanket AND the position cap on that attribute
-- (same behavior the 20260420010500_felino_agilidade_cap_fix.sql
-- migration introduced for the GK blanket — we extend it to also win
-- over the position cap). Only when the archetype is silent on an
-- attribute does the position cap bind.
--
-- Resolution order, per attribute:
--   1. archetype explicit tier present   → cap = tierValue (archetype wins)
--   2. otherwise:
--       start cap = 99
--       GK + attr in GK_CAPPED_FIELD_ATTRS → cap = min(cap, 70) [blanket]
--       apply position cap                 → cap = min(cap, position_cap ?? 99)
--   3. height cap always stacks via LEAST on top
--
-- Preserves the Felino agilidade = 88 fix (archetype soft wins over
-- position WALL). A Cão-de-Guarda striker still caps at position-HARD
-- 75 on defensive attrs because the archetype has no tier there.
--
-- Grandfather: existing values above the new cap are NOT retroactively
-- clamped — training just stops adding growth.
--
-- Signature change: get_attribute_cap(archetype, height, attribute_key)
--                 → get_attribute_cap(archetype, height, position, attribute_key)
-- The old 3-arg overload is dropped so nothing keeps bypassing the new layer.
-- ═══════════════════════════════════════════════════════════

-- Drop the old 3-arg overload (everything will now go through the 4-arg one).
DROP FUNCTION IF EXISTS public.get_attribute_cap(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_attribute_cap(
  p_archetype TEXT,
  p_height TEXT,
  p_position TEXT,
  p_attribute_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cap INTEGER := 99;
  v_is_gk_archetype BOOLEAN := p_archetype LIKE 'Goleiro%';
  v_gk_field_capped TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade',
    'drible','controle_bola','marcacao','desarme',
    'um_toque','curva','passe_baixo','passe_alto',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute'
  ];
  v_archetype_tier TEXT := NULL;
  v_height_tier TEXT := NULL;
  v_pos_tier INTEGER := NULL; -- resolved directly as a number (88/75/70), NULL = CORE
BEGIN
  -- ── 1. Resolve archetype tier first (NULL = archetype silent) ──
  IF v_is_gk_archetype THEN
    v_archetype_tier := CASE p_archetype
      WHEN 'Goleiro Felino' THEN CASE p_attribute_key
        WHEN 'defesa_aerea' THEN 'hard'
        WHEN 'comando_area' THEN 'hard'
        WHEN 'pegada'       THEN 'soft'
        WHEN 'agilidade'    THEN 'soft'
        ELSE NULL END
      WHEN 'Goleiro Muralha' THEN CASE p_attribute_key
        WHEN 'reflexo'      THEN 'soft'
        WHEN 'um_contra_um' THEN 'soft'
        WHEN 'tempo_reacao' THEN 'soft'
        ELSE NULL END
      ELSE NULL
    END;
  ELSE
    v_archetype_tier := CASE p_archetype
      WHEN 'All Around' THEN CASE p_attribute_key
        WHEN 'velocidade' THEN 'soft' WHEN 'aceleracao' THEN 'soft'
        WHEN 'agilidade' THEN 'soft'  WHEN 'forca' THEN 'soft'
        WHEN 'equilibrio' THEN 'soft' WHEN 'resistencia' THEN 'soft'
        WHEN 'pulo' THEN 'soft'       WHEN 'stamina' THEN 'soft'
        WHEN 'drible' THEN 'soft'     WHEN 'controle_bola' THEN 'soft'
        WHEN 'marcacao' THEN 'soft'   WHEN 'desarme' THEN 'soft'
        WHEN 'um_toque' THEN 'soft'   WHEN 'curva' THEN 'soft'
        WHEN 'passe_baixo' THEN 'soft' WHEN 'passe_alto' THEN 'soft'
        WHEN 'visao_jogo' THEN 'soft' WHEN 'tomada_decisao' THEN 'soft'
        WHEN 'antecipacao' THEN 'soft' WHEN 'trabalho_equipe' THEN 'soft'
        WHEN 'coragem' THEN 'soft'
        WHEN 'posicionamento_ofensivo' THEN 'soft'
        WHEN 'posicionamento_defensivo' THEN 'soft'
        WHEN 'cabeceio' THEN 'soft'   WHEN 'acuracia_chute' THEN 'soft'
        WHEN 'forca_chute' THEN 'soft'
        ELSE NULL END
      WHEN 'Condutor' THEN CASE p_attribute_key
        WHEN 'forca' THEN 'hard' WHEN 'marcacao' THEN 'hard' WHEN 'desarme' THEN 'hard'
        WHEN 'cabeceio' THEN 'soft' WHEN 'pulo' THEN 'soft'
        ELSE NULL END
      WHEN 'Chutador' THEN CASE p_attribute_key
        WHEN 'marcacao' THEN 'hard' WHEN 'desarme' THEN 'hard'
        WHEN 'posicionamento_defensivo' THEN 'hard'
        WHEN 'trabalho_equipe' THEN 'soft' WHEN 'passe_alto' THEN 'soft'
        WHEN 'visao_jogo' THEN 'soft'
        ELSE NULL END
      WHEN 'Velocista' THEN CASE p_attribute_key
        WHEN 'forca' THEN 'hard' WHEN 'cabeceio' THEN 'hard' WHEN 'pulo' THEN 'hard'
        WHEN 'forca_chute' THEN 'soft' WHEN 'marcacao' THEN 'soft'
        ELSE NULL END
      WHEN 'Torre' THEN CASE p_attribute_key
        WHEN 'velocidade' THEN 'hard' WHEN 'aceleracao' THEN 'hard' WHEN 'agilidade' THEN 'hard'
        WHEN 'drible' THEN 'soft' WHEN 'controle_bola' THEN 'soft'
        ELSE NULL END
      WHEN 'Cão de Guarda' THEN CASE p_attribute_key
        WHEN 'um_toque' THEN 'hard' WHEN 'curva' THEN 'hard' WHEN 'passe_alto' THEN 'hard'
        WHEN 'acuracia_chute' THEN 'soft' WHEN 'controle_bola' THEN 'soft' WHEN 'drible' THEN 'soft'
        ELSE NULL END
      ELSE NULL
    END;
  END IF;

  -- ── 2. Apply archetype OR (GK-blanket + position) ──
  -- If the archetype has an explicit tier on this attr, it REPLACES the GK
  -- blanket and the position cap. Otherwise, those two still apply.
  IF v_archetype_tier = 'hard' THEN
    v_cap := LEAST(v_cap, 80);
  ELSIF v_archetype_tier = 'soft' THEN
    v_cap := LEAST(v_cap, 88);
  ELSE
    -- Archetype silent → GK blanket applies on outfield attrs.
    IF v_is_gk_archetype AND p_attribute_key = ANY(v_gk_field_capped) THEN
      v_cap := LEAST(v_cap, 70);
    END IF;

    -- Position cap (position-WALL for GKs, position-HARD/SUPPORTING for the rest).
    IF p_position = 'GK' THEN
      -- GK outfield attrs → WALL (70). GK-specific attrs (reflexo, etc) not listed here.
      IF p_attribute_key = ANY(v_gk_field_capped) THEN
        v_pos_tier := 70;
      END IF;
    ELSE
      v_pos_tier := CASE p_position
        WHEN 'CB' THEN CASE p_attribute_key
          -- Offense bucket → IRRELEVANT (75)
          WHEN 'acuracia_chute' THEN 75 WHEN 'forca_chute' THEN 75
          WHEN 'um_toque' THEN 75 WHEN 'curva' THEN 75
          WHEN 'posicionamento_ofensivo' THEN 75 WHEN 'drible' THEN 75
          -- Playmaking bucket → SUPPORTING (88)
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'LB' THEN CASE p_attribute_key
          -- Offense → SUPPORTING
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          -- Defense: cabeceio SUPPORTING (rest CORE)
          WHEN 'cabeceio' THEN 88
          -- Playmaking → SUPPORTING
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'RB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          WHEN 'cabeceio' THEN 88
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'LWB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'antecipacao' THEN 88 WHEN 'cabeceio' THEN 88
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'RWB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'antecipacao' THEN 88 WHEN 'cabeceio' THEN 88
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'DM' THEN CASE p_attribute_key
          -- Offense: 75 on acuracia_chute/um_toque/curva, 88 on forca_chute
          WHEN 'acuracia_chute' THEN 75 WHEN 'um_toque' THEN 75 WHEN 'curva' THEN 75
          WHEN 'forca_chute' THEN 88
          -- Playmaking: 88 on visao_jogo, CORE on passe_baixo
          WHEN 'visao_jogo' THEN 88
          ELSE NULL END
        WHEN 'CDM' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 75 WHEN 'um_toque' THEN 75 WHEN 'curva' THEN 75
          WHEN 'forca_chute' THEN 88
          WHEN 'visao_jogo' THEN 88
          ELSE NULL END
        WHEN 'CM' THEN CASE p_attribute_key
          -- Offense → SUPPORTING
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          -- Defense → SUPPORTING
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'antecipacao' THEN 88 WHEN 'cabeceio' THEN 88
          ELSE NULL END
        WHEN 'LM' THEN CASE p_attribute_key
          -- Offense: 88 on acuracia_chute; others CORE
          WHEN 'acuracia_chute' THEN 88
          -- Defense → SUPPORTING
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'antecipacao' THEN 88 WHEN 'cabeceio' THEN 88
          ELSE NULL END
        WHEN 'RM' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'antecipacao' THEN 88 WHEN 'cabeceio' THEN 88
          ELSE NULL END
        WHEN 'CAM' THEN CASE p_attribute_key
          -- Offense: forca_chute=88; um_toque/curva/acuracia_chute CORE
          WHEN 'forca_chute' THEN 88
          -- Defense: 75 on marcacao/desarme
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          ELSE NULL END
        WHEN 'LW' THEN CASE p_attribute_key
          -- Offense: 88 on acuracia_chute/forca_chute; drible/posic_ofensivo CORE
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          -- Defense: 75 on marcacao/desarme/posic_defensivo
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75
          -- Playmaking → SUPPORTING
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'RW' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'CF' THEN CASE p_attribute_key
          -- Offense: forca_chute=88; others CORE
          WHEN 'forca_chute' THEN 88
          -- Defense → IRRELEVANT (75)
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75 WHEN 'coragem' THEN 75
          WHEN 'antecipacao' THEN 75 WHEN 'cabeceio' THEN 75
          -- Playmaking → SUPPORTING
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'ST' THEN CASE p_attribute_key
          -- Offense → CORE
          -- Defense → IRRELEVANT (75)
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75 WHEN 'coragem' THEN 75
          WHEN 'antecipacao' THEN 75 WHEN 'cabeceio' THEN 75
          -- Playmaking: 75 on passe_alto/visao_jogo; others CORE
          WHEN 'passe_alto' THEN 75 WHEN 'visao_jogo' THEN 75
          ELSE NULL END
        ELSE NULL
      END;
    END IF;

    IF v_pos_tier IS NOT NULL THEN
      v_cap := LEAST(v_cap, v_pos_tier);
    END IF;
  END IF;

  -- ── 3. Height layer (always stacks via LEAST) ──
  v_height_tier := CASE p_height
    WHEN 'Muito Baixo' THEN CASE p_attribute_key
      WHEN 'cabeceio' THEN 'hard' WHEN 'pulo' THEN 'hard' WHEN 'forca' THEN 'hard'
      WHEN 'defesa_aerea' THEN 'soft'
      ELSE NULL END
    WHEN 'Baixo' THEN CASE p_attribute_key
      WHEN 'cabeceio' THEN 'soft' WHEN 'pulo' THEN 'soft'
      ELSE NULL END
    WHEN 'Alto' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 'soft' WHEN 'agilidade' THEN 'soft'
      ELSE NULL END
    WHEN 'Muito Alto' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 'hard' WHEN 'aceleracao' THEN 'hard' WHEN 'agilidade' THEN 'hard'
      WHEN 'equilibrio' THEN 'soft'
      ELSE NULL END
    ELSE NULL
  END;

  IF v_height_tier = 'hard' THEN v_cap := LEAST(v_cap, 80);
  ELSIF v_height_tier = 'soft' THEN v_cap := LEAST(v_cap, 88);
  END IF;

  RETURN v_cap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attribute_cap(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;


-- ═══════════════════════════════════════════════════════════
-- train_attribute: pass primary_position to the new 4-arg get_attribute_cap
-- and update the at-cap error message to mention "tipo ou posição".
-- ═══════════════════════════════════════════════════════════

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

  IF v_player.energy_current < v_energy_cost THEN
    RAISE EXCEPTION 'Insufficient energy. Required: %, Available: %', v_energy_cost, v_player.energy_current;
  END IF;

  EXECUTE format('SELECT %I FROM player_attributes WHERE player_profile_id = $1', p_attribute_key)
    INTO v_current_val USING p_player_profile_id;
  IF v_current_val IS NULL THEN
    RAISE EXCEPTION 'Player attributes not found';
  END IF;

  v_cap := public.get_attribute_cap(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
  );

  IF v_current_val >= v_cap THEN
    RAISE EXCEPTION 'Este atributo atingiu o limite do seu tipo ou posição.';
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
    'energy_remaining', v_player.energy_current - v_energy_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.train_attribute(UUID, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════
-- auto_train_attribute: same signature update for the cron-driven twin.
-- ═══════════════════════════════════════════════════════════

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

  IF v_player.energy_current < v_energy_cost THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'insufficient_energy', 'energy', v_player.energy_current);
  END IF;

  EXECUTE format('SELECT %I FROM public.player_attributes WHERE player_profile_id = $1', p_attribute_key)
    INTO v_current_val USING p_player_profile_id;
  IF v_current_val IS NULL THEN
    RAISE EXCEPTION 'Player attributes not found';
  END IF;

  v_cap := public.get_attribute_cap(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
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
    'energy_remaining', GREATEST(0, v_player.energy_current - v_energy_cost)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) TO service_role;
