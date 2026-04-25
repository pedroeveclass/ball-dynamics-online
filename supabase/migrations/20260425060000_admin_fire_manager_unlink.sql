-- ═══════════════════════════════════════════════════════════
-- admin_fire_manager: actually unlink the manager
-- Previous version only flipped is_bot_managed, but
-- useAuth.fetchManagerProfile resolves the club via
-- clubs.manager_profile_id = manager.id, so the fired manager
-- still saw/edited the club. We now NULL the column too.
-- ═══════════════════════════════════════════════════════════

-- Ensure the column is nullable (bankruptcy_reset already assumes
-- this, but the original CREATE TABLE declared it NOT NULL).
ALTER TABLE public.clubs ALTER COLUMN manager_profile_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_fire_manager(p_club_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_caller() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.clubs
  SET is_bot_managed = true,
      manager_profile_id = NULL,
      assistant_manager_id = NULL
  WHERE id = p_club_id;
END;
$$;
