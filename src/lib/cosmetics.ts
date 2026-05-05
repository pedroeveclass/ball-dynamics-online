import type { CSSProperties } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CosmeticSide = 'left' | 'right';
export type CosmeticLimbSide = CosmeticSide | 'both';
export type WinterGloveSleeve = 'long' | 'short';

export interface PlayerCosmetics {
  // Hex of the actively-equipped boots' main body / upper, if any.
  bootsColor: string | null;
  // Sole + contour color of the active boots.
  bootsColorSecondary: string | null;
  // Studs (travas) color of the active boots.
  bootsColorStuds: string | null;
  // Final color the avatar should paint on the glove. Winter-glove cosmetic
  // wins over the gloves-category equipment when both are active so the
  // player sees the cosmetic they just bought (matches "pro goleiro também"
  // — the GK can override their kit glove with a winter-glove pick).
  gloveColor: string | null;
  // True when the player has the "Luva de Inverno" cosmetic active. Forces
  // the avatar to render gloves on outfielders; for goalkeepers it just
  // unlocks the alternate color and sleeve choice.
  hasWinterGlove: boolean;
  // Sleeve length picked at equip time for the winter glove. 'long' draws
  // the full GK-style sleeve; 'short' shows a bare arm with the glove on
  // the hand only. Null = treat as 'long' for back-compat with rows
  // equipped before this picker existed.
  winterGloveSleeve: WinterGloveSleeve | null;
  // Wristband (Munhequeira) — single arm only, side picked at equip.
  wristbandColor: string | null;
  wristbandSide: CosmeticSide | null;
  // Biceps band — same per-arm pattern.
  bicepsBandColor: string | null;
  bicepsBandSide: CosmeticSide | null;
  // Caneleira (shin guards) — both legs, no side choice.
  shinGuardColor: string | null;
  // Short-socks cosmetic. No color — just a toggle that swaps the
  // default knee-high sock for a low ankle band. As of 2026-05-04 the
  // default is "alto" (no purchase needed); buying "Meião Curto"
  // flips this to true.
  hasShortSocks: boolean;
  // Second-skin (compression) layers — paint the visible skin of the arms
  // / legs with the picked color so it reads as a tight underlayer. Hand
  // stays bare for the top, foot stays bare for the tights. Side picks
  // which limb(s) the layer applies to: 'both' / 'left' / 'right'.
  secondSkinShirtColor: string | null;
  secondSkinShirtSide: CosmeticLimbSide | null;
  secondSkinPantsColor: string | null;
  secondSkinPantsSide: CosmeticLimbSide | null;
  // Visual background — paints the area behind the avatar in the profile /
  // public-page Visual section. Driven by the "Fundo do Visual" cosmetic.
  // backgroundVariant chooses how to compose color1 + color2 (or the
  // uploaded image). Re-buy is required to change variant or photo.
  backgroundVariant: BackgroundVariant | null;
  backgroundColor: string | null;
  backgroundColor2: string | null;
  backgroundImageUrl: string | null;
  // ── Phase-6 cosmetic prototypes (V2-only) ──
  // Tatuagem no bíceps — separate slot per arm so a player who bought
  // two tattoos shows both. design + color persisted at buy time.
  tattooDesignRight: string | null;
  tattooColorRight: string | null;
  tattooDesignLeft: string | null;
  tattooColorLeft: string | null;
  // Pintura facial. design + 1-2 colors.
  facePaintDesign: string | null;
  facePaintColor: string | null;
  facePaintColor2: string | null;
  // Brinco — color + side (or both).
  earringColor: string | null;
  earringSide: CosmeticLimbSide | null;
  // Headband — single color.
  headbandColor: string | null;
  // Cordão (necklace) — silver or gold tier; color is hardcoded by tier.
  necklaceColor: string | null;
  // Pulseira (bracelet) — silver/gold tier + side (single arm only).
  braceletColor: string | null;
  braceletSide: CosmeticSide | null;
  // Bandana — single color.
  bandanaColor: string | null;
  // Modo sem camisa — boolean toggle. The torso renders without the shirt
  // (the V2 swap to tronco.svg).
  hasShirtless: boolean;
  // Óculos — variant id picked from the catalog (sunglasses, kurt, etc.).
  accessoryVariant: string | null;
}

