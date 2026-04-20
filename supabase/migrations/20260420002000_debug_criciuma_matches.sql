-- Debug: dump all Criciúma matches from today/tomorrow window
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  RAISE NOTICE '[DEBUG] Criciúma matches (scheduled/live/finished recently):';
  FOR v_rec IN
    SELECT m.id, m.status,
           ch.name AS home, ca.name AS away,
           m.home_score, m.away_score,
           m.scheduled_at, m.started_at, m.finished_at,
           m.current_turn_number, m.current_half
      FROM public.matches m
      JOIN public.clubs ch ON ch.id = m.home_club_id
      JOIN public.clubs ca ON ca.id = m.away_club_id
     WHERE (ch.name ILIKE '%crici%' OR ca.name ILIKE '%crici%')
       AND m.scheduled_at >= now() - interval '2 days'
       AND m.scheduled_at <= now() + interval '1 day'
     ORDER BY m.scheduled_at DESC
  LOOP
    RAISE NOTICE '[DEBUG] id=% status=% % x % score=%-% sched=% started=% finished=% turn=% half=%',
                 v_rec.id, v_rec.status, v_rec.home, v_rec.away,
                 v_rec.home_score, v_rec.away_score,
                 v_rec.scheduled_at, v_rec.started_at, v_rec.finished_at,
                 v_rec.current_turn_number, v_rec.current_half;
  END LOOP;

  RAISE NOTICE '[DEBUG] All match statuses count (today):';
  FOR v_rec IN
    SELECT status, count(*) AS n
      FROM public.matches
     WHERE scheduled_at >= now() - interval '2 days'
       AND scheduled_at <= now() + interval '1 day'
     GROUP BY status
  LOOP
    RAISE NOTICE '[DEBUG]   %=%', v_rec.status, v_rec.n;
  END LOOP;
END $$;
