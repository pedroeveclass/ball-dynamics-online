-- ═══════════════════════════════════════════════════════════
-- Engine cache: store static match data (player attributes,
-- club settings, coach bonuses, lineup roles) to avoid
-- re-querying every tick
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS engine_cache JSONB;
