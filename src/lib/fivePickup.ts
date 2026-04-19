// Helpers for building 5x5 (pickup/test/friendly) matches from a team's
// lineup. The rule we want everywhere: pick 1 GK + 2 DEF + 1 MID + 1 ATA
// from the formation and keep that role distribution even when a human
// player replaces a bot.

import { positionGroup } from './positions';

export type PickupSlot = {
  player_profile_id: string | null;
  slot_position: string | null;
  role_type?: string | null;
  lineup_slot_id?: string | null;
  overall?: number | null;
};

export type PickupCoord = { x: number; y: number; group: GroupKey };

// Canonical 5x5 home-side layout. Away side mirrors on X. Order matches
// COORD_GROUPS so indices line up with the role slots.
export const FIVE_V_FIVE_COORDS: PickupCoord[] = [
  { x: 5, y: 50, group: 'GK' },
  { x: 25, y: 30, group: 'DEF' },
  { x: 25, y: 70, group: 'DEF' },
  { x: 40, y: 35, group: 'MID' },
  { x: 42, y: 65, group: 'ATK' },
];

export type GroupKey = 'GK' | 'DEF' | 'MID' | 'ATK';

export const COORD_GROUPS: GroupKey[] = FIVE_V_FIVE_COORDS.map(c => c.group);

const GROUP_ORDER: GroupKey[] = ['GK', 'DEF', 'MID', 'ATK'];

export function groupFromPos(pos: string | null | undefined): GroupKey | null {
  if (!pos) return null;
  const clean = pos.replace(/^BENCH_?/i, '').replace(/[0-9]/g, '').toUpperCase();
  if (clean === 'GK') return 'GK';
  const g = positionGroup(clean);
  if (g === 1) return 'DEF';
  if (g === 2) return 'MID';
  if (g === 3) return 'ATK';
  return null;
}

// Pick 5 slots following GK + DEF + DEF + MID + ATK, starters first then
// bench. Returns indices aligned with FIVE_V_FIVE_COORDS (index 0 = GK,
// etc). A slot is null if the team simply doesn't have anybody in that
// group (rare — caller should fall back to a bot).
export function pickFiveFromLineup<T extends PickupSlot>(slots: T[]): Array<T | null> {
  const ordered = [
    ...slots.filter(s => s.role_type !== 'bench'),
    ...slots.filter(s => s.role_type === 'bench'),
  ];
  const byGroup: Record<GroupKey, T[]> = { GK: [], DEF: [], MID: [], ATK: [] };
  for (const s of ordered) {
    const g = groupFromPos(s.slot_position);
    if (g) byGroup[g].push(s);
  }
  const result: Array<T | null> = [null, null, null, null, null];
  const usedKeys = new Set<string>();
  const keyOf = (s: T) => (s.player_profile_id ?? s.lineup_slot_id ?? '') as string;
  for (let i = 0; i < COORD_GROUPS.length; i++) {
    const g = COORD_GROUPS[i];
    const cand = byGroup[g].find(s => !usedKeys.has(keyOf(s)));
    if (cand) { result[i] = cand; usedKeys.add(keyOf(cand)); }
  }
  // Backfill any empty slots with nearest-group leftovers so we always
  // try to return 5 real slots if the lineup has at least 5 players.
  for (let i = 0; i < result.length; i++) {
    if (result[i] != null) continue;
    const targetGroup = COORD_GROUPS[i];
    const targetIdx = GROUP_ORDER.indexOf(targetGroup);
    const sorted = [...GROUP_ORDER]
      .map(g => ({ g, d: Math.abs(GROUP_ORDER.indexOf(g) - targetIdx) }))
      .sort((a, b) => a.d - b.d);
    for (const { g } of sorted) {
      const cand = byGroup[g].find(s => !usedKeys.has(keyOf(s)));
      if (cand) { result[i] = cand; usedKeys.add(keyOf(cand)); break; }
    }
  }
  return result;
}

// Put a human player into the 5-slot array by their role group, bumping
// out whoever is currently holding the matching group slot. If the human
// is already in the array, returns it untouched.
export function insertHumanByGroup<T extends PickupSlot>(
  picks: Array<T | null>,
  human: T,
): Array<T | null> {
  if (!human.player_profile_id) return picks;
  const already = picks.some(p => p?.player_profile_id === human.player_profile_id);
  if (already) return picks;
  const humanGroup = groupFromPos(human.slot_position);
  if (!humanGroup) return picks;

  const next = [...picks];
  const sameGroupIdx = next.findIndex((_, i) => COORD_GROUPS[i] === humanGroup);
  if (sameGroupIdx >= 0) { next[sameGroupIdx] = human; return next; }

  const humanIdx = GROUP_ORDER.indexOf(humanGroup);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < COORD_GROUPS.length; i++) {
    const d = Math.abs(GROUP_ORDER.indexOf(COORD_GROUPS[i]) - humanIdx);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx >= 0) next[bestIdx] = human;
  return next;
}

// Resolve the field coordinate for a given pickup-slot index, mirroring
// on X for the away side.
export function coordForPickupIndex(index: number, isHome: boolean): { x: number; y: number } {
  const c = FIVE_V_FIVE_COORDS[index];
  if (!c) return { x: isHome ? 30 : 70, y: 50 };
  return { x: isHome ? c.x : 100 - c.x, y: c.y };
}
