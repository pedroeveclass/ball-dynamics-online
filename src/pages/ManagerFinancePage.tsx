import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

export default function ManagerFinancePage() {
  const { club } = useAuth();
  const [finance, setFinance] = useState<any>(null);

  useEffect(() => {
    if (!club) return;
    supabase.from('club_finances').select('*').eq('club_id', club.id).single().then(({ data }) => setFinance(data));
  }, [club]);

  if (!club || !finance) return <ManagerLayout><p className="text-muted-foreground">Carregando finanças...</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Finanças</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Saldo" value={`$${finance.balance.toLocaleString()}`} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Folha Salarial/Sem" value={`$${finance.weekly_wage_bill.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
          <StatCard label="Receita Projetada" value={`$${finance.projected_income.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Despesas Projetadas" value={`$${finance.projected_expense.toLocaleString()}`} icon={<TrendingDown className="h-5 w-5" />} />
        </div>

        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4">Detalhamento</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Saldo Atual</span>
              <span className="font-display font-bold text-pitch">${finance.balance.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Folha Salarial Semanal</span>
              <span className="font-display font-bold">${finance.weekly_wage_bill.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receita Projetada (semanal)</span>
              <span className="font-display font-bold text-pitch">${finance.projected_income.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Despesas Projetadas (semanal)</span>
              <span className="font-display font-bold text-destructive">${finance.projected_expense.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-muted-foreground font-semibold">Resultado Semanal Projetado</span>
              <span className={`font-display font-bold ${finance.projected_income - finance.projected_expense - finance.weekly_wage_bill >= 0 ? 'text-pitch' : 'text-destructive'}`}>
                ${(finance.projected_income - finance.projected_expense - finance.weekly_wage_bill).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
