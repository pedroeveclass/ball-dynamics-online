import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Building2, Users, Store, Handshake, Dumbbell, Loader2 } from 'lucide-react';
import { formatBRL } from '@/lib/formatting';
import { formatDate } from '@/lib/formatDate';

const FACILITY_STATS: Record<string, Record<number, { revenue: number; cost: number }>> = {
  souvenir_shop: { 1: { revenue: 3000, cost: 500 }, 2: { revenue: 6000, cost: 1000 }, 3: { revenue: 12000, cost: 2000 }, 4: { revenue: 22000, cost: 4000 }, 5: { revenue: 40000, cost: 7000 } },
  sponsorship: { 1: { revenue: 5000, cost: 800 }, 2: { revenue: 10000, cost: 1500 }, 3: { revenue: 20000, cost: 3000 }, 4: { revenue: 38000, cost: 6000 }, 5: { revenue: 70000, cost: 10000 } },
  training_center: { 1: { revenue: 0, cost: 700 }, 2: { revenue: 0, cost: 1500 }, 3: { revenue: 0, cost: 3000 }, 4: { revenue: 0, cost: 6000 }, 5: { revenue: 0, cost: 10000 } },
  stadium: { 1: { revenue: 0, cost: 2000 }, 2: { revenue: 0, cost: 3500 }, 3: { revenue: 0, cost: 5500 }, 4: { revenue: 0, cost: 8000 }, 5: { revenue: 0, cost: 12000 }, 6: { revenue: 0, cost: 18000 }, 7: { revenue: 0, cost: 25000 }, 8: { revenue: 0, cost: 35000 }, 9: { revenue: 0, cost: 48000 }, 10: { revenue: 0, cost: 65000 } },
};

const FACILITY_ICONS: Record<string, typeof Store> = {
  souvenir_shop: Store,
  sponsorship: Handshake,
  training_center: Dumbbell,
  stadium: Building2,
};

interface FacilityRow {
  facility_type: string;
  level: number;
}

interface ContractRow {
  weekly_salary: number;
  player_profiles: { full_name: string } | null;
}

