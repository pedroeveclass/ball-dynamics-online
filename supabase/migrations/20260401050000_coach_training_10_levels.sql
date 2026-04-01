-- Update coach training to 10 levels (was 5)
ALTER TABLE coach_training DROP CONSTRAINT IF EXISTS coach_training_level_check;
ALTER TABLE coach_training ADD CONSTRAINT coach_training_level_check CHECK (level BETWEEN 1 AND 10);

-- Update the train function to cap at 10
CREATE OR REPLACE FUNCTION train_coach_skill(
  p_club_id UUID,
  p_skill_type TEXT,
  p_formation TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_any_trained_this_week BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM coach_training
    WHERE club_id = p_club_id
      AND last_trained_at IS NOT NULL
      AND last_trained_at > now() - INTERVAL '7 days'
  ) INTO v_any_trained_this_week;

  IF v_any_trained_this_week THEN
    RAISE EXCEPTION 'Already trained this week. Wait until next week.';
  END IF;

  INSERT INTO coach_training (club_id, skill_type, level, trained_formation, last_trained_at, updated_at)
  VALUES (p_club_id, p_skill_type, 1, p_formation, now(), now())
  ON CONFLICT (club_id, skill_type)
  DO UPDATE SET
    level = LEAST(coach_training.level + 1, 10),
    trained_formation = COALESCE(EXCLUDED.trained_formation, coach_training.trained_formation),
    last_trained_at = now(),
    updated_at = now()
  WHERE coach_training.level < 10;

  RETURN TRUE;
END;
$$;

-- Update bonuses to scale to 10 levels
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
      WHEN 'tactics' THEN ct.level * 0.7     -- 0.7% per level (7% total at max)
      WHEN 'formation' THEN ct.level * 0.5   -- 0.5% per level (5% max)
      WHEN 'fitness' THEN ct.level * 0.5     -- 0.5% per level (5% max)
      WHEN 'set_piece' THEN ct.level * 1.0   -- 1% per level (10% less deviation)
      WHEN 'mentality' THEN ct.level * 0.5   -- 0.5% per level (5% max)
      WHEN 'high_press' THEN ct.level * 0.5  -- 0.5% per level (5% max)
    END AS bonus_value
  FROM coach_training ct
  WHERE ct.club_id = p_club_id;
$$;
