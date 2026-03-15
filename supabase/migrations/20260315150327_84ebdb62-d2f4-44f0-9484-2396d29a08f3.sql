
-- Fix: Allow managers to view players in their club
CREATE POLICY "Managers can view club players"
ON public.player_profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clubs
    JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id
    WHERE clubs.id::text = player_profiles.club_id
    AND manager_profiles.user_id = auth.uid()
  )
);

-- Create lineups table
CREATE TABLE public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  formation text NOT NULL DEFAULT '4-4-2',
  name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view own lineups" ON public.lineups FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = lineups.club_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can insert own lineups" ON public.lineups FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = lineups.club_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can update own lineups" ON public.lineups FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = lineups.club_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can delete own lineups" ON public.lineups FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = lineups.club_id AND manager_profiles.user_id = auth.uid()));

-- Create lineup_slots table
CREATE TABLE public.lineup_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id uuid NOT NULL REFERENCES public.lineups(id) ON DELETE CASCADE,
  player_profile_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  slot_position text NOT NULL,
  role_type text NOT NULL DEFAULT 'starter',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lineup_id, player_profile_id),
  UNIQUE(lineup_id, slot_position, role_type)
);

ALTER TABLE public.lineup_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view own lineup slots" ON public.lineup_slots FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM lineups JOIN clubs ON clubs.id = lineups.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE lineups.id = lineup_slots.lineup_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can insert own lineup slots" ON public.lineup_slots FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM lineups JOIN clubs ON clubs.id = lineups.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE lineups.id = lineup_slots.lineup_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can update own lineup slots" ON public.lineup_slots FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM lineups JOIN clubs ON clubs.id = lineups.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE lineups.id = lineup_slots.lineup_id AND manager_profiles.user_id = auth.uid()));

CREATE POLICY "Managers can delete own lineup slots" ON public.lineup_slots FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM lineups JOIN clubs ON clubs.id = lineups.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE lineups.id = lineup_slots.lineup_id AND manager_profiles.user_id = auth.uid()));

-- Add updated_at trigger for lineups
CREATE TRIGGER update_lineups_updated_at BEFORE UPDATE ON public.lineups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lineup_slots_updated_at BEFORE UPDATE ON public.lineup_slots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