export type BackgroundVariant =
  | 'solid'
  | 'gradient_vertical' | 'gradient_horizontal' | 'gradient_diagonal'
  | 'stripes_vertical' | 'stripes_horizontal' | 'stripes_diagonal'
  | 'checker' | 'dots' | 'image';

const EMPTY: PlayerCosmetics = {
  bootsColor: null,
  bootsColorSecondary: null,
  bootsColorStuds: null,
  gloveColor: null,
  hasWinterGlove: false,
  winterGloveSleeve: null,
  wristbandColor: null,
  wristbandSide: null,
  bicepsBandColor: null,
  bicepsBandSide: null,
  shinGuardColor: null,
  hasShortSocks: false,
  secondSkinShirtColor: null,
  secondSkinShirtSide: null,
  secondSkinPantsColor: null,
  secondSkinPantsSide: null,
  backgroundVariant: null,
  backgroundColor: null,
  backgroundColor2: null,
  backgroundImageUrl: null,
  tattooDesignRight: null,
  tattooColorRight: null,
  tattooDesignLeft: null,
  tattooColorLeft: null,
  facePaintDesign: null,
  facePaintColor: null,
  facePaintColor2: null,
  earringColor: null,
  earringSide: null,
  headbandColor: null,
  necklaceColor: null,
  braceletColor: null,
  braceletSide: null,
  bandanaColor: null,
  hasShirtless: false,
  accessoryVariant: null,
};

// Cosmetic items whose color we treat as a "winter glove": same visual
// treatment as the GK glove arm. Matched by the canonical seed name so we
// don't depend on environment-specific UUIDs.
const WINTER_GLOVE_NAMES = new Set(['Luva de Inverno', 'Winter Gloves']);
const WRISTBAND_NAMES = new Set(['Munhequeira', 'Wristband']);
const BICEPS_BAND_NAMES = new Set(['Biceps Band', 'Bicep Band', 'Braçadeira de Bíceps']);
const SHIN_GUARD_NAMES = new Set(['Caneleira Personalizada', 'Custom Shin Guards']);
// Legacy name — left here so any old "Meião Comprido" purchase rows
// don't blow up the aggregator, but it no longer flips a flag (alto is
// the default now). Replaced by SHORT_SOCKS_NAMES below.
const SHORT_SOCKS_NAMES = new Set(['Meião Curto', 'Short Socks']);
const SECOND_SKIN_SHIRT_NAMES = new Set(['Camiseta Segunda Pele', 'Compression Top']);
const SECOND_SKIN_PANTS_NAMES = new Set(['Calça Segunda Pele', 'Compression Tights']);
const VISUAL_BG_NAMES = new Set(['Fundo do Visual', 'Visual Background']);
const TATTOO_NAMES = new Set(['Tatuagem', 'Tattoo']);
const FACE_PAINT_NAMES = new Set(['Pintura Facial', 'Face Paint']);
const EARRING_NAMES = new Set(['Brinco', 'Earring']);
const HEADBAND_V2_NAMES = new Set(['Headband']);
const NECKLACE_SILVER_NAMES = new Set(['Cordão de Prata', 'Silver Necklace']);
const NECKLACE_GOLD_NAMES = new Set(['Cordão de Ouro', 'Gold Necklace']);
const BRACELET_SILVER_NAMES = new Set(['Pulseira de Prata', 'Silver Bracelet']);
const BRACELET_GOLD_NAMES = new Set(['Pulseira de Ouro', 'Gold Bracelet']);
const BANDANA_NAMES = new Set(['Bandana']);
const SHIRTLESS_NAMES = new Set(['Modo Sem Camisa', 'Shirtless Mode']);
const GLASSES_NAMES = new Set(['Óculos', 'Glasses']);

// Hardcoded colors per tier so silver/gold reads consistently regardless
// of what (if anything) was stored on the purchase row.
const SILVER_HEX = '#C9C9C9';
const GOLD_HEX   = '#C9A227';

const VALID_BG_VARIANTS = new Set<BackgroundVariant>([
  'solid', 'gradient_vertical', 'gradient_horizontal', 'gradient_diagonal',
  'stripes_vertical', 'stripes_horizontal', 'stripes_diagonal',
  'checker', 'dots', 'image',
]);

