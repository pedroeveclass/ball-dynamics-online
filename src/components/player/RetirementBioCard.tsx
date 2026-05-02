import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLanguage } from '@/hooks/useAppLanguage';

// Reads the canonical retirement_bio narrative for a player. Hides
// silently when no bio exists (player not retired or bio not generated).
export function RetirementBioCard({ playerId }: { playerId: string }) {
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [bio, setBio] = useState<{ body_pt: string; body_en: string } | null>(null);
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
        .eq('scope', 'retirement_bio')
        .maybeSingle();
      if (cancelled) return;
      setBio(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!bio) return null;

  const body = lang === 'en' ? bio.body_en : bio.body_pt;

  return (
    <div className="stat-card space-y-2 border-amber-500/40 bg-amber-500/5">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <Award className="h-4 w-4" /> {t('retirement.section.title')}
      </h2>
      <p className="text-sm text-foreground leading-relaxed">{body}</p>
    </div>
  );
}
