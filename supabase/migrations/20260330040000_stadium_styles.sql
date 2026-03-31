-- ============================================================
-- Stadium visual customization
-- Stores all visual settings for the stadium that affect
-- both the manager's preview and the in-game field rendering.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stadium_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE UNIQUE,
  -- Pitch pattern
  pitch_pattern TEXT NOT NULL DEFAULT 'stripes_vertical_thick',
  -- Border/surround
  border_color TEXT NOT NULL DEFAULT '#1a2e1a',
  -- Lighting atmosphere
  lighting TEXT NOT NULL DEFAULT 'neutral',
  -- Goal net
  net_pattern TEXT NOT NULL DEFAULT 'checkered',
  net_style TEXT NOT NULL DEFAULT 'classic',
  -- Ad boards
  ad_board_color TEXT NOT NULL DEFAULT '#1a1a2e',
  -- Bench area
  bench_color TEXT NOT NULL DEFAULT '#2a2a3e',
  --
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.stadium_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stadium styles"
  ON public.stadium_styles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can update own stadium style"
  ON public.stadium_styles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM clubs
    JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id
    WHERE clubs.id = stadium_styles.club_id
    AND manager_profiles.user_id = auth.uid()
  ));

CREATE POLICY "Managers can insert own stadium style"
  ON public.stadium_styles FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM clubs
    JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id
    WHERE clubs.id = stadium_styles.club_id
    AND manager_profiles.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_stadium_styles_club_id ON public.stadium_styles(club_id);

-- Create default styles for all existing clubs
INSERT INTO public.stadium_styles (club_id)
SELECT id FROM public.clubs
ON CONFLICT (club_id) DO NOTHING;
