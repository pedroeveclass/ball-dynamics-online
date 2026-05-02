import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLanguage } from '@/hooks/useAppLanguage';

// Reads canonical round recap from narratives. Hides silently when no
// recap exists yet (round not finished or generated before this system).
export function RoundRecapCard({ roundId }: { roundId: string }) {
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [recap, setRecap] = useState<{ body_pt: string; body_en: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('narratives')
        .select('body_pt, body_en')
        .eq('entity_type', 'league_round')
        .eq('entity_id', roundId)
        .eq('scope', 'round_recap')
        .maybeSingle();
      if (cancelled) return;
      setRecap(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roundId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!recap) return null;

  const body = lang === 'en' ? recap.body_en : recap.body_pt;

  return (
    <div className="stat-card space-y-2">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-tactical" /> {t('roundRecap.section.title')}
      </h2>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}
