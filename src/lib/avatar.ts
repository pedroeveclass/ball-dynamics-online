// ════════════════════════════════════════════════════════════
// Player visual avatar: type + option catalogs.
//
// The `PlayerAppearance` is persisted as JSONB on
// `player_profiles.appearance` and drives how <PlayerAvatar />
// renders the head/face portion. The body (jersey, shorts, shoes)
// is rendered from the player's current club colors, not from this
// object — that way transfers update the visual automatically.
// ════════════════════════════════════════════════════════════

export interface PlayerAppearance {
  skinTone: string;       // hex, no leading #
  hair: string;           // avataaars `top` id (e.g. 'shortHairShortFlat')
  hairColor: string;      // hex, no leading #
  eyebrows: string;       // avataaars `eyebrows` id
  eyes: string;           // avataaars `eyes` id
  nose: string;           // avataaars `nose` id (avataaars has only one; kept for future styles)
  mouth: string;          // avataaars `mouth` id
  facialHair: string | null;
  facialHairColor: string | null;
  accessories: string | null;  // glasses etc.
  gadgets: GadgetEquipped[];   // reserved for store, empty for MVP
}

export interface GadgetEquipped {
  slot: GadgetSlot;
  id: string;
}

export type GadgetSlot = 'head' | 'face' | 'wrist' | 'feet' | 'back';

// ── Option catalogs (what the user can pick in the creator) ──
// Values map directly to DiceBear avataaars option ids so the lib
// can consume them without translation. Localized labels live at
// `avatar:<category>.<id>` — call `avatarOptionLabel(category, id)`.

import i18n from '@/i18n';

export interface Option {
  id: string;
  label: string;
}

export type AvatarCategory =
  | 'skin_tones' | 'hair_colors' | 'hair_styles'
  | 'eyebrows' | 'eyes' | 'noses' | 'mouths'
  | 'facial_hair' | 'accessories';

export function avatarOptionLabel(category: AvatarCategory, id: string, fallback?: string): string {
  const v = i18n.t(`avatar:${category}.${id}`, { defaultValue: '' });
  return v || fallback || id;
}

export const SKIN_TONES: Option[] = [
  { id: 'FFDBB4', label: 'Muito Claro' },
  { id: 'EDB98A', label: 'Claro' },
  { id: 'D08B5B', label: 'Médio' },
  { id: 'AE5D29', label: 'Moreno' },
  { id: '8D5524', label: 'Escuro' },
  { id: '614335', label: 'Muito Escuro' },
];

export const HAIR_COLORS: Option[] = [
  { id: '2C1B18', label: 'Preto' },
  { id: '4A312C', label: 'Castanho Escuro' },
  { id: 'A55728', label: 'Castanho' },
  { id: 'B58143', label: 'Castanho Claro' },
  { id: 'D6B370', label: 'Loiro' },
  { id: 'F59797', label: 'Rosa' },
  { id: 'C93305', label: 'Ruivo' },
  { id: 'E8E1E1', label: 'Grisalho' },
  { id: 'ECDCBF', label: 'Platinado' },
];

// Subset of avataaars `top` styles — we expose the ones that work well
// as soccer-player looks (hats live under gadgets, not here).
// IDs match DiceBear avataaars v9 schema exactly.
export const HAIR_STYLES: Option[] = [
  { id: 'shortFlat', label: 'Curto Liso' },
  { id: 'shortRound', label: 'Curto Redondo' },
  { id: 'shortCurly', label: 'Curto Cacheado' },
  { id: 'shortWaved', label: 'Curto Ondulado' },
  { id: 'shavedSides', label: 'Raspado Lateral' },
  { id: 'theCaesar', label: 'Caesar' },
  { id: 'theCaesarAndSidePart', label: 'Caesar Lateral' },
  { id: 'sides', label: 'Lateral Raspada' },
  { id: 'frizzle', label: 'Volumoso' },
  { id: 'shaggy', label: 'Desarrumado' },
  { id: 'shaggyMullet', label: 'Mullet' },
  { id: 'dreads01', label: 'Dreads Curtos' },
  { id: 'dreads02', label: 'Dreads Médios' },
  { id: 'dreads', label: 'Dreads Longos' },
  { id: 'straight01', label: 'Liso Comprido 1' },
  { id: 'straight02', label: 'Liso Comprido 2' },
  { id: 'straightAndStrand', label: 'Liso com Mecha' },
  { id: 'longButNotTooLong', label: 'Comprido' },
  { id: 'curly', label: 'Cacheado Longo' },
  { id: 'curvy', label: 'Curvy' },
  { id: 'miaWallace', label: 'Franja Reta' },
  { id: 'fro', label: 'Black Power' },
  { id: 'froBand', label: 'Black Power + Faixa' },
  { id: 'bigHair', label: 'Volume Alto' },
  { id: 'bun', label: 'Coque' },
  { id: 'bob', label: 'Bob' },
  { id: 'frida', label: 'Frida' },
  { id: 'noHair', label: 'Careca' },  // handled specially: topProbability = 0
];

export const EYEBROWS: Option[] = [
  { id: 'default', label: 'Padrão' },
  { id: 'defaultNatural', label: 'Natural' },
  { id: 'raisedExcited', label: 'Animado' },
  { id: 'raisedExcitedNatural', label: 'Animado Natural' },
  { id: 'sadConcerned', label: 'Preocupado' },
  { id: 'sadConcernedNatural', label: 'Preocupado Natural' },
  { id: 'upDown', label: 'Assimétrica' },
  { id: 'upDownNatural', label: 'Assimétrica Natural' },
  { id: 'angry', label: 'Bravo' },
  { id: 'angryNatural', label: 'Bravo Natural' },
  { id: 'flatNatural', label: 'Reta' },
  { id: 'frownNatural', label: 'Carranca' },
];

