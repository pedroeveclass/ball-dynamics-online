-- Add milestone_type to narratives so a single player can have multiple
-- milestones (first_goal, goals_50, first_hat_trick, etc) without
-- colliding on the (entity_type, entity_id, scope) UNIQUE constraint.
--
-- Strategy: replace the single UNIQUE with two PARTIAL unique indexes —
-- one for non-milestone scopes (origin_story, match_recap, round_recap,
-- season_recap, retirement, etc) where there's exactly one row per
-- entity, and one for milestone scopes where (entity_id, milestone_type)
-- is the natural key.

ALTER TABLE public.narratives
  ADD COLUMN IF NOT EXISTS milestone_type TEXT;

ALTER TABLE public.narratives
  DROP CONSTRAINT IF EXISTS narratives_entity_type_entity_id_scope_key;

CREATE UNIQUE INDEX IF NOT EXISTS narratives_unique_singleton
  ON public.narratives (entity_type, entity_id, scope)
  WHERE milestone_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS narratives_unique_milestone
  ON public.narratives (entity_type, entity_id, milestone_type)
  WHERE milestone_type IS NOT NULL;

-- Index for fetching a player's full milestone timeline ordered by date
CREATE INDEX IF NOT EXISTS idx_narratives_player_milestones
  ON public.narratives (entity_id, generated_at DESC)
  WHERE entity_type = 'player' AND scope = 'milestone';
