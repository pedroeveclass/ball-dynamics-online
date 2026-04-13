// Position translation: EN (database) → PT-BR (display)
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

// Translate a position code to Portuguese
export function positionToPT(pos: string | null | undefined): string {
  if (!pos) return '?';
  const clean = pos.replace(/[0-9]/g, '').toUpperCase();
  return POSITION_PT[clean] || clean;
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
