-- ═══════════════════════════════════════════════════════════
-- Situational Tactics — "Táticas - Jogo Situacional"
--
-- Stores per-club, per-formation, per-phase positional adjustments
-- across a 5x7 grid (35 quadrants) indexed by ball location.
--
-- UI prototype scope: persistence + basic CRUD. Match engine
-- consumption lands in a later migration.
--
-- `positions` shape (JSONB):
--   {
--     "0":  { "GK": {"x":50,"y":90}, "CB1": {...}, ..., "ST2": {...} },
--     "1":  { ... },
--     ...
--     "34": { ... }
--   }
-- - Top-level keys are quadrant indices "0".."34" (row*5 + col).
-- - Inner keys are slot_position strings of that formation.
-- - x/y are percentages 0-100 matching the ManagerLineupPage field
--   (y=90 → own goal side, y=15 → opponent goal side).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.situational_tactics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  formation TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('with_ball', 'without_ball')),
  positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, formation, phase)
);

CREATE INDEX IF NOT EXISTS idx_situational_tactics_club_formation
  ON public.situational_tactics (club_id, formation);

ALTER TABLE public.situational_tactics ENABLE ROW LEVEL SECURITY;

-- Reuse helpers from the assistant_manager migration.
DROP POLICY IF EXISTS "Club members read situational tactics" ON public.situational_tactics;
CREATE POLICY "Club members read situational tactics"
  ON public.situational_tactics FOR SELECT TO authenticated
  USING (public.current_user_is_club_member(club_id));

DROP POLICY IF EXISTS "Managers and assistants insert situational tactics" ON public.situational_tactics;
CREATE POLICY "Managers and assistants insert situational tactics"
  ON public.situational_tactics FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants update situational tactics" ON public.situational_tactics;
CREATE POLICY "Managers and assistants update situational tactics"
  ON public.situational_tactics FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_club(club_id))
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants delete situational tactics" ON public.situational_tactics;
CREATE POLICY "Managers and assistants delete situational tactics"
  ON public.situational_tactics FOR DELETE TO authenticated
  USING (public.current_user_can_edit_club(club_id));

-- Touch updated_at on every update.
CREATE OR REPLACE FUNCTION public.touch_situational_tactics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_situational_tactics_updated_at ON public.situational_tactics;
CREATE TRIGGER trg_situational_tactics_updated_at
  BEFORE UPDATE ON public.situational_tactics
  FOR EACH ROW EXECUTE FUNCTION public.touch_situational_tactics_updated_at();
