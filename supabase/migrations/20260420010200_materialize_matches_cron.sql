-- ═══════════════════════════════════════════════════════════
-- Materialize league matches 5 minutes before kickoff
-- Creates matches rows from league_matches where match_id IS NULL
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM cron.unschedule('league-materialize-upcoming');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'league-materialize-upcoming',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"materialize_upcoming_matches"}'::jsonb
  );
  $$
);
