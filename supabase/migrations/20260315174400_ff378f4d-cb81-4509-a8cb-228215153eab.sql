-- Create match_challenges table
CREATE TABLE public.match_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenger_club_id UUID NOT NULL REFERENCES public.clubs(id),
  challenged_club_id UUID NOT NULL REFERENCES public.clubs(id),
  challenger_manager_profile_id UUID NOT NULL REFERENCES public.manager_profiles(id),
  challenged_manager_profile_id UUID REFERENCES public.manager_profiles(id),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  match_id UUID REFERENCES public.matches(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.match_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challengers can insert challenges"
ON public.match_challenges FOR INSERT
TO authenticated
WITH CHECK (challenger_manager_profile_id = current_user_manager_profile_id());

CREATE POLICY "Managers can view own challenges"
ON public.match_challenges FOR SELECT
TO authenticated
USING (
  challenger_club_id = current_user_managed_club_id()
  OR challenged_club_id = current_user_managed_club_id()
);

CREATE POLICY "Managers can update own challenges"
ON public.match_challenges FOR UPDATE
TO authenticated
USING (
  challenger_club_id = current_user_managed_club_id()
  OR challenged_club_id = current_user_managed_club_id()
);

CREATE TRIGGER update_match_challenges_updated_at
  BEFORE UPDATE ON public.match_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow any authenticated user to see lineups used in a match (for match room)
CREATE POLICY "Match participants can view match lineups"
ON public.lineups FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.home_lineup_id = lineups.id OR m.away_lineup_id = lineups.id
  )
);

-- Allow any authenticated user to see lineup slots used in a match
CREATE POLICY "Match participants can view match lineup slots"
ON public.lineup_slots FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lineups l
    JOIN public.matches m ON (m.home_lineup_id = l.id OR m.away_lineup_id = l.id)
    WHERE l.id = lineup_slots.lineup_id
  )
);

-- Extend notifications INSERT to allow managers to notify other users
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Authenticated can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);