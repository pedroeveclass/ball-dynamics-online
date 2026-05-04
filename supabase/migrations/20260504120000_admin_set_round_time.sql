-- Set BRT time of a round (or all future rounds of a league) without
-- shifting the date. Keeps the local-BRT calendar day intact and
-- replaces only the hour/minute, then converts back to UTC for storage.

CREATE OR REPLACE FUNCTION public.admin_set_round_time(
  p_league_id UUID,
  p_round_id UUID DEFAULT NULL,
  p_brt_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_time TIME;
  v_count INT := 0;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_brt_time IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_time'); END IF;

  v_new_time := p_brt_time::TIME;

  IF p_round_id IS NOT NULL THEN
    -- Single-round: update just this row (regardless of league or season).
    UPDATE public.league_rounds
       SET scheduled_at = (
         (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::DATE + v_new_time
       ) AT TIME ZONE 'America/Sao_Paulo'
     WHERE id = p_round_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- League-wide: every future round (status='scheduled') of any season
    -- in this league gets the new BRT time.
    UPDATE public.league_rounds lr
       SET scheduled_at = (
         (lr.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::DATE + v_new_time
       ) AT TIME ZONE 'America/Sao_Paulo'
      FROM public.league_seasons ls
     WHERE ls.id = lr.season_id
       AND ls.league_id = p_league_id
       AND lr.status = 'scheduled'
       AND lr.scheduled_at >= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rounds_updated', v_count, 'new_brt_time', p_brt_time);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_round_time(UUID, UUID, TEXT) TO authenticated;
