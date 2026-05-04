-- ─────────────────────────────────────────────────────────────
-- REGRA PÉTREA — temporadas avançam JUNTAS em todas as ligas
-- ─────────────────────────────────────────────────────────────
-- Quando QUALQUER league_seasons.status vira 'finished', cascade
-- pra todas as outras ligas no MESMO game year (= mesmo
-- season_number). Isto garante:
--   - Série A e Série B sempre na mesma temporada
--   - Promoção/rebaixamento entre divisões fica viável (mesmo
--     fechamento, mesma janela de transferências, mesma data
--     pra começar a próxima)
--   - LeaguePage's gap-window logic não sai de sincronia
--
-- O round-cascade existente (20260504060000) cuida das rodadas
-- de cada season já — esse trigger só dispara o status nas
-- siblings e elas caem em cascata pelas dependências.

CREATE OR REPLACE FUNCTION public._cascade_finish_sibling_seasons()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND COALESCE(OLD.status, '') <> 'finished' THEN
    -- Use COALESCE on finished_at/next_season_at so siblings inherit
    -- the same dates from whichever league fired first.
    UPDATE public.league_seasons
       SET status = 'finished',
           finished_at = COALESCE(finished_at, NEW.finished_at, NOW()),
           next_season_at = COALESCE(
             next_season_at,
             NEW.next_season_at,
             COALESCE(NEW.finished_at, NOW()) + INTERVAL '14 days'
           )
     WHERE season_number = NEW.season_number
       AND id <> NEW.id
       AND status <> 'finished';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_season_cascade_siblings ON public.league_seasons;
CREATE TRIGGER league_season_cascade_siblings
  AFTER UPDATE OF status ON public.league_seasons
  FOR EACH ROW
  EXECUTE FUNCTION public._cascade_finish_sibling_seasons();

-- Note: this trigger fires AFTER the existing
-- `league_season_finished_awards` and `league_season_finish_cascade`
-- triggers run for the original row. The cascade UPDATE above will
-- re-trigger those triggers for each sibling, so awards + MVP polls
-- + round-status cascade all happen automatically per league.
