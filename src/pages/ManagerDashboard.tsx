import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Users, DollarSign, Trophy, Building2, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ManagerDashboard() {
  const { managerProfile, club } = useAuth();
  const [finance, setFinance] = useState<any>(null);
  const [stadium, setStadium] = useState<any>(null);
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    if (!club) return;
    const fetchData = async () => {
      const [finRes, stadRes, playersRes] = await Promise.all([
        supabase.from('club_finances').select('*').eq('club_id', club.id).single(),
        supabase.from('stadiums').select('*').eq('club_id', club.id).single(),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('club_id', club.id).eq('status', 'active'),
      ]);
      setFinance(finRes.data);
      setStadium(stadRes.data);
      setPlayerCount(playersRes.count || 0);
    };
    fetchData();
  }, [club]);

  if (!managerProfile || !club) return null;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center font-display text-xl font-extrabold"
              style={{ backgroundColor: club.primary_color, color: club.secondary_color }}>
              {club.short_name}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">{club.name}</h1>
              <p className="text-sm text-muted-foreground">
                Manager: {managerProfile.full_name}
                {club.city && <> • {club.city}</>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Status</span>
            <p className="font-display font-bold text-pitch capitalize">{club.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Rep. Clube" value={club.reputation} icon={<Trophy className="h-5 w-5" />} />
          <StatCard label="Rep. Manager" value={managerProfile.reputation} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Elenco" value={playerCount} icon={<Users className="h-5 w-5" />} subtitle="jogadores" />
          <StatCard label="Saldo" value={finance ? `$${(finance.balance / 1000).toFixed(0)}k` : '...'} icon={<DollarSign className="h-5 w-5" />} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Finances summary */}
          <Link to="/manager/finance" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Finanças</span>
            </div>
            {finance ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="font-display font-bold">${finance.balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folha Salarial/Sem</span>
                  <span className="font-display font-bold">${finance.weekly_wage_bill.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receita Projetada</span>
                  <span className="font-display font-bold text-pitch">${finance.projected_income.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Despesas Projetadas</span>
                  <span className="font-display font-bold text-destructive">${finance.projected_expense.toLocaleString()}</span>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Carregando...</p>}
          </Link>

          {/* Stadium summary */}
          <Link to="/manager/stadium" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Estádio</span>
            </div>
            {stadium ? (
              <div className="space-y-2 text-sm">
                <p className="font-display font-bold text-lg">{stadium.name}</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacidade</span>
                  <span className="font-display font-bold">{stadium.capacity.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qualidade</span>
                  <span className="font-display font-bold">{stadium.quality}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prestígio</span>
                  <span className="font-display font-bold">{stadium.prestige}/100</span>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Carregando...</p>}
          </Link>
        </div>

        {/* Squad / Market links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/manager/squad" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Elenco</span>
            </div>
            <p className="font-display text-2xl font-bold">{playerCount}</p>
            <p className="text-xs text-muted-foreground">jogadores no elenco</p>
          </Link>
          <Link to="/manager/market" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Mercado</span>
            </div>
            <p className="text-sm text-muted-foreground">Encontre agentes livres e envie propostas de contrato.</p>
          </Link>
        </div>
      </div>
    </ManagerLayout>
  );
}
