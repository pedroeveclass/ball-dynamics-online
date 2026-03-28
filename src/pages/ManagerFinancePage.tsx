import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Building2, Users, Store, Handshake, Dumbbell, Loader2 } from 'lucide-react';

const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const FACILITY_STATS: Record<string, Record<number, { revenue: number; cost: number }>> = {
  souvenir_shop: { 1: { revenue: 3000, cost: 500 }, 2: { revenue: 6000, cost: 1000 }, 3: { revenue: 12000, cost: 2000 }, 4: { revenue: 22000, cost: 4000 }, 5: { revenue: 40000, cost: 7000 } },
  sponsorship: { 1: { revenue: 5000, cost: 800 }, 2: { revenue: 10000, cost: 1500 }, 3: { revenue: 20000, cost: 3000 }, 4: { revenue: 38000, cost: 6000 }, 5: { revenue: 70000, cost: 10000 } },
  training_center: { 1: { revenue: 0, cost: 700 }, 2: { revenue: 0, cost: 1500 }, 3: { revenue: 0, cost: 3000 }, 4: { revenue: 0, cost: 6000 }, 5: { revenue: 0, cost: 10000 } },
  stadium: { 1: { revenue: 0, cost: 2000 }, 2: { revenue: 0, cost: 4000 }, 3: { revenue: 0, cost: 7000 }, 4: { revenue: 0, cost: 12000 }, 5: { revenue: 0, cost: 20000 } },
};

const FACILITY_LABELS: Record<string, { label: string; icon: typeof Store }> = {
  souvenir_shop: { label: 'Loja de Souvenirs', icon: Store },
  sponsorship: { label: 'Patrocínios', icon: Handshake },
  training_center: { label: 'Centro de Treinamento', icon: Dumbbell },
  stadium: { label: 'Estádio', icon: Building2 },
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
  const { club } = useAuth();
  const [finance, setFinance] = useState<any>(null);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [matchdayRevenue, setMatchdayRevenue] = useState(0);
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
    return { ...f, ...stats, ...FACILITY_LABELS[f.facility_type] };
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
  const matchdayWeekly = matchdayRevenue; // ~1 home game/week on average

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Finanças</h1>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Saldo" value={formatBRL(balance)} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Receita/Semana" value={formatBRL(totalWeeklyRevenue)} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Despesas/Semana" value={formatBRL(totalWeeklyCost)} icon={<TrendingDown className="h-5 w-5" />} />
          <StatCard
            label="Resultado/Semana"
            value={formatBRL(weeklyProfit)}
            icon={<DollarSign className="h-5 w-5" />}
          />
        </div>

        {/* Revenue breakdown */}
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4 text-pitch">Receitas Semanais</h2>
          <div className="space-y-2 text-sm">
            {facilityBreakdown.filter(f => f.revenue > 0).map(f => {
              const Icon = f.icon;
              return (
                <div key={f.facility_type} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Nv. {f.level}</span>
                  </div>
                  <span className="font-display font-bold text-pitch">{formatBRL(f.revenue)}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">Total Receita Facilities</span>
              <span className="font-display font-bold text-pitch">{formatBRL(totalFacilityRevenue)}</span>
            </div>
            {matchdayRevenue > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Bilheteria (est. por jogo)</span>
                </div>
                <span className="font-display font-bold text-pitch">{formatBRL(matchdayRevenue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expense breakdown */}
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4 text-destructive">Despesas Semanais</h2>
          <div className="space-y-2 text-sm">
            {/* Facility costs */}
            {facilityBreakdown.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.facility_type} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Manutenção {f.label}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Nv. {f.level}</span>
                  </div>
                  <span className="font-display font-bold text-destructive">-{formatBRL(f.cost)}</span>
                </div>
              );
            })}

            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">Total Manutenção</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalFacilityCost)}</span>
            </div>

            {/* Salaries */}
            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Folha Salarial ({squadSize} jogadores)</span>
              </div>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalSalaries)}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-t border-border">
              <span className="text-muted-foreground font-semibold">Total Despesas</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalWeeklyCost)}</span>
            </div>
          </div>
        </div>

        {/* Weekly summary */}
        <div className={`stat-card border-2 ${weeklyProfit >= 0 ? 'border-pitch/30 bg-pitch/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <h2 className="font-display font-semibold text-sm mb-3">Resumo Semanal</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receitas</span>
              <span className="font-display font-bold text-pitch">{formatBRL(totalWeeklyRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Despesas</span>
              <span className="font-display font-bold text-destructive">-{formatBRL(totalWeeklyCost)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">Resultado</span>
              <span className={`font-display text-lg font-bold ${weeklyProfit >= 0 ? 'text-pitch' : 'text-destructive'}`}>
                {weeklyProfit >= 0 ? '+' : ''}{formatBRL(weeklyProfit)}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * Não inclui receita de bilheteria, que varia por jogo. Estimativa por jogo em casa: {formatBRL(matchdayRevenue)}
          </p>
        </div>
      </div>
    </ManagerLayout>
  );
}
