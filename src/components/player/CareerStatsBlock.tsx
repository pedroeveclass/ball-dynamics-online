import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Goal, Shield, TrendingUp, Loader2, Crosshair, Footprints, ShieldAlert,
} from 'lucide-react';
import { extrasForPosition, type PositionExtra } from '@/lib/playerStats';
import { useTranslation } from 'react-i18next';

interface Props {
  playerProfileId: string;
  position: string | null | undefined;
}

interface StatTotals {
  matches: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  // position extras sources
  clean_sheets: number;
  goals_conceded: number;
  gk_saves: number;
  gk_penalties_saved: number;
  tackles: number;
  interceptions: number;
  passes_completed: number;
  passes_attempted: number;
  shots: number;
  shots_on_target: number;
  offsides: number;
}

const EMPTY: StatTotals = {
  matches: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0,
  clean_sheets: 0, goals_conceded: 0, gk_saves: 0, gk_penalties_saved: 0,
  tackles: 0, interceptions: 0, passes_completed: 0, passes_attempted: 0,
  shots: 0, shots_on_target: 0, offsides: 0,
};

function StatCell({ label, value, icon, color }: { label: string; value: string | number; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-center space-y-1">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-display text-2xl font-extrabold ${color || ''}`}>{value}</p>
    </div>
  );
}

function formatAccuracy(completed: number, attempted: number): string {
  if (attempted <= 0) return '—';
  const pct = Math.round((completed / attempted) * 100);
  return `${pct}%`;
}

export function CareerStatsBlock({ playerProfileId, position }: Props) {
  const { t } = useTranslation('career_stats');
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<StatTotals>(EMPTY);

  useEffect(() => {
    if (!playerProfileId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('player_match_stats')
          .select('goals, assists, yellow_cards, red_cards, clean_sheet, goals_conceded, gk_saves, gk_penalties_saved, tackles, interceptions, passes_completed, passes_attempted, shots, shots_on_target, offsides')
          .eq('player_profile_id', playerProfileId);

        if (cancelled) return;

        if (!data || data.length === 0) {
          setTotals(EMPTY);
        } else {
          const agg: StatTotals = data.reduce((acc: StatTotals, r: any) => ({
            matches: acc.matches + 1,
            goals: acc.goals + Number(r.goals ?? 0),
            assists: acc.assists + Number(r.assists ?? 0),
            yellow_cards: acc.yellow_cards + Number(r.yellow_cards ?? 0),
            red_cards: acc.red_cards + Number(r.red_cards ?? 0),
            clean_sheets: acc.clean_sheets + (r.clean_sheet ? 1 : 0),
            goals_conceded: acc.goals_conceded + Number(r.goals_conceded ?? 0),
            gk_saves: acc.gk_saves + Number(r.gk_saves ?? 0),
            gk_penalties_saved: acc.gk_penalties_saved + Number(r.gk_penalties_saved ?? 0),
            tackles: acc.tackles + Number(r.tackles ?? 0),
            interceptions: acc.interceptions + Number(r.interceptions ?? 0),
            passes_completed: acc.passes_completed + Number(r.passes_completed ?? 0),
            passes_attempted: acc.passes_attempted + Number(r.passes_attempted ?? 0),
            shots: acc.shots + Number(r.shots ?? 0),
            shots_on_target: acc.shots_on_target + Number(r.shots_on_target ?? 0),
            offsides: acc.offsides + Number(r.offsides ?? 0),
          }), EMPTY);
          setTotals(agg);
        }
      } catch {
        if (!cancelled) setTotals(EMPTY);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerProfileId]);

  const extras = extrasForPosition(position);

  const renderExtra = (key: PositionExtra) => {
    const label = t(`extras.${key}`);
    switch (key) {
      case 'clean_sheets':
        return <StatCell key={key} label={label} value={totals.clean_sheets} icon={<Shield className="h-4 w-4" />} color="text-pitch" />;
      case 'goals_conceded':
        return <StatCell key={key} label={label} value={totals.goals_conceded} icon={<ShieldAlert className="h-4 w-4" />} color="text-destructive" />;
      case 'gk_saves':
        return <StatCell key={key} label={label} value={totals.gk_saves} icon={<Shield className="h-4 w-4" />} />;
      case 'gk_penalties_saved':
        return <StatCell key={key} label={label} value={totals.gk_penalties_saved} icon={<Shield className="h-4 w-4" />} />;
      case 'tackles':
        return <StatCell key={key} label={label} value={totals.tackles} icon={<Footprints className="h-4 w-4" />} />;
      case 'interceptions':
        return <StatCell key={key} label={label} value={totals.passes_attempted > 0 || totals.tackles > 0 ? totals.interceptions : '—'} icon={<ShieldAlert className="h-4 w-4" />} />;
      case 'passes_completed':
        return <StatCell key={key} label={label} value={totals.passes_completed} icon={<TrendingUp className="h-4 w-4" />} />;
      case 'pass_accuracy':
        return <StatCell key={key} label={label} value={formatAccuracy(totals.passes_completed, totals.passes_attempted)} icon={<TrendingUp className="h-4 w-4" />} />;
      case 'big_chances_created':
        // Reuses assists for now; future enrichment can promote this to its own metric.
        return <StatCell key={key} label={label} value={totals.assists} icon={<TrendingUp className="h-4 w-4" />} color="text-blue-400" />;
      case 'shots':
        return <StatCell key={key} label={label} value={totals.shots} icon={<Crosshair className="h-4 w-4" />} />;
      case 'shots_on_target':
        return <StatCell key={key} label={label} value={totals.shots_on_target} icon={<Crosshair className="h-4 w-4" />} />;
      case 'shot_accuracy':
        return <StatCell key={key} label={label} value={formatAccuracy(totals.shots_on_target, totals.shots)} icon={<Crosshair className="h-4 w-4" />} />;
      case 'offsides':
        return <StatCell key={key} label={label} value={totals.offsides} icon={<Footprints className="h-4 w-4" />} color="text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="stat-card space-y-3">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Goal className="h-4 w-4 text-tactical" /> {t('title')}
      </h2>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Common block */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCell label={t('common.matches')} value={totals.matches} icon={<Shield className="h-4 w-4" />} />
            <StatCell label={t('common.goals')} value={totals.goals} icon={<Goal className="h-4 w-4" />} color="text-pitch" />
            <StatCell label={t('common.assists')} value={totals.assists} icon={<TrendingUp className="h-4 w-4" />} color="text-blue-400" />
            <StatCell label={t('common.yellow_cards')} value={totals.yellow_cards} icon={<div className="w-3 h-4 rounded-sm bg-yellow-400" />} color="text-yellow-500" />
            <StatCell label={t('common.red_cards')} value={totals.red_cards} icon={<div className="w-3 h-4 rounded-sm bg-red-500" />} color="text-destructive" />
          </div>
          {/* Position extras */}
          {extras.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/50">
              {extras.map(renderExtra)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
