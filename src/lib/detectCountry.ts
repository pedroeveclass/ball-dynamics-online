import { supabase } from '@/integrations/supabase/client';
import { isValidCountryCode } from '@/lib/countries';

// Calls the detect-nationality edge function (IP geolocation).
// Best-effort — never throws; falls back to 'BR' when unreachable
// or when the IP resolves to something we don't have seeded.
export async function detectClientCountry(): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('detect-nationality', {
      method: 'GET',
    });
    if (error) return 'BR';
    const code = (data as any)?.country_code;
    if (typeof code === 'string' && isValidCountryCode(code)) return code.toUpperCase();
    return 'BR';
  } catch {
    return 'BR';
  }
}

// Maps the browser language ('pt-BR', 'en-US', ...) to one of our
// supported UI languages. Anything not Portuguese-flavored becomes 'en'.
export function detectBrowserLanguage(): 'pt' | 'en' {
  if (typeof navigator === 'undefined') return 'pt';
  const langs = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const raw of langs) {
    const code = raw.toLowerCase().slice(0, 2);
    if (code === 'pt') return 'pt';
    if (code === 'en') return 'en';
  }
  return 'pt';
}
