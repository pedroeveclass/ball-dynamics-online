-- ═══════════════════════════════════════════════════════════
-- Tactic knobs v2:
--   1. positioning expands from 3 → 5 levels:
--      ('very_narrow','narrow','normal','spread','very_spread').
--      Legacy 'short' migrates to 'narrow'.
--   2. attack_type stops affecting positioning (now bot AI only — central
--      = passes/dribbles toward middle; wide = toward flanks). Same column,
--      new semantics. No DB change required.
--   3. Knobs become per-phase: situational_tactics rows already key on
--      (club_id, formation, phase) so each phase carries its own values
--      — we just stop forcing them to be identical at write time.
--   4. tactic_presets.knobs JSONB shape changes from
--      { attack_type, positioning, inclination } to
--      { with_ball: {...}, without_ball: {...} }. Migrate existing presets
--      by duplicating the flat object into both phases.
-- ═══════════════════════════════════════════════════════════

-- 1+2. Drop old CHECK, migrate values, add expanded CHECK.
ALTER TABLE public.situational_tactics
  DROP CONSTRAINT IF EXISTS situational_tactics_positioning_check;

UPDATE public.situational_tactics
   SET positioning = 'narrow'
 WHERE positioning = 'short';

ALTER TABLE public.situational_tactics
  ADD CONSTRAINT situational_tactics_positioning_check
  CHECK (positioning IN ('very_narrow','narrow','normal','spread','very_spread'));

-- 3. Update default to keep schema introspection consistent.
ALTER TABLE public.situational_tactics
  ALTER COLUMN positioning SET DEFAULT 'normal';

-- 4. Migrate tactic_presets.knobs to per-phase shape.
UPDATE public.tactic_presets
   SET knobs = jsonb_build_object(
                 'with_ball',    coalesce(knobs, '{}'::jsonb),
                 'without_ball', coalesce(knobs, '{}'::jsonb)
               )
 WHERE knobs IS NULL
    OR NOT (knobs ? 'with_ball')
    OR NOT (knobs ? 'without_ball');
