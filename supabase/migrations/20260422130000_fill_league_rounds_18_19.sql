-- ═══════════════════════════════════════════════════════════
-- Fill round 18 (empty stub) and create round 19 with the
-- remaining 20 matchups needed to complete the turno único.
--
-- Context: Production league had 17 fully-seeded rounds, round
-- 18 existed as a row with 0 matches, and round 19 was missing
-- entirely. Computed the 20 missing pairings (each team had
-- exactly 2 unplayed opponents; the missing-pairs graph forms
-- one 20-node cycle) and split them into two balanced rounds.
-- Home/away assigned to keep each team at 9–10 home games
-- across the season (JAG=11, RAI=8 are unavoidable from
-- pre-existing imbalance in rounds 1–17).
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_season_id   UUID;
  v_round_18_id UUID;
  v_round_19_id UUID;

  -- Club IDs by short_name
  v_agd UUID; v_ast UUID; v_cob UUID; v_com UUID; v_cri UUID;
  v_dra UUID; v_fal UUID; v_fen UUID; v_gua UUID; v_imb UUID;
  v_jag UUID; v_leo UUID; v_lob UUID; v_mar UUID; v_pan UUID;
  v_rai UUID; v_sas UUID; v_tit UUID; v_ven UUID; v_vul UUID;
BEGIN
  -- ── 1. Resolve season + existing round 18 ──
  SELECT id, season_id INTO v_round_18_id, v_season_id
    FROM public.league_rounds
   WHERE round_number = 18
   LIMIT 1;

  IF v_round_18_id IS NULL THEN
    RAISE EXCEPTION '[FILL-R18-R19] Round 18 not found';
  END IF;

  -- Guard: refuse to double-insert if round 18 already has matches
  IF (SELECT COUNT(*) FROM public.league_matches WHERE round_id = v_round_18_id) > 0 THEN
    RAISE NOTICE '[FILL-R18-R19] Round 18 already populated — skipping';
    RETURN;
  END IF;

  -- ── 2. Resolve all 20 club IDs by short_name ──
  SELECT id INTO v_agd FROM public.clubs WHERE short_name = 'AGD';
  SELECT id INTO v_ast FROM public.clubs WHERE short_name = 'AST';
  SELECT id INTO v_cob FROM public.clubs WHERE short_name = 'COB';
  SELECT id INTO v_com FROM public.clubs WHERE short_name = 'COM';
  SELECT id INTO v_cri FROM public.clubs WHERE short_name = 'CRI';
  SELECT id INTO v_dra FROM public.clubs WHERE short_name = 'DRA';
  SELECT id INTO v_fal FROM public.clubs WHERE short_name = 'FAL';
  SELECT id INTO v_fen FROM public.clubs WHERE short_name = 'FEN';
  SELECT id INTO v_gua FROM public.clubs WHERE short_name = 'GUA';
  SELECT id INTO v_imb FROM public.clubs WHERE short_name = 'IMB';
  SELECT id INTO v_jag FROM public.clubs WHERE short_name = 'JAG';
  SELECT id INTO v_leo FROM public.clubs WHERE short_name = 'LEO';
  SELECT id INTO v_lob FROM public.clubs WHERE short_name = 'LOB';
  SELECT id INTO v_mar FROM public.clubs WHERE short_name = 'MAR';
  SELECT id INTO v_pan FROM public.clubs WHERE short_name = 'PAN';
  SELECT id INTO v_rai FROM public.clubs WHERE short_name = 'RAI';
  SELECT id INTO v_sas FROM public.clubs WHERE short_name = 'SAS';
  SELECT id INTO v_tit FROM public.clubs WHERE short_name = 'TIT';
  SELECT id INTO v_ven FROM public.clubs WHERE short_name = 'VEN';
  SELECT id INTO v_vul FROM public.clubs WHERE short_name = 'VUL';

  -- ── 3. Insert 10 matches into round 18 (Sun 2026-06-07 21h BRT) ──
  INSERT INTO public.league_matches (round_id, match_id, home_club_id, away_club_id) VALUES
    (v_round_18_id, NULL, v_cob, v_agd),
    (v_round_18_id, NULL, v_rai, v_fen),
    (v_round_18_id, NULL, v_ven, v_pan),
    (v_round_18_id, NULL, v_dra, v_lob),
    (v_round_18_id, NULL, v_mar, v_tit),
    (v_round_18_id, NULL, v_sas, v_vul),
    (v_round_18_id, NULL, v_jag, v_leo),
    (v_round_18_id, NULL, v_ast, v_cri),
    (v_round_18_id, NULL, v_imb, v_fal),
    (v_round_18_id, NULL, v_com, v_gua);

  RAISE NOTICE '[FILL-R18-R19] Inserted 10 matches into round 18 (%)', v_round_18_id;

  -- ── 4. Create round 19 (Wed 2026-06-10 21h BRT = 2026-06-11 00:00 UTC) ──
  INSERT INTO public.league_rounds (season_id, round_number, scheduled_at, status)
  VALUES (v_season_id, 19, '2026-06-11T00:00:00+00:00'::TIMESTAMPTZ, 'scheduled')
  RETURNING id INTO v_round_19_id;

  -- ── 5. Insert 10 matches into round 19 ──
  INSERT INTO public.league_matches (round_id, match_id, home_club_id, away_club_id) VALUES
    (v_round_19_id, NULL, v_cob, v_fen),
    (v_round_19_id, NULL, v_rai, v_pan),
    (v_round_19_id, NULL, v_lob, v_ven),
    (v_round_19_id, NULL, v_tit, v_dra),
    (v_round_19_id, NULL, v_mar, v_vul),
    (v_round_19_id, NULL, v_sas, v_jag),
    (v_round_19_id, NULL, v_cri, v_leo),
    (v_round_19_id, NULL, v_fal, v_ast),
    (v_round_19_id, NULL, v_gua, v_imb),
    (v_round_19_id, NULL, v_com, v_agd);

  RAISE NOTICE '[FILL-R18-R19] Created round 19 (%) with 10 matches', v_round_19_id;
END $$;
