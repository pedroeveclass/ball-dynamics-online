import { supabase } from '@/integrations/supabase/client';

export interface ActiveBonusItem {
  purchase_id: string;
  store_item_id: string;
  category: 'boots' | 'gloves';
  name: string;
  name_pt: string | null;
  name_en: string | null;
  level: number;
  bonus_type: string;
  bonus_value: number;
  status: 'active' | 'cancelling';
}

export interface AttributeBonuses {
  byAttr: Record<string, number>;
  items: ActiveBonusItem[];
}

const EMPTY: AttributeBonuses = { byAttr: {}, items: [] };

export async function fetchAttributeBonuses(playerProfileId: string): Promise<AttributeBonuses> {
  if (!playerProfileId) return EMPTY;

  const { data: purchases } = await supabase
    .from('store_purchases')
    .select('id, store_item_id, status')
    .eq('player_profile_id', playerProfileId)
    .in('status', ['active', 'cancelling']);

  if (!purchases || purchases.length === 0) return EMPTY;

  const itemIds = [...new Set(purchases.map((p: any) => p.store_item_id))];
  const { data: items } = await (supabase as any)
    .from('store_items')
    .select('id, name, name_pt, name_en, category, level, bonus_type, bonus_value')
    .in('id', itemIds)
    .in('category', ['boots', 'gloves']);

  if (!items || items.length === 0) return EMPTY;

  const itemMap = new Map(items.map((i: any) => [i.id, i]));
  const byAttr: Record<string, number> = {};
  const list: ActiveBonusItem[] = [];

  for (const p of purchases as any[]) {
    const it = itemMap.get(p.store_item_id) as any;
    if (!it || !it.bonus_type) continue;
    const value = Number(it.bonus_value || 0);
    if (!value) continue;
    byAttr[it.bonus_type] = (byAttr[it.bonus_type] || 0) + value;
    list.push({
      purchase_id: p.id,
      store_item_id: it.id,
      category: it.category,
      name: it.name,
      name_pt: it.name_pt,
      name_en: it.name_en,
      level: it.level,
      bonus_type: it.bonus_type,
      bonus_value: value,
      status: p.status,
    });
  }

  return { byAttr, items: list };
}
