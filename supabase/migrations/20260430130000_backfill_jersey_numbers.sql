-- ──────────────────────────────────────────────────────────────────
-- Backfill jersey_number for legacy bots + auto-fill trigger.
--
-- Older squads (pre-jersey-system bots seeded by seed_league.sql /
-- fill_old_clubs_with_bots.sql) sit with jersey_number = NULL. The
-- match-time renderer falls back to "participant_index + 1" when a
-- jersey is missing, which collided with humans who had set theirs
-- (Vulcão had two #9 because Carlitos Tevez was 9 and a bot rendered
-- as 9 by index fallback).
--
-- Two-part fix:
--   1) Walk every (club_id, NULL jersey) row and call
--      assign_jersey_number_for_position to lock in a real number
--      using the existing positional preferences + free-slot logic.
--   2) BEFORE INSERT/UPDATE trigger on player_profiles so any future
--      row that has a club but no jersey gets one assigned the same
--      way — guarantees we never re-introduce the bug.
-- ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_n INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT id, club_id, primary_position
      FROM public.player_profiles
     WHERE club_id IS NOT NULL
       AND jersey_number IS NULL
     ORDER BY club_id, created_at ASC  -- older players claim the canonical number first
  LOOP
    v_n := public.assign_jersey_number_for_position(rec.club_id, rec.primary_position);
    IF v_n IS NULL THEN CONTINUE; END IF;
    UPDATE public.player_profiles
       SET jersey_number = v_n
     WHERE id = rec.id
       AND jersey_number IS NULL;  -- belt-and-suspenders against races
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[jersey-backfill] assigned % numbers', v_count;
END;
$$;


-- BEFORE INSERT / UPDATE trigger: any row that has a club_id but no
-- jersey_number gets one. Runs after our existing default_bot_secondary
-- trigger so both can coexist without ordering issues.
CREATE OR REPLACE FUNCTION public.player_profiles_auto_assign_jersey()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.club_id IS NOT NULL AND NEW.jersey_number IS NULL THEN
    NEW.jersey_number := public.assign_jersey_number_for_position(
      NEW.club_id,
      NEW.primary_position
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_profiles_auto_assign_jersey
  ON public.player_profiles;
CREATE TRIGGER trg_player_profiles_auto_assign_jersey
  BEFORE INSERT OR UPDATE OF club_id ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.player_profiles_auto_assign_jersey();
