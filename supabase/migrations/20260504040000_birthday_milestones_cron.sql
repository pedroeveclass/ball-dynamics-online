-- ─────────────────────────────────────────────────────────────
-- Birthday milestones — daily catchup cron
-- ─────────────────────────────────────────────────────────────
-- The engine fires birthday_20/25/30 milestones only when the player
-- plays a match on the exact day. Players who don't appear in a match
-- around their birthday silently skip the milestone. This cron scans
-- daily for any player at age 20/25/30 who doesn't yet have the
-- corresponding milestone narrative and persists it.
--
-- Idempotent via the partial UNIQUE index on
--   (entity_type, entity_id, milestone_type) WHERE milestone_type IS NOT NULL
-- so re-running is safe.

CREATE OR REPLACE FUNCTION public.dispatch_birthday_milestones()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_player RECORD;
  v_milestone_type TEXT;
  v_body_pt TEXT;
  v_body_en TEXT;
  v_label TEXT;
BEGIN
  FOR v_player IN
    SELECT pp.id, pp.full_name, pp.age, pp.user_id
      FROM public.player_profiles pp
     WHERE pp.age IN (20, 25, 30)
       AND NOT EXISTS (
         SELECT 1 FROM public.narratives n
         WHERE n.entity_type = 'player'
           AND n.entity_id = pp.id
           AND n.milestone_type = ('birthday_' || pp.age)
       )
  LOOP
    v_milestone_type := 'birthday_' || v_player.age;

    IF v_player.age = 20 THEN
      v_body_pt := v_player.full_name || ' completa 20 anos hoje. Idade simbólica pra qualquer atleta — sai oficialmente da fase de moleque e entra no momento em que se espera consistência, evolução técnica e lugar firmado entre os titulares do elenco.';
      v_body_en := v_player.full_name || ' turns 20 today. A symbolic age for any athlete — officially leaves the kid phase and enters the moment when consistency, technical evolution, and a firm starting role are expected.';
      v_label := '🎂 20 anos completados';
    ELSIF v_player.age = 25 THEN
      v_body_pt := '25 anos pra ' || v_player.full_name || '. Fase considerada o auge físico de qualquer atleta, momento de consolidar carreira, somar conquistas e tirar o máximo da forma boa. Ano importante pra qualquer profissional.';
      v_body_en := '25 turns for ' || v_player.full_name || '. Considered the physical peak phase for any athlete, a moment to consolidate career, add achievements, and extract maximum from peak form. An important year for any professional.';
      v_label := '🎂 25 anos — auge físico';
    ELSE -- 30
      v_body_pt := v_player.full_name || ' completa 30 anos hoje. Marca em que muitos atletas alcançam maturidade técnica e tática que faltava nas fases anteriores. Idade dos veteranos respeitados, daqueles que viraram referência dentro e fora de campo.';
      v_body_en := v_player.full_name || ' turns 30 today. A mark when many athletes reach the technical and tactical maturity that was lacking in earlier phases. The age of respected veterans, those who became references on and off the pitch.';
      v_label := '🎂 30 anos — veterano';
    END IF;

    INSERT INTO public.narratives (entity_type, entity_id, scope, milestone_type, body_pt, body_en, facts_json)
    VALUES ('player', v_player.id, 'milestone', v_milestone_type, v_body_pt, v_body_en,
            jsonb_build_object('milestone_type', v_milestone_type, 'player_name', v_player.full_name, 'age', v_player.age))
    ON CONFLICT DO NOTHING;

    -- Notification only for human-controlled players
    IF v_player.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, player_profile_id, type, title, body, link, read)
      VALUES (v_player.user_id, v_player.id, 'milestone', '🎉 Marco desbloqueado',
              v_label, '/player/' || v_player.id::text, false);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_birthday_milestones() TO service_role;

-- Daily cron at 03:00 UTC = 00:00 BRT
DO $$ BEGIN PERFORM cron.unschedule('birthday-milestones-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'birthday-milestones-daily',
      '0 3 * * *',
      $cron$ SELECT public.dispatch_birthday_milestones(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron schedule skipped: %', SQLERRM;
END $$;
