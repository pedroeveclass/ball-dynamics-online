// ════════════════════════════════════════════════════════════
// PlayerAvatar V2 — composes the new SVG body from 8+ raw assets
// in /avatar-redesign/. Each asset shares the same viewBox
// 0 0 1024 1536, so layers compose by simple concatenation in
// z-order. Tinting is done by string-replacing the original
// stand-in colors with team / skin colors at render time.
//
// Phase 1 scope (this file): body + jersey + shorts + socks +
// cleats + skin tinting + GK shirt/gloves + captain band. Head
// uses the new cabeca SVG as-is (skin-tinted) — DiceBear-style
// face customization is Phase 4.
// ════════════════════════════════════════════════════════════

import { DEFAULT_APPEARANCE, type PlayerAppearance } from '@/lib/avatar';
import { composeFaceBack, composeFaceFront } from '@/lib/faceComposer';

// ── Raw SVG imports (Vite ?raw, all share viewBox 1024×1536) ──
// Note: `perna.svg` (singular) is the *full* leg from upper thigh
// down to ankle. The numbered `5_pernas.svg` only covers the upper
// portion and would leave a gap below short socks, so we use the
// full version exclusively. The cabeca asset is no longer used —
// the head now comes from DiceBear avataaars so face customization
// (hair, eyes, beard, mouth) carries over from the avatar creator.
// import cabecaSvg       from '../../avatar-redesign/1_cabeca.svg?raw';
import camisetaSvg     from '../../avatar-redesign/2_camiseta.svg?raw';
import bracosSvg       from '../../avatar-redesign/3_bracos.svg?raw';
import bermudaSvg      from '../../avatar-redesign/4_bermuda.svg?raw';
import pernaSvg        from '../../avatar-redesign/perna.svg?raw';
import chuteiraSvg     from '../../avatar-redesign/7_chuteira.svg?raw';
import meiaoAltoSvg    from '../../avatar-redesign/meiao_alto.svg?raw';
import meiaoBaixoSvg   from '../../avatar-redesign/meiao_baixo.svg?raw';
import camisaGoleiroSvg from '../../avatar-redesign/camisagk.svg?raw';
import luvasSvg        from '../../avatar-redesign/luvas.svg?raw';
import caneleiraSvg    from '../../avatar-redesign/caneleira.svg?raw';
import troncoSvg       from '../../avatar-redesign/tronco.svg?raw';

// Strip the outer <svg ...> wrapper so we can compose layers
// into a single root SVG. Keeps internal <defs>/<clipPath> etc.
function stripSvgWrapper(raw: string): string {
  return raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
}

const innerCamiseta      = stripSvgWrapper(camisetaSvg);
const innerBracos        = stripSvgWrapper(bracosSvg);
const innerBermuda       = stripSvgWrapper(bermudaSvg);
const innerPerna         = stripSvgWrapper(pernaSvg);
const innerChuteira      = stripSvgWrapper(chuteiraSvg);
const innerMeiaoAlto     = stripSvgWrapper(meiaoAltoSvg);
const innerMeiaoBaixo    = stripSvgWrapper(meiaoBaixoSvg);
const innerCamisaGoleiro = stripSvgWrapper(camisaGoleiroSvg);
const innerLuvas         = stripSvgWrapper(luvasSvg);
const innerCaneleira     = stripSvgWrapper(caneleiraSvg);
const innerTronco        = stripSvgWrapper(troncoSvg);

// ── Color math (HSL helpers for shadow/highlight derivation) ──

