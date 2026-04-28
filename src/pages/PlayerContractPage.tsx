import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Wallet, CalendarClock, Building2, TrendingUp, Loader2, Handshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';
import { formatDate as formatDateI18n } from '@/lib/formatDate';
import type { SupportedLanguage } from '@/i18n';

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

function getNextMonday(lang: SupportedLanguage): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  return formatDateI18n(nextMonday, lang, 'date_short');
}

function formatContractDate(d: string | null, lang: SupportedLanguage, fallback: string): string {
  if (!d) return fallback;
  return formatDateI18n(new Date(d + 'T00:00:00'), lang, 'date_short');
}

export default function PlayerContractPage() {
  const { playerProfile, refreshPlayerProfile } = useAuth();
  const { t } = useTranslation('player_contract');
  const { current: lang } = useAppLanguage();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [playerMoney, setPlayerMoney] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [pendingMutual, setPendingMutual] = useState(false);
  const [mutualDialogOpen, setMutualDialogOpen] = useState(false);
  const [clubMutualPending, setClubMutualPending] = useState<string | null>(null);
  const [respondingMutual, setRespondingMutual] = useState(false);
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

        // Check for pending mutual agreement (player initiated)
        const { data: mutualAgreement } = await supabase
          .from('contract_mutual_agreements')
          .select('id')
          .eq('contract_id', data.id)
          .eq('requested_by', 'player')
          .eq('status', 'pending')
          .maybeSingle();
        setPendingMutual(!!mutualAgreement);

        // Check for club-initiated mutual agreement
        const { data: clubAgreement } = await (supabase.from('contract_mutual_agreements') as any)
          .select('id')
          .eq('contract_id', data.id)
          .eq('requested_by', 'club')
          .eq('status', 'pending')
          .maybeSingle();
        setClubMutualPending(clubAgreement?.id || null);
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
          title: t('notifications.request_title'),
          body: t('notifications.request_body', { name: playerProfile.full_name }),
          type: 'contract',
          link: '/manager/squad',
          i18n_key: 'mutual_exit_requested',
          i18n_params: { player: playerProfile.full_name },
        } as any);
      }

      toast.success(t('toast.request_sent'));
      setPendingMutual(true);
      setMutualDialogOpen(false);
    } catch (err) {
      toast.error(t('toast.request_error'));
    }
    setSubmittingMutual(false);
  }

  async function handleAcceptClubMutual() {
    if (!playerProfile || !contract || !clubMutualPending) return;
    setRespondingMutual(true);
    try {
      // Accept the agreement
      await (supabase.from('contract_mutual_agreements') as any)
        .update({ status: 'accepted', resolved_at: new Date().toISOString() })
        .eq('id', clubMutualPending);

      // Terminate contract
      await supabase.from('contracts').update({
        status: 'terminated', terminated_at: new Date().toISOString(), termination_type: 'mutual_agreement',
      } as any).eq('id', contract.id);

      // Remove from club
      await supabase.from('player_profiles').update({ club_id: null } as any).eq('id', playerProfile.id);

      // Notify manager
      const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', playerProfile.club_id).maybeSingle();
      const { data: manager } = club ? await supabase.from('manager_profiles').select('user_id').eq('id', club.manager_profile_id).maybeSingle() : { data: null };
      if (manager?.user_id) {
        await supabase.from('notifications').insert({
          user_id: manager.user_id,
          title: t('notifications.accept_title'),
          body: t('notifications.accept_body', { name: playerProfile.full_name }),
          type: 'contract',
          link: '/manager/squad',
          i18n_key: 'mutual_exit_player_accepted',
          i18n_params: { player: playerProfile.full_name },
        } as any);
      }

      toast.success(t('toast.accept_ok'));
      setClubMutualPending(null);
      await refreshPlayerProfile();
      window.location.reload();
    } catch (err) {
      toast.error(t('toast.accept_error'));
    }
    setRespondingMutual(false);
  }

  async function handleRejectClubMutual() {
    if (!clubMutualPending) return;
    setRespondingMutual(true);
    try {
      await (supabase.from('contract_mutual_agreements') as any)
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', clubMutualPending);

      // Notify manager
      const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', playerProfile?.club_id).maybeSingle();
      const { data: manager } = club ? await supabase.from('manager_profiles').select('user_id').eq('id', club.manager_profile_id).maybeSingle() : { data: null };
      if (manager?.user_id) {
        await supabase.from('notifications').insert({
          user_id: manager.user_id,
          title: t('notifications.reject_title'),
          body: t('notifications.reject_body', { name: playerProfile?.full_name ?? '' }),
          type: 'contract',
          link: '/manager/squad',
          i18n_key: 'mutual_exit_player_rejected',
          i18n_params: { player: playerProfile?.full_name ?? '' },
        } as any);
      }

      toast.success(t('toast.reject_ok'));
      setClubMutualPending(null);
    } catch (err) {
      toast.error(t('toast.reject_error'));
    }
    setRespondingMutual(false);
  }

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">{t('loading')}</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">{t('title')}</h1>

        {/* Financial Summary Card */}
        <div className="stat-card border-tactical/30">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">{t('summary.title')}</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Wallet className="h-5 w-5 text-pitch mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">{t('summary.balance')}</span>
                  <p className="font-display font-bold text-lg text-pitch">{formatBRL(playerMoney)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarClock className="h-5 w-5 text-tactical mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">{t('summary.weekly_salary')}</span>
                  <p className="font-display font-bold text-lg">
                    {contract ? formatBRL(contract.weekly_salary) : t('summary.no_contract')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">{t('summary.club')}</span>
                  <p className="font-display font-bold">{contract?.club_name || t('summary.free_agent')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">{t('summary.next_payment')}</span>
                  <p className="font-display font-bold">{contract ? getNextMonday(lang) : '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contract Details Card */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">{t('contract.title')}</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          ) : contract ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.status')}</span>
                <p className="font-display font-bold text-pitch">{t('contract.active')}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.club')}</span>
                <p className="font-display font-bold">{contract.club_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.weekly_salary')}</span>
                <p className="font-display font-bold">{formatBRL(contract.weekly_salary)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.release_clause')}</span>
                <p className="font-display font-bold">{formatBRL(contract.release_clause)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.start')}</span>
                <p className="font-display font-bold">{formatContractDate(contract.start_date, lang, '-')}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.end')}</span>
                <p className="font-display font-bold">{formatContractDate(contract.end_date, lang, '-')}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="font-display font-semibold">{t('contract.free_agent_title')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('contract.free_agent_hint')}</p>
              <Link to="/player/offers">
                <Button variant="outline" size="sm" className="mt-3">{t('contract.see_offers')}</Button>
              </Link>
            </div>
          )}
        </div>

        {/* ── Club requested mutual agreement ── */}
        {!loading && contract && clubMutualPending && (
          <div className="stat-card space-y-3 border-2 border-orange-500/30 bg-orange-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Handshake className="h-4 w-4 text-orange-500" />
              <span className="font-display font-semibold text-sm text-orange-500">{t('club_request.title')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('club_request.body')}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleAcceptClubMutual}
                disabled={respondingMutual}
                className="bg-pitch hover:bg-pitch/90 text-white gap-2"
                size="sm"
              >
                {respondingMutual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('club_request.accept')}
              </Button>
              <Button
                onClick={handleRejectClubMutual}
                disabled={respondingMutual}
                variant="outline"
                size="sm"
              >
                {t('club_request.reject')}
              </Button>
            </div>
          </div>
        )}

        {/* ── Solicitar Saída (Mutual Agreement) ── */}
        {!loading && contract && (
          <div className="stat-card space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Handshake className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('request_exit.title')}</span>
            </div>

            {pendingMutual ? (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                {t('request_exit.pending')}
              </Badge>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('request_exit.hint')}
                </p>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setMutualDialogOpen(true)}
                >
                  <Handshake className="h-4 w-4" /> {t('request_exit.button')}
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
              <Handshake className="h-5 w-5 text-tactical" /> {t('dialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMutualDialogOpen(false)} disabled={submittingMutual}>
              {t('dialog.cancel')}
            </Button>
            <Button onClick={handleRequestMutualAgreement} disabled={submittingMutual} className="gap-2">
              {submittingMutual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
              {submittingMutual ? t('dialog.submitting') : t('dialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
