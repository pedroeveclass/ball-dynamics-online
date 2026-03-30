-- ============================================================
-- Fix: Allow all authenticated users to read clubs
-- The existing RLS only allowed managers to see their own club.
-- New managers during onboarding couldn't see available bot clubs.
-- Also needed for: league page, public club profiles, match room.
-- ============================================================

CREATE POLICY "Anyone can view clubs"
  ON public.clubs FOR SELECT
  TO authenticated
  USING (true);
