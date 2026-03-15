import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FIELD_ATTRS, GK_ATTRS, ATTR_LABELS, getTrainingGrowthRate, calculateOverall } from '@/lib/attributes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { Dumbbell, TrendingUp, History, ArrowUp } from 'lucide-react';

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
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [training, setTraining] = useState<string | null>(null);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Calculate weekly evolution per attribute
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

  useEffect(() => { fetchAttrs(); fetchHistory(); }, [playerProfile]);

  if (!playerProfile || !attrs) {
    return <AppLayout><p className="text-muted-foreground">Carregando atributos...</p></AppLayout>;
  }

  const isGK = playerProfile.primary_position === 'GK';
  const growthRate = getTrainingGrowthRate(playerProfile.age);

  const handleTrain = async (attrKey: string) => {
    if (playerProfile.energy_current < ENERGY_COST) {
      toast.error('Energia insuficiente para treinar.');
      return;
    }

    setTraining(attrKey);
    const currentVal = Number((attrs as any)[attrKey]) || 0;

    const baseGrowth = growthRate;
    const roll = Math.random();
    let growth: number;
    if (roll < 0.10) {
      growth = baseGrowth + Math.random() * 0.30;
    } else if (roll < 0.90) {
      growth = baseGrowth + 0.30 + Math.random() * 0.49;
    } else {
      growth = baseGrowth + 0.79 + Math.random() * 0.20;
    }
    growth = Math.round(growth * 100) / 100;
    const newVal = Math.min(99, Math.round((currentVal + growth) * 100) / 100);

    // Update attribute
    const { error: attrError } = await supabase
      .from('player_attributes')
      .update({ [attrKey]: newVal })
      .eq('player_profile_id', playerProfile.id);

    if (attrError) {
      toast.error('Erro ao treinar.');
      setTraining(null);
      return;
    }

    // Save training history
    await supabase.from('training_history').insert({
      player_profile_id: playerProfile.id,
      attribute_key: attrKey,
      old_value: currentVal,
      new_value: newVal,
      growth,
    });

    // Deduct energy and update last_trained_at
    const newEnergy = playerProfile.energy_current - ENERGY_COST;
    await supabase
      .from('player_profiles')
      .update({ energy_current: newEnergy, last_trained_at: new Date().toISOString() })
      .eq('id', playerProfile.id);

    // Recalculate overall
    const updatedAttrs = { ...attrs, [attrKey]: newVal } as any;
    const attrRecord: Record<string, number> = {};
    for (const k of [...FIELD_ATTRS, ...GK_ATTRS]) {
      attrRecord[k] = Number(updatedAttrs[k]) || 0;
    }
    const newOverall = calculateOverall(attrRecord, playerProfile.primary_position);
    await supabase.from('player_profiles').update({ overall: newOverall }).eq('id', playerProfile.id);

    await fetchAttrs();
    await fetchHistory();
    await refreshPlayerProfile();
    toast.success(`${ATTR_LABELS[attrKey] || attrKey} +${growth.toFixed(2)}!`);
    setTraining(null);
  };

  const renderSection = (title: string, keys: readonly string[]) => (
    <div className="stat-card">
      <h2 className="font-display text-lg font-bold mb-4">{title}</h2>
      <div className="space-y-2">
        {keys.map(key => {
          const value = Number((attrs as any)[key]) || 0;
          const evo = weeklyEvolution[key];
          return (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button className="w-full text-left hover:bg-muted/50 rounded-md p-1 transition-colors cursor-pointer" disabled={training === key}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <AttributeBar label={ATTR_LABELS[key] || key} value={value} />
                    </div>
                    {evo && evo > 0 && (
                      <span className="flex items-center text-xs text-pitch font-display font-bold gap-0.5 shrink-0">
                        <ArrowUp className="h-3 w-3" />
                        +{evo.toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-tactical" />
                    <span className="font-display font-bold text-sm">Treinar {ATTR_LABELS[key] || key}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Atual: <span className="font-bold text-foreground">{value.toFixed(2)}</span> → Ganho estimado: <span className="font-bold text-pitch">~{growthRate.toFixed(2)} - {(growthRate + 0.99).toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Custo: {ENERGY_COST} energia</p>
                  {playerProfile.age >= 30 && (
                    <p className="text-xs text-warning">Crescimento reduzido pela idade ({Math.round(growthRate * 100)}%)</p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleTrain(key)}
                    disabled={training !== null || playerProfile.energy_current < ENERGY_COST}
                    className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
                  >
                    {training === key ? 'Treinando...' : 'Confirmar Treino'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );

  const physicalKeys = ['velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina'] as const;
  const technicalKeys = ['drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto'] as const;
  const mentalKeys = ['visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem','posicionamento_ofensivo','posicionamento_defensivo'] as const;
  const shootingKeys = ['cabeceio','acuracia_chute','forca_chute'] as const;
  const gkKeys = ['reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um','distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area'] as const;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Atributos & Treino</h1>
            <p className="text-sm text-muted-foreground">{playerProfile.full_name} • OVR {playerProfile.overall} • Energia {playerProfile.energy_current}/{playerProfile.energy_max}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Taxa de crescimento</p>
              <p className="font-display font-bold text-tactical">{Math.round(growthRate * 100)}%</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="font-display">
              <History className="h-4 w-4 mr-1" />
              Histórico
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Clique em qualquer atributo para treinar. Cada treino custa {ENERGY_COST} de energia.
          {Object.keys(weeklyEvolution).length > 0 && <span className="text-pitch"> Setas verdes indicam evolução na última semana.</span>}
        </p>

        {/* Training History */}
        {showHistory && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Histórico de Treinos</span>
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
                      <span className="text-muted-foreground">{new Date(h.trained_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum treino registrado ainda.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isGK ? (
            <>
              {renderSection('Goleiro', gkKeys)}
              {renderSection('Físico', physicalKeys)}
              {renderSection('Técnico', technicalKeys)}
              {renderSection('Mental', mentalKeys)}
              {renderSection('Chute', shootingKeys)}
            </>
          ) : (
            <>
              {renderSection('Físico', physicalKeys)}
              {renderSection('Técnico', technicalKeys)}
              {renderSection('Mental', mentalKeys)}
              {renderSection('Chute', shootingKeys)}
              {renderSection('Goleiro', gkKeys)}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
