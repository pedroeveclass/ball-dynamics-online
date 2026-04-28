import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptCommon from './locales/pt/common.json';
import ptAuth from './locales/pt/auth.json';
import ptOnboarding from './locales/pt/onboarding.json';
import ptNav from './locales/pt/nav.json';
import ptPositions from './locales/pt/positions.json';
import ptDashboard from './locales/pt/dashboard.json';
import ptSquad from './locales/pt/squad.json';
import ptNotifications from './locales/pt/notifications.json';
import ptNotificationMessages from './locales/pt/notification_messages.json';
import ptBank from './locales/pt/bank.json';
import ptCoach from './locales/pt/coach.json';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enOnboarding from './locales/en/onboarding.json';
import enNav from './locales/en/nav.json';
import enPositions from './locales/en/positions.json';
import enDashboard from './locales/en/dashboard.json';
import enSquad from './locales/en/squad.json';
import enNotifications from './locales/en/notifications.json';
import enNotificationMessages from './locales/en/notification_messages.json';
import enBank from './locales/en/bank.json';
import enCoach from './locales/en/coach.json';

export const SUPPORTED_LANGUAGES = ['pt', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return typeof v === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'pt',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true, // pt-BR → pt, en-US → en
    interpolation: { escapeValue: false },
    resources: {
      pt: {
        common: ptCommon,
        auth: ptAuth,
        onboarding: ptOnboarding,
        nav: ptNav,
        positions: ptPositions,
        dashboard: ptDashboard,
        squad: ptSquad,
        notifications: ptNotifications,
        notification_messages: ptNotificationMessages,
        bank: ptBank,
        coach: ptCoach,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        onboarding: enOnboarding,
        nav: enNav,
        positions: enPositions,
        dashboard: enDashboard,
        squad: enSquad,
        notifications: enNotifications,
        notification_messages: enNotificationMessages,
        bank: enBank,
        coach: enCoach,
      },
    },
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app_lang',
    },
  });

export default i18n;

export function setAppLanguage(lang: SupportedLanguage) {
  void i18n.changeLanguage(lang);
  try { localStorage.setItem('app_lang', lang); } catch { /* private mode */ }
}

export function getAppLanguage(): SupportedLanguage {
  const cur = i18n.resolvedLanguage || i18n.language || 'pt';
  return isSupportedLanguage(cur) ? cur : 'pt';
}
