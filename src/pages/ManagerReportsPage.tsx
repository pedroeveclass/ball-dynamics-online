import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PositionBadge } from '@/components/PositionBadge';
import { BarChart3, Bell, Clock, Dumbbell, Trophy, ShoppingBag, TrendingUp, Lock } from 'lucide-react';
import { PlayerActivityDrawer, type PlayerReportDetail, type ReportEvent } from '@/components/reports/PlayerActivityDrawer';
import { NotifyPlayerDialog } from '@/components/reports/NotifyPlayerDialog';
import type { DayActivity } from '@/components/reports/ActivityHeatmap';

interface RosterPlayer {
  id: string;
  user_id: string | null;
  full_name: string;
  age: number;
  primary_position: string;
  overall: number;
  appearance: any;
  last_trained_at: string | null;
  last_match_at: string | null;
}

interface TrainingRow {
  player_profile_id: string;
  attribute_key: string;
  growth: number;
  trained_at: string;
}

interface PurchaseRow {
  player_profile_id: string;
  created_at: string;
  store_items: { name: string; category: string } | null;
}

interface MatchRow {
  player_profile_id: string;
  participant_id: string;
  match_id: string;
  match_created_at: string;
  home_club_id: string;
  away_club_id: string;
  my_club_id: string;
  home_score: number | null;
  away_score: number | null;
  home_club_name: string | null;
  away_club_name: string | null;
  goals: number;
  assists: number;
}

