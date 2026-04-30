// Attribute generation based on position + body type + height
import type { TablesInsert } from '@/integrations/supabase/types';

type AttrKeys = Omit<TablesInsert<'player_attributes'>, 'id' | 'player_profile_id' | 'created_at' | 'updated_at'>;

export const FIELD_ATTRS = [
  'velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina',
  'drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto',
  'visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem',
  'posicionamento_ofensivo','posicionamento_defensivo',
  'cabeceio','acuracia_chute','forca_chute',
] as const;

export const GK_ATTRS = [
  'reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um',
  'distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area',
] as const;

export const ALL_ATTRS = [...FIELD_ATTRS, ...GK_ATTRS] as const;

// ── Attribute Categories (UI grouping) ──
// Canonical category → attribute-keys map used by dashboards, cards, and the
// onboarding point-distribution screen. Keep in sync with FIELD_ATTRS/GK_ATTRS.
export const ATTRIBUTE_CATEGORIES: Record<string, string[]> = {
  'Físico': ['velocidade', 'aceleracao', 'agilidade', 'forca', 'equilibrio', 'resistencia', 'pulo', 'stamina'],
  'Técnico': ['drible', 'controle_bola', 'marcacao', 'desarme', 'um_toque', 'curva', 'passe_baixo', 'passe_alto'],
  'Mental': ['visao_jogo', 'tomada_decisao', 'antecipacao', 'trabalho_equipe', 'coragem', 'posicionamento_ofensivo', 'posicionamento_defensivo'],
  'Chute': ['cabeceio', 'acuracia_chute', 'forca_chute'],
  'Goleiro': ['reflexo', 'posicionamento_gol', 'defesa_aerea', 'pegada', 'saida_gol', 'um_contra_um', 'distribuicao_curta', 'distribuicao_longa', 'tempo_reacao', 'comando_area'],
};

// ── Field Player Body Types ──
export const BODY_TYPES = [
  { value: 'All Around', label: 'All Around', description: 'Equilibrado em todos os atributos. Um jogador versátil.' },
  { value: 'Condutor', label: 'Condutor', description: 'Mais controle de bola, passe e técnica refinada.' },
  { value: 'Chutador', label: 'Chutador', description: 'Potencializa atributos de chute e finalização.' },
  { value: 'Velocista', label: 'Velocista', description: 'Mais velocidade, aceleração e energia.' },
  { value: 'Torre', label: 'Torre', description: 'Mais alto, melhor em salto, cabeceio e força.' },
  { value: 'Cão de Guarda', label: 'Cão de Guarda', description: 'Mais marcação, desarme e posicionamento defensivo.' },
] as const;

// ── GK-Specific Body Types ──
export const GK_BODY_TYPES = [
  { value: 'Goleiro Completo', label: 'Goleiro Completo', description: 'Equilibrado em todos os atributos de goleiro. Versátil e confiável.' },
  { value: 'Goleiro Felino', label: 'Goleiro Felino', description: 'Ágil, reflexos rápidos, bom em saídas e duelos 1v1.' },
  { value: 'Goleiro Muralha', label: 'Goleiro Muralha', description: 'Alto, dominante na área, forte em cruzamentos e defesa aérea.' },
] as const;

const bodyTypeBoosts: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
  // Field player body types
  'All Around': {
    velocidade: 3, forca: 3, drible: 3, passe_baixo: 3, acuracia_chute: 3, cabeceio: 3,
    marcacao: 3, visao_jogo: 3, resistencia: 3, controle_bola: 3,
  },
  'Condutor': {
    controle_bola: 6, passe_baixo: 6, passe_alto: 5, drible: 5, um_toque: 5,
    visao_jogo: 4, curva: 4, tomada_decisao: 3,
  },
  'Chutador': {
    acuracia_chute: 7, forca_chute: 6, curva: 4, posicionamento_ofensivo: 4,
    antecipacao: 3, cabeceio: 3,
  },
  'Velocista': {
    velocidade: 7, aceleracao: 6, agilidade: 5, stamina: 5, resistencia: 4,
    equilibrio: 3, drible: 3,
  },
  'Torre': {
    cabeceio: 7, pulo: 6, forca: 6, equilibrio: 4, posicionamento_defensivo: 3,
    posicionamento_ofensivo: 3, defesa_aerea: 3,
  },
  'Cão de Guarda': {
    marcacao: 7, desarme: 6, posicionamento_defensivo: 6, coragem: 5,
    antecipacao: 4, forca: 4, trabalho_equipe: 3,
  },
  // GK body types
  'Goleiro Completo': {
    reflexo: 4, posicionamento_gol: 4, defesa_aerea: 3, pegada: 3, saida_gol: 3,
    um_contra_um: 3, tempo_reacao: 3, comando_area: 3, distribuicao_curta: 3, distribuicao_longa: 3,
  },
  'Goleiro Felino': {
    reflexo: 7, um_contra_um: 6, saida_gol: 5, agilidade: 5, tempo_reacao: 4,
    aceleracao: 3, velocidade: 2,
  },
  'Goleiro Muralha': {
    defesa_aerea: 7, comando_area: 6, pegada: 5, pulo: 5, forca: 4,
    posicionamento_gol: 3, cabeceio: 2,
  },
};

// ── Height Options ──
export const HEIGHT_OPTIONS = [
  { value: 'Muito Baixo', label: 'Muito Baixo (≤168cm)', description: 'Mais rápido e ágil, mas perde em cabeceio, pulo e força.' },
  { value: 'Baixo', label: 'Baixo (169-174cm)', description: 'Ligeiramente mais veloz e ágil, pequena desvantagem aérea.' },
  { value: 'Médio', label: 'Médio (175-180cm)', description: 'Equilibrado, sem bônus ou penalidades.' },
  { value: 'Alto', label: 'Alto (181-187cm)', description: 'Melhor no jogo aéreo e força, um pouco menos ágil.' },
  { value: 'Muito Alto', label: 'Muito Alto (≥188cm)', description: 'Dominante no ar e forte, mas perde velocidade e agilidade.' },
] as const;

