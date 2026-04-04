-- ═══════════════════════════════════════════════════════════
-- RESET LEAGUE: Redo all rounds starting Sun 05/04/2026
-- Odd rounds = Sunday, Even rounds = Wednesday, 21h BRT
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_season_id   UUID;
  v_round       RECORD;
  v_round_date  TIMESTAMPTZ;
  v_current_sun TIMESTAMPTZ;
  v_match_ids   UUID[];
BEGIN
  -- ── Get the active season ──
  SELECT ls.id INTO v_season_id
    FROM public.league_seasons ls
    JOIN public.leagues l ON l.id = ls.league_id
   WHERE l.name = 'Liga Brasileira - Serie A'
     AND ls.season_number = 1
   LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Season not found!';
  END IF;

  -- ── 1. Reset season status ──
  UPDATE public.league_seasons
     SET status = 'scheduled',
         started_at = NULL,
         finished_at = NULL,
         next_season_at = NULL
   WHERE id = v_season_id;

  RAISE NOTICE '[RESET] Season % reset to scheduled', v_season_id;

  -- ── 2. Reset all standings to zero ──
  UPDATE public.league_standings
     SET played = 0, won = 0, drawn = 0, lost = 0,
         goals_for = 0, goals_against = 0, points = 0,
         updated_at = now()
   WHERE season_id = v_season_id;

  RAISE NOTICE '[RESET] Standings zeroed';

  -- ── 3. Reset all matches linked to this season ──
  SELECT array_agg(lm.match_id) INTO v_match_ids
    FROM public.league_matches lm
    JOIN public.league_rounds lr ON lr.id = lm.round_id
   WHERE lr.season_id = v_season_id
     AND lm.match_id IS NOT NULL;

  IF v_match_ids IS NOT NULL THEN
    -- Delete in FK order: actions → turns → participants
    DELETE FROM public.match_actions ma
     USING public.match_turns mt
     WHERE ma.match_turn_id = mt.id
       AND mt.match_id = ANY(v_match_ids);

    DELETE FROM public.match_turns
     WHERE match_id = ANY(v_match_ids);

    DELETE FROM public.match_event_logs
     WHERE match_id = ANY(v_match_ids);

    DELETE FROM public.match_participants
     WHERE match_id = ANY(v_match_ids);

    -- Reset match statuses and scores
    UPDATE public.matches
       SET status = 'scheduled',
           home_score = 0,
           away_score = 0,
           current_turn_number = 0,
           started_at = NULL,
           finished_at = NULL
     WHERE id = ANY(v_match_ids);

    RAISE NOTICE '[RESET] % matches reset', array_length(v_match_ids, 1);
  END IF;

  -- ── 4. Reschedule rounds ──
  -- Round 1 (odd):  Sun 05/04 21h BRT = 2026-04-06 00:00 UTC
  -- Round 2 (even): Wed 08/04 21h BRT = 2026-04-09 00:00 UTC
  -- Round 3 (odd):  Sun 12/04 21h BRT = 2026-04-13 00:00 UTC
  -- ...pattern: odd=Sunday, even=Wednesday (+3 days), then next week
  --
  -- Schedule (21h BRT = 00:00 UTC next day):
  --  R1  Sun 05/04 → 2026-04-06T00:00Z
  --  R2  Wed 08/04 → 2026-04-09T00:00Z
  --  R3  Sun 12/04 → 2026-04-13T00:00Z
  --  R4  Wed 15/04 → 2026-04-16T00:00Z
  --  R5  Sun 19/04 → 2026-04-20T00:00Z
  --  R6  Wed 22/04 → 2026-04-23T00:00Z
  --  R7  Sun 26/04 → 2026-04-27T00:00Z
  --  R8  Wed 29/04 → 2026-04-30T00:00Z
  --  R9  Sun 03/05 → 2026-05-04T00:00Z
  --  R10 Wed 06/05 → 2026-05-07T00:00Z
  --  R11 Sun 10/05 → 2026-05-11T00:00Z
  --  R12 Wed 13/05 → 2026-05-14T00:00Z
  --  R13 Sun 17/05 → 2026-05-18T00:00Z
  --  R14 Wed 20/05 → 2026-05-21T00:00Z
  --  R15 Sun 24/05 → 2026-05-25T00:00Z
  --  R16 Wed 27/05 → 2026-05-28T00:00Z
  --  R17 Sun 31/05 → 2026-06-01T00:00Z
  --  R18 Wed 03/06 → 2026-06-04T00:00Z
  --  R19 Sun 07/06 → 2026-06-08T00:00Z

  v_current_sun := '2026-04-06T00:00:00+00:00'::TIMESTAMPTZ;  -- Sun 05/04 21h BRT

  FOR v_round IN
    SELECT id, round_number
      FROM public.league_rounds
     WHERE season_id = v_season_id
     ORDER BY round_number
  LOOP
    IF v_round.round_number % 2 = 1 THEN
      -- Odd round = Sunday
      v_round_date := v_current_sun;
    ELSE
      -- Even round = Wednesday (Sunday + 3 days)
      v_round_date := v_current_sun + INTERVAL '3 days';
    END IF;

    -- After even round, advance Sunday by 7 days
    IF v_round.round_number % 2 = 0 THEN
      v_current_sun := v_current_sun + INTERVAL '7 days';
    END IF;

    -- Update round
    UPDATE public.league_rounds
       SET scheduled_at = v_round_date,
           status = 'scheduled'
     WHERE id = v_round.id;

    -- Update linked matches scheduled_at too
    UPDATE public.matches m
       SET scheduled_at = v_round_date
      FROM public.league_matches lm
     WHERE lm.round_id = v_round.id
       AND lm.match_id = m.id;

    RAISE NOTICE '[RESET] Round % → %', v_round.round_number, v_round_date;
  END LOOP;

  RAISE NOTICE '[RESET] ════════════════════════════════════════';
  RAISE NOTICE '[RESET] League reset complete!';
  RAISE NOTICE '[RESET] Round 1:  Sun 05/04 21h BRT';
  RAISE NOTICE '[RESET] Round 19: Sun 07/06 21h BRT';
  RAISE NOTICE '[RESET] Pattern: Odd=Domingo, Even=Quarta';
  RAISE NOTICE '[RESET] ════════════════════════════════════════';
END $$;
