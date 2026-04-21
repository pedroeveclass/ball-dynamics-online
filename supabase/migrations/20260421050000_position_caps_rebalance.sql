-- ═══════════════════════════════════════════════════════════
-- Position caps rebalance (2026-04-21).
--
-- Rebalances the position-layer caps introduced in
-- 20260420060000_caps_by_position_refined.sql based on design review.
--
-- Key changes:
--   • GK: WALL (70) collapses into IRRELEVANT (75). Three attrs get
--     promoted from WALL to SUPPORTING: passe_baixo, passe_alto,
--     posicionamento_defensivo.
--   • CB: um_toque out of IRRELEVANT, curva IRRELEVANT→SUPPORTING,
--     tomada_decisao out of SUPPORTING.
--   • LB/RB: passe_baixo and passe_alto out of SUPPORTING.
--   • DM/CDM: um_toque IRRELEVANT→SUPPORTING.
--   • CM: um_toque, curva, drible, antecipacao out of SUPPORTING.
--   • LW/RW: forca_chute, acuracia_chute, controle_bola out of
--     SUPPORTING.
--   • CF: cabeceio out of IRRELEVANT; forca_chute, tomada_decisao out
--     of SUPPORTING.
--   • ST: cabeceio, coragem, antecipacao out of IRRELEVANT.
--
-- Unchanged: LWB/RWB, LM/RM, CAM.
--
-- Resolution order is identical to the previous migration (archetype
-- explicit tier still replaces GK blanket and position cap; height
-- always stacks via LEAST).
--
-- Grandfathering: values already above a lowered cap are NOT clamped;
-- training just stops adding growth. (No caps are lowered here anyway —
-- every change either raises the ceiling or holds it steady.)
-- ═══════════════════════════════════════════════════════════

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
  -- GK field-attr list: attrs that are never CORE for a goleiro/GK.
  -- passe_baixo, passe_alto and posicionamento_defensivo were removed
  -- from this list and are handled explicitly as SUPPORTING below.
  v_gk_field_capped TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade',
    'drible','controle_bola','marcacao','desarme',
    'um_toque','curva',
    'posicionamento_ofensivo',
    'cabeceio','acuracia_chute','forca_chute'
  ];
  v_archetype_tier TEXT := NULL;
  v_height_tier TEXT := NULL;
  v_pos_tier INTEGER := NULL;
BEGIN
  -- ── 1. Resolve archetype tier (NULL = archetype silent) ──
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
  IF v_archetype_tier = 'hard' THEN
    v_cap := LEAST(v_cap, 80);
  ELSIF v_archetype_tier = 'soft' THEN
    v_cap := LEAST(v_cap, 88);
  ELSE
    -- GK-archetype blanket on outfield attrs. WALL collapsed into IRRELEVANT (75).
    IF v_is_gk_archetype AND p_attribute_key = ANY(v_gk_field_capped) THEN
      v_cap := LEAST(v_cap, 75);
    END IF;

    -- Position cap.
    IF p_position = 'GK' THEN
      -- Three promoted attrs → SUPPORTING (88).
      IF p_attribute_key IN ('passe_baixo','passe_alto','posicionamento_defensivo') THEN
        v_pos_tier := 88;
      ELSIF p_attribute_key = ANY(v_gk_field_capped) THEN
        -- Everything else in the field list → IRRELEVANT (75).
        v_pos_tier := 75;
      END IF;
    ELSE
      v_pos_tier := CASE p_position
        WHEN 'CB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 75 WHEN 'forca_chute' THEN 75
          WHEN 'posicionamento_ofensivo' THEN 75 WHEN 'drible' THEN 75
          WHEN 'curva' THEN 88
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'LB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          WHEN 'cabeceio' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'RB' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'um_toque' THEN 88 WHEN 'curva' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88 WHEN 'drible' THEN 88
          WHEN 'cabeceio' THEN 88
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
          WHEN 'acuracia_chute' THEN 75 WHEN 'curva' THEN 75
          WHEN 'um_toque' THEN 88
          WHEN 'forca_chute' THEN 88
          WHEN 'visao_jogo' THEN 88
          ELSE NULL END
        WHEN 'CDM' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 75 WHEN 'curva' THEN 75
          WHEN 'um_toque' THEN 88
          WHEN 'forca_chute' THEN 88
          WHEN 'visao_jogo' THEN 88
          ELSE NULL END
        WHEN 'CM' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88 WHEN 'forca_chute' THEN 88
          WHEN 'posicionamento_ofensivo' THEN 88
          WHEN 'marcacao' THEN 88 WHEN 'desarme' THEN 88
          WHEN 'posicionamento_defensivo' THEN 88 WHEN 'coragem' THEN 88
          WHEN 'cabeceio' THEN 88
          ELSE NULL END
        WHEN 'LM' THEN CASE p_attribute_key
          WHEN 'acuracia_chute' THEN 88
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
          WHEN 'forca_chute' THEN 88
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          ELSE NULL END
        WHEN 'LW' THEN CASE p_attribute_key
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          ELSE NULL END
        WHEN 'RW' THEN CASE p_attribute_key
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88 WHEN 'tomada_decisao' THEN 88
          ELSE NULL END
        WHEN 'CF' THEN CASE p_attribute_key
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75 WHEN 'coragem' THEN 75
          WHEN 'antecipacao' THEN 75
          WHEN 'passe_baixo' THEN 88 WHEN 'passe_alto' THEN 88
          WHEN 'visao_jogo' THEN 88
          WHEN 'controle_bola' THEN 88
          ELSE NULL END
        WHEN 'ST' THEN CASE p_attribute_key
          WHEN 'marcacao' THEN 75 WHEN 'desarme' THEN 75
          WHEN 'posicionamento_defensivo' THEN 75
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
