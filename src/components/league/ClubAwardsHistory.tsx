import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { AWARD_ICON, AWARD_ICON_COLOR } from './awardVisuals';

type AwardRow = {
  id: string;
  player_profile_id: string;
  award_type: string;
  season_number: number | null;
  round_number: number | null;
};

type Player = {
  id: string;
  full_name: string | null;
  appearance: any;
};

interface Props {
  clubId: string;
}

// Lists trophies won by players currently signed to this club.
// Hidden when the squad has no awards on record.
export function ClubAwardsHistory({ clubId }: Props) {
  const { t } = useTranslation('league');
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: squadRows } = await supabase
        .from('player_profiles')
        .select('id, full_name, appearance')
        .eq('club_id', clubId);

      if (cancelled) return;
      const squad = (squadRows ?? []) as Player[];
      const playerMap: Record<string, Player> = {};
      squad.forEach((p) => { playerMap[p.id] = p; });
      setPlayers(playerMap);

      if (squad.length === 0) {
        setAwards([]);
        setLoading(false);
        return;
      }

      const { data: awardRows } = await supabase
        .from('player_awards' as any)
        .select('id, player_profile_id, award_type, season_number, round_number')
        .in('player_profile_id', squad.map((p) => p.id))
        .order('awarded_at', { ascending: false });

      if (!cancelled) {
        setAwards((awardRows ?? []) as any);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  if (loading || awards.length === 0) return null;

  // Group by player → list trophies per player
  const byPlayer: Record<string, AwardRow[]> = {};
  awards.forEach((a) => {
    (byPlayer[a.player_profile_id] = byPlayer[a.player_profile_id] ?? []).push(a);
  });

  const playerIdsSorted = Object.keys(byPlayer).sort(
    (a, b) => byPlayer[b].length - byPlayer[a].length
  );

  return (
    <div className="stat-card space-y-3">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        {t('clubAwards.title')}
        <span className="text-[10px] font-normal text-muted-foreground ml-auto">
          {t('clubAwards.total', { count: awards.length })}
        </span>
      </h2>

      <div className="space-y-2">
        {playerIdsSorted.map((pid) => {
          const player = players[pid];
          const list = byPlayer[pid];
          return (
            <div key={pid} className="flex items-center gap-3 rounded-lg border bg-card p-2">
              <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-muted">
                <PlayerAvatar
                  appearance={player?.appearance ?? null}
                  variant="face"
                  playerName={player?.full_name ?? ''}
                  fallbackSeed={pid}
                  className="h-full w-full"
                />
              </div>
              <Link
                to={`/player/${pid}`}
                className="text-xs font-display font-bold hover:text-tactical truncate"
              >
                {player?.full_name ?? '—'}
              </Link>
              <div className="flex flex-wrap gap-1 ml-auto">
                {list.slice(0, 8).map((a) => {
                  const Icon = AWARD_ICON[a.award_type] ?? Trophy;
                  const color = AWARD_ICON_COLOR[a.award_type] ?? 'text-tactical';
                  const tip = `${t(`seasonAwards.labels.${a.award_type}`, { defaultValue: a.award_type })}${
                    a.round_number ? ` · R${a.round_number}/T${a.season_number}` : a.season_number ? ` · T${a.season_number}` : ''
                  }`;
                  return (
                    <span
                      key={a.id}
                      title={tip}
                      className="inline-flex items-center justify-center rounded border bg-background h-5 w-5"
                    >
                      <Icon className={`h-3 w-3 ${color}`} />
                    </span>
                  );
                })}
                {list.length > 8 && (
                  <span className="text-[10px] text-muted-foreground self-center">
                    +{list.length - 8}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
