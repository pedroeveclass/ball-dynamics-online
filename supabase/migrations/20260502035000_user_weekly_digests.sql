-- Weekly Digest (FM-inbox style) per-user table.
-- Distinct from narratives because digests are private (one per user
-- per round) and narratives has public read RLS. RLS here restricts
-- SELECT/UPDATE to the owning user; INSERTs go through service_role
-- only (edge function generate-weekly-digests).

CREATE TABLE IF NOT EXISTS public.user_digests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id UUID,
  round_number INT,
  body_pt TEXT NOT NULL,
  body_en TEXT NOT NULL,
  facts_json JSONB,
  read_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, season_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_user_digests_owner_recent
  ON public.user_digests (user_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_digests_unread
  ON public.user_digests (user_id, generated_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.user_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_digests_owner_select" ON public.user_digests;
CREATE POLICY "user_digests_owner_select" ON public.user_digests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Updates only via the mark_digest_read RPC; block direct table writes
-- (read_at is the only mutable column and the RPC is the canonical path)
DROP POLICY IF EXISTS "user_digests_no_direct_update" ON public.user_digests;
CREATE POLICY "user_digests_no_direct_update" ON public.user_digests
  FOR UPDATE TO authenticated USING (FALSE);

-- INSERTs blocked at policy level — only service_role (edge function) writes
DROP POLICY IF EXISTS "user_digests_no_direct_insert" ON public.user_digests;
CREATE POLICY "user_digests_no_direct_insert" ON public.user_digests
  FOR INSERT TO authenticated WITH CHECK (FALSE);

-- Mark a digest as read (owner only)
CREATE OR REPLACE FUNCTION public.mark_digest_read(p_digest_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_digests
  SET read_at = NOW()
  WHERE id = p_digest_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_digest_read(BIGINT) TO authenticated;

-- Cron schedule (Mon 11:00 UTC = Mon 08:00 BRT) is configured manually
-- via SQL post-deploy because pg_net + cron require project-specific
-- secrets. See cron.schedule call applied to the live project.
