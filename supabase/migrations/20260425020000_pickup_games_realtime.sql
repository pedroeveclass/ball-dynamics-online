-- Enable Supabase realtime on pickup tables so the lobby/list pages update
-- the moment another player joins/leaves or the cron materializes the match.
-- Without this, clients have to refresh to see new participants.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_games;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_game_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
