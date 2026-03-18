CREATE POLICY "Managers can view club player attributes"
ON public.player_attributes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM player_profiles pp
    WHERE pp.id = player_attributes.player_profile_id
      AND pp.club_id = (current_user_managed_club_id())::text
  )
);