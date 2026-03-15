import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, Shield, Building2, Eye } from 'lucide-react';

const STEPS = ['Manager', 'Clube', 'Estádio', 'Revisão'];
const STEP_ICONS = [User, Shield, Building2, Eye];

const PRESET_COLORS = [
  '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
  '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
];

export default function OnboardingManagerPage() {
  const { user, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Manager
  const [managerName, setManagerName] = useState('');
  // Step 2: Club
  const [clubName, setClubName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1a5276');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [city, setCity] = useState('');
  // Step 3: Stadium
  const [stadiumName, setStadiumName] = useState('');

  const canNext = () => {
    if (step === 0) return managerName.trim().length >= 2;
    if (step === 1) return clubName.trim().length >= 2 && shortName.trim().length === 3;
    if (step === 2) return stadiumName.trim().length >= 2;
    return true;
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      // 1. Create ManagerProfile
      const { data: managerData, error: managerError } = await supabase
        .from('manager_profiles')
        .insert({
          user_id: user.id,
          full_name: managerName.trim(),
          reputation: 30,
          money: 50000,
        })
        .select()
        .single();
      if (managerError) throw managerError;

      // 2. Create Club
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .insert({
          manager_profile_id: managerData.id,
          name: clubName.trim(),
          short_name: shortName.trim().toUpperCase(),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          city: city.trim() || null,
          reputation: 20,
          status: 'active',
        })
        .select()
        .single();
      if (clubError) throw clubError;

      // 3. Create ClubFinance
      const { error: financeError } = await supabase
        .from('club_finances')
        .insert({
          club_id: clubData.id,
          balance: 500000,
          weekly_wage_bill: 0,
          projected_income: 10000,
          projected_expense: 5000,
        });
      if (financeError) throw financeError;

      // 4. Create Stadium
      const { data: stadiumData, error: stadiumError } = await supabase
        .from('stadiums')
        .insert({
          club_id: clubData.id,
          name: stadiumName.trim(),
          capacity: 5000,
          quality: 30,
          maintenance_cost: 2000,
          prestige: 15,
        })
        .select()
        .single();
      if (stadiumError) throw stadiumError;

      // 5. Create Stadium Sectors
      const sectors = [
        { stadium_id: stadiumData.id, sector_type: 'popular', capacity: 3000, ticket_price: 15 },
        { stadium_id: stadiumData.id, sector_type: 'central', capacity: 1500, ticket_price: 35 },
        { stadium_id: stadiumData.id, sector_type: 'premium', capacity: 500, ticket_price: 80 },
      ];
      const { error: sectorError } = await supabase.from('stadium_sectors').insert(sectors);
      if (sectorError) throw sectorError;

      // 6. Create ClubSettings
      const { error: settingsError } = await supabase
        .from('club_settings')
        .insert({
          club_id: clubData.id,
          default_formation: '4-4-2',
          play_style: 'balanced',
        });
      if (settingsError) throw settingsError;

      await refreshManagerProfile();
      toast.success('Clube criado com sucesso!');
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar clube');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">CRIAR CLUBE</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">Monte seu time do zero</p>
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
          {/* Step 0: Manager */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="managerName">Nome do Manager</Label>
                <Input id="managerName" value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="Ex: José Mourinho" maxLength={50} />
              </div>
            </div>
          )}

          {/* Step 1: Club */}
          {step === 1 && (
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
                <Label htmlFor="city">Cidade (opcional)</Label>
                <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo" maxLength={50} />
              </div>
            </div>
          )}

          {/* Step 2: Stadium */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stadiumName">Nome do Estádio</Label>
                <Input id="stadiumName" value={stadiumName} onChange={e => setStadiumName(e.target.value)} placeholder="Ex: Arena do Povo" maxLength={50} />
              </div>
              <div className="p-4 rounded-md bg-muted/50 space-y-2 text-sm">
                <p className="font-display font-semibold text-foreground">Valores iniciais do estádio:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Capacidade:</span> <span className="font-bold">5.000</span></div>
                  <div><span className="text-muted-foreground">Qualidade:</span> <span className="font-bold">30/100</span></div>
                  <div><span className="text-muted-foreground">Prestígio:</span> <span className="font-bold">15/100</span></div>
                  <div><span className="text-muted-foreground">Manutenção:</span> <span className="font-bold">$2.000/sem</span></div>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <p className="font-display font-semibold text-foreground text-xs mb-1">Setores:</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>Popular (3.000 lugares)</span><span className="font-bold">$15/ingresso</span></div>
                    <div className="flex justify-between"><span>Central (1.500 lugares)</span><span className="font-bold">$35/ingresso</span></div>
                    <div className="flex justify-between"><span>Premium (500 lugares)</span><span className="font-bold">$80/ingresso</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">Confirmar Criação</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card"><span className="text-muted-foreground text-xs">Manager</span><p className="font-display font-bold">{managerName}</p></div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">Clube</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: primaryColor, color: secondaryColor }}>{shortName}</div>
                    <p className="font-display font-bold">{clubName}</p>
                  </div>
                </div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Estádio</span><p className="font-display font-bold">{stadiumName}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Cidade</span><p className="font-display font-bold">{city || '—'}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Saldo Inicial</span><p className="font-display font-bold text-pitch">$500.000</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">Formação</span><p className="font-display font-bold">4-4-2</p></div>
              </div>
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
                {submitting ? 'Criando...' : <><Check className="h-4 w-4 mr-1" /> Criar Clube</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
