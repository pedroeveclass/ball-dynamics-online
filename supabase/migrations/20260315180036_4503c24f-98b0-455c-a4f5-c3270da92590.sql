
-- =============================================
-- MATCH ENGINE TABLES: match_turns & match_actions
-- =============================================

-- match_turns: one row per turn/phase combo
CREATE TABLE IF NOT EXISTS public.match_turns (
  id                         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id                   UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  turn_number                INTEGER NOT NULL DEFAULT 1,
  phase                      TEXT NOT NULL DEFAULT 'ball_holder',
  possession_club_id         UUID REFERENCES public.clubs(id),
  ball_holder_participant_id UUID REFERENCES public.match_participants(id),
  started_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '6 seconds'),
  resolved_at                TIMESTAMP WITH TIME ZONE,
  status                     TEXT NOT NULL DEFAULT 'active',
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.match_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view match turns"
  ON public.match_turns FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "System can insert match turns"
  ON public.match_turns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_turns.match_id
        AND (
          m.home_club_id = public.current_user_managed_club_id()
          OR m.away_club_id = public.current_user_managed_club_id()
        )
    )
  );

CREATE POLICY "System can update match turns"
  ON public.match_turns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_turns.match_id
        AND (
          m.home_club_id = public.current_user_managed_club_id()
          OR m.away_club_id = public.current_user_managed_club_id()
        )
    )
  );

-- match_actions: actions submitted per turn
CREATE TABLE IF NOT EXISTS public.match_actions (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id                 UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  match_turn_id            UUID NOT NULL REFERENCES public.match_turns(id) ON DELETE CASCADE,
  participant_id           UUID NOT NULL REFERENCES public.match_participants(id),
  controlled_by_type       TEXT NOT NULL DEFAULT 'bot',
  controlled_by_user_id    UUID,
  action_type              TEXT NOT NULL,
  target_x                 NUMERIC,
  target_y                 NUMERIC,
  target_participant_id    UUID REFERENCES public.match_participants(id),
  payload                  JSONB,
  status                   TEXT NOT NULL DEFAULT 'pending',
  created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.match_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view match actions"
  ON public.match_actions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Participants can insert match actions"
  ON public.match_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.id = match_actions.participant_id
        AND (
          mp.connected_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = match_actions.match_id
              AND (
                m.home_club_id = public.current_user_managed_club_id()
                OR m.away_club_id = public.current_user_managed_club_id()
              )
          )
        )
    )
  );

CREATE POLICY "Participants can update own match actions"
  ON public.match_actions FOR UPDATE
  TO authenticated
  USING (controlled_by_user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_turns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_actions;

-- Add position columns to match_participants
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS pos_x NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS pos_y NUMERIC DEFAULT 50;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_match_turns_match_id ON public.match_turns(match_id);
CREATE INDEX IF NOT EXISTS idx_match_actions_match_turn_id ON public.match_actions(match_turn_id);
CREATE INDEX IF NOT EXISTS idx_match_actions_participant_id ON public.match_actions(participant_id);
