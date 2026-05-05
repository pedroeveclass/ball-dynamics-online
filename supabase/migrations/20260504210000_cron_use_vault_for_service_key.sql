-- After migrating to new sb_secret_ keys (2026-05-04), pg_cron jobs that
-- hardcoded the legacy service_role JWT in their Authorization header all
-- broke when Pedro disabled JWT-based legacy keys. This migration:
--   1. Stores the new secret in vault (handled out-of-band beforehand)
--   2. Adds a SECURITY DEFINER helper so any role can read it
--   3. Rewrites every cron command to use the helper
-- Future rotations only need vault.update_secret — cron commands stay stable.

CREATE OR REPLACE FUNCTION public.cron_auth_header()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT 'Bearer ' || decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.cron_auth_header() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_auth_header() TO postgres;

-- Update each of the 6 affected cron jobs

SELECT cron.alter_job(
  job_id := 8,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{"action":"process_due_rounds"}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  job_id := 9,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{"action":"process_due_rounds"}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  job_id := 6,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/weekly-finances',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  job_id := 26,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/energy-regen',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  job_id := 30,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{"action":"materialize_due_pickups"}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  job_id := 31,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://vbpgsdotwsfsiutydpad.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object('Content-Type','application/json','Authorization', public.cron_auth_header()),
      body := '{"action":"materialize_upcoming_matches"}'::jsonb
    );
  $cmd$
);
