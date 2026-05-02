-- append_origin_closing RPC
-- Called by the client right after the player's first contract signing
-- (transfer_player / handleJoinBotTeam / admin_assign_player_to_club).
-- Appends the bilingual closing paragraph to the existing origin story
-- and marks facts_json.closing_appended = true so subsequent transfers
-- don't add a second closing — idempotent by design.

CREATE OR REPLACE FUNCTION public.append_origin_closing(
  p_player_id UUID,
  p_closing_pt TEXT,
  p_closing_en TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorize: caller must own the player. The RPC is invoked from
  -- the client right after contract acceptance — we trust that path
  -- but still gate by user_id to prevent cross-account abuse.
  IF NOT EXISTS (
    SELECT 1 FROM public.player_profiles
    WHERE id = p_player_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Player not found or not authorized';
  END IF;

  UPDATE public.narratives
  SET
    body_pt = body_pt || ' ' || p_closing_pt,
    body_en = body_en || ' ' || p_closing_en,
    facts_json = COALESCE(facts_json, '{}'::JSONB) || jsonb_build_object('closing_appended', true)
  WHERE entity_type = 'player'
    AND entity_id = p_player_id
    AND scope = 'origin_story'
    AND COALESCE((facts_json->>'closing_appended')::boolean, false) = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_origin_closing(UUID, TEXT, TEXT) TO authenticated;
