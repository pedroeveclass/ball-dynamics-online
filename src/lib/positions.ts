import i18n from '@/i18n';

// Position translation: EN (database code) → PT-BR (legacy direct map)
// Kept as a compatibility shim. Prefer `positionLabel(pos)` which reads
// the active i18n language ('pt' | 'en') and resolves via positions.json.
export const POSITION_PT: Record<string, string> = {
  GK: 'GOL',
  CB: 'ZAG',
  LB: 'LE',
  RB: 'LD',
  DM: 'VOL',
  CDM: 'VOL',
  CM: 'MC',
  CAM: 'MEI',
  LM: 'ME',
  RM: 'MD',
  LW: 'PE',
  RW: 'PD',
  ST: 'ATA',
  CF: 'SA',
  LWB: 'ALE',
  RWB: 'ALD',
};

function cleanPos(pos: string | null | undefined): string {
  if (!pos) return '';
  return pos.replace(/[0-9]/g, '').toUpperCase();
}

// Resolve a position code to its short label in the active language.
// Falls back to the EN code if the lookup misses (defensive).
export function positionLabel(pos: string | null | undefined, variant: 'short' | 'long' = 'short'): string {
  const clean = cleanPos(pos);
  if (!clean) return '?';
  const key = `positions:${variant}.${clean}`;
  const translated = i18n.t(key, { defaultValue: clean });
  return translated || clean;
}

// Legacy: kept so existing imports keep working. Always returns the
// active-language short label (matches the function's prior behavior
// when only PT existed).
export function positionToPT(pos: string | null | undefined): string {
  return positionLabel(pos, 'short');
}

// Reverse: PT → EN (for onboarding etc.)
export const POSITION_EN: Record<string, string> = Object.fromEntries(
  Object.entries(POSITION_PT).map(([en, pt]) => [pt, en])
);

// Canonical squad listing order: GK → CB → laterais → volantes → MC → ME/MD → MEI → atacantes
const POSITION_ORDER: Record<string, number> = {
  GK: 1,
  CB: 2,
  LB: 3, RB: 3, LWB: 3, RWB: 3,
  DM: 4, CDM: 4,
  CM: 5,
  LM: 6, RM: 6,
  CAM: 7,
  ST: 8, CF: 8, LW: 8, RW: 8,
};

export function positionSortRank(pos: string | null | undefined): number {
  if (!pos) return 99;
  const clean = pos.replace(/[0-9]/g, '').toUpperCase();
  return POSITION_ORDER[clean] ?? 99;
}

// Sort a player list in canonical squad order; within the same position group, highest overall first.
export function sortPlayersByPosition<T extends { primary_position?: string | null; overall?: number | null }>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    const rankDiff = positionSortRank(a.primary_position) - positionSortRank(b.primary_position);
    if (rankDiff !== 0) return rankDiff;
    return (b.overall ?? 0) - (a.overall ?? 0);
  });
}

// ── Positional penalty: players out of position get an attribute multiplier ──
// Groups: 0=GK, 1=DEF, 2=MID, 3=ATK. Penalty scales with distance between groups.
const POSITION_GROUP: Record<string, 0 | 1 | 2 | 3> = {
  GK: 0,
  CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1,
  DM: 2, CDM: 2, CM: 2, CAM: 2, LM: 2, RM: 2,
  LW: 3, RW: 3, ST: 3, CF: 3,
};

function normalizePos(pos: string | null | undefined): string {
  if (!pos) return '';
  return pos.replace(/^BENCH_?/i, '').replace(/[0-9]/g, '').toUpperCase();
}

export function positionGroup(pos: string | null | undefined): number {
  return POSITION_GROUP[normalizePos(pos)] ?? -1;
}

// Penalty percent (0, 5, 10, 15, 20) when a player whose natural position is
// `primary` (or matches `secondary`) is fielded at `fielded`.
// Rules: same position OR matches secondary → 0%. Same group, different sub-pos → 5%.
// 1 group apart → 10%, 2 apart → 15%, 3 apart (GK ↔ ATK) → 20%.
export function positionalPenaltyPercent(
  fielded: string | null | undefined,
  primary: string | null | undefined,
  secondary: string | null | undefined,
): number {
  const f = normalizePos(fielded);
  const p = normalizePos(primary);
  const s = normalizePos(secondary);
  if (!f || !p) return 0;
  if (f === p) return 0;
  if (s && f === s) return 0;
  const fg = POSITION_GROUP[f];
  const pg = POSITION_GROUP[p];
  if (fg == null || pg == null) return 0;
  const dist = Math.abs(fg - pg);
  if (dist === 0) return 5;
  if (dist === 1) return 10;
  if (dist === 2) return 15;
  return 20;
}

export function positionalMultiplier(
  fielded: string | null | undefined,
  primary: string | null | undefined,
  secondary: string | null | undefined,
): number {
  return 1 - positionalPenaltyPercent(fielded, primary, secondary) / 100;
}
