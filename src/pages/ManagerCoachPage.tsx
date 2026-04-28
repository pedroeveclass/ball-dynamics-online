import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Brain, Dumbbell, Target, Heart, Zap, Lock, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';

interface CoachSkill {
  skill_type: string;
  level: number;
  trained_formation: string | null;
  last_trained_at: string | null;
}

const SKILL_KEYS = ['tactics', 'formation', 'fitness', 'set_piece', 'mentality', 'high_press'] as const;
type SkillKey = typeof SKILL_KEYS[number];

const SKILL_ICON: Record<SkillKey, typeof Brain> = {
  tactics: Brain,
  formation: Target,
  fitness: Dumbbell,
  set_piece: Target,
  mentality: Heart,
  high_press: Zap,
};

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '4-5-1', '3-4-3', '5-3-2', '5-4-1'];

export default function ManagerCoachPage() {
  const { club } = useAuth();
  const { t } = useTranslation('coach');
  const { current: lang } = useAppLanguage();
  const [skills, setSkills] = useState<CoachSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [selectedFormation, setSelectedFormation] = useState('4-4-2');

  // ISO-week (Monday 00:00 → Sunday 23:59:59) in São Paulo time.
  const spWeekKey = (d: Date) => {
    const spString = d.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', hour12: false });
    const [datePart, timePart] = spString.split(', ');
    const [y, m, day] = datePart.split('-').map(Number);
    const [h, mi, s] = (timePart || '0:0:0').split(':').map(Number);
    const spDate = new Date(Date.UTC(y, m - 1, day, h, mi, s));
    const dow = (spDate.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(spDate.getUTCFullYear(), spDate.getUTCMonth(), spDate.getUTCDate() - dow));
    return monday.getTime();
  };

  const currentWeek = spWeekKey(new Date());
  const canTrainThisWeek = !skills.some(s =>
    s.last_trained_at && spWeekKey(new Date(s.last_trained_at)) === currentWeek
  );

  const nextTrainDate = (() => {
    if (canTrainThisWeek) return null;
    const nowSp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dow = (nowSp.getDay() + 6) % 7;
    const daysUntilNextMonday = 7 - dow;
    const nextMondaySp = new Date(nowSp);
    nextMondaySp.setDate(nowSp.getDate() + daysUntilNextMonday);
    nextMondaySp.setHours(0, 0, 0, 0);
    return nextMondaySp;
  })();

  useEffect(() => {
    if (!club) return;
    const load = async () => {
      const { data } = await supabase
        .from('coach_training')
        .select('skill_type, level, trained_formation, last_trained_at')
        .eq('club_id', club.id);
      setSkills(data || []);
      setLoading(false);
    };
    load();
  }, [club]);

  const handleTrain = async (skillType: SkillKey) => {
    if (!club || training) return;
    setTraining(true);
    try {
      const { error } = await supabase.rpc('train_coach_skill', {
        p_club_id: club.id,
        p_skill_type: skillType,
        p_formation: skillType === 'formation' ? selectedFormation : null,
      });
      if (error) throw error;
      toast.success(t('toast.trained_ok', { skill: t(`skills.${skillType}.label`) }));
      const { data } = await supabase
        .from('coach_training')
        .select('skill_type, level, trained_formation, last_trained_at')
        .eq('club_id', club.id);
      setSkills(data || []);
    } catch (err: any) {
      toast.error(err.message || t('toast.error'));
    } finally {
      setTraining(false);
    }
  };

  if (!club) return null;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {!canTrainThisWeek && nextTrainDate && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-400 font-display font-semibold">
              {t('trained_this_week', { date: formatDate(nextTrainDate, lang, 'date_short') })}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SKILL_KEYS.map(key => {
            const skill = skills.find(s => s.skill_type === key);
            const level = skill?.level || 0;
            const isMaxed = level >= 10;
            const Icon = SKILL_ICON[key];

            return (
              <div key={key} className="stat-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-tactical" />
                    <span className="font-display font-bold text-sm">{t(`skills.${key}.label`)}</span>
                  </div>
                  <span className="font-display font-bold text-lg text-tactical">
                    {level}/10
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">{t(`skills.${key}.description`)}</p>

                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full ${i < level ? 'bg-tactical' : 'bg-muted/30'}`} />
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground font-display">{t(`skills.${key}.bonus`)}</p>

                {key === 'formation' && (
                  <select
                    value={skill?.trained_formation || selectedFormation}
                    onChange={(e) => setSelectedFormation(e.target.value)}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1"
                    disabled={!canTrainThisWeek || isMaxed}
                  >
                    {FORMATIONS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}

                {skill?.trained_formation && key === 'formation' && (
                  <p className="text-[10px] text-pitch">{t('trained_formation_label', { formation: skill.trained_formation })}</p>
                )}

                <button
                  onClick={() => handleTrain(key)}
                  disabled={!canTrainThisWeek || isMaxed || training || loading}
                  className="w-full py-2 text-xs font-display font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-tactical/20 text-tactical hover:bg-tactical/30 flex items-center justify-center gap-1.5"
                >
                  {isMaxed ? (
                    <><Check className="h-3.5 w-3.5" /> {t('buttons.max_level')}</>
                  ) : !canTrainThisWeek ? (
                    <><Lock className="h-3.5 w-3.5" /> {t('buttons.waiting')}</>
                  ) : (
                    <>{t('buttons.train_level', { level: level + 1 })}</>
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
