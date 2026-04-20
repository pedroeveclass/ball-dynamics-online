-- ═══════════════════════════════════════════════════════════
-- Training FIT multiplier
--
-- A per-attribute "fit score" in [-2, +2] derived from the player's
-- archetype, height and primary position. The score maps to a
-- multiplier applied to the PER-SESSION GROWTH (BEFORE clamping to
-- the archetype/height cap).
--
--   fit | ×     | label
--   +2  | 1.50  | Treino FIT TOP
--   +1  | 1.20  | Treino BOM
--    0  | 1.00  | Treino NORMAL
--   -1  | 0.60  | Treino RUIM
--   -2  | 0.30  | Treino CONTRA
--
-- Composition:
--   archetype_fit ∈ {-2, -1, 0, +1, +2}
--     +2 : bodyTypeBoosts ≥ 5
--     +1 : bodyTypeBoosts 3..4
--     -1 : ARCHETYPE_CAPS / GK_ARCHETYPE_CAPS = 'soft'
--     -2 : ARCHETYPE_CAPS / GK_ARCHETYPE_CAPS = 'hard'
--     -2 : GK playing one of the "outfield" attrs (GK_CAPPED_FIELD_ATTRS)
--          AND the archetype has no explicit opinion on that attr
--     Most extreme signal wins (hard cap beats a positive boost).
--
--   height_fit ∈ {-1, 0, +1}
--     +1 : heightBoosts > 0
--     -1 : HEIGHT_CAPS = 'hard' OR heightBoosts < 0
--      0 : otherwise
--
--   position_fit ∈ {-1, 0, +1}
--     +1 : positionProfiles bonus ≥ 6
--     -1 : positionProfiles bonus < 0
--      0 : otherwise
--
--   fit = clamp(archetype_fit + height_fit + position_fit, -2, +2)
--
-- Null archetype/height/position → multiplier = 1.0 (no-op + warn).
--
-- This migration also rewrites train_attribute and auto_train_attribute
-- to apply the multiplier. The archetype/height CAP logic from
-- 20260420010500_felino_agilidade_cap_fix.sql is preserved as-is —
-- we only touch the growth math.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_training_multiplier(
  p_archetype TEXT,
  p_height TEXT,
  p_position TEXT,
  p_attribute_key TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_fit INT := 0;
  v_arch_fit INT := 0;
  v_height_fit INT := 0;
  v_position_fit INT := 0;

  v_is_gk BOOLEAN := p_archetype LIKE 'Goleiro%';

  -- Field attrs that every GK archetype is hard-capped on (mirrors
  -- GK_CAPPED_FIELD_ATTRS in src/lib/attributes.ts).
  v_gk_field_capped TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade',
    'drible','controle_bola','marcacao','desarme',
    'um_toque','curva','passe_baixo','passe_alto',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute'
  ];

  -- Raw signals
  v_body_boost INT := 0;       -- bodyTypeBoosts value (0 if absent)
  v_archetype_tier TEXT := NULL; -- 'hard' | 'soft' | NULL
  v_height_boost INT := 0;     -- heightBoosts value (0 if absent)
  v_height_tier TEXT := NULL;  -- 'hard' | 'soft' | NULL
  v_pos_bonus INT := 0;        -- positionProfiles bonus (0 if absent)
