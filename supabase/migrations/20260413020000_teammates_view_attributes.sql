-- Allow teammates (players in the same club) to view each other's attributes.
-- Existing "Users can view own attributes" policy already covers self-access;
-- PostgreSQL combines SELECT policies with OR, so this adds a second read path
-- without changing the first.

CREATE POLICY "Teammates can view attributes"
  ON public.player_attributes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.player_profiles target_p
        JOIN public.player_profiles viewer_p
          ON viewer_p.user_id = auth.uid()
       WHERE target_p.id = player_attributes.player_profile_id
         AND target_p.club_id IS NOT NULL
         AND viewer_p.club_id IS NOT NULL
         AND target_p.club_id = viewer_p.club_id
    )
  );
