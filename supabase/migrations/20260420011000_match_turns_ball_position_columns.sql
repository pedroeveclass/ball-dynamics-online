-- Backfill migration for match_turns.ball_x / ball_y.
-- These columns exist on the live project (writes happen in engine code) but
-- were never declared in a repo migration — fresh Supabase projects created
-- from migrations alone would fail the new per-turn ball-position INSERTs.
ALTER TABLE public.match_turns
  ADD COLUMN IF NOT EXISTS ball_x numeric,
  ADD COLUMN IF NOT EXISTS ball_y numeric;
