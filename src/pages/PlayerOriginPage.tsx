import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { OriginQuestionsStandalone } from '@/components/onboarding/OriginQuestionsForm';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { assembleOriginStoryBilingual, type OriginAnswers } from '@/lib/narratives/originStory';

// Standalone backfill page for players created before the origin story
// system rolled out. PlayerRoute redirects here when origin_start is null.
// Once submitted, the player_profiles row is updated and a canonical
// narrative is inserted, so the redirect won't fire next time.
export default function PlayerOriginPage() {
  const { user, playerProfile, refreshPlayerProfile, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('narratives');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Already answered → bounce out (defensive; PlayerRoute handles the
    // forward case, this catches users who navigate here directly).
    if (!loading && playerProfile && (playerProfile as any).origin_start) {
      navigate('/player', { replace: true });
    }
  }, [loading, playerProfile, navigate]);

  const handleSubmit = async (answers: OriginAnswers) => {
    if (!playerProfile || !user) return;
    setSubmitting(true);
    try {
      let clubName: string | null = null;
      if (playerProfile.club_id) {
        const { data: club } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', playerProfile.club_id)
          .maybeSingle();
        clubName = club?.name ?? null;
      }

      const { body_pt, body_en } = assembleOriginStoryBilingual({
        name: playerProfile.full_name,
        clubName,
        answers,
      });

      const { error } = await (supabase as any).rpc('save_player_origin', {
        p_player_id: playerProfile.id,
        p_origin_start: answers.scene,
        p_origin_inspiration: answers.mentor,
        p_origin_spark: answers.spark,
        p_origin_obstacle: answers.obstacle,
        p_origin_trait: answers.trait,
        p_origin_dream: answers.dream,
        p_body_pt: body_pt,
        p_body_en: body_en,
        p_facts_json: { ...answers, free_agent: !clubName },
      });
      if (error) throw error;

      await refreshPlayerProfile();
      toast.success(t('originStory.section.title'));
      navigate('/player', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !playerProfile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {t('originStory.section.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('originStory.section.subtitle')}
          </p>
        </div>
        <div className="stat-card">
          <OriginQuestionsStandalone onSubmit={handleSubmit} submitting={submitting} />
        </div>
      </div>
    </AppLayout>
  );
}
