// Position → extras mapping for CareerStatsBlock. Common stats (Partidas /
// Gols / Assistências / Cartões) always render; the extras block adds
// position-specific metrics.

export type PositionExtra =
  | 'clean_sheets'
  | 'goals_conceded'
  | 'gk_saves'
  | 'gk_penalties_saved'
  | 'tackles'
  | 'interceptions'
  | 'passes_completed'
  | 'pass_accuracy'
  | 'big_chances_created'
  | 'shots'
  | 'shots_on_target'
  | 'shot_accuracy'
  | 'offsides';

export const POSITION_EXTRAS: Record<string, PositionExtra[]> = {
  GK: ['clean_sheets', 'goals_conceded', 'gk_saves', 'gk_penalties_saved'],
  CB: ['clean_sheets', 'tackles', 'interceptions'],
  LB: ['clean_sheets', 'tackles', 'interceptions'],
  RB: ['clean_sheets', 'tackles', 'interceptions'],
  LWB: ['clean_sheets', 'tackles', 'interceptions'],
  RWB: ['clean_sheets', 'tackles', 'interceptions'],
  CDM: ['passes_completed', 'pass_accuracy', 'big_chances_created'],
  CM: ['passes_completed', 'pass_accuracy', 'big_chances_created'],
  CAM: ['passes_completed', 'pass_accuracy', 'big_chances_created'],
  LM: ['passes_completed', 'pass_accuracy', 'big_chances_created'],
  RM: ['passes_completed', 'pass_accuracy', 'big_chances_created'],
  LW: ['shots', 'shots_on_target', 'shot_accuracy', 'offsides'],
  RW: ['shots', 'shots_on_target', 'shot_accuracy', 'offsides'],
  CF: ['shots', 'shots_on_target', 'shot_accuracy', 'offsides'],
  ST: ['shots', 'shots_on_target', 'shot_accuracy', 'offsides'],
};

export const EXTRA_LABELS: Record<PositionExtra, string> = {
  clean_sheets: 'Clean Sheets',
  goals_conceded: 'Gols Sofridos',
  gk_saves: 'Defesas',
  gk_penalties_saved: 'Pênaltis Defendidos',
  tackles: 'Desarmes',
  interceptions: 'Interceptações',
  passes_completed: 'Passes Completos',
  pass_accuracy: 'Acerto de Passe',
  big_chances_created: 'Grandes Chances Criadas',
  shots: 'Chutes',
  shots_on_target: 'Chutes no Gol',
  shot_accuracy: 'Acerto de Chute',
  offsides: 'Impedimentos',
};

export function extrasForPosition(position: string | null | undefined): PositionExtra[] {
  if (!position) return [];
  const clean = position.replace(/[0-9]/g, '').toUpperCase();
  return POSITION_EXTRAS[clean] ?? [];
}
