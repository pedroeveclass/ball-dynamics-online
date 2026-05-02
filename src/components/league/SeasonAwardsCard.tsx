import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Award, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ClubCrest } from '@/components/ClubCrest';
import { MvpPollCard } from './MvpPollCard';
import { AWARD_ICON, AWARD_ICON_COLOR } from './awardVisuals';

const AUTO_TYPES = [
  'season_top_scorer',
  'season_top_assists',
  'season_top_tackles',
  'season_golden_glove',
  'season_fair_play',
] as const;

type AwardRow = {
  id: string;
  player_profile_id: string;
  award_type: string;
  metric_value: number | null;
};

type PlayerInfo = {
  id: string;
  nickname: string | null;
  appearance: any;
  club_id: string | null;
};

type ClubInfo = {
  id: string;
  short_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  crest_url: string | null;
};

interface Props {
  seasonId: string;
  seasonNumber: number;
}

export function SeasonAwardsCard({ seasonId, seasonNumber }: Props) {
  const { t } = useTranslation('league');
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [clubs, setClubs] = useState<Record<string, ClubInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('player_awards' as any)
        .select('id, player_profile_id, award_type, metric_value')
        .eq('scope_entity_id', seasonId)
        .in('award_type', AUTO_TYPES as any);

      if (cancelled) return;
      const list = (rows ?? []) as any as AwardRow[];
      setAwards(list);

      const playerIds = Array.from(new Set(list.map((r) => r.player_profile_id)));
      if (playerIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: pRows } = await supabase
        .from('player_profiles')
        .select('id, nickname, appearance, club_id')
        .in('id', playerIds);

      const playerMap: Record<string, PlayerInfo> = {};
      (pRows ?? []).forEach((r: any) => { playerMap[r.id] = r; });

      const clubIds = Array.from(new Set((pRows ?? []).map((r: any) => r.club_id).filter(Boolean)));
      const { data: cRows } = clubIds.length
        ? await supabase
            .from('clubs')
            .select('id, short_name, primary_color, secondary_color, crest_url')
            .in('id', clubIds as string[])
        : { data: [] as any[] };

      const clubMap: Record<string, ClubInfo> = {};
      (cRows ?? []).forEach((r: any) => { clubMap[r.id] = r; });

      if (!cancelled) {
        setPlayers(playerMap);
        setClubs(clubMap);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  const hasAuto = awards.length > 0;

  return (
    <div className="space-y-3">
      <div className="stat-card space-y-3">
        <h2 id="season-awards" className="font-display font-semibold text-sm flex items-center gap-2">
          <Award className="h-4 w-4 text-tactical" />
          {t('seasonAwards.title', { season: seasonNumber })}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAuto ? (
          <p className="text-xs text-muted-foreground py-2">{t('seasonAwards.no_awards')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {AUTO_TYPES.map((type) => {
              const award = awards.find((a) => a.award_type === type);
              if (!award) return null;
              const player = players[award.player_profile_id];
              const club = player?.club_id ? clubs[player.club_id] : undefined;
              const Icon = AWARD_ICON[type] ?? Award;
              const iconColor = AWARD_ICON_COLOR[type] ?? 'text-tactical';

              return (
                <div
                  key={type}
                  className="rounded-lg border bg-card p-2 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                    <span className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground truncate">
                      {t(`seasonAwards.labels.${type}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-muted">
                      <PlayerAvatar
                        appearance={player?.appearance ?? null}
                        variant="face"
                        clubPrimaryColor={club?.primary_color}
                        clubSecondaryColor={club?.secondary_color}
                        clubCrestUrl={club?.crest_url}
                        playerName={player?.nickname ?? ''}
                        fallbackSeed={award.player_profile_id}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/player/${award.player_profile_id}`}
                        className="block text-xs font-display font-bold truncate hover:text-tactical"
                      >
                        {player?.nickname ?? '—'}
                      </Link>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {club && (
                          <ClubCrest
                            crestUrl={club.crest_url}
                            primaryColor={club.primary_color || '#333'}
                            secondaryColor={club.secondary_color || '#fff'}
                            shortName={club.short_name || '?'}
                            className="h-3 w-3 rounded text-[7px]"
                          />
                        )}
                        <MetricLabel type={type} value={award.metric_value} t={t} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MvpPollCard
        scope="season_mvp"
        entityId={seasonId}
        voteRpc="vote_season_mvp"
        anchorId="season-mvp"
        title={t('seasonAwards.mvp_title', { season: seasonNumber })}
      />
    </div>
  );
}

function MetricLabel({ type, value, t }: { type: string; value: number | null; t: any }) {
  if (value == null) return null;
  const n = Math.round(Number(value));
  switch (type) {
    case 'season_top_scorer': return <span>{t('seasonAwards.metric.goals', { count: n })}</span>;
    case 'season_top_assists': return <span>{t('seasonAwards.metric.assists', { count: n })}</span>;
    case 'season_top_tackles': return <span>{t('seasonAwards.metric.tackles', { count: n })}</span>;
    case 'season_golden_glove': return <span>{t('seasonAwards.metric.saves', { count: n })}</span>;
    case 'season_fair_play': return <span>{t('seasonAwards.metric.fair_play')}</span>;
    default: return null;
  }
}
