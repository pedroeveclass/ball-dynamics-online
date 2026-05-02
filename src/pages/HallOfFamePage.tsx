import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Loader2, ArrowLeft } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ClubCrest } from '@/components/ClubCrest';
import { AWARD_ICON, AWARD_ICON_COLOR } from '@/components/league/awardVisuals';

type AwardRow = {
  id: string;
  player_profile_id: string;
  award_type: string;
  season_number: number | null;
  round_number: number | null;
  awarded_at: string;
  vote_count: number | null;
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

const TABS = ['all', 'season_mvp', 'season_top_scorer', 'season_top_assists', 'season_top_tackles', 'season_golden_glove', 'season_fair_play'] as const;
type TabKey = typeof TABS[number];

function HallLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
  const { t } = useTranslation('league');
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (playerProfile) return <AppLayout>{children}</AppLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/league" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="font-display text-lg font-bold">{t('hallOfFame.title')}</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

export default function HallOfFamePage() {
  const { t } = useTranslation('league');
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [clubs, setClubs] = useState<Record<string, ClubInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('player_awards' as any)
        .select('id, player_profile_id, award_type, season_number, round_number, awarded_at, vote_count, metric_value')
        .order('awarded_at', { ascending: false });

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
  }, []);

  // Leaderboard: per tab, group by player and rank by count
  const leaderboard = useMemo(() => {
    const filtered = tab === 'all'
      ? awards
      : awards.filter((a) => a.award_type === tab);
    const byPlayer: Record<string, AwardRow[]> = {};
    filtered.forEach((a) => {
      (byPlayer[a.player_profile_id] = byPlayer[a.player_profile_id] ?? []).push(a);
    });
    return Object.entries(byPlayer)
      .map(([pid, list]) => ({ pid, list }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [awards, tab]);

  return (
    <HallLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            {t('hallOfFame.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('hallOfFame.subtitle')}</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="overflow-x-auto flex-wrap h-auto">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k} className="text-xs">
                {t(`hallOfFame.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((k) => (
            <TabsContent key={k} value={k} className="space-y-2 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {t('hallOfFame.no_awards')}
                </p>
              ) : (
                leaderboard.map((entry, idx) => {
                  const player = players[entry.pid];
                  const club = player?.club_id ? clubs[player.club_id] : undefined;
                  return (
                    <div key={entry.pid} className="stat-card flex items-center gap-3 p-3">
                      <span className="font-display font-bold text-2xl text-muted-foreground w-8 text-center">
                        {idx + 1}
                      </span>
                      <div className="h-12 w-12 shrink-0 rounded-full overflow-hidden bg-muted">
                        <PlayerAvatar
                          appearance={player?.appearance ?? null}
                          variant="face"
                          clubPrimaryColor={club?.primary_color}
                          clubSecondaryColor={club?.secondary_color}
                          clubCrestUrl={club?.crest_url}
                          playerName={player?.nickname ?? ''}
                          fallbackSeed={entry.pid}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/player/${entry.pid}`}
                          className="font-display font-bold text-sm hover:text-tactical block truncate"
                        >
                          {player?.nickname ?? '—'}
                        </Link>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {club && (
                            <ClubCrest
                              crestUrl={club.crest_url}
                              primaryColor={club.primary_color || '#333'}
                              secondaryColor={club.secondary_color || '#fff'}
                              shortName={club.short_name || '?'}
                              className="h-3 w-3 rounded text-[7px]"
                            />
                          )}
                          <span className="truncate">{club?.short_name ?? ''}</span>
                          <span className="ml-2">
                            · {t('hallOfFame.appearances', { count: entry.list.length })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-[40%] justify-end">
                        {entry.list.slice(0, 8).map((a) => {
                          const Icon = AWARD_ICON[a.award_type] ?? Trophy;
                          const color = AWARD_ICON_COLOR[a.award_type] ?? 'text-tactical';
                          const tip = `${t(`seasonAwards.labels.${a.award_type}`, { defaultValue: a.award_type })}${
                            a.round_number ? ` · R${a.round_number}/T${a.season_number}` : a.season_number ? ` · T${a.season_number}` : ''
                          }`;
                          return (
                            <span
                              key={a.id}
                              title={tip}
                              className="inline-flex items-center justify-center rounded border bg-background h-6 w-6"
                            >
                              <Icon className={`h-3.5 w-3.5 ${color}`} />
                            </span>
                          );
                        })}
                        {entry.list.length > 8 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{entry.list.length - 8}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </HallLayout>
  );
}
