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
import { Dumbbell } from 'lucide-react';

const ENERGY_COST = 25;

export default function PlayerAttributesPage() {
  const { playerProfile, refreshPlayerProfile } = useAuth();
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [training, setTraining] = useState<string | null>(null);

  const fetchAttrs = async () => {
    if (!playerProfile) return;
    const { data } = await supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).single();
    setAttrs(data);
  };

  useEffect(() => { fetchAttrs(); }, [playerProfile]);

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

    // Check daily training limit warning
    if (playerProfile.last_trained_at) {
      const lastTrain = new Date(playerProfile.last_trained_at);
      const now = new Date();
      const hoursSince = (now.getTime() - lastTrain.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        // Allow but warn - energy will be very low
      }
    }

    setTraining(attrKey);
    const currentVal = Number((attrs as any)[attrKey]) || 0;

    // Random growth: base from growthRate, with weighted distribution
    // e.g. 1.5 rate → base range 1.50-2.49, 80% chance of 1.80-2.29
    const baseGrowth = growthRate;
    const roll = Math.random();
    let growth: number;
    if (roll < 0.10) {
      // Bottom 10%: baseGrowth to baseGrowth + 0.30
      growth = baseGrowth + Math.random() * 0.30;
    } else if (roll < 0.90) {
      // Middle 80%: baseGrowth + 0.30 to baseGrowth + 0.79
      growth = baseGrowth + 0.30 + Math.random() * 0.49;
    } else {
      // Top 10%: baseGrowth + 0.79 to baseGrowth + 0.99
      growth = baseGrowth + 0.79 + Math.random() * 0.20;
    }
    growth = Math.round(growth * 100) / 100; // 2 decimal places
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
          return (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button className="w-full text-left hover:bg-muted/50 rounded-md p-1 transition-colors cursor-pointer" disabled={training === key}>
                  <AttributeBar label={ATTR_LABELS[key] || key} value={value} />
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
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Taxa de crescimento</p>
            <p className="font-display font-bold text-tactical">{Math.round(growthRate * 100)}%</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Clique em qualquer atributo para treinar. Cada treino custa {ENERGY_COST} de energia. Treinar mais de 1x por dia reduz sua energia para o jogo.</p>
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
