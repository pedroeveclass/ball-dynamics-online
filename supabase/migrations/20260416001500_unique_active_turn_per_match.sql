-- Prevent more than one ACTIVE match_turn per match.
--
-- Bug symptom: live match UIs "flicker between two games" when two rows with
-- status='active' coexist for the same match (client realtime gets both and
-- oscillates). The cron-based phase engine claims newest-first; if a race leaves
-- an older active turn behind, subsequent ticks process both in parallel,
-- cascading more duplicates each phase transition.
--
-- This partial unique index closes the race at the DB level: any second INSERT
-- of status='active' for a match whose active row still exists will fail with
-- 23505 (unique_violation), surfacing the bug instead of silently corrupting
-- state. The engine serializes resolve-then-insert, so the old row is always
-- flipped to 'resolved' first — this index is defense-in-depth.

CREATE UNIQUE INDEX IF NOT EXISTS match_turns_one_active_per_match
  ON public.match_turns (match_id)
  WHERE status = 'active';
