-- ═══════════════════════════════════════════════════════════
-- Coach Training System
-- 6 skills, levels 1-5, one training per week
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coach_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL CHECK (skill_type IN (
    'tactics',        -- Reduces out-of-position penalty
    'formation',      -- Bonus when using trained formation
    'fitness',        -- Reduces stamina loss per turn
    'set_piece',      -- Bonus deviation on set pieces
    'mentality',      -- Mental attribute bonus when losing
    'high_press'      -- +chance to steal ball (up to 5%)
  )),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  trained_formation TEXT, -- Only used for 'formation' skill type
  last_trained_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, skill_type)
);

-- RLS
ALTER TABLE coach_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers see own coach training" ON coach_training
  FOR SELECT USING (
    club_id IN (SELECT id FROM clubs WHERE manager_profile_id = (SELECT id FROM manager_profiles WHERE user_id = auth.uid()))
  );

-- Index
CREATE INDEX idx_coach_training_club ON coach_training(club_id);

-- RPC to train a skill (once per week)
CREATE OR REPLACE FUNCTION train_coach_skill(
  p_club_id UUID,
  p_skill_type TEXT,
  p_formation TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_last_trained TIMESTAMPTZ;
  v_current_level INTEGER;
  v_any_trained_this_week BOOLEAN;
BEGIN
  -- Check if ANY skill was trained this week (one training per week limit)
  SELECT EXISTS(
    SELECT 1 FROM coach_training
    WHERE club_id = p_club_id
      AND last_trained_at IS NOT NULL
      AND last_trained_at > now() - INTERVAL '7 days'
  ) INTO v_any_trained_this_week;

  IF v_any_trained_this_week THEN
    RAISE EXCEPTION 'Already trained this week. Wait until next week.';
  END IF;

  -- Upsert the skill
  INSERT INTO coach_training (club_id, skill_type, level, trained_formation, last_trained_at, updated_at)
  VALUES (p_club_id, p_skill_type, 1, p_formation, now(), now())
  ON CONFLICT (club_id, skill_type)
  DO UPDATE SET
    level = LEAST(coach_training.level + 1, 5),
    trained_formation = COALESCE(EXCLUDED.trained_formation, coach_training.trained_formation),
    last_trained_at = now(),
    updated_at = now()
  WHERE coach_training.level < 5;

  RETURN TRUE;
END;
$$;

-- Function to get all training bonuses for a club
CREATE OR REPLACE FUNCTION get_coach_bonuses(p_club_id UUID)
RETURNS TABLE(
  skill_type TEXT,
  level INTEGER,
  trained_formation TEXT,
  bonus_value NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ct.skill_type,
    ct.level,
    ct.trained_formation,
    CASE ct.skill_type
      -- Tactics: reduce out-of-position penalty (15% base → down to 8%)
      WHEN 'tactics' THEN ct.level * 1.4  -- 1.4% reduction per level (7% total at max)
      -- Formation: attribute bonus when using trained formation
      WHEN 'formation' THEN ct.level * 1.0  -- 1% per level (5% max)
      -- Fitness: stamina loss reduction per turn
      WHEN 'fitness' THEN ct.level * 1.0  -- 1% per level
      -- Set piece: deviation reduction on set pieces
      WHEN 'set_piece' THEN ct.level * 2.0  -- 2% per level (10% less deviation)
      -- Mentality: mental attribute bonus when losing
      WHEN 'mentality' THEN ct.level * 1.0  -- 1% per level
      -- High press: steal chance bonus
      WHEN 'high_press' THEN ct.level * 1.0  -- 1% per level (5% max)
    END AS bonus_value
  FROM coach_training ct
  WHERE ct.club_id = p_club_id;
$$;
