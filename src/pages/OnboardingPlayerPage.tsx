import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateOverall, POSITIONS, BODY_TYPES, GK_BODY_TYPES, HEIGHT_OPTIONS, FIELD_ATTRS, GK_ATTRS, ATTR_LABELS, ATTRIBUTE_CATEGORIES } from '@/lib/attributes';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, User, MapPin, Shield, Eye, Dumbbell, Ruler } from 'lucide-react';
import { AttributeBar } from '@/components/AttributeBar';
import { PositionFieldSelector } from '@/components/PositionFieldSelector';
import { CountrySelect } from '@/components/CountrySelect';
import { CountryFlag } from '@/components/CountryFlag';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { getCountry, getCountryName } from '@/lib/countries';

const STEP_ICONS = [User, MapPin, Ruler, Shield, Dumbbell, Eye];

export default function OnboardingPlayerPage() {
  const { user, profile, refreshPlayerProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['onboarding', 'common']);
  const { current: lang } = useAppLanguage();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const STEPS = [
    t('onboarding:player.steps.identity'),
    t('onboarding:player.steps.position'),
    t('onboarding:player.steps.height'),
    t('onboarding:player.steps.body'),
    t('onboarding:player.steps.attributes'),
    t('onboarding:player.steps.review'),
  ];

  const [fullName, setFullName] = useState('');
  const [dominantFoot, setDominantFoot] = useState<'right' | 'left'>('right');
  const [primaryPosition, setPrimaryPosition] = useState('');
  const [height, setHeight] = useState('Médio');
  const [bodyType, setBodyType] = useState('');
  const [countryCode, setCountryCode] = useState<string>(((profile as any)?.country_code as string) || 'BR');

  // When profile loads, sync the default country (only if user hasn't picked yet)
  useEffect(() => {
    const fromProfile = ((profile as any)?.country_code as string) || null;
    if (fromProfile) setCountryCode(fromProfile);
  }, [profile]);

  // Attribute distribution
  const [extraPoints, setExtraPoints] = useState<Record<string, number>>({});
  const TOTAL_DISTRIBUTE = 40;

  const isGK = primaryPosition === 'GK';
  const availableBodyTypes = isGK ? GK_BODY_TYPES : BODY_TYPES;

  const [baseAttrs, setBaseAttrs] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!primaryPosition || !bodyType) {
      setBaseAttrs(null);
      return;
    }
    let cancelled = false;
    supabase
      .rpc('get_onboarding_preview', {
        p_primary_position: primaryPosition,
        p_height: height,
        p_body_type: bodyType,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(error.message || 'Erro ao calcular atributos iniciais');
          setBaseAttrs(null);
        } else {
          const raw = (data ?? {}) as Record<string, number | string>;
          const normalized: Record<string, number> = {};
          for (const [k, v] of Object.entries(raw)) normalized[k] = Number(v);
          setBaseAttrs(normalized);
        }
      });
    return () => { cancelled = true; };
  }, [primaryPosition, bodyType, height]);

  const spentPoints = Object.values(extraPoints).reduce((a, b) => a + b, 0);
  const remainingPoints = TOTAL_DISTRIBUTE - spentPoints;

  const MAX_ATTR = 70;

  const finalAttrs = useMemo(() => {
    if (!baseAttrs) return null;
    const result = { ...baseAttrs };
    for (const [key, val] of Object.entries(extraPoints)) {
      result[key] = Math.min(MAX_ATTR, (result[key] || 30) + val);
    }
    return result;
  }, [baseAttrs, extraPoints]);

  const addPoint = (key: string) => {
    if (remainingPoints <= 0) return;
    // Don't allow adding if attribute is already at max
    const currentVal = (baseAttrs?.[key] || 30) + (extraPoints[key] || 0);
    if (currentVal >= MAX_ATTR) return;
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
        p_country_code: countryCode,
      } as any);

      if (error) throw error;

      await refreshPlayerProfile();
      toast.success(t('onboarding:player.success'));
      navigate('/player', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('onboarding:player.error_generic'));
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
          <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('onboarding:player.title')}</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">{t('onboarding:player.subtitle')}</p>
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
                <Label htmlFor="name">{t('onboarding:player.identity.name_label')}</Label>
                <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('onboarding:player.identity.name_placeholder')} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label>{t('onboarding:player.identity.country_label')}</Label>
                <CountrySelect value={countryCode} onChange={setCountryCode} />
                <p className="text-[11px] text-muted-foreground">{t('onboarding:player.identity.country_hint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('onboarding:player.identity.age_label')}</Label>
                <p className="text-sm text-muted-foreground">{t('onboarding:player.identity.age_text')} <span className="font-bold text-foreground">{t('onboarding:player.identity.age_value')}</span>.</p>
                <p className="text-xs text-muted-foreground">{t('onboarding:player.identity.age_hint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('onboarding:player.identity.foot_label')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([['right', t('onboarding:player.identity.foot_right')], ['left', t('onboarding:player.identity.foot_left')]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setDominantFoot(val as 'right' | 'left')}
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
              <div className="space-y-1">
                <Label>{t('onboarding:player.position.label')}</Label>
                <p className="text-xs text-muted-foreground">{t('onboarding:player.position.hint')}</p>
                <p className="text-[11px] text-muted-foreground">{t('onboarding:player.position.secondary_hint')}</p>
              </div>
              <PositionFieldSelector
                value={primaryPosition}
                onChange={(pos) => {
                  setPrimaryPosition(pos);
                  setBodyType('');
                  setExtraPoints({});
                }}
              />
            </div>
          )}

          {/* Step 2: Height */}
          {step === 2 && (
            <div className="space-y-4">
              <Label>{t('onboarding:player.height.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('onboarding:player.height.hint')}</p>
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
              <Label>{t('onboarding:player.body.label')}</Label>
              {isGK && <p className="text-xs text-muted-foreground">{t('onboarding:player.body.gk_hint')}</p>}
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
            const physicalKeys = ATTRIBUTE_CATEGORIES['Físico'];
            const technicalKeys = ATTRIBUTE_CATEGORIES['Técnico'];
            const mentalKeys = ATTRIBUTE_CATEGORIES['Mental'];
            const shootingKeys = ATTRIBUTE_CATEGORIES['Chute'];
            const gkKeys = ATTRIBUTE_CATEGORIES['Goleiro'];

            const sections = isGK
              ? [{ title: 'Goleiro', keys: gkKeys }, { title: 'Físico', keys: physicalKeys }, { title: 'Técnico', keys: technicalKeys }, { title: 'Mental', keys: mentalKeys }, { title: 'Chute', keys: shootingKeys }]
              : [{ title: 'Físico', keys: physicalKeys }, { title: 'Técnico', keys: technicalKeys }, { title: 'Mental', keys: mentalKeys }, { title: 'Chute', keys: shootingKeys }, { title: 'Goleiro', keys: gkKeys }];

            const renderAttrRow = (key: string) => {
              const base = baseAttrs[key] || 10;
              const extra = extraPoints[key] || 0;
              const total = finalAttrs[key] || base;
              return (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground flex-1 min-w-0">{ATTR_LABELS[key] || key}</span>
                  <span className="font-display text-sm font-bold w-7 text-right shrink-0">{Math.round(total)}</span>
                  {extra > 0 && <span className="text-[10px] text-pitch w-5 shrink-0 text-center">+{extra}</span>}
                  {extra <= 0 && <span className="w-5 shrink-0" />}
                  <button
                    onClick={() => removePoint(key)}
                    disabled={extra <= 0}
                    className="h-6 w-6 rounded bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 text-xs font-bold shrink-0"
                  >−</button>
                  <button
                    onClick={() => addPoint(key)}
                    disabled={remainingPoints <= 0 || total >= MAX_ATTR}
                    className="h-6 w-6 rounded bg-muted text-muted-foreground hover:bg-pitch/20 hover:text-pitch disabled:opacity-30 text-xs font-bold shrink-0"
                  >+</button>
                </div>
              );
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>{t('onboarding:player.attributes.label')}</Label>
                  <span className={`font-display text-lg font-bold ${remainingPoints === 0 ? 'text-pitch' : 'text-tactical'}`}>
                    {t('onboarding:player.attributes.remaining', { count: remainingPoints })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t('onboarding:player.attributes.hint')}</p>
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
          {step === 5 && (() => {
            const country = getCountry(countryCode);
            return (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-foreground">{t('onboarding:player.review.title')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.name')}</span><p className="font-display font-bold">{fullName}</p></div>
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:player.review.country')}</span>
                  <p className="font-display font-bold flex items-center gap-1.5">
                    <CountryFlag code={countryCode} size="xs" />
                    <span>{country ? getCountryName(country, lang) : countryCode}</span>
                  </p>
                </div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.age')}</span><p className="font-display font-bold">{t('onboarding:player.identity.age_value')}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.foot')}</span><p className="font-display font-bold">{dominantFoot === 'right' ? t('onboarding:player.identity.foot_right') : t('onboarding:player.identity.foot_left')}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.position')}</span><p className="font-display font-bold">{posLabel}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.height')}</span><p className="font-display font-bold">{heightLabel}</p></div>
                <div className="stat-card"><span className="text-muted-foreground text-xs">{t('onboarding:player.review.body')}</span><p className="font-display font-bold">{bodyLabel}</p></div>
              </div>
              {finalAttrs && (
                <div className="stat-card">
                  <span className="text-muted-foreground text-xs">{t('onboarding:player.review.overall')}</span>
                  <p className="font-display text-3xl font-extrabold text-tactical">{calculateOverall(finalAttrs, primaryPosition)}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('onboarding:player.review.footer')}</p>
            </div>
          );
          })()}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('common:actions.back')}
              </Button>
            ) : <div />}

            {step < 5 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
                {t('common:actions.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
                {submitting ? t('onboarding:player.submitting') : <><Check className="h-4 w-4 mr-1" /> {t('onboarding:player.submit')}</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
