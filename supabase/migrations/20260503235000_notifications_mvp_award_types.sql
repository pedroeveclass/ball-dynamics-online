-- ─────────────────────────────────────────────────────────────
-- Allow MVP-poll notification types in notifications.type CHECK
-- ─────────────────────────────────────────────────────────────
-- Migration 20260502050000_player_award_polls.sql added INSERTs
-- with type IN ('round_mvp_open','round_mvp_won') and 20260502060000
-- added 'season_mvp_open','season_mvp_won', but neither extended
-- the existing CHECK constraint. Result: the AFTER-UPDATE trigger
-- on league_rounds silently rolled back (caught by EXCEPTION WHEN
-- OTHERS), so finished rounds left no MVP poll behind.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'contract'::text,
      'transfer'::text,
      'match'::text,
      'training'::text,
      'league'::text,
      'system'::text,
      'finance'::text,
      'energy'::text,
      'forum'::text,
      'store'::text,
      'round_mvp_open'::text,
      'round_mvp_won'::text,
      'season_mvp_open'::text,
      'season_mvp_won'::text
    ])
  );
