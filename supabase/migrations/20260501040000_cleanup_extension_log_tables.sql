-- ═══════════════════════════════════════════════════════════
-- DB cleanup: pg_net + pg_cron log tables (2026-05-01)
-- ───────────────────────────────────────────────────────────
-- net._http_response (340 MB) and cron.job_run_details (189 MB)
-- accounted for 76% of the 693 MB DB (free tier limit 500 MB).
-- Neither is read by application code — verified by grepping all
-- migrations, edge functions, and client. Both are append-only
-- logs from pg_net (HTTP responses to net.http_post calls) and
-- pg_cron (job execution history) with no built-in TTL.
-- ═══════════════════════════════════════════════════════════

-- One-shot purge ----------------------------------------------
TRUNCATE TABLE net._http_response;

DELETE FROM cron.job_run_details
  WHERE end_time < NOW() - INTERVAL '1 day';

-- Recurring cleanup at 03:00 UTC (00:00 BRT, off-peak) ---------
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-extension-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-extension-logs',
  '0 3 * * *',
  $$
    TRUNCATE TABLE net._http_response;
    DELETE FROM cron.job_run_details
      WHERE end_time < NOW() - INTERVAL '1 day';
  $$
);
