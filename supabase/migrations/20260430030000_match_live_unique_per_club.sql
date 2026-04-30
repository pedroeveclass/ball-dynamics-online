-- ═══════════════════════════════════════════════════════════════════
-- Match live-uniqueness per club
--
-- Defense-in-depth against the Samba-style desync where an orphaned
-- live match (engine never finished) and a freshly-materialized round
-- both ended up active for the same club. Two passes:
--
--  1) REPAIR — close the known orphan + any other long-stale `live`
--     matches before adding the constraint, so the index creation
--     doesn't fail on existing duplicates. The known orphan (Samba x
--     Guaraná) was stuck since 2026-04-27 at turn 47 / half 2 /
--     attacking_support; it gets force-finished as a 0-0 walkover
--     (no score row update — the matches row is the only state we
--     touch; downstream stats already accounted for whatever happened
--     before it froze).
--
--  2) ENFORCE — UNIQUE partial indexes ensure no club is the home
--     OR away side of more than one `live` match at a time. The
--     scheduler already does an equivalent check before INSERT
--     (league-scheduler/index.ts:materializeLeagueMatch); these
--     indexes are the DB-side belt-and-suspenders.
-- ═══════════════════════════════════════════════════════════════════

-- 1) REPAIR ──────────────────────────────────────────────────────────
-- Force-finish the specific orphan first (idempotent: the WHERE clause
-- only matches if the row is still `live`).
UPDATE public.matches
   SET status = 'finished',
       finished_at = NOW()
 WHERE id = '569bb97b-a566-4be6-920b-bdcc57f09216'
   AND status = 'live';

-- Sweep any other long-stale live matches (no engine progress in 12h).
-- This mirrors the cron's stale-match recovery but runs once at migration
-- time so the indexes below can be created safely.
UPDATE public.matches
   SET status = 'finished',
       finished_at = NOW()
 WHERE status = 'live'
   AND updated_at < NOW() - INTERVAL '12 hours';

-- 2) ENFORCE ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS matches_one_live_per_home_club
  ON public.matches(home_club_id)
  WHERE status = 'live';

CREATE UNIQUE INDEX IF NOT EXISTS matches_one_live_per_away_club
  ON public.matches(away_club_id)
  WHERE status = 'live';
