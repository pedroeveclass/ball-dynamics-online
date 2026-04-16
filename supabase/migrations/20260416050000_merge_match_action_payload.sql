-- Atomic JSONB merge for match_actions.payload.
--
-- Problem: the resolution engine reads action rows into memory, then writes
-- back `payload: { ...inMemoryPayload, move_dx, move_dy, move_ratio }`. If the
-- CLIENT updated the payload after the engine's SELECT but before its UPDATE
-- (e.g., the inertia power slider raced the phase end), the engine's UPDATE
-- overwrites the client's write with the stale in-memory copy — losing
-- `inertia_power`.
--
-- Fix: use this function to merge the engine's patch with the DB's CURRENT
-- payload atomically, preserving any fields the client may have just written.

CREATE OR REPLACE FUNCTION public.merge_match_action_payload(
  p_action_id UUID,
  p_patch JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.match_actions
  SET payload = COALESCE(payload, '{}'::jsonb) || p_patch
  WHERE id = p_action_id;
$$;
