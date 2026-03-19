ALTER TABLE public.match_turns
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_token UUID;

CREATE OR REPLACE FUNCTION public.claim_match_turn_for_processing(
  p_match_id UUID,
  p_processing_token UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stale_after INTERVAL DEFAULT INTERVAL '15 seconds'
)
RETURNS SETOF public.match_turns
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.match_turns
  SET
    processing_started_at = p_now,
    processing_token = p_processing_token
  WHERE id = (
    SELECT id
    FROM public.match_turns
    WHERE match_id = p_match_id
      AND status = 'active'
      AND (
        processing_started_at IS NULL
        OR processing_started_at < (p_now - p_stale_after)
      )
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.release_match_turn_processing(
  p_turn_id UUID,
  p_processing_token UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.match_turns
  SET
    processing_started_at = NULL,
    processing_token = NULL
  WHERE id = p_turn_id
    AND processing_token = p_processing_token
    AND status = 'active';
$$;

SELECT cron.schedule(
  'match-engine-lab-process-due-matches',
  '1 seconds',
  $$
    SELECT net.http_post(
      url := 'https://wfkmojrwgerfzjcrpqnl.supabase.co/functions/v1/match-engine-lab',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"process_due_matches"}'::jsonb
    ) AS request_id;
  $$
);
