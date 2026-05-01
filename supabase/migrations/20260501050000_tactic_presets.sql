-- ═══════════════════════════════════════════════════════════
-- Tactic presets — named tactical variations on top of a base formation
--
-- A preset bundles everything that makes a tactic "look different":
--   - situational positions (35 quadrants × 2 phases)
--   - tactical knobs (attack_type / positioning / inclination)
--   - set-piece (Bola Parada) layouts (4 types × 2 phases)
--   - role overrides (e.g. DM → AM) applied per slot when assigned to a lineup
--
-- The base formation (e.g. '3-5-2') still defines slot geometry and is
-- what gets shown publicly. The preset name is private to the club.
--
-- Lineups gain `tactic_preset_id`: when set, the engine loads the preset
-- snapshot at match start instead of the per-club default
-- (situational_tactics / set_piece_tactics rows).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tactic_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  base_formation TEXT NOT NULL,
  positions JSONB NOT NULL DEFAULT '{"with_ball":{},"without_ball":{}}'::jsonb,
  knobs JSONB NOT NULL DEFAULT '{"attack_type":"balanced","positioning":"normal","inclination":"normal"}'::jsonb,
  set_pieces JSONB NOT NULL DEFAULT '{}'::jsonb,
  role_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tactic_presets_club ON public.tactic_presets (club_id);

ALTER TABLE public.tactic_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members read tactic presets" ON public.tactic_presets;
CREATE POLICY "Club members read tactic presets"
  ON public.tactic_presets FOR SELECT TO authenticated
  USING (public.current_user_is_club_member(club_id));

-- Writes happen exclusively via RPCs below (which run as SECURITY DEFINER and
-- enforce cap + ownership). No direct INSERT/UPDATE/DELETE policies.

CREATE OR REPLACE FUNCTION public.touch_tactic_presets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tactic_presets_updated_at ON public.tactic_presets;
CREATE TRIGGER trg_tactic_presets_updated_at
  BEFORE UPDATE ON public.tactic_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_tactic_presets_updated_at();

-- Lineups: opt-in pointer to a preset. ON DELETE SET NULL so deleting the
-- preset gracefully reverts the lineup to base behavior.
ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS tactic_preset_id UUID NULL REFERENCES public.tactic_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lineups_tactic_preset ON public.lineups(tactic_preset_id) WHERE tactic_preset_id IS NOT NULL;

-- ── RPCs ─────────────────────────────────────────────────────

