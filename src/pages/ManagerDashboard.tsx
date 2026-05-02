import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { Users, DollarSign, Trophy, Building2, Star, TrendingUp, Wrench, Shield, Swords, Brain, CircleDot, AlertTriangle, ArrowLeftRight, BarChart3, Clock, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBRL } from '@/lib/formatting';
import { formatDate } from '@/lib/formatDate';
import { ClubCrest } from '@/components/ClubCrest';
import { CountryFlag } from '@/components/CountryFlag';
import { Button } from '@/components/ui/button';
import { SlotChoiceDialog } from '@/components/SlotChoiceDialog';
import { ManagerDashboardIntroTour } from '@/components/tour/ManagerDashboardIntroTour';

const COACH_TYPE_ICON: Record<string, typeof Shield> = {
  defensive: Shield,
  offensive: Swords,
  technical: Brain,
  complete: CircleDot,
};

export default function ManagerDashboard() {
  const { t } = useTranslation(['dashboard', 'onboarding']);
  const { t: tCommon } = useTranslation('common');
  const { current: lang } = useAppLanguage();
  const { managerProfile, club } = useAuth();
  const [finance, setFinance] = useState<any>(null);
  const [stadium, setStadium] = useState<any>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [bankruptcyStatus, setBankruptcyStatus] = useState<any>(null);
  const [inactivePlayerCount, setInactivePlayerCount] = useState(0);
  const [slotChoiceOpen, setSlotChoiceOpen] = useState(false);

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
      // Check bankruptcy status
      try {
        const { data: bStatus } = await supabase.rpc('get_bankruptcy_status', { p_club_id: club.id });
        if (bStatus && bStatus.length > 0) setBankruptcyStatus(bStatus[0]);
      } catch { /* table may not exist yet */ }
      // Inactive players (5+ dias sem treinar). Cheap count query for dashboard card.
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const { data: inactive } = await supabase
        .from('player_profiles')
        .select('id, last_trained_at')
        .eq('club_id', club.id)
        .not('user_id', 'is', null);
      const cutoff = fiveDaysAgo.getTime();
      const count = (inactive ?? []).filter(p => !p.last_trained_at || new Date(p.last_trained_at).getTime() < cutoff).length;
      setInactivePlayerCount(count);
    };
    fetchData();
  }, [club]);

  if (!managerProfile) return null;

  if (!club) {
    return (
      <ManagerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
          <Trophy className="h-16 w-16 text-muted-foreground/40" />
          <h2 className="font-display text-2xl font-bold">{t('dashboard:manager.no_team.title')}</h2>
          <p className="text-muted-foreground max-w-md">
            {t('dashboard:manager.no_team.hint')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/league"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-pitch text-white font-display font-semibold hover:bg-pitch/90 transition-colors"
            >
              <Trophy className="h-4 w-4" />
              {t('dashboard:manager.no_team.go_to_league')}
            </Link>
            <Button variant="outline" onClick={() => setSlotChoiceOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {tCommon('slot_choice.cta_button')}
            </Button>
          </div>
        </div>
        <SlotChoiceDialog open={slotChoiceOpen} onClose={() => setSlotChoiceOpen(false)} />
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <ManagerDashboardIntroTour enabled={!!club && !!managerProfile} />
        {/* Transfer Window Banner */}
        {(() => {
          const day = new Date().getDate();
          const isOpen = day >= 1 && day <= 5;
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
          return (
            <div className={`rounded-lg px-4 py-2.5 flex items-center gap-3 ${isOpen ? 'bg-pitch/15 border border-pitch/30' : 'bg-muted/20 border border-border'}`}>
              <ArrowLeftRight className={`h-4 w-4 ${isOpen ? 'text-pitch' : 'text-muted-foreground'}`} />
              <span className={`font-display text-sm font-semibold ${isOpen ? 'text-pitch' : 'text-muted-foreground'}`}>
                {isOpen
                  ? t('dashboard:manager.transfer_window.open')
                  : t('dashboard:manager.transfer_window.next', { date: formatDate(nextMonth, lang, 'date_short') })}
              </span>
            </div>
          );
        })()}

        {/* Bankruptcy Warning */}
        {bankruptcyStatus?.is_in_debt && (
          <div className="rounded-lg px-4 py-3 bg-destructive/15 border border-destructive/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-display text-sm font-bold text-destructive">
                  {t('dashboard:manager.bankruptcy.title', { amount: formatBRL(bankruptcyStatus.balance) })}
                </p>
                <p className="text-xs text-destructive/80 mt-0.5">
                  {bankruptcyStatus.days_remaining != null
                    ? t('dashboard:manager.bankruptcy.days_remaining', { count: bankruptcyStatus.days_remaining })
                    : t('dashboard:manager.bankruptcy.no_deadline')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div data-tour="manager-header" className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <ClubCrest crestUrl={(club as any).crest_url} primaryColor={club.primary_color} secondaryColor={club.secondary_color} shortName={club.short_name} className="w-14 h-14 rounded-lg text-xl" />
            <div>
              <h1 className="font-display text-3xl font-bold flex items-center gap-2">
                <span>{club.name}</span>
                {(club as any).country && <CountryFlag code={(club as any).country} size="sm" />}
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <span>{t('dashboard:manager.header.manager_label', { name: managerProfile.full_name })}</span>
                {(managerProfile as any).country_code && <CountryFlag code={(managerProfile as any).country_code} size="xs" />}
                {club.city && <span>• {club.city}</span>}
              </p>
              {managerProfile.coach_type && COACH_TYPE_ICON[managerProfile.coach_type] && (() => {
                const CoachIcon = COACH_TYPE_ICON[managerProfile.coach_type];
                const coachLabel = t(`onboarding:manager.coach.${managerProfile.coach_type}`);
                return (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CoachIcon className="h-3 w-3" />
                    {t('dashboard:manager.header.style_label', { label: coachLabel })}
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <span className="text-xs text-muted-foreground">{t('dashboard:manager.header.status')}</span>
              <p className="font-display font-bold text-pitch capitalize">{club.status}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSlotChoiceOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {tCommon('slot_choice.cta_button')}
            </Button>
          </div>
        </div>

        <div data-tour="manager-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('dashboard:manager.cards.club_rep')} value={club.reputation} icon={<Trophy className="h-5 w-5" />} />
          <StatCard label={t('dashboard:manager.cards.manager_rep')} value={managerProfile.reputation} icon={<Star className="h-5 w-5" />} />
          <StatCard label={t('dashboard:manager.cards.squad')} value={playerCount} icon={<Users className="h-5 w-5" />} subtitle={t('dashboard:manager.cards.squad_subtitle')} />
          <StatCard label={t('dashboard:manager.cards.balance')} value={finance ? `$${(finance.balance / 1000).toFixed(0)}k` : '...'} icon={<DollarSign className="h-5 w-5" />} />
        </div>

        <div data-tour="manager-shortcuts" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Finances summary */}
          <Link to="/manager/finance" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.finances.title')}</span>
            </div>
            {finance ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.finances.balance')}</span>
                  <span className="font-display font-bold">${finance.balance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.finances.wage_bill')}</span>
                  <span className="font-display font-bold">${finance.weekly_wage_bill.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.finances.projected_income')}</span>
                  <span className="font-display font-bold text-pitch">${finance.projected_income.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.finances.projected_expense')}</span>
                  <span className="font-display font-bold text-destructive">${finance.projected_expense.toLocaleString()}</span>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t('dashboard:manager.loading')}</p>}
          </Link>

          {/* Stadium summary */}
          <Link to="/manager/stadium" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.stadium.title')}</span>
            </div>
            {stadium ? (
              <div className="space-y-2 text-sm">
                <p className="font-display font-bold text-lg">{stadium.name}</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.stadium.capacity')}</span>
                  <span className="font-display font-bold">{stadium.capacity.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.stadium.quality')}</span>
                  <span className="font-display font-bold">{stadium.quality}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard:manager.stadium.prestige')}</span>
                  <span className="font-display font-bold">{stadium.prestige}/100</span>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t('dashboard:manager.loading')}</p>}
          </Link>
        </div>

        {/* Squad / Market links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/manager/squad" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.squad_card.title')}</span>
            </div>
            <p className="font-display text-2xl font-bold">{playerCount}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard:manager.squad_card.subtitle')}</p>
          </Link>
          <Link to="/manager/market" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.market.title')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('dashboard:manager.market.subtitle')}</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/manager/facilities" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.facilities.title')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('dashboard:manager.facilities.subtitle')}</p>
          </Link>
          <Link to="/league" className="stat-card block hover:border-tactical/40 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('dashboard:manager.league.title')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('dashboard:manager.league.subtitle')}</p>
          </Link>
        </div>

        <Link
          data-tour="manager-reports"
          to="/manager/relatorios"
          className={`stat-card block transition-colors ${inactivePlayerCount > 0 ? 'hover:border-amber-500/50 border-amber-500/30 bg-amber-500/5' : 'hover:border-tactical/40'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className={`h-5 w-5 ${inactivePlayerCount > 0 ? 'text-amber-400' : 'text-tactical'}`} />
              <div>
                <span className="font-display font-semibold text-sm block">{t('dashboard:manager.reports.title')}</span>
                {inactivePlayerCount > 0 ? (
                  <span className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {t('dashboard:manager.reports.inactive', { count: inactivePlayerCount })}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('dashboard:manager.reports.subtitle')}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </div>
        </Link>
      </div>

      <SlotChoiceDialog open={slotChoiceOpen} onClose={() => setSlotChoiceOpen(false)} />
    </ManagerLayout>
  );
}
