-- ═══════════════════════════════════════════════════════════
-- Situational Tactics — tactical knobs (attack_type, positioning, inclination)
--
-- These three knobs sit alongside the existing per-quadrant `positions` JSON
-- and are applied as a transform layer on top of whatever position the engine
-- resolves (custom or dynamic default). Stored per (club, formation, phase)
-- so the UI can keep using the same row it already saves. In practice the UI
-- writes the same knob values to both phases for a given formation.
--
-- attack_type:  central  → contract x toward 50 (narrower attack)
--               balanced → no change (default)
--               wide     → expand x away from 50 (wider attack)
-- positioning:  short    → players pull toward team centroid (compact)
--               normal   → no change (default)
--               spread   → players push away from centroid (spaced out)
-- inclination:  ultra_def → shift all outfielders +2 sub-cells toward own goal
--               def       → +1
--               normal    → 0 (default)
--               off       → -1 (toward opponent goal)
--               ultra_off → -2
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.situational_tactics
  ADD COLUMN IF NOT EXISTS attack_type TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS positioning TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS inclination TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'situational_tactics_attack_type_check'
  ) THEN
    ALTER TABLE public.situational_tactics
      ADD CONSTRAINT situational_tactics_attack_type_check
      CHECK (attack_type IN ('central','balanced','wide'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'situational_tactics_positioning_check'
  ) THEN
    ALTER TABLE public.situational_tactics
      ADD CONSTRAINT situational_tactics_positioning_check
      CHECK (positioning IN ('short','normal','spread'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'situational_tactics_inclination_check'
  ) THEN
    ALTER TABLE public.situational_tactics
      ADD CONSTRAINT situational_tactics_inclination_check
      CHECK (inclination IN ('ultra_def','def','normal','off','ultra_off'));
  END IF;
END $$;