-- create_tactic_preset: validates cap (10 per club) + unique name + edit auth.
CREATE OR REPLACE FUNCTION public.create_tactic_preset(
  p_club_id UUID,
  p_name TEXT,
  p_base_formation TEXT,
  p_positions JSONB,
  p_knobs JSONB,
  p_set_pieces JSONB,
  p_role_overrides JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id UUID;
  v_name TEXT;
BEGIN
  IF NOT public.current_user_can_edit_club(p_club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_name := trim(coalesce(p_name, ''));
  IF length(v_name) < 1 OR length(v_name) > 40 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  SELECT count(*) INTO v_count FROM tactic_presets WHERE club_id = p_club_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'limit_reached';
  END IF;

  IF EXISTS (SELECT 1 FROM tactic_presets WHERE club_id = p_club_id AND name = v_name) THEN
    RAISE EXCEPTION 'name_taken';
  END IF;

  INSERT INTO tactic_presets (
    club_id, name, base_formation, positions, knobs, set_pieces, role_overrides
  ) VALUES (
    p_club_id, v_name, p_base_formation,
    coalesce(p_positions, '{"with_ball":{},"without_ball":{}}'::jsonb),
    coalesce(p_knobs, '{"attack_type":"balanced","positioning":"normal","inclination":"normal"}'::jsonb),
    coalesce(p_set_pieces, '{}'::jsonb),
    coalesce(p_role_overrides, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tactic_preset(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- update_tactic_preset: accepts NULLs to leave fields untouched.
CREATE OR REPLACE FUNCTION public.update_tactic_preset(
  p_preset_id UUID,
  p_name TEXT,
  p_positions JSONB,
  p_knobs JSONB,
  p_set_pieces JSONB,
  p_role_overrides JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club UUID;
  v_name TEXT;
BEGIN
  SELECT club_id INTO v_club FROM tactic_presets WHERE id = p_preset_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.current_user_can_edit_club(v_club) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_name IS NOT NULL THEN
    v_name := trim(p_name);
    IF length(v_name) < 1 OR length(v_name) > 40 THEN
      RAISE EXCEPTION 'invalid_name';
    END IF;
    IF EXISTS (
      SELECT 1 FROM tactic_presets
      WHERE club_id = v_club AND name = v_name AND id <> p_preset_id
    ) THEN
      RAISE EXCEPTION 'name_taken';
    END IF;
  END IF;

  UPDATE tactic_presets SET
    name           = coalesce(v_name, name),
    positions      = coalesce(p_positions, positions),
    knobs          = coalesce(p_knobs, knobs),
    set_pieces     = coalesce(p_set_pieces, set_pieces),
    role_overrides = coalesce(p_role_overrides, role_overrides)
  WHERE id = p_preset_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tactic_preset(UUID, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- delete_tactic_preset: lineups pointing at it cascade to NULL via FK.
CREATE OR REPLACE FUNCTION public.delete_tactic_preset(p_preset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club UUID;
BEGIN
  SELECT club_id INTO v_club FROM tactic_presets WHERE id = p_preset_id;
  IF v_club IS NULL THEN RETURN; END IF;
  IF NOT public.current_user_can_edit_club(v_club) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM tactic_presets WHERE id = p_preset_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tactic_preset(UUID) TO authenticated;

-- duplicate_tactic_preset: clones into the same club with a new name.
CREATE OR REPLACE FUNCTION public.duplicate_tactic_preset(
  p_preset_id UUID,
  p_new_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src tactic_presets%ROWTYPE;
  v_count INT;
  v_id UUID;
  v_name TEXT;
BEGIN
  SELECT * INTO v_src FROM tactic_presets WHERE id = p_preset_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.current_user_can_edit_club(v_src.club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_name := trim(coalesce(p_new_name, ''));
  IF length(v_name) < 1 OR length(v_name) > 40 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  SELECT count(*) INTO v_count FROM tactic_presets WHERE club_id = v_src.club_id;
  IF v_count >= 10 THEN RAISE EXCEPTION 'limit_reached'; END IF;

  IF EXISTS (SELECT 1 FROM tactic_presets WHERE club_id = v_src.club_id AND name = v_name) THEN
    RAISE EXCEPTION 'name_taken';
  END IF;

  INSERT INTO tactic_presets (
    club_id, name, base_formation, positions, knobs, set_pieces, role_overrides
  ) VALUES (
    v_src.club_id, v_name, v_src.base_formation,
    v_src.positions, v_src.knobs, v_src.set_pieces, v_src.role_overrides
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_tactic_preset(UUID, TEXT) TO authenticated;

-- share_tactic_preset: copies preset to another club, validates target cap,
-- notifies the target's head manager.
CREATE OR REPLACE FUNCTION public.share_tactic_preset(
  p_preset_id UUID,
  p_target_club_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src tactic_presets%ROWTYPE;
  v_count INT;
  v_id UUID;
  v_new_name TEXT;
  v_target_user UUID;
  v_target_club_name TEXT;
  v_actor_username TEXT;
  v_source_club_name TEXT;
BEGIN
  SELECT * INTO v_src FROM tactic_presets WHERE id = p_preset_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.current_user_can_edit_club(v_src.club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_src.club_id = p_target_club_id THEN
    RAISE EXCEPTION 'same_club';
  END IF;

  -- Target cap check (10 max).
  SELECT count(*) INTO v_count FROM tactic_presets WHERE club_id = p_target_club_id;
  IF v_count >= 10 THEN RAISE EXCEPTION 'target_limit_reached'; END IF;

  -- Build a unique name on the target. Start from the source name; if taken,
  -- append a numeric suffix until a free slot is found.
  v_new_name := v_src.name;
  IF EXISTS (SELECT 1 FROM tactic_presets WHERE club_id = p_target_club_id AND name = v_new_name) THEN
    FOR i IN 2..50 LOOP
      v_new_name := left(v_src.name, 36) || ' (' || i::text || ')';
      EXIT WHEN NOT EXISTS (SELECT 1 FROM tactic_presets WHERE club_id = p_target_club_id AND name = v_new_name);
    END LOOP;
    IF EXISTS (SELECT 1 FROM tactic_presets WHERE club_id = p_target_club_id AND name = v_new_name) THEN
      RAISE EXCEPTION 'name_taken';
    END IF;
  END IF;

  INSERT INTO tactic_presets (
    club_id, name, base_formation, positions, knobs, set_pieces, role_overrides
  ) VALUES (
    p_target_club_id, v_new_name, v_src.base_formation,
    v_src.positions, v_src.knobs, v_src.set_pieces, v_src.role_overrides
  )
  RETURNING id INTO v_id;

  -- Notify target club's head manager.
  SELECT mp.user_id, c.name INTO v_target_user, v_target_club_name
  FROM clubs c
  LEFT JOIN manager_profiles mp ON mp.id = c.manager_profile_id
  WHERE c.id = p_target_club_id;

  SELECT name INTO v_source_club_name FROM clubs WHERE id = v_src.club_id;
  SELECT username INTO v_actor_username FROM profiles WHERE id = auth.uid();

  IF v_target_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link, i18n_key, i18n_params)
    VALUES (
      v_target_user,
      'system',
      'Novo preset tático recebido',
      coalesce(v_actor_username, 'Outro técnico') || ' compartilhou "' || v_src.name || '" (' || v_src.base_formation || ') com seu clube.',
      '/manager/lineup/tactics?preset=' || v_id::text,
      'preset_shared',
      jsonb_build_object(
        'actor', coalesce(v_actor_username, ''),
        'preset_name', v_new_name,
        'base_formation', v_src.base_formation,
        'source_club', coalesce(v_source_club_name, '')
      )
    );
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_tactic_preset(UUID, UUID) TO authenticated;
