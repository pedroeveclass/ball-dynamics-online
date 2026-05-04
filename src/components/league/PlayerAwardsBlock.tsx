import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AWARD_ICON, AWARD_ICON_COLOR } from './awardVisuals';

type AwardRow = {
  id: string;
  award_type: string;
  season_number: number | null;
  round_number: number | null;
  awarded_at: string;
};

interface Props {
  playerProfileId: string;
  // 'compact' (chip strip, no header) | 'full' (heading + grid grouped by type)
  variant?: 'compact' | 'full';
  className?: string;
}

const AWARD_ORDER = [
  'season_mvp',
  'season_top_scorer',
  'season_top_assists',
  'season_top_tackles',
  'season_golden_glove',
  'season_fair_play',
  'round_mvp',
];

export function PlayerAwardsBlock({ playerProfileId, variant = 'full', className }: Props) {
  const { t } = useTranslation('league');
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('player_awards' as any)
        .select('id, award_type, season_number, round_number, awarded_at')
        .eq('player_profile_id', playerProfileId)
        .order('awarded_at', { ascending: false });
      if (!cancelled) {
        setAwards((data ?? []) as any);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerProfileId]);

  if (loading) return null;
  if (awards.length === 0) return null;

  const grouped: Record<string, AwardRow[]> = {};
  awards.forEach((a) => {
    (grouped[a.award_type] = grouped[a.award_type] ?? []).push(a);
  });

  const types = AWARD_ORDER.filter((t) => grouped[t]?.length > 0);

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
        {types.map((type) => {
          const list = grouped[type];
          const Icon = AWARD_ICON[type] ?? Award;
          const color = AWARD_ICON_COLOR[type] ?? 'text-tactical';
          return (
            <span
              key={type}
              title={`${t(`seasonAwards.labels.${type}`, { defaultValue: type })} × ${list.length}`}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px] font-display font-bold"
            >
              <Icon className={`h-3 w-3 ${color}`} />
              <span>{list.length > 1 ? `×${list.length}` : '1'}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`stat-card space-y-3 ${className ?? ''}`}>
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Award className="h-4 w-4 text-tactical" />
        {t('trophyRoom.title')}
        <span className="text-[10px] font-normal text-muted-foreground ml-auto">
          {t('trophyRoom.total', { count: awards.length })}
        </span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {types.map((type) => {
          const list = grouped[type];
          const Icon = AWARD_ICON[type] ?? Award;
          const color = AWARD_ICON_COLOR[type] ?? 'text-tactical';
          const isRound = type === 'round_mvp';

          // Round MVPs can pile up (one per round). Group them by
          // season so the chip strip stays readable: "T1 · R3, R5, R7".
          const roundsBySeason = isRound ? groupRoundsBySeason(list) : null;
          const roundChipsToShow = roundsBySeason?.slice(0, 3) ?? [];
          const extraRoundSeasons = (roundsBySeason?.length ?? 0) - roundChipsToShow.length;

          return (
            <div key={type} className="rounded-lg border bg-card p-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-[11px] font-display font-bold truncate">
                  {t(`seasonAwards.labels.${type}`, { defaultValue: type })}
                </span>
                {list.length > 1 && (
                  <span className="ml-auto text-[10px] font-display font-bold text-amber-500">
                    ×{list.length}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {isRound && roundsBySeason
                  ? (
                    <>
                      {roundChipsToShow.map((g) => (
                        <span
                          key={`s${g.season}`}
                          className="text-[9px] uppercase tracking-wide font-display font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                        >
                          {t('trophyRoom.round_group', {
                            count: g.rounds.length,
                            season: g.season,
                            rounds: g.rounds.join(', '),
                          })}
                        </span>
                      ))}
                      {extraRoundSeasons > 0 && (
                        <span className="text-[9px] font-display font-bold text-muted-foreground">
                          +{extraRoundSeasons}
                        </span>
                      )}
                    </>
                  )
                  : (
                    <>
                      {list.slice(0, 6).map((a) => (
                        <span
                          key={a.id}
                          className="text-[9px] uppercase tracking-wide font-display font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                        >
                          {t('trophyRoom.season_label', { season: a.season_number })}
                        </span>
                      ))}
                      {list.length > 6 && (
                        <span className="text-[9px] font-display font-bold text-muted-foreground">
                          +{list.length - 6}
                        </span>
                      )}
                    </>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupRoundsBySeason(list: AwardRow[]): Array<{ season: number; rounds: number[] }> {
  const bySeason = new Map<number, number[]>();
  for (const a of list) {
    const s = a.season_number ?? 0;
    const r = a.round_number ?? 0;
    const arr = bySeason.get(s) ?? [];
    arr.push(r);
    bySeason.set(s, arr);
  }
  return Array.from(bySeason.entries())
    .sort(([a], [b]) => b - a)
    .map(([season, rounds]) => ({ season, rounds: rounds.sort((a, b) => a - b) }));
}
