import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isSupportedLanguage, setAppLanguage, type SupportedLanguage } from '@/i18n';

// Single source of truth for the active UI language.
//
// - On login, applies the user's saved `profiles.preferred_language`
//   (which trumps anything the browser detector set).
// - `change(lang)` switches i18n and persists to the profile so the
//   choice survives across devices.

export function useAppLanguage() {
  const { i18n } = useTranslation();
  const { user, profile } = useAuth();

  useEffect(() => {
    const stored = (profile as any)?.preferred_language as string | undefined;
    if (isSupportedLanguage(stored) && i18n.resolvedLanguage !== stored) {
      setAppLanguage(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, (profile as any)?.preferred_language]);

  const change = async (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    if (user?.id) {
      await supabase.from('profiles').update({ preferred_language: lang } as any).eq('id', user.id);
    }
  };

  const current = isSupportedLanguage(i18n.resolvedLanguage)
    ? (i18n.resolvedLanguage as SupportedLanguage)
    : 'pt';

  return { current, change };
}
