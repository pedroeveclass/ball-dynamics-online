import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ATTR_LABELS,
  ATTRIBUTE_CATEGORIES,
  FIELD_ATTRS,
  GK_ATTRS,
  getAttrCap,
  getCoachBonus,
  getTrainingCenterBonus,
  getTrainingFit,
  getTrainingGrowthRate,
  getTrainingTierMultiplier,
  TRAINING_PACE_FACTOR,
} from '@/lib/attributes';
import type { Tables } from '@/integrations/supabase/types';
import { Save, Trash2, Battery, Swords, Dumbbell, Trophy, Hourglass } from 'lucide-react';
import { formatBRTTimeOnly, isoDowInSaoPaulo } from '@/lib/upcomingMatches';
import { TrainingPlanIntroTour } from '@/components/tour/TrainingPlanIntroTour';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const SLOTS_PER_DAY = 4;
const ENERGY_COST = 25;
// energy-regen-daily applies a random 25–35% of max → average 30%.
const BASE_REGEN_PCT = 0.30;

type AttrsRow = Tables<'player_attributes'>;

interface PlanSlot {
  id?: string;
  attribute_key: string | null;
}

type WeeklyPlan = PlanSlot[][]; // [day][slot]

function emptyWeek(): WeeklyPlan {
  return Array.from({ length: 7 }, () => Array.from({ length: SLOTS_PER_DAY }, () => ({ attribute_key: null })));
}

