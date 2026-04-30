-- Lineup slot role override.
-- Lets the manager swap a slot's tactical role within the same group
-- (DEF/MID/ATK) without disturbing the formation template. The override
-- only affects the positional-penalty multiplier in the engine; spawn
-- coordinates and situational tactics remain driven by `slot_position`.
ALTER TABLE public.lineup_slots
  ADD COLUMN IF NOT EXISTS role_override text NULL;

COMMENT ON COLUMN public.lineup_slots.role_override IS
  'Optional alternative role for this slot (e.g. CDM, LM). When set, the engine '
  'computes positional penalty against this role instead of slot_position. '
  'Spawn xy and situational quadrants still use slot_position.';
