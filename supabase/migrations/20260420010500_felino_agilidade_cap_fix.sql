-- ═══════════════════════════════════════════════════════════
-- Fix: Felino goalkeeper agilidade was capped at 70 (the blanket
-- GK field-attr cap) even though the archetype is explicitly "ágil".
--
-- Old logic applied both the GK blanket (70) AND any archetype tier
-- via LEAST(), so min(70, 88) = 70 and the archetype bonus was a
-- no-op.
--
-- New logic: when the archetype defines an EXPLICIT per-attribute
-- tier, that tier REPLACES the GK blanket (instead of stacking via
-- min). The blanket still applies to attrs the archetype doesn't
-- have an opinion on.
--
-- Net effects (sanity check):
--   Felino  + agilidade    : explicit 'soft' → 88 (was 70, FIXED)
--   Felino  + drible       : no explicit    → blanket 70 (unchanged)
--   Felino  + pegada       : explicit 'soft' → 88 (unchanged)
--   Felino  + defesa_aerea : explicit 'hard' → 80 (unchanged)
--   Felino  + comando_area : explicit 'hard' → 80 (unchanged)
--   Muralha + agilidade    : no explicit    → blanket 70 (unchanged)
--   Muralha + reflexo      : explicit 'soft' → 88 (unchanged, non-GK-field attr)
--   Completo + anything    : no explicit tiers → blanket 70 on field attrs (unchanged)
--   Field archetypes       : not GK, blanket doesn't apply (unchanged)
--   Height caps            : still stack via LEAST on top of result (unchanged)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_attribute_cap(
  p_archetype TEXT,
  p_height TEXT,
  p_attribute_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cap INTEGER := 99;
  v_is_gk BOOLEAN := p_archetype LIKE 'Goleiro%';
  v_gk_field_capped TEXT[] := ARRAY[
    'velocidade','aceleracao','agilidade',
    'drible','controle_bola','marcacao','desarme',
    'um_toque','curva','passe_baixo','passe_alto',
    'posicionamento_ofensivo','posicionamento_defensivo',
    'cabeceio','acuracia_chute','forca_chute'
  ];
  v_archetype_tier TEXT := NULL;
  v_height_tier TEXT := NULL;
BEGIN
  -- Resolve per-archetype tier first (NULL = no explicit opinion).
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

  -- Archetype layer: explicit tier REPLACES the GK blanket.
  IF v_archetype_tier = 'hard' THEN
    v_cap := LEAST(v_cap, 80);
  ELSIF v_archetype_tier = 'soft' THEN
    v_cap := LEAST(v_cap, 88);
  ELSIF v_is_gk AND p_attribute_key = ANY(v_gk_field_capped) THEN
    -- GK with no explicit archetype opinion on this attr → blanket 70.
    v_cap := LEAST(v_cap, 70);
  END IF;

  -- Height caps (always stack via LEAST).
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

GRANT EXECUTE ON FUNCTION public.get_attribute_cap(TEXT, TEXT, TEXT) TO authenticated, anon;
