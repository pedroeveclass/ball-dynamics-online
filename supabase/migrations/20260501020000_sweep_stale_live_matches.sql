-- ═══════════════════════════════════════════════════════════════════
-- Recurring orphan-match sweep
--
-- Pedro reported (2026-05-01) that a pickup match he abandoned mid-game
-- stayed in `status='live'` and blocked him from starting a new match
-- with the same clubs (the matches_one_live_per_*_club UNIQUE indexes
-- from migration 20260430030000 enforce that). The repair migration
-- only ran the sweep ONCE; subsequent abandons accumulate the same way.
--
-- This migration:
--  1) creates `sweep_stale_live_matches(threshold_minutes int default 30)`
--     which force-finishes any `live` match whose `updated_at` is older
--     than the threshold. Idempotent — does nothing if there are no
--     stale rows.
--  2) schedules pg_cron to run the sweep every 5 minutes. 30-minute
--     threshold absorbs halftime (5 min) + slow phases + a stuck cron
--     cycle, but kicks in before the orphan blocks the next match
--     creation for the affected clubs.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sweep_stale_live_matches(threshold_minutes INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_swept INT;
BEGIN
  WITH updated AS (
    UPDATE public.matches
       SET status = 'finished',
           finished_at = NOW()
     WHERE status = 'live'
       AND updated_at < NOW() - make_interval(mins => threshold_minutes)
     RETURNING id
  )
  SELECT count(*) INTO v_swept FROM updated;

  IF v_swept > 0 THEN
    RAISE NOTICE 'sweep_stale_live_matches: force-finished % stale match(es) (threshold=% min)', v_swept, threshold_minutes;
  END IF;

  RETURN v_swept;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_stale_live_matches(INT) TO service_role;

-- Schedule the sweep every 5 minutes. Uses pg_cron (already enabled for the
-- engine triggers). Idempotent re-creation: drop any prior schedule with the
-- same name first.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE command LIKE '%sweep_stale_live_matches%';
EXCEPTION WHEN undefined_function THEN
  -- pg_cron not installed in this environment (e.g. local). Migration is
  -- still applied as a no-op for the schedule; the function is created and
  -- can be invoked manually or via another runner.
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'sweep-stale-live-matches',
    '*/5 * * * *',
    $cron$SELECT public.sweep_stale_live_matches(30);$cron$
  );
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$$;
