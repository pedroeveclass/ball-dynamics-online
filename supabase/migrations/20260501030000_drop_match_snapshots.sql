-- ═══════════════════════════════════════════════════════════
-- Drop match_snapshots — confirmed dead code (2026-05-01)
-- ───────────────────────────────────────────────────────────
-- The 2026-04-30 perf overhaul stopped writing to this table after
-- confirming nothing reads it: MatchReplayPage reads
-- match_turns.resolution_script (which carries initial/final positions,
-- ball pos, events), and stats come from player_match_stats (computed
-- on final_whistle). The table has been receiving no inserts for the
-- past day and continues to be unused, so it's safe to drop.
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.match_snapshots;
