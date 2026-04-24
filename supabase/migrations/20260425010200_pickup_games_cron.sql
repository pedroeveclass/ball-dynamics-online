-- ═══════════════════════════════════════════════════════════
-- Cron: every minute, materialize any pickup_games whose
-- kickoff_at has arrived. Chains into league-scheduler which
-- creates the matches row, pre-seeds participants (humans +
-- bots), and fires match-engine-lab auto_start.
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM cron.unschedule('pickup-materialize-due');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'pickup-materialize-due',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/league-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"materialize_due_pickups"}'::jsonb
  );
  $$
);
