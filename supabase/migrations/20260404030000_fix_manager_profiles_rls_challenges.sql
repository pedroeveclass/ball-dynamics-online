-- Fix: Allow reading manager_profiles basics for challenge acceptance
-- When accepting a challenge, the accepting user needs to read the
-- challenger's manager_profile to get their user_id for creating the
-- manager participant. Currently RLS blocks this because each user
-- can only read their own manager_profile.

-- Allow any authenticated user to read any manager_profile's id/user_id
CREATE POLICY "Authenticated users can read manager profiles for challenges"
ON public.manager_profiles FOR SELECT
TO authenticated
USING (true);
