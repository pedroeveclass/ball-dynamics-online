-- Real-time clock system for matches
-- Instead of ending after N turns, matches use real elapsed time per half.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS half_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_half INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS injury_time_turns INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS injury_time_start_turn INT;
