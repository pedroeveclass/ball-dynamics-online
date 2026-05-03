import { supabase } from '@/integrations/supabase/client';

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
}

const EMPTY: PlayerCosmetics = { bootsColor: null, gloveColor: null, hasWinterGlove: false };

// Cosmetic items whose color we treat as a "winter glove": same visual
// treatment as the GK glove arm. Matched by the canonical seed name so we
// don't depend on environment-specific UUIDs.
const WINTER_GLOVE_NAMES = new Set(['Luva de Inverno', 'Winter Gloves']);

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
    .select('store_item_id, color, status')
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

  for (const p of purchases as any[]) {
    const it = itemById.get(p.store_item_id);
    if (!it || !p.color) continue;
    if (it.category === 'boots' && !bootsColor) bootsColor = p.color;
    else if (it.category === 'gloves' && !gkGloveColor) gkGloveColor = p.color;
    else if (it.category === 'cosmetic' && !winterGloveColor) {
      const isWinter = WINTER_GLOVE_NAMES.has(it.name) || WINTER_GLOVE_NAMES.has(it.name_pt) || WINTER_GLOVE_NAMES.has(it.name_en);
      if (isWinter) winterGloveColor = p.color;
    }
  }

  return {
    bootsColor,
    gloveColor: winterGloveColor || gkGloveColor,
    hasWinterGlove: winterGloveColor != null,
  };
}
