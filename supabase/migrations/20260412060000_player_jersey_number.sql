-- Per-player permanent jersey number chosen by the manager in the squad screen.
-- Range 0-99 (nullable — not every player has one assigned on first migration).
-- Uniqueness is NOT enforced at DB level because the same number could belong to
-- players in different clubs, and we allow temporary collisions within a club
-- while the manager reshuffles numbers. UI/manager-side validation keeps things
-- tidy; duplicate numbers within a club are cosmetic only and don't break the
-- match engine (fallback still resolves).

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS jersey_number INTEGER
  CHECK (jersey_number IS NULL OR (jersey_number >= 0 AND jersey_number <= 99));
