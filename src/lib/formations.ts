// Shared formation position definitions.
// NOTE: supabase/functions/match-engine-lab/index.ts has its own copy
// because Deno edge functions cannot import from src/lib.

export type FormationSlot = { x: number; y: number; pos: string };

export const DEFAULT_FORMATION = '4-4-2';

export const FORMATION_POSITIONS: Record<string, FormationSlot[]> = {
  '4-4-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 42, y: 15, pos: 'LM' }, { x: 42, y: 37, pos: 'CM' }, { x: 42, y: 63, pos: 'CM' }, { x: 42, y: 85, pos: 'RM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '4-3-3': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 15, pos: 'LW' }, { x: 62, y: 50, pos: 'ST' }, { x: 60, y: 85, pos: 'RW' },
  ],
  '4-2-3-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 36, y: 35, pos: 'CDM' }, { x: 36, y: 65, pos: 'CDM' },
    { x: 50, y: 15, pos: 'LM' }, { x: 50, y: 50, pos: 'CAM' }, { x: 50, y: 85, pos: 'RM' },
    { x: 63, y: 50, pos: 'ST' },
  ],
  '3-5-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 25, pos: 'CB' }, { x: 22, y: 50, pos: 'CB' }, { x: 22, y: 75, pos: 'CB' },
    { x: 38, y: 10, pos: 'LWB' }, { x: 38, y: 35, pos: 'CM' }, { x: 38, y: 50, pos: 'CM' }, { x: 38, y: 65, pos: 'CM' }, { x: 38, y: 90, pos: 'RWB' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '3-4-3': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 25, pos: 'CB' }, { x: 22, y: 50, pos: 'CB' }, { x: 22, y: 75, pos: 'CB' },
    { x: 40, y: 15, pos: 'LM' }, { x: 40, y: 37, pos: 'CM' }, { x: 40, y: 63, pos: 'CM' }, { x: 40, y: 85, pos: 'RM' },
    { x: 60, y: 15, pos: 'LW' }, { x: 62, y: 50, pos: 'ST' }, { x: 60, y: 85, pos: 'RW' },
  ],
  '5-3-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 20, y: 10, pos: 'LWB' }, { x: 18, y: 30, pos: 'CB' }, { x: 18, y: 50, pos: 'CB' }, { x: 18, y: 70, pos: 'CB' }, { x: 20, y: 90, pos: 'RWB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '5-4-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 20, y: 10, pos: 'LWB' }, { x: 18, y: 30, pos: 'CB' }, { x: 18, y: 50, pos: 'CB' }, { x: 18, y: 70, pos: 'CB' }, { x: 20, y: 90, pos: 'RWB' },
    { x: 40, y: 15, pos: 'LM' }, { x: 40, y: 37, pos: 'CM' }, { x: 40, y: 63, pos: 'CM' }, { x: 40, y: 85, pos: 'RM' },
    { x: 62, y: 50, pos: 'ST' },
  ],
  '4-1-4-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 34, y: 50, pos: 'CDM' },
    { x: 48, y: 15, pos: 'LM' }, { x: 48, y: 37, pos: 'CM' }, { x: 48, y: 63, pos: 'CM' }, { x: 48, y: 85, pos: 'RM' },
    { x: 63, y: 50, pos: 'ST' },
  ],
  'test-home': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 25, y: 50, pos: 'CB' },
    { x: 45, y: 50, pos: 'ST' },
  ],
  'test-away': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 25, y: 50, pos: 'CB' },
    { x: 45, y: 50, pos: 'ST' },
  ],
};

// ─── Role-swap groups + visual nudges (lineup editor only) ──────────
//
// The manager can swap a slot's tactical role within the same group
// (e.g., MC → VOL, ATA → PD). The swap is purely visual on the lineup
// page plus a tiny coordinate "pulinho" so the slot drifts toward the
// new role's tendency. The engine reads the override only for
// positional-penalty calc; spawn xy and situational quadrants still
// follow `slot_position`. To re-shape the actual on-field movement,
// the manager must edit situational tactics.

export type SwapGroup = 'GK' | 'DEF' | 'MID' | 'ATK';

/** Roles selectable inside each group. Keep group-internal (no cross-group). */
export const SWAP_GROUPS: Record<SwapGroup, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  MID: ['CM', 'CDM', 'CAM', 'LM', 'RM'],
  ATK: ['ST', 'CF', 'LW', 'RW'],
};

