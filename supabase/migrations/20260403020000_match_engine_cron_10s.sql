-- ═══════════════════════════════════════════════════════════
-- Match Engine Cron: process due turns every ~10 seconds
-- pg_cron minimum is 1 minute, so we schedule 6 jobs offset
-- by 10 seconds each using pg_net delayed requests
-- ═══════════════════════════════════════════════════════════

-- Remove old single cron
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-process');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Remove old 10s jobs if they exist (for idempotency)
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t0');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t10');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t20');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t30');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t40');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('match-engine-t50');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Helper function: fire match-engine with optional delay
CREATE OR REPLACE FUNCTION public.trigger_match_engine(delay_seconds INT DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/match-engine-lab',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"process_due_matches"}'::jsonb,
    timeout_milliseconds := 5000
  );
END;
$fn$;

-- Schedule 6 cron jobs, each fires every minute but at different second offsets
-- Since pg_cron all fire at second 0, we use pg_sleep inside a wrapper

-- t=0s (fires immediately at the top of each minute)
SELECT cron.schedule(
  'match-engine-t0',
  '* * * * *',
  $$SELECT public.trigger_match_engine(0);$$
);

-- t=10s
SELECT cron.schedule(
  'match-engine-t10',
  '* * * * *',
  $$SELECT pg_sleep(10); SELECT public.trigger_match_engine(0);$$
);

-- t=20s
SELECT cron.schedule(
  'match-engine-t20',
  '* * * * *',
  $$SELECT pg_sleep(20); SELECT public.trigger_match_engine(0);$$
);

-- t=30s
SELECT cron.schedule(
  'match-engine-t30',
  '* * * * *',
  $$SELECT pg_sleep(30); SELECT public.trigger_match_engine(0);$$
);

-- t=40s
SELECT cron.schedule(
  'match-engine-t40',
  '* * * * *',
  $$SELECT pg_sleep(40); SELECT public.trigger_match_engine(0);$$
);

-- t=50s
SELECT cron.schedule(
  'match-engine-t50',
  '* * * * *',
  $$SELECT pg_sleep(50); SELECT public.trigger_match_engine(0);$$
);