const PERIODS = [
  { key: 7, labelKey: 'periods.days_7' },
  { key: 30, labelKey: 'periods.days_30' },
  { key: 90, labelKey: 'periods.days_90' },
] as const;

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function ManagerReportsPage() {
  const { t } = useTranslation('manager_reports');
  const { managerProfile, club } = useAuth();
  const [periodDays, setPeriodDays] = useState(30);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<RosterPlayer | null>(null);

  // Gate: only the club owner (manager_profile_id). Assistants blocked.
  const isOwner = !!(club && managerProfile && club.manager_profile_id === managerProfile.id);

  useEffect(() => {
    if (!club || !isOwner) return;
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);
      const periodStartISO = periodStart.toISOString();

      // 1. Roster
      const { data: rosterData } = await supabase
        .from('player_profiles')
        .select('id, user_id, full_name, age, primary_position, overall, appearance, last_trained_at, last_match_at')
        .eq('club_id', club.id)
        .order('full_name');

      const rosterList = (rosterData ?? []) as RosterPlayer[];
      if (cancelled) return;
      const playerIds = rosterList.map(p => p.id);

      if (playerIds.length === 0) {
        setRoster([]); setTrainings([]); setPurchases([]); setMatches([]);
        setLoading(false);
        return;
      }

      // 2. Trainings in period
      const trainingReq = supabase
        .from('training_history')
        .select('player_profile_id, attribute_key, growth, trained_at')
        .in('player_profile_id', playerIds)
        .gte('trained_at', periodStartISO);

      // 3. Purchases in period (join store_items, no price)
      const purchasesReq = supabase
        .from('store_purchases')
        .select('player_profile_id, created_at, store_items(name, category)')
        .in('player_profile_id', playerIds)
        .gte('created_at', periodStartISO);

      // 4. Match participants in finished matches in period
      const matchParticipantsReq = supabase
        .from('match_participants')
        .select('id, player_profile_id, match_id, club_id, matches!inner(id, status, created_at, home_club_id, away_club_id, home_score, away_score, home_club:clubs!matches_home_club_id_fkey(name), away_club:clubs!matches_away_club_id_fkey(name))')
        .in('player_profile_id', playerIds)
        .eq('matches.status', 'finished')
        .gte('matches.created_at', periodStartISO);

      const [trainingRes, purchaseRes, matchPartRes] = await Promise.all([
        trainingReq, purchasesReq, matchParticipantsReq,
      ]);

      if (cancelled) return;

      // 5. Goals/assists: fetch goal events for the matches we found
      const matchIds = Array.from(new Set((matchPartRes.data ?? []).map((m: any) => m.match_id)));
      const participantIds = Array.from(new Set((matchPartRes.data ?? []).map((m: any) => m.id)));
      let goalsByParticipant: Record<string, number> = {};
      let assistsByParticipant: Record<string, number> = {};
      if (matchIds.length > 0) {
        const { data: goalEvents } = await supabase
          .from('match_event_logs')
          .select('match_id, payload')
          .eq('event_type', 'goal')
          .in('match_id', matchIds);
        for (const ev of goalEvents ?? []) {
          const p = (ev as any).payload ?? {};
          if (p.scorer_participant_id && participantIds.includes(p.scorer_participant_id)) {
            goalsByParticipant[p.scorer_participant_id] = (goalsByParticipant[p.scorer_participant_id] || 0) + 1;
          }
          if (p.assister_participant_id && participantIds.includes(p.assister_participant_id)) {
            assistsByParticipant[p.assister_participant_id] = (assistsByParticipant[p.assister_participant_id] || 0) + 1;
          }
        }
      }

      const matchRows: MatchRow[] = (matchPartRes.data ?? []).map((mp: any) => ({
        player_profile_id: mp.player_profile_id,
        participant_id: mp.id,
        match_id: mp.match_id,
        match_created_at: mp.matches.created_at,
        home_club_id: mp.matches.home_club_id,
        away_club_id: mp.matches.away_club_id,
        my_club_id: mp.club_id,
        home_score: mp.matches.home_score,
        away_score: mp.matches.away_score,
        home_club_name: mp.matches.home_club?.name ?? null,
        away_club_name: mp.matches.away_club?.name ?? null,
        goals: goalsByParticipant[mp.id] ?? 0,
        assists: assistsByParticipant[mp.id] ?? 0,
      }));

      setRoster(rosterList);
      setTrainings((trainingRes.data ?? []) as TrainingRow[]);
      setPurchases((purchaseRes.data ?? []) as any);
      setMatches(matchRows);
      setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [club?.id, isOwner, periodDays]);

  // Aggregate per player
  const rows = useMemo(() => {
    return roster.map(p => {
      const pTrainings = trainings.filter(t => t.player_profile_id === p.id);
      const pPurchases = purchases.filter(pu => pu.player_profile_id === p.id);
      const pMatches = matches.filter(m => m.player_profile_id === p.id);

      const daysTrainedSet = new Set(pTrainings.map(t => toLocalISODate(new Date(t.trained_at))));
      const goals = pMatches.reduce((s, m) => s + m.goals, 0);
      const assists = pMatches.reduce((s, m) => s + m.assists, 0);
      const attributeGain = pTrainings.reduce((s, t) => s + (t.growth || 0), 0);

      const score = daysTrainedSet.size * 2 + pMatches.length * 5 + pPurchases.length;
      const daysSinceLastTraining = daysSince(p.last_trained_at);

      return {
        player: p,
        daysTrained: daysTrainedSet.size,
        trainings: pTrainings.length,
        matchesPlayed: pMatches.length,
        goals, assists,
        purchases: pPurchases.length,
        attributeGain,
        score,
        daysSinceLastTraining,
      };
    }).sort((a, b) => b.score - a.score);
  }, [roster, trainings, purchases, matches]);

  const inactiveCount = rows.filter(r => r.daysSinceLastTraining != null && r.daysSinceLastTraining >= 5).length;

  const buildDetail = (playerId: string): PlayerReportDetail | null => {
    const row = rows.find(r => r.player.id === playerId);
    if (!row) return null;
    const p = row.player;
    const pTrainings = trainings.filter(t => t.player_profile_id === p.id);
    const pPurchases = purchases.filter(pu => pu.player_profile_id === p.id);
    const pMatches = matches.filter(m => m.player_profile_id === p.id);

    const events: ReportEvent[] = [
      ...pTrainings.map(t => ({ type: 'training' as const, date: t.trained_at, data: t })),
      ...pMatches.map(m => {
        const isHome = m.my_club_id === m.home_club_id;
        const opponent = isHome ? m.away_club_name : m.home_club_name;
        const myScore = isHome ? m.home_score : m.away_score;
        const oppScore = isHome ? m.away_score : m.home_score;
        const result = myScore != null && oppScore != null ? `${myScore}-${oppScore}` : null;
        return { type: 'match' as const, date: m.match_created_at, data: { opponent: opponent ?? t('fallback_opponent'), goals: m.goals, assists: m.assists, result } };
      }),
      ...pPurchases.map(pu => ({
        type: 'purchase' as const,
        date: pu.created_at,
        data: { name: pu.store_items?.name ?? t('fallback_item'), category: pu.store_items?.category ?? null },
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Build 30-day activity map (always 30d for the heatmap, regardless of period filter)
    const activityByDay: Record<string, DayActivity> = {};
    const hmStart = new Date();
    hmStart.setDate(hmStart.getDate() - 30);
    const hmStartMs = hmStart.getTime();
    for (const t of pTrainings) {
      if (new Date(t.trained_at).getTime() < hmStartMs) continue;
      const k = toLocalISODate(new Date(t.trained_at));
      activityByDay[k] = activityByDay[k] ?? { trainings: 0, matches: 0, purchases: 0 };
      activityByDay[k].trainings++;
    }
    for (const m of pMatches) {
      if (new Date(m.match_created_at).getTime() < hmStartMs) continue;
      const k = toLocalISODate(new Date(m.match_created_at));
      activityByDay[k] = activityByDay[k] ?? { trainings: 0, matches: 0, purchases: 0 };
      activityByDay[k].matches++;
    }
    for (const pu of pPurchases) {
      if (new Date(pu.created_at).getTime() < hmStartMs) continue;
      const k = toLocalISODate(new Date(pu.created_at));
      activityByDay[k] = activityByDay[k] ?? { trainings: 0, matches: 0, purchases: 0 };
      activityByDay[k].purchases++;
    }

    return {
      player: {
        id: p.id,
        user_id: p.user_id,
        full_name: p.full_name,
        age: p.age,
        primary_position: p.primary_position,
        overall: p.overall,
        appearance: p.appearance,
      },
      events,
      activityByDay,
      stats: {
        daysTrained: row.daysTrained,
        trainings: row.trainings,
        matchesPlayed: row.matchesPlayed,
        goals: row.goals,
        assists: row.assists,
        purchases: row.purchases,
        attributeGain: row.attributeGain,
        score: row.score,
      },
      daysSinceLastTraining: row.daysSinceLastTraining,
    };
  };

  if (!managerProfile) return null;

  if (!club) {
    return (
      <ManagerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">{t('no_club')}</p>
        </div>
      </ManagerLayout>
    );
  }

  if (!isOwner) {
    return (
      <ManagerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3 max-w-md mx-auto">
          <Lock className="h-12 w-12 text-muted-foreground/40" />
          <h2 className="font-display text-xl font-bold">{t('owner_only.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('owner_only.subtitle')}
          </p>
        </div>
      </ManagerLayout>
    );
  }

  const selectedDetail = selectedPlayerId ? buildDetail(selectedPlayerId) : null;

  return (
    <ManagerLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-pitch" />
            <div>
              <h1 className="font-display text-2xl font-bold">{t('header.title')}</h1>
              <p className="text-xs text-muted-foreground">{t('header.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodDays(p.key)}
                className={`px-3 py-1 text-xs font-display font-semibold rounded transition-colors ${periodDays === p.key ? 'bg-pitch text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={<Dumbbell className="h-4 w-4" />} label={t('summary.trainings')} value={trainings.length} />
          <SummaryCard icon={<Trophy className="h-4 w-4" />} label={t('summary.matches')} value={matches.length} />
          <SummaryCard icon={<ShoppingBag className="h-4 w-4" />} label={t('summary.purchases')} value={purchases.length} />
          <SummaryCard
            icon={<Clock className="h-4 w-4" />}
            label={t('summary.inactive')}
            value={inactiveCount}
            highlight={inactiveCount > 0 ? 'warn' : undefined}
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-display">{t('columns.player')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.last_training')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.days_trained')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.attribute_gain')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.matches')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.goals_assists')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.purchases')}</th>
                  <th className="text-center px-2 py-2 font-display">{t('columns.score')}</th>
                  <th className="text-right px-3 py-2 font-display">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">{t('table.loading')}</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">{t('table.empty')}</td></tr>
                ) : (
                  rows.map(r => {
                    const p = r.player;
                    const lastTrain = r.daysSinceLastTraining;
                    const inactive = lastTrain != null && lastTrain >= 5;
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border/60 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => { setSelectedPlayerId(p.id); setDrawerOpen(true); }}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-muted overflow-hidden shrink-0">
                              <PlayerAvatar appearance={p.appearance} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-display font-semibold truncate">{p.full_name}</div>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <PositionBadge position={p.primary_position} />
                                <span>{t('table.ovr', { value: p.overall })}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`text-center px-2 py-2 tabular-nums ${inactive ? 'text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                          {lastTrain == null ? '—' : lastTrain === 0 ? t('table.today') : t('table.days_short', { n: lastTrain })}
                        </td>
                        <td className="text-center px-2 py-2 tabular-nums">{r.daysTrained}</td>
                        <td className="text-center px-2 py-2 tabular-nums">
                          {r.attributeGain > 0 ? <span className="text-pitch">+{r.attributeGain}</span> : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="text-center px-2 py-2 tabular-nums">{r.matchesPlayed}</td>
                        <td className="text-center px-2 py-2 tabular-nums">
                          <span className={r.goals > 0 ? 'text-pitch font-semibold' : 'text-muted-foreground'}>{r.goals}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={r.assists > 0 ? 'text-tactical font-semibold' : 'text-muted-foreground'}>{r.assists}</span>
                        </td>
                        <td className="text-center px-2 py-2 tabular-nums">{r.purchases}</td>
                        <td className="text-center px-2 py-2">
                          <span className="inline-block bg-pitch/15 border border-pitch/30 text-pitch font-display font-bold tabular-nums px-2 py-0.5 rounded">
                            {r.score}
                          </span>
                        </td>
                        <td className="text-right px-3 py-2">
                          {p.user_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={e => { e.stopPropagation(); setNotifyTarget(p); }}
                            >
                              <Bell className="h-3 w-3 mr-1" />
                              {t('table.notify')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground italic">
          {t('score_explainer')}
        </div>
      </div>

      <PlayerActivityDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        detail={selectedDetail}
        periodDays={periodDays}
      />

      <NotifyPlayerDialog
        open={!!notifyTarget}
        onOpenChange={o => { if (!o) setNotifyTarget(null); }}
        playerUserId={notifyTarget?.user_id ?? null}
        playerName={notifyTarget?.full_name ?? ''}
        daysInactive={notifyTarget ? daysSince(notifyTarget.last_trained_at) : null}
      />
    </ManagerLayout>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: 'warn' }) {
  const border = highlight === 'warn' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card';
  const text = highlight === 'warn' ? 'text-amber-400' : 'text-foreground';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${border}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-display text-2xl font-bold ${text}`}>{value}</div>
    </div>
  );
}