function normalizeBgVariant(s: any): BackgroundVariant | null {
  return typeof s === 'string' && VALID_BG_VARIANTS.has(s as BackgroundVariant) ? (s as BackgroundVariant) : null;
}

function matchesAny(item: any, set: Set<string>): boolean {
  return set.has(item.name) || (item.name_pt != null && set.has(item.name_pt)) || (item.name_en != null && set.has(item.name_en));
}

function normalizeSide(s: any): CosmeticSide | null {
  return s === 'left' || s === 'right' ? s : null;
}

function normalizeSleeve(s: any): WinterGloveSleeve | null {
  return s === 'long' || s === 'short' ? s : null;
}

function normalizeLimbSide(s: any): CosmeticLimbSide | null {
  return s === 'left' || s === 'right' || s === 'both' ? s : null;
}

// Reads the active equipment + cosmetic purchase rows for a player and
// returns the colors the player picked at buy time. Used by the player
// visual to tint cleats, goalkeeper gloves, and (via the winter-glove
// cosmetic) outfielder gloves. Returns empty when no equipment is active
// or when rows pre-date the color feature.
export async function fetchPlayerCosmetics(playerProfileId: string): Promise<PlayerCosmetics> {
  if (!playerProfileId) return EMPTY;

  // Both 'active' and 'cancelling' subscriptions still drive the visual —
  // the item is in use until the renewal date passes (mirrors the bonus
  // reader). 'inventory' explicitly does not, so unequipped equipment never
  // affects the avatar.
  // Going through the SECURITY DEFINER RPC instead of direct table reads
  // because the base RLS only allows the row owner + the player's club
  // manager to SELECT store_purchases. Public-page viewers (other users,
  // anon) would get zero rows and the avatar would render bare.
  const { data: rows } = await (supabase as any).rpc('get_player_cosmetics_public', {
    p_player_profile_id: playerProfileId,
  });

  if (!rows || rows.length === 0) return EMPTY;

  // Re-shape into the same structure the rest of the loop expects:
  // an array of "purchase" rows + an item lookup keyed by store_item_id.
  const purchases = rows as any[];
  const itemById = new Map(purchases.map((r: any) => [r.store_item_id, {
    id: r.store_item_id,
    name: r.item_name,
    name_pt: r.item_name_pt,
    name_en: r.item_name_en,
    category: r.item_category,
  }]));

  let bootsColor: string | null = null;
  let bootsColorSecondary: string | null = null;
  let bootsColorStuds: string | null = null;
  let gkGloveColor: string | null = null;
  let winterGloveColor: string | null = null;
  let winterGloveSleeve: WinterGloveSleeve | null = null;
  let wristbandColor: string | null = null;
  let wristbandSide: CosmeticSide | null = null;
  let bicepsBandColor: string | null = null;
  let bicepsBandSide: CosmeticSide | null = null;
  let shinGuardColor: string | null = null;
  let hasShortSocks = false;
  let secondSkinShirtColor: string | null = null;
  let secondSkinShirtSide: CosmeticLimbSide | null = null;
  let secondSkinPantsColor: string | null = null;
  let secondSkinPantsSide: CosmeticLimbSide | null = null;
  let backgroundVariant: BackgroundVariant | null = null;
  let backgroundColor: string | null = null;
  let backgroundColor2: string | null = null;
  let backgroundImageUrl: string | null = null;
  let tattooDesignRight: string | null = null;
  let tattooColorRight: string | null = null;
  let tattooDesignLeft: string | null = null;
  let tattooColorLeft: string | null = null;
  let facePaintDesign: string | null = null;
  let facePaintColor: string | null = null;
  let facePaintColor2: string | null = null;
  let earringColor: string | null = null;
  let earringSide: CosmeticLimbSide | null = null;
  let headbandColor: string | null = null;
  let necklaceColor: string | null = null;
  let braceletColor: string | null = null;
  let braceletSide: CosmeticSide | null = null;
  let bandanaColor: string | null = null;
  let hasShirtless = false;
  let accessoryVariant: string | null = null;

  for (const p of purchases as any[]) {
    const it = itemById.get(p.store_item_id);
    if (!it) continue;
    // Short socks toggle has no color — flips the sock from default
    // alto to baixo. (Legacy "Meião Comprido" purchases reach here too
    // but don't match SHORT_SOCKS_NAMES, so they no-op as expected.)
    if (it.category === 'cosmetic' && matchesAny(it, SHORT_SOCKS_NAMES)) {
      hasShortSocks = true;
      continue;
    }
    // Modo Sem Camisa — toggle, no metadata.
    if (it.category === 'cosmetic' && matchesAny(it, SHIRTLESS_NAMES)) {
      hasShirtless = true;
      continue;
    }
    // Cordão prata / ouro — fixed color by tier; no buy-time picker.
    if (it.category === 'cosmetic' && matchesAny(it, NECKLACE_SILVER_NAMES) && !necklaceColor) {
      necklaceColor = SILVER_HEX;
      continue;
    }
    if (it.category === 'cosmetic' && matchesAny(it, NECKLACE_GOLD_NAMES)) {
      necklaceColor = GOLD_HEX; // gold overrides silver if both owned
      continue;
    }
    // Pulseira prata / ouro — fixed color + side from p.side.
    if (it.category === 'cosmetic' && matchesAny(it, BRACELET_SILVER_NAMES) && !braceletColor) {
      braceletColor = SILVER_HEX;
      braceletSide = normalizeSide(p.side);
      continue;
    }
    if (it.category === 'cosmetic' && matchesAny(it, BRACELET_GOLD_NAMES)) {
      braceletColor = GOLD_HEX;
      braceletSide = normalizeSide(p.side) ?? braceletSide;
      continue;
    }
    // Tatuagem — design + color persisted per arm. Each purchase carries
    // its own side, so a player who bought two pieces sees both.
    if (it.category === 'cosmetic' && matchesAny(it, TATTOO_NAMES) && p.tattoo_design) {
      const side = normalizeSide(p.side) ?? 'right';
      if (side === 'right' && !tattooDesignRight) {
        tattooDesignRight = p.tattoo_design;
        tattooColorRight = p.color ?? '#1A1A1A';
      } else if (side === 'left' && !tattooDesignLeft) {
        tattooDesignLeft = p.tattoo_design;
        tattooColorLeft = p.color ?? '#1A1A1A';
      }
      continue;
    }
    // Pintura facial — design + 1-2 colors.
    if (it.category === 'cosmetic' && matchesAny(it, FACE_PAINT_NAMES) && p.face_paint_design) {
      if (!facePaintDesign) {
        facePaintDesign = p.face_paint_design;
        facePaintColor = p.color ?? '#FFD600';
        facePaintColor2 = p.face_paint_color2 ?? null;
      }
      continue;
    }
    // Brinco — color + side (limbSide allows both).
    if (it.category === 'cosmetic' && matchesAny(it, EARRING_NAMES) && p.color) {
      if (!earringColor) {
        earringColor = p.color;
        earringSide = normalizeLimbSide(p.side) ?? 'both';
      }
      continue;
    }
    // Headband V2 — color only.
    if (it.category === 'cosmetic' && matchesAny(it, HEADBAND_V2_NAMES) && p.color && !headbandColor) {
      headbandColor = p.color;
      continue;
    }
    // Bandana — color only.
    if (it.category === 'cosmetic' && matchesAny(it, BANDANA_NAMES) && p.color && !bandanaColor) {
      bandanaColor = p.color;
      continue;
    }
    // Óculos — variant id only (color is baked into the asset).
    if (it.category === 'cosmetic' && matchesAny(it, GLASSES_NAMES) && p.accessory_variant && !accessoryVariant) {
      accessoryVariant = p.accessory_variant;
      continue;
    }
    // Visual background — image variant has no color of its own; the URL
    // is the carrier. Read those fields before the color-required guard.
    if (it.category === 'cosmetic' && matchesAny(it, VISUAL_BG_NAMES) && !backgroundVariant) {
      backgroundVariant = normalizeBgVariant(p.bg_variant);
      backgroundColor = p.color ?? null;
      backgroundColor2 = p.color2 ?? null;
      backgroundImageUrl = p.bg_image_url ?? null;
      continue;
    }
    if (!p.color) continue;
    if (it.category === 'boots') {
      if (!bootsColor) {
        bootsColor = p.color;
        bootsColorSecondary = p.color2 ?? null;
        bootsColorStuds = p.color3 ?? null;
      }
      continue;
    }
    if (it.category === 'gloves') {
      if (!gkGloveColor) gkGloveColor = p.color;
      continue;
    }
    if (it.category !== 'cosmetic') continue;

    if (matchesAny(it, WINTER_GLOVE_NAMES) && !winterGloveColor) {
      winterGloveColor = p.color;
      winterGloveSleeve = normalizeSleeve(p.side);
    } else if (matchesAny(it, WRISTBAND_NAMES) && !wristbandColor) {
      wristbandColor = p.color;
      wristbandSide = normalizeSide(p.side);
    } else if (matchesAny(it, BICEPS_BAND_NAMES) && !bicepsBandColor) {
      bicepsBandColor = p.color;
      bicepsBandSide = normalizeSide(p.side);
    } else if (matchesAny(it, SHIN_GUARD_NAMES) && !shinGuardColor) {
      shinGuardColor = p.color;
    } else if (matchesAny(it, SECOND_SKIN_SHIRT_NAMES) && !secondSkinShirtColor) {
      secondSkinShirtColor = p.color;
      secondSkinShirtSide = normalizeLimbSide(p.side);
    } else if (matchesAny(it, SECOND_SKIN_PANTS_NAMES) && !secondSkinPantsColor) {
      secondSkinPantsColor = p.color;
      secondSkinPantsSide = normalizeLimbSide(p.side);
    }
  }

  return {
    bootsColor,
    bootsColorSecondary,
    bootsColorStuds,
    gloveColor: winterGloveColor || gkGloveColor,
    hasWinterGlove: winterGloveColor != null,
    winterGloveSleeve,
    wristbandColor,
    wristbandSide,
    bicepsBandColor,
    bicepsBandSide,
    shinGuardColor,
    hasShortSocks,
    secondSkinShirtColor,
    secondSkinShirtSide,
    secondSkinPantsColor,
    secondSkinPantsSide,
    backgroundVariant,
    backgroundColor,
    backgroundColor2,
    backgroundImageUrl,
    tattooDesignRight,
    tattooColorRight,
    tattooDesignLeft,
    tattooColorLeft,
    facePaintDesign,
    facePaintColor,
    facePaintColor2,
    earringColor,
    earringSide,
    headbandColor,
    necklaceColor,
    braceletColor,
    braceletSide,
    bandanaColor,
    hasShirtless,
    accessoryVariant,
  };
}

