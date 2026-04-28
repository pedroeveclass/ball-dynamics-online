import { format as fnsFormat } from 'date-fns';
import { ptBR, enUS, type Locale } from 'date-fns/locale';
import type { SupportedLanguage } from '@/i18n';

const LOCALE_MAP: Record<SupportedLanguage, Locale> = {
  pt: ptBR,
  en: enUS,
};

// Date format strings vary across languages. The `format` arg picks
// a semantic preset rather than a raw pattern, so callers don't have
// to think about locale-specific syntax.
type DatePreset = 'date_short' | 'date_long' | 'datetime_short' | 'datetime_long' | 'time_short';

const PRESETS: Record<DatePreset, Record<SupportedLanguage, string>> = {
  date_short:     { pt: "dd/MM/yyyy",                  en: "MM/dd/yyyy" },
  date_long:      { pt: "dd 'de' MMMM 'de' yyyy",      en: "MMMM d, yyyy" },
  datetime_short: { pt: "dd/MM/yyyy HH:mm",            en: "MM/dd/yyyy h:mma" },
  datetime_long:  { pt: "dd/MM/yyyy 'às' HH:mm",       en: "MMMM d, yyyy 'at' h:mma" },
  time_short:     { pt: "HH:mm",                       en: "h:mma" },
};

export function formatDate(
  date: Date | string | number,
  lang: SupportedLanguage,
  preset: DatePreset = 'datetime_long',
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return fnsFormat(d, PRESETS[preset][lang], { locale: LOCALE_MAP[lang] });
}
