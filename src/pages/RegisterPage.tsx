import { useEffect, useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { CountrySelect } from '@/components/CountrySelect';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { detectClientCountry, detectBrowserLanguage } from '@/lib/detectCountry';

export default function RegisterPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['auth', 'common']);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'player' | 'manager' | ''>('');
  const [countryCode, setCountryCode] = useState<string>('BR');
  const [submitting, setSubmitting] = useState(false);

  // Best-effort IP geolocation for country pre-fill — runs once on mount.
  // The user can always override via the dropdown.
  useEffect(() => {
    let active = true;
    detectClientCountry().then(code => { if (active) setCountryCode(code); });
    return () => { active = false; };
  }, []);

  if (loading) return null;
  if (user && profile) {
    if (profile.role_selected === 'manager') return <Navigate to="/onboarding/manager" replace />;
    return <Navigate to="/onboarding/player" replace />;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) { toast.error(t('auth:register.errors.choose_role')); return; }
    if (username.trim().length < 2) { toast.error(t('auth:register.errors.username_short')); return; }
    setSubmitting(true);

    const preferredLanguage = detectBrowserLanguage();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
          role_selected: role,
          country_code: countryCode,
          preferred_language: preferredLanguage,
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    toast.success(t('auth:register.success'));
    const redirectPath = role === 'manager' ? '/onboarding/manager' : '/onboarding/player';
    navigate(redirectPath, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">FOOTBALL IDENTITY</h1>
          <p className="mt-2 text-sm text-primary-foreground/60">{t('auth:register.title')}</p>
        </div>
        <form onSubmit={handleRegister} className="rounded-lg bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('auth:register.username')}</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth:register.username_placeholder')} required minLength={2} maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth:register.email')}</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth:register.email_placeholder')} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth:register.password')}</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth:register.password_placeholder')} required minLength={6} />
          </div>
          <div className="space-y-2">
            <Label>{t('common:country.label')}</Label>
            <CountrySelect value={countryCode} onChange={setCountryCode} />
            <p className="text-[11px] text-muted-foreground">{t('common:country.detected_via_ip')}. {t('common:country.override_hint')}.</p>
          </div>
          <div className="space-y-2">
            <Label>{t('auth:register.role_label')}</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('player')}
                className={`w-full h-20 flex flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
                  role === 'player' ? 'border-pitch bg-pitch/10 text-pitch' : 'border-border text-muted-foreground hover:border-pitch/40'
                }`}
              >
                <span className="font-display text-lg font-bold">⚽ {t('auth:register.role_player')}</span>
                <span className="text-[10px]">{t('auth:register.role_player_hint')}</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('manager')}
                className={`w-full h-20 flex flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
                  role === 'manager' ? 'border-tactical bg-tactical/10 text-tactical' : 'border-border text-muted-foreground hover:border-tactical/40'
                }`}
              >
                <span className="font-display text-lg font-bold">📋 {t('auth:register.role_manager')}</span>
                <span className="text-[10px]">{t('auth:register.role_manager_hint')}</span>
              </button>
            </div>
          </div>
          <Button type="submit" disabled={submitting || !role} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
            {submitting ? t('auth:register.submitting') : t('auth:register.submit')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t('auth:register.have_account')}{' '}
            <Link to="/login" className="text-tactical hover:underline">{t('auth:register.sign_in')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
