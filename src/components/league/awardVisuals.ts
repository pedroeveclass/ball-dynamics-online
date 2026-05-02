import { Trophy, Target, Hand, Shield, HeartHandshake, Award, type LucideIcon } from 'lucide-react';

// Centralised icon + color mapping reused by SeasonAwardsCard, the
// Trophy Room on the player profile, the club page history, and the
// Hall da Fama page — keeps each award type visually consistent.

export const AWARD_ICON: Record<string, LucideIcon> = {
  round_mvp: Trophy,
  season_mvp: Trophy,
  season_top_scorer: Target,
  season_top_assists: Award,
  season_top_tackles: Shield,
  season_golden_glove: Hand,
  season_fair_play: HeartHandshake,
};

export const AWARD_ICON_COLOR: Record<string, string> = {
  round_mvp: 'text-amber-500',
  season_mvp: 'text-amber-500',
  season_top_scorer: 'text-pitch',
  season_top_assists: 'text-tactical',
  season_top_tackles: 'text-blue-500',
  season_golden_glove: 'text-yellow-500',
  season_fair_play: 'text-emerald-500',
};
