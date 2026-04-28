import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptAccountProfile from './locales/pt/account_profile.json';
import ptAdmin from './locales/pt/admin.json';
import ptAuth from './locales/pt/auth.json';
import ptBank from './locales/pt/bank.json';
import ptCoach from './locales/pt/coach.json';
import ptCommon from './locales/pt/common.json';
import ptDashboard from './locales/pt/dashboard.json';
import ptForum from './locales/pt/forum.json';
import ptForumTopic from './locales/pt/forum_topic.json';
import ptHelp from './locales/pt/help.json';
import ptLeague from './locales/pt/league.json';
import ptLeagueVote from './locales/pt/league_vote.json';
import ptManagerAvatar from './locales/pt/manager_avatar.json';
import ptManagerClub from './locales/pt/manager_club.json';
import ptManagerFacilities from './locales/pt/manager_facilities.json';
import ptManagerFinance from './locales/pt/manager_finance.json';
import ptManagerLineup from './locales/pt/manager_lineup.json';
import ptManagerMarket from './locales/pt/manager_market.json';
import ptManagerMatchCreate from './locales/pt/manager_match_create.json';
import ptManagerReports from './locales/pt/manager_reports.json';
import ptManagerStadium from './locales/pt/manager_stadium.json';
import ptMatchReplay from './locales/pt/match_replay.json';
import ptNav from './locales/pt/nav.json';
import ptNotificationMessages from './locales/pt/notification_messages.json';
import ptNotifications from './locales/pt/notifications.json';
import ptOnboarding from './locales/pt/onboarding.json';
import ptPickupList from './locales/pt/pickup_list.json';
import ptPickupLobby from './locales/pt/pickup_lobby.json';
import ptPlayerAttributes from './locales/pt/player_attributes.json';
import ptPlayerAvatar from './locales/pt/player_avatar.json';
import ptPlayerClub from './locales/pt/player_club.json';
import ptPlayerContract from './locales/pt/player_contract.json';
import ptPlayerOffers from './locales/pt/player_offers.json';
import ptPlayerProfile from './locales/pt/player_profile.json';
import ptPlayerTrainingPlan from './locales/pt/player_training_plan.json';
import ptPositions from './locales/pt/positions.json';
import ptSituationalTactics from './locales/pt/situational_tactics.json';
import ptSoloLab from './locales/pt/solo_lab.json';
import ptSquad from './locales/pt/squad.json';

import enAccountProfile from './locales/en/account_profile.json';
import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import enBank from './locales/en/bank.json';
import enCoach from './locales/en/coach.json';
import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';
import enForum from './locales/en/forum.json';
import enForumTopic from './locales/en/forum_topic.json';
import enHelp from './locales/en/help.json';
import enLeague from './locales/en/league.json';
import enLeagueVote from './locales/en/league_vote.json';
import enManagerAvatar from './locales/en/manager_avatar.json';
import enManagerClub from './locales/en/manager_club.json';
import enManagerFacilities from './locales/en/manager_facilities.json';
import enManagerFinance from './locales/en/manager_finance.json';
import enManagerLineup from './locales/en/manager_lineup.json';
import enManagerMarket from './locales/en/manager_market.json';
import enManagerMatchCreate from './locales/en/manager_match_create.json';
import enManagerReports from './locales/en/manager_reports.json';
import enManagerStadium from './locales/en/manager_stadium.json';
import enMatchReplay from './locales/en/match_replay.json';
import enNav from './locales/en/nav.json';
import enNotificationMessages from './locales/en/notification_messages.json';
import enNotifications from './locales/en/notifications.json';
import enOnboarding from './locales/en/onboarding.json';
import enPickupList from './locales/en/pickup_list.json';
import enPickupLobby from './locales/en/pickup_lobby.json';
import enPlayerAttributes from './locales/en/player_attributes.json';
import enPlayerAvatar from './locales/en/player_avatar.json';
import enPlayerClub from './locales/en/player_club.json';
import enPlayerContract from './locales/en/player_contract.json';
import enPlayerOffers from './locales/en/player_offers.json';
import enPlayerProfile from './locales/en/player_profile.json';
import enPlayerTrainingPlan from './locales/en/player_training_plan.json';
import enPositions from './locales/en/positions.json';
import enSituationalTactics from './locales/en/situational_tactics.json';
import enSoloLab from './locales/en/solo_lab.json';
import enSquad from './locales/en/squad.json';

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
        account_profile: ptAccountProfile,
        admin: ptAdmin,
        auth: ptAuth,
        bank: ptBank,
        coach: ptCoach,
        common: ptCommon,
        dashboard: ptDashboard,
        forum: ptForum,
        forum_topic: ptForumTopic,
        help: ptHelp,
        league: ptLeague,
        league_vote: ptLeagueVote,
        manager_avatar: ptManagerAvatar,
        manager_club: ptManagerClub,
        manager_facilities: ptManagerFacilities,
        manager_finance: ptManagerFinance,
        manager_lineup: ptManagerLineup,
        manager_market: ptManagerMarket,
        manager_match_create: ptManagerMatchCreate,
        manager_reports: ptManagerReports,
        manager_stadium: ptManagerStadium,
        match_replay: ptMatchReplay,
        nav: ptNav,
        notification_messages: ptNotificationMessages,
        notifications: ptNotifications,
        onboarding: ptOnboarding,
        pickup_list: ptPickupList,
        pickup_lobby: ptPickupLobby,
        player_attributes: ptPlayerAttributes,
        player_avatar: ptPlayerAvatar,
        player_club: ptPlayerClub,
        player_contract: ptPlayerContract,
        player_offers: ptPlayerOffers,
        player_profile: ptPlayerProfile,
        player_training_plan: ptPlayerTrainingPlan,
        positions: ptPositions,
        situational_tactics: ptSituationalTactics,
        solo_lab: ptSoloLab,
        squad: ptSquad,
      },
      en: {
        account_profile: enAccountProfile,
        admin: enAdmin,
        auth: enAuth,
        bank: enBank,
        coach: enCoach,
        common: enCommon,
        dashboard: enDashboard,
        forum: enForum,
        forum_topic: enForumTopic,
        help: enHelp,
        league: enLeague,
        league_vote: enLeagueVote,
        manager_avatar: enManagerAvatar,
        manager_club: enManagerClub,
        manager_facilities: enManagerFacilities,
        manager_finance: enManagerFinance,
        manager_lineup: enManagerLineup,
        manager_market: enManagerMarket,
        manager_match_create: enManagerMatchCreate,
        manager_reports: enManagerReports,
        manager_stadium: enManagerStadium,
        match_replay: enMatchReplay,
        nav: enNav,
        notification_messages: enNotificationMessages,
        notifications: enNotifications,
        onboarding: enOnboarding,
        pickup_list: enPickupList,
        pickup_lobby: enPickupLobby,
        player_attributes: enPlayerAttributes,
        player_avatar: enPlayerAvatar,
        player_club: enPlayerClub,
        player_contract: enPlayerContract,
        player_offers: enPlayerOffers,
        player_profile: enPlayerProfile,
        player_training_plan: enPlayerTrainingPlan,
        positions: enPositions,
        situational_tactics: enSituationalTactics,
        solo_lab: enSoloLab,
        squad: enSquad,
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
