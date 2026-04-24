-- ═══════════════════════════════════════════════════════════
-- Fix both materialization crons.
--
-- They were using `current_setting('app.settings.supabase_url')` and
-- `app.settings.service_role_key`, but those parameters aren't set
-- on this DB (permission denied to ALTER DATABASE), so the crons
-- were erroring every minute ("unrecognized configuration parameter")
-- and never firing the edge function. Symptom: pickup lobbies stuck
-- on "Preparando" past kickoff; league matches not materialized 5min
-- before kickoff.
--
-- Fix: hardcode the URL + service_role JWT, matching the pattern
-- already used by `league-process-rounds` (which hardcodes the URL).
-- The service_role key is the public-facing API key — same one the
-- front-end uses (minus the role claim). Rotating requires re-running
-- this migration with the new JWT.
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN PERFORM cron.unschedule('pickup-materialize-due'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'pickup-materialize-due',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicGdzZG90d3Nmc2l1dHlkcGFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTk3NywiZXhwIjoyMDkwOTY3OTc3fQ.oa9VAW5vpNn5pdw8nq1JuKvlSsYmUgmeztHNe1SwkFo'
    ),
    body := '{"action":"materialize_due_pickups"}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('league-materialize-upcoming'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'league-materialize-upcoming',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicGdzZG90d3Nmc2l1dHlkcGFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTk3NywiZXhwIjoyMDkwOTY3OTc3fQ.oa9VAW5vpNn5pdw8nq1JuKvlSsYmUgmeztHNe1SwkFo'
    ),
    body := '{"action":"materialize_upcoming_matches"}'::jsonb
  );
  $$
);