function normalizeHex(h: string): string {
  return h.startsWith('#') ? h : `#${h}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(normalizeHex(hex));
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h, s, Math.max(0, l - amount));
  return rgbToHex(nr, ng, nb);
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(normalizeHex(hex));
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h, s, Math.min(1, l + amount));
  return rgbToHex(nr, ng, nb);
}

// ── Slot tinting ──
// Each tint replaces the original SVG stand-in colors with the
// player's chosen colors. We use replaceAll because the SVGs may
// be composed multiple times within one render.

// Skin: shared across cabeca + bracos + pernas + GK shirt (the
// goalkeeper kit has skin-colored torso paths visible at the V-neck).
// Replacement is exact-match against the catalog of source skin
// hexes so it never accidentally re-tints a team color that happens
// to be warm. Three buckets: base, shadow (~darker), highlight (~lighter).
const SKIN_BASE_HEXES = [
  '#FDD3AB', '#FBD2AA', '#FDD3AA', '#FBD3AD',
];
const SKIN_SHADOW_HEXES = [
  '#E1B489', '#E2B58C', '#E9B58C', '#E0BA94',
];
const SKIN_HIGHLIGHT_HEXES = [
  '#EDD4BB', '#EED5BD', '#F0D4B9',
  '#F2DFD4', '#F3E2D3', '#F7E5D8', '#F7ECDF',
];

export function tintSkin(rawSvg: string, skinHex: string): string {
  const base = normalizeHex(skinHex);
  const shadow = darken(base, 0.10);
  const highlight = lighten(base, 0.06);
  let out = rawSvg;
  for (const c of SKIN_BASE_HEXES)      out = replaceHexCI(out, c, base);
  for (const c of SKIN_SHADOW_HEXES)    out = replaceHexCI(out, c, shadow);
  for (const c of SKIN_HIGHLIGHT_HEXES) out = replaceHexCI(out, c, highlight);
  return out;
}

// Helper: replace a hex string in SVG fill attributes, case-insensitive.
function replaceHexCI(svg: string, hex: string, replacement: string): string {
  const escaped = hex.replace('#', '\\#');
  return svg.replace(new RegExp(escaped, 'gi'), replacement);
}

// Replace every fill="#xxxxxx" with the given color. Used for second
// skin layers (compression sleeves / leggings) where we want a flat
// uniform color regardless of the asset's original shading.
function tintAllFills(svg: string, color: string): string {
  return svg.replace(/fill="#[0-9A-Fa-f]+"/gi, `fill="${color}"`);
}

// Filter <path> elements by which leg/arm they belong to. Uses the
// first M coordinate of each path: x<512 = player's right (viewer
// left), x≥512 = player's left (viewer right). 'both' returns the
// SVG unchanged.
function filterPathsBySide(svg: string, side: 'left' | 'right' | 'both'): string {
  if (side === 'both') return svg;
  return svg.replace(/<path\b[\s\S]*?\/>/g, (pathTag) => {
    const m = pathTag.match(/d="\s*\n?\s*M\s*([\-\d.]+)/);
    if (!m) return pathTag;
    const x = parseFloat(m[1]);
    const isPlayerRight = x < 512;
    if (side === 'right' && isPlayerRight) return pathTag;
    if (side === 'left' && !isPlayerRight) return pathTag;
    return '';
  });
}

// Jersey (camiseta): #D5D5D5 (body) → primary, #ADADAE (sleeve
// panel + side) → secondary, #BEBDBC (seam shadow) → derived
// from primary so it always reads as a darker variant.
//
// When `pattern` is non-solid, the body fill is swapped for a
// `url(#kitPattern)` reference and the matching <defs> with a
// <pattern> or <linearGradient> is prepended. Sleeves and shadow
// stay solid so the team's secondary color reads cleanly.
export function tintJersey(
  rawSvg: string,
  primary: string,
  secondary: string,
  pattern: string | null = 'solid',
): string {
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  const shadow = darken(p, 0.09);
  const usePattern = pattern && pattern !== 'solid';
  // When a pattern is active, extend the pattern to BOTH sleeves and
  // shadow paths so the secondary/shadow color doesn't leak through
  // as a darker stripe alongside the new pattern. Solid kits keep
  // the original look (sleeves = secondary, shadow = darken(primary)).
  const tinted = rawSvg
    .replace(/#D5D5D5/gi, usePattern ? 'url(#kitPattern)' : p)
    .replace(/#ADADAE/gi, usePattern ? 'url(#kitPattern)' : s)
    .replace(/#BEBDBC/gi, usePattern ? 'url(#kitPattern)' : shadow);
  if (!usePattern) return tinted;
  return `<defs>${buildKitPatternDefs(pattern!, p, s)}</defs>${tinted}`;
}

// Pattern / gradient definition for a non-solid jersey. Coordinates
// chosen so that *single-cycle* patterns (bicolor_*) cover the body
// bbox once (X≈300-720, Y≈380-790 in the 1024×1536 viewBox), while
// repeating stripes use small tiles that read clearly at typical
// avatar render sizes.
function buildKitPatternDefs(pattern: string, primary: string, stripe: string): string {
  // Body bounding box (camiseta torso). Used by bicolor gradients.
  const BX = 300, BY = 380, BW = 420, BH = 410;
  switch (pattern) {
    case 'bicolor_horizontal':
      // Top half = primary, bottom half = stripe.
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY}" x2="${BX}" y2="${BY + BH}">
        <stop offset="0.5" stop-color="${primary}"/>
        <stop offset="0.5" stop-color="${stripe}"/>
      </linearGradient>`;
    case 'bicolor_vertical':
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY}" x2="${BX + BW}" y2="${BY}">
        <stop offset="0.5" stop-color="${primary}"/>
        <stop offset="0.5" stop-color="${stripe}"/>
      </linearGradient>`;
    case 'bicolor_diagonal':
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY + BH}" x2="${BX + BW}" y2="${BY}">
        <stop offset="0.5" stop-color="${primary}"/>
        <stop offset="0.5" stop-color="${stripe}"/>
      </linearGradient>`;
    // Repeating vertical stripes — tile size scaled up ~5× from V1.
    case 'stripe_vertical_single':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="100" height="500" x="${BX}" y="${BY}">
        <rect width="50" height="500" fill="${primary}"/><rect x="50" width="50" height="500" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_vertical_double':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="120" height="500" x="${BX}" y="${BY}">
        <rect width="40" height="500" fill="${primary}"/><rect x="40" width="20" height="500" fill="${stripe}"/>
        <rect x="60" width="40" height="500" fill="${primary}"/><rect x="100" width="20" height="500" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_vertical_triple':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="90" height="500" x="${BX}" y="${BY}">
        <rect width="20" height="500" fill="${primary}"/><rect x="20" width="10" height="500" fill="${stripe}"/>
        <rect x="30" width="20" height="500" fill="${primary}"/><rect x="50" width="10" height="500" fill="${stripe}"/>
        <rect x="60" width="20" height="500" fill="${primary}"/><rect x="80" width="10" height="500" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_horizontal_single':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="500" height="100" x="${BX}" y="${BY}">
        <rect width="500" height="50" fill="${primary}"/><rect y="50" width="500" height="50" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_horizontal_double':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="500" height="120" x="${BX}" y="${BY}">
        <rect width="500" height="40" fill="${primary}"/><rect y="40" width="500" height="20" fill="${stripe}"/>
        <rect y="60" width="500" height="40" fill="${primary}"/><rect y="100" width="500" height="20" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_horizontal_triple':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="500" height="90" x="${BX}" y="${BY}">
        <rect width="500" height="20" fill="${primary}"/><rect y="20" width="500" height="10" fill="${stripe}"/>
        <rect y="30" width="500" height="20" fill="${primary}"/><rect y="50" width="500" height="10" fill="${stripe}"/>
        <rect y="60" width="500" height="20" fill="${primary}"/><rect y="80" width="500" height="10" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_diagonal_single':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="70" height="70" patternTransform="rotate(45)" x="${BX}" y="${BY}">
        <rect width="35" height="70" fill="${primary}"/><rect x="35" width="35" height="70" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_diagonal_double':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="90" height="90" patternTransform="rotate(45)" x="${BX}" y="${BY}">
        <rect width="30" height="90" fill="${primary}"/><rect x="30" width="15" height="90" fill="${stripe}"/>
        <rect x="45" width="30" height="90" fill="${primary}"/><rect x="75" width="15" height="90" fill="${stripe}"/>
      </pattern>`;
    case 'stripe_diagonal_triple':
      return `<pattern id="kitPattern" patternUnits="userSpaceOnUse" width="90" height="90" patternTransform="rotate(45)" x="${BX}" y="${BY}">
        <rect width="15" height="90" fill="${primary}"/><rect x="15" width="15" height="90" fill="${stripe}"/>
        <rect x="30" width="15" height="90" fill="${primary}"/><rect x="45" width="15" height="90" fill="${stripe}"/>
        <rect x="60" width="15" height="90" fill="${primary}"/><rect x="75" width="15" height="90" fill="${stripe}"/>
      </pattern>`;
    // Single thick band centered on the body.
    case 'stripe_vertical_unique':
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY}" x2="${BX + BW}" y2="${BY}">
        <stop offset="0" stop-color="${primary}"/>
        <stop offset="0.42" stop-color="${primary}"/>
        <stop offset="0.42" stop-color="${stripe}"/>
        <stop offset="0.58" stop-color="${stripe}"/>
        <stop offset="0.58" stop-color="${primary}"/>
        <stop offset="1" stop-color="${primary}"/>
      </linearGradient>`;
    case 'stripe_horizontal_unique':
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY}" x2="${BX}" y2="${BY + BH}">
        <stop offset="0" stop-color="${primary}"/>
        <stop offset="0.50" stop-color="${primary}"/>
        <stop offset="0.50" stop-color="${stripe}"/>
        <stop offset="0.60" stop-color="${stripe}"/>
        <stop offset="0.60" stop-color="${primary}"/>
        <stop offset="1" stop-color="${primary}"/>
      </linearGradient>`;
    case 'stripe_diagonal_unique':
      return `<linearGradient id="kitPattern" gradientUnits="userSpaceOnUse" x1="${BX}" y1="${BY + BH}" x2="${BX + BW}" y2="${BY}">
        <stop offset="0" stop-color="${primary}"/>
        <stop offset="0.45" stop-color="${primary}"/>
        <stop offset="0.45" stop-color="${stripe}"/>
        <stop offset="0.55" stop-color="${stripe}"/>
        <stop offset="0.55" stop-color="${primary}"/>
        <stop offset="1" stop-color="${primary}"/>
      </linearGradient>`;
    default:
      // Fallback — solid primary if pattern key is unrecognized.
      return `<linearGradient id="kitPattern"><stop stop-color="${primary}"/></linearGradient>`;
  }
}

// Shorts (bermuda): #323232 (body) → primary, #262626 (seam
// shadow) → derived. The cuff stripe used to live here in the
// original asset; we moved it to meiao_alto/baixo.
export function tintShorts(rawSvg: string, primary: string): string {
  const p = normalizeHex(primary);
  const shadow = darken(p, 0.06);
  return rawSvg
    .replace(/#323232/gi, p)
    .replace(/#262626/gi, shadow);
}

// Socks (meião): #323232 (body) → primary, #252525 (shadow) →
// derived, #A7A7A7 (cuff stripe at top) → secondary so it pops
// against the sock body. Only meiao_alto/baixo carry the cuff;
// the canonical 6_meiao.svg has none and the replacement is a
// no-op for that color.
export function tintSocks(rawSvg: string, primary: string, secondary: string): string {
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  const shadow = darken(p, 0.08);
  return rawSvg
    .replace(/#323232/gi, p)
    .replace(/#252525/gi, shadow)
    .replace(/#A7A7A7/gi, s);
}

// Cleats: kept dark by default — black cleats are universal in
// football and the four dark-gray tones already give shape. Pass
// a primary to recolor (future store cosmetic).
export function tintCleats(rawSvg: string, primary?: string | null): string {
  if (!primary) return rawSvg;
  const p = normalizeHex(primary);
  return rawSvg
    .replace(/#252525/gi, darken(p, 0.10))
    .replace(/#262626/gi, p)
    .replace(/#323232/gi, p)
    .replace(/#484848/gi, lighten(p, 0.12));
  // #7C7C7C (sole) is kept as a neutral gray rim regardless.
}

// GK shirt: ~19 grays + several skin-colored torso paths visible at
// the V-neck. We tint *only the grays* here (R≈G≈B within ±12) and
// route the skin tones through `tintSkin` separately. Three buckets
// keyed off the channel mean: lights → highlight, mids → primary,
// darks → shadow, very dark → secondary outline.
export function tintGoalkeeperShirt(rawSvg: string, primary: string, secondary: string): string {
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  const shadow = darken(p, 0.10);
  const highlight = lighten(p, 0.08);
  return rawSvg.replace(/#([0-9A-Fa-f]{6})/g, (full, hex) => {
    const [r, g, b] = hexToRgb(`#${hex}`);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Non-gray pixels (skin tones, the bracos shadow that bleeds in
    // through the V-neck, etc.) are preserved verbatim.
    if (max - min > 12) return full;
    const mean = (r + g + b) / 3;
    if (mean > 200) return highlight;
    if (mean > 150) return p;
    if (mean > 100) return shadow;
    return s;
  });
}

// GK gloves: 13 dark grays. Same bucketing strategy, but always
// dark — caller picks the dominant color. Default keeps them gray
// so outfielders can wear "winter gloves" without recoloring.
export function tintGloves(rawSvg: string, primary?: string | null): string {
  if (!primary) return rawSvg;
  const p = normalizeHex(primary);
  const shadow = darken(p, 0.12);
  const highlight = lighten(p, 0.10);
  return rawSvg.replace(/#([0-9A-Fa-f]{6})/g, (full, hex) => {
    const [r, g, b] = hexToRgb(`#${hex}`);
    const mean = (r + g + b) / 3;
    if (mean > 150) return highlight;
    if (mean > 80)  return p;
    return shadow;
  });
}

// Caneleira: single solid color (#EFEFEF). Caller swaps it out.
export function tintShinGuard(rawSvg: string, color: string): string {
  return rawSvg.replace(/#EFEFEF/gi, normalizeHex(color));
}

// ── Compose ──

export interface ComposeOptions {
  skinTone: string;            // hex (no '#') from SKIN_TONES
  primaryColor: string;        // hex with '#'
  secondaryColor: string;      // hex with '#'
  // Full appearance — drives the DiceBear head (hair / eyes / mouth /
  // beard / accessories). When null, DEFAULT_APPEARANCE is used.
  appearance?: PlayerAppearance | null;
  seed?: string;               // DiceBear deterministic seed
  position?: string | null;    // 'GK' (canonical) or 'GOL' triggers the GK shirt + gloves
  isCaptain?: boolean;
  sockHeight?: 'alto' | 'baixo';
  hasShinGuard?: boolean;
  shinGuardColor?: string;
  cleatColor?: string | null;  // optional cleat tint (default keeps black)
  // Gloves: rendered for any GK and for outfielders with hasWinterGlove.
  // gloveColor tints both. Null/undefined keeps the asset's dark gray.
  gloveColor?: string | null;
  hasWinterGlove?: boolean;
  // Biceps band — same model as the captain band (no "C" letter).
  // Side picks which arm.
  bicepsBandColor?: string | null;
  bicepsBandSide?: 'left' | 'right';
  // Munhequeira (wristband) — single thin band on the wrist.
  wristbandColor?: string | null;
  wristbandSide?: 'left' | 'right';
  // Second skin (compression sleeves / leggings). Side picks which limb(s)
  // get the layer; null color means no second skin.
  secondSkinShirtColor?: string | null;
  secondSkinShirtSide?: 'left' | 'right' | 'both';
  secondSkinPantsColor?: string | null;
  secondSkinPantsSide?: 'left' | 'right' | 'both';
  // Manguito — single-arm sleeve from shoulder to wrist. Sold per arm.
  manguitoColor?: string | null;
  manguitoSide?: 'left' | 'right';
  jerseyNumber?: number | null;
  crestUrl?: string | null;
  numberColor?: string;        // override; defaults to readable foreground
  // When true, the camiseta / camisa_goleiro layer is omitted from the
  // compose. Used in the preview sandbox to inspect the body underneath
  // without the shirt covering it. The crest + number layer is also
  // suppressed because they belong on the shirt.
  hideShirt?: boolean;
  // 'coach' overrides the kit colors with a hardcoded black coach look,
  // hides jersey number + crest + captain band + shin guard, and never
  // renders the GK shirt regardless of position.
  outfit?: 'player' | 'coach';
  // Jersey pattern — drives a <pattern>/<linearGradient> overlay on the
  // camiseta body. Sleeves and shadow detail stay solid. Falls back to
  // 'solid' (no pattern) when null/undefined.
  // Recognized values: 'solid', 'bicolor_horizontal' | '_vertical' |
  // '_diagonal', 'stripe_vertical_single' | '_double' | '_triple',
  // 'stripe_horizontal_*', 'stripe_diagonal_*', 'stripe_*_unique'.
  jerseyPattern?: string | null;

  // ── Cosmetic prototypes (sandbox / future store items) ──
  // Tatuagem no bíceps — separate slots for each arm so a player who
  // bought two tattoos shows both. design = 'tribal' | 'cross' |
  // 'heart' | 'anchor' | 'star'.
  tattooDesignRight?: string | null;
  tattooColorRight?: string;
  tattooDesignLeft?: string | null;
  tattooColorLeft?: string;
  // Pintura facial. design = 'brasil' | 'horizontal' | 'two_stripes' | 'wings'.
  facePaintDesign?: string | null;
  facePaintColor?: string;
  facePaintColor2?: string;
  // Brinco — pequena bolinha na orelha.
  hasEarring?: boolean;
  earringSide?: 'left' | 'right' | 'both';
  earringColor?: string;
  // Faixa de cabelo (rambo style) na testa.
  hasHeadband?: boolean;
  headbandColor?: string;
  // Cordão (necklace) — V no peito, em cima da camisa.
  hasNecklace?: boolean;
  necklaceColor?: string;
  // Pulseira — anel fino no pulso (mais delicado que a munhequeira).
  // Single wrist only — cada compra = um braço.
  hasBracelet?: boolean;
  braceletSide?: 'left' | 'right';
  braceletColor?: string;
  // Bandana — pano amarrado em volta da cabeça.
  hasBandana?: boolean;
  bandanaColor?: string;
}

// Coach kit (matches V1's COACH_SHIRT / COACH_SHIRT_DETAIL constants
// so faces stay consistent between V1 back-view and V2 front).
const COACH_SHIRT_PRIMARY   = '#0A0A0A';
const COACH_SHIRT_SECONDARY = '#1A1A1A';
const COACH_PANTS           = '#0D0D0D';

// ─── Head position knobs ─────────────────────────────────────────
// The face SVG (head/headv2.svg) lives in its own 280×280 viewBox.
// We scale it up and translate it into the chest-up region of the
// outer 1024×1536 viewBox. Affects BOTH the back layer (head + face
// features + hair) AND the front layer (beard) — they share the same
// transform so the beard stays aligned with the chin.
//
//   HEAD_SCALE       — 1.0 = native 280px. Higher = bigger head.
//                      ↑ aumenta = cabeça maior; ↓ diminui = menor.
//   HEAD_TRANSLATE_X — desloc horizontal. ↑ = direita, ↓ = esquerda.
//   HEAD_TRANSLATE_Y — desloc vertical.   ↑ = desce, ↓ = sobe.
const HEAD_SCALE       = 1.7;
const HEAD_TRANSLATE_X = 285;
const HEAD_TRANSLATE_Y = 38;

// Wrap any face-layer inner content in the head's outer transform so
// it lands at the right position over the body. Used twice per avatar
// (back layer → composeFaceBack, front layer → composeFaceFront).
function wrapHeadLayer(inner: string): string {
  if (!inner) return '';
  return `<g transform="translate(${HEAD_TRANSLATE_X} ${HEAD_TRANSLATE_Y}) scale(${HEAD_SCALE})">${inner}</g>`;
}

function buildHeadBackSvg(appearance: PlayerAppearance): string {
  return wrapHeadLayer(composeFaceBack(appearance));
}

function buildHeadFrontSvg(appearance: PlayerAppearance): string {
  return wrapHeadLayer(composeFaceFront(appearance));
}

// Per-leg nudge on caneleira. The asset has two <g rotate(...)> groups,
// one per leg; we add a translate before the existing rotate so each
// leg can move independently. Paths centered at x<512 = viewer's left
// shin (player's right), x>=512 = viewer's right shin.
function nudgeCaneleira(
  svg: string,
  leftDx: number, leftDy: number,
  rightDx: number, rightDy: number,
): string {
  return svg.replace(
    /<g transform="rotate\(\s*([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s*\)">/g,
    (_match, deg, cxs, cys) => {
      const cx = parseFloat(cxs);
      const isViewerLeft = cx < 512;
      const dx = isViewerLeft ? leftDx : rightDx;
      const dy = isViewerLeft ? leftDy : rightDy;
      return `<g transform="translate(${dx} ${dy}) rotate(${deg} ${cxs} ${cys})">`;
    },
  );
}

// Generic armband — used by captain (with letter), biceps band, and
// any future arm cosmetic. side='left' = player's left arm = viewer's
// right (x≈688). side='right' = player's right arm = viewer's left
// (mirror around 512). Slight outward tilt so it wraps the biceps.
function armBandSvg(opts: {
  color: string;
  side: 'left' | 'right';
  letter?: string;
  letterColor?: string;
}): string {
  const isLeft = opts.side === 'left';
  const cx = isLeft ? 688 : 336;
  const cy = 560;
  const x = cx - 39;
  const rotation = isLeft ? -5 : 5;
  const letter = opts.letter
    ? `<text x="${cx + 2}" y="${cy + 14}" font-family="'Arial Black', Arial, sans-serif" font-weight="900" font-size="40" fill="${opts.letterColor ?? '#ffffff'}" text-anchor="middle">${opts.letter}</text>`
    : '';
  return `<g transform="rotate(${rotation} ${cx} ${cy})">
  <rect x="${x}" y="520" width="78" height="15" fill="${opts.color}" rx="3" ry="23"/>
  ${letter}
</g>`;
}

// Munhequeira (wristband) — slim band at the wrist. side= same
// convention as the biceps band. Slight tilt mirrors the arm slope.
function wristbandSvg(color: string, side: 'left' | 'right'): string {
  const isLeft = side === 'left';
  const cx = isLeft ? 715 : 270;
  const cy = 935;
  const x = cx - 5;
  const rotation = isLeft ? -8 : 8;
  return `<g transform="rotate(${rotation} ${cx} ${cy})">
  <rect x="${x}" y="780" width="50" height="22" fill="${color}" rx="3" ry="3"/>
</g>`;
}

// Captain band: black armband with white "C" on the player's left
// arm (viewer's right). Coordinates picked from the JPEG ref to
// sit on the upper biceps.
function captainBandSvg(): string {
  // Slight clockwise rotation around the band's own center so the
  // armband visually wraps the slope of the upper biceps instead of
  // sitting as a flat horizontal patch.
  const bandCenterX = 688;
  const bandCenterY = 528;
  const bandRotateDeg = -5;
  return `<g transform="rotate(${bandRotateDeg} ${bandCenterX} ${bandCenterY})">
  <rect x="649" y="500" width="78" height="56" fill="#1a1a1a" rx="3" ry="23"/>
  <text x="690" y="542" font-family="'Arial Black', Arial, sans-serif" font-weight="900" font-size="40" fill="#ffffff" text-anchor="middle">C</text>
</g>`;
}

// Crest on the chest, jersey number on the chest. Both optional.
// Coordinates aligned with the V-neck of camiseta.
//
// Knobs (edit these to nudge crest/number into place — they affect
// every render, including the live game):
//   crestX/Y       = top-left corner of the crest image
//   crestSize      = bounding box (square)
//   numberX/Y      = anchor point for the number text (text-anchor="middle")
//   numberSize     = font-size in user units
// When crestUrl is null, a dashed placeholder square is drawn at the
// same coordinates so the position is visible while iterating.
function crestAndNumberSvg(opts: ComposeOptions): string {
  const crestX    = 430;
  const crestY    = 460;
  const crestSize = 80;
  const numberX    = 564;
  const numberY    = 520;
  const numberSize = 50;

  const parts: string[] = [];
  if (opts.crestUrl) {
    parts.push(
      `<image href="${opts.crestUrl}" x="${crestX}" y="${crestY}" width="${crestSize}" height="${crestSize}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  } else {
    // Placeholder — dashed square so the slot is visible during dev.
    parts.push(
      `<rect x="${crestX}" y="${crestY}" width="${crestSize}" height="${crestSize}" fill="rgba(0,0,0,0.05)" stroke="#888" stroke-width="2" stroke-dasharray="4 3" rx="6"/>`,
      `<text x="${crestX + crestSize / 2}" y="${crestY + crestSize / 2 + 6}" font-family="Arial, sans-serif" font-size="14" fill="#666" text-anchor="middle">crest</text>`,
    );
  }
  if (opts.jerseyNumber != null) {
    const fill = opts.numberColor ?? '#ffffff';
    parts.push(
      `<text x="${numberX}" y="${numberY}" font-family="'Arial Black', Arial, sans-serif" font-weight="900" font-size="${numberSize}" fill="${fill}" text-anchor="middle">${opts.jerseyNumber}</text>`,
    );
  }
  return parts.length ? `<g>${parts.join('')}</g>` : '';
}

// ─────────────────────────────────────────────────────────────
// Cosmetic prototypes — inline SVG primitives so Pedro can see
// where each item could sit on the avatar before authoring real
// SVG assets. Coordinates are in the outer 1024×1536 viewBox.
// ─────────────────────────────────────────────────────────────

// Tatuagem no bíceps. The bare-arm zone visible below the jersey
// sleeve cuff is roughly y=560-720, x=290-360 (right) / x=660-730
// (left). Designs are simple inline path snippets.
function tattooSvg(
  design: string | null | undefined,
  side: 'left' | 'right' = 'right',
  color: string = '#1A1A1A',
): string {
  if (!design || design === 'none') return '';
  const draw = (cx: number, cy: number) => {
    if (design === 'tribal')
      // Koru-inspired: 4 curved flames pointing outward from a central
      // dot. Reads cleanly at any zoom and looks like classic tribal/
      // Polynesian art.
      return `<g fill="${color}">
        <path d="M${cx},${cy-22} q-4,10 -9,14 q5,3 9,3 q4,0 9,-3 q-5,-4 -9,-14z"/>
        <path d="M${cx},${cy+22} q-4,-10 -9,-14 q5,-3 9,-3 q4,0 9,3 q-5,4 -9,14z"/>
        <path d="M${cx-22},${cy} q10,-4 14,-9 q3,5 3,9 q0,4 -3,9 q-4,-5 -14,-9z"/>
        <path d="M${cx+22},${cy} q-10,-4 -14,-9 q-3,5 -3,9 q0,4 3,9 q4,-5 14,-9z"/>
        <circle cx="${cx}" cy="${cy}" r="3"/>
      </g>`;
    if (design === 'cross')
      return `<path d="M${cx-3},${cy-18} h6 v10 h10 v6 h-10 v18 h-6 v-18 h-10 v-6 h10z" fill="${color}"/>`;
    if (design === 'heart')
      return `<path d="M${cx-14},${cy-4} a8,8 0 0 1 14,-3 a8,8 0 0 1 14,3 q0,12 -14,22 q-14,-10 -14,-22z" fill="${color}"/>`;
    if (design === 'anchor')
      return `<g stroke="${color}" stroke-width="3" fill="none">
        <circle cx="${cx}" cy="${cy-16}" r="3"/>
        <line x1="${cx}" y1="${cy-13}" x2="${cx}" y2="${cy+10}"/>
        <line x1="${cx-9}" y1="${cy-6}" x2="${cx+9}" y2="${cy-6}"/>
        <path d="M${cx-12},${cy+8} q4,8 12,8 q8,0 12,-8" stroke-width="3"/>
      </g>`;
    if (design === 'star')
      return `<path d="M${cx},${cy-14} l4,12 l13,0 l-10,8 l4,12 l-11,-8 l-11,8 l4,-12 l-10,-8 l13,0z" fill="${color}"/>`;
    return '';
  };
  // Right = player's right (viewer's left, x≈325). Left = player's
  // left (viewer's right, x≈699).
  return side === 'right' ? draw(325, 600) : draw(699, 600);
}

// Pintura facial. Cheeks are around y=300-340, left cheek x=420-460,
// right cheek x=565-605 in the outer viewBox after the head transform
// places DiceBear at (260, 20) scale 1.8. Drawn as overlay paths
// AFTER the head back layer so the eyes/nose don't get covered.
function facePaintSvg(
  design: string | null | undefined,
  color1: string = '#FFD600',
  color2: string = '#0066CC',
): string {
  if (!design || design === 'none') return '';
  if (design === 'brasil') {
    // Two horizontal bars per cheek: yellow on top, blue below.
    return `
      <rect x="425" y="270" width="40" height="6" fill="${color1}" rx="2"/>
      <rect x="425" y="278" width="40" height="6" fill="${color2}" rx="2"/>
      <rect x="555" y="270" width="40" height="6" fill="${color1}" rx="2"/>
      <rect x="555" y="278" width="40" height="6" fill="${color2}" rx="2"/>`;
  }
  if (design === 'horizontal') {
    // Single horizontal stripe across the nose.
    return `<rect x="412" y="242" width="190" height="10" fill="${color1}" rx="3" opacity="0.85"/>`;
  }
  if (design === 'two_stripes') {
    // Two vertical lines under each eye (war paint).
    return `
      <rect x="440" y="245" width="45" height="10" fill="${color1}" rx="2"/>
      <rect x="440" y="257" width="45" height="10" fill="${color2}" rx="2"/>
      <rect x="535" y="245" width="45" height="10" fill="${color1}" rx="2"/>
      <rect x="535" y="257" width="45" height="10" fill="${color2}" rx="2"/>`;
  }
  if (design === 'wings') {
    // Diagonal wing flicks coming off each cheekbone.
    return `
      <path d="M460,290 q-15,5 -28,16 q22,-3 32,-6z" fill="${color1}"/>
      <path d="M560,290 q15,5 28,16 q-22,-3 -32,-6z" fill="${color1}"/>`;
  }
  return '';
}

// Brinco — bolinha (stud) na orelha. Right ear ≈ (382, 270),
// left ear ≈ (642, 270) in the outer viewBox.
function earringSvg(
  side: 'left' | 'right' | 'both' = 'both',
  color: string = '#FFD600',
): string {
  const stud = (cx: number, cy: number) =>
    `<circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="#000" stroke-width="0.8"/>`;
  let out = '';
  if (side === 'right' || side === 'both') out += stud(408, 260);
  if (side === 'left'  || side === 'both') out += stud(610, 260);
  return out;
}

// Headband — faixa fina horizontal na testa, em cima do cabelo
// (renderiza DEPOIS do head back). Cobre x=400-625 a y=160-185.
function headbandSvg(color: string = '#D32F2F'): string {
  return `<rect x="410" y="150" width="200" height="30" fill="${color}" rx="3"/>`;
}

// Cordão (necklace) — corrente em V vindo do pescoço descendo no peito,
// rendered ON TOP of the camiseta so it stays visible regardless of the kit.
function necklaceSvg(color: string = '#FFD600'): string {
  return `<g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round">
    <path d="M455,395 q57,55 114,0"/>
    <circle cx="512" cy="438" r="6" fill="${color}"/>
  </g>`;
}

// Pulseira — anel fino no pulso (mais delicado que a munhequeira de
// tecido). Single wrist only — cada compra = um braço.
// Right wrist ≈ (310, 800), left wrist ≈ (715, 800).
function braceletSvg(
  side: 'left' | 'right' = 'right',
  color: string = '#C9A227',
): string {
  const ring = (cx: number, cy: number) =>
    `<rect x="${cx-22}" y="${cy}" width="44" height="6" fill="${color}" rx="3" opacity="0.9"/>`;
  return side === 'right' ? ring(310, 800) : ring(715, 800);
}

// Bandana — pano amarrado em volta da cabeça (estilo Rambo). Renderiza
// em cima do cabelo. Cobre x=388-636, y=148 com nó saindo pela direita.
function bandanaSvg(color: string = '#D32F2F'): string {
  return `<g>
    <rect x="400" y="160" width="210" height="20" fill="${color}" rx="4"/>
    <path d="M595,160 q24,-2 28,18 q-22,4 -32,-2 z" fill="${color}"/>
    <path d="M620,175 q12,8 22,18" stroke="${color}" stroke-width="6" fill="none"/>
  </g>`;
}

export function composePlayerSvg(opts: ComposeOptions): string {
  const isCoach = opts.outfit === 'coach';
  // GK shirt and captain band don't apply to coaches.
  // Accept both 'GK' (canonical, from POSITIONS catalog) and the
  // legacy 'GOL' V1 used to pass through its delegation.
  const isGK = !isCoach && (opts.position === 'GK' || opts.position === 'GOL');
  const sockSrc = opts.sockHeight === 'baixo' ? innerMeiaoBaixo : innerMeiaoAlto;
  // Coach overrides team colors. Pattern is forced solid because the
  // formal coach kit doesn't follow the player jersey rules.
  const kitPrimary   = isCoach ? COACH_SHIRT_PRIMARY   : opts.primaryColor;
  const kitSecondary = isCoach ? COACH_SHIRT_SECONDARY : opts.secondaryColor;
  const kitPattern   = isCoach ? 'solid'              : (opts.jerseyPattern ?? 'solid');
  const shortsColor  = isCoach ? COACH_PANTS          : opts.primaryColor;

  // Goalkeeper shirt: tint grays first (→ team colors), then run
  // tintSkin to repaint the V-neck torso patches with the player's
  // skin tone. The two passes are independent because the grays use
  // a chroma test (R≈G≈B) while skin uses an exact-match catalog.
  // The asset was authored slightly narrower than the regular jersey,
  // so we wrap it in a horizontal-stretch transform centered at the
  // player's vertical axis. Any head-area artefacts inside the asset
  // (the original drawing peeks above the collar) are hidden by the
  // cabeca layer which renders later on top.
  const gkScaleX = 1.075;
  const gkScaleY = 1;
  const gkPivotX = 470;
  const gkPivotY = 620;
  // Vertical nudge — negative shifts the shirt up to meet the chin.
  const gkOffsetY = -45;
  const torso = isGK
    ? `<g transform="translate(${gkPivotX} ${gkPivotY + gkOffsetY}) scale(${gkScaleX} ${gkScaleY}) translate(${-gkPivotX} ${-gkPivotY})">${
        tintSkin(tintGoalkeeperShirt(innerCamisaGoleiro, opts.primaryColor, opts.secondaryColor), opts.skinTone)
      }</g>`
    : tintJersey(innerCamiseta, kitPrimary, kitSecondary, kitPattern);

  // Z-order (back→front): perna → bracos → caneleira → meião →
  // chuteira → bermuda → camiseta → cabeça → overlays. The
  // caneleira sits *behind* the sock so that the sock visually
  // covers it (real-life shin guards are worn under the sock —
  // visible only where the sock doesn't reach). Cabeça stays last
  // among the body layers because it includes the head silhouette
  // and features that should never be obscured.
  // Caneleira nudge knobs — shifts each leg's shin guard separately.
  // viewer left  / player right shin: leftLegShinDx/Dy (negative = pra fora)
  // viewer right / player left  shin: rightLegShinDx/Dy (positive = pra fora)
  const leftLegShinDx  = -6;
  const leftLegShinDy  = 0;
  const rightLegShinDx = 6;
  const rightLegShinDy = 0;
  const caneleira = opts.hasShinGuard && opts.shinGuardColor
    ? nudgeCaneleira(
        tintShinGuard(innerCaneleira, opts.shinGuardColor),
        leftLegShinDx, leftLegShinDy,
        rightLegShinDx, rightLegShinDy,
      )
    : '';

  // Second skin (compression sleeves / leggings): tinted copies of the
  // bracos / perna assets, filtered to the chosen side(s). Rendered
  // BETWEEN the bare-skin layer and the jersey/shorts so the upper
  // portion is naturally hidden under the kit.
  const secondSkinLeggings = opts.secondSkinPantsColor
    ? tintAllFills(
        filterPathsBySide(innerPerna, opts.secondSkinPantsSide ?? 'both'),
        opts.secondSkinPantsColor,
      )
    : '';
  // Sleeve cutoff Y — second skin stops here so the hand stays bare.
  // The bracos asset's paths reach down into the hand area (y≈900-1000);
  // we clip the tinted layer above the wrist so the natural skin shows
  // on the hand. Lower this if the sleeve still bleeds into the hand;
  // raise it if the sleeve gets cut too short.
  const sleeveClipBottomY = 815;
  const secondSkinSleeves = opts.secondSkinShirtColor
    ? `<defs><clipPath id="v2sleeveClip"><rect x="0" y="0" width="1024" height="${sleeveClipBottomY}"/></clipPath></defs>
       <g clip-path="url(#v2sleeveClip)">${
         tintAllFills(
           filterPathsBySide(innerBracos, opts.secondSkinShirtSide ?? 'both'),
           opts.secondSkinShirtColor,
         )
       }</g>`
    : '';

  // Manguito — single-arm sleeve, shoulder to wrist. Mechanically the
  // same paint-the-bracos-arm trick as the segunda pele camiseta but
  // sold as its own item with a forced single side (cada compra = um
  // braço). Renders alongside the second-skin sleeves so a player can
  // own both at once on different arms.
  const manguito = opts.manguitoColor && opts.manguitoSide
    ? `<g clip-path="url(#v2sleeveClip)">${
         tintAllFills(
           filterPathsBySide(innerBracos, opts.manguitoSide),
           opts.manguitoColor,
         )
       }</g>`
    : '';

  // Outfielder winter glove: paint just the hand region of the bracos
  // asset (below the second-skin cutoff) with gloveColor. Goalkeepers
  // keep the dedicated luvas asset overlay further down. Mirror clip
  // of secondSkinSleeves so the glove starts exactly where the second
  // skin stops.
  const outfielderWinterGlove = !isGK && opts.hasWinterGlove && opts.gloveColor
    ? `<defs><clipPath id="v2gloveClip"><rect x="0" y="${sleeveClipBottomY}" width="1024" height="${1536 - sleeveClipBottomY}"/></clipPath></defs>
       <g clip-path="url(#v2gloveClip)">${
         tintAllFills(innerBracos, opts.gloveColor)
       }</g>`
    : '';

  const appearance = opts.appearance ?? DEFAULT_APPEARANCE;
  const seed = opts.seed ?? 'avatarV2';

  const layers: string[] = [
    // Head BACK layer goes FIRST (behind body): silhouette + eyes,
    // eyebrows, nose, mouth, accessories, hair top. The neck shadow
    // sits behind the camiseta so the collar covers it cleanly.
    buildHeadBackSvg(appearance),
    tintSkin(innerPerna, opts.skinTone),
    secondSkinLeggings,
    // When hiding the shirt we also hide the bracos (arms) — the
    // tronco.svg already includes the chest+arm shape. Cosmetics that
    // sit ON the arm (segunda pele de manga, luva de inverno) keep
    // rendering so the player still sees everything they bought.
    opts.hideShirt ? '' : tintSkin(innerBracos, opts.skinTone),
    secondSkinSleeves,
    manguito,
    outfielderWinterGlove,
    caneleira,
    tintSocks(sockSrc, opts.primaryColor, opts.secondaryColor),
    tintCleats(innerChuteira, opts.cleatColor ?? null),
    tintShorts(innerBermuda, shortsColor),
    // Bare torso swap: replaces both the camiseta and the bracos
    // when hideShirt is on. Skin-tinted from the same skinTone so
    // it matches the head + legs.
    opts.hideShirt ? tintSkin(innerTronco, opts.skinTone) : torso,
    (opts.hideShirt || isCoach) ? '' : crestAndNumberSvg(opts),
    // Head FRONT layer (just facialHair) renders AFTER the camiseta
    // so big beards drape naturally over the collar. Empty when the
    // player has no beard selected.
    buildHeadFrontSvg(appearance),
  ];

  // GK glove asset: only goalkeepers wear the full luvas overlay.
  // Outfielder "winter glove" is handled earlier as a tinted hand
  // region of the bracos asset (see outfielderWinterGlove above).
  const showGloves = isGK;
  if (showGloves) {
    // Shared (pair) transform — moves BOTH gloves together.
    const gloveScale   = 1;
    const gloveOffsetX = 12;
    const gloveOffsetY = -16;
    const glovePivotX  = 300;
    const glovePivotY  = 275;
    // Per-hand fine adjustments — translation + rotation around each
    // hand's own center. Right hand = player's right (viewer's left,
    // x<512). Left hand = player's left (viewer's right, x≥512).
    const rightHandDx        = -18;
    const rightHandDy        = 0;
    const rightHandRotateDeg = 0;
    const rightHandPivotX    = 320;   // approximate center of right glove
    const rightHandPivotY    = 855;
    const leftHandDx         = 0;
    const leftHandDy         = 0;
    const leftHandRotateDeg  = 5;
    const leftHandPivotX     = 705;   // approximate center of left glove
    const leftHandPivotY     = 870;

    // Split the asset's paths into right-hand vs left-hand groups so
    // each can carry its own translate+rotate transform.
    const allPaths = innerLuvas.match(/<path\b[\s\S]*?\/>/g) ?? [];
    const rightPaths: string[] = [];
    const leftPaths: string[]  = [];
    for (const p of allPaths) {
      const m = p.match(/transform="translate\(\s*([\-\d.]+)/);
      const x = m ? parseFloat(m[1]) : 0;
      if (x < 512) rightPaths.push(p);
      else leftPaths.push(p);
    }
    const repositioned =
      `<g transform="translate(${rightHandDx} ${rightHandDy}) rotate(${rightHandRotateDeg} ${rightHandPivotX} ${rightHandPivotY})">${rightPaths.join('')}</g>` +
      `<g transform="translate(${leftHandDx} ${leftHandDy}) rotate(${leftHandRotateDeg} ${leftHandPivotX} ${leftHandPivotY})">${leftPaths.join('')}</g>`;

    layers.push(
      `<g transform="translate(${glovePivotX + gloveOffsetX} ${glovePivotY + gloveOffsetY}) scale(${gloveScale}) translate(${-glovePivotX} ${-glovePivotY})">${
        tintGloves(repositioned, opts.gloveColor ?? null)
      }</g>`,
    );
  }
  if (opts.bicepsBandColor) {
    layers.push(armBandSvg({
      color: opts.bicepsBandColor,
      side: opts.bicepsBandSide ?? 'left',
    }));
  }
  if (opts.wristbandColor) {
    layers.push(wristbandSvg(opts.wristbandColor, opts.wristbandSide ?? 'left'));
  }
  if (opts.isCaptain && !isCoach) {
    layers.push(captainBandSvg());
  }

  // ── Cosmetic prototypes ──
  // Tattoo on bicep — pushed AFTER bracos but mounted late so the
  // tinted hand region of outfielderWinterGlove doesn't paint over
  // it. Currently lives at the end of the stack which is fine because
  // the bicep area is below the camiseta sleeve cuff.
  if (opts.tattooDesignRight && opts.tattooDesignRight !== 'none') {
    layers.push(tattooSvg(opts.tattooDesignRight, 'right', opts.tattooColorRight ?? '#1A1A1A'));
  }
  if (opts.tattooDesignLeft && opts.tattooDesignLeft !== 'none') {
    layers.push(tattooSvg(opts.tattooDesignLeft, 'left', opts.tattooColorLeft ?? '#1A1A1A'));
  }
  if (opts.facePaintDesign && opts.facePaintDesign !== 'none') {
    layers.push(facePaintSvg(opts.facePaintDesign, opts.facePaintColor ?? '#FFD600', opts.facePaintColor2 ?? '#0066CC'));
  }
  if (opts.hasEarring) {
    layers.push(earringSvg(opts.earringSide ?? 'both', opts.earringColor ?? '#FFD600'));
  }
  if (opts.hasHeadband) {
    layers.push(headbandSvg(opts.headbandColor ?? '#D32F2F'));
  }
  if (opts.hasNecklace) {
    layers.push(necklaceSvg(opts.necklaceColor ?? '#FFD600'));
  }
  if (opts.hasBracelet) {
    layers.push(braceletSvg(opts.braceletSide ?? 'right', opts.braceletColor ?? '#C9A227'));
  }
  if (opts.hasBandana) {
    layers.push(bandanaSvg(opts.bandanaColor ?? '#D32F2F'));
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1536" width="100%" height="100%" preserveAspectRatio="xMidYMax meet">',
    ...layers.filter(Boolean),
    '</svg>',
  ].join('\n');
}
