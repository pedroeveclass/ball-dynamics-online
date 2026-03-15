
-- 1. Managers can read contracts of their own club
CREATE POLICY "Managers can view club contracts"
ON public.contracts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clubs
    JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id
    WHERE clubs.id::text = contracts.club_id
    AND manager_profiles.user_id = auth.uid()
  )
);

-- 2. Players can view their club's manager profile
CREATE POLICY "Players can view club manager"
ON public.manager_profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clubs
    JOIN contracts ON contracts.club_id = clubs.id::text
    JOIN player_profiles ON player_profiles.id = contracts.player_profile_id
    WHERE clubs.manager_profile_id = manager_profiles.id
    AND contracts.status = 'active'
    AND player_profiles.user_id = auth.uid()
  )
);

-- 3. Players can view teammates (other players in same club via active contract)
CREATE POLICY "Players can view teammates"
ON public.player_profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM contracts c1
    JOIN contracts c2 ON c1.club_id = c2.club_id
    JOIN player_profiles pp ON pp.id = c2.player_profile_id
    WHERE c1.player_profile_id = player_profiles.id
    AND c1.status = 'active'
    AND c2.status = 'active'
    AND pp.user_id = auth.uid()
  )
);

-- 4. Players can view their club's stadium
CREATE POLICY "Players can view club stadium"
ON public.stadiums FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clubs
    JOIN contracts ON contracts.club_id = clubs.id::text
    JOIN player_profiles ON player_profiles.id = contracts.player_profile_id
    WHERE stadiums.club_id = clubs.id
    AND contracts.status = 'active'
    AND player_profiles.user_id = auth.uid()
  )
);
