import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Brain, Shield, Dumbbell, Target, Heart, Zap, Lock, Check } from 'lucide-react';

interface CoachSkill {
  skill_type: string;
  level: number;
  trained_formation: string | null;
  last_trained_at: string | null;
}

const SKILL_CONFIG: Record<string, { label: string; description: string; icon: typeof Brain; bonusLabel: string }> = {
  tactics: {
    label: 'Tática',
    description: 'Reduz penalização de jogador fora de posição.',
    icon: Brain,
    bonusLabel: '-1.4% penalidade/nível',
  },
  formation: {
    label: 'Formação',
    description: 'Bônus de atributos ao usar a formação treinada.',
    icon: Target,
    bonusLabel: '+1% atributos/nível',
  },
  fitness: {
    label: 'Preparação Física',
    description: 'Reduz perda de stamina por turno.',
    icon: Dumbbell,
    bonusLabel: '-1% stamina/nível',
  },
  set_piece: {
    label: 'Bola Parada',
    description: 'Melhora precisão em cobranças (falta, escanteio, pênalti).',
    icon: Target,
    bonusLabel: '-2% desvio/nível',
  },
  mentality: {
    label: 'Mentalidade',
    description: 'Bônus em atributos mentais quando perdendo.',
    icon: Heart,
    bonusLabel: '+1% mentais/nível',
  },
  high_press: {
    label: 'Pressão Alta',
    description: 'Aumenta chance de roubar a bola.',
    icon: Zap,
    bonusLabel: '+1% roubo/nível',
  },
};

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '4-5-1', '3-4-3', '5-3-2', '5-4-1'];

export default function ManagerCoachPage() {
  const { club } = useAuth();
  const [skills, setSkills] = useState<CoachSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [selectedFormation, setSelectedFormation] = useState('4-4-2');

  const canTrainThisWeek = !skills.some(s =>
    s.last_trained_at && new Date(s.last_trained_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  const nextTrainDate = (() => {
    const lastTrained = skills
      .filter(s => s.last_trained_at)
      .map(s => new Date(s.last_trained_at!).getTime())
      .sort((a, b) => b - a)[0];
    if (!lastTrained) return null;
    return new Date(lastTrained + 7 * 24 * 60 * 60 * 1000);
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

  const handleTrain = async (skillType: string) => {
    if (!club || training) return;
    setTraining(true);
    try {
      const { error } = await supabase.rpc('train_coach_skill', {
        p_club_id: club.id,
        p_skill_type: skillType,
        p_formation: skillType === 'formation' ? selectedFormation : null,
      });
      if (error) throw error;
      toast.success(`Treino de ${SKILL_CONFIG[skillType]?.label || skillType} realizado!`);
      // Reload
      const { data } = await supabase
        .from('coach_training')
        .select('skill_type, level, trained_formation, last_trained_at')
        .eq('club_id', club.id);
      setSkills(data || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao treinar');
    } finally {
      setTraining(false);
    }
  };

  if (!club) return null;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Treinamento do Técnico</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Treine uma habilidade por semana para melhorar o desempenho do time.
          </p>
        </div>

        {!canTrainThisWeek && nextTrainDate && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-400 font-display font-semibold">
              Treino semanal já realizado. Próximo disponível: {nextTrainDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(SKILL_CONFIG).map(([key, config]) => {
            const skill = skills.find(s => s.skill_type === key);
            const level = skill?.level || 0;
            const isMaxed = level >= 5;
            const Icon = config.icon;

            return (
              <div key={key} className="stat-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-tactical" />
                    <span className="font-display font-bold text-sm">{config.label}</span>
                  </div>
                  <span className="font-display font-bold text-lg text-tactical">
                    {level}/5
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">{config.description}</p>

                {/* Level bar */}
                <div className="flex gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full ${i < level ? 'bg-tactical' : 'bg-muted/30'}`} />
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground font-display">{config.bonusLabel}</p>

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
                  <p className="text-[10px] text-pitch">Formação treinada: {skill.trained_formation}</p>
                )}

                <button
                  onClick={() => handleTrain(key)}
                  disabled={!canTrainThisWeek || isMaxed || training || loading}
                  className="w-full py-2 text-xs font-display font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-tactical/20 text-tactical hover:bg-tactical/30 flex items-center justify-center gap-1.5"
                >
                  {isMaxed ? (
                    <><Check className="h-3.5 w-3.5" /> Nível Máximo</>
                  ) : !canTrainThisWeek ? (
                    <><Lock className="h-3.5 w-3.5" /> Aguardando</>
                  ) : (
                    <>Treinar Nível {level + 1}</>
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