const heightBoosts: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
  'Muito Baixo': { velocidade: 6, agilidade: 5, aceleracao: 4, cabeceio: -5, pulo: -4, forca: -3 },
  'Baixo':       { velocidade: 3, agilidade: 3, cabeceio: -2, pulo: -2 },
  'Médio':       {},
  'Alto':        { cabeceio: 3, pulo: 3, forca: 2, velocidade: -2, agilidade: -2 },
  'Muito Alto':  { cabeceio: 6, pulo: 5, forca: 4, velocidade: -5, agilidade: -4, aceleracao: -3 },
};

// Position base profiles
const positionProfiles: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
  'GK': { reflexo: 15, posicionamento_gol: 12, pegada: 10, defesa_aerea: 10, saida_gol: 8, tempo_reacao: 10, comando_area: 8, velocidade: -10, drible: -15, acuracia_chute: -15 },
  'CB': { marcacao: 8, desarme: 8, forca: 6, cabeceio: 6, posicionamento_defensivo: 8, coragem: 6, drible: -5, posicionamento_ofensivo: -5 },
  'LB': { velocidade: 6, aceleracao: 6, resistencia: 6, posicionamento_defensivo: 4, marcacao: 4 },
  'RB': { velocidade: 6, aceleracao: 6, resistencia: 6, posicionamento_defensivo: 4, marcacao: 4 },
  'LWB': { velocidade: 7, aceleracao: 6, resistencia: 7, stamina: 5, posicionamento_defensivo: 3, marcacao: 3, drible: 3, posicionamento_ofensivo: 3 },
  'RWB': { velocidade: 7, aceleracao: 6, resistencia: 7, stamina: 5, posicionamento_defensivo: 3, marcacao: 3, drible: 3, posicionamento_ofensivo: 3 },
  'DM': { marcacao: 6, desarme: 8, posicionamento_defensivo: 8, antecipacao: 6, trabalho_equipe: 4 },
  'CDM': { marcacao: 6, desarme: 8, posicionamento_defensivo: 8, antecipacao: 6, trabalho_equipe: 4 },
  'CM': { passe_baixo: 6, visao_jogo: 4, tomada_decisao: 4, trabalho_equipe: 4, resistencia: 4 },
  'LM': { velocidade: 5, resistencia: 6, passe_baixo: 5, drible: 5, posicionamento_ofensivo: 3, tomada_decisao: 3 },
  'RM': { velocidade: 5, resistencia: 6, passe_baixo: 5, drible: 5, posicionamento_ofensivo: 3, tomada_decisao: 3 },
  'CAM': { visao_jogo: 8, passe_baixo: 6, drible: 6, um_toque: 6, posicionamento_ofensivo: 6 },
  'LW': { velocidade: 8, aceleracao: 6, drible: 8, agilidade: 6, posicionamento_ofensivo: 4 },
  'RW': { velocidade: 8, aceleracao: 6, drible: 8, agilidade: 6, posicionamento_ofensivo: 4 },
  'ST': { acuracia_chute: 8, forca_chute: 6, posicionamento_ofensivo: 8, cabeceio: 4, antecipacao: 4 },
  'CF': { acuracia_chute: 6, forca_chute: 4, posicionamento_ofensivo: 8, passe_baixo: 4, drible: 4, um_toque: 4, visao_jogo: 3 },
};

// Onboarding base attributes are computed server-side via the
// `get_onboarding_preview` RPC (see 20260421060000 migration). Do not
// reintroduce a client-side generator — that re-creates the drift the
// 2026-04-13 and 2026-04-21 migrations existed to kill.

export function calculateOverall(attrs: Record<string, number>, position: string): number {
  const isGK = position === 'GK';

  if (isGK) {
    const gkKeys = ['reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um','tempo_reacao','comando_area'] as const;
    const sum = gkKeys.reduce((acc, k) => acc + (attrs[k] || 20), 0);
    return Math.round(sum / gkKeys.length);
  }

  const weights: Record<string, number> = {
    velocidade: 1, aceleracao: 1, agilidade: 1, forca: 0.8, equilibrio: 0.7,
    resistencia: 0.8, pulo: 0.5, stamina: 0.8,
    drible: 1, controle_bola: 1, marcacao: 0.8, desarme: 0.8,
    um_toque: 0.8, curva: 0.6, passe_baixo: 1, passe_alto: 0.8,
    visao_jogo: 1, tomada_decisao: 0.9, antecipacao: 0.8, trabalho_equipe: 0.7,
    coragem: 0.6, posicionamento_ofensivo: 0.8, posicionamento_defensivo: 0.8,
    cabeceio: 0.5, acuracia_chute: 0.8, forca_chute: 0.7,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    weightedSum += (attrs[key] || 40) * w;
    totalWeight += w;
  }

  return Math.round(weightedSum / totalWeight);
}

// Training growth rate multiplier based on age
export function getTrainingGrowthRate(age: number): number {
  if (age <= 20) return 1.5;
  if (age <= 24) return 1.2;
  if (age <= 29) return 1.0;
  if (age <= 33) return 0.7;
  if (age <= 36) return 0.4;
  return 0.2;
}

// Global pace factor applied at the end of every gain calculation.
// Mirrors `v_pace_factor` in train_attribute / auto_train_attribute.
export const TRAINING_PACE_FACTOR = 0.40;

// ── Attribute Quality Tiers ──
export interface AttributeTier {
  name: string;
  label: string;
  color: string; // tailwind text color class
  bgColor: string; // tailwind bg color class
  min: number;
  max: number;
  trainingMultiplier: number;
}

