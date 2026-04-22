-- Adds a server-authoritative "resolution_script" to match_turns. The engine
-- populates this JSON on the current turn when it finishes resolving, and the
-- client consumes it as the single source of truth for what the animation
-- should replay. Eliminates the old polling window where the animator had to
-- wait for individual event logs to arrive and guess the outcome from them.
ALTER TABLE public.match_turns
  ADD COLUMN IF NOT EXISTS resolution_script JSONB;
