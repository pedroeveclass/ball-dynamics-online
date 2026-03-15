// Attribute generation based on position + body type
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

// Body Type definitions - boosts applied on top of base
export const BODY_TYPES = [
  { value: 'All Around', label: 'All Around', description: 'Equilibrado em todos os atributos. Um jogador versátil.' },
  { value: 'Condutor', label: 'Condutor', description: 'Mais controle de bola, passe e técnica refinada.' },
  { value: 'Chutador', label: 'Chutador', description: 'Potencializa atributos de chute e finalização.' },
  { value: 'Velocista', label: 'Velocista', description: 'Mais velocidade, aceleração e energia.' },
  { value: 'Torre', label: 'Torre', description: 'Mais alto, melhor em salto, cabeceio e força.' },
  { value: 'Cão de Guarda', label: 'Cão de Guarda', description: 'Mais marcação, desarme e posicionamento defensivo.' },
] as const;

const bodyTypeBoosts: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
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
};

// Position base profiles
const positionProfiles: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
  'GK': { reflexo: 15, posicionamento_gol: 12, pegada: 10, defesa_aerea: 10, saida_gol: 8, tempo_reacao: 10, comando_area: 8, velocidade: -10, drible: -15, acuracia_chute: -15 },
  'CB': { marcacao: 8, desarme: 8, forca: 6, cabeceio: 6, posicionamento_defensivo: 8, coragem: 6, drible: -5, posicionamento_ofensivo: -5 },
  'LB': { velocidade: 6, aceleracao: 6, resistencia: 6, posicionamento_defensivo: 4, marcacao: 4 },
  'RB': { velocidade: 6, aceleracao: 6, resistencia: 6, posicionamento_defensivo: 4, marcacao: 4 },
  'DM': { marcacao: 6, desarme: 8, posicionamento_defensivo: 8, antecipacao: 6, trabalho_equipe: 4 },
  'CM': { passe_baixo: 6, visao_jogo: 4, tomada_decisao: 4, trabalho_equipe: 4, resistencia: 4 },
  'CAM': { visao_jogo: 8, passe_baixo: 6, drible: 6, um_toque: 6, posicionamento_ofensivo: 6 },
  'LW': { velocidade: 8, aceleracao: 6, drible: 8, agilidade: 6, posicionamento_ofensivo: 4 },
  'RW': { velocidade: 8, aceleracao: 6, drible: 8, agilidade: 6, posicionamento_ofensivo: 4 },
  'ST': { acuracia_chute: 8, forca_chute: 6, posicionamento_ofensivo: 8, cabeceio: 4, antecipacao: 4 },
};

// Age experience bonus: older players get more base points
export function getAgeExperienceBonus(age: number): number {
  if (age <= 18) return 0;
  if (age === 19) return 2;
  if (age === 20) return 4;
  if (age === 21) return 6;
  if (age === 22) return 8;
  return 0;
}

export function generateBaseAttributes(position: string, bodyType: string, age: number): Record<string, number> {
  const isGK = position === 'GK';
  const base = 35; // Lower novice base since player distributes 20 extra points
  const gkBase = isGK ? 35 : 12;

  const attrs: Record<string, number> = {};

  // Set field attribute bases
  for (const key of FIELD_ATTRS) {
    attrs[key] = base + Math.floor(Math.random() * 3) - 1; // 34-36 range
  }

  // Set GK attribute bases
  for (const key of GK_ATTRS) {
    attrs[key] = gkBase + Math.floor(Math.random() * 3) - 1;
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

  // Apply age experience bonus as a flat bump to all attributes
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

// Positions
export const POSITIONS = [
  { value: 'GK', label: 'Goleiro', category: 'GK' },
  { value: 'CB', label: 'Zagueiro', category: 'DEF' },
  { value: 'LB', label: 'Lateral Esquerdo', category: 'DEF' },
  { value: 'RB', label: 'Lateral Direito', category: 'DEF' },
  { value: 'DM', label: 'Volante', category: 'MID' },
  { value: 'CM', label: 'Meio-Campista', category: 'MID' },
  { value: 'CAM', label: 'Meia Ofensivo', category: 'MID' },
  { value: 'LW', label: 'Ponta Esquerda', category: 'FWD' },
  { value: 'RW', label: 'Ponta Direita', category: 'FWD' },
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
