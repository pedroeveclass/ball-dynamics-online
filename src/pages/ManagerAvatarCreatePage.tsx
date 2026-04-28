import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AvatarCreator } from '@/components/AvatarCreator';
import { PlayerAppearance } from '@/lib/avatar';
import { invalidateCharAvatar, buildCharRef } from '@/lib/charAvatar';
import { toast } from 'sonner';

export default function ManagerAvatarCreatePage() {
  const { t } = useTranslation('manager_avatar');
  const { managerProfile, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Editing is one-shot: if the manager already has an appearance, bounce back.
  useEffect(() => {
    if (managerProfile && (managerProfile as any).appearance != null) {
      navigate('/manager/club', { replace: true });
    }
  }, [managerProfile, navigate]);

  const handleSubmit = async (appearance: PlayerAppearance) => {
    if (!managerProfile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('manager_profiles')
        .update({ appearance: appearance as any } as any)
        .eq('id', managerProfile.id);
      if (error) throw error;
      invalidateCharAvatar(buildCharRef('manager', managerProfile.id));
      await refreshManagerProfile();
      toast.success(t('toast.saved'));
      navigate('/manager/club', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast.save_error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!managerProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6 pt-4">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">
            {t('subtitle')}
          </p>
          <p className="mt-2 text-xs text-amber-300/80 font-display">
            {t('warning')}
          </p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <AvatarCreator
            playerName={managerProfile.full_name}
            outfit="coach"
            onConfirm={handleSubmit}
            confirmLabel={t('confirm_label')}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
