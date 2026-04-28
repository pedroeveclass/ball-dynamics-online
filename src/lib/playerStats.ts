// Position → extras mapping for CareerStatsBlock. Common stats (Partidas /
// Gols / Assistências / Cartões) always render; the extras block adds
// position-specific metrics.

import i18n from '@/i18n';

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

// PT fallbacks — used only when i18n hasn't initialised yet. Real labels
// resolve through `career_stats:extras.<key>` so PT/EN follow the active
// language. Prefer using `useTranslation('career_stats')` directly in new
// components; this Proxy is kept for backward compatibility.
const EXTRA_FALLBACK_PT: Record<PositionExtra, string> = {
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

/** @deprecated Prefer `useTranslation('career_stats')` and `t('extras.<key>')`. */
export const EXTRA_LABELS: Record<PositionExtra, string> = new Proxy({} as Record<PositionExtra, string>, {
  get(_t, prop: string) {
    if (typeof prop !== 'string') return undefined;
    const v = i18n.t(`career_stats:extras.${prop}`, { defaultValue: '' });
    return v || EXTRA_FALLBACK_PT[prop as PositionExtra] || prop;
  },
});

export function extrasForPosition(position: string | null | undefined): PositionExtra[] {
  if (!position) return [];
  const clean = position.replace(/[0-9]/g, '').toUpperCase();
  return POSITION_EXTRAS[clean] ?? [];
}
