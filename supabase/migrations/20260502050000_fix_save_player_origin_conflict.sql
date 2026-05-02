-- Fix save_player_origin's ON CONFLICT clause.
-- The 20260502020000 milestones migration replaced the original
-- (entity_type, entity_id, scope) UNIQUE with two partial indexes
-- (singleton WHERE milestone_type IS NULL, milestone WHERE NOT NULL).
-- Postgres requires ON CONFLICT to match a partial index's predicate
-- explicitly; without it the planner can't pick the index and raises
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Adding `WHERE milestone_type IS NULL` so the singleton
-- partial index is selected.

CREATE OR REPLACE FUNCTION public.save_player_origin(
  p_player_id UUID,
  p_origin_start TEXT,
  p_origin_inspiration TEXT,
  p_origin_spark TEXT,
  p_origin_obstacle TEXT,
  p_origin_trait TEXT,
  p_origin_dream TEXT,
  p_body_pt TEXT,
  p_body_en TEXT,
  p_facts_json JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.player_profiles
  SET
    origin_start       = p_origin_start,
    origin_inspiration = p_origin_inspiration,
    origin_spark       = p_origin_spark,
    origin_obstacle    = p_origin_obstacle,
    origin_trait       = p_origin_trait,
    origin_dream       = p_origin_dream,
    updated_at         = NOW()
  WHERE id = p_player_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found or not authorized';
  END IF;

  INSERT INTO public.narratives (
    entity_type, entity_id, scope, body_pt, body_en, facts_json
  ) VALUES (
    'player', p_player_id, 'origin_story', p_body_pt, p_body_en, COALESCE(p_facts_json, '{}'::JSONB)
  )
  ON CONFLICT (entity_type, entity_id, scope)
    WHERE milestone_type IS NULL
    DO NOTHING;
END;
$$;
