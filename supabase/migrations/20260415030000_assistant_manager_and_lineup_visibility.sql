-- ═══════════════════════════════════════════════════════════
-- Assistant manager role + lineup visibility for club members.
--
-- 1. `clubs.assistant_manager_id` — nullable FK to profiles.id.
--    Any user (player or manager) can be nominated as assistant
--    by the head coach of the club.
-- 2. Club members (starters, bench, squad, the manager itself and
--    the assistant) can READ the club's lineups & lineup_slots.
-- 3. The assistant can also EDIT lineups & lineup_slots (same as
--    the head manager).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS assistant_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_assistant_manager_id
  ON public.clubs(assistant_manager_id)
  WHERE assistant_manager_id IS NOT NULL;

-- Helper: returns true if the caller is head manager OR assistant of the given club.
CREATE OR REPLACE FUNCTION public.current_user_can_edit_club(p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs c
    LEFT JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE c.id = p_club_id
      AND (
        mp.user_id = auth.uid()
        OR c.assistant_manager_id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_edit_club(UUID) TO authenticated;

-- Helper: returns true if the caller belongs to the club (manager, assistant, or squad player).
CREATE OR REPLACE FUNCTION public.current_user_is_club_member(p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_can_edit_club(p_club_id)
    OR EXISTS (
      SELECT 1 FROM public.player_profiles pp
      WHERE pp.user_id = auth.uid()
        AND pp.club_id::UUID = p_club_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_club_member(UUID) TO authenticated;

-- ─── Lineups RLS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Club members read lineups" ON public.lineups;
CREATE POLICY "Club members read lineups"
  ON public.lineups FOR SELECT TO authenticated
  USING (public.current_user_is_club_member(club_id));

DROP POLICY IF EXISTS "Managers and assistants insert lineups" ON public.lineups;
CREATE POLICY "Managers and assistants insert lineups"
  ON public.lineups FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants update lineups" ON public.lineups;
CREATE POLICY "Managers and assistants update lineups"
  ON public.lineups FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_club(club_id))
  WITH CHECK (public.current_user_can_edit_club(club_id));

DROP POLICY IF EXISTS "Managers and assistants delete lineups" ON public.lineups;
CREATE POLICY "Managers and assistants delete lineups"
  ON public.lineups FOR DELETE TO authenticated
  USING (public.current_user_can_edit_club(club_id));

-- Drop the old policies that the new ones supersede.
DROP POLICY IF EXISTS "Managers can view own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can update own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can insert own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can delete own lineups" ON public.lineups;

-- ─── Lineup_slots RLS ────────────────────────────────────────
DROP POLICY IF EXISTS "Club members read lineup slots" ON public.lineup_slots;
CREATE POLICY "Club members read lineup slots"
  ON public.lineup_slots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lineups l
      WHERE l.id = lineup_slots.lineup_id
        AND public.current_user_is_club_member(l.club_id)
    )
  );

DROP POLICY IF EXISTS "Managers and assistants insert lineup slots" ON public.lineup_slots;
CREATE POLICY "Managers and assistants insert lineup slots"
  ON public.lineup_slots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lineups l
      WHERE l.id = lineup_slots.lineup_id
        AND public.current_user_can_edit_club(l.club_id)
    )
  );

DROP POLICY IF EXISTS "Managers and assistants update lineup slots" ON public.lineup_slots;
CREATE POLICY "Managers and assistants update lineup slots"
  ON public.lineup_slots FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lineups l
      WHERE l.id = lineup_slots.lineup_id
        AND public.current_user_can_edit_club(l.club_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lineups l
      WHERE l.id = lineup_slots.lineup_id
        AND public.current_user_can_edit_club(l.club_id)
    )
  );

DROP POLICY IF EXISTS "Managers and assistants delete lineup slots" ON public.lineup_slots;
CREATE POLICY "Managers and assistants delete lineup slots"
  ON public.lineup_slots FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lineups l
      WHERE l.id = lineup_slots.lineup_id
        AND public.current_user_can_edit_club(l.club_id)
    )
  );

DROP POLICY IF EXISTS "Managers can view own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can update own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can insert own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can delete own lineup slots" ON public.lineup_slots;

-- RPC: head manager nominates / clears the assistant. Must be an owner of the club.
CREATE OR REPLACE FUNCTION public.set_club_assistant_manager(
  p_club_id UUID,
  p_assistant_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_user_id UUID;
BEGIN
  SELECT mp.user_id INTO v_manager_user_id
  FROM public.clubs c
  JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
  WHERE c.id = p_club_id;

  IF v_manager_user_id IS NULL OR v_manager_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the head manager can nominate an assistant';
  END IF;

  IF p_assistant_user_id IS NOT NULL AND p_assistant_user_id = v_manager_user_id THEN
    RAISE EXCEPTION 'Head manager cannot also be the assistant';
  END IF;

  UPDATE public.clubs
     SET assistant_manager_id = p_assistant_user_id
   WHERE id = p_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_club_assistant_manager(UUID, UUID) TO authenticated;