export const ATTRIBUTE_TIERS: AttributeTier[] = [
  { name: 'star_quality', label: 'Qualidade Estrela ⭐', color: 'text-yellow-400', bgColor: 'bg-yellow-400/15', min: 95, max: 99, trainingMultiplier: 0.06 },
  { name: 'supremo',      label: 'Supremo',             color: 'text-purple-400', bgColor: 'bg-purple-400/15', min: 90, max: 94.99, trainingMultiplier: 0.12 },
  { name: 'excepcional',  label: 'Excepcional',         color: 'text-blue-400',   bgColor: 'bg-blue-400/15',   min: 85, max: 89.99, trainingMultiplier: 0.22 },
  { name: 'excelente',    label: 'Excelente',           color: 'text-cyan-400',   bgColor: 'bg-cyan-400/15',   min: 80, max: 84.99, trainingMultiplier: 0.35 },
  { name: 'bom',          label: 'Bom',                 color: 'text-emerald-400', bgColor: 'bg-emerald-400/15', min: 70, max: 79.99, trainingMultiplier: 0.5 },
  { name: 'razoavel',     label: 'Razoável',            color: 'text-lime-400',   bgColor: 'bg-lime-400/15',   min: 60, max: 69.99, trainingMultiplier: 0.75 },
  { name: 'mediano',      label: 'Mediano',             color: 'text-amber-400',  bgColor: 'bg-amber-400/15',  min: 50, max: 59.99, trainingMultiplier: 1.0 },
  { name: 'fraco',        label: 'Fraco',               color: 'text-orange-400', bgColor: 'bg-orange-400/15', min: 40, max: 49.99, trainingMultiplier: 1.3 },
  { name: 'ruim',         label: 'Ruim',                color: 'text-red-400',    bgColor: 'bg-red-400/15',    min: 30, max: 39.99, trainingMultiplier: 1.6 },
  { name: 'pessimo',      label: 'Péssimo',             color: 'text-red-600',    bgColor: 'bg-red-600/15',    min: 10, max: 29.99, trainingMultiplier: 2.0 },
];

export function getAttributeTier(value: number): AttributeTier {
  for (const tier of ATTRIBUTE_TIERS) {
    if (value >= tier.min) return tier;
  }
  return ATTRIBUTE_TIERS[ATTRIBUTE_TIERS.length - 1];
}

// Localized label for an AttributeTier — reads through i18next.
// Use this in JSX instead of `tier.label` when you want PT/EN to follow
// the active language.
export function tierLabel(tier: AttributeTier | { name: string; label?: string } | null | undefined): string {
  if (!tier) return '';
  const translated = i18n.t(`attributes:tiers.${tier.name}`, { defaultValue: '' });
  return translated || tier.label || tier.name;
}

export function getTrainingTierMultiplier(value: number): number {
  return getAttributeTier(value).trainingMultiplier;
}

// ── Coach Type Training Bonuses ──
export const COACH_BONUS_ATTRS: Record<string, string[]> = {
  defensive: ['desarme', 'marcacao', 'posicionamento_defensivo', 'cabeceio', 'coragem', 'antecipacao'],
  offensive: ['acuracia_chute', 'forca_chute', 'posicionamento_ofensivo', 'drible', 'curva', 'um_toque'],
  technical: ['passe_baixo', 'passe_alto', 'controle_bola', 'visao_jogo', 'tomada_decisao', 'distribuicao_curta'],
  all_around: [], // applies to all
  complete: [], // alias for all_around
};

export const COACH_BONUS_RATE: Record<string, number> = {
  defensive: 0.15,
  offensive: 0.15,
  technical: 0.15,
  all_around: 0.10,
  complete: 0.10,
};

// Fallback labels (PT) — used only if the i18n bundle is missing the
// `attributes:coach_types.*` keys for some reason. Prefer `coachTypeLabel()`
// in JSX so PT/EN follow the active language.
const COACH_TYPE_LABELS_FALLBACK: Record<string, string> = {
  defensive: 'Defensivo',
  offensive: 'Ofensivo',
  technical: 'Técnico',
  all_around: 'Completo',
  complete: 'Completo',
};

// Localized coach-type label. Reads through i18next; falls back to PT.
export function coachTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  const v = i18n.t(`attributes:coach_types.${type}`, { defaultValue: '' });
  return v || COACH_TYPE_LABELS_FALLBACK[type] || type;
}

// Read-only Proxy keeping the legacy `COACH_TYPE_LABELS[type]` pattern
// working while resolving labels through i18next on every access. Existing
// consumers (PlayerAttributesPage, PlayerClubPage) keep working without
// any code change.
export const COACH_TYPE_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    if (typeof prop !== 'string') return undefined;
    return coachTypeLabel(prop);
  },
  has(_target, prop) {
    return typeof prop === 'string' && prop in COACH_TYPE_LABELS_FALLBACK;
  },
  ownKeys() {
    return Object.keys(COACH_TYPE_LABELS_FALLBACK);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === 'string' && prop in COACH_TYPE_LABELS_FALLBACK) {
      return { configurable: true, enumerable: true, writable: false, value: coachTypeLabel(prop) };
    }
    return undefined;
  },
});

// ── Training Center Level Bonuses ──
export const TRAINING_CENTER_BONUS: Record<number, number> = {
  0: 0,
  1: 0.05,
  2: 0.10,
  3: 0.18,
  4: 0.28,
  5: 0.40,
};

export function getCoachBonus(coachType: string, attrKey: string): number {
  const type = coachType || 'all_around';
  const rate = COACH_BONUS_RATE[type] || 0.10;
  const boostedAttrs = COACH_BONUS_ATTRS[type];
  if (!boostedAttrs) return 0.10; // fallback to all_around
  // all_around/complete apply to all attributes
  if (boostedAttrs.length === 0) return rate;
  return boostedAttrs.includes(attrKey) ? rate : 0;
}

