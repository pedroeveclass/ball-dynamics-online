-- ═══════════════════════════════════════════════════════════
-- Coach training: switch from "7-day cooldown" to "once per ISO week"
-- Reset happens at Sunday→Monday midnight (Brazil time).
-- ═══════════════════════════════════════════════════════════

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
  -- "This week" = Monday 00:00 to Sunday 23:59:59 in America/Sao_Paulo.
  -- Compare the local-date week of last_trained_at with the local-date week of now().
  SELECT EXISTS(
    SELECT 1 FROM coach_training
    WHERE club_id = p_club_id
      AND last_trained_at IS NOT NULL
      AND date_trunc('week', (last_trained_at AT TIME ZONE 'America/Sao_Paulo'))
        = date_trunc('week', (now()           AT TIME ZONE 'America/Sao_Paulo'))
  ) INTO v_any_trained_this_week;

  IF v_any_trained_this_week THEN
    RAISE EXCEPTION 'Already trained this week. Wait until next Monday 00:00 (São Paulo).';
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
