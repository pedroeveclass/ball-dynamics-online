import { supabase } from '@/integrations/supabase/client';

export type CosmeticSide = 'left' | 'right';

export interface PlayerCosmetics {
  // Hex (#rgb / #rrggbb) of the actively-equipped boots, if any.
  bootsColor: string | null;
  // Final color the avatar should paint on the glove. Winter-glove cosmetic
  // wins over the gloves-category equipment when both are active so the
  // player sees the cosmetic they just bought (matches "pro goleiro também"
  // — the GK can override their kit glove with a winter-glove pick).
  gloveColor: string | null;
  // True when the player has the "Luva de Inverno" cosmetic active. Forces
  // the avatar to render the GK-style sleeved arm + glove on outfielders;
  // for goalkeepers this just unlocks the alternate color.
  hasWinterGlove: boolean;
  // Wristband (Munhequeira) — single arm only, side picked at purchase.
  wristbandColor: string | null;
  wristbandSide: CosmeticSide | null;
  // Biceps band — same per-arm pattern.
  bicepsBandColor: string | null;
  bicepsBandSide: CosmeticSide | null;
  // Caneleira (shin guards) — both legs, no side choice.
  shinGuardColor: string | null;
}

const EMPTY: PlayerCosmetics = {
  bootsColor: null,
  gloveColor: null,
  hasWinterGlove: false,
  wristbandColor: null,
  wristbandSide: null,
  bicepsBandColor: null,
  bicepsBandSide: null,
  shinGuardColor: null,
};

// Cosmetic items whose color we treat as a "winter glove": same visual
// treatment as the GK glove arm. Matched by the canonical seed name so we
// don't depend on environment-specific UUIDs.
const WINTER_GLOVE_NAMES = new Set(['Luva de Inverno', 'Winter Gloves']);
const WRISTBAND_NAMES = new Set(['Munhequeira', 'Wristband']);
const BICEPS_BAND_NAMES = new Set(['Biceps Band', 'Bicep Band', 'Braçadeira de Bíceps']);
const SHIN_GUARD_NAMES = new Set(['Caneleira Personalizada', 'Custom Shin Guards']);

function matchesAny(item: any, set: Set<string>): boolean {
  return set.has(item.name) || (item.name_pt != null && set.has(item.name_pt)) || (item.name_en != null && set.has(item.name_en));
}

function normalizeSide(s: any): CosmeticSide | null {
  return s === 'left' || s === 'right' ? s : null;
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
  const { data: purchases } = await (supabase as any)
    .from('store_purchases')
    .select('store_item_id, color, side, status')
    .eq('player_profile_id', playerProfileId)
    .in('status', ['active', 'cancelling']);

  if (!purchases || purchases.length === 0) return EMPTY;

  const itemIds = [...new Set((purchases as any[]).map(p => p.store_item_id))];
  const { data: items } = await (supabase as any)
    .from('store_items')
    .select('id, name, name_pt, name_en, category')
    .in('id', itemIds)
    .in('category', ['boots', 'gloves', 'cosmetic']);

  if (!items || items.length === 0) return EMPTY;

  const itemById = new Map((items as any[]).map(i => [i.id, i]));

  let bootsColor: string | null = null;
  let gkGloveColor: string | null = null;
  let winterGloveColor: string | null = null;
  let wristbandColor: string | null = null;
  let wristbandSide: CosmeticSide | null = null;
  let bicepsBandColor: string | null = null;
  let bicepsBandSide: CosmeticSide | null = null;
  let shinGuardColor: string | null = null;

  for (const p of purchases as any[]) {
    const it = itemById.get(p.store_item_id);
    if (!it || !p.color) continue;
    if (it.category === 'boots') {
      if (!bootsColor) bootsColor = p.color;
      continue;
    }
    if (it.category === 'gloves') {
      if (!gkGloveColor) gkGloveColor = p.color;
      continue;
    }
    if (it.category !== 'cosmetic') continue;

    if (matchesAny(it, WINTER_GLOVE_NAMES) && !winterGloveColor) {
      winterGloveColor = p.color;
    } else if (matchesAny(it, WRISTBAND_NAMES) && !wristbandColor) {
      wristbandColor = p.color;
      wristbandSide = normalizeSide(p.side);
    } else if (matchesAny(it, BICEPS_BAND_NAMES) && !bicepsBandColor) {
      bicepsBandColor = p.color;
      bicepsBandSide = normalizeSide(p.side);
    } else if (matchesAny(it, SHIN_GUARD_NAMES) && !shinGuardColor) {
      shinGuardColor = p.color;
    }
  }

  return {
    bootsColor,
    gloveColor: winterGloveColor || gkGloveColor,
    hasWinterGlove: winterGloveColor != null,
    wristbandColor,
    wristbandSide,
    bicepsBandColor,
    bicepsBandSide,
    shinGuardColor,
  };
}