export function getTrainingCenterBonus(level: number): number {
  return TRAINING_CENTER_BONUS[level] ?? 0;
}

// ══════════════════════════════════════════════════════════════
// Attribute caps by archetype + height.
//
// A "hard" cap (80) means the opposition is strong — a Torre will
// never be fast. "soft" (88) is a gentler ceiling — still strong but
// not world-class. Default (99) is no restriction.
//
// Archetype cap and height cap stack: the smaller number wins.
// Existing players past the cap are grandfathered (growth = 0, no
// rebate).
// ══════════════════════════════════════════════════════════════

export const CAP_HARD = 80;
export const CAP_SOFT = 88;
export const CAP_DEFAULT = 99;
export const CAP_GK_FIELD = 70; // Every GK archetype is hard-capped at 70 on outfield attrs

// ── Position-layer tiers ──
// CORE        = 99 (no cap)            — missing entry in POSITION_CAPS
// SUPPORTING  = 88 (reuses CAP_SOFT)   — position is OK at this, not elite
// IRRELEVANT  = 75 (CAP_POS_HARD)      — position doesn't need this
// WALL        = 70 (CAP_POS_WALL)      — GK on outfield attrs (same numeric
//                                        as GK archetype blanket by design)
//
// Resolution: an archetype's EXPLICIT tier on an attribute REPLACES both
// the GK blanket AND the position cap (same treatment introduced by the
// felino-agilidade fix for the GK blanket). Only when archetype is silent
// do the GK blanket and position cap bind. Height always stacks via min.
export const CAP_POS_HARD = 75;
export const CAP_POS_WALL = 70;

type CapTier = 'hard' | 'soft';

const ARCHETYPE_CAPS: Record<string, Partial<Record<string, CapTier>>> = {
  'All Around': {
    velocidade: 'soft', aceleracao: 'soft', agilidade: 'soft', forca: 'soft',
    equilibrio: 'soft', resistencia: 'soft', pulo: 'soft', stamina: 'soft',
    drible: 'soft', controle_bola: 'soft', marcacao: 'soft', desarme: 'soft',
    um_toque: 'soft', curva: 'soft', passe_baixo: 'soft', passe_alto: 'soft',
    visao_jogo: 'soft', tomada_decisao: 'soft', antecipacao: 'soft',
    trabalho_equipe: 'soft', coragem: 'soft',
    posicionamento_ofensivo: 'soft', posicionamento_defensivo: 'soft',
    cabeceio: 'soft', acuracia_chute: 'soft', forca_chute: 'soft',
  },
  'Condutor': {
    forca: 'hard', marcacao: 'hard', desarme: 'hard',
    cabeceio: 'soft', pulo: 'soft',
  },
  'Chutador': {
    marcacao: 'hard', desarme: 'hard', posicionamento_defensivo: 'hard',
    trabalho_equipe: 'soft', passe_alto: 'soft', visao_jogo: 'soft',
  },
  'Velocista': {
    forca: 'hard', cabeceio: 'hard', pulo: 'hard',
    forca_chute: 'soft', marcacao: 'soft',
  },
  'Torre': {
    velocidade: 'hard', aceleracao: 'hard', agilidade: 'hard',
    drible: 'soft', controle_bola: 'soft',
  },
  'Cão de Guarda': {
    um_toque: 'hard', curva: 'hard', passe_alto: 'hard',
    acuracia_chute: 'soft', controle_bola: 'soft', drible: 'soft',
  },
};

// Outfield attrs that every GK archetype is hard-capped at 70 on.
// (GKs don't need to dribble or shoot at world-class levels.)
const GK_CAPPED_FIELD_ATTRS = new Set<string>([
  'velocidade', 'aceleracao', 'agilidade',
  'drible', 'controle_bola', 'marcacao', 'desarme',
  'um_toque', 'curva', 'passe_baixo', 'passe_alto',
  'posicionamento_ofensivo', 'posicionamento_defensivo',
  'cabeceio', 'acuracia_chute', 'forca_chute',
]);

// Per-GK-archetype restrictions on the GK-specific attrs.
const GK_ARCHETYPE_CAPS: Record<string, Partial<Record<string, CapTier>>> = {
  'Goleiro Completo': {},
  'Goleiro Felino': {
    defesa_aerea: 'hard', comando_area: 'hard',
    pegada: 'soft', agilidade: 'soft',
  },
  'Goleiro Muralha': {
    reflexo: 'soft', um_contra_um: 'soft', tempo_reacao: 'soft',
  },
};

const HEIGHT_CAPS: Record<string, Partial<Record<string, CapTier>>> = {
  'Muito Baixo': {
    cabeceio: 'hard', pulo: 'hard', forca: 'hard',
    defesa_aerea: 'soft',
  },
  'Baixo': {
    cabeceio: 'soft', pulo: 'soft',
  },
  'Médio': {},
  'Alto': {
    velocidade: 'soft', agilidade: 'soft',
  },
  'Muito Alto': {
    velocidade: 'hard', aceleracao: 'hard', agilidade: 'hard',
    equilibrio: 'soft',
  },
};

function tierValue(t: CapTier | undefined | null): number {
  if (t === 'hard') return CAP_HARD;
  if (t === 'soft') return CAP_SOFT;
  return CAP_DEFAULT;
}

// ── Position-layer caps (matches SQL 20260420030000_caps_by_position.sql) ──
// Tiers use string tags so the TS fit scoring can check 'pos_hard' / 'pos_wall'
// directly. 88 (SUPPORTING) uses the existing 'soft' signal for fit purposes.
type PosCapTier = 'pos_soft' | 'pos_hard' | 'pos_wall';

