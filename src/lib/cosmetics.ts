import { supabase } from '@/integrations/supabase/client';

export interface PlayerCosmetics {
  // Hex (#rgb / #rrggbb) of the actively-equipped boots, if any.
  bootsColor: string | null;
  // Hex of the actively-equipped goalkeeper glove, if any.
  gloveColor: string | null;
}

const EMPTY: PlayerCosmetics = { bootsColor: null, gloveColor: null };

// Reads the active boots / gloves purchase rows for a player and returns the
// colors the player picked at buy time. Used by the player visual to tint
// cleats and goalkeeper gloves. Returns null colors when no equipment is
// active or when the row pre-dates the color feature.
export async function fetchPlayerCosmetics(playerProfileId: string): Promise<PlayerCosmetics> {
  if (!playerProfileId) return EMPTY;

  // Only `active` purchases drive the visual — `cancelling` does too because
  // the item is still in use until the renewal date passes (matches how the
  // attribute-bonus reader treats it).
  const { data: purchases } = await (supabase as any)
    .from('store_purchases')
    .select('store_item_id, color, status')
    .eq('player_profile_id', playerProfileId)
    .in('status', ['active', 'cancelling']);

  if (!purchases || purchases.length === 0) return EMPTY;

  const itemIds = [...new Set((purchases as any[]).map(p => p.store_item_id))];
  const { data: items } = await (supabase as any)
    .from('store_items')
    .select('id, category')
    .in('id', itemIds)
    .in('category', ['boots', 'gloves']);

  if (!items || items.length === 0) return EMPTY;

  const categoryById = new Map((items as any[]).map(i => [i.id, i.category as string]));

  let bootsColor: string | null = null;
  let gloveColor: string | null = null;

  for (const p of purchases as any[]) {
    const cat = categoryById.get(p.store_item_id);
    if (!cat || !p.color) continue;
    if (cat === 'boots' && !bootsColor) bootsColor = p.color;
    if (cat === 'gloves' && !gloveColor) gloveColor = p.color;
  }

  return { bootsColor, gloveColor };
}
