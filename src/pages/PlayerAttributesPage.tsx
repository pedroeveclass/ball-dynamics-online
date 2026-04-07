import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FIELD_ATTRS, GK_ATTRS, ATTR_LABELS, getTrainingGrowthRate, calculateOverall, getAttributeTier, getTrainingTierMultiplier, getCoachBonus, getTrainingCenterBonus, COACH_TYPE_LABELS, COACH_BONUS_ATTRS, COACH_BONUS_RATE, TRAINING_CENTER_BONUS } from '@/lib/attributes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { Dumbbell, TrendingUp, History, ArrowUp, Shield, Swords, Wrench, Star, Building2, ChevronDown, ChevronUp, Info, GraduationCap } from 'lucide-react';

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
  const [coachType, setCoachType] = useState<string>('all_around');
  const [trainingCenterLevel, setTrainingCenterLevel] = useState<number>(0);
  const [showBonusInfo, setShowBonusInfo] = useState(false);
  const [hasClub, setHasClub] = useState<boolean>(true);
  const [trainerBonus, setTrainerBonus] = useState<{ level: number; value: number } | null>(null);

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

  useEffect(() => { fetchAttrs(); fetchHistory(); fetchTrainingBonuses(); }, [playerProfile]);

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

    // Tier-based training multiplier
    const tierMultiplier = getTrainingTierMultiplier(currentVal);

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
    // Apply tier multiplier
    growth = growth * tierMultiplier;
    // Apply coach, training center, and private trainer bonuses
    const coachBonusValue = hasClub ? getCoachBonus(coachType, attrKey) : 0;
    const tcBonusValue = hasClub ? getTrainingCenterBonus(trainingCenterLevel) : 0;
    const trainerBonusValue = trainerBonus ? trainerBonus.value / 100 : 0;
    growth = growth * (1 + coachBonusValue + tcBonusValue + trainerBonusValue);
    growth = Math.round(growth * 100) / 100;
    const newVal = Math.min(99, Math.round((currentVal + growth) * 100) / 100);

    const { error: attrError } = await supabase
      .from('player_attributes')
      .update({ [attrKey]: newVal })
      .eq('player_profile_id', playerProfile.id);

    if (attrError) {
      toast.error('Erro ao treinar.');
      setTraining(null);
      return;
    }

    await supabase.from('training_history').insert({
      player_profile_id: playerProfile.id,
      attribute_key: attrKey,
      old_value: currentVal,
      new_value: newVal,
      growth,
    });

    const newEnergy = playerProfile.energy_current - ENERGY_COST;
    await supabase
      .from('player_profiles')
      .update({ energy_current: newEnergy, last_trained_at: new Date().toISOString() })
      .eq('id', playerProfile.id);

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

    const tier = getAttributeTier(newVal);
    toast.success(`${ATTR_LABELS[attrKey] || attrKey} +${growth.toFixed(2)}! (${tier.label})`);
    setTraining(null);
  };

  const renderSection = (title: string, keys: readonly string[]) => (
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
          const effectiveGrowthMin = (growthRate * tierMult * bonusFactor).toFixed(2);
          const effectiveGrowthMax = ((growthRate + 0.99) * tierMult * bonusFactor).toFixed(2);
          return (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button className="w-full text-left hover:bg-muted/50 rounded-md p-1 transition-colors cursor-pointer" disabled={training === key}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <AttributeBar label={ATTR_LABELS[key] || key} value={value} showTier />
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
              <PopoverContent className="w-72">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-tactical" />
                    <span className="font-display font-bold text-sm">Treinar {ATTR_LABELS[key] || key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-display font-semibold px-2 py-0.5 rounded-full ${tier.bgColor} ${tier.color}`}>
                      {tier.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Atual: <span className="font-bold text-foreground">{value.toFixed(2)}</span> → Ganho estimado: <span className="font-bold text-pitch">~{effectiveGrowthMin} - {effectiveGrowthMax}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Custo: {ENERGY_COST} energia</p>
                  {tierMult < 1 && (
                    <p className="text-xs text-warning">Crescimento reduzido pelo nível do atributo ({Math.round(tierMult * 100)}%)</p>
                  )}
                  {tierMult > 1 && (
                    <p className="text-xs text-pitch">Bônus de crescimento por atributo baixo ({Math.round(tierMult * 100)}%)</p>
                  )}
                  {playerProfile.age >= 30 && (
                    <p className="text-xs text-warning">Crescimento reduzido pela idade ({Math.round(growthRate * 100)}%)</p>
                  )}
                  {hasClub && attrCoachBonus > 0 && (
                    <p className="text-xs text-blue-400">Bônus Treinador {COACH_TYPE_LABELS[coachType] || coachType}: +{Math.round(attrCoachBonus * 100)}%</p>
                  )}
                  {hasClub && attrTcBonus > 0 && (
                    <p className="text-xs text-amber-400">Bônus Centro de Treino (Nv.{trainingCenterLevel}): +{Math.round(attrTcBonus * 100)}%</p>
                  )}
                  {attrTrainerBonus > 0 && (
                    <p className="text-xs text-green-400">Bônus Treinador Particular (Nv.{trainerBonus?.level}): +{Math.round(attrTrainerBonus * 100)}%</p>
                  )}
                  {!hasClub && (
                    <p className="text-xs text-muted-foreground">Sem clube — sem bônus de treino</p>
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
          Clique em qualquer atributo para treinar. Cada treino custa {ENERGY_COST} de energia. Atributos mais altos crescem mais devagar.
          {Object.keys(weeklyEvolution).length > 0 && <span className="text-pitch"> Setas verdes indicam evolução na última semana.</span>}
        </p>

        {/* Training Bonuses Info Card */}
        <div className="stat-card">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setShowBonusInfo(!showBonusInfo)}
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Bônus de Treino</span>
            </div>
            {showBonusInfo ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showBonusInfo && (
            <div className="mt-3 space-y-2">
              {!hasClub ? (
                <p className="text-sm text-muted-foreground">Sem clube — sem bônus de treino</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Taxa Base (idade):</span>
                    <span className="font-display font-bold text-foreground">{Math.round(growthRate * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {coachType === 'defensive' && <Shield className="h-4 w-4 text-blue-400" />}
                    {coachType === 'offensive' && <Swords className="h-4 w-4 text-red-400" />}
                    {coachType === 'technical' && <Wrench className="h-4 w-4 text-cyan-400" />}
                    {(coachType === 'all_around' || coachType === 'complete') && <Star className="h-4 w-4 text-yellow-400" />}
                    <span className="text-muted-foreground">Bônus Treinador ({COACH_TYPE_LABELS[coachType] || 'Completo'}):</span>
                    <span className="font-display font-bold text-blue-400">+{Math.round((COACH_BONUS_RATE[coachType] || 0.10) * 100)}%</span>
                  </div>
                  {coachType !== 'all_around' && coachType !== 'complete' && COACH_BONUS_ATTRS[coachType] && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Atributos: {COACH_BONUS_ATTRS[coachType].map(a => ATTR_LABELS[a] || a).join(', ')}
                    </p>
                  )}
                  {(coachType === 'all_around' || coachType === 'complete') && (
                    <p className="text-xs text-muted-foreground ml-6">Aplica a todos os atributos</p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-amber-400" />
                    <span className="text-muted-foreground">Bônus Centro de Treino (Nv.{trainingCenterLevel}):</span>
                    <span className="font-display font-bold text-amber-400">+{Math.round(getTrainingCenterBonus(trainingCenterLevel) * 100)}%</span>
                  </div>
                  {trainerBonus && (
                    <div className="flex items-center gap-2 text-sm">
                      <GraduationCap className="h-4 w-4 text-green-400" />
                      <span className="text-muted-foreground">Bônus Treinador Particular (Nv.{trainerBonus.level}):</span>
                      <span className="font-display font-bold text-green-400">+{trainerBonus.value}%</span>
                    </div>
                  )}
                  <div className="border-t border-muted pt-2 flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-pitch" />
                    <span className="text-muted-foreground">Bônus combinado máximo:</span>
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