export const POSITION_CAPS: Record<string, Partial<Record<string, PosCapTier>>> = {
  'GK': {
    // GKs: every outfield attr is WALL (65). GK-specific attrs stay CORE.
    velocidade: 'pos_wall', aceleracao: 'pos_wall', agilidade: 'pos_wall',
    drible: 'pos_wall', controle_bola: 'pos_wall', marcacao: 'pos_wall', desarme: 'pos_wall',
    um_toque: 'pos_wall', curva: 'pos_wall', passe_baixo: 'pos_wall', passe_alto: 'pos_wall',
    posicionamento_ofensivo: 'pos_wall', posicionamento_defensivo: 'pos_wall',
    cabeceio: 'pos_wall', acuracia_chute: 'pos_wall', forca_chute: 'pos_wall',
  },
  'CB': {
    // Offense → IRRELEVANT (75 / pos_hard)
    acuracia_chute: 'pos_hard', forca_chute: 'pos_hard',
    um_toque: 'pos_hard', curva: 'pos_hard',
    posicionamento_ofensivo: 'pos_hard', drible: 'pos_hard',
    // Playmaking → SUPPORTING (88 / pos_soft)
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'LB': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    um_toque: 'pos_soft', curva: 'pos_soft',
    posicionamento_ofensivo: 'pos_soft', drible: 'pos_soft',
    cabeceio: 'pos_soft',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'RB': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    um_toque: 'pos_soft', curva: 'pos_soft',
    posicionamento_ofensivo: 'pos_soft', drible: 'pos_soft',
    cabeceio: 'pos_soft',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'LWB': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    um_toque: 'pos_soft', curva: 'pos_soft',
    posicionamento_ofensivo: 'pos_soft', drible: 'pos_soft',
    marcacao: 'pos_soft', desarme: 'pos_soft',
    posicionamento_defensivo: 'pos_soft', coragem: 'pos_soft',
    antecipacao: 'pos_soft', cabeceio: 'pos_soft',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'RWB': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    um_toque: 'pos_soft', curva: 'pos_soft',
    posicionamento_ofensivo: 'pos_soft', drible: 'pos_soft',
    marcacao: 'pos_soft', desarme: 'pos_soft',
    posicionamento_defensivo: 'pos_soft', coragem: 'pos_soft',
    antecipacao: 'pos_soft', cabeceio: 'pos_soft',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'DM': {
    acuracia_chute: 'pos_hard', um_toque: 'pos_hard', curva: 'pos_hard',
    forca_chute: 'pos_soft',
    visao_jogo: 'pos_soft',
  },
  'CDM': {
    acuracia_chute: 'pos_hard', um_toque: 'pos_hard', curva: 'pos_hard',
    forca_chute: 'pos_soft',
    visao_jogo: 'pos_soft',
  },
  'CM': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    um_toque: 'pos_soft', curva: 'pos_soft',
    posicionamento_ofensivo: 'pos_soft', drible: 'pos_soft',
    marcacao: 'pos_soft', desarme: 'pos_soft',
    posicionamento_defensivo: 'pos_soft', coragem: 'pos_soft',
    antecipacao: 'pos_soft', cabeceio: 'pos_soft',
  },
  'LM': {
    acuracia_chute: 'pos_soft',
    marcacao: 'pos_soft', desarme: 'pos_soft',
    posicionamento_defensivo: 'pos_soft', coragem: 'pos_soft',
    antecipacao: 'pos_soft', cabeceio: 'pos_soft',
  },
  'RM': {
    acuracia_chute: 'pos_soft',
    marcacao: 'pos_soft', desarme: 'pos_soft',
    posicionamento_defensivo: 'pos_soft', coragem: 'pos_soft',
    antecipacao: 'pos_soft', cabeceio: 'pos_soft',
  },
  'CAM': {
    forca_chute: 'pos_soft',
    marcacao: 'pos_hard', desarme: 'pos_hard',
  },
  'LW': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    marcacao: 'pos_hard', desarme: 'pos_hard',
    posicionamento_defensivo: 'pos_hard',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'RW': {
    acuracia_chute: 'pos_soft', forca_chute: 'pos_soft',
    marcacao: 'pos_hard', desarme: 'pos_hard',
    posicionamento_defensivo: 'pos_hard',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'CF': {
    forca_chute: 'pos_soft',
    marcacao: 'pos_hard', desarme: 'pos_hard',
    posicionamento_defensivo: 'pos_hard', coragem: 'pos_hard',
    antecipacao: 'pos_hard', cabeceio: 'pos_hard',
    passe_baixo: 'pos_soft', passe_alto: 'pos_soft',
    visao_jogo: 'pos_soft', tomada_decisao: 'pos_soft',
    controle_bola: 'pos_soft',
  },
  'ST': {
    marcacao: 'pos_hard', desarme: 'pos_hard',
    posicionamento_defensivo: 'pos_hard', coragem: 'pos_hard',
    antecipacao: 'pos_hard', cabeceio: 'pos_hard',
    passe_alto: 'pos_hard', visao_jogo: 'pos_hard',
  },
};

function posCapValue(t: 'pos_soft' | 'pos_hard' | 'pos_wall' | undefined | null): number {
  if (t === 'pos_wall') return CAP_POS_WALL;
  if (t === 'pos_hard') return CAP_POS_HARD;
  if (t === 'pos_soft') return CAP_SOFT;
  return CAP_DEFAULT;
}

export type AttrCapReason = 'archetype' | 'gk_blanket' | 'position' | 'height';

export interface AttrCapResult {
  cap: number;
  reasons: AttrCapReason[];
}

// Public: computes the maximum value an attribute can reach for a given
// archetype + height + primary position.
//
// Resolution rules (mirrors SQL public.get_attribute_cap, 4-arg):
//   1. If the archetype defines an EXPLICIT tier for this attribute, that
//      tier REPLACES both the GK blanket cap AND the position cap (a Felino
//      with agilidade:'soft' resolves to 88, even though the GK blanket is
//      70 and the GK position cap is WALL 70). This lets archetype design
//      selectively lift the lower-layer caps.
//   2. Otherwise, GK blanket (70) applies to GK-field attrs, AND the position
//      cap (if any) also applies; the smaller of the two wins via min.
//   3. Height caps always stack via min on top of the result.
export function getAttrCap(
  archetype: string | null | undefined,
  height: string | null | undefined,
  position: string | null | undefined,
  attrKey: string,
): number {
  return getAttrCapWithReason(archetype, height, position, attrKey).cap;
}

export function getAttrCapWithReason(
  archetype: string | null | undefined,
  height: string | null | undefined,
  position: string | null | undefined,
  attrKey: string,
): AttrCapResult {
  const isGK = archetype?.startsWith('Goleiro');

  // Candidate caps per source (99 = no contribution).
  let archetypeCap: number | null = null;
  let gkBlanketCap: number | null = null;
  let positionCap: number | null = null;
  let heightCap: number | null = null;

  const archTier: CapTier | undefined = isGK
    ? (archetype ? GK_ARCHETYPE_CAPS[archetype]?.[attrKey] : undefined)
    : (archetype ? ARCHETYPE_CAPS[archetype]?.[attrKey] : undefined);

  if (archTier) {
    archetypeCap = tierValue(archTier);
  } else {
    // Archetype silent → both GK blanket and position cap can apply.
    if (isGK && GK_CAPPED_FIELD_ATTRS.has(attrKey)) {
      gkBlanketCap = CAP_GK_FIELD;
    }
    const posTier = position ? POSITION_CAPS[position]?.[attrKey] : undefined;
    if (posTier) {
      positionCap = posCapValue(posTier);
    }
  }

  const heightTier = height ? HEIGHT_CAPS[height]?.[attrKey] : undefined;
  if (heightTier) {
    heightCap = tierValue(heightTier);
  }

  // Combine. Archetype (when present) REPLACES gk_blanket + position.
  const preHeight = archetypeCap !== null
    ? archetypeCap
    : Math.min(gkBlanketCap ?? CAP_DEFAULT, positionCap ?? CAP_DEFAULT);
  const cap = Math.min(preHeight, heightCap ?? CAP_DEFAULT);

  // Report all sources that tie or undercut the final cap.
  const reasons: AttrCapReason[] = [];
  if (archetypeCap !== null && archetypeCap <= cap) reasons.push('archetype');
  if (gkBlanketCap !== null && gkBlanketCap <= cap) reasons.push('gk_blanket');
  if (positionCap !== null && positionCap <= cap) reasons.push('position');
  if (heightCap !== null && heightCap <= cap) reasons.push('height');

  return { cap, reasons };
}

// Positions
export const POSITIONS = [
  { value: 'GK', label: 'Goleiro', category: 'GK' },
  { value: 'CB', label: 'Zagueiro', category: 'DEF' },
  { value: 'LB', label: 'Lateral Esquerdo', category: 'DEF' },
  { value: 'RB', label: 'Lateral Direito', category: 'DEF' },
  { value: 'LWB', label: 'Ala Esquerdo', category: 'DEF' },
  { value: 'RWB', label: 'Ala Direito', category: 'DEF' },
  { value: 'DM', label: 'Volante', category: 'MID' },
  { value: 'CM', label: 'Meio-Campista', category: 'MID' },
  { value: 'LM', label: 'Meia Esquerda', category: 'MID' },
  { value: 'RM', label: 'Meia Direita', category: 'MID' },
  { value: 'CAM', label: 'Meia Ofensivo', category: 'MID' },
  { value: 'LW', label: 'Ponta Esquerda', category: 'FWD' },
  { value: 'RW', label: 'Ponta Direita', category: 'FWD' },
  { value: 'CF', label: 'Segundo Atacante', category: 'FWD' },
  { value: 'ST', label: 'Atacante', category: 'FWD' },
] as const;

// Attribute labels for display.
// `ATTR_LABELS` is kept as a legacy proxy so existing callers continue to
// work — but each lookup now resolves through i18next so PT/EN are honored
// automatically. The PT JSON values match the historical strings 1:1.
import i18n from '@/i18n';

const FALLBACK_ATTR_LABELS: Record<string, string> = {
  velocidade: 'Velocidade', aceleracao: 'Aceleração', agilidade: 'Agilidade',
  forca: 'Força', equilibrio: 'Equilíbrio', resistencia: 'Resistência',
  pulo: 'Pulo', stamina: 'Stamina',
  drible: 'Drible', controle_bola: 'Controle de Bola', marcacao: 'Marcação',
  desarme: 'Desarme', um_toque: 'Um Toque', curva: 'Curva',
  passe_baixo: 'Passe Baixo', passe_alto: 'Passe Alto',
  visao_jogo: 'Visão de Jogo', tomada_decisao: 'Tomada de Decisão',
  antecipacao: 'Antecipação', trabalho_equipe: 'Trabalho em Equipe',
  coragem: 'Coragem', posicionamento_ofensivo: 'Posic. Ofensivo',
  posicionamento_defensivo: 'Posic. Defensivo',
  cabeceio: 'Cabeceio', acuracia_chute: 'Acurácia do Chute', forca_chute: 'Força do Chute',
  reflexo: 'Reflexo', posicionamento_gol: 'Posicionamento', defesa_aerea: 'Defesa Aérea',
  pegada: 'Pegada', saida_gol: 'Saída do Gol', um_contra_um: 'Um Contra Um',
  distribuicao_curta: 'Distribuição Curta', distribuicao_longa: 'Distribuição Longa',
  tempo_reacao: 'Tempo de Reação', comando_area: 'Comando de Área',
};

export function attrLabel(key: string): string {
  if (!key) return '';
  const translated = i18n.t(`attributes:labels.${key}`, { defaultValue: '' });
  return translated || FALLBACK_ATTR_LABELS[key] || key;
}

// Short, in-game-effect description for an attribute. Reads through
// i18next so PT/EN follow the active language. Returns '' if missing.
export function attrDescription(key: string): string {
  if (!key) return '';
  return i18n.t(`attributes:descriptions.${key}`, { defaultValue: '' });
}

export function attrCategoryLabel(category: string): string {
  if (!category) return '';
  const translated = i18n.t(`attributes:categories.${category}`, { defaultValue: '' });
  return translated || category;
}

// Localized archetype name. Archetype values are stored in PT in the DB
// (e.g. 'Velocista', 'Goleiro Felino') — this turns them into the active
// language while keeping PT as fallback.
export function archetypeLabel(archetype: string | null | undefined): string {
  if (!archetype) return '';
  const translated = i18n.t(`attributes:archetypes.${archetype}`, { defaultValue: '' });
  return translated || archetype;
}

export function energyLabel(): string {
  return i18n.t('attributes:energy', { defaultValue: 'Energia' });
}

// Description text for an archetype (used in the onboarding archetype picker).
export function archetypeDescription(archetype: string | null | undefined, fallback?: string): string {
  if (!archetype) return '';
  const v = i18n.t(`attributes:archetype_descriptions.${archetype}`, { defaultValue: '' });
  return v || fallback || '';
}

// Localized height label/description (PT keys are the canonical values).
export function heightLabel(value: string, fallback?: string): string {
  const v = i18n.t(`attributes:height_options.${value}.label`, { defaultValue: '' });
  return v || fallback || value;
}

export function heightDescription(value: string, fallback?: string): string {
  const v = i18n.t(`attributes:height_options.${value}.description`, { defaultValue: '' });
  return v || fallback || '';
}

// Read-only Proxy that resolves attribute labels through i18next on access.
// Lets `ATTR_LABELS[key]` keep working everywhere without sweeping all callers.
export const ATTR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    if (typeof prop !== 'string') return undefined;
    return attrLabel(prop);
  },
  has(_target, prop) {
    return typeof prop === 'string' && prop in FALLBACK_ATTR_LABELS;
  },
  ownKeys() {
    return Object.keys(FALLBACK_ATTR_LABELS);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === 'string' && prop in FALLBACK_ATTR_LABELS) {
      return { configurable: true, enumerable: true, writable: false, value: attrLabel(prop) };
    }
    return undefined;
  },
});

