-- ═══════════════════════════════════════════════════════════
-- admin_materialize_league_match
-- Mirrors league-scheduler edge function's materializeLeagueMatch:
-- creates a matches row for a league_match that hasn't been
-- materialized yet (normally happens 5min before kickoff). Used
-- so admin "Iniciar"/"Simular" works on rounds whose kickoff is
-- further in the future.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_materialize_league_match(
  p_league_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lm RECORD;
  v_round_at TIMESTAMPTZ;
  v_home_lineup UUID;
  v_away_lineup UUID;
  v_match_id UUID;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT lm.id, lm.home_club_id, lm.away_club_id, lm.match_id, lm.round_id, lr.scheduled_at
  INTO v_lm
  FROM public.league_matches lm
  JOIN public.league_rounds lr ON lr.id = lm.round_id
  WHERE lm.id = p_league_match_id;

  IF v_lm IS NULL THEN
    RAISE EXCEPTION 'league_match not found';
  END IF;

  -- Already materialized — just return the existing id.
  IF v_lm.match_id IS NOT NULL THEN
    RETURN v_lm.match_id;
  END IF;

  v_round_at := v_lm.scheduled_at;

  SELECT id INTO v_home_lineup FROM public.lineups
   WHERE club_id = v_lm.home_club_id AND is_active = true LIMIT 1;
  IF v_home_lineup IS NULL THEN
    SELECT id INTO v_home_lineup FROM public.lineups
     WHERE club_id = v_lm.home_club_id ORDER BY updated_at DESC LIMIT 1;
  END IF;

  SELECT id INTO v_away_lineup FROM public.lineups
   WHERE club_id = v_lm.away_club_id AND is_active = true LIMIT 1;
  IF v_away_lineup IS NULL THEN
    SELECT id INTO v_away_lineup FROM public.lineups
     WHERE club_id = v_lm.away_club_id ORDER BY updated_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.matches (
    home_club_id, away_club_id, scheduled_at, status,
    home_lineup_id, away_lineup_id, current_half, injury_time_turns
  ) VALUES (
    v_lm.home_club_id, v_lm.away_club_id, v_round_at, 'scheduled',
    v_home_lineup, v_away_lineup, 1, 0
  )
  RETURNING id INTO v_match_id;

  -- Race-safe link (only if still null).
  UPDATE public.league_matches SET match_id = v_match_id
   WHERE id = p_league_match_id AND match_id IS NULL;

  IF NOT FOUND THEN
    -- Someone else won the race; drop ours and re-read.
    DELETE FROM public.matches WHERE id = v_match_id;
    SELECT match_id INTO v_match_id FROM public.league_matches WHERE id = p_league_match_id;
  END IF;

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_materialize_league_match(UUID) TO authenticated;