// Local-time ISO day of week: 0 = Mon, 6 = Sun (matches DB storage + edge function).
function isoDayOfWeek(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfIsoWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const offset = isoDayOfWeek(copy);
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export default function PlayerTrainingPlanPage() {
  const { playerProfile } = useAuth();
  const { t } = useTranslation('player_training_plan');

  const [attrs, setAttrs] = useState<AttrsRow | null>(null);
  const [plan, setPlan] = useState<WeeklyPlan>(emptyWeek());
  const [originalPlan, setOriginalPlan] = useState<WeeklyPlan>(emptyWeek());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Bonuses
  const [coachType, setCoachType] = useState<string>('all_around');
  const [trainingCenterLevel, setTrainingCenterLevel] = useState(0);
  const [trainerBonus, setTrainerBonus] = useState<number>(0); // % added to growth
  const [physioBonus, setPhysioBonus] = useState<number>(0); // % added to regen
  const [hasClub, setHasClub] = useState(true);
  // Coach weekly boost — only the `training_focus` type is relevant to this
  // page (the in-match boosts don't affect training). Stored as the picked
  // category name (Físico/Técnico/Mental/Chute/Goleiro) or null.
  const [focusCategory, setFocusCategory] = useState<string | null>(null);

  // Match days for this week — set of isoDayOfWeek values (0..6).
  const [matchDayDows, setMatchDayDows] = useState<Set<number>>(new Set());
  // Detailed per-day fixture info (first match of the day, keyed by isoDayOfWeek)
  // used to surface kickoff time + opponent inline on the planner.
  interface DayMatchInfo {
    scheduled_at: string;
    opponent_name: string;
    opponent_short_name: string;
    is_home: boolean;
    source: 'league' | 'friendly';
  }
  const [matchInfoByDow, setMatchInfoByDow] = useState<Record<number, DayMatchInfo>>({});

  // Determines the display date per column (the current Mon–Sun week).
  const weekStart = useMemo(() => startOfIsoWeek(new Date()), []);
  const todayDow = isoDayOfWeek(new Date());

  useEffect(() => {
    if (!playerProfile?.id) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerProfile?.id]);

  const loadAll = async () => {
    if (!playerProfile?.id) return;
    setLoading(true);

    const [attrsRes, planRes] = await Promise.all([
      supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).maybeSingle(),
      supabase.from('training_plans').select('*').eq('player_profile_id', playerProfile.id),
    ]);

    setAttrs((attrsRes.data as AttrsRow | null) ?? null);

    const fresh = emptyWeek();
    for (const row of (planRes.data || [])) {
      const d = Number((row as any).day_of_week);
      const s = Number((row as any).slot_index);
      if (d >= 0 && d <= 6 && s >= 0 && s < SLOTS_PER_DAY) {
        fresh[d][s] = { id: (row as any).id, attribute_key: (row as any).attribute_key };
      }
    }
    setPlan(fresh);
    setOriginalPlan(fresh.map(day => day.map(slot => ({ ...slot }))));

    await loadBonuses();
    await loadMatches();
    setLoading(false);
  };

  const loadBonuses = async () => {
    if (!playerProfile) return;

    if (!playerProfile.club_id) {
      setHasClub(false);
      setCoachType('all_around');
      setTrainingCenterLevel(0);
      setFocusCategory(null);
    } else {
      setHasClub(true);
      const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', playerProfile.club_id).maybeSingle();
      if (club?.manager_profile_id) {
        const { data: mgr } = await supabase.from('manager_profiles').select('coach_type').eq('id', club.manager_profile_id).maybeSingle();
        setCoachType(mgr?.coach_type || 'all_around');
      }
      const { data: tc } = await supabase
        .from('club_facilities').select('level')
        .eq('club_id', playerProfile.club_id).eq('facility_type', 'training_center').maybeSingle();
      setTrainingCenterLevel(tc?.level || 0);

      // Weekly coach boost — only `training_focus` rows give a training bonus.
      const { data: boost } = await (supabase as any).rpc('get_active_coach_boost', { p_club_id: playerProfile.club_id });
      const row = Array.isArray(boost) && boost.length > 0 ? boost[0] : null;
      setFocusCategory(row?.boost_type === 'training_focus' ? (row.boost_param ?? null) : null);
    }

    // Private trainer + physio — same shape in store_purchases/store_items.
    const { data: purchases } = await supabase
      .from('store_purchases')
      .select('store_item_id')
      .eq('player_profile_id', playerProfile.id)
      .in('status', ['active', 'cancelling']);

    const itemIds = (purchases || []).map((p: any) => p.store_item_id);
    if (itemIds.length > 0) {
      const { data: items } = await (supabase as any)
        .from('store_items')
        .select('id, bonus_value, category')
        .in('id', itemIds);

      let bestTrainer = 0;
      let bestPhysio = 0;
      for (const it of (items || [])) {
        const bv = Number(it.bonus_value || 0);
        if (it.category === 'trainer' && bv > bestTrainer) bestTrainer = bv;
        if (it.category === 'physio' && bv > bestPhysio) bestPhysio = bv;
      }
      setTrainerBonus(bestTrainer);
      setPhysioBonus(bestPhysio);
    } else {
      setTrainerBonus(0);
      setPhysioBonus(0);
    }
  };

  const loadMatches = async () => {
    if (!playerProfile?.club_id) { setMatchDayDows(new Set()); setMatchInfoByDow({}); return; }
    const clubId = playerProfile.club_id;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // 1) Materialized matches (friendlies + already-created league games).
    const { data: materialized } = await supabase
      .from('matches')
      .select('scheduled_at, home_club_id, away_club_id, status, home_club:clubs!matches_home_club_id_fkey(name, short_name), away_club:clubs!matches_away_club_id_fkey(name, short_name)')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString())
      .in('status', ['scheduled', 'live']);

    // 2) Upcoming league fixtures for this week — may not have a `matches`
    //    row yet (created 5 min before kickoff). We pull these from
    //    league_rounds/league_matches so the planner can still show
    //    opponent + kickoff hour on the correct day column.
    const { data: leagueRows } = await supabase
      .from('league_matches')
      .select(`
        home_club_id,
        away_club_id,
        league_rounds!inner(scheduled_at),
        home_club:clubs!league_matches_home_club_id_fkey(name, short_name),
        away_club:clubs!league_matches_away_club_id_fkey(name, short_name)
      `)
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .gte('league_rounds.scheduled_at', weekStart.toISOString())
      .lt('league_rounds.scheduled_at', weekEnd.toISOString());

    const dows = new Set<number>();
    const info: Record<number, DayMatchInfo> = {};

    // Helper: pick the earliest match of the day to display.
    const record = (scheduledAt: string, isHome: boolean, opponentName: string, opponentShort: string, source: 'league' | 'friendly') => {
      const dow = isoDowInSaoPaulo(scheduledAt);
      dows.add(dow);
      const existing = info[dow];
      if (!existing || new Date(scheduledAt).getTime() < new Date(existing.scheduled_at).getTime()) {
        info[dow] = {
          scheduled_at: scheduledAt,
          opponent_name: opponentName,
          opponent_short_name: opponentShort,
          is_home: isHome,
          source,
        };
      }
    };

    for (const row of (materialized || [])) {
      const r = row as any;
      const isHome = r.home_club_id === clubId;
      const opp = isHome ? r.away_club : r.home_club;
      record(r.scheduled_at, isHome, opp?.name ?? 'Adversário', opp?.short_name ?? '?', 'friendly');
    }

    for (const row of (leagueRows || [])) {
      const r = row as any;
      const isHome = r.home_club_id === clubId;
      const opp = isHome ? r.away_club : r.home_club;
      const scheduledAt = r.league_rounds?.scheduled_at;
      if (!scheduledAt) continue;
      record(scheduledAt, isHome, opp?.name ?? 'Adversário', opp?.short_name ?? '?', 'league');
    }

    setMatchDayDows(dows);
    setMatchInfoByDow(info);
  };

  // ── Derived: set of attrs the player is allowed to plan (respects position + caps) ──
  const availableAttrs = useMemo(() => {
    if (!playerProfile || !attrs) return [] as string[];
    const isGK = playerProfile.primary_position === 'GK';
    const keys: readonly string[] = isGK ? [...GK_ATTRS, ...FIELD_ATTRS] : [...FIELD_ATTRS, ...GK_ATTRS];
    // Drop attrs already at cap — training them would be a no-op.
    return keys.filter(k => {
      const v = Number((attrs as any)[k] ?? 0);
      const cap = getAttrCap(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, k);
      return v < cap;
    });
  }, [playerProfile, attrs]);

  // ── Per-attribute growth range helper (min–max), same formula as manual training. ──
  const growthRangeFor = (attrKey: string): [number, number] | null => {
    if (!playerProfile || !attrs) return null;
    const value = Number((attrs as any)[attrKey] ?? 0);
    const cap = getAttrCap(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, attrKey);
    if (value >= cap) return null;
    const growthRate = getTrainingGrowthRate(playerProfile.age);
    const tierMult = getTrainingTierMultiplier(value);
    const coachBonus = hasClub ? getCoachBonus(coachType, attrKey) : 0;
    const tcBonus = hasClub ? getTrainingCenterBonus(trainingCenterLevel) : 0;
    const trainerBonusPct = trainerBonus / 100;
    // Weekly coach Foco de Treino: +10% when this attr's category is the chosen focus.
    const focusBonus = (focusCategory && (ATTRIBUTE_CATEGORIES[focusCategory] || []).includes(attrKey)) ? 0.10 : 0;
    const bonus = 1 + coachBonus + tcBonus + trainerBonusPct + focusBonus;
    const fitMult = getTrainingFit(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, attrKey).multiplier;
    const min = growthRate * tierMult * bonus * fitMult * TRAINING_PACE_FACTOR;
    const max = (growthRate + 0.99) * tierMult * bonus * fitMult * TRAINING_PACE_FACTOR;
    return [min, max];
  };

  // ── Fit pill classes (same palette as the Atributos page) ──
  const fitPillClasses = (fit: number): string => {
    if (fit === 2)  return 'bg-emerald-500/15 text-emerald-500';
    if (fit === 1)  return 'bg-lime-500/15 text-lime-500';
    if (fit === -1) return 'bg-orange-500/15 text-orange-500';
    if (fit === -2) return 'bg-red-500/15 text-red-500';
    return 'bg-muted text-muted-foreground';
  };

  // ── Week-long energy + training projection. Shows the manager what will happen ──
  // if the plan runs as scheduled starting from this Monday. Today's starting energy
  // uses the player's live value; future days carry the previous day's ending energy.
  const projection = useMemo(() => {
    if (!playerProfile) return null;
    const maxEnergy = playerProfile.energy_max ?? 100;
    const regenPct = BASE_REGEN_PCT + physioBonus / 100;
    // Monday start: if today IS Monday, use current energy; otherwise assume the week
    // started from current energy too (rough but the player can re-sync by editing).
    let startEnergy = Math.max(0, Math.min(maxEnergy, playerProfile.energy_current ?? maxEnergy));

    const days = plan.map((slots, dayIdx) => {
      // Regen happens at the start of each day (except day 0, where we just show
      // the current energy since that regen was already applied by the server).
      let energy = dayIdx === 0 ? startEnergy : Math.min(maxEnergy, startEnergy + Math.round(maxEnergy * regenPct));
      const afterRegen = energy;

      const slotProjection: Array<{ attr: string | null; trained: boolean; energyAfter: number; range: [number, number] | null }> = [];
      for (const slot of slots) {
        const attr = slot.attribute_key;
        if (!attr) {
          slotProjection.push({ attr: null, trained: false, energyAfter: energy, range: null });
          continue;
        }
        if (energy < ENERGY_COST) {
          slotProjection.push({ attr, trained: false, energyAfter: energy, range: growthRangeFor(attr) });
          continue;
        }
        energy -= ENERGY_COST;
        slotProjection.push({ attr, trained: true, energyAfter: energy, range: growthRangeFor(attr) });
      }

      startEnergy = energy;
      return { dayIdx, afterRegen, endOfDay: energy, slots: slotProjection };
    });
    return days;
  }, [plan, playerProfile, physioBonus, attrs, trainingCenterLevel, trainerBonus, coachType, hasClub]);

  const dirty = useMemo(() => JSON.stringify(plan) !== JSON.stringify(originalPlan), [plan, originalPlan]);

  const updateSlot = (dayIdx: number, slotIdx: number, attrKey: string | null) => {
    setPlan(prev => {
      const next = prev.map(d => d.map(s => ({ ...s })));
      next[dayIdx][slotIdx] = { ...next[dayIdx][slotIdx], attribute_key: attrKey };
      return next;
    });
  };

  const clearDay = (dayIdx: number) => {
    setPlan(prev => {
      const next = prev.map(d => d.map(s => ({ ...s })));
      next[dayIdx] = next[dayIdx].map(() => ({ attribute_key: null }));
      return next;
    });
  };

  const clearWeek = () => setPlan(emptyWeek());

  const savePlan = async () => {
    if (!playerProfile?.id) return;
    setSaving(true);
    try {
      // Replace strategy: delete all current rows for this player and insert only the filled slots.
      const filled: Array<{ player_profile_id: string; day_of_week: number; slot_index: number; attribute_key: string }> = [];
      for (let d = 0; d < 7; d++) {
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const key = plan[d][s].attribute_key;
          if (key) {
            filled.push({
              player_profile_id: playerProfile.id,
              day_of_week: d,
              slot_index: s,
              attribute_key: key,
            });
          }
        }
      }

      const { error: delErr } = await supabase
        .from('training_plans')
        .delete()
        .eq('player_profile_id', playerProfile.id);
      if (delErr) throw delErr;

      if (filled.length > 0) {
        const { error: insErr } = await supabase.from('training_plans').insert(filled);
        if (insErr) throw insErr;
      }

      setOriginalPlan(plan.map(day => day.map(slot => ({ ...slot }))));
      toast.success(t('toast.saved'));
    } catch (e: any) {
      toast.error(e?.message || t('toast.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!playerProfile || loading) {
    return <AppLayout><p className="text-muted-foreground">{t('loading')}</p></AppLayout>;
  }

  const maxEnergy = playerProfile.energy_max ?? 100;
  const regenPct = BASE_REGEN_PCT + physioBonus / 100;
  const regenLabel = t('status.regen_value', { pct: Math.round(regenPct * 100) });

  return (
    <AppLayout>
      <div className="space-y-6">
        <TrainingPlanIntroTour enabled={!loading} />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold">{t('header.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('header.subtitle', { slots: SLOTS_PER_DAY })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearWeek} className="font-display" disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('header.clear_week')}
            </Button>
            <Button
              data-tour="training-save"
              size="sm"
              onClick={savePlan}
              disabled={!dirty || saving}
              className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? t('header.saving') : dirty ? t('header.save') : t('header.saved')}
            </Button>
          </div>
        </div>

        {/* Aging / decay warning */}
        {playerProfile.age >= 32 && (() => {
          const age = playerProfile.age;
          const daysLeftToDecay = age < 33 ? 33 - age : 0;
          let tone = 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400';
          let title = t('aging.approaching_title');
          let body = t('aging.approaching_body', { seasons: daysLeftToDecay });
          if (age >= 33 && age < 36) {
            title = t('aging.mature_title', { age });
            body = t('aging.mature_body');
          } else if (age >= 36 && age < 38) {
            tone = 'bg-orange-500/10 border-orange-500/40 text-orange-700 dark:text-orange-400';
            title = t('aging.decline_title', { age });
            body = t('aging.decline_body');
          } else if (age >= 38) {
            tone = 'bg-amber-600/15 border-amber-600/50 text-amber-800 dark:text-amber-300';
            title = t('aging.veteran_title', { age });
            body = t('aging.veteran_body');
          }
          return (
            <div className={`stat-card space-y-1 border ${tone}`}>
              <h2 className="font-display font-semibold text-sm flex items-center gap-2">
                <Hourglass className="h-4 w-4" /> {title}
              </h2>
              <p className="text-xs opacity-90">{body}</p>
            </div>
          );
        })()}

        {/* Quick status bar */}
        <div data-tour="training-status" className="stat-card grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-pitch" />
            <div>
              <div className="text-muted-foreground text-xs">{t('status.current_energy')}</div>
              <div className="font-display font-bold">{playerProfile.energy_current}/{maxEnergy}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-tactical" />
            <div>
              <div className="text-muted-foreground text-xs">{t('status.daily_regen')}</div>
              <div className="font-display font-bold">{regenLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-amber-400" />
            <div>
              <div className="text-muted-foreground text-xs">{t('status.session_cost')}</div>
              <div className="font-display font-bold">{ENERGY_COST}%</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-destructive" />
            <div>
              <div className="text-muted-foreground text-xs">{t('status.weekly_matches')}</div>
              <div className="font-display font-bold">{matchDayDows.size}</div>
            </div>
          </div>
        </div>

        {/* Weekly grid */}
        <div data-tour="training-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          {DAY_KEYS.map((dayKey, dayIdx) => {
            const label = t(`days.${dayKey}`);
            const isToday = dayIdx === todayDow;
            const isMatchDay = matchDayDows.has(dayIdx);
            const daySlots = plan[dayIdx];
            const proj = projection?.[dayIdx];
            const filledCount = daySlots.filter(s => s.attribute_key).length;

            return (
              <div
                key={dayIdx}
                className={`stat-card space-y-2 ${isToday ? 'ring-2 ring-tactical/60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm">{label}</span>
                    {isToday && (
                      <span className="text-[10px] font-display font-bold uppercase px-1.5 py-0.5 rounded-full bg-tactical/20 text-tactical">
                        {t('day_card.today')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => clearDay(dayIdx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title={t('day_card.clear_day')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isMatchDay && (() => {
                  // Show the kickoff hour + opponent inline so the player
                  // can see which match is blocking their training. Works
                  // for league fixtures whose `matches` row isn't created
                  // yet (league_rounds.scheduled_at drives everything).
                  const mi = matchInfoByDow[dayIdx];
                  const isLeague = mi?.source === 'league';
                  return (
                    <div className="flex flex-col gap-1 px-2 py-1.5 rounded bg-destructive/15 text-destructive">
                      <div className="flex items-center gap-1.5 text-[11px] font-display font-bold">
                        {isLeague ? <Trophy className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
                        {mi ? t('day_card.match_day_with_time', { time: formatBRTTimeOnly(mi.scheduled_at) }) : t('day_card.match_day')}
                      </div>
                      {mi && (
                        <div className="text-[10px] leading-tight">
                          {mi.is_home
                            ? t('day_card.vs_label_home', { name: mi.opponent_name })
                            : t('day_card.vs_label_away', { name: mi.opponent_name })}
                        </div>
                      )}
                      <div className="text-[10px] leading-tight italic opacity-80">
                        {t('day_card.save_energy')}
                      </div>
                    </div>
                  );
                })()}

                {/* Energy header */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{t('day_card.after_regen')}</span>
                  <span className="font-display font-bold text-foreground">{proj?.afterRegen ?? 0}%</span>
                </div>

                <div className="space-y-1.5">
                  {daySlots.map((slot, slotIdx) => {
                    const projSlot = proj?.slots?.[slotIdx];
                    const range = projSlot?.range ?? (slot.attribute_key ? growthRangeFor(slot.attribute_key) : null);
                    return (
                      <div key={slotIdx} className="rounded-md border border-border/40 p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('day_card.slot', { n: slotIdx + 1 })}</span>
                          {slot.attribute_key && projSlot && !projSlot.trained && (
                            <span className="text-[9px] font-display font-bold text-destructive uppercase">{t('day_card.no_energy')}</span>
                          )}
                        </div>
                        <Select
                          value={slot.attribute_key || 'none'}
                          onValueChange={(v) => updateSlot(dayIdx, slotIdx, v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('day_card.no_attribute')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('day_card.no_attribute_option')}</SelectItem>
                            {availableAttrs.map(k => {
                              const value = Math.round(Number((attrs as any)?.[k] ?? 0));
                              const cap = getAttrCap(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, k);
                              return (
                                <SelectItem key={k} value={k} className="text-xs">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span>{ATTR_LABELS[k] || k}</span>
                                    <span className="text-muted-foreground tabular-nums">{value}/{cap}</span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {slot.attribute_key && (() => {
                          const fitInfo = getTrainingFit(playerProfile.archetype, playerProfile.height, playerProfile.primary_position, slot.attribute_key);
                          const pct = Math.round((fitInfo.multiplier - 1) * 100);
                          const pillText = fitInfo.fit === 0
                            ? fitInfo.label
                            : `${fitInfo.label} (${pct > 0 ? '+' : ''}${pct}%)`;
                          return (
                            <span className={`inline-flex items-center text-[9px] font-display font-semibold px-1.5 py-0.5 rounded-full ${fitPillClasses(fitInfo.fit)}`}>
                              {pillText}
                            </span>
                          );
                        })()}
                        {slot.attribute_key && range && (
                          <div className="text-[10px] text-muted-foreground">
                            {t('day_card.gain_range')}<span className="text-pitch font-bold">+{range[0].toFixed(2)}</span>
                            {t('day_card.to')}
                            <span className="text-pitch font-bold">+{range[1].toFixed(2)}</span>
                            {projSlot && (
                              <span className="ml-2">{t('day_card.energy_after')}<span className="font-bold text-foreground">{projSlot.energyAfter}%</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[11px]">
                  <span className="text-muted-foreground">{t('day_card.end_of_day')}</span>
                  <span className="font-display font-bold">
                    {t('day_card.end_summary', { pct: proj?.endOfDay ?? 0, filled: filledCount, total: SLOTS_PER_DAY })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {t('tip', { pct: Math.round(regenPct * 100) })}
        </p>
      </div>
    </AppLayout>
  );
}
