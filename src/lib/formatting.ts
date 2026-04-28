import i18n from '@/i18n';

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(d: string | null): string {
  if (!d) return i18n.t('common:indeterminate', { defaultValue: 'Indeterminado' });
  // Locale-aware short date — uses the user's chosen language for formatting.
  const lang = i18n.resolvedLanguage || i18n.language || 'pt';
  const localeTag = lang.startsWith('en') ? 'en-US' : 'pt-BR';
  return new Date(d + 'T00:00:00').toLocaleDateString(localeTag);
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t('common:time_ago.now');
  if (mins < 60) return i18n.t('common:time_ago.minutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return i18n.t('common:time_ago.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return i18n.t('common:time_ago.days', { count: days });
  const months = Math.floor(days / 30);
  return i18n.t('common:time_ago.month', { count: months });
}
