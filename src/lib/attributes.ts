// Attribute generation based on position + archetype
import type { TablesInsert } from '@/integrations/supabase/types';

type AttrKeys = Omit<TablesInsert<'player_attributes'>, 'id' | 'player_profile_id' | 'created_at' | 'updated_at'>;

const FIELD_ATTRS = [
  'velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina',
  'drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto',
  'visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem',
  'posicionamento_ofensivo','posicionamento_defensivo',
  'cabeceio','acuracia_chute','forca_chute',
] as const;

const GK_ATTRS = [
  'reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um',
  'distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area',
] as const;

// Archetype boost definitions (keys that get +8-12 bonus)
const archetypeBoosts: Record<string, Partial<Record<keyof AttrKeys, number>>> = {
  'Cherife': { forca: 12, coragem: 10, posicionamento_defensivo: 10, cabeceio: 8, marcacao: 8, desarme: 8 },
  'Mordedor': { desarme: 12, coragem: 10, agilidade: 8, marcacao: 10, forca: 8, antecipacao: 8 },
  'Técnico': { passe_baixo: 10, passe_alto: 10, visao_jogo: 8, controle_bola: 8, tomada_decisao: 8 },
  'Finalizador': { acuracia_chute: 12, forca_chute: 10, posicionamento_ofensivo: 10, antecipacao: 8 },
  'Cabeceador': { cabeceio: 12, pulo: 10, forca: 10, posicionamento_ofensivo: 8 },
  'All Around': { velocidade: 6, forca: 6, drible: 6, acuracia_chute: 6, cabeceio: 6, passe_baixo: 6 },
  'Armador': { visao_jogo: 12, passe_baixo: 10, um_toque: 10, controle_bola: 8, tomada_decisao: 8 },
  'Maestro': { visao_jogo: 10, passe_baixo: 10, passe_alto: 10, controle_bola: 8, curva: 8 },
  'Organizador técnico': { passe_baixo: 10, tomada_decisao: 10, trabalho_equipe: 8, posicionamento_ofensivo: 8, visao_jogo: 8 },
  'Cão de guarda': { desarme: 12, marcacao: 10, coragem: 10, resistencia: 8, antecipacao: 8, posicionamento_defensivo: 8 },
  'Regista': { visao_jogo: 12, passe_alto: 10, passe_baixo: 10, posicionamento_defensivo: 8, tomada_decisao: 8 },
  'Box-to-box': { resistencia: 10, stamina: 10, velocidade: 8, desarme: 8, passe_baixo: 8, acuracia_chute: 6 },
  'Shot-stopper': { reflexo: 12, posicionamento_gol: 10, pegada: 10, tempo_reacao: 10, um_contra_um: 8 },
  'Líbero': { saida_gol: 12, comando_area: 10, posicionamento_gol: 8, passe_baixo: 8, distribuicao_curta: 8 },
  'Distribuidor': { distribuicao_curta: 12, distribuicao_longa: 12, passe_baixo: 8, passe_alto: 8, visao_jogo: 6 },
};

// Position base profiles (relative adjustments from base)
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

export function generateAttributes(position: string, archetype: string): Omit<TablesInsert<'player_attributes'>, 'player_profile_id'> {
  const isGK = position === 'GK';
  const base = 42; // Novice base for field attributes
  const gkBase = isGK ? 42 : 15; // GK attrs low for field players

  const attrs: Record<string, number> = {};

  // Set field attribute bases
  for (const key of FIELD_ATTRS) {
    attrs[key] = base + Math.floor(Math.random() * 5) - 2; // 40-44 range
  }

  // Set GK attribute bases
  for (const key of GK_ATTRS) {
    attrs[key] = gkBase + Math.floor(Math.random() * 3) - 1;
  }

  // Apply position profile
  const posProfile = positionProfiles[position];
  if (posProfile) {
    for (const [key, bonus] of Object.entries(posProfile)) {
      attrs[key] = Math.max(10, Math.min(70, (attrs[key] || 40) + bonus));
    }
  }

  // Apply archetype boosts
  const archBoosts = archetypeBoosts[archetype];
  if (archBoosts) {
    for (const [key, bonus] of Object.entries(archBoosts)) {
      attrs[key] = Math.max(10, Math.min(70, (attrs[key] || 40) + (bonus || 0)));
    }
  }

  // Clamp all
  for (const key of Object.keys(attrs)) {
    attrs[key] = Math.max(10, Math.min(75, attrs[key]));
  }

  return attrs as unknown as Omit<TablesInsert<'player_attributes'>, 'player_profile_id'>;
}

export function calculateOverall(attrs: Record<string, number>, position: string): number {
  const isGK = position === 'GK';

  if (isGK) {
    const gkKeys = ['reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um','tempo_reacao','comando_area'] as const;
    const sum = gkKeys.reduce((acc, k) => acc + (attrs[k] || 20), 0);
    return Math.round(sum / gkKeys.length);
  }

  // Field player: weighted average
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

// Archetype options per position category
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

export function getArchetypesForPosition(position: string): { value: string; label: string }[] {
  switch (position) {
    case 'GK': return [
      { value: 'Shot-stopper', label: 'Shot-stopper' },
      { value: 'Líbero', label: 'Líbero' },
      { value: 'Distribuidor', label: 'Distribuidor' },
    ];
    case 'CB': return [
      { value: 'Cherife', label: 'Cherife' },
      { value: 'Mordedor', label: 'Mordedor' },
      { value: 'Técnico', label: 'Técnico' },
    ];
    case 'LB': case 'RB': return [
      { value: 'Mordedor', label: 'Marcador' },
      { value: 'Box-to-box', label: 'Motorzinho' },
      { value: 'Técnico', label: 'Construtor lateral' },
    ];
    case 'DM': return [
      { value: 'Cão de guarda', label: 'Cão de guarda' },
      { value: 'Regista', label: 'Regista' },
      { value: 'Box-to-box', label: 'Box-to-box' },
    ];
    case 'CM': return [
      { value: 'Armador', label: 'Armador' },
      { value: 'Maestro', label: 'Maestro' },
      { value: 'Organizador técnico', label: 'Organizador técnico' },
      { value: 'Box-to-box', label: 'Box-to-box' },
    ];
    case 'CAM': return [
      { value: 'Armador', label: 'Armador' },
      { value: 'Maestro', label: 'Maestro' },
      { value: 'Organizador técnico', label: 'Organizador técnico' },
    ];
    case 'LW': case 'RW': return [
      { value: 'Finalizador', label: 'Driblador' },
      { value: 'Armador', label: 'Criador' },
      { value: 'All Around', label: 'Inverso' },
    ];
    case 'ST': return [
      { value: 'Finalizador', label: 'Finalizador' },
      { value: 'Cabeceador', label: 'Cabeceador' },
      { value: 'All Around', label: 'All Around' },
    ];
    default: return [];
  }
}