export const EYES: Option[] = [
  { id: 'default', label: 'Padrão' },
  { id: 'happy', label: 'Feliz' },
  { id: 'wink', label: 'Piscando' },
  { id: 'squint', label: 'Apertado' },
  { id: 'surprised', label: 'Surpreso' },
  { id: 'side', label: 'Desviado' },
  { id: 'eyeRoll', label: 'Revirando' },
  { id: 'closed', label: 'Fechado' },
  { id: 'hearts', label: 'Apaixonado' },
];

export const NOSES: Option[] = [
  { id: 'default', label: 'Padrão' },
];

export const MOUTHS: Option[] = [
  { id: 'default', label: 'Neutro' },
  { id: 'smile', label: 'Sorriso' },
  { id: 'twinkle', label: 'Brilho' },
  { id: 'serious', label: 'Sério' },
  { id: 'concerned', label: 'Preocupado' },
  { id: 'tongue', label: 'Língua' },
  { id: 'eating', label: 'Comendo' },
  { id: 'disbelief', label: 'Incrédulo' },
  { id: 'grimace', label: 'Esforço' },
  { id: 'sad', label: 'Triste' },
  { id: 'screamOpen', label: 'Grito' },
];

export const FACIAL_HAIR: Option[] = [
  { id: 'none', label: 'Nenhum' },
  { id: 'beardLight', label: 'Barba por Fazer' },
  { id: 'beardMedium', label: 'Barba Média' },
  { id: 'beardMajestic', label: 'Barba Cheia' },
  { id: 'moustacheFancy', label: 'Bigode Charmoso' },
  { id: 'moustacheMagnum', label: 'Bigode Grosso' },
];

export const ACCESSORIES: Option[] = [
  { id: 'none', label: 'Nenhum' },
  { id: 'prescription01', label: 'Óculos Redondo' },
  { id: 'prescription02', label: 'Óculos Quadrado' },
  { id: 'round', label: 'Óculos Fino' },
  { id: 'sunglasses', label: 'Óculos de Sol' },
  { id: 'wayfarers', label: 'Wayfarer' },
  { id: 'kurt', label: 'Kurt' },
  { id: 'eyepatch', label: 'Tapa-olho' },
];

export const DEFAULT_APPEARANCE: PlayerAppearance = {
  skinTone: SKIN_TONES[1].id,
  hair: 'shortFlat',
  hairColor: HAIR_COLORS[0].id,
  eyebrows: 'default',
  eyes: 'default',
  nose: 'default',
  mouth: 'smile',
  facialHair: null,
  facialHairColor: null,
  accessories: null,
  gadgets: [],
};

// Deterministic appearance from a string seed (used when we want a
// recognizable face per entity — e.g. managers — but have no persisted
// appearance). Same seed → same face every render.
export function seededAppearance(seed: string): PlayerAppearance {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const pick = <T,>(arr: T[], offset: number): T => arr[Math.abs((hash + offset * 31)) % arr.length];
  const maybe = (offset: number) => (Math.abs((hash + offset * 17)) % 100) < 35; // ~35% chance
  return {
    skinTone: pick(SKIN_TONES, 1).id,
    hair: pick(HAIR_STYLES, 2).id,
    hairColor: pick(HAIR_COLORS, 3).id,
    eyebrows: pick(EYEBROWS, 4).id,
    eyes: pick(EYES, 5).id,
    nose: 'default',
    mouth: pick(MOUTHS, 6).id,
    facialHair: maybe(7) ? pick(FACIAL_HAIR.filter(f => f.id !== 'none'), 8).id : null,
    facialHairColor: null,
    accessories: maybe(9) ? pick(ACCESSORIES.filter(a => a.id !== 'none'), 10).id : null,
    gadgets: [],
  };
}

// Long-hair styles drape past the shoulders. Used by the full-body front
// view to know when to extend the portrait clip so the hair doesn't get
// chopped at the shirt line.
const LONG_HAIR_IDS = new Set([
  'straight01', 'straight02', 'straightAndStrand',
  'longButNotTooLong', 'curly', 'curvy', 'miaWallace',
  'bob', 'frida', 'bigHair', 'dreads',
]);

// Beards that hang past the chin and need extra vertical room.
const BIG_BEARD_IDS = new Set(['beardMedium', 'beardMajestic']);

export function isLongHair(hair: string | null | undefined): boolean {
  return !!hair && LONG_HAIR_IDS.has(hair);
}

export function isBigBeard(facialHair: string | null | undefined): boolean {
  return !!facialHair && BIG_BEARD_IDS.has(facialHair);
}

// Height tier → visual scale factor for the full-body view.
export function heightScale(height: string | null | undefined): number {
  switch (height) {
    case 'Muito Baixo': return 0.88;
    case 'Baixo':       return 0.94;
    case 'Alto':        return 1.06;
    case 'Muito Alto':  return 1.12;
    case 'Médio':
    default:            return 1.0;
  }
}

// First word of the player's full name (used as the shirt back name).
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

// Returns the "readable" foreground color (black or white) for a given
// background hex — used for jersey number/name text against team colors.
export function readableForeground(bgHex: string | null | undefined): string {
  if (!bgHex) return '#ffffff';
  const hex = bgHex.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Relative luminance (WCAG-ish)
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? '#111111' : '#ffffff';
}
