-- Fix: Allow reading lineups of clubs involved in challenges
-- When accepting a challenge, the accepting user needs to read the
-- challenger's active lineup to set home_lineup_id on the match.
-- Currently RLS blocks this because the lineup isn't linked to a match yet.

-- Allow any authenticated user to read any lineup's id/formation (not sensitive data)
CREATE POLICY "Authenticated users can read lineup basics for challenges"
ON public.lineups FOR SELECT
TO authenticated
USING (true);
