import i18n from '@/i18n';

// League names in the DB look like "Liga Brasileira - Serie A". The prefix
// before " - " is translated (e.g. "Brazilian League" in EN), while the suffix
// after the separator is preserved as a literal (e.g. "Serie A", "La Liga",
// "MLS"), since those are proper names that don't translate.
//
// Lookup goes through i18n key `league:names.<prefix>`, so adding a new league
// only needs an entry there. Anything missing the separator falls through
// untouched.
export function formatLeagueName(name: string | null | undefined): string {
  if (!name) return '';
  const sepIdx = name.indexOf(' - ');
  if (sepIdx < 0) {
    const translated = i18n.t(`league:names.${name}`, { defaultValue: '' });
    return translated || name;
  }
  const prefix = name.slice(0, sepIdx);
  const suffix = name.slice(sepIdx + 3);
  const translatedPrefix = i18n.t(`league:names.${prefix}`, { defaultValue: '' }) || prefix;
  return `${translatedPrefix} - ${suffix}`;
}
