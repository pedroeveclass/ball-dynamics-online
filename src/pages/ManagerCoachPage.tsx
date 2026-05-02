import { useEffect, useMemo, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Brain, Dumbbell, Target, Heart, Zap, Lock, Check, Crosshair, GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import { ManagerCoachIntroTour } from '@/components/tour/ManagerCoachIntroTour';

type BoostType =
  | 'tactics'
  | 'formation'
  | 'fitness'
  | 'set_piece'
  | 'mentality'
  | 'high_press'
  | 'training_focus';

const BOOST_KEYS: BoostType[] = [
  'tactics', 'formation', 'fitness', 'set_piece', 'mentality', 'high_press', 'training_focus',
];

const BOOST_ICON: Record<BoostType, typeof Brain> = {
  tactics: Brain,
  formation: Target,
  fitness: Dumbbell,
  set_piece: Crosshair,
  mentality: Heart,
  high_press: Zap,
  training_focus: GraduationCap,
};

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '4-5-1', '3-4-3', '5-3-2', '5-4-1'];
const FOCUS_CATEGORIES = ['Físico', 'Técnico', 'Mental', 'Chute', 'Goleiro'] as const;

interface ActiveBoostRow {
  boost_type: BoostType;
  boost_param: string | null;
  iso_week_start: string;
}

export default function ManagerCoachPage() {
  const { club } = useAuth();
  const { t } = useTranslation('coach');
  const { current: lang } = useAppLanguage();

  const [activeBoost, setActiveBoost] = useState<ActiveBoostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Per-card param drafts (only used by formation + training_focus). Keyed by
  // boost_type so the user can pre-select before confirming.
  const [paramDrafts, setParamDrafts] = useState<Partial<Record<BoostType, string>>>({
    formation: '4-4-2',
    training_focus: 'Físico',
  });

  const loadActive = async () => {
    if (!club) return;
    const { data } = await (supabase as any).rpc('get_active_coach_boost', { p_club_id: club.id });
    const row: ActiveBoostRow | null =
      Array.isArray(data) && data.length > 0
        ? { boost_type: data[0].boost_type, boost_param: data[0].boost_param, iso_week_start: data[0].iso_week_start }
        : null;
    setActiveBoost(row);
    setLoading(false);
  };

  useEffect(() => {
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  // Next reset = next Monday 00:00 BRT.
  const nextResetDate = useMemo(() => {
    const nowSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dow = (nowSp.getDay() + 6) % 7; // 0 = Mon
    const daysUntilNextMonday = dow === 0 && nowSp.getHours() === 0 && nowSp.getMinutes() === 0 ? 0 : 7 - dow;
    const next = new Date(nowSp);
    next.setDate(nowSp.getDate() + daysUntilNextMonday);
    next.setHours(0, 0, 0, 0);
    return next;
  }, [activeBoost]);

  const handleConfirm = async (boostType: BoostType) => {
    if (!club || saving || activeBoost) return;
    let param: string | null = null;
    if (boostType === 'formation' || boostType === 'training_focus') {
      param = paramDrafts[boostType] ?? null;
      if (!param) {
        toast.error(t('toast.param_required'));
        return;
      }
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('set_weekly_coach_boost', {
        p_club_id: club.id,
        p_boost_type: boostType,
        p_boost_param: param,
      });
      if (error) throw error;
      toast.success(t('toast.set_ok', { label: t(`boosts.${boostType}.label`) }));
      await loadActive();
    } catch (err: any) {
      toast.error(err.message || t('toast.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!club) return null;

  const lockedThisWeek = !!activeBoost;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <ManagerCoachIntroTour enabled={!!club} />

        <div data-tour="coach-header" className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {/* Active boost banner */}
        <div className="stat-card space-y-2">
          <p className="text-xs text-muted-foreground font-display uppercase tracking-wide">{t('active_label')}</p>
          {activeBoost ? (
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-display font-bold text-lg text-tactical">{t(`boosts.${activeBoost.boost_type}.label`)}</p>
                <p className="text-xs text-muted-foreground">{t(`boosts.${activeBoost.boost_type}.bonus`)}</p>
                {activeBoost.boost_param && (
                  <p className="text-xs text-muted-foreground">
                    {t(`boosts.${activeBoost.boost_type}.param_label`)}: <span className="text-foreground font-semibold">
                      {activeBoost.boost_type === 'training_focus'
                        ? t(`categories.${activeBoost.boost_param}`)
                        : activeBoost.boost_param}
                    </span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('no_active')}</p>
          )}
          {lockedThisWeek && (
            <p className="text-xs text-amber-400 font-display mt-2">
              {t('locked_until', { date: formatDate(nextResetDate, lang, 'date_short') })}
            </p>
          )}
          {!lockedThisWeek && (
            <p className="text-xs text-muted-foreground italic mt-2">{t('pick_one_warning')}</p>
          )}
        </div>
        </div>{/* /coach-header */}

        {/* Boost grid */}
        <div data-tour="coach-boosts" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BOOST_KEYS.map((key) => {
            const Icon = BOOST_ICON[key];
            const isActive = activeBoost?.boost_type === key;
            const isOtherLocked = lockedThisWeek && !isActive;
            const needsParam = key === 'formation' || key === 'training_focus';
            const paramValue = paramDrafts[key];

            return (
              <div
                key={key}
                className={`stat-card space-y-3 transition-opacity ${
                  isOtherLocked ? 'opacity-40' : ''
                } ${isActive ? 'ring-2 ring-emerald-500/60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-tactical" />
                    <span className="font-display font-bold text-sm">{t(`boosts.${key}.label`)}</span>
                  </div>
                  {isActive && <Check className="h-4 w-4 text-emerald-500" />}
                </div>

                <p className="text-xs text-muted-foreground">{t(`boosts.${key}.description`)}</p>
                <p className="text-[11px] text-tactical font-display">{t(`boosts.${key}.bonus`)}</p>

                {needsParam && (
                  <select
                    value={isActive ? (activeBoost?.boost_param ?? '') : (paramValue ?? '')}
                    onChange={(e) => setParamDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    disabled={lockedThisWeek || saving}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1 disabled:opacity-60"
                  >
                    {key === 'formation' && FORMATIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                    {key === 'training_focus' && FOCUS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{t(`categories.${c}`)}</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => handleConfirm(key)}
                  disabled={lockedThisWeek || saving || loading}
                  className="w-full py-2 text-xs font-display font-bold rounded-lg transition-colors disabled:cursor-not-allowed bg-tactical/20 text-tactical hover:bg-tactical/30 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isActive ? (
                    <><Check className="h-3.5 w-3.5" /> {t('buttons.active')}</>
                  ) : lockedThisWeek ? (
                    <><Lock className="h-3.5 w-3.5" /> {t('buttons.locked')}</>
                  ) : (
                    <>{t('buttons.confirm')}</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ManagerLayout>
  );
}
