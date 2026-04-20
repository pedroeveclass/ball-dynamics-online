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

// Age experience bonus
export function getAgeExperienceBonus(age: number): number {
  if (age <= 18) return 0;
  if (age === 19) return 2;
  if (age === 20) return 4;
  if (age === 21) return 6;
  if (age === 22) return 8;
  return 0;
}

export function generateBaseAttributes(position: string, bodyType: string, age: number, height: string = 'Médio'): Record<string, number> {
  const isGK = position === 'GK';
  const base = 35;
  const gkBase = isGK ? 35 : 12;

  const attrs: Record<string, number> = {};

  // Deterministic base — no ±1 jitter so the onboarding preview matches what
  // the server will actually persist (the RPC has the same fixed base).
  for (const key of FIELD_ATTRS) {
    attrs[key] = base;
  }
  for (const key of GK_ATTRS) {
    attrs[key] = gkBase;
  }

  // Apply position profile
  const posProfile = positionProfiles[position];
  if (posProfile) {
    for (const [key, bonus] of Object.entries(posProfile)) {
      attrs[key] = Math.max(10, Math.min(65, (attrs[key] || 30) + bonus));
    }
  }

  // Apply body type boosts
  const boosts = bodyTypeBoosts[bodyType];
  if (boosts) {
    for (const [key, bonus] of Object.entries(boosts)) {
      attrs[key] = Math.max(10, Math.min(65, (attrs[key] || 30) + (bonus || 0)));
    }
  }

  // Apply height boosts
  const hBoosts = heightBoosts[height];
  if (hBoosts) {
    for (const [key, bonus] of Object.entries(hBoosts)) {
      attrs[key] = Math.max(10, Math.min(65, (attrs[key] || 30) + (bonus || 0)));
    }
  }

  // Apply age experience bonus
  const ageBonus = getAgeExperienceBonus(age);
  if (ageBonus > 0) {
    for (const key of Object.keys(attrs)) {
      attrs[key] = Math.min(65, attrs[key] + ageBonus);
    }
  }

  // Clamp all
  for (const key of Object.keys(attrs)) {
    attrs[key] = Math.max(10, Math.min(70, attrs[key]));
  }

  return attrs;
}

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

export const COACH_TYPE_LABELS: Record<string, string> = {
  defensive: 'Defensivo',
  offensive: 'Ofensivo',
  technical: 'Técnico',
  all_around: 'Completo',
  complete: 'Completo',
};

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

// Public: computes the maximum value an attribute can reach for a given
// archetype + height.
//
// Resolution rules:
//   1. If the archetype defines an EXPLICIT tier for this attribute, that
//      tier REPLACES the generic GK-blanket cap (i.e. a Felino with
//      agilidade:'soft' resolves to 88, not min(70, 88)=70). This lets
//      archetype design lift the GK blanket selectively.
//   2. Otherwise, for GKs the blanket CAP_GK_FIELD (70) applies to the
//      outfield-ish attrs in GK_CAPPED_FIELD_ATTRS; for field players no
//      blanket applies.
//   3. Height caps always stack with min() on top of the result.
export function getAttrCap(archetype: string | null | undefined, height: string | null | undefined, attrKey: string): number {
  const isGK = archetype?.startsWith('Goleiro');
  let cap = CAP_DEFAULT;

  // Archetype layer: explicit per-attribute tier REPLACES the GK blanket.
  if (isGK) {
    const gkTier = archetype ? GK_ARCHETYPE_CAPS[archetype]?.[attrKey] : undefined;
    if (gkTier) {
      cap = Math.min(cap, tierValue(gkTier));
    } else if (GK_CAPPED_FIELD_ATTRS.has(attrKey)) {
      cap = Math.min(cap, CAP_GK_FIELD);
    }
  } else {
    const fieldTier = archetype ? ARCHETYPE_CAPS[archetype]?.[attrKey] : undefined;
    cap = Math.min(cap, tierValue(fieldTier));
  }

  // Height always stacks (min wins).
  const heightTier = height ? HEIGHT_CAPS[height]?.[attrKey] : undefined;
  cap = Math.min(cap, tierValue(heightTier));

  return cap;
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
  { value: 'CDM', label: 'Volante Defensivo', category: 'MID' },
  { value: 'CM', label: 'Meio-Campista', category: 'MID' },
  { value: 'LM', label: 'Meia Esquerda', category: 'MID' },
  { value: 'RM', label: 'Meia Direita', category: 'MID' },
  { value: 'CAM', label: 'Meia Ofensivo', category: 'MID' },
  { value: 'LW', label: 'Ponta Esquerda', category: 'FWD' },
  { value: 'RW', label: 'Ponta Direita', category: 'FWD' },
  { value: 'CF', label: 'Segundo Atacante', category: 'FWD' },
  { value: 'ST', label: 'Atacante', category: 'FWD' },
] as const;

// Attribute labels for display
export const ATTR_LABELS: Record<string, string> = {
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
