// Slot definitions for Jogos de Várzea (pickup matches).
//
// Shared between the client (lobby UI + create modal) and the Deno
// scheduler that materializes participants at kickoff. Because the
// scheduler can't import from src/, coords are duplicated there —
// keep both in sync when editing this file.
//
// Coord convention: home side in percent (0–100). Away side mirrors on X.

export type PickupFormat = '5v5' | '11v11';

export type PickupSlotDef = {
  slot_id: string;
  label: string;
  group: 'GK' | 'DEF' | 'MID' | 'ATK';
  x: number;
  y: number;
};

export const PICKUP_SLOTS: Record<PickupFormat, PickupSlotDef[]> = {
  '5v5': [
    { slot_id: 'GK',   label: 'GOL',  group: 'GK',  x: 5,  y: 50 },
    { slot_id: 'DEF1', label: 'ZAG',  group: 'DEF', x: 25, y: 30 },
    { slot_id: 'DEF2', label: 'ZAG',  group: 'DEF', x: 25, y: 70 },
    { slot_id: 'MC',   label: 'MEIA', group: 'MID', x: 40, y: 50 },
    { slot_id: 'ATA',  label: 'ATA',  group: 'ATK', x: 42, y: 50 },
  ],
  '11v11': [
    { slot_id: 'GK',  label: 'GOL', group: 'GK',  x: 5,  y: 50 },
    { slot_id: 'LB',  label: 'LE',  group: 'DEF', x: 20, y: 15 },
    { slot_id: 'CB1', label: 'ZAG', group: 'DEF', x: 18, y: 38 },
    { slot_id: 'CB2', label: 'ZAG', group: 'DEF', x: 18, y: 62 },
    { slot_id: 'RB',  label: 'LD',  group: 'DEF', x: 20, y: 85 },
    { slot_id: 'LM',  label: 'ME',  group: 'MID', x: 40, y: 20 },
    { slot_id: 'CM1', label: 'MC',  group: 'MID', x: 37, y: 42 },
    { slot_id: 'CM2', label: 'MC',  group: 'MID', x: 37, y: 58 },
    { slot_id: 'RM',  label: 'MD',  group: 'MID', x: 40, y: 80 },
    { slot_id: 'ST1', label: 'ATA', group: 'ATK', x: 55, y: 40 },
    { slot_id: 'ST2', label: 'ATA', group: 'ATK', x: 55, y: 60 },
  ],
};

export function pickupSlotCoord(format: PickupFormat, slotId: string, isHome: boolean): { x: number; y: number } | null {
  const def = PICKUP_SLOTS[format].find(s => s.slot_id === slotId);
  if (!def) return null;
  return { x: isHome ? def.x : 100 - def.x, y: def.y };
}

export function pickupSlotLabel(format: PickupFormat, slotId: string): string {
  return PICKUP_SLOTS[format].find(s => s.slot_id === slotId)?.label ?? slotId;
}

export function totalSlotsPerSide(format: PickupFormat): number {
  return PICKUP_SLOTS[format].length;
}