// ══════════════════════════════════════════════════════════════
// Training FIT multiplier
//
// A per-attribute "fit score" in [-2, +2] derived from the player's
// archetype + height + primary position. Mirrors the SQL function
// public.get_training_multiplier in 20260420030500_training_fit_multiplier.sql
// byte-for-byte.
//
//   fit | ×    | label
//   +2  | 1.50 | Treino FIT TOP
//   +1  | 1.20 | Treino BOM
//    0  | 1.00 | Treino NORMAL
//   -1  | 0.60 | Treino RUIM
//   -2  | 0.30 | Treino CONTRA
// ══════════════════════════════════════════════════════════════

export type TrainingFitScore = -2 | -1 | 0 | 1 | 2;
export type TrainingFitTone = 'positive' | 'negative' | 'neutral';

export interface TrainingFitBreakdown {
  fit: TrainingFitScore;
  archetype_fit: -2 | -1 | 0 | 1 | 2;
  height_fit: -1 | 0 | 1;
  position_fit: -1 | 0 | 1;
  multiplier: number;
  label: string;
  tone: TrainingFitTone;
}

// Maps FIT score → JSON key in attributes:training_fit. Values resolved via i18n.
const FIT_TABLE: Record<TrainingFitScore, { multiplier: number; key: 'top' | 'good' | 'normal' | 'bad' | 'counter'; tone: TrainingFitTone }> = {
  [2]:  { multiplier: 1.50, key: 'top',     tone: 'positive' },
  [1]:  { multiplier: 1.20, key: 'good',    tone: 'positive' },
  [0]:  { multiplier: 1.00, key: 'normal',  tone: 'neutral' },
  [-1]: { multiplier: 0.60, key: 'bad',     tone: 'negative' },
  [-2]: { multiplier: 0.30, key: 'counter', tone: 'negative' },
};

