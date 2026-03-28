-- ============================================================
-- Migration: Match Chat
-- ============================================================

CREATE TABLE IF NOT EXISTS public.match_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_chat_match ON public.match_chat_messages(match_id, created_at);

ALTER TABLE public.match_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read match chat" ON public.match_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can send chat" ON public.match_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
