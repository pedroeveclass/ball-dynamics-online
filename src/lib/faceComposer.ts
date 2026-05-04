// ════════════════════════════════════════════════════════════
// Internal face composer — replaces @dicebear/avataaars at the
// runtime level. Reads the variant SVGs from avatar-redesign/face/
// (extracted via scripts/extract-avataaars.mjs) and assembles a
// face SVG inner-content string from the player's appearance.
//
// Two surfaces are exposed because the head is split across the
// avatar's z-order:
//
//  • composeFaceBack(appearance)  → head silhouette, eyes,
//    eyebrows, nose, mouth, accessories, top (hair).
//    Renders BEHIND the body so the camiseta covers the neck.
//
//  • composeFaceFront(appearance) → just facial hair (beard /
//    moustache). Renders IN FRONT of the body so big beards drape
//    naturally over the camiseta collar.
//
// Tokens (`__SKIN__`, `__HAIR__`, `__FACIAL_HAIR__`, `__ACCESSORY__`,
// `__HAT__`) are baked into the SVG files at extract time. We
// replace them here with the player's chosen colors.
// ════════════════════════════════════════════════════════════

import type { PlayerAppearance } from '@/lib/avatar';

// Vite glob loader — pulls every variant SVG as raw text at build
// time, keyed by file path. Using `eager: true` so the bundle
// includes everything up-front (94 SVGs total ~50KB compressed).
const headAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/base/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const eyesAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/eyes/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const eyebrowsAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/eyebrows/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const mouthAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/mouth/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const noseAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/nose/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const topAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/top/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const facialHairAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/facialHair/*.svg',
  { query: '?raw', import: 'default', eager: true },
);
const accessoriesAssets = import.meta.glob<string>(
  '../../avatar-redesign/face/accessories/*.svg',
  { query: '?raw', import: 'default', eager: true },
);

// Convert glob results from `{ '/path/to/foo.svg': 'svg content' }`
// to `{ foo: 'inner content' }` (with the outer <svg> wrapper
// stripped so we can splice into another SVG).
function buildVariantMap(assets: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [filePath, raw] of Object.entries(assets)) {
    const m = filePath.match(/([^/\\]+)\.svg$/);
    if (!m) continue;
    out[m[1]] = stripSvgWrapper(raw);
  }
  return out;
}

function stripSvgWrapper(raw: string): string {
  return raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
}

const HEAD_VARIANTS        = buildVariantMap(headAssets);
const EYES_VARIANTS        = buildVariantMap(eyesAssets);
const EYEBROWS_VARIANTS    = buildVariantMap(eyebrowsAssets);
const MOUTH_VARIANTS       = buildVariantMap(mouthAssets);
const NOSE_VARIANTS        = buildVariantMap(noseAssets);
const TOP_VARIANTS         = buildVariantMap(topAssets);
const FACIAL_HAIR_VARIANTS = buildVariantMap(facialHairAssets);
const ACCESSORIES_VARIANTS = buildVariantMap(accessoriesAssets);

// Slot transforms — copied verbatim from the headv2 base SVG so
// each variant lands where it was authored. If Pedro renames the
// slots in headv2 these need to mirror.
const SLOT_TRANSFORMS = {
  mouth:       'translate(78 134)',
  nose:        'translate(104 122)',
  eyes:        'translate(76 90)',
  eyebrows:    'translate(76 82)',
  top:         'translate(-1)',
  facialHair:  'translate(49 72)',
  accessories: 'translate(62 42)',
} as const;

// Default color for accessories (matches DiceBear avataaars).
const DEFAULT_ACCESSORY_COLOR = '#262e33';
// Default color for hats — used by hijab/turban/winterHat* hair
// styles. Football kits never use these but the placeholder needs
// a value or the SVG fill is invalid.
const DEFAULT_HAT_COLOR = '#5199E4';

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

// Replace every color token with a real hex. Run once on the
// composed string so each player gets their own colors.
function applyColorTokens(svg: string, opts: {
  skin: string;
  hair: string;
  facialHair: string;
  accessory: string;
  hat: string;
}): string {
  return svg
    .replace(/__SKIN__/g, opts.skin)
    .replace(/__HAIR__/g, opts.hair)
    .replace(/__FACIAL_HAIR__/g, opts.facialHair)
    .replace(/__ACCESSORY__/g, opts.accessory)
    .replace(/__HAT__/g, opts.hat);
}

// Inject a variant's content into the named slot in headv2 by
// finding the empty `<g transform="...">` placeholder and filling it.
function injectSlot(svg: string, transform: string, content: string): string {
  // The headv2 placeholder is either `<g transform="..."/>` (self-
  // closing) or `<g transform="..."></g>` — match both.
  const re = new RegExp(
    `<g transform="${transform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*(?:/>|></g>)`,
    'g',
  );
  return svg.replace(re, `<g transform="${transform}">${content}</g>`);
}

interface FaceColors {
  skin: string;       // hex with #
  hair: string;
  facialHair: string;
  accessory: string;
  hat: string;
}

function resolveColors(a: PlayerAppearance): FaceColors {
  return {
    skin:       normalizeHex(a.skinTone),
    hair:       normalizeHex(a.hairColor),
    facialHair: normalizeHex(a.facialHairColor ?? a.hairColor),
    accessory:  DEFAULT_ACCESSORY_COLOR,
    hat:        DEFAULT_HAT_COLOR,
  };
}

// Pick a variant from a map, falling back to the first key when
// the requested name doesn't exist (so a renamed/removed file
// degrades gracefully instead of producing a blank face).
function pickVariant(
  map: Record<string, string>,
  name: string | null | undefined,
): string {
  if (!name) return '';
  if (map[name]) return map[name];
  const fallback = Object.keys(map)[0];
  return fallback ? map[fallback] : '';
}

// ── Public API ──

export function composeFaceBack(appearance: PlayerAppearance): string {
  const head = HEAD_VARIANTS['head'] ?? HEAD_VARIANTS['headv2'];
  if (!head) {
    console.warn('faceComposer: no base/head.svg or base/headv2.svg found');
    return '';
  }

  let svg = head;
  // Mouth
  svg = injectSlot(svg, SLOT_TRANSFORMS.mouth, pickVariant(MOUTH_VARIANTS, appearance.mouth));
  // Nose (always default — the catalog only has one)
  svg = injectSlot(svg, SLOT_TRANSFORMS.nose, pickVariant(NOSE_VARIANTS, appearance.nose || 'default'));
  // Eyes
  svg = injectSlot(svg, SLOT_TRANSFORMS.eyes, pickVariant(EYES_VARIANTS, appearance.eyes));
  // Eyebrows
  svg = injectSlot(svg, SLOT_TRANSFORMS.eyebrows, pickVariant(EYEBROWS_VARIANTS, appearance.eyebrows));
  // Top (hair) — only if not bald.
  const topContent = appearance.hair === 'noHair'
    ? ''
    : pickVariant(TOP_VARIANTS, appearance.hair);
  svg = injectSlot(svg, SLOT_TRANSFORMS.top, topContent);
  // Accessories
  const accContent = appearance.accessories && appearance.accessories !== 'none'
    ? pickVariant(ACCESSORIES_VARIANTS, appearance.accessories)
    : '';
  svg = injectSlot(svg, SLOT_TRANSFORMS.accessories, accContent);
  // facialHair slot stays empty — composeFaceFront handles it.
  svg = injectSlot(svg, SLOT_TRANSFORMS.facialHair, '');

  // Apply tokens
  return applyColorTokens(svg, resolveColors(appearance));
}

export function composeFaceFront(appearance: PlayerAppearance): string {
  if (!appearance.facialHair || appearance.facialHair === 'none') return '';
  const inner = pickVariant(FACIAL_HAIR_VARIANTS, appearance.facialHair);
  if (!inner) return '';
  // Wrap with the same translate the head uses for facialHair so
  // the beard lands at the right spot when both layers share the
  // outer head transform.
  const wrapped = `<g transform="${SLOT_TRANSFORMS.facialHair}">${inner}</g>`;
  return applyColorTokens(wrapped, resolveColors(appearance));
}
