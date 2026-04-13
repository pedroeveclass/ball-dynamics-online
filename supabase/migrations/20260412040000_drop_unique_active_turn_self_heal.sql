-- ═══════════════════════════════════════════════════════════
-- Drop the unique partial index on match_turns(match_id) WHERE status='active'.
--
-- Rationale: the constraint was too aggressive — when two engine
-- invocations raced on a turn transition, the 2nd insert failed with
-- a unique violation and the tick aborted mid-flight, leaving the
-- match with zero active turns (fully stuck).
--
-- Instead we rely on:
--   a) consumers (frontend, engine) picking the most recent active
--      turn via ORDER BY created_at DESC LIMIT 1;
--   b) a self-healing cleanup that resolves stale duplicate actives.
-- ═══════════════════════════════════════════════════════════

DROP INDEX IF EXISTS ux_match_turns_one_active_per_match;

-- Self-heal helper: resolve any non-latest active turns for a match.
CREATE OR REPLACE FUNCTION public.resolve_stale_active_turns(p_match_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY turn_number DESC, created_at DESC
           ) AS rn
    FROM match_turns
    WHERE match_id = p_match_id AND status = 'active'
  )
  UPDATE match_turns mt
  SET status = 'resolved', resolved_at = COALESCE(mt.resolved_at, now())
  FROM ranked r
  WHERE mt.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