// Maps the background cosmetic state to the inline-style object the visual
// container should receive. Used by both the player profile and the public
// player page so the rendered look is identical.
export function avatarBackgroundStyle(c: PlayerCosmetics): CSSProperties {
  const v = c.backgroundVariant;
  if (!v) return {};
  const a = c.backgroundColor || '#ffffff';
  const b = c.backgroundColor2 || a;
  switch (v) {
    case 'solid':
      return { backgroundColor: a };
    case 'gradient_vertical':
      return { backgroundImage: `linear-gradient(to bottom, ${a}, ${b})` };
    case 'gradient_horizontal':
      return { backgroundImage: `linear-gradient(to right, ${a}, ${b})` };
    case 'gradient_diagonal':
      return { backgroundImage: `linear-gradient(135deg, ${a}, ${b})` };
    case 'stripes_vertical':
      return { backgroundImage: `repeating-linear-gradient(to right, ${a} 0 14px, ${b} 14px 28px)` };
    case 'stripes_horizontal':
      return { backgroundImage: `repeating-linear-gradient(to bottom, ${a} 0 14px, ${b} 14px 28px)` };
    case 'stripes_diagonal':
      return { backgroundImage: `repeating-linear-gradient(45deg, ${a} 0 14px, ${b} 14px 28px)` };
    case 'checker':
      return {
        backgroundColor: a,
        backgroundImage:
          `linear-gradient(45deg, ${b} 25%, transparent 25%), ` +
          `linear-gradient(-45deg, ${b} 25%, transparent 25%), ` +
          `linear-gradient(45deg, transparent 75%, ${b} 75%), ` +
          `linear-gradient(-45deg, transparent 75%, ${b} 75%)`,
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
      };
    case 'dots':
      return {
        backgroundColor: a,
        backgroundImage: `radial-gradient(circle, ${b} 2.5px, transparent 2.5px)`,
        backgroundSize: '18px 18px',
      };
    case 'image':
      return c.backgroundImageUrl ? {
        backgroundImage: `url(${c.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : {};
    default:
      return {};
  }
}