BEGIN
  -- Null inputs → neutral multiplier, let caller log a warn.
  IF p_archetype IS NULL OR p_height IS NULL OR p_position IS NULL THEN
    RETURN 1.0;
  END IF;

  -- ─── archetype_fit ────────────────────────────────────────
  -- 1. bodyTypeBoosts (positive signal)
  v_body_boost := CASE p_archetype
    WHEN 'All Around' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 3 WHEN 'forca' THEN 3 WHEN 'drible' THEN 3
      WHEN 'passe_baixo' THEN 3 WHEN 'acuracia_chute' THEN 3
      WHEN 'cabeceio' THEN 3 WHEN 'marcacao' THEN 3 WHEN 'visao_jogo' THEN 3
      WHEN 'resistencia' THEN 3 WHEN 'controle_bola' THEN 3
      ELSE 0 END
    WHEN 'Condutor' THEN CASE p_attribute_key
      WHEN 'controle_bola' THEN 6 WHEN 'passe_baixo' THEN 6 WHEN 'passe_alto' THEN 5
      WHEN 'drible' THEN 5 WHEN 'um_toque' THEN 5
      WHEN 'visao_jogo' THEN 4 WHEN 'curva' THEN 4 WHEN 'tomada_decisao' THEN 3
      ELSE 0 END
    WHEN 'Chutador' THEN CASE p_attribute_key
      WHEN 'acuracia_chute' THEN 7 WHEN 'forca_chute' THEN 6
      WHEN 'curva' THEN 4 WHEN 'posicionamento_ofensivo' THEN 4
      WHEN 'antecipacao' THEN 3 WHEN 'cabeceio' THEN 3
      ELSE 0 END
    WHEN 'Velocista' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 7 WHEN 'aceleracao' THEN 6 WHEN 'agilidade' THEN 5
      WHEN 'stamina' THEN 5 WHEN 'resistencia' THEN 4
      WHEN 'equilibrio' THEN 3 WHEN 'drible' THEN 3
      ELSE 0 END
    WHEN 'Torre' THEN CASE p_attribute_key
      WHEN 'cabeceio' THEN 7 WHEN 'pulo' THEN 6 WHEN 'forca' THEN 6
      WHEN 'equilibrio' THEN 4 WHEN 'posicionamento_defensivo' THEN 3
      WHEN 'posicionamento_ofensivo' THEN 3 WHEN 'defesa_aerea' THEN 3
      ELSE 0 END
    WHEN 'Cão de Guarda' THEN CASE p_attribute_key
      WHEN 'marcacao' THEN 7 WHEN 'desarme' THEN 6 WHEN 'posicionamento_defensivo' THEN 6
      WHEN 'coragem' THEN 5 WHEN 'antecipacao' THEN 4 WHEN 'forca' THEN 4
      WHEN 'trabalho_equipe' THEN 3
      ELSE 0 END
    WHEN 'Goleiro Completo' THEN CASE p_attribute_key
      WHEN 'reflexo' THEN 4 WHEN 'posicionamento_gol' THEN 4
      WHEN 'defesa_aerea' THEN 3 WHEN 'pegada' THEN 3 WHEN 'saida_gol' THEN 3
      WHEN 'um_contra_um' THEN 3 WHEN 'tempo_reacao' THEN 3 WHEN 'comando_area' THEN 3
      WHEN 'distribuicao_curta' THEN 3 WHEN 'distribuicao_longa' THEN 3
      ELSE 0 END
    WHEN 'Goleiro Felino' THEN CASE p_attribute_key
      WHEN 'reflexo' THEN 7 WHEN 'um_contra_um' THEN 6 WHEN 'saida_gol' THEN 5
      WHEN 'agilidade' THEN 5 WHEN 'tempo_reacao' THEN 4
      WHEN 'aceleracao' THEN 3 WHEN 'velocidade' THEN 2
      ELSE 0 END
    WHEN 'Goleiro Muralha' THEN CASE p_attribute_key
      WHEN 'defesa_aerea' THEN 7 WHEN 'comando_area' THEN 6 WHEN 'pegada' THEN 5
      WHEN 'pulo' THEN 5 WHEN 'forca' THEN 4
      WHEN 'posicionamento_gol' THEN 3 WHEN 'cabeceio' THEN 2
      ELSE 0 END
    ELSE 0
  END;

  -- 2. ARCHETYPE_CAPS / GK_ARCHETYPE_CAPS tier (negative signal)
  IF v_is_gk THEN
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

  -- Combine signals. The most extreme wins.
  v_arch_fit := 0;
  IF v_body_boost >= 5 THEN v_arch_fit := 2;
  ELSIF v_body_boost >= 3 THEN v_arch_fit := 1;
  END IF;

  IF v_archetype_tier = 'hard' THEN
    v_arch_fit := LEAST(v_arch_fit, -2);
  ELSIF v_archetype_tier = 'soft' THEN
    v_arch_fit := LEAST(v_arch_fit, -1);
  ELSIF v_is_gk
    AND v_archetype_tier IS NULL
    AND p_attribute_key = ANY(v_gk_field_capped)
  THEN
    -- GK playing an outfield attr with no explicit archetype opinion
    -- → blanket hard cap, signals -2.
    v_arch_fit := LEAST(v_arch_fit, -2);
  END IF;

  -- ─── height_fit ───────────────────────────────────────────
  v_height_boost := CASE p_height
    WHEN 'Muito Baixo' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 6 WHEN 'agilidade' THEN 5 WHEN 'aceleracao' THEN 4
      WHEN 'cabeceio' THEN -5 WHEN 'pulo' THEN -4 WHEN 'forca' THEN -3
      ELSE 0 END
    WHEN 'Baixo' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 3 WHEN 'agilidade' THEN 3
      WHEN 'cabeceio' THEN -2 WHEN 'pulo' THEN -2
      ELSE 0 END
    WHEN 'Alto' THEN CASE p_attribute_key
      WHEN 'cabeceio' THEN 3 WHEN 'pulo' THEN 3 WHEN 'forca' THEN 2
      WHEN 'velocidade' THEN -2 WHEN 'agilidade' THEN -2
      ELSE 0 END
    WHEN 'Muito Alto' THEN CASE p_attribute_key
      WHEN 'cabeceio' THEN 6 WHEN 'pulo' THEN 5 WHEN 'forca' THEN 4
      WHEN 'velocidade' THEN -5 WHEN 'agilidade' THEN -4 WHEN 'aceleracao' THEN -3
      ELSE 0 END
    ELSE 0
  END;

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

  v_height_fit := 0;
  IF v_height_boost > 0 THEN v_height_fit := 1; END IF;
  IF v_height_tier = 'hard' OR v_height_boost < 0 THEN
    v_height_fit := -1;
  END IF;

  -- ─── position_fit ─────────────────────────────────────────
  v_pos_bonus := CASE p_position
    WHEN 'GK' THEN CASE p_attribute_key
      WHEN 'reflexo' THEN 15 WHEN 'posicionamento_gol' THEN 12
      WHEN 'pegada' THEN 10 WHEN 'defesa_aerea' THEN 10
      WHEN 'saida_gol' THEN 8 WHEN 'tempo_reacao' THEN 10
      WHEN 'comando_area' THEN 8
      WHEN 'velocidade' THEN -10 WHEN 'drible' THEN -15 WHEN 'acuracia_chute' THEN -15
      ELSE 0 END
    WHEN 'CB' THEN CASE p_attribute_key
      WHEN 'marcacao' THEN 8 WHEN 'desarme' THEN 8 WHEN 'forca' THEN 6
      WHEN 'cabeceio' THEN 6 WHEN 'posicionamento_defensivo' THEN 8 WHEN 'coragem' THEN 6
      WHEN 'drible' THEN -5 WHEN 'posicionamento_ofensivo' THEN -5
      ELSE 0 END
    WHEN 'LB' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 6 WHEN 'aceleracao' THEN 6 WHEN 'resistencia' THEN 6
      WHEN 'posicionamento_defensivo' THEN 4 WHEN 'marcacao' THEN 4
      ELSE 0 END
    WHEN 'RB' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 6 WHEN 'aceleracao' THEN 6 WHEN 'resistencia' THEN 6
      WHEN 'posicionamento_defensivo' THEN 4 WHEN 'marcacao' THEN 4
      ELSE 0 END
    WHEN 'LWB' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 7 WHEN 'aceleracao' THEN 6 WHEN 'resistencia' THEN 7
      WHEN 'stamina' THEN 5 WHEN 'posicionamento_defensivo' THEN 3
      WHEN 'marcacao' THEN 3 WHEN 'drible' THEN 3 WHEN 'posicionamento_ofensivo' THEN 3
      ELSE 0 END
    WHEN 'RWB' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 7 WHEN 'aceleracao' THEN 6 WHEN 'resistencia' THEN 7
      WHEN 'stamina' THEN 5 WHEN 'posicionamento_defensivo' THEN 3
      WHEN 'marcacao' THEN 3 WHEN 'drible' THEN 3 WHEN 'posicionamento_ofensivo' THEN 3
      ELSE 0 END
    WHEN 'DM' THEN CASE p_attribute_key
      WHEN 'marcacao' THEN 6 WHEN 'desarme' THEN 8 WHEN 'posicionamento_defensivo' THEN 8
      WHEN 'antecipacao' THEN 6 WHEN 'trabalho_equipe' THEN 4
      ELSE 0 END
    WHEN 'CDM' THEN CASE p_attribute_key
      WHEN 'marcacao' THEN 6 WHEN 'desarme' THEN 8 WHEN 'posicionamento_defensivo' THEN 8
      WHEN 'antecipacao' THEN 6 WHEN 'trabalho_equipe' THEN 4
      ELSE 0 END
    WHEN 'CM' THEN CASE p_attribute_key
      WHEN 'passe_baixo' THEN 6 WHEN 'visao_jogo' THEN 4 WHEN 'tomada_decisao' THEN 4
      WHEN 'trabalho_equipe' THEN 4 WHEN 'resistencia' THEN 4
      ELSE 0 END
    WHEN 'LM' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 5 WHEN 'resistencia' THEN 6 WHEN 'passe_baixo' THEN 5
      WHEN 'drible' THEN 5 WHEN 'posicionamento_ofensivo' THEN 3 WHEN 'tomada_decisao' THEN 3
      ELSE 0 END
    WHEN 'RM' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 5 WHEN 'resistencia' THEN 6 WHEN 'passe_baixo' THEN 5
      WHEN 'drible' THEN 5 WHEN 'posicionamento_ofensivo' THEN 3 WHEN 'tomada_decisao' THEN 3
      ELSE 0 END
    WHEN 'CAM' THEN CASE p_attribute_key
      WHEN 'visao_jogo' THEN 8 WHEN 'passe_baixo' THEN 6 WHEN 'drible' THEN 6
      WHEN 'um_toque' THEN 6 WHEN 'posicionamento_ofensivo' THEN 6
      ELSE 0 END
    WHEN 'LW' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 8 WHEN 'aceleracao' THEN 6 WHEN 'drible' THEN 8
      WHEN 'agilidade' THEN 6 WHEN 'posicionamento_ofensivo' THEN 4
      ELSE 0 END
    WHEN 'RW' THEN CASE p_attribute_key
      WHEN 'velocidade' THEN 8 WHEN 'aceleracao' THEN 6 WHEN 'drible' THEN 8
      WHEN 'agilidade' THEN 6 WHEN 'posicionamento_ofensivo' THEN 4
      ELSE 0 END
    WHEN 'ST' THEN CASE p_attribute_key
      WHEN 'acuracia_chute' THEN 8 WHEN 'forca_chute' THEN 6
      WHEN 'posicionamento_ofensivo' THEN 8 WHEN 'cabeceio' THEN 4 WHEN 'antecipacao' THEN 4
      ELSE 0 END
    WHEN 'CF' THEN CASE p_attribute_key
      WHEN 'acuracia_chute' THEN 6 WHEN 'forca_chute' THEN 4
      WHEN 'posicionamento_ofensivo' THEN 8 WHEN 'passe_baixo' THEN 4 WHEN 'drible' THEN 4
      WHEN 'um_toque' THEN 4 WHEN 'visao_jogo' THEN 3
      ELSE 0 END
    ELSE 0
  END;

  v_position_fit := 0;
  IF v_pos_bonus >= 6 THEN v_position_fit := 1;
  ELSIF v_pos_bonus < 0 THEN v_position_fit := -1;
  END IF;

  -- ─── compose ──────────────────────────────────────────────
  v_fit := v_arch_fit + v_height_fit + v_position_fit;
  IF v_fit > 2 THEN v_fit := 2; END IF;
  IF v_fit < -2 THEN v_fit := -2; END IF;

  RETURN CASE v_fit
    WHEN 2 THEN 1.50
    WHEN 1 THEN 1.20
    WHEN 0 THEN 1.00
    WHEN -1 THEN 0.60
    WHEN -2 THEN 0.30
    ELSE 1.00
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_training_multiplier(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;


-- ═══════════════════════════════════════════════════════════
-- train_attribute: applies the fit multiplier BEFORE clamping to cap.
-- Preserves the archetype/height cap logic from 20260420010500.
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
  v_fit_mult NUMERIC := 1.0;

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

  -- NEW: FIT multiplier. Applied BEFORE clamping to cap so a good-fit
  -- attribute that happens to also have a capped headroom still
  -- benefits from the boost.
  v_fit_mult := public.get_training_multiplier(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
  );
  v_growth := v_growth * v_fit_mult;
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
    'fit_multiplier', v_fit_mult
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.train_attribute(UUID, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════
-- auto_train_attribute: same treatment for the weekly-planner cron.
-- Must include the fit multiplier or the planner becomes a loophole.
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
  v_fit_mult NUMERIC := 1.0;

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

  -- NEW: FIT multiplier. Applied BEFORE clamping to cap, same as manual training.
  v_fit_mult := public.get_training_multiplier(
    v_player.archetype, v_player.height, v_player.primary_position, p_attribute_key
  );
  v_growth := v_growth * v_fit_mult;

  -- Clamp to cap
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
    'fit_multiplier', v_fit_mult
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) TO service_role;
