-- ============================================================
-- Migration: Yellow/Red Cards System
-- Tracks cards per player per match, with send-off on 2 yellows
-- ============================================================

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS yellow_cards INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_sent_off BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_match_participants_sent_off
  ON public.match_participants(match_id, is_sent_off)
  WHERE is_sent_off = true;