const ROLE_TO_GROUP: Record<string, SwapGroup> = {
  GK: 'GK',
  CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CM: 'MID', CDM: 'MID', DM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  ST: 'ATK', CF: 'ATK', LW: 'ATK', RW: 'ATK',
};

/** Strip slot suffix digits and return canonical position code. CB1 → CB, CM2 → CM. */
export function canonicalRole(slotOrRole: string | null | undefined): string {
  if (!slotOrRole) return '';
  return slotOrRole.replace(/[0-9]/g, '').toUpperCase();
}

export function getSwapGroup(slotOrRole: string | null | undefined): SwapGroup | null {
  return ROLE_TO_GROUP[canonicalRole(slotOrRole)] ?? null;
}

/**
 * Roles available to swap to from `slot_position`. Excludes the slot's own
 * default role (no point picking it again — that's the "reset" path, handled
 * separately by clearing the override).
 */
export function getSwappableRoles(slotPosition: string): string[] {
  const group = getSwapGroup(slotPosition);
  if (!group || group === 'GK') return [];
  const own = canonicalRole(slotPosition);
  return SWAP_GROUPS[group].filter(r => r !== own);
}

/**
 * Tendency vector per role within the editor portrait coord system
 * (y=0 → opponent goal, y=100 → own goal). Numbers are small so the
 * "pulinho" stays subtle.
 */
const ROLE_NUDGE: Record<string, { dx: number; dy: number }> = {
  GK:  { dx: 0,  dy: 0 },
  // DEF
  CB:  { dx: 0,  dy: 0 },
  LB:  { dx: -3, dy: -1 },
  RB:  { dx: 3,  dy: -1 },
  LWB: { dx: -4, dy: -3 },
  RWB: { dx: 4,  dy: -3 },
  // MID
  CM:  { dx: 0,  dy: 0 },
  CDM: { dx: 0,  dy: 4 },
  DM:  { dx: 0,  dy: 4 },
  CAM: { dx: 0,  dy: -4 },
  LM:  { dx: -3, dy: 0 },
  RM:  { dx: 3,  dy: 0 },
  // ATK
  ST:  { dx: 0,  dy: 0 },
  CF:  { dx: 0,  dy: 3 },
  LW:  { dx: -4, dy: -1 },
  RW:  { dx: 4,  dy: -1 },
};

function nudgeFor(role: string | null | undefined): { dx: number; dy: number } {
  return ROLE_NUDGE[canonicalRole(role)] ?? { dx: 0, dy: 0 };
}

/**
 * Slot's effective (x,y) on the lineup field given an optional role override.
 * Returns `baseline + nudge(override) − nudge(baselineRole)`. Mirrored on
 * X for slots whose baseline sits on the right half so a "−dx" nudge always
 * means "move toward the player's tactical sideline" (works for symmetric
 * pairs like LM/RM regardless of formation).
 */
export function applyRoleNudge(
  baselineX: number,
  baselineY: number,
  baselineRole: string,
  override: string | null | undefined,
): { x: number; y: number } {
  if (!override) return { x: baselineX, y: baselineY };
  const eff = nudgeFor(override);
  const base = nudgeFor(baselineRole);
  let dx = eff.dx - base.dx;
  let dy = eff.dy - base.dy;
  // Mirror dx for right-side slots so the nudge keeps its semantic
  // "toward own flank" / "toward center" meaning.
  if (baselineX > 50) dx = -dx;
  return {
    x: Math.max(2, Math.min(98, baselineX + dx)),
    y: Math.max(2, Math.min(98, baselineY + dy)),
  };
}

/** Return formation slots mirrored for away side; optionally clamp to own half. */
export function getFormationPositions(
  formation: string,
  isHome: boolean,
  clampToOwnHalf = false,
): FormationSlot[] {
  const base = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  // When attacking LEFT (away side / home 2nd half), mirror BOTH axes so
  // LB/LM go to the bottom and RB/RM to the top (matching player perspective).
  let positions = isHome ? base : base.map(p => ({ ...p, x: 100 - p.x, y: 100 - p.y }));
  if (clampToOwnHalf) {
    positions = positions.map(p => ({
      ...p,
      x: isHome ? Math.min(p.x, 48) : Math.max(p.x, 52),
    }));
  }
  return positions;
}
