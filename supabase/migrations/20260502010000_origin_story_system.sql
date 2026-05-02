-- Origin Story System (canonical player narrative)
-- Adds 6 origin tag columns to player_profiles, creates polymorphic
-- narratives table (append-only history), and exposes save_player_origin
-- RPC that does both the player_profiles update and the narratives insert
-- in a single authorized transaction.

-- ── 1) Origin tag columns on player_profiles ──
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS origin_start TEXT,
  ADD COLUMN IF NOT EXISTS origin_inspiration TEXT,
  ADD COLUMN IF NOT EXISTS origin_spark TEXT,
  ADD COLUMN IF NOT EXISTS origin_obstacle TEXT,
  ADD COLUMN IF NOT EXISTS origin_trait TEXT,
  ADD COLUMN IF NOT EXISTS origin_dream TEXT;

-- ── 2) narratives: polymorphic, append-only canonical history ──
-- Future scopes (match_recap, season_recap, retirement, milestone, etc.)
-- will use the same table, keyed on (entity_type, entity_id, scope).
CREATE TABLE IF NOT EXISTS public.narratives (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  scope TEXT NOT NULL,
  season INTEGER,
  round INTEGER,
  body_pt TEXT NOT NULL,
  body_en TEXT NOT NULL,
  facts_json JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_narratives_entity ON public.narratives (entity_type, entity_id);

ALTER TABLE public.narratives ENABLE ROW LEVEL SECURITY;

-- Public read: origin stories appear on PublicPlayerPage. Future scopes
-- (match recaps, season summaries) are also public-facing; if a private
-- scope is added later, narrow this policy or split per scope.
DROP POLICY IF EXISTS "narratives_public_select" ON public.narratives;
CREATE POLICY "narratives_public_select" ON public.narratives
  FOR SELECT USING (TRUE);

-- Direct INSERTs are blocked at the policy level — all writes must go
-- through SECURITY DEFINER RPCs (e.g. save_player_origin), which validate
-- ownership before inserting.
DROP POLICY IF EXISTS "narratives_no_direct_insert" ON public.narratives;
CREATE POLICY "narratives_no_direct_insert" ON public.narratives
  FOR INSERT TO authenticated WITH CHECK (FALSE);

-- ── 3) save_player_origin RPC ──
-- Single entry point for both new-player onboarding and the retroactive
-- backfill flow for existing players. Atomically:
--   (a) writes the 6 origin tags onto player_profiles
--   (b) inserts the canonical PT/EN narrative into narratives
-- ON CONFLICT DO NOTHING preserves the first generated story (immutable
-- canonical history; re-running this RPC won't overwrite the original
-- paragraph).
CREATE OR REPLACE FUNCTION public.save_player_origin(
  p_player_id UUID,
  p_origin_start TEXT,
  p_origin_inspiration TEXT,
  p_origin_spark TEXT,
  p_origin_obstacle TEXT,
  p_origin_trait TEXT,
  p_origin_dream TEXT,
  p_body_pt TEXT,
  p_body_en TEXT,
  p_facts_json JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.player_profiles
  SET
    origin_start       = p_origin_start,
    origin_inspiration = p_origin_inspiration,
    origin_spark       = p_origin_spark,
    origin_obstacle    = p_origin_obstacle,
    origin_trait       = p_origin_trait,
    origin_dream       = p_origin_dream,
    updated_at         = NOW()
  WHERE id = p_player_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found or not authorized';
  END IF;

  INSERT INTO public.narratives (
    entity_type, entity_id, scope, body_pt, body_en, facts_json
  ) VALUES (
    'player', p_player_id, 'origin_story', p_body_pt, p_body_en, COALESCE(p_facts_json, '{}'::JSONB)
  )
  ON CONFLICT (entity_type, entity_id, scope) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_player_origin(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;
