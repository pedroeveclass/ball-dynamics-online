-- ============================================================
-- Fix: claim_match_turn_for_processing uses FOR UPDATE SKIP LOCKED
-- to prevent two instances from claiming the same turn simultaneously.
-- The old version used UPDATE ... WHERE id = (SELECT ...) which allowed
-- race conditions where both instances read processing_started_at IS NULL
-- before either had written their claim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_match_turn_for_processing(
  p_match_id UUID,
  p_processing_token UUID,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_stale_after INTERVAL DEFAULT INTERVAL '15 seconds'
)
RETURNS SETOF public.match_turns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turn_id UUID;
  v_result public.match_turns%ROWTYPE;
BEGIN
  -- Atomically select and lock the turn row.
  -- FOR UPDATE locks the row; SKIP LOCKED means if another transaction
  -- already locked it, this one gets nothing (returns empty).
  SELECT id INTO v_turn_id
    FROM public.match_turns
   WHERE match_id = p_match_id
     AND status = 'active'
     AND (
       processing_started_at IS NULL
       OR processing_started_at < (p_now - p_stale_after)
     )
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  -- If no row was found (or it was already locked), return empty
  IF v_turn_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim it
  UPDATE public.match_turns
     SET processing_started_at = p_now,
         processing_token = p_processing_token
   WHERE id = v_turn_id
  RETURNING * INTO v_result;

  RETURN NEXT v_result;
END;
$$;
