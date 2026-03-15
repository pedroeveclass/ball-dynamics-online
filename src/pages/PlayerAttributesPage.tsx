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

const ENERGY_COST = 10;
const BASE_GROWTH = 1;

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

    setTraining(attrKey);
    const currentVal = (attrs as any)[attrKey] as number;
    const growth = Math.max(1, Math.round(BASE_GROWTH * growthRate));
    const newVal = Math.min(99, currentVal + growth);

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

    // Deduct energy
    const newEnergy = playerProfile.energy_current - ENERGY_COST;
    await supabase
      .from('player_profiles')
      .update({ energy_current: newEnergy })
      .eq('id', playerProfile.id);

    // Recalculate overall
    const updatedAttrs = { ...attrs, [attrKey]: newVal } as any;
    const attrRecord: Record<string, number> = {};
    for (const k of [...FIELD_ATTRS, ...GK_ATTRS]) {
      attrRecord[k] = updatedAttrs[k];
    }
    const newOverall = calculateOverall(attrRecord, playerProfile.primary_position);
    await supabase.from('player_profiles').update({ overall: newOverall }).eq('id', playerProfile.id);

    await fetchAttrs();
    await refreshPlayerProfile();
    toast.success(`${ATTR_LABELS[attrKey] || attrKey} +${growth}!`);
    setTraining(null);
  };

  const renderSection = (title: string, keys: readonly string[]) => (
    <div className="stat-card">
      <h2 className="font-display text-lg font-bold mb-4">{title}</h2>
      <div className="space-y-2">
        {keys.map(key => {
          const value = (attrs as any)[key] as number;
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
                    Atual: <span className="font-bold text-foreground">{value}</span> → <span className="font-bold text-pitch">{Math.min(99, value + Math.max(1, Math.round(BASE_GROWTH * growthRate)))}</span>
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
        <p className="text-xs text-muted-foreground">Clique em qualquer atributo para treinar. Cada treino custa {ENERGY_COST} de energia.</p>
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
