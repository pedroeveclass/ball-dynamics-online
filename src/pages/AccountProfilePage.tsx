import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { seededAppearance, type PlayerAppearance } from '@/lib/avatar';
import { buildCharRef, invalidateCharAvatar } from '@/lib/charAvatar';
import { toast } from 'sonner';
import { User, Lock, Mail, Upload, Check, UserCircle, Globe } from 'lucide-react';
import { CountrySelect } from '@/components/CountrySelect';
import { CountryFlag } from '@/components/CountryFlag';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Trans, useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { getCountry, getCountryName } from '@/lib/countries';

const PRESET_AVATARS = [
  '⚽', '🏟️', '🥅', '🏆', '⭐', '🦁', '🐺', '🦅',
  '🔥', '💎', '👑', '🎯', '⚡', '🛡️', '🗡️', '🎖️',
];

interface PlayerOwned {
  kind: 'player';
  id: string;
  name: string;
  appearance: PlayerAppearance;
  clubPrimaryColor: string | null;
  clubSecondaryColor: string | null;
}
interface ManagerOwned {
  kind: 'manager';
  id: string;
  name: string;
  appearance: PlayerAppearance;
  clubPrimaryColor: string | null;
  clubSecondaryColor: string | null;
}
type OwnedChar = PlayerOwned | ManagerOwned;

