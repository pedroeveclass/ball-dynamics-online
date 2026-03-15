
-- Contract offers table
CREATE TABLE public.contract_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  manager_profile_id uuid NOT NULL REFERENCES public.manager_profiles(id),
  player_profile_id uuid NOT NULL REFERENCES public.player_profiles(id),
  weekly_salary integer NOT NULL DEFAULT 0,
  release_clause integer NOT NULL DEFAULT 0,
  contract_length integer NOT NULL DEFAULT 12,
  squad_role text NOT NULL DEFAULT 'rotation',
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_offers ENABLE ROW LEVEL SECURITY;

-- Players can view offers made to them
CREATE POLICY "Players can view own offers" ON public.contract_offers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM player_profiles WHERE player_profiles.id = contract_offers.player_profile_id AND player_profiles.user_id = auth.uid()
  ));

-- Managers can view offers from their club
CREATE POLICY "Managers can view own club offers" ON public.contract_offers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM manager_profiles WHERE manager_profiles.id = contract_offers.manager_profile_id AND manager_profiles.user_id = auth.uid()
  ));

-- Managers can insert offers for their club
CREATE POLICY "Managers can insert offers" ON public.contract_offers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM manager_profiles WHERE manager_profiles.id = contract_offers.manager_profile_id AND manager_profiles.user_id = auth.uid()
  ));

-- Players can update offers made to them (accept/reject)
CREATE POLICY "Players can update own offers" ON public.contract_offers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM player_profiles WHERE player_profiles.id = contract_offers.player_profile_id AND player_profiles.user_id = auth.uid()
  ));

-- Managers can update their own offers (cancel)
CREATE POLICY "Managers can update own offers" ON public.contract_offers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM manager_profiles WHERE manager_profiles.id = contract_offers.manager_profile_id AND manager_profiles.user_id = auth.uid()
  ));

-- Make free agent players visible to all authenticated users (for market)
CREATE POLICY "Authenticated can view free agent players" ON public.player_profiles
  FOR SELECT TO authenticated
  USING (club_id IS NULL OR auth.uid() = user_id);

-- Make free agent player attributes visible
CREATE POLICY "Authenticated can view free agent attributes" ON public.player_attributes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM player_profiles WHERE player_profiles.id = player_attributes.player_profile_id AND (player_profiles.club_id IS NULL OR player_profiles.user_id = auth.uid())
  ));

-- Allow clubs table to be readable by all authenticated (for showing club name to players)
CREATE POLICY "Authenticated can view clubs" ON public.clubs
  FOR SELECT TO authenticated
  USING (true);
