import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Check, X, FileText, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';
import { formatDate as formatDateI18n } from '@/lib/formatDate';
import type { SupportedLanguage } from '@/i18n';

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

function formatContractDate(d: string | null, lang: SupportedLanguage, fallback: string) {
  if (!d) return fallback;
  return formatDateI18n(new Date(d + 'T00:00:00'), lang, 'date_short');
}

export default function PlayerOffersPage() {
  const { user, playerProfile, refreshPlayerProfile } = useAuth();
  const { t } = useTranslation('player_offers');
  const { current: lang } = useAppLanguage();
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

      // Transfer player via server-side function (handles contract, club_id, AND release clause)
      const { error: transferError } = await supabase.rpc('transfer_player', {
        p_player_id: playerProfile.id,
        p_new_club_id: actionOffer.club_id,
        p_old_contract_id: '00000000-0000-0000-0000-000000000000',
        p_new_salary: actionOffer.weekly_salary,
        p_new_release_clause: actionOffer.release_clause,
        p_contract_months: actionOffer.contract_length,
      });
      if (transferError) {
        console.error('[TRANSFER] RPC error:', transferError);
        throw transferError;
      }

      // Wage bill + release clause already handled inside the RPC

      // Notify both clubs about the transfer finances
      const { data: oldContract } = await supabase.from('contracts')
        .select('club_id, release_clause')
        .eq('player_profile_id', playerProfile.id)
        .eq('status', 'terminated')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (oldContract && oldContract.club_id && oldContract.club_id !== actionOffer.club_id) {
        const clause = oldContract.release_clause || 0;
        if (clause > 0) {
          // Notify selling club manager
          const { data: sellerClub } = await supabase.from('clubs').select('manager_profile_id, name').eq('id', oldContract.club_id).maybeSingle();
          if (sellerClub) {
            const { data: sellerMgr } = await supabase.from('manager_profiles').select('user_id').eq('id', sellerClub.manager_profile_id).maybeSingle();
            if (sellerMgr?.user_id) {
              await supabase.from('notifications').insert({
                user_id: sellerMgr.user_id,
                title: t('notifications.sold_title'),
                body: t('notifications.sold_body', { name: playerProfile.full_name, amount: formatBRL(clause) }),
                type: 'transfer',
                link: '/manager/finance',
                i18n_key: 'player_sold',
                i18n_params: { player: playerProfile.full_name, amount: formatBRL(clause) },
              } as any);
            }
          }
          // Notify buying club manager
          const { data: buyerClub } = await supabase.from('clubs').select('manager_profile_id, name').eq('id', actionOffer.club_id).maybeSingle();
          if (buyerClub) {
            const { data: buyerMgr } = await supabase.from('manager_profiles').select('user_id').eq('id', buyerClub.manager_profile_id).maybeSingle();
            if (buyerMgr?.user_id) {
              await supabase.from('notifications').insert({
                user_id: buyerMgr.user_id,
                title: t('notifications.bought_title'),
                body: t('notifications.bought_body', { name: playerProfile.full_name, amount: formatBRL(clause) }),
                type: 'transfer',
                link: '/manager/squad',
                i18n_key: 'player_bought',
                i18n_params: { player: playerProfile.full_name, amount: formatBRL(clause) },
              } as any);
            }
          }
        }
      }

      const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', actionOffer.manager_profile_id).maybeSingle();
      if (mgr) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          title: t('notifications.accepted_title'),
          body: t('notifications.accepted_body', { name: playerProfile.full_name }),
          type: 'contract',
          link: '/manager/squad',
          i18n_key: 'contract_offer_accepted',
          i18n_params: { player: playerProfile.full_name },
        } as any);
      }

      toast.success(t('toast.signed', { club: actionOffer.club_name }));
      await refreshPlayerProfile();
    } else {
      await supabase.from('contract_offers').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', actionOffer.id);

      const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', actionOffer.manager_profile_id).single();
      if (mgr) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          title: t('notifications.rejected_title'),
          body: t('notifications.rejected_body', { name: playerProfile.full_name }),
          type: 'contract',
          link: '/manager/market',
          i18n_key: 'contract_offer_rejected',
          i18n_params: { player: playerProfile.full_name },
        } as any);
      }

      toast.success(t('toast.rejected'));
    }

    setProcessing(false);
    setActionOffer(null);
    setActionType(null);
    fetchData();
  };

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">{t('loading')}</p></AppLayout>;

  const roleLabel = (role: string) => {
    const known = ['starter', 'rotation', 'backup', 'youth'];
    return known.includes(role) ? t(`roles.${role}`) : role;
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <h1 className="font-display text-2xl font-bold">{t('title')}</h1>

        {/* Current contract status */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">{t('current_status.title')}</span>
          </div>
          {contract ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.club')}</span>
                <p className="font-display font-bold">{contract.club_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.status')}</span>
                <p className="font-display font-bold text-pitch capitalize">{t('current_status.active')}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.weekly_salary')}</span>
                <p className="font-display font-bold">{formatBRL(contract.weekly_salary)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.release_clause')}</span>
                <p className="font-display font-bold">{formatBRL(contract.release_clause)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.start')}</span>
                <p className="font-display font-bold">{formatContractDate(contract.start_date, lang, t('indeterminate'))}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('current_status.end')}</span>
                <p className="font-display font-bold">{formatContractDate(contract.end_date, lang, t('indeterminate'))}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="font-display font-semibold text-foreground">{t('current_status.free_agent_title')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('current_status.free_agent_hint')}</p>
            </div>
          )}
        </div>

        {/* Pending offers */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold">{t('pending.title')}</span>
            {offers.length > 0 && (
              <span className="bg-tactical text-tactical-foreground text-xs font-bold px-2 py-0.5 rounded-full">{offers.length}</span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t('pending.loading')}</p>
          ) : offers.length === 0 ? (
            <div className="stat-card text-center py-8">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="font-display font-semibold text-sm">{t('pending.empty_title')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('pending.empty_hint')}</p>
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
                        {formatDateI18n(offer.created_at, lang, 'date_short')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">{t('offer.weekly_salary')}</span>
                      <p className="font-display font-bold">{formatBRL(offer.weekly_salary)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t('offer.release_clause')}</span>
                      <p className="font-display font-bold">{formatBRL(offer.release_clause)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t('offer.duration')}</span>
                      <p className="font-display font-bold">{t('offer.duration_value', { count: offer.contract_length })}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t('offer.role')}</span>
                      <p className="font-display font-bold">{roleLabel(offer.squad_role)}</p>
                    </div>
                  </div>

                  {offer.message && (
                    <p className="text-sm text-muted-foreground italic mb-3">"{offer.message}"</p>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => handleAction(offer, 'reject')} className="gap-1.5 text-destructive hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                      {t('offer.reject')}
                    </Button>
                    <Button size="sm" onClick={() => handleAction(offer, 'accept')} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {t('offer.accept')}
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
              {actionType === 'accept' ? t('dialog.title_accept') : t('dialog.title_reject')}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'accept'
                ? t('dialog.desc_accept', {
                    club: actionOffer?.club_name ?? '',
                    salary: actionOffer ? formatBRL(actionOffer.weekly_salary) : '',
                    months: actionOffer?.contract_length ?? 0,
                  })
                : t('dialog.desc_reject', { club: actionOffer?.club_name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionOffer(null); setActionType(null); }}>{t('dialog.cancel')}</Button>
            <Button
              onClick={confirmAction}
              disabled={processing}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {processing ? t('dialog.processing') : actionType === 'accept' ? t('dialog.confirm_accept') : t('dialog.confirm_reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
