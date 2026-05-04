-- ─────────────────────────────────────────────────────────────
-- Cascade league_rounds → 'finished' when their season finishes
-- ─────────────────────────────────────────────────────────────
-- Defensive: the normal flow is rounds finish first, then season.
-- But manual interventions (admin SQL, test flows) can flip a season
-- to finished while leaving rounds as 'scheduled', which then poll
-- as "next match" candidates from getNextClubMatch and pollute the
-- LeaguePage rounds tab. This trigger guarantees consistency.

CREATE OR REPLACE FUNCTION public._cascade_finish_league_rounds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND COALESCE(OLD.status, '') <> 'finished' THEN
    UPDATE public.league_rounds
       SET status = 'finished'
     WHERE season_id = NEW.id
       AND status <> 'finished';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_season_finish_cascade ON public.league_seasons;
CREATE TRIGGER league_season_finish_cascade
  AFTER UPDATE OF status ON public.league_seasons
  FOR EACH ROW
  EXECUTE FUNCTION public._cascade_finish_league_rounds();
