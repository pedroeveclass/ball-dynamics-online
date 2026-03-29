-- ============================================================
-- Migration: Add CRON_SECRET header to cron job HTTP calls
-- ============================================================
-- SETUP REQUIRED:
-- 1. Set the Edge Function secret in Supabase Dashboard > Edge Functions > Secrets:
--    CRON_SECRET = 'your-random-secret-here'
-- 2. Set the Postgres setting so cron jobs can read it:
--    ALTER DATABASE postgres SET app.settings.cron_secret = 'your-random-secret-here';
-- ============================================================

-- ── 1. Re-create league-process-rounds with secret header ──
SELECT cron.unschedule('league-process-rounds');
SELECT cron.schedule(
  'league-process-rounds',
  '0 0 * * 1,4',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{"action":"process_due_rounds"}'::jsonb
    );
  $$
);

-- ── 2. Re-create weekly-finances with secret header ──
SELECT cron.unschedule('weekly-finances');
SELECT cron.schedule(
  'weekly-finances',
  '0 3 * * 1',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/weekly-finances',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ── 3. Re-create league-apply-votes with secret header ──
SELECT cron.unschedule('league-apply-votes');
SELECT cron.schedule(
  'league-apply-votes',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{"action":"apply_votes"}'::jsonb
    );
  $$
);

-- ── 4. Update the apply_league_schedule_votes function to use secret ──
CREATE OR REPLACE FUNCTION public.apply_league_schedule_votes()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_expr TEXT;
BEGIN
  -- Get winning schedule from votes (majority)
  SELECT ls.cron_expression INTO cron_expr
    FROM league_schedule_votes v
    JOIN league_schedules ls ON ls.id = v.schedule_id
    GROUP BY ls.id, ls.cron_expression
    ORDER BY count(*) DESC
    LIMIT 1;

  IF cron_expr IS NULL THEN RETURN; END IF;

  PERFORM cron.unschedule('league-process-rounds');
  PERFORM cron.schedule(
    'league-process-rounds',
    cron_expr,
    $$
      SELECT net.http_post(
        url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/league-scheduler',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{"action":"process_due_rounds"}'::jsonb
      );
    $$
  );
END;
$$;

-- NOTE: match-engine-lab cron does NOT get a secret header because
-- match-engine-lab is also called from the frontend during matches.
-- Its cron is left unchanged.
