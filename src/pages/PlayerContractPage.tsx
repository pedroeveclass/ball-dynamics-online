import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Wallet, CalendarClock, Building2, TrendingUp, Loader2, Handshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ContractData {
  id: string;
  club_id: string | null;
  weekly_salary: number;
  release_clause: number;
  start_date: string;
  end_date: string | null;
  status: string;
  club_name?: string;
}

function formatDate(d: string | null) {
  if (!d) return 'Indeterminado';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getNextMonday(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  return nextMonday.toLocaleDateString('pt-BR');
}

export default function PlayerContractPage() {
  const { playerProfile } = useAuth();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [playerMoney, setPlayerMoney] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [pendingMutual, setPendingMutual] = useState(false);
  const [mutualDialogOpen, setMutualDialogOpen] = useState(false);
  const [submittingMutual, setSubmittingMutual] = useState(false);

  useEffect(() => {
    if (!playerProfile) return;
    const fetchData = async () => {
      // Fetch current player money
      const { data: freshProfile } = await supabase
        .from('player_profiles')
        .select('money')
        .eq('id', playerProfile.id)
        .single();

      setPlayerMoney(freshProfile?.money || 0);

      // Fetch active contract
      const { data } = await supabase
        .from('contracts')
        .select('*')
        .eq('player_profile_id', playerProfile.id)
        .eq('status', 'active')
        .limit(1)
        .single();

      if (data && data.club_id) {
        const { data: club } = await supabase.from('clubs').select('name').eq('id', data.club_id).single();
        setContract({ ...data, club_name: club?.name || data.club_id });

        // Check for pending mutual agreement
        const { data: mutualAgreement } = await supabase
          .from('contract_mutual_agreements')
          .select('id')
          .eq('contract_id', data.id)
          .eq('requested_by', 'player')
          .eq('status', 'pending')
          .maybeSingle();
        setPendingMutual(!!mutualAgreement);
      } else {
        setContract(null);
        setPendingMutual(false);
      }
      setLoading(false);
    };
    fetchData();
  }, [playerProfile]);

  async function handleRequestMutualAgreement() {
    if (!playerProfile || !contract) return;
    setSubmittingMutual(true);

    try {
      // Insert mutual agreement request
      const { error } = await supabase.from('contract_mutual_agreements').insert({
        contract_id: contract.id,
        requested_by: 'player',
        requested_by_id: playerProfile.id,
        status: 'pending',
      });
      if (error) throw error;

      // Notify the manager
      const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', playerProfile.club_id).maybeSingle();
      const { data: manager } = club ? await supabase.from('manager_profiles').select('user_id').eq('id', club.manager_profile_id).maybeSingle() : { data: null };
      if (manager?.user_id) {
        await supabase.from('notifications').insert({
          user_id: manager.user_id,
          title: '📋 Solicitação de saída',
          body: `${playerProfile.full_name} solicitou rescisão por comum acordo.`,
          type: 'mutual_agreement',
        });
      }

      toast.success('Solicitação enviada ao clube.');
      setPendingMutual(true);
      setMutualDialogOpen(false);
    } catch (err) {
      toast.error('Erro ao enviar solicitação.');
    }
    setSubmittingMutual(false);
  }

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Contrato & Financeiro</h1>

        {/* Financial Summary Card */}
        <div className="stat-card border-tactical/30">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">Resumo Financeiro</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Wallet className="h-5 w-5 text-pitch mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">Saldo</span>
                  <p className="font-display font-bold text-lg text-pitch">{formatBRL(playerMoney)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarClock className="h-5 w-5 text-tactical mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">Salario/Semana</span>
                  <p className="font-display font-bold text-lg">
                    {contract ? formatBRL(contract.weekly_salary) : 'Sem contrato'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">Clube</span>
                  <p className="font-display font-bold">{contract?.club_name || 'Agente Livre'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">Proximo Pagamento</span>
                  <p className="font-display font-bold">{contract ? getNextMonday() : '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contract Details Card */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">Contrato Atual</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : contract ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <p className="font-display font-bold text-pitch">Ativo</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Clube</span>
                <p className="font-display font-bold">{contract.club_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Salario Semanal</span>
                <p className="font-display font-bold">{formatBRL(contract.weekly_salary)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Multa de Saida</span>
                <p className="font-display font-bold">{formatBRL(contract.release_clause)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Inicio</span>
                <p className="font-display font-bold">{formatDate(contract.start_date)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Termino</span>
                <p className="font-display font-bold">{formatDate(contract.end_date)}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="font-display font-semibold">Agente Livre</p>
              <p className="text-xs text-muted-foreground mt-1">Sem contrato ativo. Verifique propostas pendentes.</p>
              <Link to="/player/offers">
                <Button variant="outline" size="sm" className="mt-3">Ver Propostas</Button>
              </Link>
            </div>
          )}
        </div>

        {/* ── Solicitar Saída (Mutual Agreement) ── */}
        {!loading && contract && (
          <div className="stat-card space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Handshake className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Solicitar Saída</span>
            </div>

            {pendingMutual ? (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                Aguardando resposta do clube
              </Badge>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Proposta de rescisão sem custo. O clube precisa aceitar para que o contrato seja encerrado.
                </p>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setMutualDialogOpen(true)}
                >
                  <Handshake className="h-4 w-4" /> Solicitar Saída por Comum Acordo
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Mutual Agreement Confirmation Dialog ── */}
      <Dialog open={mutualDialogOpen} onOpenChange={setMutualDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Handshake className="h-5 w-5 text-tactical" /> Solicitar Saída por Comum Acordo
            </DialogTitle>
            <DialogDescription>
              Você está solicitando a rescisão do contrato por comum acordo. O clube precisa aceitar para que a rescisão seja efetivada. Não há custo para esta solicitação.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMutualDialogOpen(false)} disabled={submittingMutual}>
              Cancelar
            </Button>
            <Button onClick={handleRequestMutualAgreement} disabled={submittingMutual} className="gap-2">
              {submittingMutual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
              {submittingMutual ? 'Enviando...' : 'Confirmar Solicitação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
