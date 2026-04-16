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
