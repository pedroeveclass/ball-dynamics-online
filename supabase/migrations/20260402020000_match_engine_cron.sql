-- ═══════════════════════════════════════════════════════════
-- Match Engine Cron: process due turns every 10 seconds
-- This ensures matches run even without any human spectator
-- ═══════════════════════════════════════════════════════════

-- Remove old cron if exists
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-process');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Run every 10 seconds (pg_cron minimum is 1 minute, so we use pg_net for sub-minute)
-- Fallback: run every minute with pg_cron
SELECT cron.schedule(
  'match-engine-process',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/match-engine-lab',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"process_due_matches"}'::jsonb
  );
  $$
);