export default function AccountProfilePage() {
  const { user, profile } = useAuth();
  const { t } = useTranslation(['account_profile', 'common']);
  const { current: lang } = useAppLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar_url || '');
  const [charRef, setCharRef] = useState<string | null>((profile as any)?.avatar_char_ref ?? null);
  const [ownedChars, setOwnedChars] = useState<OwnedChar[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [countryCode, setCountryCode] = useState<string>(((profile as any)?.country_code as string) || 'BR');
  const [countrySaving, setCountrySaving] = useState(false);

  useEffect(() => {
    const c = (profile as any)?.country_code as string | undefined;
    if (c) setCountryCode(c);
  }, [profile]);

  const saveCountry = async (code: string) => {
    if (!user || code === ((profile as any)?.country_code)) { setCountryCode(code); return; }
    setCountrySaving(true);
    setCountryCode(code);
    const { error } = await supabase
      .from('profiles')
      .update({ country_code: code } as any)
      .eq('id', user.id);
    setCountrySaving(false);
    if (error) {
      toast.error(t('common:feedback.error_generic'));
    } else {
      toast.success(t('common:feedback.saved'));
    }
  };

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;

  // Load all characters this user owns (players + managers) so we can show
  // the picker. Ownership filter is user_id = auth.uid() (RLS on each table
  // enforces the same on the server).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setCharsLoading(true);
    (async () => {
      const [playersRes, managersRes] = await Promise.all([
        supabase
          .from('player_profiles')
          .select('id, full_name, club_id, appearance' as any)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('manager_profiles')
          .select('id, full_name, appearance' as any)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
      ]);

      const clubIds = new Set<string>();
      (playersRes.data ?? []).forEach((p: any) => { if (p.club_id) clubIds.add(p.club_id); });

      const managerIds = (managersRes.data ?? []).map((m: any) => m.id);
      let clubsByManager: Record<string, { primary: string | null; secondary: string | null }> = {};
      if (managerIds.length) {
        const { data: managerClubs } = await supabase
          .from('clubs')
          .select('manager_profile_id, primary_color, secondary_color')
          .in('manager_profile_id', managerIds);
        (managerClubs ?? []).forEach((c: any) => {
          if (c.manager_profile_id) {
            clubsByManager[c.manager_profile_id] = {
              primary: c.primary_color ?? null,
              secondary: c.secondary_color ?? null,
            };
          }
        });
      }

      let clubsById: Record<string, { primary: string | null; secondary: string | null }> = {};
      if (clubIds.size) {
        const { data: playerClubs } = await supabase
          .from('clubs')
          .select('id, primary_color, secondary_color')
          .in('id', Array.from(clubIds));
        (playerClubs ?? []).forEach((c: any) => {
          clubsById[c.id] = {
            primary: c.primary_color ?? null,
            secondary: c.secondary_color ?? null,
          };
        });
      }

      const players: OwnedChar[] = (playersRes.data ?? []).map((p: any) => {
        const clubColors = p.club_id ? clubsById[p.club_id] : undefined;
        return {
          kind: 'player' as const,
          id: p.id,
          name: p.full_name ?? 'Jogador',
          appearance: (p.appearance as PlayerAppearance) ?? seededAppearance(p.id),
          clubPrimaryColor: clubColors?.primary ?? null,
          clubSecondaryColor: clubColors?.secondary ?? null,
        };
      });

      const managers: OwnedChar[] = (managersRes.data ?? []).map((m: any) => {
        const clubColors = clubsByManager[m.id];
        return {
          kind: 'manager' as const,
          id: m.id,
          name: m.full_name ?? 'Treinador',
          appearance: (m.appearance as PlayerAppearance) ?? seededAppearance(m.id || m.full_name || 'manager'),
          clubPrimaryColor: clubColors?.primary ?? null,
          clubSecondaryColor: clubColors?.secondary ?? null,
        };
      });

      if (!cancelled) {
        setOwnedChars([...players, ...managers]);
        setCharsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error(t('toast.password_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('toast.password_mismatch'));
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message || t('toast.password_error'));
    } else {
      toast.success(t('toast.password_ok'));
      setNewPassword('');
      setConfirmPassword('');
    }
    setSaving(false);
  };

  // Save the legacy avatar_url path (emoji / uploaded image). Clears any
  // char-ref so the two modes don't fight.
  const saveAvatar = async (avatarUrl: string) => {
    if (!user) return;
    setAvatarSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, avatar_char_ref: null } as any)
      .eq('id', user.id);
    if (error) {
      toast.error(t('toast.avatar_save_error'));
    } else {
      setSelectedAvatar(avatarUrl);
      setCharRef(null);
      toast.success(t('toast.avatar_ok'));
      window.location.reload();
    }
    setAvatarSaving(false);
  };

  const saveCharRef = async (ref: string) => {
    if (!user) return;
    setAvatarSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_char_ref: ref } as any)
      .eq('id', user.id);
    if (error) {
      toast.error(t('toast.avatar_save_error'));
    } else {
      // Invalidate in case the user had a different char cached.
      invalidateCharAvatar(charRef);
      invalidateCharAvatar(ref);
      setCharRef(ref);
      setPickerOpen(false);
      toast.success(t('toast.char_avatar_ok'));
      window.location.reload();
    }
    setAvatarSaving(false);
  };

  const clearCharRef = async () => {
    if (!user) return;
    setAvatarSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_char_ref: null } as any)
      .eq('id', user.id);
    if (error) {
      toast.error(t('toast.char_avatar_remove_error'));
    } else {
      invalidateCharAvatar(charRef);
      setCharRef(null);
      toast.success(t('toast.char_avatar_removed'));
      window.location.reload();
    }
    setAvatarSaving(false);
  };

  const handlePresetSelect = (emoji: string) => {
    saveAvatar(`emoji:${emoji}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('toast.image_too_big'));
      return;
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('toast.image_format'));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExts.includes(ext)) {
      toast.error(t('toast.image_extension'));
      return;
    }
    setAvatarSaving(true);
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error(t('toast.upload_error'));
      setAvatarSaving(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await saveAvatar(publicUrl);
  };

  const handleUseCharacterAvatar = () => {
    if (ownedChars.length === 0) {
      toast.info(t('toast.no_chars_yet'));
      return;
    }
    if (ownedChars.length === 1) {
      // Smooth UX: skip picker when there's only one choice.
      const only = ownedChars[0];
      saveCharRef(buildCharRef(only.kind, only.id));
      return;
    }
    setPickerOpen(true);
  };

  const currentAvatar = selectedAvatar || profile?.avatar_url || '';
  const hasCharAvatar = !!charRef;

  // Find the active character (for the preview label in the current section).
  const activeChar = hasCharAvatar
    ? ownedChars.find(c => buildCharRef(c.kind, c.id) === charRef) ?? null
    : null;

  return (
    <Layout>
      <div className="space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6 text-tactical" /> {t('title')}
        </h1>

        {/* ── Localization (country + language) ── */}
        <div className="stat-card space-y-4">
          <h2 className="font-display font-semibold text-sm flex items-center gap-1">
            <Globe className="h-4 w-4 text-tactical" /> {t('common:country.label')} & {t('common:language.label')}
          </h2>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('common:country.label')}</Label>
            <div className="flex items-center gap-2">
              {(() => {
                const c = getCountry(countryCode);
                return (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CountryFlag code={countryCode} size="sm" />
                    {c ? getCountryName(c, lang) : countryCode}
                  </span>
                );
              })()}
            </div>
            <CountrySelect value={countryCode} onChange={saveCountry} disabled={countrySaving} />
            <p className="text-[11px] text-muted-foreground">{t('common:country.override_hint')}.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('common:language.label')}</Label>
            <div><LanguageSwitcher /></div>
          </div>
        </div>

        {/* Avatar Section */}
        <div className="stat-card space-y-4">
          <h2 className="font-display font-semibold text-sm flex items-center gap-1">
            {t('avatar.section')}
          </h2>

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center overflow-hidden border-2 border-border shrink-0">
              {hasCharAvatar && activeChar ? (
                <PlayerAvatar
                  appearance={activeChar.appearance}
                  variant="face"
                  clubPrimaryColor={activeChar.clubPrimaryColor}
                  clubSecondaryColor={activeChar.clubSecondaryColor}
                  playerName={activeChar.name}
                  fallbackSeed={activeChar.id}
                  outfit={activeChar.kind === 'manager' ? 'coach' : 'player'}
                  className="h-full w-full"
                />
              ) : hasCharAvatar ? (
                // Ref exists but the character wasn't found in our owned list
                // (e.g. deleted after being set) — fall back to initial.
                <span className="text-primary-foreground font-display text-xl font-bold">
                  {profile?.username?.[0]?.toUpperCase() || '?'}
                </span>
              ) : currentAvatar.startsWith('emoji:') ? (
                <span className="text-2xl">{currentAvatar.replace('emoji:', '')}</span>
              ) : currentAvatar.startsWith('http') ? (
                <img src={currentAvatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-primary-foreground font-display text-xl font-bold">
                  {profile?.username?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-display font-bold">{profile?.username}</p>
              {hasCharAvatar ? (
                <p className="text-xs text-muted-foreground">
                  <Trans
                    t={t}
                    i18nKey="avatar.using_char"
                    values={{ name: activeChar?.name ?? t('avatar.using_char_fallback') }}
                    components={[<strong key="0" className="text-foreground" />]}
                  />
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('avatar.pick_hint')}</p>
              )}
            </div>
          </div>

          {/* ── Use character avatar action ── */}
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-xs font-display font-semibold flex items-center gap-1">
                  <UserCircle className="h-3.5 w-3.5 text-tactical" /> {t('avatar.use_character_title')}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {charsLoading
                    ? t('avatar.loading_chars')
                    : ownedChars.length === 0
                      ? t('avatar.no_chars')
                      : ownedChars.length === 1
                        ? t('avatar.one_char')
                        : t('avatar.many_chars', { count: ownedChars.length })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {hasCharAvatar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCharRef}
                    disabled={avatarSaving}
                    className="font-display text-xs"
                  >
                    {t('avatar.remove')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUseCharacterAvatar}
                  disabled={avatarSaving || charsLoading || ownedChars.length === 0}
                  className="font-display text-xs"
                >
                  <UserCircle className="h-3 w-3 mr-1" />
                  {hasCharAvatar ? t('avatar.swap') : t('avatar.use')}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-8 gap-2">
            {PRESET_AVATARS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handlePresetSelect(emoji)}
                disabled={avatarSaving}
                className={`h-10 w-full rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110 border ${
                  !hasCharAvatar && currentAvatar === `emoji:${emoji}`
                    ? 'border-tactical bg-tactical/20 ring-1 ring-tactical'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                {!hasCharAvatar && currentAvatar === `emoji:${emoji}` && (
                  <Check className="h-3 w-3 text-tactical absolute" />
                )}
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarSaving}
              className="font-display text-xs"
            >
              <Upload className="h-3 w-3 mr-1" />
              {avatarSaving ? t('avatar.uploading') : t('avatar.upload')}
            </Button>
            <span className="text-[10px] text-muted-foreground">{t('avatar.upload_hint')}</span>
          </div>
        </div>

        <div className="stat-card space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> {t('fields.username')}
            </Label>
            <Input value={profile?.username || ''} disabled className="bg-muted/30" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" /> {t('fields.email')}
            </Label>
            <Input value={user?.email || ''} disabled className="bg-muted/30" />
          </div>
        </div>

        <div className="stat-card space-y-4">
          <h2 className="font-display font-semibold text-sm flex items-center gap-1">
            <Lock className="h-4 w-4 text-tactical" /> {t('password.section')}
          </h2>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('password.new')}</Label>
            <Input
              type="password"
              placeholder={t('password.new_placeholder')}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('password.confirm')}</Label>
            <Input
              type="password"
              placeholder={t('password.confirm_placeholder')}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={saving || !newPassword}
            className="w-full"
          >
            {saving ? t('password.saving') : t('password.submit')}
          </Button>
        </div>
      </div>

      {/* ── Character picker modal ── */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-tactical" /> {t('char_picker.title')}
            </DialogTitle>
            <DialogDescription>
              {t('char_picker.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto py-2">
            {ownedChars.map(c => {
              const ref = buildCharRef(c.kind, c.id);
              const isActive = charRef === ref;
              return (
                <button
                  key={ref}
                  onClick={() => saveCharRef(ref)}
                  disabled={avatarSaving}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-all hover:scale-[1.02] ${
                    isActive
                      ? 'border-tactical bg-tactical/10 ring-1 ring-tactical'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-muted/40 flex items-center justify-center">
                    <PlayerAvatar
                      appearance={c.appearance}
                      variant="face"
                      clubPrimaryColor={c.clubPrimaryColor}
                      clubSecondaryColor={c.clubSecondaryColor}
                      playerName={c.name}
                      fallbackSeed={c.id}
                      outfit={c.kind === 'manager' ? 'coach' : 'player'}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-display font-bold leading-tight">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {c.kind === 'player' ? t('char_picker.kind_player') : t('char_picker.kind_manager')}
                    </p>
                  </div>
                  {isActive && <Check className="h-3 w-3 text-tactical" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
