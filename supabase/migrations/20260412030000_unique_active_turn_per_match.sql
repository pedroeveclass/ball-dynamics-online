-- ═══════════════════════════════════════════════════════════
-- Enforce "at most one active turn per match" at the DB level.
-- Prevents engine-tick races from spawning duplicate active turns
-- (the root cause of the "two matches running at once" symptom).
-- ═══════════════════════════════════════════════════════════

-- 1. Resolve any existing duplicate active turns before the index is created
--    (keep the most recent one per match).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY match_id
           ORDER BY turn_number DESC, created_at DESC
         ) AS rn
  FROM match_turns
  WHERE status = 'active'
)
UPDATE match_turns mt
SET status = 'resolved', resolved_at = COALESCE(mt.resolved_at, now())
FROM ranked r
WHERE mt.id = r.id AND r.rn > 1;

-- 2. Enforce the invariant going forward
CREATE UNIQUE INDEX IF NOT EXISTS ux_match_turns_one_active_per_match
  ON match_turns(match_id)
  WHERE status = 'active';
