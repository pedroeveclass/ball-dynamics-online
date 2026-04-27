-- ═══════════════════════════════════════════════════════════
-- Set-piece tactics — "Bola Parada"
--
-- Per-club, per-formation positional layouts for restart situations
-- (corner / throw-in / free kick / goal kick), split by who is taking
-- the set piece (`with_ball` = our team takes it; `without_ball` =
-- opponent takes it). One layout per (club, formation, type, phase) —
-- the engine mirrors X by which side of the field the ball is on.
--
-- `positions` shape (JSONB):
--   { "GK":  {"x":50,"y":90}, "CB1": {...}, ..., "ST2": {...} }
-- Top-level keys are slot_position strings of the formation.
-- Coordinates are 0-100 percent in editor space (y=90 = own goal).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.set_piece_tactics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  formation TEXT NOT NULL,
  set_piece_type TEXT NOT NULL CHECK (set_piece_type IN ('corner', 'throw_in', 'free_kick', 'goal_kick')),
  phase TEXT NOT NULL CHECK (phase IN ('with_ball', 'without_ball')),
  positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, formation, set_piece_type, phase)
);

CREATE INDEX IF NOT EXISTS idx_set_piece_tactics_club_formation
  ON public.set_piece_tactics (club_id, formation);

ALTER TABLE public.set_piece_tactics ENABLE ROW LEVEL SECURITY;

-- Same helpers as situational_tactics: any club member reads, only managers
-- and assistants write.
DROP POLICY IF EXISTS "Club members read set piece tactics" ON public.set_piece_tactics;
CREATE POLICY "Club members read set piece tactics"
  ON public.set_piece_tactics FOR SELECT TO authenticated
  USING (public.current_user_is_club_member(club_id));

DROP POLICY IF EXISTS "Managers and assistants insert set piece tactics" ON public.set_piece_tactics;
CREATE POLICY "Managers and assistants insert set piece tactics"
  ON public.set_piece_tactics FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants update set piece tactics" ON public.set_piece_tactics;
CREATE POLICY "Managers and assistants update set piece tactics"
  ON public.set_piece_tactics FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_club(club_id))
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants delete set piece tactics" ON public.set_piece_tactics;
CREATE POLICY "Managers and assistants delete set piece tactics"
  ON public.set_piece_tactics FOR DELETE TO authenticated
  USING (public.current_user_can_edit_club(club_id));

CREATE OR REPLACE FUNCTION public.touch_set_piece_tactics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_piece_tactics_updated_at ON public.set_piece_tactics;
CREATE TRIGGER trg_set_piece_tactics_updated_at
  BEFORE UPDATE ON public.set_piece_tactics
  FOR EACH ROW EXECUTE FUNCTION public.touch_set_piece_tactics_updated_at();
