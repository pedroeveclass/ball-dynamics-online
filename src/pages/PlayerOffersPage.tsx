import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Check, X, FileText, Inbox } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Offer {
  id: string;
  club_id: string;
  manager_profile_id: string;
  player_profile_id: string;
  weekly_salary: number;
  release_clause: number;
  contract_length: number;
  squad_role: string;
  message: string | null;
  status: string;
  created_at: string;
  club_name?: string;
  club_short?: string;
  club_color?: string;
}

interface ContractInfo {
  id: string;
  club_id: string | null;
  weekly_salary: number;
  release_clause: number;
  start_date: string;
  end_date: string | null;
  status: string;
  club_name?: string;
}

const ROLE_LABELS: Record<string, string> = {
  starter: 'Titular',
  rotation: 'Rotação',
  backup: 'Reserva',
  youth: 'Jovem Promessa',
};

function formatDate(d: string | null) {
  if (!d) return 'Indeterminado';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function PlayerOffersPage() {
  const { user, playerProfile, refreshPlayerProfile } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionOffer, setActionOffer] = useState<Offer | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!playerProfile) return;
    fetchData();
  }, [playerProfile]);

  const fetchData = async () => {
    if (!playerProfile) return;
    setLoading(true);

    const { data: offersData } = await supabase
      .from('contract_offers')
      .select('*')
      .eq('player_profile_id', playerProfile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (offersData && offersData.length > 0) {
      const clubIds = [...new Set(offersData.map(o => o.club_id))];
      const { data: clubs } = await supabase.from('clubs').select('id, name, short_name, primary_color').in('id', clubIds);
      const clubMap = new Map(clubs?.map(c => [c.id, c]) || []);

      setOffers(offersData.map(o => ({
        ...o,
        club_name: clubMap.get(o.club_id)?.name || 'Clube desconhecido',
        club_short: clubMap.get(o.club_id)?.short_name || '???',
        club_color: clubMap.get(o.club_id)?.primary_color || '#666',
      })));
    } else {
      setOffers([]);
    }

    const { data: contractData } = await supabase
      .from('contracts')
      .select('*')
      .eq('player_profile_id', playerProfile.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (contractData && contractData.club_id) {
      const { data: clubData } = await supabase.from('clubs').select('name').eq('id', contractData.club_id).single();
      setContract({ ...contractData, club_name: clubData?.name || contractData.club_id });
    } else {
      setContract(null);
    }

    setLoading(false);
  };

  const handleAction = (offer: Offer, type: 'accept' | 'reject') => {
    setActionOffer(offer);
    setActionType(type);
  };

  const confirmAction = async () => {
    if (!actionOffer || !actionType || !playerProfile || !user) return;
    setProcessing(true);

    if (actionType === 'accept') {
      await supabase.from('contract_offers').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', actionOffer.id);

      await supabase.from('contract_offers')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('player_profile_id', playerProfile.id)
        .eq('status', 'pending')
        .neq('id', actionOffer.id);

      await supabase.from('contracts')
        .update({ status: 'ended', end_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
        .eq('player_profile_id', playerProfile.id)
        .eq('status', 'active');

      // Calculate end_date from contract_length (months)
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + actionOffer.contract_length);

      await supabase.from('contracts').insert({
        player_profile_id: playerProfile.id,
        club_id: actionOffer.club_id,
        weekly_salary: actionOffer.weekly_salary,
        release_clause: actionOffer.release_clause,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'active',
      });

      await supabase.from('player_profiles')
        .update({ club_id: actionOffer.club_id, weekly_salary: actionOffer.weekly_salary, updated_at: new Date().toISOString() })
        .eq('id', playerProfile.id);

      const { data: financeData } = await supabase
        .from('club_finances')
        .select('weekly_wage_bill')
        .eq('club_id', actionOffer.club_id)
        .single();

      if (financeData) {
        await supabase.from('club_finances')
          .update({ weekly_wage_bill: financeData.weekly_wage_bill + actionOffer.weekly_salary, updated_at: new Date().toISOString() })
          .eq('club_id', actionOffer.club_id);
      }

      const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', actionOffer.manager_profile_id).single();
      if (mgr) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          title: 'Proposta aceita!',
          body: `${playerProfile.full_name} aceitou sua proposta de contrato.`,
          type: 'contract_accepted',
        });
      }

      toast({ title: 'Contrato assinado!', description: `Você agora faz parte do ${actionOffer.club_name}.` });
      await refreshPlayerProfile();
    } else {
      await supabase.from('contract_offers').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', actionOffer.id);

      const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', actionOffer.manager_profile_id).single();
      if (mgr) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          title: 'Proposta recusada',
          body: `${playerProfile.full_name} recusou sua proposta de contrato.`,
          type: 'contract_rejected',
        });
      }

      toast({ title: 'Proposta recusada', description: 'A proposta foi recusada com sucesso.' });
    }

    setProcessing(false);
    setActionOffer(null);
    setActionType(null);
    fetchData();
  };

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <h1 className="font-display text-2xl font-bold">Contrato & Propostas</h1>

        {/* Current contract status */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">Status Atual</span>
          </div>
          {contract ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Clube</span>
                <p className="font-display font-bold">{contract.club_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <p className="font-display font-bold text-pitch capitalize">Ativo</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Salário Semanal</span>
                <p className="font-display font-bold">${contract.weekly_salary.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Multa Rescisória</span>
                <p className="font-display font-bold">${contract.release_clause.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Início</span>
                <p className="font-display font-bold">{formatDate(contract.start_date)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Término</span>
                <p className="font-display font-bold">{formatDate(contract.end_date)}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="font-display font-semibold text-foreground">Agente Livre</p>
              <p className="text-xs text-muted-foreground mt-1">Você não possui contrato ativo com nenhum clube.</p>
            </div>
          )}
        </div>

        {/* Pending offers */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold">Propostas Pendentes</span>
            {offers.length > 0 && (
              <span className="bg-tactical text-tactical-foreground text-xs font-bold px-2 py-0.5 rounded-full">{offers.length}</span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando propostas...</p>
          ) : offers.length === 0 ? (
            <div className="stat-card text-center py-8">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="font-display font-semibold text-sm">Nenhuma proposta pendente</p>
              <p className="text-xs text-muted-foreground mt-1">Quando um clube enviar uma proposta, ela aparecerá aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map(offer => (
                <div key={offer.id} className="stat-card">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-display font-extrabold"
                      style={{ backgroundColor: offer.club_color, color: '#fff' }}>
                      {offer.club_short}
                    </div>
                    <div className="flex-1">
                      <p className="font-display font-bold">{offer.club_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(offer.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Salário/Sem</span>
                      <p className="font-display font-bold">${offer.weekly_salary.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Multa</span>
                      <p className="font-display font-bold">${offer.release_clause.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Duração</span>
                      <p className="font-display font-bold">{offer.contract_length} meses</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Papel</span>
                      <p className="font-display font-bold">{ROLE_LABELS[offer.squad_role] || offer.squad_role}</p>
                    </div>
                  </div>

                  {offer.message && (
                    <p className="text-sm text-muted-foreground italic mb-3">"{offer.message}"</p>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => handleAction(offer, 'reject')} className="gap-1.5 text-destructive hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                      Recusar
                    </Button>
                    <Button size="sm" onClick={() => handleAction(offer, 'accept')} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      Aceitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!actionOffer} onOpenChange={() => { setActionOffer(null); setActionType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {actionType === 'accept' ? 'Aceitar Proposta?' : 'Recusar Proposta?'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'accept'
                ? `Você assinará contrato com ${actionOffer?.club_name} com salário de $${actionOffer?.weekly_salary.toLocaleString()}/semana por ${actionOffer?.contract_length} meses. Todas as outras propostas serão automaticamente recusadas.`
                : `Tem certeza que deseja recusar a proposta de ${actionOffer?.club_name}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionOffer(null); setActionType(null); }}>Cancelar</Button>
            <Button
              onClick={confirmAction}
              disabled={processing}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {processing ? 'Processando...' : actionType === 'accept' ? 'Confirmar Assinatura' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
