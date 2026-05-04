-- Per-profile tutorial tracking. Replaces the prior per-browser localStorage
-- key `bdo_tutorials_seen`, so a tour the user already completed never replays
-- on a fresh device / private window.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorials_seen JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Mark a single tour key as seen for the calling user. Idempotent; the JSONB
-- concat overwrites the timestamp on a repeat call.
CREATE OR REPLACE FUNCTION public.mark_tutorial_seen(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_key IS NULL OR p_key = '' THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET tutorials_seen = COALESCE(tutorials_seen, '{}'::jsonb)
                          || jsonb_build_object(p_key, to_jsonb(NOW()))
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_tutorial_seen(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_tutorial_seen(TEXT) TO authenticated;

-- Bulk variant used to upload pre-existing localStorage on a user's first
-- post-migration login (so they don't have to re-watch tours they already saw).
CREATE OR REPLACE FUNCTION public.bulk_mark_tutorials_seen(p_seen JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_seen IS NULL OR jsonb_typeof(p_seen) <> 'object' THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET tutorials_seen = COALESCE(tutorials_seen, '{}'::jsonb) || p_seen
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_mark_tutorials_seen(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_mark_tutorials_seen(JSONB) TO authenticated;

-- Reset for dev / "replay tutorials" admin action.
CREATE OR REPLACE FUNCTION public.reset_tutorials_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  UPDATE public.profiles
     SET tutorials_seen = '{}'::jsonb
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.reset_tutorials_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_tutorials_seen() TO authenticated;
