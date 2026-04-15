-- ═══════════════════════════════════════════════════════════
-- Extend assistant-manager edit rights to:
--   1. club_uniforms (shirt_color, number_color, pattern, stripe_color)
--   2. a re-declared UPDATE policy on lineups for good measure
--      (tactical roles = captain/free-kick/corner/throw-in takers all
--      write to `lineups` via id, not via club_id — the earlier migration
--      already covered this, but we re-create to be sure the new name
--      is the only one in effect).
-- ═══════════════════════════════════════════════════════════

-- ── club_uniforms ────────────────────────────────────────────
DROP POLICY IF EXISTS "Manager can update own uniforms" ON public.club_uniforms;
DROP POLICY IF EXISTS "Managers and assistants update uniforms" ON public.club_uniforms;

CREATE POLICY "Managers and assistants update uniforms"
  ON public.club_uniforms FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_club(club_id))
  WITH CHECK (public.current_user_can_edit_club(club_id));

-- ── lineups (tactical roles UPDATE) ─────────────────────────
-- Re-assert the single UPDATE policy so leftover old rules (if any)
-- don't confuse Postgres into picking a restrictive one.
DROP POLICY IF EXISTS "Managers can update own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers and assistants update lineups" ON public.lineups;

CREATE POLICY "Managers and assistants update lineups"
  ON public.lineups FOR UPDATE TO authenticated
  USING (public.current_user_can_edit_club(club_id))
  WITH CHECK (public.current_user_can_edit_club(club_id));
