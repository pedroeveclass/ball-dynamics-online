-- ============================================================
-- Migration: Match Snapshots for Replay System
-- Stores player positions + ball + events per turn for replay
-- ============================================================

CREATE TABLE IF NOT EXISTS public.match_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  turn_number INT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_snapshots_match_turn
  ON public.match_snapshots(match_id, turn_number);

ALTER TABLE public.match_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read snapshots" ON public.match_snapshots FOR SELECT USING (true);
CREATE POLICY "Service can insert snapshots" ON public.match_snapshots FOR INSERT WITH CHECK (true);

-- Cleanup function: delete snapshots older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_snapshots()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.match_snapshots
  WHERE created_at < now() - INTERVAL '30 days';
$$;
