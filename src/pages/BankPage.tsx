import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Landmark, Wallet, Calendar, Percent, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';

interface Loan {
  id: string;
  principal: number;
  remaining: number;
  weekly_payment: number;
  interest_rate: number;
  term_weeks: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  player_profile_id: string | null;
  club_id: string | null;
}

function BankContent() {
  const { playerProfile, managerProfile, club, refreshPlayerProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeLoan, setActiveLoan] = useState<Loan | null>(null);
  const [loanAmount, setLoanAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [payingOff, setPayingOff] = useState(false);

  // Determine mode
  const isManager = !!managerProfile && !!club;
  const isPlayer = !!playerProfile;

  // Player data
  const [playerContract, setPlayerContract] = useState<{ weekly_salary: number } | null>(null);

  // Club data
  const [clubFinance, setClubFinance] = useState<{ balance: number; projected_income: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, [playerProfile?.id, club?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      if (isManager && club) {
        // Fetch club finance
        const { data: fin } = await supabase
          .from('club_finances')
          .select('balance, projected_income')
          .eq('club_id', club.id)
          .maybeSingle();
        setClubFinance(fin);

        // Fetch active loan for club
        const { data: loans } = await (supabase as any)
          .from('loans')
          .select('*')
          .eq('club_id', club.id)
          .eq('status', 'active')
          .limit(1);
        setActiveLoan(loans?.[0] ?? null);
      } else if (isPlayer && playerProfile) {
        // Fetch active contract
        const { data: contract } = await supabase
          .from('contracts')
          .select('weekly_salary')
          .eq('player_profile_id', playerProfile.id)
          .eq('status', 'active')
          .maybeSingle();
        setPlayerContract(contract);

        // Fetch active loan for player
        const { data: loans } = await (supabase as any)
          .from('loans')
          .select('*')
          .eq('player_profile_id', playerProfile.id)
          .eq('status', 'active')
          .limit(1);
        setActiveLoan(loans?.[0] ?? null);
      }
    } catch (err) {
      console.error('BankPage fetch error', err);
    }
    setLoading(false);
  }

  // Compute limits
  const weeklySalary = playerContract?.weekly_salary ?? 0;
  const weeklyRevenue = clubFinance?.projected_income ?? 0;
  const maxLoan = isManager ? weeklyRevenue * 5 : weeklySalary * 5;
  const currentBalance = isManager
    ? (clubFinance?.balance ?? 0)
    : (playerProfile?.money ?? 0);

  // Loan calculations
  const TERM_WEEKS = 12;
  const INTEREST_RATE = 0.02;
  const totalWithInterest = loanAmount * (1 + INTEREST_RATE * TERM_WEEKS);
  const weeklyPayment = totalWithInterest / TERM_WEEKS;

  // Weeks remaining estimate for active loan
  const weeksRemaining = activeLoan
    ? Math.ceil(activeLoan.remaining / Math.max(activeLoan.weekly_payment - activeLoan.remaining * INTEREST_RATE, 1))
    : 0;

  async function handleRequestLoan() {
    if (loanAmount <= 0 || loanAmount > maxLoan) return;
    setSubmitting(true);
    try {
      const entityType = isManager ? 'club' : 'player';
      const { error } = await supabase.rpc('process_loan', {
        p_player_id: playerProfile?.id ?? null,
        p_club_id: club?.id ?? null,
        p_amount: loanAmount,
        p_interest_rate: INTEREST_RATE,
        p_duration_weeks: TERM_WEEKS,
        p_entity_type: entityType,
      });
      if (error) throw error;

      if (isPlayer) await refreshPlayerProfile();

      toast.success('Emprestimo aprovado!', {
        description: `${formatBRL(loanAmount)} creditado na sua conta.`,
      });
      setLoanAmount(0);
      await fetchData();
    } catch (err: any) {
      toast.error('Erro ao solicitar emprestimo', { description: err.message });
    }
    setSubmitting(false);
  }

  async function handlePayOff() {
    if (!activeLoan) return;
    if (activeLoan.remaining > currentBalance) {
      toast.error('Saldo insuficiente para quitar o emprestimo.');
      return;
    }
    setPayingOff(true);
    try {
      const entityType = isManager ? 'club' : 'player';
      const entityId = isManager ? club?.id : playerProfile?.id;
      const { error } = await supabase.rpc('payoff_loan', {
        p_loan_id: activeLoan.id,
        p_entity_type: entityType,
        p_entity_id: entityId!,
      });
      if (error) throw error;

      if (isPlayer) await refreshPlayerProfile();

      toast.success('Emprestimo quitado!');
      await fetchData();
    } catch (err: any) {
      toast.error('Erro ao quitar emprestimo', { description: err.message });
    }
    setPayingOff(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canTakeLoan = maxLoan > 0 && !activeLoan;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Landmark className="h-7 w-7 text-amber-500" />
        <h1 className="font-display text-2xl font-bold">Banco</h1>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Saldo Atual"
          value={formatBRL(currentBalance)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label={isManager ? 'Receita Semanal' : 'Salario Semanal'}
          value={formatBRL(isManager ? weeklyRevenue : weeklySalary)}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="Limite de Emprestimo"
          value={formatBRL(maxLoan)}
          subtitle="5x receita semanal"
          icon={<Landmark className="h-5 w-5" />}
        />
      </div>

      {/* Active Loan */}
      {activeLoan && (
        <div className="stat-card border-2 border-amber-500/30 bg-amber-500/5">
          <h2 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Emprestimo Ativo
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Principal</span>
              <span className="font-display font-bold">{formatBRL(activeLoan.principal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo Devedor</span>
              <span className="font-display font-bold text-amber-500">{formatBRL(activeLoan.remaining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagamento Semanal</span>
              <span className="font-display font-bold">{formatBRL(activeLoan.weekly_payment)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" /> Taxa de Juros
              </span>
              <span className="font-display font-bold">2% / semana</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Semanas Restantes (est.)
              </span>
              <span className="font-display font-bold">{weeksRemaining}</span>
            </div>

            <div className="pt-3 border-t border-border">
              <Button
                onClick={handlePayOff}
                disabled={payingOff || activeLoan.remaining > currentBalance}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {payingOff ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Pagar Antecipado ({formatBRL(activeLoan.remaining)})
              </Button>
              {activeLoan.remaining > currentBalance && (
                <p className="text-xs text-destructive mt-2 text-center">
                  Saldo insuficiente para quitacao antecipada.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Loan Form */}
      {canTakeLoan && (
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Landmark className="h-4 w-4 text-amber-500" />
            Pedir Emprestimo
          </h2>

          {maxLoan <= 0 ? (
            <p className="text-sm text-muted-foreground">
              {isManager
                ? 'Sem receita semanal registrada. Nao e possivel solicitar emprestimo.'
                : 'Sem contrato ativo. Nao e possivel solicitar emprestimo.'}
            </p>
          ) : (
            <div className="space-y-5">
              {/* Slider */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor do Emprestimo</span>
                  <span className="font-display font-bold text-lg">{formatBRL(loanAmount)}</span>
                </div>
                <Slider
                  value={[loanAmount]}
                  onValueChange={([v]) => setLoanAmount(v)}
                  min={0}
                  max={maxLoan}
                  step={Math.max(100, Math.floor(maxLoan / 100))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBRL(0)}</span>
                  <span>{formatBRL(maxLoan)}</span>
                </div>
              </div>

              {/* Loan details */}
              {loanAmount > 0 && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Principal</span>
                    <span className="font-display font-bold">{formatBRL(loanAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prazo</span>
                    <span className="font-display font-bold">12 semanas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxa de Juros</span>
                    <span className="font-display font-bold">2% / semana</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagamento Semanal</span>
                    <span className="font-display font-bold">{formatBRL(weeklyPayment)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="font-semibold">Total a Pagar</span>
                    <span className="font-display font-bold text-amber-500">
                      {formatBRL(totalWithInterest)}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleRequestLoan}
                disabled={submitting || loanAmount <= 0}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Landmark className="h-4 w-4 mr-2" />
                )}
                Solicitar Emprestimo
              </Button>
            </div>
          )}
        </div>
      )}

      {/* No loan and can't take one */}
      {!activeLoan && !canTakeLoan && maxLoan <= 0 && (
        <div className="stat-card text-center py-8">
          <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'Seu clube precisa de receita semanal para solicitar emprestimos.'
              : 'Voce precisa de um contrato ativo para solicitar emprestimos.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function BankPage() {
  const { managerProfile, playerProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (managerProfile) {
    return (
      <ManagerLayout>
        <BankContent />
      </ManagerLayout>
    );
  }

  if (playerProfile) {
    return (
      <AppLayout>
        <BankContent />
      </AppLayout>
    );
  }

  // Fallback simple layout
  return (
    <div className="min-h-screen bg-background p-6">
      <BankContent />
    </div>
  );
}