export default function ManagerFinancePage() {
  const { t } = useTranslation('manager_finance');
  const { current: lang } = useAppLanguage();
  const { club } = useAuth();
  const [finance, setFinance] = useState<any>(null);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [matchdayRevenue, setMatchdayRevenue] = useState(0);
  const [ticketHistory, setTicketHistory] = useState<Array<{ match_id: string; title: string; body: string; created_at: string; home_club: string; away_club: string; score: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club) return;
    fetchAll();
  }, [club]);

  async function fetchAll() {
    setLoading(true);
    const [finRes, facRes, conRes, mdRes] = await Promise.all([
      supabase.from('club_finances').select('*').eq('club_id', club!.id).maybeSingle(),
      supabase.from('club_facilities').select('facility_type, level').eq('club_id', club!.id),
      supabase.from('contracts').select('weekly_salary, player_profiles(full_name)').eq('club_id', club!.id).eq('status', 'active'),
      supabase.rpc('calculate_matchday_revenue', { p_club_id: club!.id, p_opponent_reputation: 20 }),
    ]);

    setFinance(finRes.data);
    setFacilities((facRes.data || []) as FacilityRow[]);
    setContracts((conRes.data || []) as ContractRow[]);
    setMatchdayRevenue(
      ((mdRes.data || []) as any[]).reduce((sum: number, r: any) => sum + Number(r.sector_revenue || 0), 0)
    );

    // Fetch ticket revenue history from home matches
    const { data: ticketEvents } = await supabase
      .from('match_event_logs')
      .select('match_id, title, body, created_at')
      .eq('event_type', 'ticket_revenue')
      .in('match_id', (await supabase.from('matches').select('id').eq('home_club_id', club!.id).eq('status', 'finished')).data?.map(m => m.id) || [])
      .order('created_at', { ascending: false })
      .limit(20);

    if (ticketEvents && ticketEvents.length > 0) {
      const matchIds = [...new Set(ticketEvents.map(e => e.match_id))];
      const { data: matches } = await supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, home_score, away_score, finished_at')
        .in('id', matchIds);

      const clubIds = [...new Set((matches || []).flatMap(m => [m.home_club_id, m.away_club_id]))];
      const { data: clubs } = await supabase.from('clubs').select('id, name').in('id', clubIds);
      const clubMap = new Map((clubs || []).map(c => [c.id, c.name]));

      setTicketHistory(ticketEvents.map(e => {
        const m = (matches || []).find(mm => mm.id === e.match_id);
        return {
          match_id: e.match_id,
          title: e.title,
          body: e.body,
          created_at: m?.finished_at || e.created_at,
          home_club: clubMap.get(m?.home_club_id || '') || '?',
          away_club: clubMap.get(m?.away_club_id || '') || '?',
          score: m ? `${m.home_score} x ${m.away_score}` : '',
        };
      }));
    }

    setLoading(false);
  }

  if (!club || loading) {
    return (
      <ManagerLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ManagerLayout>
    );
  }

  // Calculate facility revenue and costs
  let totalFacilityRevenue = 0;
  let totalFacilityCost = 0;
  const facilityBreakdown = facilities.map(f => {
    const stats = FACILITY_STATS[f.facility_type]?.[f.level] || { revenue: 0, cost: 0 };
    totalFacilityRevenue += stats.revenue;
    totalFacilityCost += stats.cost;
    return { ...f, ...stats, label: t(`facilities.${f.facility_type}`), icon: FACILITY_ICONS[f.facility_type] };
  });

  // Salaries
  const totalSalaries = contracts.reduce((sum, c) => sum + Number(c.weekly_salary || 0), 0);
  const squadSize = contracts.length;

  // Totals
  const totalWeeklyRevenue = totalFacilityRevenue;
  const totalWeeklyCost = totalFacilityCost + totalSalaries;
  const weeklyProfit = totalWeeklyRevenue - totalWeeklyCost;
  const balance = finance?.balance ?? 0;

  // Matchday is per game, estimate 1 game/week average
  const ticketPrefix = t('ticket_history.ticket_label_prefix');

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">{t('title')}</h1>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('stats.balance')} value={formatBRL(balance)} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label={t('stats.weekly_revenue')} value={formatBRL(totalWeeklyRevenue)} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label={t('stats.weekly_expenses')} value={formatBRL(totalWeeklyCost)} icon={<TrendingDown className="h-5 w-5" />} />
          <StatCard
            label={t('stats.weekly_profit')}
            value={formatBRL(weeklyProfit)}
            icon={<DollarSign className="h-5 w-5" />}
          />
        </div>

        {/* Revenue breakdown */}
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4 text-pitch">{t('revenue_section.title')}</h2>
          <div className="space-y-2 text-sm">
            {facilityBreakdown.filter(f => f.revenue > 0).map(f => {
              const Icon = f.icon;
              return (
                <div key={f.facility_type} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t('level_short', { level: f.level })}</span>
                  </div>
                  <span className="font-display font-bold text-pitch">{formatBRL(f.revenue)}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">{t('revenue_section.total_facilities')}</span>
              <span className="font-display font-bold text-pitch">{formatBRL(totalFacilityRevenue)}</span>
            </div>
            {matchdayRevenue > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('revenue_section.matchday')}</span>
                </div>
                <span className="font-display font-bold text-pitch">{formatBRL(matchdayRevenue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expense breakdown */}
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4 text-destructive">{t('expense_section.title')}</h2>
          <div className="space-y-2 text-sm">
            {/* Facility costs */}
            {facilityBreakdown.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.facility_type} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-muted-foreground">{t('expense_section.facility_maintenance', { label: f.label })}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t('level_short', { level: f.level })}</span>
                  </div>
                  <span className="font-display font-bold text-destructive">-{formatBRL(f.cost)}</span>
                </div>
              );
            })}

            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">{t('expense_section.total_maintenance')}</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalFacilityCost)}</span>
            </div>

            {/* Salaries */}
            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('expense_section.salaries', { count: squadSize })}</span>
              </div>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalSalaries)}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">{t('expense_section.total_expenses')}</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalWeeklyCost)}</span>
            </div>
          </div>
        </div>

        {/* Ticket revenue history */}
        {ticketHistory.length > 0 && (
          <div className="stat-card">
            <h2 className="font-display font-semibold text-sm mb-4 text-amber-500">{t('ticket_history.title')}</h2>
            <div className="space-y-2 text-sm max-h-[300px] overflow-y-auto">
              {ticketHistory.map((tk, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="font-medium">{tk.home_club} {tk.score} {tk.away_club}</div>
                    <div className="text-xs text-muted-foreground">{tk.body}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(tk.created_at, lang, 'datetime_short')}</div>
                  </div>
                  <span className="font-display font-bold text-amber-500 whitespace-nowrap ml-4">{tk.title.replace('🎫 Bilheteria: ', '').replace(ticketPrefix, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly summary */}
        <div className={`stat-card border-2 ${weeklyProfit >= 0 ? 'border-pitch/30 bg-pitch/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <h2 className="font-display font-semibold text-sm mb-3">{t('summary.title')}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.revenues')}</span>
              <span className="font-display font-bold text-pitch">{formatBRL(totalWeeklyRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.expenses')}</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalWeeklyCost)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">{t('summary.result')}</span>
              <span className={`font-display text-lg font-bold ${weeklyProfit >= 0 ? 'text-pitch' : 'text-destructive'}`}>
                {weeklyProfit >= 0 ? '+' : ''}{formatBRL(weeklyProfit)}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t('summary.footnote', { amount: formatBRL(matchdayRevenue) })}
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}
