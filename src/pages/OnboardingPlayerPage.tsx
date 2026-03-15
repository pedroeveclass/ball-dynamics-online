import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateAttributes, calculateOverall, POSITIONS, getArchetypesForPosition } from '@/lib/attributes';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, MapPin, Shield, Eye } from 'lucide-react';

const STEPS = ['Identidade', 'Posição', 'Arquétipo', 'Revisão'];
const STEP_ICONS = [User, MapPin, Shield, Eye];

export default function OnboardingPlayerPage() {
  const { user, refreshPlayerProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState(20);
  const [dominantFoot, setDominantFoot] = useState<'right' | 'left' | 'both'>('right');
  const [primaryPosition, setPrimaryPosition] = useState('');
  const [secondaryPosition, setSecondaryPosition] = useState('');
  const [archetype, setArchetype] = useState('');

  const archetypeOptions = primaryPosition ? getArchetypesForPosition(primaryPosition) : [];

  const canNext = () => {
    if (step === 0) return fullName.trim().length >= 2 && age >= 16 && age <= 45;
    if (step === 1) return !!primaryPosition;
    if (step === 2) return !!archetype;
    return true;
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      const attrs = generateAttributes(primaryPosition, archetype);
      const overall = calculateOverall(attrs as unknown as Record<string, number>, primaryPosition);

      // Create player profile
      const { data: playerData, error: playerError } = await supabase
        .from('player_profiles')
        .insert({
          user_id: user.id,
          full_name: fullName.trim(),
          age,
          dominant_foot: dominantFoot,
          primary_position: primaryPosition,
          secondary_position: secondaryPosition || null,
          archetype,
          overall,
          reputation: 50,
          money: 5000,
          weekly_salary: 0,
          energy_current: 100,
          energy_max: 100,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      // Create attributes
      const { error: attrError } = await supabase
        .from('player_attributes')
        .insert({ player_profile_id: playerData.id, ...attrs });

      if (attrError) throw attrError;

      // Create free agent contract
      const { error: contractError } = await supabase
        .from('contracts')
        .insert({
          player_profile_id: playerData.id,
          status: 'free_agent',
          weekly_salary: 0,
          release_clause: 0,
        });

      if (contractError) throw contractError;

      // Create welcome notifications
      const { error: notifError } = await supabase
        .from('notifications')
        .insert([
          { user_id: user.id, type: 'system', title: 'Bem-vindo ao PitchTactics!', body: 'Seu atleta foi criado com sucesso. Explore o dashboard e prepare-se para sua carreira.' },
          { user_id: user.id, type: 'training', title: 'Treino Disponível', body: 'Sessões de treino estão liberadas. Evolua seus atributos para melhorar seu overall.' },
        ]);

      if (notifError) console.error('Notification error:', notifError);

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
  const archLabel = archetypeOptions.find(a => a.value === archetype)?.label || '';

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">CRIAR ATLETA</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">Dê vida ao seu jogador</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-colors ${
                  i === step ? 'bg-tactical text-tactical-foreground' :
                  i < step ? 'bg-pitch/20 text-pitch' : 'bg-primary-foreground/10 text-primary-foreground/40'
                }`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${i < step ? 'bg-pitch/40' : 'bg-primary-foreground/10'}`} />}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-lg bg-card p-6 space-y-6">
          {/* Step 0: Identity */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Jogador</Label>
                <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ex: Carlos Mendes" maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Idade</Label>
                <Input id="age" type="number" min={16} max={45} value={age} onChange={e => setAge(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Pé Dominante</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([['right', 'Direito'], ['left', 'Esquerdo'], ['both', 'Ambos']] as const).map(([val, label]) => (
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
                <div className="grid grid-cols-2 gap-2">
                  {POSITIONS.map(pos => (
                    <button
                      key={pos.value}
                      onClick={() => { setPrimaryPosition(pos.value); setArchetype(''); }}
                      className={`px-3 py-3 rounded-md text-sm font-display font-semibold border transition-colors text-left ${
                        primaryPosition === pos.value
                          ? 'border-tactical bg-tactical/10 text-tactical'
                          : 'border-border text-muted-foreground hover:border-tactical/40'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground">{pos.value}</span>
                      <br />
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
              {primaryPosition && (
                <div className="space-y-2">
                  <Label>Posição Secundária (opcional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {POSITIONS.filter(p => p.value !== primaryPosition).map(pos => (
                      <button
                        key={pos.value}
                        onClick={() => setSecondaryPosition(secondaryPosition === pos.value ? '' : pos.value)}
                        className={`px-3 py-2 rounded-md text-xs font-display font-semibold border transition-colors ${
                          secondaryPosition === pos.value
                            ? 'border-pitch bg-pitch/10 text-pitch'
                            : 'border-border text-muted-foreground hover:border-pitch/40'
                        }`}
                      >{pos.value} — {pos.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Archetype */}
          {step === 2 && (
            <div className="space-y-4">
              <Label>Arquétipo — {posLabel}</Label>
              <div className="space-y-2">
                {archetypeOptions.map(arch => (
                  <button
                    key={arch.value}
                    onClick={() => setArchetype(arch.value)}
                    className={`w-full px-4 py-4 rounded-md border text-left transition-colors ${
                      archetype === arch.value
                        ? 'border-tactical bg-tactical/10'
                        : 'border-border hover:border-tactical/40'
                    }`}
                  >
                    <span className={`font-display text-lg font-bold ${archetype === arch.value ? 'text-tactical' : 'text-foreground'}`}>
                      {arch.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">Confirmar Criação</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card"><span className="text-muted-foreground text-xs">Nome</span><p className="font-display font-bold">{fullName}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Idade</span><p className="font-display font-bold">{age} anos</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Pé</span><p className="font-display font-bold">{dominantFoot === 'right' ? 'Direito' : dominantFoot === 'left' ? 'Esquerdo' : 'Ambos'}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Posição</span><p className="font-display font-bold">{primaryPosition}{secondaryPosition ? ` / ${secondaryPosition}` : ''}</p></div>
                <div className="stat-card col-span-2"><span className="text-muted-foreground text-xs">Arquétipo</span><p className="font-display font-bold">{archLabel}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">Os atributos iniciais serão gerados com base na posição e arquétipo escolhidos. Você começa como agente livre.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            ) : <div />}

            {step < 3 ? (
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
