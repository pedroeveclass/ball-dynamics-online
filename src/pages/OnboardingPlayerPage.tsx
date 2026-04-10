import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateBaseAttributes, calculateOverall, POSITIONS, BODY_TYPES, GK_BODY_TYPES, HEIGHT_OPTIONS, FIELD_ATTRS, GK_ATTRS, ATTR_LABELS } from '@/lib/attributes';
// Note: generateBaseAttributes and calculateOverall still used for client-side preview
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, MapPin, Shield, Eye, Dumbbell, Ruler } from 'lucide-react';
import { AttributeBar } from '@/components/AttributeBar';
import { positionToPT } from '@/lib/positions';

const STEPS = ['Identidade', 'Posição', 'Tamanho', 'Tipo Físico', 'Atributos', 'Revisão'];
const STEP_ICONS = [User, MapPin, Ruler, Shield, Dumbbell, Eye];

export default function OnboardingPlayerPage() {
  const { user, refreshPlayerProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [dominantFoot, setDominantFoot] = useState<'right' | 'left'>('right');
  const [primaryPosition, setPrimaryPosition] = useState('');
  const [height, setHeight] = useState('Médio');
  const [bodyType, setBodyType] = useState('');

  // Attribute distribution
  const [extraPoints, setExtraPoints] = useState<Record<string, number>>({});
  const TOTAL_DISTRIBUTE = 40;

  const isGK = primaryPosition === 'GK';
  const availableBodyTypes = isGK ? GK_BODY_TYPES : BODY_TYPES;

  const baseAttrs = useMemo(() => {
    if (!primaryPosition || !bodyType) return null;
    return generateBaseAttributes(primaryPosition, bodyType, 18, height);
  }, [primaryPosition, bodyType, height]);

  const spentPoints = Object.values(extraPoints).reduce((a, b) => a + b, 0);
  const remainingPoints = TOTAL_DISTRIBUTE - spentPoints;

  const finalAttrs = useMemo(() => {
    if (!baseAttrs) return null;
    const result = { ...baseAttrs };
    for (const [key, val] of Object.entries(extraPoints)) {
      result[key] = Math.min(75, (result[key] || 30) + val);
    }
    return result;
  }, [baseAttrs, extraPoints]);

  const addPoint = (key: string) => {
    if (remainingPoints <= 0) return;
    setExtraPoints(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  const removePoint = (key: string) => {
    if (!extraPoints[key] || extraPoints[key] <= 0) return;
    setExtraPoints(prev => ({ ...prev, [key]: prev[key] - 1 }));
  };

  const canNext = () => {
    if (step === 0) return fullName.trim().length >= 2;
    if (step === 1) return !!primaryPosition;
    if (step === 2) return !!height;
    if (step === 3) return !!bodyType;
    if (step === 4) return remainingPoints === 0;
    return true;
  };

  const handleSubmit = async () => {
    if (!user || !finalAttrs) return;
    setSubmitting(true);

    try {
      // Build extra_points: only keys with value > 0
      const extra: Record<string, number> = {};
      for (const [key, val] of Object.entries(extraPoints)) {
        if (val > 0) extra[key] = val;
      }

      const { data, error } = await supabase.rpc('create_player_profile', {
        p_full_name: fullName.trim(),
        p_dominant_foot: dominantFoot,
        p_primary_position: primaryPosition,
        p_height: height,
        p_body_type: bodyType,
        p_extra_points: extra,
      });

      if (error) throw error;

      await refreshPlayerProfile();
      toast.success('Atleta criado com sucesso!');
      navigate('/player', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar atleta');
    } finally {
      setSubmitting(false);
    }
  };

  const posLabel = POSITIONS.find(p => p.value === primaryPosition)?.label || '';
  const bodyLabel = [...BODY_TYPES, ...GK_BODY_TYPES].find(b => b.value === bodyType)?.label || '';
  const heightLabel = HEIGHT_OPTIONS.find(h => h.value === height)?.label || height;

  const distributableAttrs = isGK ? [...GK_ATTRS, ...FIELD_ATTRS] : [...FIELD_ATTRS, ...GK_ATTRS];

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">CRIAR ATLETA</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">Dê vida ao seu jogador</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-display font-semibold transition-colors ${
                  i === step ? 'bg-tactical text-tactical-foreground' :
                  i < step ? 'bg-pitch/20 text-pitch' : 'bg-primary-foreground/10 text-primary-foreground/40'
                }`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < step ? 'bg-pitch/40' : 'bg-primary-foreground/10'}`} />}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-lg bg-card p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Step 0: Identity */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Jogador</Label>
                <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ex: Carlos Mendes" maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label>Idade</Label>
                <p className="text-sm text-muted-foreground">Seu atleta começa com <span className="font-bold text-foreground">18 anos</span>.</p>
                <p className="text-xs text-muted-foreground">Idades maiores estarão disponíveis com créditos do jogo.</p>
              </div>
              <div className="space-y-2">
                <Label>Pé Dominante</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([['right', 'Direito'], ['left', 'Esquerdo']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setDominantFoot(val)}
                      className={`px-3 py-2 rounded-md text-sm font-display font-semibold border transition-colors ${
                        dominantFoot === val
                          ? 'border-tactical bg-tactical/10 text-tactical'
                          : 'border-border text-muted-foreground hover:border-tactical/40'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Position */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Posição Principal</Label>
                <p className="text-xs text-muted-foreground">Posição secundária pode ser desbloqueada com créditos do jogo.</p>
                <div className="grid grid-cols-2 gap-2">
                  {POSITIONS.map(pos => (
                    <button
                      key={pos.value}
                      onClick={() => { setPrimaryPosition(pos.value); setBodyType(''); setExtraPoints({}); }}
                      className={`px-3 py-3 rounded-md text-sm font-display font-semibold border transition-colors text-left ${
                        primaryPosition === pos.value
                          ? 'border-tactical bg-tactical/10 text-tactical'
                          : 'border-border text-muted-foreground hover:border-tactical/40'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground">{positionToPT(pos.value)}</span>
                      <br />
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Height */}
          {step === 2 && (
            <div className="space-y-4">
              <Label>Tamanho do Jogador</Label>
              <p className="text-xs text-muted-foreground">O tamanho impacta diretamente nos atributos físicos e aéreos.</p>
              <div className="space-y-2">
                {HEIGHT_OPTIONS.map(h => (
                  <button
                    key={h.value}
                    onClick={() => { setHeight(h.value); setExtraPoints({}); }}
                    className={`w-full px-4 py-4 rounded-md border text-left transition-colors ${
                      height === h.value
                        ? 'border-tactical bg-tactical/10'
                        : 'border-border hover:border-tactical/40'
                    }`}
                  >
                    <span className={`font-display text-lg font-bold ${height === h.value ? 'text-tactical' : 'text-foreground'}`}>
                      {h.label}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Body Type */}
          {step === 3 && (
            <div className="space-y-4">
              <Label>Tipo Físico</Label>
              {isGK && <p className="text-xs text-muted-foreground">Tipos físicos específicos para goleiro.</p>}
              <div className="space-y-2">
                {availableBodyTypes.map(bt => (
                  <button
                    key={bt.value}
                    onClick={() => { setBodyType(bt.value); setExtraPoints({}); }}
                    className={`w-full px-4 py-4 rounded-md border text-left transition-colors ${
                      bodyType === bt.value
                        ? 'border-tactical bg-tactical/10'
                        : 'border-border hover:border-tactical/40'
                    }`}
                  >
                    <span className={`font-display text-lg font-bold ${bodyType === bt.value ? 'text-tactical' : 'text-foreground'}`}>
                      {bt.label}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{bt.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Distribute Points */}
          {step === 4 && baseAttrs && finalAttrs && (() => {
            const physicalKeys = ['velocidade','aceleracao','agilidade','forca','equilibrio','resistencia','pulo','stamina'] as const;
            const technicalKeys = ['drible','controle_bola','marcacao','desarme','um_toque','curva','passe_baixo','passe_alto'] as const;
            const mentalKeys = ['visao_jogo','tomada_decisao','antecipacao','trabalho_equipe','coragem','posicionamento_ofensivo','posicionamento_defensivo'] as const;
            const shootingKeys = ['cabeceio','acuracia_chute','forca_chute'] as const;
            const gkKeys = ['reflexo','posicionamento_gol','defesa_aerea','pegada','saida_gol','um_contra_um','distribuicao_curta','distribuicao_longa','tempo_reacao','comando_area'] as const;

            const sections = isGK
              ? [{ title: 'Goleiro', keys: gkKeys }, { title: 'Físico', keys: physicalKeys }, { title: 'Técnico', keys: technicalKeys }, { title: 'Mental', keys: mentalKeys }, { title: 'Chute', keys: shootingKeys }]
              : [{ title: 'Físico', keys: physicalKeys }, { title: 'Técnico', keys: technicalKeys }, { title: 'Mental', keys: mentalKeys }, { title: 'Chute', keys: shootingKeys }, { title: 'Goleiro', keys: gkKeys }];

            const renderAttrRow = (key: string) => {
              const base = baseAttrs[key] || 10;
              const extra = extraPoints[key] || 0;
              const total = finalAttrs[key] || base;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 truncate">{ATTR_LABELS[key] || key}</span>
                  <div className="flex-1">
                    <AttributeBar label="" value={total} />
                  </div>
                  <span className="font-display text-sm font-bold w-8 text-right">{total.toFixed(2)}</span>
                  {extra > 0 && <span className="text-xs text-pitch">+{extra}</span>}
                  <button
                    onClick={() => removePoint(key)}
                    disabled={extra <= 0}
                    className="h-6 w-6 rounded bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 text-xs font-bold"
                  >−</button>
                  <button
                    onClick={() => addPoint(key)}
                    disabled={remainingPoints <= 0}
                    className="h-6 w-6 rounded bg-muted text-muted-foreground hover:bg-pitch/20 hover:text-pitch disabled:opacity-30 text-xs font-bold"
                  >+</button>
                </div>
              );
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Distribua seus pontos</Label>
                  <span className={`font-display text-lg font-bold ${remainingPoints === 0 ? 'text-pitch' : 'text-tactical'}`}>
                    {remainingPoints} pts restantes
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Clique em + para adicionar pontos ou - para remover.</p>
                <div className="space-y-5">
                  {sections.map(section => (
                    <div key={section.title}>
                      <h3 className="font-display text-sm font-bold text-foreground mb-2 border-b border-border pb-1">{section.title}</h3>
                      <div className="space-y-1.5">
                        {section.keys.map(k => renderAttrRow(k))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">Confirmar Criação</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card"><span className="text-muted-foreground text-xs">Nome</span><p className="font-display font-bold">{fullName}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Idade</span><p className="font-display font-bold">18 anos</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Pé</span><p className="font-display font-bold">{dominantFoot === 'right' ? 'Direito' : 'Esquerdo'}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Posição</span><p className="font-display font-bold">{posLabel}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Tamanho</span><p className="font-display font-bold">{heightLabel}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Tipo Físico</span><p className="font-display font-bold">{bodyLabel}</p></div>
              </div>
              {finalAttrs && (
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Overall estimado</span>
                  <p className="font-display text-3xl font-extrabold text-tactical">{calculateOverall(finalAttrs, primaryPosition)}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Você começa como agente livre com 18 anos.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            ) : <div />}

            {step < 5 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
                {submitting ? 'Criando...' : <><Check className="h-4 w-4 mr-1" /> Criar Atleta</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
