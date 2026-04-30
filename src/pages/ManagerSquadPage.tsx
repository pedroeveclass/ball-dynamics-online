import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
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
import { Users, MoreVertical, AlertTriangle, Loader2, User, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';
import { sortPlayersByPosition } from '@/lib/positions';
import { archetypeLabel } from '@/lib/attributes';
import { CountryFlag } from '@/components/CountryFlag';
import { useTranslation } from 'react-i18next';

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
  appearance: any;
  country_code: string | null;
}

export default function ManagerSquadPage() {
  const { club, managerProfile } = useAuth();
  const { t } = useTranslation(['squad', 'common']);
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingJerseyIds, setSavingJerseyIds] = useState<Set<string>>(new Set());
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
      .select('id, full_name, age, primary_position, secondary_position, archetype, overall, weekly_salary, energy_current, energy_max, user_id, jersey_number, appearance, country_code')
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
        appearance: (p as any).appearance ?? null,
        country_code: (p as any).country_code ?? null,
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

      toast.success(t('squad:toast.fired', { name: fireTarget.full_name }));
      setFireDialogOpen(false);
      setFireTarget(null);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || t('squad:toast.fire_error'));
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
      toast.success(t('squad:toast.fired_just_cause', { name: player.full_name }));
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || t('squad:toast.fire_error'));
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

      // 2. Notify player if human-controlled (i18n_key — renders in target user's locale)
      if (agreementTarget.user_id) {
        await supabase.from('notifications').insert({
          user_id: agreementTarget.user_id,
          player_profile_id: agreementTarget.id,
          title: t('squad:notifications.agreement_proposed_title'),
          body: t('squad:notifications.agreement_proposed_body'),
          type: 'contract',
          link: '/player/contract',
          i18n_key: 'agreement_proposed',
          i18n_params: {},
        } as any);
      }

      toast.success(t('squad:toast.agreement_sent_ok'));
      setAgreementDialogOpen(false);
      setAgreementTarget(null);
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || t('squad:toast.agreement_error'));
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
        toast.error(t('squad:toast.exit_not_found'));
        return;
      }

      const { error } = await supabase.rpc('accept_mutual_exit', {
        p_agreement_id: agreement.id,
        p_contract_id: player.contract_id,
        p_player_id: player.id,
      });
      if (error) throw error;

      toast.success(t('squad:toast.exit_accepted', { name: player.full_name }));
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || t('squad:toast.accept_error'));
    }
  };

  // Update the permanent jersey number chosen by the manager for this player.
  // Uses a SECURITY DEFINER RPC — a plain UPDATE is blocked by RLS
  // (only the player-owning user can self-update player_profiles).
  const updateJerseyNumber = async (playerId: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    let nextNumber: number | null;
    if (trimmed === '') {
      nextNumber = null;
    } else {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
        toast.error(t('squad:toast.jersey_invalid'));
        return;
      }
      nextNumber = parsed;
    }
    const previous = players.find(p => p.id === playerId)?.jersey_number ?? null;
    if (previous === nextNumber) return;
    // Client-side guard: if another player at the same club already wears this
    // number, refuse early with a friendly toast (DB has a UNIQUE index too).
    if (nextNumber != null) {
      const conflict = players.find(p => p.id !== playerId && p.jersey_number === nextNumber);
      if (conflict) {
        toast.error(t('squad:toast.jersey_taken', { n: nextNumber, name: conflict.full_name, defaultValue: `Camisa ${nextNumber} ja esta com ${conflict.full_name}` }));
        return;
      }
    }
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, jersey_number: nextNumber } : p));
    setSavingJerseyIds(prev => new Set(prev).add(playerId));
    const { error } = await supabase.rpc('set_player_jersey_number', {
      p_player_id: playerId,
      p_jersey_number: nextNumber,
    });
    setSavingJerseyIds(prev => {
      const n = new Set(prev);
      n.delete(playerId);
      return n;
    });
    if (error) {
      toast.error(error.message || t('squad:toast.jersey_save_error'));
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, jersey_number: previous } : p));
      return;
    }
    toast.success(nextNumber == null ? t('squad:toast.jersey_removed') : t('squad:toast.jersey_saved', { n: nextNumber }));
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
          player_profile_id: player.id,
          title: t('squad:notifications.exit_rejected_title'),
          body: t('squad:notifications.exit_rejected_body', { club: club.name }),
          type: 'contract',
          link: '/player/contract',
          i18n_key: 'exit_rejected',
          i18n_params: { club: club.name },
        } as any);
      }

      toast.success(t('squad:toast.exit_rejected'));
      fetchSquad();
    } catch (err: any) {
      toast.error(err.message || t('squad:toast.reject_error'));
    }
  };

  if (!club) return null;
  const totalWages = players.reduce((s, p) => s + p.weekly_salary, 0);

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{t('squad:title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('squad:summary', { count: players.length, wages: formatBRL(totalWages) })}
              {players.filter(p => p.user_id).length > 0 && (
                <>
                  {' • '}
                  <span className="text-pitch inline-flex items-center gap-1 align-middle">
                    <User className="h-3 w-3" />
                    {players.filter(p => p.user_id).length === 1
                      ? t('squad:humans', { count: 1 })
                      : t('squad:humans_plural', { count: players.filter(p => p.user_id).length })}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">{t('squad:loading')}</p>
        ) : players.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">{t('squad:empty.title')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('squad:empty.hint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 w-10"></th>
                  <th className="py-2 pr-3">{t('squad:columns.ovr')}</th>
                  <th className="py-2 pr-3 w-16">{t('squad:columns.jersey')}</th>
                  <th className="py-2 pr-3">{t('squad:columns.name')}</th>
                  <th className="py-2 pr-3">{t('squad:columns.position')}</th>
                  <th className="py-2 pr-3">{t('squad:columns.type')}</th>
                  <th className="py-2 pr-3">{t('squad:columns.age')}</th>
                  <th className="py-2 pr-3">{t('squad:columns.energy')}</th>
                  <th className="py-2 pr-3 text-right">{t('squad:columns.salary')}</th>
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
                      <PlayerAvatar
                        appearance={p.appearance}
                        variant="face"
                        clubPrimaryColor={club.primary_color}
                        clubSecondaryColor={club.secondary_color}
                        playerName={p.full_name}
                        className="h-12 w-12"
                        fallbackSeed={p.id}
                      />
                    </td>
                    <td
                      className="py-3 pr-3 cursor-pointer"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <span className="font-display text-lg font-extrabold text-tactical">{p.overall}</span>
                    </td>
                    <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          defaultValue={p.jersey_number ?? ''}
                          placeholder="—"
                          disabled={savingJerseyIds.has(p.id)}
                          className="w-12 px-1.5 py-1 text-center font-display font-bold bg-muted/40 border border-border/60 rounded text-sm focus:outline-none focus:ring-1 focus:ring-tactical disabled:opacity-50"
                          onBlur={(e) => updateJerseyNumber(p.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') {
                              (e.target as HTMLInputElement).value = p.jersey_number != null ? String(p.jersey_number) : '';
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        {savingJerseyIds.has(p.id) && (
                          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                        )}
                      </div>
                    </td>
                    <td
                      className="py-3 pr-3 font-display font-bold cursor-pointer"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <div className="flex items-center gap-2">
                        {p.user_id ? (
                          <User className="h-3.5 w-3.5 text-pitch shrink-0" aria-label={t('squad:human_label')} />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label={t('squad:bot_label')} />
                        )}
                        {p.country_code && <CountryFlag code={p.country_code} size="xs" />}
                        {p.full_name}
                        {p.pending_agreement_from === 'player' && (
                          <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                            {t('squad:wants_to_leave')}
                          </span>
                        )}
                        {p.pending_agreement_from === 'club' && (
                          <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600">
                            {t('squad:agreement_sent')}
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
                    <td className="py-3 pr-3 text-muted-foreground cursor-pointer" onClick={() => setSelectedPlayerId(p.id)}>{archetypeLabel(p.archetype)}</td>
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
                                {t('squad:actions.accept_exit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRejectPlayerExit(p)}
                              >
                                {t('squad:actions.reject_exit')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {(p.user_id === null) && (
                            <DropdownMenuItem
                              className="text-amber-500 focus:text-amber-500"
                              onClick={() => handleFireJustCause(p)}
                            >
                              {t('squad:actions.just_cause')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openFireDialog(p)}
                          >
                            {t('squad:actions.fire')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openAgreementDialog(p)}
                            disabled={p.has_pending_agreement}
                          >
                            {t('squad:actions.mutual')}
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
            <DialogTitle>{t('squad:fire_dialog.title')}</DialogTitle>
            <DialogDescription>{t('squad:fire_dialog.description')}</DialogDescription>
          </DialogHeader>

          {fireTarget && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('squad:fire_dialog.player')}</span>
                  <span className="font-semibold">{fireTarget.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('squad:fire_dialog.weekly_salary')}</span>
                  <span>{formatBRL(fireTarget.weekly_salary)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('squad:fire_dialog.rescission')}</span>
                  <span className="font-bold text-destructive">{formatBRL(getRecissionCost(fireTarget))}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-muted-foreground">{t('squad:fire_dialog.club_balance')}</span>
                  <span className="font-semibold">{formatBRL(clubBalance)}</span>
                </div>
              </div>

              {clubBalance < getRecissionCost(fireTarget) && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t('squad:fire_dialog.insufficient')}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFireDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleFire}
              disabled={firing || !fireTarget || clubBalance < getRecissionCost(fireTarget!)}
            >
              {firing ? t('squad:fire_dialog.submitting') : t('squad:fire_dialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mutual Agreement Dialog */}
      <Dialog open={agreementDialogOpen} onOpenChange={setAgreementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('squad:agreement_dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('squad:agreement_dialog.description', { name: agreementTarget?.full_name ?? '' })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t('squad:agreement_dialog.explanation')}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreementDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              onClick={handleMutualAgreement}
              disabled={sendingAgreement}
            >
              {sendingAgreement ? t('squad:agreement_dialog.submitting') : t('squad:agreement_dialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
