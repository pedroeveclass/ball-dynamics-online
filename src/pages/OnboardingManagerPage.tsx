import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, Shield, Building2, Eye, Swords, Brain, CircleDot, Frown, Loader2 } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { CountrySelect } from '@/components/CountrySelect';
import { CountryFlag } from '@/components/CountryFlag';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { getCountry, getCountryName } from '@/lib/countries';

const CREST_EMOJI_PRESETS = ['⚽', '🦁', '🦅', '🐺', '🐉', '🐻', '🐯', '🦈', '⭐', '🔥', '🛡️', '⚓', '👑', '🌪️', '🦊', '🐍'];

const STEP_ICONS = [User, Shield, Building2, Eye];

const COACH_TYPE_VALUES = [
  { value: 'defensive', icon: Shield },
  { value: 'offensive', icon: Swords },
  { value: 'technical', icon: Brain },
  { value: 'complete', icon: CircleDot },
] as const;

const PRESET_COLORS = [
  '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
  '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
];

type CoachType = typeof COACH_TYPE_VALUES[number]['value'];

interface AvailableClub {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url?: string | null;
  city: string | null;
  league_id: string | null;
  stadiums: { id: string; name: string }[];
}

export default function OnboardingManagerPage() {
  const { user, profile, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['onboarding', 'common']);
  const { current: lang } = useAppLanguage();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const STEPS = [
    t('onboarding:manager.steps.manager'),
    t('onboarding:manager.steps.team'),
    t('onboarding:manager.steps.customize'),
    t('onboarding:manager.steps.review'),
  ];

  const COACH_TYPES = COACH_TYPE_VALUES.map(c => ({
    value: c.value,
    icon: c.icon,
    label: t(`onboarding:manager.coach.${c.value}` as any),
    description: t(`onboarding:manager.coach.${c.value}_hint` as any),
  }));

  // Step 0: Manager profile
  const [managerName, setManagerName] = useState('');
  const [coachType, setCoachType] = useState<CoachType | null>(null);
  const [countryCode, setCountryCode] = useState<string>(((profile as any)?.country_code as string) || 'BR');

  useEffect(() => {
    const fromProfile = ((profile as any)?.country_code as string) || null;
    if (fromProfile) setCountryCode(fromProfile);
  }, [profile]);

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
  const [crestUrl, setCrestUrl] = useState<string | null>(null);

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
        .select('id, name, short_name, primary_color, secondary_color, crest_url, city, league_id, stadiums(id, name)')
        .eq('is_bot_managed', true)
        .not('league_id', 'is', null);

      if (error) throw error;
      setAvailableClubs((data as unknown as AvailableClub[]) || []);
      setNoTeamsAvailable(!data || data.length === 0);
    } catch (err: any) {
      console.error(err);
      toast.error(t('onboarding:manager.error_no_teams'));
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
      // Set role_selected = 'manager' on profiles table
      const { error: roleError } = await supabase.from('profiles').update({ role_selected: 'manager' }).eq('id', user.id);
      if (roleError) console.error('Failed to update role_selected:', roleError);

      // Create or reuse existing ManagerProfile
      const { data: existingManager } = await supabase
        .from('manager_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingManager) {
        const { error: updateError } = await supabase
          .from('manager_profiles')
          .update({ full_name: managerName.trim(), coach_type: coachType, country_code: countryCode } as any)
          .eq('id', existingManager.id);
        if (updateError) throw updateError;
      } else {
        const { error: managerError } = await supabase
          .from('manager_profiles')
          .insert({
            user_id: user.id,
            full_name: managerName.trim(),
            coach_type: coachType,
            reputation: 30,
            money: 50000,
            country_code: countryCode,
          } as any);
        if (managerError) throw managerError;
      }

      await refreshManagerProfile();
      toast.success(t('onboarding:manager.success_without_team'));
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('onboarding:manager.error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !selectedClub) return;
    setSubmitting(true);

    try {
      // 0. Set role_selected = 'manager' on profiles table
      const { error: roleError2 } = await supabase.from('profiles').update({ role_selected: 'manager' }).eq('id', user.id);
      if (roleError2) console.error('Failed to update role_selected:', roleError2);

      // 1. Create or reuse existing ManagerProfile
      let managerData: any;
      const { data: existingManager } = await supabase
        .from('manager_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingManager) {
        // Reuse existing — update name and coach type
        const { data: updated, error: updateError } = await supabase
          .from('manager_profiles')
          .update({ full_name: managerName.trim(), coach_type: coachType, country_code: countryCode } as any)
          .eq('id', existingManager.id)
          .select()
          .single();
        if (updateError) throw updateError;
        managerData = updated;
      } else {
        const { data: created, error: managerError } = await supabase
          .from('manager_profiles')
          .insert({
            user_id: user.id,
            full_name: managerName.trim(),
            coach_type: coachType,
            reputation: 30,
            money: 50000,
            country_code: countryCode,
          } as any)
          .select()
          .single();
        if (managerError) throw managerError;
        managerData = created;
      }

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
          crest_url: crestUrl,
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
      toast.success(t('onboarding:manager.success_with_team'));
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('onboarding:manager.error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('onboarding:manager.title')}</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">{t('onboarding:manager.subtitle')}</p>
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
                <Label htmlFor="managerName">{t('onboarding:manager.name_label')}</Label>
                <Input id="managerName" value={managerName} onChange={e => setManagerName(e.target.value)} placeholder={t('onboarding:manager.name_placeholder')} maxLength={50} />
              </div>

              <div className="space-y-2">
                <Label>{t('onboarding:manager.country_label')}</Label>
                <CountrySelect value={countryCode} onChange={setCountryCode} />
                <p className="text-[11px] text-muted-foreground">{t('onboarding:manager.country_hint')}</p>
              </div>

              <div className="space-y-3">
                <Label>{t('onboarding:manager.coach_label')}</Label>
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
              <h2 className="font-display text-lg font-bold text-foreground">{t('onboarding:manager.team.title')}</h2>

              {loadingClubs && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loadingClubs && noTeamsAvailable && (
                <div className="text-center py-8 space-y-4">
                  <Frown className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">{t('onboarding:manager.team.no_teams')}</p>
                  <Button
                    onClick={handleCreateProfileWithoutTeam}
                    disabled={submitting}
                    className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
                  >
                    {submitting ? t('onboarding:manager.submitting') : t('onboarding:manager.team.create_without_team')}
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
                        <ClubCrest crestUrl={club.crest_url} primaryColor={club.primary_color} secondaryColor={club.secondary_color} shortName={club.short_name} className="w-10 h-10 rounded-lg text-xs shrink-0" />
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
                        {selectedClub?.id === club.id ? t('onboarding:manager.team.selected') : t('onboarding:manager.team.select')}
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
                <Label htmlFor="clubName">{t('onboarding:manager.customize.club_name')}</Label>
                <Input id="clubName" value={clubName} onChange={e => setClubName(e.target.value)} placeholder={t('onboarding:manager.customize.club_name_placeholder')} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortName">{t('onboarding:manager.customize.short_name')}</Label>
                <Input id="shortName" value={shortName} onChange={e => setShortName(e.target.value.slice(0, 3).toUpperCase())} placeholder="FCU" maxLength={3} className="uppercase" />
              </div>
              <div className="space-y-2">
                <Label>{t('onboarding:manager.customize.primary_color')}</Label>
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
                <Label>{t('onboarding:manager.customize.secondary_color')}</Label>
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
                <ClubCrest
                  crestUrl={crestUrl}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  shortName={shortName || '???'}
                  className="w-16 h-16 rounded-lg text-xl"
                />
                <div>
                  <p className="font-display font-bold text-foreground">{clubName || 'Nome do Clube'}</p>
                  <p className="text-xs text-muted-foreground">{shortName || '---'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('onboarding:manager.customize.crest_label')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCrestUrl(null)}
                    title={t('onboarding:manager.customize.crest_use_initials')}
                    className={`h-9 w-9 rounded border flex items-center justify-center text-[10px] font-display font-bold ${!crestUrl ? 'border-tactical bg-tactical/10 text-tactical' : 'border-border text-muted-foreground hover:border-tactical/40'}`}
                  >
                    ABC
                  </button>
                  {CREST_EMOJI_PRESETS.map(e => {
                    const val = `emoji:${e}`;
                    const active = crestUrl === val;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setCrestUrl(val)}
                        className={`h-9 w-9 rounded border flex items-center justify-center text-lg ${active ? 'border-tactical bg-tactical/10' : 'border-border hover:border-tactical/40'}`}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">{t('onboarding:manager.customize.crest_hint')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t('onboarding:manager.customize.city')}</Label>
                <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder={t('onboarding:manager.customize.city_placeholder')} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stadiumName">{t('onboarding:manager.customize.stadium')}</Label>
                <Input id="stadiumName" value={stadiumName} onChange={e => setStadiumName(e.target.value)} placeholder={t('onboarding:manager.customize.stadium_placeholder')} maxLength={50} />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (() => {
            const country = getCountry(countryCode);
            return (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">{t('onboarding:manager.review.title')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.manager')}</span>
                  <p className="font-display font-bold">{managerName}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.country')}</span>
                  <p className="font-display font-bold flex items-center gap-1.5">
                    <CountryFlag code={countryCode} size="xs" />
                    <span>{country ? getCountryName(country, lang) : countryCode}</span>
                  </p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.type')}</span>
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
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.club')}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: primaryColor, color: secondaryColor }}>{shortName}</div>
                    <p className="font-display font-bold">{clubName}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.stadium')}</span>
                  <p className="font-display font-bold">{stadiumName}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.city')}</span>
                  <p className="font-display font-bold">{city || '—'}</p>
                </div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:manager.review.colors')}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: primaryColor }} />
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: secondaryColor }} />
                  </div>
                </div>
              </div>
            </div>
          );
          })()}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => {
                if (step === 2 && selectedClub) {
                  setStep(1);
                } else {
                  setStep(s => s - 1);
                }
              }} className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('common:actions.back')}
              </Button>
            ) : <div />}

            {step === 0 && (
              <Button onClick={() => setStep(1)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                {t('common:actions.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 1 && !noTeamsAvailable && selectedClub && (
              <Button onClick={() => setStep(2)} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                {t('common:actions.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 2 && (
              <Button onClick={() => setStep(3)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                {t('common:actions.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 3 && (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
                {submitting ? t('onboarding:manager.submitting') : <><Check className="h-4 w-4 mr-1" /> {t('onboarding:manager.submit')}</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
