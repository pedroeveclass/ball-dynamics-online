import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLanguage } from '@/hooks/useAppLanguage';

// Reads the canonical origin story from narratives and renders the
// PT or EN body based on the current UI language. Hides itself when
// no story exists (e.g. backfill flow not completed yet).
export function OriginStoryCard({ playerId }: { playerId: string }) {
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [story, setStory] = useState<{ body_pt: string; body_en: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('narratives')
        .select('body_pt, body_en')
        .eq('entity_type', 'player')
        .eq('entity_id', playerId)
        .eq('scope', 'origin_story')
        .maybeSingle();
      if (cancelled) return;
      setStory(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!story) return null;

  const body = lang === 'en' ? story.body_en : story.body_pt;

  return (
    <div className="stat-card space-y-2">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-tactical" /> {t('originStory.section.title')}
      </h2>
      <p className="text-sm text-foreground leading-relaxed">{body}</p>
    </div>
  );
}
