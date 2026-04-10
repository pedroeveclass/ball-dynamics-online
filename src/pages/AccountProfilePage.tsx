import { useState, useRef } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User, Lock, Mail, Upload, Check } from 'lucide-react';

const PRESET_AVATARS = [
  '⚽', '🏟️', '🥅', '🏆', '⭐', '🦁', '🐺', '🦅',
  '🔥', '💎', '👑', '🎯', '⚡', '🛡️', '🗡️', '🎖️',
];

export default function AccountProfilePage() {
  const { user, profile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar_url || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message || 'Erro ao alterar senha.');
    } else {
      toast.success('Senha alterada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
    }
    setSaving(false);
  };

  const saveAvatar = async (avatarUrl: string) => {
    if (!user) return;
    setAvatarSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl } as any)
      .eq('id', user.id);
    if (error) {
      toast.error('Erro ao salvar avatar.');
    } else {
      setSelectedAvatar(avatarUrl);
      toast.success('Avatar atualizado!');
      // Force reload profile
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
      toast.error('A imagem deve ter no máximo 2MB.');
      return;
    }
    // Validate MIME type and extension
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG, WEBP ou GIF.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExts.includes(ext)) {
      toast.error('Extensão de arquivo inválida.');
      return;
    }
    setAvatarSaving(true);
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Erro ao enviar imagem.');
      setAvatarSaving(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    // Add cache buster
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await saveAvatar(publicUrl);
  };

  const currentAvatar = selectedAvatar || profile?.avatar_url || '';

  return (
    <Layout>
      <div className="space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6 text-tactical" /> Perfil da Conta
        </h1>

        {/* Avatar Section */}
        <div className="stat-card space-y-4">
          <h2 className="font-display font-semibold text-sm flex items-center gap-1">
            Seu Avatar
          </h2>

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center overflow-hidden border-2 border-border shrink-0">
              {currentAvatar.startsWith('emoji:') ? (
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
              <p className="text-xs text-muted-foreground">Escolha um ícone ou envie uma imagem</p>
            </div>
          </div>

          <div className="grid grid-cols-8 gap-2">
            {PRESET_AVATARS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handlePresetSelect(emoji)}
                disabled={avatarSaving}
                className={`h-10 w-full rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110 border ${
                  currentAvatar === `emoji:${emoji}`
                    ? 'border-tactical bg-tactical/20 ring-1 ring-tactical'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                {currentAvatar === `emoji:${emoji}` && (
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
              {avatarSaving ? 'Enviando...' : 'Enviar Imagem'}
            </Button>
            <span className="text-[10px] text-muted-foreground">PNG, JPG ou WebP — máx 2MB</span>
          </div>
        </div>

        <div className="stat-card space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Nome de Usuário
            </Label>
            <Input value={profile?.username || ''} disabled className="bg-muted/30" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" /> E-mail
            </Label>
            <Input value={user?.email || ''} disabled className="bg-muted/30" />
          </div>
        </div>

        <div className="stat-card space-y-4">
          <h2 className="font-display font-semibold text-sm flex items-center gap-1">
            <Lock className="h-4 w-4 text-tactical" /> Alterar Senha
          </h2>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nova Senha</Label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Confirmar Nova Senha</Label>
            <Input
              type="password"
              placeholder="Repita a nova senha"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={saving || !newPassword}
            className="w-full"
          >
            {saving ? 'Salvando...' : 'Alterar Senha'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}