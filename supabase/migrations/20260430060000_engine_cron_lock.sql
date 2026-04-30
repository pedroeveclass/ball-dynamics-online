-- ═══════════════════════════════════════════════════════════
-- Engine cron-cycle lock (2026-04-30)
-- ───────────────────────────────────────────────────────────
-- The match-engine-lab cron fires 6 times/min (t=0,10,...,50s).
-- Each invocation calls processDueMatches which loads ALL active
-- match_turns and processes them sequentially. Under load (6
-- concurrent matches × 5-15s tick each), invocations stack up
-- and saturate PostgREST → unit queries that should cost ~50ms
-- end up waiting 50s in the connection pool (observed in the
-- 2026-04-29 sample: res_pos_batch max=52063ms, participants
-- max=50823ms).
--
-- This lock guarantees ONLY ONE cron invocation does work per
-- ~30s window. Other cron invocations bail in <50ms after the
-- INSERT … ON CONFLICT race. Client-fired calls (with match_id)
-- bypass the lock entirely so user-driven matches never wait.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.engine_cron_lock (
  id INT PRIMARY KEY,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT engine_cron_lock_singleton CHECK (id = 1)
);

-- Service-role only; cron and edge functions use service_role.
ALTER TABLE public.engine_cron_lock ENABLE ROW LEVEL SECURITY;

-- Try to acquire the cron lock for `p_ttl_seconds`. Returns TRUE if
-- this caller now owns the lock, FALSE if another cron invocation
-- claimed it within the TTL window. Atomic: a single INSERT … ON
-- CONFLICT DO UPDATE WHERE filter avoids the race between two
-- concurrent cron firings.
CREATE OR REPLACE FUNCTION public.try_acquire_engine_cron_lock(
  p_ttl_seconds INT DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN;
BEGIN
  INSERT INTO engine_cron_lock (id, claimed_at)
  VALUES (1, NOW())
  ON CONFLICT (id) DO UPDATE
    SET claimed_at = NOW()
    WHERE engine_cron_lock.claimed_at < NOW() - (p_ttl_seconds || ' seconds')::INTERVAL
  RETURNING TRUE INTO v_acquired;

  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_engine_cron_lock(INT) TO service_role;
