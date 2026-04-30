-- ═══════════════════════════════════════════════════════════
-- HOTFIX 2026-04-30: resolve_turn_with_events token type bug
-- ───────────────────────────────────────────────────────────
-- The original migration declared p_processing_token TEXT, but
-- match_turns.processing_token is UUID. The implicit comparison
-- `processing_token = p_processing_token` (uuid vs text) raises
-- `ERROR: operator does not exist: uuid = text` at runtime, so
-- supabase.rpc returns null. The engine treated null as "token
-- stolen" and bailed every tick — match froze at every resolution.
--
-- Drop and recreate with UUID parameter (matches claim function).
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.resolve_turn_with_events(UUID, TEXT, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.resolve_turn_with_events(
  p_turn_id UUID,
  p_processing_token UUID,
  p_resolution_script JSONB,
  p_events JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  resolved BOOLEAN,
  inserted_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_inserted INT := 0;
BEGIN
  UPDATE match_turns
     SET status              = 'resolved',
         resolved_at         = NOW(),
         resolution_script   = p_resolution_script
   WHERE id                  = p_turn_id
     AND processing_token    = p_processing_token
   RETURNING match_id INTO v_match_id;

  IF v_match_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  IF p_events IS NOT NULL AND jsonb_typeof(p_events) = 'array' AND jsonb_array_length(p_events) > 0 THEN
    INSERT INTO match_event_logs (match_id, event_type, title, body, payload)
    SELECT v_match_id,
           e->>'event_type',
           COALESCE(e->>'title', ''),
           COALESCE(e->>'body', ''),
           e->'payload'
      FROM jsonb_array_elements(p_events) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT TRUE, v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_turn_with_events(UUID, UUID, JSONB, JSONB) TO service_role;
