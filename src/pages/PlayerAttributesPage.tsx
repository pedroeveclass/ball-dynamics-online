import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { FIELD_ATTRS, GK_ATTRS, ATTR_LABELS, ATTRIBUTE_CATEGORIES, getTrainingGrowthRate, getAttributeTier, getTrainingTierMultiplier, getCoachBonus, getTrainingCenterBonus, COACH_TYPE_LABELS, COACH_BONUS_ATTRS, COACH_BONUS_RATE, getAttrCapWithReason, getTrainingFit, TRAINING_PACE_FACTOR } from '@/lib/attributes';
import { formatDate } from '@/lib/formatDate';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { Dumbbell, TrendingUp, History, Shield, Swords, Wrench, Star, Building2, ChevronDown, ChevronUp, Info, GraduationCap } from 'lucide-react';

const ENERGY_COST = 25;

interface TrainingRecord {
  id: string;
  attribute_key: string;
  old_value: number;
  new_value: number;
  growth: number;
  trained_at: string;
}

export default function PlayerAttributesPage() {
  const { playerProfile, refreshPlayerProfile } = useAuth();
  const { t } = useTranslation('player_attributes');
  const { current: lang } = useAppLanguage();
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [training, setTraining] = useState<string | null>(null);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [coachType, setCoachType] = useState<string>('all_around');
  const [trainingCenterLevel, setTrainingCenterLevel] = useState<number>(0);
  const [showBonusInfo, setShowBonusInfo] = useState(false);
  const [hasClub, setHasClub] = useState<boolean>(true);
  const [trainerBonus, setTrainerBonus] = useState<{ level: number; value: number } | null>(null);
  // Today's match (if any) — used to warn the player before they burn energy on
  // a training session that'd leave them short for kickoff.
  const [todayMatch, setTodayMatch] = useState<{ scheduledAt: string; opponent: string | null } | null>(null);
  const [matchWarnFor, setMatchWarnFor] = useState<string | null>(null);

  const weeklyEvolution = (() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentHistory = history.filter(h => new Date(h.trained_at) >= oneWeekAgo);
    const evoMap: Record<string, number> = {};
    for (const h of recentHistory) {
      evoMap[h.attribute_key] = (evoMap[h.attribute_key] || 0) + h.growth;
    }
    return evoMap;
  })();

  const fetchAttrs = async () => {
    if (!playerProfile) return;
    const { data } = await supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).single();
    setAttrs(data);
  };

  const fetchTrainingBonuses = async () => {
    if (!playerProfile?.club_id) {
      setHasClub(false);
      setCoachType('all_around');
      setTrainingCenterLevel(0);
      return;
    }
    setHasClub(true);

    // Get club's manager coach type
    const { data: club } = await supabase.from('clubs').select('id, manager_profile_id').eq('id', playerProfile.club_id).maybeSingle();
    if (club?.manager_profile_id) {
      const { data: manager } = await supabase.from('manager_profiles').select('coach_type').eq('id', club.manager_profile_id).maybeSingle();
      setCoachType(manager?.coach_type || 'all_around');
    } else {
      setCoachType('all_around');
    }

    // Get training center level
    const { data: trainingFacility } = await supabase.from('club_facilities').select('level').eq('club_id', playerProfile.club_id).eq('facility_type', 'training_center').maybeSingle();
    setTrainingCenterLevel(trainingFacility?.level || 0);

    // Get active trainer subscription from store
    const { data: trainerPurchases } = await supabase
      .from('store_purchases')
      .select('store_item_id, level')
      .eq('player_profile_id', playerProfile.id)
      .in('status', ['active', 'cancelling']);

    if (trainerPurchases && trainerPurchases.length > 0) {
      const itemIds = trainerPurchases.map(p => p.store_item_id);
      const { data: trainerItems } = await (supabase as any)
        .from('store_items')
        .select('id, bonus_value, level, category')
        .in('id', itemIds)
        .eq('category', 'trainer');

      if (trainerItems && trainerItems.length > 0) {
        const best = trainerItems.reduce((a: any, b: any) => (Number(b.bonus_value || 0) > Number(a.bonus_value || 0) ? b : a));
        setTrainerBonus({ level: best.level || 1, value: Number(best.bonus_value || 0) });
      } else {
        setTrainerBonus(null);
      }
    } else {
      setTrainerBonus(null);
    }
  };

  const fetchHistory = async () => {
    if (!playerProfile) return;
    const { data } = await supabase
      .from('training_history')
      .select('*')
      .eq('player_profile_id', playerProfile.id)
      .order('trained_at', { ascending: false })
      .limit(50);
    setHistory((data as TrainingRecord[]) || []);
  };

  const fetchTodayMatch = async () => {
    if (!playerProfile?.club_id) { setTodayMatch(null); return; }
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('matches')
      .select('scheduled_at, home_club_id, away_club_id, status')
      .or(`home_club_id.eq.${playerProfile.club_id},away_club_id.eq.${playerProfile.club_id}`)
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString())
      .in('status', ['scheduled', 'live'])
      .order('scheduled_at', { ascending: true })
      .limit(1);

    const match = (data || [])[0] as any;
    if (!match) { setTodayMatch(null); return; }

    const opponentClubId = match.home_club_id === playerProfile.club_id ? match.away_club_id : match.home_club_id;
    const { data: opp } = await supabase.from('clubs').select('short_name, name').eq('id', opponentClubId).maybeSingle();
    setTodayMatch({
      scheduledAt: match.scheduled_at,
      opponent: (opp as any)?.short_name || (opp as any)?.name || null,
    });
  };

  useEffect(() => { fetchAttrs(); fetchHistory(); fetchTrainingBonuses(); fetchTodayMatch(); }, [playerProfile]);

  if (!playerProfile || !attrs) {
    return <AppLayout><p className="text-muted-foreground">{t('loading')}</p></AppLayout>;
  }

  const isGK = playerProfile.primary_position === 'GK';
  const growthRate = getTrainingGrowthRate(playerProfile.age);

  const handleTrainClick = (attrKey: string) => {
    if (playerProfile.energy_current < ENERGY_COST) {
      toast.error(t('toast.energy_low'));
      return;
    }
    if (todayMatch) {
      // Defer actual training until the player confirms they still want to burn
      // energy on a match day. Cancel = abort silently.
      setMatchWarnFor(attrKey);
      return;
    }
    void handleTrain(attrKey);
  };

  const handleTrain = async (attrKey: string) => {
    if (playerProfile.energy_current < ENERGY_COST) {
      toast.error(t('toast.energy_low'));
      return;
    }

    setTraining(attrKey);

    try {
      const { data, error } = await supabase.rpc('train_attribute', {
        p_player_profile_id: playerProfile.id,
        p_attribute_key: attrKey,
      });

      if (error) {
        toast.error(error.message || t('toast.error'));
        setTraining(null);
        return;
      }

      await fetchAttrs();
      await fetchHistory();
      await refreshPlayerProfile();

      const result = data as { attribute: string; new_value: number; growth: number; fit_multiplier?: number };
      const tier = getAttributeTier(result.new_value);
      const fitMult = typeof result.fit_multiplier === 'number' ? result.fit_multiplier : 1;
      let fitSuffix = '';
      if (fitMult >= 1.5)      fitSuffix = t('toast.fit_top');
      else if (fitMult >= 1.2) fitSuffix = t('toast.fit_good');
      else if (fitMult <= 0.3) fitSuffix = t('toast.fit_terrible');
      else if (fitMult <= 0.6) fitSuffix = t('toast.fit_bad');
      toast.success(t('toast.success', {
        label: ATTR_LABELS[attrKey] || attrKey,
        growth: result.growth.toFixed(2),
        tier: tier.label,
        suffix: fitSuffix,
      }));
    } catch (err: any) {
      toast.error(err.message || t('toast.error'));
    } finally {
      setTraining(null);
    }
  };

  const renderSection = (title: string, keys: readonly string[]) => {
    const sectionHasEvo = keys.some(k => (weeklyEvolution[k] || 0) > 0);
    return (
    <div className="stat-card">
      <h2 className="font-display text-lg font-bold mb-4">{title}</h2>
      <div className="space-y-2">
        {keys.map(key => {
          const value = Number((attrs as any)[key]) || 0;
          const evo = weeklyEvolution[key];
          const tier = getAttributeTier(value);
          const tierMult = getTrainingTierMultiplier(value);
          const attrCoachBonus = hasClub ? getCoachBonus(coachType, key) : 0;
          const attrTcBonus = hasClub ? getTrainingCenterBonus(trainingCenterLevel) : 0;
          const attrTrainerBonus = trainerBonus ? trainerBonus.value / 100 : 0;
          const bonusFactor = 1 + attrCoachBonus + attrTcBonus + attrTrainerBonus;
          const fitInfo = getTrainingFit(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, key);
          const effectiveGrowthMin = (growthRate * tierMult * bonusFactor * fitInfo.multiplier * TRAINING_PACE_FACTOR).toFixed(2);
          const effectiveGrowthMax = ((growthRate + 0.99) * tierMult * bonusFactor * fitInfo.multiplier * TRAINING_PACE_FACTOR).toFixed(2);
          const capInfo = getAttrCapWithReason(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, key);
          const cap = capInfo.cap;
          const capLimitedByPosition = capInfo.reasons.includes('position');
          const atCap = value >= cap;

          // Accent color per fit tone — tiny left border tint so the user can
          // scan-pick good-fit attrs in the whole column at a glance.
          const accentClass =
            fitInfo.fit === 2  ? 'border-l-4 border-emerald-500'
          : fitInfo.fit === 1  ? 'border-l-4 border-lime-500'
          : fitInfo.fit === -1 ? 'border-l-4 border-orange-500'
          : fitInfo.fit === -2 ? 'border-l-4 border-red-500'
          :                      'border-l-4 border-transparent';

          // Pill style per fit tone.
          const fitPct = Math.round((fitInfo.multiplier - 1) * 100);
          const fitPillText = fitInfo.fit === 0
            ? fitInfo.label
            : `${fitInfo.label} (${fitPct > 0 ? '+' : ''}${fitPct}%)`;
          const fitPillClass =
            fitInfo.fit === 2  ? 'bg-emerald-500/15 text-emerald-500'
          : fitInfo.fit === 1  ? 'bg-lime-500/15 text-lime-500'
          : fitInfo.fit === -1 ? 'bg-orange-500/15 text-orange-500'
          : fitInfo.fit === -2 ? 'bg-red-500/15 text-red-500'
          :                      'bg-muted text-muted-foreground';

          return (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button className={`w-full text-left hover:bg-muted/50 rounded-md p-1 pl-2 transition-colors cursor-pointer ${accentClass}`} disabled={training === key}>
                  <AttributeBar
                    label={ATTR_LABELS[key] || key}
                    value={value}
                    cap={cap}
                    showTier
                    evo={evo}
                    showEvoSlot={sectionHasEvo}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-tactical" />
                    <span className="font-display font-bold text-sm">{t('popover.train_attr', { attr: ATTR_LABELS[key] || key })}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-display font-semibold px-2 py-0.5 rounded-full ${tier.bgColor} ${tier.color}`}>
                      {tier.label}
                    </span>
                    <span className={`text-xs font-display font-semibold px-2 py-0.5 rounded-full ${fitPillClass}`}>
                      {fitPillText}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Trans
                      i18nKey="popover.current_growth"
                      t={t}
                      values={{ value: value.toFixed(2), min: effectiveGrowthMin, max: effectiveGrowthMax }}
                      components={[<span key="0" />, <span key="1" className="font-bold text-foreground" />, <span key="2" />, <span key="3" className="font-bold text-pitch" />]}
                    />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Trans
                      i18nKey="popover.type_cap"
                      t={t}
                      values={{ archetype: playerProfile.archetype, height: playerProfile.height, cap }}
                      components={[<span key="0" />, <span key="1" className="font-bold text-foreground" />]}
                    />
                  </p>
                  {capLimitedByPosition && (
                    <p className="text-xs text-amber-400" title={t('popover.limited_by_position_title')}>
                      {t('popover.limited_by_position', { pos: playerProfile.primary_position })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t('popover.energy_cost', { cost: ENERGY_COST })}</p>
                  {atCap && (
                    <p className="text-xs text-destructive">{t('popover.at_cap')}</p>
                  )}
                  {tierMult < 1 && (
                    <p className="text-xs text-warning">{t('popover.tier_reduced', { pct: Math.round(tierMult * 100) })}</p>
                  )}
                  {tierMult > 1 && (
                    <p className="text-xs text-pitch">{t('popover.tier_bonus', { pct: Math.round(tierMult * 100) })}</p>
                  )}
                  {playerProfile.age >= 30 && (
                    <p className="text-xs text-warning">{t('popover.age_reduced', { pct: Math.round(growthRate * 100) })}</p>
                  )}
                  {hasClub && attrCoachBonus > 0 && (
                    <p className="text-xs text-blue-400">{t('popover.coach_bonus_value', { type: COACH_TYPE_LABELS[coachType] || coachType, pct: Math.round(attrCoachBonus * 100) })}</p>
                  )}
                  {hasClub && attrTcBonus > 0 && (
                    <p className="text-xs text-amber-400">{t('popover.tc_bonus_value', { level: trainingCenterLevel, pct: Math.round(attrTcBonus * 100) })}</p>
                  )}
                  {attrTrainerBonus > 0 && (
                    <p className="text-xs text-green-400">{t('popover.private_bonus_value', { level: trainerBonus?.level, pct: Math.round(attrTrainerBonus * 100) })}</p>
                  )}
                  {!hasClub && (
                    <p className="text-xs text-muted-foreground">{t('popover.no_club_no_bonus')}</p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleTrainClick(key)}
                    disabled={training !== null || playerProfile.energy_current < ENERGY_COST || atCap}
                    className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
                  >
                    {atCap ? t('popover.btn_at_cap') : training === key ? t('popover.btn_training') : t('popover.btn_confirm')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
    );
  };

  const physicalKeys = ATTRIBUTE_CATEGORIES['Físico'];
  const technicalKeys = ATTRIBUTE_CATEGORIES['Técnico'];
  const mentalKeys = ATTRIBUTE_CATEGORIES['Mental'];
  const shootingKeys = ATTRIBUTE_CATEGORIES['Chute'];
  const gkKeys = ATTRIBUTE_CATEGORIES['Goleiro'];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{t('header.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('header.subtitle', { name: playerProfile.full_name, ovr: playerProfile.overall, cur: playerProfile.energy_current, max: playerProfile.energy_max })}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('header.growth_rate')}</p>
              <p className="font-display font-bold text-tactical">{Math.round(growthRate * 100)}%</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="font-display">
              <History className="h-4 w-4 mr-1" />
              {t('header.history_button')}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('intro', { cost: ENERGY_COST })}
          {Object.keys(weeklyEvolution).length > 0 && <span className="text-pitch">{t('intro_evo')}</span>}
        </p>

        {/* Training Bonuses Info Card */}
        <div className="stat-card">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setShowBonusInfo(!showBonusInfo)}
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('bonus_card.title')}</span>
            </div>
            {showBonusInfo ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showBonusInfo && (
            <div className="mt-3 space-y-2">
              {!hasClub ? (
                <p className="text-sm text-muted-foreground">{t('bonus_card.no_club')}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('bonus_card.base_rate')}</span>
                    <span className="font-display font-bold text-foreground">{Math.round(growthRate * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {coachType === 'defensive' && <Shield className="h-4 w-4 text-blue-400" />}
                    {coachType === 'offensive' && <Swords className="h-4 w-4 text-red-400" />}
                    {coachType === 'technical' && <Wrench className="h-4 w-4 text-cyan-400" />}
                    {(coachType === 'all_around' || coachType === 'complete') && <Star className="h-4 w-4 text-yellow-400" />}
                    <span className="text-muted-foreground">{t('bonus_card.coach_bonus', { type: COACH_TYPE_LABELS[coachType] || 'Completo' })}</span>
                    <span className="font-display font-bold text-blue-400">+{Math.round((COACH_BONUS_RATE[coachType] || 0.10) * 100)}%</span>
                  </div>
                  {coachType !== 'all_around' && coachType !== 'complete' && COACH_BONUS_ATTRS[coachType] && (
                    <p className="text-xs text-muted-foreground ml-6">
                      {t('bonus_card.coach_attrs', { attrs: COACH_BONUS_ATTRS[coachType].map(a => ATTR_LABELS[a] || a).join(', ') })}
                    </p>
                  )}
                  {(coachType === 'all_around' || coachType === 'complete') && (
                    <p className="text-xs text-muted-foreground ml-6">{t('bonus_card.coach_all')}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-amber-400" />
                    <span className="text-muted-foreground">{t('bonus_card.tc_bonus', { level: trainingCenterLevel })}</span>
                    <span className="font-display font-bold text-amber-400">+{Math.round(getTrainingCenterBonus(trainingCenterLevel) * 100)}%</span>
                  </div>
                  {trainerBonus && (
                    <div className="flex items-center gap-2 text-sm">
                      <GraduationCap className="h-4 w-4 text-green-400" />
                      <span className="text-muted-foreground">{t('bonus_card.private_trainer', { level: trainerBonus.level })}</span>
                      <span className="font-display font-bold text-green-400">+{trainerBonus.value}%</span>
                    </div>
                  )}
                  <div className="border-t border-muted pt-2 flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-pitch" />
                    <span className="text-muted-foreground">{t('bonus_card.combined_max')}</span>
                    <span className="font-display font-bold text-pitch">
                      +{Math.round(((COACH_BONUS_RATE[coachType] || 0.10) + getTrainingCenterBonus(trainingCenterLevel) + (trainerBonus ? trainerBonus.value / 100 : 0)) * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {showHistory && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">{t('history.title')}</span>
            </div>
            {history.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3 w-3 text-pitch" />
                      <span className="font-medium">{ATTR_LABELS[h.attribute_key] || h.attribute_key}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{Number(h.old_value).toFixed(2)} → {Number(h.new_value).toFixed(2)}</span>
                      <span className="font-display font-bold text-pitch">+{Number(h.growth).toFixed(2)}</span>
                      <span className="text-muted-foreground">{formatDate(h.trained_at, lang, 'date_short')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isGK ? (
            <>
              {renderSection(t('categories.goalkeeping'), gkKeys)}
              {renderSection(t('categories.physical'), physicalKeys)}
              {renderSection(t('categories.technical'), technicalKeys)}
              {renderSection(t('categories.mental'), mentalKeys)}
              {renderSection(t('categories.shooting'), shootingKeys)}
            </>
          ) : (
            <>
              {renderSection(t('categories.physical'), physicalKeys)}
              {renderSection(t('categories.technical'), technicalKeys)}
              {renderSection(t('categories.mental'), mentalKeys)}
              {renderSection(t('categories.shooting'), shootingKeys)}
              {renderSection(t('categories.goalkeeping'), gkKeys)}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={!!matchWarnFor} onOpenChange={(open) => { if (!open) setMatchWarnFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-destructive" />
              {t('match_warn.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {todayMatch?.opponent
                ? <Trans
                    i18nKey="match_warn.vs_known"
                    t={t}
                    values={{
                      opponent: todayMatch.opponent,
                      when: todayMatch?.scheduledAt
                        ? t('match_warn.kickoff_at', { time: formatDate(todayMatch.scheduledAt, lang, 'time_short') })
                        : '',
                    }}
                    components={[<span key="0" />, <strong key="1" />]}
                  />
                : t('match_warn.vs_unknown')}
              {' '}
              <Trans
                i18nKey="match_warn.energy_warning"
                t={t}
                values={{ cost: ENERGY_COST, remaining: Math.max(0, playerProfile.energy_current - ENERGY_COST) }}
                components={[<span key="0" />, <strong key="1" />, <span key="2" />, <strong key="3" />]}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('match_warn.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const key = matchWarnFor;
                setMatchWarnFor(null);
                if (key) void handleTrain(key);
              }}
            >
              {t('match_warn.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
