-- Clean up player_match_stats rows that came from non-competitive matches.
--
-- Rule: a match is "competitive" (and should have per-player stats) iff it is
--   (a) a league match — there is a row in public.league_matches whose
--       match_id references public.matches.id, OR
--   (b) a team-vs-team friendly — there is a row in public.match_challenges
--       whose match_id references public.matches.id. match_challenges rows
--       are only created between two human-managed clubs (the table carries
--       challenger_manager_profile_id + challenged_manager_profile_id), so
--       its presence is a reliable "two real clubs" marker.
--
-- Everything else (bot-only matches, 5v5 lab/test matches, training sessions)
-- must NOT populate player_match_stats. The backfill migration
-- 20260420031500_backfill_player_match_stats.sql inserted rows for every
-- finished match regardless of type — this migration deletes those spurious
-- rows. Going forward, persistMatchPlayerStats() in match-engine-lab applies
-- the same filter before writing.

DO $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.player_match_stats pms
   WHERE NOT EXISTS (
     SELECT 1 FROM public.league_matches lm WHERE lm.match_id = pms.match_id
   )
     AND NOT EXISTS (
     SELECT 1 FROM public.match_challenges mc WHERE mc.match_id = pms.match_id
   );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'player_match_stats non-competitive cleanup: deleted % rows', v_deleted;
END $$;
