-- ─────────────────────────────────────────────────────────────
-- Transfer narrative — auto-generated on player club change
-- ─────────────────────────────────────────────────────────────
-- Whenever a player's club_id changes between two non-null clubs
-- (i.e. an actual transfer, not a first signing or release), drop
-- a narrative row + notify the player. Origin story already covers
-- the first signing; retirement bio already covers career end. This
-- fills the silent middle: mid-career moves.

CREATE OR REPLACE FUNCTION public._on_player_club_transferred()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_name TEXT;
  v_from_club_name TEXT;
  v_to_club_name TEXT;
  v_position TEXT;
  v_body_pt TEXT;
  v_body_en TEXT;
BEGIN
  -- Only fire on real transfers (both sides non-null).
  IF NEW.club_id IS NULL OR OLD.club_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.club_id = OLD.club_id THEN RETURN NEW; END IF;

  v_player_name := NEW.full_name;
  v_position := COALESCE(NEW.primary_position, '');
  SELECT name INTO v_from_club_name FROM public.clubs WHERE id = OLD.club_id;
  SELECT name INTO v_to_club_name   FROM public.clubs WHERE id = NEW.club_id;

  v_body_pt := v_player_name || ' deixa ' || COALESCE(v_from_club_name, 'o clube anterior') ||
               ' rumo ao ' || COALESCE(v_to_club_name, 'novo destino') ||
               '. Página virada na carreira: novo escudo no peito, novo elenco a se adaptar, novos olhares da torcida. ' ||
               'Cada transferência traz a chance de recomeço, e a expectativa fica em torno de como ' || v_player_name ||
               ' vai responder ao desafio nas primeiras rodadas pelo novo time.';

  v_body_en := v_player_name || ' leaves ' || COALESCE(v_from_club_name, 'the previous club') ||
               ' for ' || COALESCE(v_to_club_name, 'a new destination') ||
               '. Page turned in the career: a new crest on the chest, a new squad to adapt to, new eyes from the crowd. ' ||
               'Every transfer brings a fresh-start chance, and the expectation centers on how ' || v_player_name ||
               ' will answer the challenge in the early rounds for the new team.';

  -- milestone_type left NULL so the partial UNIQUE index doesn't dedupe
  -- repeat transfers (a player can move multiple times across a career).
  INSERT INTO public.narratives (entity_type, entity_id, scope, body_pt, body_en, facts_json)
  VALUES (
    'player', NEW.id, 'transfer',
    v_body_pt, v_body_en,
    jsonb_build_object(
      'player_name', v_player_name,
      'position', v_position,
      'from_club_id', OLD.club_id,
      'from_club_name', v_from_club_name,
      'to_club_id', NEW.club_id,
      'to_club_name', v_to_club_name
    )
  );

  -- Notify the human player (no-op for bots without user_id).
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, player_profile_id, type, title, body, link, read)
    VALUES (
      NEW.user_id, NEW.id, 'transfer',
      'Transferência confirmada',
      'Você foi transferido para ' || COALESCE(v_to_club_name, 'novo clube') || '.',
      '/player/' || NEW.id::text,
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a transfer because of narrative bookkeeping.
  RAISE NOTICE '_on_player_club_transferred failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_club_change_narrative ON public.player_profiles;
CREATE TRIGGER player_club_change_narrative
  AFTER UPDATE OF club_id ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._on_player_club_transferred();
