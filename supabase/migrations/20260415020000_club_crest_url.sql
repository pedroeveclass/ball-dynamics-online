-- ═══════════════════════════════════════════════════════════
-- Clubs: add crest_url column + public storage bucket.
--
-- `crest_url` follows the same convention as `profiles.avatar_url`:
--   - NULL                  → fall back to the colored short-name badge
--   - 'emoji:⚽'            → render the emoji
--   - 'https://…'           → render the uploaded image
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS crest_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('club-crests', 'club-crests', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone authenticated can upload/overwrite crests for clubs they manage.
-- Paths are '<club_id>/crest.<ext>'; we check the first segment against
-- the manager's club. Public read (bucket is public).

DROP POLICY IF EXISTS "Managers can upload own club crest" ON storage.objects;
CREATE POLICY "Managers can upload own club crest"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-crests'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT c.id FROM public.clubs c
      JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
      WHERE mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can update own club crest" ON storage.objects;
CREATE POLICY "Managers can update own club crest"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'club-crests'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT c.id FROM public.clubs c
      JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
      WHERE mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can delete own club crest" ON storage.objects;
CREATE POLICY "Managers can delete own club crest"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'club-crests'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT c.id FROM public.clubs c
      JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
      WHERE mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public read club crests" ON storage.objects;
CREATE POLICY "Public read club crests"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'club-crests');
