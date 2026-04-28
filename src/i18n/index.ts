import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptAccountProfile from './locales/pt/account_profile.json';
import ptAdmin from './locales/pt/admin.json';
import ptAuth from './locales/pt/auth.json';
import ptBank from './locales/pt/bank.json';
import ptCareerStats from './locales/pt/career_stats.json';
import ptClubDemand from './locales/pt/club_demand.json';
import ptCoach from './locales/pt/coach.json';
import ptCommon from './locales/pt/common.json';
import ptDashboard from './locales/pt/dashboard.json';
import ptForum from './locales/pt/forum.json';
import ptForumTopic from './locales/pt/forum_topic.json';
import ptHelp from './locales/pt/help.json';
import ptAttributes from './locales/pt/attributes.json';
import ptNotifyPlayerDialog from './locales/pt/notify_player_dialog.json';
import ptPlayerCard from './locales/pt/player_card.json';
import ptPlayerMatches from './locales/pt/player_matches.json';
import ptPublicClub from './locales/pt/public_club.json';
import ptPublicPlayer from './locales/pt/public_player.json';
import ptStore from './locales/pt/store.json';
import ptLeague from './locales/pt/league.json';
import ptLeagueVote from './locales/pt/league_vote.json';
import ptMatchEvents from './locales/pt/match_events.json';
import ptMatchRoom from './locales/pt/match_room.json';
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
import enCareerStats from './locales/en/career_stats.json';
import enClubDemand from './locales/en/club_demand.json';
import enCoach from './locales/en/coach.json';
import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';
import enForum from './locales/en/forum.json';
import enForumTopic from './locales/en/forum_topic.json';
import enHelp from './locales/en/help.json';
import enAttributes from './locales/en/attributes.json';
import enNotifyPlayerDialog from './locales/en/notify_player_dialog.json';
import enPlayerCard from './locales/en/player_card.json';
import enPlayerMatches from './locales/en/player_matches.json';
import enPublicClub from './locales/en/public_club.json';
import enPublicPlayer from './locales/en/public_player.json';
import enStore from './locales/en/store.json';
import enLeague from './locales/en/league.json';
import enLeagueVote from './locales/en/league_vote.json';
import enMatchEvents from './locales/en/match_events.json';
import enMatchRoom from './locales/en/match_room.json';
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
        attributes: ptAttributes,
        auth: ptAuth,
        bank: ptBank,
        career_stats: ptCareerStats,
        club_demand: ptClubDemand,
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
        match_events: ptMatchEvents,
        match_replay: ptMatchReplay,
        match_room: ptMatchRoom,
        nav: ptNav,
        notification_messages: ptNotificationMessages,
        notifications: ptNotifications,
        notify_player_dialog: ptNotifyPlayerDialog,
        onboarding: ptOnboarding,
        pickup_list: ptPickupList,
        pickup_lobby: ptPickupLobby,
        player_attributes: ptPlayerAttributes,
        player_avatar: ptPlayerAvatar,
        player_card: ptPlayerCard,
        player_club: ptPlayerClub,
        player_contract: ptPlayerContract,
        player_matches: ptPlayerMatches,
        player_offers: ptPlayerOffers,
        player_profile: ptPlayerProfile,
        player_training_plan: ptPlayerTrainingPlan,
        positions: ptPositions,
        public_club: ptPublicClub,
        public_player: ptPublicPlayer,
        situational_tactics: ptSituationalTactics,
        solo_lab: ptSoloLab,
        squad: ptSquad,
        store: ptStore,
      },
      en: {
        account_profile: enAccountProfile,
        admin: enAdmin,
        attributes: enAttributes,
        auth: enAuth,
        bank: enBank,
        career_stats: enCareerStats,
        club_demand: enClubDemand,
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
        match_events: enMatchEvents,
        match_replay: enMatchReplay,
        match_room: enMatchRoom,
        nav: enNav,
        notification_messages: enNotificationMessages,
        notifications: enNotifications,
        notify_player_dialog: enNotifyPlayerDialog,
        onboarding: enOnboarding,
        pickup_list: enPickupList,
        pickup_lobby: enPickupLobby,
        player_attributes: enPlayerAttributes,
        player_avatar: enPlayerAvatar,
        player_card: enPlayerCard,
        player_club: enPlayerClub,
        player_contract: enPlayerContract,
        player_matches: enPlayerMatches,
        player_offers: enPlayerOffers,
        player_profile: enPlayerProfile,
        player_training_plan: enPlayerTrainingPlan,
        positions: enPositions,
        public_club: enPublicClub,
        public_player: enPublicPlayer,
        situational_tactics: enSituationalTactics,
        solo_lab: enSoloLab,
        squad: enSquad,
        store: enStore,
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
