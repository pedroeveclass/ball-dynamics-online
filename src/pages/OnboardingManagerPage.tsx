import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, Shield, Building2, Eye, Swords, Brain, CircleDot, Frown, Loader2 } from 'lucide-react';

const STEPS = ['Manager', 'Time', 'Personalizar', 'Revisão'];
const STEP_ICONS = [User, Shield, Building2, Eye];

const COACH_TYPES = [
  { value: 'defensive', label: 'Defensivo', description: '+15% treino defesa', icon: Shield },
  { value: 'offensive', label: 'Ofensivo', description: '+15% treino ataque', icon: Swords },
  { value: 'technical', label: 'Técnico', description: '+15% treino técnica', icon: Brain },
  { value: 'complete', label: 'Completo', description: '+10% em tudo', icon: CircleDot },
] as const;

const PRESET_COLORS = [
  '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
  '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
];

type CoachType = typeof COACH_TYPES[number]['value'];

interface AvailableClub {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  city: string | null;
  league_id: string | null;
  stadiums: { id: string; name: string }[];
}

export default function OnboardingManagerPage() {
  const { user, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 0: Manager profile
  const [managerName, setManagerName] = useState('');
  const [coachType, setCoachType] = useState<CoachType | null>(null);

  // Step 1: Select team
  const [availableClubs, setAvailableClubs] = useState<AvailableClub[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [selectedClub, setSelectedClub] = useState<AvailableClub | null>(null);
  const [noTeamsAvailable, setNoTeamsAvailable] = useState(false);

  // Step 2: Customize team
  const [clubName, setClubName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1a5276');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [city, setCity] = useState('');
  const [stadiumName, setStadiumName] = useState('');

  // Fetch available clubs when entering step 1
  useEffect(() => {
    if (step === 1) {
      fetchAvailableClubs();
    }
  }, [step]);

  const fetchAvailableClubs = async () => {
    setLoadingClubs(true);
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, short_name, primary_color, secondary_color, city, league_id, stadiums(id, name)')
        .eq('is_bot_managed', true)
        .not('league_id', 'is', null);

      if (error) throw error;
      setAvailableClubs((data as unknown as AvailableClub[]) || []);
      setNoTeamsAvailable(!data || data.length === 0);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao buscar times disponíveis');
      setAvailableClubs([]);
      setNoTeamsAvailable(true);
    } finally {
      setLoadingClubs(false);
    }
  };

  // Pre-fill customization when a club is selected
  const handleSelectClub = (club: AvailableClub) => {
    setSelectedClub(club);
    setClubName(club.name);
    setShortName(club.short_name);
    setPrimaryColor(club.primary_color);
    setSecondaryColor(club.secondary_color);
    setCity(club.city || '');
    setStadiumName(club.stadiums?.[0]?.name || '');
    setStep(2);
  };

  const canNext = () => {
    if (step === 0) return managerName.trim().length >= 2 && coachType !== null;
    if (step === 1) return selectedClub !== null;
    if (step === 2) return clubName.trim().length >= 2 && shortName.trim().length === 3 && stadiumName.trim().length >= 2;
    return true;
  };

  const handleCreateProfileWithoutTeam = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error: managerError } = await supabase
        .from('manager_profiles')
        .insert({
          user_id: user.id,
          full_name: managerName.trim(),
          coach_type: coachType,
          reputation: 30,
          money: 50000,
        });
      if (managerError) throw managerError;

      await refreshManagerProfile();
      toast.success('Perfil criado com sucesso! Você será notificado quando houver vagas.');
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar perfil');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !selectedClub) return;
    setSubmitting(true);

    try {
      // 1. Create ManagerProfile
      const { data: managerData, error: managerError } = await supabase
        .from('manager_profiles')
        .insert({
          user_id: user.id,
          full_name: managerName.trim(),
          coach_type: coachType,
          reputation: 30,
          money: 50000,
        })
        .select()
        .single();
      if (managerError) throw managerError;

      // 2. Update the selected club
      const { error: clubError } = await supabase
        .from('clubs')
        .update({
          manager_profile_id: managerData.id,
          name: clubName.trim(),
          short_name: shortName.trim().toUpperCase(),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          city: city.trim() || null,
          is_bot_managed: false,
        })
        .eq('id', selectedClub.id);
      if (clubError) throw clubError;

      // 3. Update stadium name if changed
      const originalStadium = selectedClub.stadiums?.[0];
      if (originalStadium && stadiumName.trim() !== originalStadium.name) {
        const { error: stadiumError } = await supabase
          .from('stadiums')
          .update({ name: stadiumName.trim() })
          .eq('id', originalStadium.id);
        if (stadiumError) throw stadiumError;
      }

      // 4. Ensure facilities exist for the club
      const { data: existingFacilities } = await supabase
        .from('club_facilities')
        .select('id')
        .eq('club_id', selectedClub.id)
        .limit(1);

      if (!existingFacilities || existingFacilities.length === 0) {
        const facilityTypes = ['training_center', 'youth_academy', 'medical_center', 'scouting_network'];
        const facilities = facilityTypes.map(ft => ({
          club_id: selectedClub.id,
          facility_type: ft,
          level: 1,
        }));
        const { error: facilityError } = await supabase.from('club_facilities').insert(facilities);
        if (facilityError) throw facilityError;
      }

      await refreshManagerProfile();
      toast.success('Time assumido com sucesso!');
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao assumir time');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">NOVO MANAGER</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">Monte seu perfil e assuma um time</p>
        </div>

        {/* Steps */}
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

        <div className="rounded-lg bg-card p-6 space-y-6">
          {/* Step 0: Manager Profile */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="managerName">Nome do Manager</Label>
                <Input id="managerName" value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="Ex: José Mourinho" maxLength={50} />
              </div>

              <div className="space-y-3">
                <Label>Tipo de Treinador</Label>
                <div className="grid grid-cols-2 gap-3">
                  {COACH_TYPES.map(ct => {
                    const Icon = ct.icon;
                    const isSelected = coachType === ct.value;
                    return (
                      <button
                        key={ct.value}
                        onClick={() => setCoachType(ct.value)}
                        className={`p-3 rounded-lg border-2 transition-all text-left space-y-1 ${
                          isSelected
                            ? 'border-tactical bg-tactical/10'
                            : 'border-border hover:border-muted-foreground/40 bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isSelected ? 'text-tactical' : 'text-muted-foreground'}`} />
                          <span className={`font-display font-bold text-sm ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {ct.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{ct.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Select Team */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold text-foreground">Escolha um Time</h2>

              {loadingClubs && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loadingClubs && noTeamsAvailable && (
                <div className="text-center py-8 space-y-4">
                  <Frown className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">
                    Nenhum time disponível no momento.<br />
                    Você será notificado quando houver vagas.
                  </p>
                  <Button
                    onClick={handleCreateProfileWithoutTeam}
                    disabled={submitting}
                    className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
                  >
                    {submitting ? 'Criando...' : 'Criar Perfil sem Time'}
                  </Button>
                </div>
              )}

              {!loadingClubs && !noTeamsAvailable && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                  {availableClubs.map(club => (
                    <div
                      key={club.id}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        selectedClub?.id === club.id
                          ? 'border-tactical bg-tactical/10'
                          : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center font-display text-xs font-extrabold shrink-0"
                          style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
                        >
                          {club.short_name}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display font-bold text-sm text-foreground truncate">{club.name}</p>
                          {club.city && <p className="text-xs text-muted-foreground truncate">{club.city}</p>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={selectedClub?.id === club.id ? 'default' : 'outline'}
                        className="w-full text-xs font-display"
                        onClick={() => handleSelectClub(club)}
                      >
                        {selectedClub?.id === club.id ? 'Selecionado' : 'Selecionar'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Customize Team */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clubName">Nome do Clube</Label>
                <Input id="clubName" value={clubName} onChange={e => setClubName(e.target.value)} placeholder="Ex: FC United" maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortName">Sigla (3 letras)</Label>
                <Input id="shortName" value={shortName} onChange={e => setShortName(e.target.value.slice(0, 3).toUpperCase())} placeholder="FCU" maxLength={3} className="uppercase" />
              </div>
              <div className="space-y-2">
                <Label>Cor Principal</Label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setPrimaryColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${primaryColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                    className="w-8 h-8 rounded-full cursor-pointer border-0 p-0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor Secundária</Label>
                <div className="flex gap-2 flex-wrap">
                  {['#ffffff', '#000000', '#f1c40f', '#ecf0f1', '#bdc3c7', ...PRESET_COLORS.slice(0, 5)].map(c => (
                    <button key={c} onClick={() => setSecondaryColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${secondaryColor === c ? 'border-foreground scale-110' : 'border-border'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                    className="w-8 h-8 rounded-full cursor-pointer border-0 p-0" />
                </div>
              </div>
              {/* Club badge preview */}
              <div className="flex items-center gap-4 p-4 rounded-md bg-muted/50">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center font-display text-xl font-extrabold"
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                  {shortName || '???'}
                </div>
                <div>
                  <p className="font-display font-bold text-foreground">{clubName || 'Nome do Clube'}</p>
                  <p className="text-xs text-muted-foreground">{shortName || '---'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo" maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stadiumName">Nome do Estádio</Label>
                <Input id="stadiumName" value={stadiumName} onChange={e => setStadiumName(e.target.value)} placeholder="Ex: Arena do Povo" maxLength={50} />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">Confirmar</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Manager</span>
                  <p className="font-display font-bold">{managerName}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Tipo</span>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const ct = COACH_TYPES.find(c => c.value === coachType);
                      if (!ct) return null;
                      const Icon = ct.icon;
                      return (
                        <>
                          <Icon className="h-3.5 w-3.5 text-tactical" />
                          <p className="font-display font-bold">{ct.label}</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Clube</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: primaryColor, color: secondaryColor }}>{shortName}</div>
                    <p className="font-display font-bold">{clubName}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Estádio</span>
                  <p className="font-display font-bold">{stadiumName}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Cidade</span>
                  <p className="font-display font-bold">{city || '—'}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Cores</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: primaryColor }} />
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: secondaryColor }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => {
                if (step === 2 && selectedClub) {
                  // Going back from customize to team selection - keep selection but go back
                  setStep(1);
                } else {
                  setStep(s => s - 1);
                }
              }} className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            ) : <div />}

            {step === 0 && (
              <Button onClick={() => setStep(1)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 1 && !noTeamsAvailable && selectedClub && (
              <Button onClick={() => setStep(2)} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 2 && (
              <Button onClick={() => setStep(3)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 3 && (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
                {submitting ? 'Criando...' : <><Check className="h-4 w-4 mr-1" /> Confirmar</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