function fitLabel(key: 'top' | 'good' | 'normal' | 'bad' | 'counter'): string {
  return i18n.t(`attributes:training_fit.${key}`, { defaultValue: '' }) || key;
}

export function getTrainingFit(
  archetype: string | null | undefined,
  height: string | null | undefined,
  position: string | null | undefined,
  attrKey: string,
): TrainingFitBreakdown {
  // Null-safe no-op: missing inputs → neutral multiplier, log warn.
  if (!archetype || !height || !position) {
    if (typeof console !== 'undefined') {
      console.warn('[getTrainingFit] missing input — using neutral multiplier', { archetype, height, position, attrKey });
    }
    return {
      fit: 0,
      archetype_fit: 0,
      height_fit: 0,
      position_fit: 0,
      multiplier: 1.0,
      label: fitLabel(FIT_TABLE[0].key),
      tone: FIT_TABLE[0].tone,
    };
  }

  const isGK = archetype.startsWith('Goleiro');

  // ── archetype_fit ─────────────────────────────────────────
  const bodyBoost = bodyTypeBoosts[archetype]?.[attrKey as keyof AttrKeys] ?? 0;

  let archFit: -2 | -1 | 0 | 1 | 2 = 0;
  if (bodyBoost >= 5) archFit = 2;
  else if (bodyBoost >= 3) archFit = 1;

  // Archetype cap tier (hard/soft) as negative signal.
  const archTier: CapTier | undefined = isGK
    ? GK_ARCHETYPE_CAPS[archetype]?.[attrKey]
    : ARCHETYPE_CAPS[archetype]?.[attrKey];

  if (archTier === 'hard') {
    archFit = Math.min(archFit, -2) as typeof archFit;
  } else if (archTier === 'soft') {
    archFit = Math.min(archFit, -1) as typeof archFit;
  } else if (isGK && !archTier && GK_CAPPED_FIELD_ATTRS.has(attrKey)) {
    // GK playing outfield attr with no explicit archetype opinion → -2.
    archFit = Math.min(archFit, -2) as typeof archFit;
  }

  // ── height_fit ────────────────────────────────────────────
  const heightBoost = heightBoosts[height]?.[attrKey as keyof AttrKeys] ?? 0;
  const heightTier = HEIGHT_CAPS[height]?.[attrKey];

  let heightFit: -1 | 0 | 1 = 0;
  if (heightBoost > 0) heightFit = 1;
  if (heightTier === 'hard' || heightBoost < 0) heightFit = -1;

  // ── position_fit ──────────────────────────────────────────
  // Mirrors server `get_training_multiplier`: only the explicit positionProfiles
  // signal counts here. POSITION_CAPS already lowers the ceiling for off-profile
  // attrs (e.g. ST + visao_jogo capped at 88), so penalising growth via the cap
  // tier would double-dip.
  const posBonus = positionProfiles[position]?.[attrKey as keyof AttrKeys] ?? 0;

  let positionFit: -1 | 0 | 1 = 0;
  if (posBonus >= 6) positionFit = 1;
  else if (posBonus < 0) positionFit = -1;

  // ── compose ───────────────────────────────────────────────
  let fit = archFit + heightFit + positionFit;
  if (fit > 2) fit = 2;
  if (fit < -2) fit = -2;
  const fitClamped = fit as TrainingFitScore;

  return {
    fit: fitClamped,
    archetype_fit: archFit,
    height_fit: heightFit,
    position_fit: positionFit,
    multiplier: FIT_TABLE[fitClamped].multiplier,
    label: fitLabel(FIT_TABLE[fitClamped].key),
    tone: FIT_TABLE[fitClamped].tone,
  };
}

