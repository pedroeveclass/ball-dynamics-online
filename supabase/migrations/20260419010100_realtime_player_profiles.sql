-- Enable Supabase realtime on player_profiles so clients receive UPDATE events
-- when energy regen, training, store purchases, etc. modify the row server-side.
-- Without this, the UI keeps showing stale energy/coins until a manual refetch.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.player_profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
