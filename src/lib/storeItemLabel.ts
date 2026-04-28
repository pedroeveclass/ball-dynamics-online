import type { SupportedLanguage } from '@/i18n';

// Pick the right localized field from a store_items row, with safe
// fallback: requested lang → opposite lang → legacy `name`/`description`.
// Items seeded before the dual-column migration only have the legacy
// fields; new items must always provide both languages.
export type StoreItemLabelSource = {
  name?: string | null;
  description?: string | null;
  name_pt?: string | null;
  name_en?: string | null;
  description_pt?: string | null;
  description_en?: string | null;
};

export function getStoreItemName(item: StoreItemLabelSource, lang: SupportedLanguage): string {
  const primary = lang === 'en' ? item.name_en : item.name_pt;
  const secondary = lang === 'en' ? item.name_pt : item.name_en;
  return primary || secondary || item.name || '';
}

export function getStoreItemDescription(item: StoreItemLabelSource, lang: SupportedLanguage): string {
  const primary = lang === 'en' ? item.description_en : item.description_pt;
  const secondary = lang === 'en' ? item.description_pt : item.description_en;
  return primary || secondary || item.description || '';
}
