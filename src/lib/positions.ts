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
