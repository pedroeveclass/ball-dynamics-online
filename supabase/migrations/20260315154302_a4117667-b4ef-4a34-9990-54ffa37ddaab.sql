-- Match infrastructure tables

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_club_id uuid NOT NULL REFERENCES public.clubs(id),
  away_club_id uuid NOT NULL REFERENCES public.clubs(id),
  home_lineup_id uuid REFERENCES public.lineups(id),
  away_lineup_id uuid REFERENCES public.lineups(id),
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,
  current_phase text,
  current_turn_number integer NOT NULL DEFAULT 0,
  possession_club_id uuid REFERENCES public.clubs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_profile_id uuid REFERENCES public.player_profiles(id),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  lineup_slot_id uuid REFERENCES public.lineup_slots(id),
  role_type text NOT NULL DEFAULT 'player',
  is_bot boolean NOT NULL DEFAULT true,
  is_ready boolean NOT NULL DEFAULT false,
  connected_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.match_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_event_logs ENABLE ROW LEVEL SECURITY;

-- Enable realtime for match_event_logs and match_participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_event_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;

-- RLS: matches are readable by authenticated users (public matches)
CREATE POLICY "Authenticated can view matches"
ON public.matches FOR SELECT TO authenticated
USING (true);

-- Managers can create matches for their own club
CREATE POLICY "Managers can create matches"
ON public.matches FOR INSERT TO authenticated
WITH CHECK (
  home_club_id = public.current_user_managed_club_id()
  OR away_club_id = public.current_user_managed_club_id()
);

-- Managers of participating clubs can update matches
CREATE POLICY "Managers can update own matches"
ON public.matches FOR UPDATE TO authenticated
USING (
  home_club_id = public.current_user_managed_club_id()
  OR away_club_id = public.current_user_managed_club_id()
);

-- match_participants: readable by authenticated
CREATE POLICY "Authenticated can view match participants"
ON public.match_participants FOR SELECT TO authenticated
USING (true);

-- Managers can insert participants for their matches
CREATE POLICY "Managers can insert match participants"
ON public.match_participants FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id
    AND (m.home_club_id = public.current_user_managed_club_id()
      OR m.away_club_id = public.current_user_managed_club_id())
  )
);

-- Participants can update their own record (ready check)
CREATE POLICY "Users can update own participation"
ON public.match_participants FOR UPDATE TO authenticated
USING (connected_user_id = auth.uid());

-- Managers can update participants of their matches
CREATE POLICY "Managers can update match participants"
ON public.match_participants FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id
    AND (m.home_club_id = public.current_user_managed_club_id()
      OR m.away_club_id = public.current_user_managed_club_id())
  )
);

-- match_event_logs: readable by authenticated
CREATE POLICY "Authenticated can view match events"
ON public.match_event_logs FOR SELECT TO authenticated
USING (true);

-- Insert events for participating matches
CREATE POLICY "Participants can insert match events"
ON public.match_event_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_event_logs.match_id
    AND (m.home_club_id = public.current_user_managed_club_id()
      OR m.away_club_id = public.current_user_managed_club_id())
  )
);

-- updated_at triggers
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_match_participants_updated_at BEFORE UPDATE ON public.match_participants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();