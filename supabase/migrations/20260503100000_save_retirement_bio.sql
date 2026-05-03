-- save_retirement_bio RPC
-- Called by the client right after retire_player succeeds. The client
-- assembles the bilingual biography from the i18n templates (which it
-- has access to via the bundled JSON), and this RPC just persists it
-- with an ownership check. Idempotent — won't replace an existing bio
-- thanks to the partial UNIQUE on (entity_type, entity_id, scope).

CREATE OR REPLACE FUNCTION public.save_retirement_bio(
  p_player_id UUID,
  p_body_pt TEXT,
  p_body_en TEXT,
  p_facts_json JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorize: caller must own the player AND the player must be
  -- already retired. We trust the client only after retire_player
  -- has flipped the status — this is the safety net.
  IF NOT EXISTS (
    SELECT 1 FROM public.player_profiles
    WHERE id = p_player_id
      AND user_id = auth.uid()
      AND retirement_status = 'retired'
  ) THEN
    RAISE EXCEPTION 'Player not found, not authorized, or not yet retired';
  END IF;

  INSERT INTO public.narratives (
    entity_type, entity_id, scope, body_pt, body_en, facts_json
  ) VALUES (
    'player', p_player_id, 'retirement_bio', p_body_pt, p_body_en, COALESCE(p_facts_json, '{}'::JSONB)
  )
  ON CONFLICT (entity_type, entity_id, scope)
    WHERE milestone_type IS NULL
    DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_retirement_bio(UUID, TEXT, TEXT, JSONB) TO authenticated;
