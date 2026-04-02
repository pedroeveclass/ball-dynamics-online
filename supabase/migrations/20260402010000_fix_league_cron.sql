-- Fix league cron: run Wed/Sun at 00:00 UTC (= 21:00 BRT previous day)
-- This matches the league match schedule (Wed + Sun at 21:00 BRT)

-- Remove old cron
DO $$ BEGIN
  PERFORM cron.unschedule('league-process-rounds');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule new cron: Wednesday + Sunday at 00:00 UTC (21:00 BRT)
SELECT cron.schedule(
  'league-process-rounds',
  '0 0 * * 3,0',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"process_due_rounds"}'::jsonb
  );
  $$
);

-- Also add a fallback cron that runs every hour to catch any missed rounds
DO $$ BEGIN
  PERFORM cron.unschedule('league-process-rounds-fallback');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'league-process-rounds-fallback',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"process_due_rounds"}'::jsonb
  );
  $$
);
