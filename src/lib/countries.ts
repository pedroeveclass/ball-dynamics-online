// Static mirror of the public.countries table seeded by
// 20260427030000_countries_seed.sql. Used for offline UI rendering
// (dropdown labels, flag tooltips, language fallback).
//
// Keep in sync with the SQL seed when adding new countries.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name_pt: string;
  name_en: string;
  confederation: 'CONMEBOL' | 'UEFA' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
  flag_emoji: string;
}

export const COUNTRIES: Country[] = [
  // CONMEBOL
  { code: 'BR', name_pt: 'Brasil', name_en: 'Brazil', confederation: 'CONMEBOL', flag_emoji: '🇧🇷' },
  { code: 'AR', name_pt: 'Argentina', name_en: 'Argentina', confederation: 'CONMEBOL', flag_emoji: '🇦🇷' },
  { code: 'UY', name_pt: 'Uruguai', name_en: 'Uruguay', confederation: 'CONMEBOL', flag_emoji: '🇺🇾' },
  { code: 'CL', name_pt: 'Chile', name_en: 'Chile', confederation: 'CONMEBOL', flag_emoji: '🇨🇱' },
  { code: 'CO', name_pt: 'Colômbia', name_en: 'Colombia', confederation: 'CONMEBOL', flag_emoji: '🇨🇴' },
  { code: 'PY', name_pt: 'Paraguai', name_en: 'Paraguay', confederation: 'CONMEBOL', flag_emoji: '🇵🇾' },
  { code: 'PE', name_pt: 'Peru', name_en: 'Peru', confederation: 'CONMEBOL', flag_emoji: '🇵🇪' },
  { code: 'EC', name_pt: 'Equador', name_en: 'Ecuador', confederation: 'CONMEBOL', flag_emoji: '🇪🇨' },
  { code: 'VE', name_pt: 'Venezuela', name_en: 'Venezuela', confederation: 'CONMEBOL', flag_emoji: '🇻🇪' },
  { code: 'BO', name_pt: 'Bolívia', name_en: 'Bolivia', confederation: 'CONMEBOL', flag_emoji: '🇧🇴' },
  // UEFA
  { code: 'PT', name_pt: 'Portugal', name_en: 'Portugal', confederation: 'UEFA', flag_emoji: '🇵🇹' },
  { code: 'ES', name_pt: 'Espanha', name_en: 'Spain', confederation: 'UEFA', flag_emoji: '🇪🇸' },
  { code: 'FR', name_pt: 'França', name_en: 'France', confederation: 'UEFA', flag_emoji: '🇫🇷' },
  { code: 'IT', name_pt: 'Itália', name_en: 'Italy', confederation: 'UEFA', flag_emoji: '🇮🇹' },
  { code: 'DE', name_pt: 'Alemanha', name_en: 'Germany', confederation: 'UEFA', flag_emoji: '🇩🇪' },
  { code: 'GB', name_pt: 'Reino Unido', name_en: 'United Kingdom', confederation: 'UEFA', flag_emoji: '🇬🇧' },
  { code: 'NL', name_pt: 'Holanda', name_en: 'Netherlands', confederation: 'UEFA', flag_emoji: '🇳🇱' },
  { code: 'BE', name_pt: 'Bélgica', name_en: 'Belgium', confederation: 'UEFA', flag_emoji: '🇧🇪' },
  { code: 'CH', name_pt: 'Suíça', name_en: 'Switzerland', confederation: 'UEFA', flag_emoji: '🇨🇭' },
  { code: 'AT', name_pt: 'Áustria', name_en: 'Austria', confederation: 'UEFA', flag_emoji: '🇦🇹' },
  { code: 'PL', name_pt: 'Polônia', name_en: 'Poland', confederation: 'UEFA', flag_emoji: '🇵🇱' },
  { code: 'SE', name_pt: 'Suécia', name_en: 'Sweden', confederation: 'UEFA', flag_emoji: '🇸🇪' },
  { code: 'NO', name_pt: 'Noruega', name_en: 'Norway', confederation: 'UEFA', flag_emoji: '🇳🇴' },
  { code: 'DK', name_pt: 'Dinamarca', name_en: 'Denmark', confederation: 'UEFA', flag_emoji: '🇩🇰' },
  { code: 'FI', name_pt: 'Finlândia', name_en: 'Finland', confederation: 'UEFA', flag_emoji: '🇫🇮' },
  { code: 'IE', name_pt: 'Irlanda', name_en: 'Ireland', confederation: 'UEFA', flag_emoji: '🇮🇪' },
  { code: 'GR', name_pt: 'Grécia', name_en: 'Greece', confederation: 'UEFA', flag_emoji: '🇬🇷' },
  { code: 'TR', name_pt: 'Turquia', name_en: 'Turkey', confederation: 'UEFA', flag_emoji: '🇹🇷' },
  { code: 'RU', name_pt: 'Rússia', name_en: 'Russia', confederation: 'UEFA', flag_emoji: '🇷🇺' },
  { code: 'UA', name_pt: 'Ucrânia', name_en: 'Ukraine', confederation: 'UEFA', flag_emoji: '🇺🇦' },
  { code: 'CZ', name_pt: 'República Tcheca', name_en: 'Czech Republic', confederation: 'UEFA', flag_emoji: '🇨🇿' },
  { code: 'HR', name_pt: 'Croácia', name_en: 'Croatia', confederation: 'UEFA', flag_emoji: '🇭🇷' },
  { code: 'RS', name_pt: 'Sérvia', name_en: 'Serbia', confederation: 'UEFA', flag_emoji: '🇷🇸' },
  { code: 'RO', name_pt: 'Romênia', name_en: 'Romania', confederation: 'UEFA', flag_emoji: '🇷🇴' },
  { code: 'HU', name_pt: 'Hungria', name_en: 'Hungary', confederation: 'UEFA', flag_emoji: '🇭🇺' },
  // CONCACAF
  { code: 'US', name_pt: 'Estados Unidos', name_en: 'United States', confederation: 'CONCACAF', flag_emoji: '🇺🇸' },
  { code: 'MX', name_pt: 'México', name_en: 'Mexico', confederation: 'CONCACAF', flag_emoji: '🇲🇽' },
  { code: 'CA', name_pt: 'Canadá', name_en: 'Canada', confederation: 'CONCACAF', flag_emoji: '🇨🇦' },
  { code: 'CR', name_pt: 'Costa Rica', name_en: 'Costa Rica', confederation: 'CONCACAF', flag_emoji: '🇨🇷' },
  { code: 'JM', name_pt: 'Jamaica', name_en: 'Jamaica', confederation: 'CONCACAF', flag_emoji: '🇯🇲' },
  { code: 'PA', name_pt: 'Panamá', name_en: 'Panama', confederation: 'CONCACAF', flag_emoji: '🇵🇦' },
  // CAF
  { code: 'NG', name_pt: 'Nigéria', name_en: 'Nigeria', confederation: 'CAF', flag_emoji: '🇳🇬' },
  { code: 'SN', name_pt: 'Senegal', name_en: 'Senegal', confederation: 'CAF', flag_emoji: '🇸🇳' },
  { code: 'CM', name_pt: 'Camarões', name_en: 'Cameroon', confederation: 'CAF', flag_emoji: '🇨🇲' },
  { code: 'CI', name_pt: 'Costa do Marfim', name_en: 'Ivory Coast', confederation: 'CAF', flag_emoji: '🇨🇮' },
  { code: 'GH', name_pt: 'Gana', name_en: 'Ghana', confederation: 'CAF', flag_emoji: '🇬🇭' },
  { code: 'MA', name_pt: 'Marrocos', name_en: 'Morocco', confederation: 'CAF', flag_emoji: '🇲🇦' },
  { code: 'EG', name_pt: 'Egito', name_en: 'Egypt', confederation: 'CAF', flag_emoji: '🇪🇬' },
  { code: 'ZA', name_pt: 'África do Sul', name_en: 'South Africa', confederation: 'CAF', flag_emoji: '🇿🇦' },
  { code: 'DZ', name_pt: 'Argélia', name_en: 'Algeria', confederation: 'CAF', flag_emoji: '🇩🇿' },
  { code: 'TN', name_pt: 'Tunísia', name_en: 'Tunisia', confederation: 'CAF', flag_emoji: '🇹🇳' },
  // AFC
  { code: 'JP', name_pt: 'Japão', name_en: 'Japan', confederation: 'AFC', flag_emoji: '🇯🇵' },
  { code: 'KR', name_pt: 'Coreia do Sul', name_en: 'South Korea', confederation: 'AFC', flag_emoji: '🇰🇷' },
  { code: 'CN', name_pt: 'China', name_en: 'China', confederation: 'AFC', flag_emoji: '🇨🇳' },
  { code: 'SA', name_pt: 'Arábia Saudita', name_en: 'Saudi Arabia', confederation: 'AFC', flag_emoji: '🇸🇦' },
  { code: 'IR', name_pt: 'Irã', name_en: 'Iran', confederation: 'AFC', flag_emoji: '🇮🇷' },
  { code: 'AU', name_pt: 'Austrália', name_en: 'Australia', confederation: 'AFC', flag_emoji: '🇦🇺' },
  { code: 'IN', name_pt: 'Índia', name_en: 'India', confederation: 'AFC', flag_emoji: '🇮🇳' },
  { code: 'TH', name_pt: 'Tailândia', name_en: 'Thailand', confederation: 'AFC', flag_emoji: '🇹🇭' },
  { code: 'VN', name_pt: 'Vietnã', name_en: 'Vietnam', confederation: 'AFC', flag_emoji: '🇻🇳' },
  { code: 'PH', name_pt: 'Filipinas', name_en: 'Philippines', confederation: 'AFC', flag_emoji: '🇵🇭' },
  { code: 'ID', name_pt: 'Indonésia', name_en: 'Indonesia', confederation: 'AFC', flag_emoji: '🇮🇩' },
  { code: 'IL', name_pt: 'Israel', name_en: 'Israel', confederation: 'AFC', flag_emoji: '🇮🇱' },
  // OFC
  { code: 'NZ', name_pt: 'Nova Zelândia', name_en: 'New Zealand', confederation: 'OFC', flag_emoji: '🇳🇿' },
];

const BY_CODE = new Map(COUNTRIES.map(c => [c.code, c]));

export function getCountry(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.toUpperCase());
}

export function getCountryName(country: Country, locale: 'pt' | 'en' = 'pt'): string {
  return locale === 'en' ? country.name_en : country.name_pt;
}

export function isValidCountryCode(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code.toUpperCase());
}
