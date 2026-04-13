import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { EnergyBar } from '@/components/EnergyBar';
import { PlayerCardDialog } from '@/components/PlayerCardDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, MoreVertical, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';
import { sortPlayersByPosition } from '@/lib/positions';

interface SquadPlayer {
  id: string;
  full_name: string;
  age: number;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
  weekly_salary: number;
  energy_current: number;
  energy_max: number;
  contract_id: string;
  release_clause: number;
  user_id: string | null;
  has_pending_agreement: boolean;
  pending_agreement_from: 'club' | 'player' | null;
  jersey_number: number | null;
}

export default function ManagerSquadPage() {
  const { club, managerProfile } = useAuth();
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Fire dialog state
  const [fireDialogOpen, setFireDialogOpen] = useState(false);
  const [fireTarget, setFireTarget] = useState<SquadPlayer | null>(null);
  const [clubBalance, setClubBalance] = useState(0);
  const [weeklyWageBill, setWeeklyWageBill] = useState(0);
  const [firing, setFiring] = useState(false);

  // Mutual agreement dialog state
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [agreementTarget, setAgreementTarget] = useState<SquadPlayer | null>(null);
  const [sendingAgreement, setSendingAgreement] = useState(false);

  const fetchSquad = async () => {
    if (!club) return;

    const { data: contracts } = await supabase
      .from('contracts')
      .select('id, player_profile_id, weekly_salary, release_clause')
      .eq('club_id', club.id)
      .eq('status', 'active');

    if (!contracts || contracts.length === 0) { setPlayers([]); setLoading(false); return; }

    const playerIds = contracts.map(c => c.player_profile_id);
    const contractMap = new Map(contracts.map(c => [c.player_profile_id, c]));

    const { data: playerData } = await supabase
      .from('player_profiles')
      .select('id, full_name, age, primary_position, secondary_position, archetype, overall, weekly_salary, energy_current, energy_max, user_id, jersey_number')
      .in('id', playerIds)
      .order('overall', { ascending: false });

    // Fetch pending mutual agreements
    const contractIds = contracts.map(c => c.id);
    const { data: pendingAgreements } = await supabase
      .from('contract_mutual_agreements')
      .select('contract_id, requested_by')
      .in('contract_id', contractIds)
      .eq('status', 'pending');

    const pendingClubAgreements = new Set((pendingAgreements || []).filter(a => a.requested_by === 'club').map(a => a.contract_id));
    const pendingPlayerAgreements = new Set((pendingAgreements || []).filter(a => a.requested_by === 'player').map(a => a.contract_id));
    const pendingContractIds = new Set([...pendingClubAgreements, ...pendingPlayerAgreements]);

    setPlayers(sortPlayersByPosition((playerData || []).map(p => {
      const contract = contractMap.get(p.id);
      return {
        ...p,
        weekly_salary: contract?.weekly_salary ?? p.weekly_salary,
        contract_id: contract?.id ?? '',
        release_clause: contract?.release_clause ?? 0,
        user_id: p.user_id ?? null,
        has_pending_agreement: pendingContractIds.has(contract?.id ?? ''),
        pending_agreement_from: pendingPlayerAgreements.has(contract?.id ?? '') ? 'player' : pendingClubAgreements.has(contract?.id ?? '') ? 'club' : null,
        jersey_number: p.jersey_number ?? null,
      };
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (!club) return;
    fetchSquad();
  }, [club]);

  const fetchClubFinances = async () => {
    if (!club) return;
    const { data } = await supabase
      .from('club_finances')
      .select('balance, weekly_wage_bill')
      .eq('club_id', club.id)
      .single();
    if (data) {
      setClubBalance(data.balance);
      setWeeklyWageBill(data.weekly_wage_bill);
    }
  };

  const openFireDialog = (player: SquadPlayer) => {
    setFireTarget(player);
    setFireDialogOpen(true);
    fetchClubFinances();
  };

  const openAgreementDialog = (player: SquadPlayer) => {
    setAgreementTarget(player);
    setAgreementDialogOpen(true);
  };

  const getRecissionCost = (player: SquadPlayer) => {
    return player.release_clause > 0 ? player.release_clause : player.weekly_salary * 4;
  };

  const handleFire = async () => {
    if (!fireTarget || !club || !managerProfile) return;
    const rescission = getRecissionCost(fireTarget);
    if (clubBalance < rescission) return;

    setFiring(true);
    try {
      const { error } = await supabase.rpc('fire_player', {
        p_player_id: fireTarget.id,
        p_club_id: club.id,
        p_fine_amount: rescission,
      });
      if (error) throw error;

      toast.success(`${fireTarget.full_name} foi dispensado.`);
      setFireDialogOpen(false);
      setFireTarget(null);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao demitir jogador.');
    } finally {
      setFiring(false);
    }
  };

  const handleFireJustCause = async (player: SquadPlayer) => {
    if (!club) return;
    try {
      const { error } = await supabase.rpc('fire_player_just_cause', {
        p_player_id: player.id,
        p_club_id: club.id,
      });
      if (error) throw error;
      toast.success(`${player.full_name} dispensado por justa causa (sem multa).`);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao demitir jogador.');
    }
  };

  const handleMutualAgreement = async () => {
    if (!agreementTarget || !club || !managerProfile) return;

    setSendingAgreement(true);
    try {
      // 1. Insert mutual agreement request
      const { error } = await supabase.from('contract_mutual_agreements').insert({
        contract_id: agreementTarget.contract_id,
        requested_by: 'club',
        requested_by_id: managerProfile.id,
        status: 'pending',
      });
      if (error) throw error;

      // 2. Notify player if human-controlled
      if (agreementTarget.user_id) {
        await supabase.from('notifications').insert({
          user_id: agreementTarget.user_id,
          title: '🤝 Proposta de Comum Acordo',
          body: `Seu clube propôs rescisão por comum acordo.`,
          type: 'contract',
          link: '/player/contract',
        });
      }

      toast.success('Proposta de comum acordo enviada.');
      setAgreementDialogOpen(false);
      setAgreementTarget(null);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar proposta.');
    } finally {
      setSendingAgreement(false);
    }
  };

  const handleAcceptPlayerExit = async (player: SquadPlayer) => {
    if (!club) return;
    try {
      // Fetch the pending agreement ID
      const { data: agreement } = await (supabase.from('contract_mutual_agreements') as any)
        .select('id')
        .eq('contract_id', player.contract_id)
        .eq('requested_by', 'player')
        .eq('status', 'pending')
        .maybeSingle();

      if (!agreement?.id) {
        toast.error('Solicitação de saída não encontrada.');
        return;
      }

      const { error } = await supabase.rpc('accept_mutual_exit', {
        p_agreement_id: agreement.id,
        p_contract_id: player.contract_id,
        p_player_id: player.id,
      });
      if (error) throw error;

      toast.success(`${player.full_name} saiu do clube por comum acordo.`);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aceitar saída.');
    }
  };

  // Update the permanent jersey number chosen by the manager for this player.
  // Value 0-99 or null to clear. Optimistic UI; reverts and toasts on error.
  const updateJerseyNumber = async (playerId: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    let nextNumber: number | null;
    if (trimmed === '') {
      nextNumber = null;
    } else {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
        toast.error('Número inválido — precisa estar entre 0 e 99.');
        return;
      }
      nextNumber = parsed;
    }
    const previous = players.find(p => p.id === playerId)?.jersey_number ?? null;
    if (previous === nextNumber) return;
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, jersey_number: nextNumber } : p));
    const { error } = await supabase.from('player_profiles')
      .update({ jersey_number: nextNumber })
      .eq('id', playerId);
    if (error) {
      toast.error('Não foi possível salvar o número da camisa.');
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, jersey_number: previous } : p));
    }
  };

  const handleRejectPlayerExit = async (player: SquadPlayer) => {
    if (!club) return;
    try {
      await (supabase.from('contract_mutual_agreements') as any)
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('contract_id', player.contract_id)
        .eq('requested_by', 'player')
        .eq('status', 'pending');

      if (player.user_id) {
        await supabase.from('notifications').insert({
          user_id: player.user_id,
          title: '❌ Saída recusada',
          body: `${club.name} recusou sua solicitação de saída por comum acordo.`,
          type: 'contract',
          link: '/player/contract',
        });
      }

      toast.success('Solicitação de saída recusada.');
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao recusar.');
    }
  };

  if (!club) return null;
  const totalWages = players.reduce((s, p) => s + p.weekly_salary, 0);

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Elenco</h1>
            <p className="text-sm text-muted-foreground">{players.length} jogadores • Folha semanal: {formatBRL(totalWages)}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando elenco...</p>
        ) : players.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">Nenhum jogador no elenco</p>
            <p className="text-xs text-muted-foreground mt-1">Contrate jogadores no Mercado de Agentes Livres para montar seu time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">OVR</th>
                  <th className="py-2 pr-3 w-16">Nº</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Posição</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Idade</th>
                  <th className="py-2 pr-3">Energia</th>
                  <th className="py-2 pr-3 text-right">Salário/Sem</th>
                  <th className="py-2 pr-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td
                      className="py-3 pr-3 cursor-pointer"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <span className="font-display text-lg font-extrabold text-tactical">{p.overall}</span>
                    </td>
                    <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        defaultValue={p.jersey_number ?? ''}
                        placeholder="—"
                        className="w-12 px-1.5 py-1 text-center font-display font-bold bg-muted/40 border border-border/60 rounded text-sm focus:outline-none focus:ring-1 focus:ring-tactical"
                        onBlur={(e) => updateJerseyNumber(p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') {
                            (e.target as HTMLInputElement).value = p.jersey_number != null ? String(p.jersey_number) : '';
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </td>
                    <td
                      className="py-3 pr-3 font-display font-bold cursor-pointer"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <div className="flex items-center gap-2">
                        {p.full_name}
                        {p.pending_agreement_from === 'player' && (
                          <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                            ⚠️ Quer Sair
                          </span>
                        )}
                        {p.pending_agreement_from === 'club' && (
                          <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600">
                            Acordo Enviado
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="py-3 pr-3 cursor-pointer"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <div className="flex items-center gap-1">
                        <PositionBadge position={p.primary_position} />
                        {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground cursor-pointer" onClick={() => setSelectedPlayerId(p.id)}>{p.archetype}</td>
                    <td className="py-3 pr-3 text-muted-foreground cursor-pointer" onClick={() => setSelectedPlayerId(p.id)}>{p.age}</td>
                    <td className="py-3 pr-3 w-28 cursor-pointer" onClick={() => setSelectedPlayerId(p.id)}>
                      <EnergyBar current={p.energy_current} max={p.energy_max} />
                    </td>
                    <td className="py-3 pr-3 text-right font-display font-bold cursor-pointer" onClick={() => setSelectedPlayerId(p.id)}>{formatBRL(p.weekly_salary)}</td>
                    <td className="py-3 pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {p.pending_agreement_from === 'player' && (
                            <>
                              <DropdownMenuItem
                                className="text-pitch focus:text-pitch"
                                onClick={() => handleAcceptPlayerExit(p)}
                              >
                                ✅ Aceitar Saída
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRejectPlayerExit(p)}
                              >
                                ❌ Recusar Saída
                              </DropdownMenuItem>
                            </>
                          )}
                          {/* Just cause: bots always, humans after 30d inactive */}
                          {(p.user_id === null) && (
                            <DropdownMenuItem
                              className="text-amber-500 focus:text-amber-500"
                              onClick={() => handleFireJustCause(p)}
                            >
                              Justa Causa (sem multa)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openFireDialog(p)}
                          >
                            Demitir
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openAgreementDialog(p)}
                            disabled={p.has_pending_agreement}
                          >
                            Comum Acordo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlayerCardDialog playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} clubName={club.name} />

      {/* Fire Confirmation Dialog */}
      <Dialog open={fireDialogOpen} onOpenChange={setFireDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demitir Jogador</DialogTitle>
            <DialogDescription>
              Confirme a demissão do jogador. O clube arcará com o custo da rescisão.
            </DialogDescription>
          </DialogHeader>

          {fireTarget && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jogador</span>
                  <span className="font-semibold">{fireTarget.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Salário semanal</span>
                  <span>{formatBRL(fireTarget.weekly_salary)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo da rescisão</span>
                  <span className="font-bold text-destructive">{formatBRL(getRecissionCost(fireTarget))}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-muted-foreground">Saldo do clube</span>
                  <span className="font-semibold">{formatBRL(clubBalance)}</span>
                </div>
              </div>

              {clubBalance < getRecissionCost(fireTarget) && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Saldo insuficiente para rescisão</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFireDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleFire}
              disabled={firing || !fireTarget || clubBalance < getRecissionCost(fireTarget!)}
            >
              {firing ? 'Processando...' : 'Confirmar Demissão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mutual Agreement Dialog */}
      <Dialog open={agreementDialogOpen} onOpenChange={setAgreementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rescisão por Comum Acordo</DialogTitle>
            <DialogDescription>
              Proposta de rescisão por comum acordo com {agreementTarget?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Proposta de rescisão por comum acordo. O jogador precisa aceitar. Não há custo para nenhuma das partes.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreementDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleMutualAgreement}
              disabled={sendingAgreement}
            >
              {sendingAgreement ? 'Enviando...' : 'Enviar Proposta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
