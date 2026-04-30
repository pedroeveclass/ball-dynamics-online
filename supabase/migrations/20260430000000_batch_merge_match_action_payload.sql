-- ═══════════════════════════════════════════════════════════
-- Batch JSONB-merge match_actions.payload for many actions in
-- a single round-trip. Mirrors the per-row merge_match_action_payload
-- (atomic `payload || patch`) but lets the engine flush all
-- moves at once instead of N sequential RPCs (the res_motion
-- bottleneck under concurrent league matches).
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_merge_match_action_payload(
  p_updates JSONB
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.match_actions ma
     SET payload = COALESCE(ma.payload, '{}'::jsonb) || (u->'patch')
    FROM jsonb_array_elements(p_updates) AS u
   WHERE ma.id = (u->>'action_id')::UUID;
$$;
