-- ============================================================
-- Auto-training: weekly schedule that runs after energy regen
-- ============================================================
-- Player defines up to 4 slots per day (Mon–Sun). A daily cron picks
-- up the slots for today's day_of_week and executes them via the new
-- SECURITY DEFINER `auto_train_attribute` RPC (service_role only).

-- ── 1. training_plans: the recurring weekly plan ──
CREATE TABLE IF NOT EXISTS public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  -- ISO day number: 0 = Monday, 6 = Sunday. Stored as SMALLINT for cheap indexing.
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot_index SMALLINT NOT NULL CHECK (slot_index BETWEEN 0 AND 3),
  attribute_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_profile_id, day_of_week, slot_index)
);

CREATE INDEX IF NOT EXISTS training_plans_player_day_idx
  ON public.training_plans(player_profile_id, day_of_week);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

-- Player can see/edit only their own plan rows.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Players manage own training plans" ON public.training_plans';
END $$;
CREATE POLICY "Players manage own training plans" ON public.training_plans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_profiles pp
      WHERE pp.id = training_plans.player_profile_id
        AND pp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.player_profiles pp
      WHERE pp.id = training_plans.player_profile_id
        AND pp.user_id = auth.uid()
    )
  );

-- ── 2. Track last auto-training execution to keep the cron idempotent ──
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS last_auto_trained_date DATE;

-- ── 3. auto_train_attribute: service-role-only twin of train_attribute ──
-- Same growth formula, but skips the auth.uid() ownership check because it's
-- driven by a cron on behalf of the player. Access is locked to service_role.
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

  -- Private trainer bonus (store subscription)
  SELECT COALESCE(MAX(si.bonus_value), 0) INTO v_trainer_bonus
    FROM public.store_purchases sp
    JOIN public.store_items si ON si.id = sp.store_item_id
    WHERE sp.player_profile_id = p_player_profile_id
      AND sp.status IN ('active','cancelling')
      AND si.category = 'trainer';
  v_trainer_bonus := COALESCE(v_trainer_bonus, 0) / 100;

  v_growth := v_growth * (1 + v_coach_bonus + v_tc_bonus + v_trainer_bonus);

  -- Clamp to cap
  v_new_val := LEAST(v_cap, v_current_val + v_growth);
  v_growth := v_new_val - v_current_val;

  EXECUTE format('UPDATE public.player_attributes SET %I = $1 WHERE player_profile_id = $2', p_attribute_key)
    USING v_new_val, p_player_profile_id;

  -- Recompute overall the same way `train_attribute` does so the two entry
  -- points stay in sync.
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

-- Lock to service_role only — the daily cron is the sole caller.
REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_train_attribute(UUID, TEXT) TO service_role;

-- ── 4. Schedule the daily cron (runs 1h after energy-regen-daily at 06:00 UTC) ──
DO $$ BEGIN PERFORM cron.unschedule('auto-training-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'auto-training-daily',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/auto-training',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