export function getTrainingFitMultiplier(
  archetype: string | null | undefined,
  height: string | null | undefined,
  position: string | null | undefined,
  attrKey: string,
): number {
  return getTrainingFit(archetype, height, position, attrKey).multiplier;
}

// ══════════════════════════════════════════════════════════════
// Onboarding-time impact preview
//
// Used by the archetype + height pickers in the onboarding flow to
// show, BEFORE the player commits, which attributes get a bonus
// and which get penalised. We intentionally read directly from the
// `bodyTypeBoosts` / `heightBoosts` and `ARCHETYPE_CAPS` /
// `HEIGHT_CAPS` tables defined in this file so the chips stay in
// sync with both the onboarding RNG and the training-fit / cap
// resolution.
// ══════════════════════════════════════════════════════════════

export interface AttributeImpact {
  /** Attribute keys with a positive impact (boosted starting value or training-fit ≥ +1). */
  boosts: string[];
  /** Attribute keys with a negative impact (lower base, hard/soft cap, or training-fit ≤ -1). */
  penalties: string[];
}

/**
 * Returns the attributes that the chosen archetype boosts/penalises.
 * - "Boost" = bodyTypeBoosts entry ≥ 3 (the same threshold getTrainingFit uses
 *   to grant +1/+2 archetype-fit).
 * - "Penalty" = an entry in ARCHETYPE_CAPS / GK_ARCHETYPE_CAPS (hard or soft),
 *   OR — for GKs only — an outfield attr that's GK-blanket capped without the
 *   archetype lifting it. We intentionally exclude bodyTypeBoosts < 0 because
 *   the table never uses negative archetype boosts; caps are the negative signal.
 */
export function getArchetypeAttributeImpact(archetype: string | null | undefined): AttributeImpact {
  if (!archetype) return { boosts: [], penalties: [] };
  const isGK = archetype.startsWith('Goleiro');

  const boosts = new Set<string>();
  const penalties = new Set<string>();

  const boostMap = bodyTypeBoosts[archetype] || {};
  for (const [k, v] of Object.entries(boostMap)) {
    if (typeof v === 'number' && v >= 3) boosts.add(k);
  }

  const capMap: Partial<Record<string, CapTier>> | undefined = isGK
    ? GK_ARCHETYPE_CAPS[archetype]
    : ARCHETYPE_CAPS[archetype];

  if (capMap) {
    for (const [k, tier] of Object.entries(capMap)) {
      if (tier === 'hard' || tier === 'soft') {
        // Skip if this attr is also a boost — the explicit boost is the
        // dominant signal (All Around's blanket "soft" caps shouldn't show
        // as penalties because the archetype also gives +3 to those attrs).
        if (boosts.has(k)) continue;
        penalties.add(k);
      }
    }
  }

  return { boosts: Array.from(boosts), penalties: Array.from(penalties) };
}

/**
 * Returns the attributes that the chosen height boosts/penalises.
 * - "Boost" = heightBoosts entry > 0 (same threshold the SQL height bias uses).
 * - "Penalty" = heightBoosts < 0 OR HEIGHT_CAPS entry (hard or soft).
 */
export function getHeightAttributeImpact(height: string | null | undefined): AttributeImpact {
  if (!height) return { boosts: [], penalties: [] };

  const boosts = new Set<string>();
  const penalties = new Set<string>();

  const boostMap = heightBoosts[height] || {};
  for (const [k, v] of Object.entries(boostMap)) {
    if (typeof v === 'number' && v > 0) boosts.add(k);
    else if (typeof v === 'number' && v < 0) penalties.add(k);
  }

  const capMap = HEIGHT_CAPS[height];
  if (capMap) {
    for (const [k, tier] of Object.entries(capMap)) {
      if (tier === 'hard' || tier === 'soft') penalties.add(k);
    }
  }

  return { boosts: Array.from(boosts), penalties: Array.from(penalties) };
}
