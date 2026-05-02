import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/formatDate';

interface MilestoneRow {
  id: number;
  body_pt: string;
  body_en: string;
  milestone_type: string | null;
  generated_at: string;
}

// Reads all canonical milestones for a given player and renders them
// chronologically (most recent first). Hides silently when player has
// no milestones yet.
export function PlayerMilestonesTimeline({ playerId }: { playerId: string }) {
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [items, setItems] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('narratives')
        .select('id, body_pt, body_en, milestone_type, generated_at')
        .eq('entity_type', 'player')
        .eq('entity_id', playerId)
        .eq('scope', 'milestone')
        .order('generated_at', { ascending: false });
      if (cancelled) return;
      setItems(data ?? []);
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
  if (items.length === 0) return null;

  return (
    <div className="stat-card space-y-3">
      <div>
        <h2 className="font-display font-semibold text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-tactical" /> {t('milestones.section.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('milestones.section.subtitle')}</p>
      </div>
      <div className="space-y-3">
        {items.map(m => (
          <MilestoneRow key={m.id} milestone={m} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function MilestoneRow({ milestone, lang }: { milestone: MilestoneRow; lang: string }) {
  const body = lang === 'en' ? milestone.body_en : milestone.body_pt;
  return (
    <div className="border-l-2 border-tactical/40 pl-3 py-1">
      <p className="text-[11px] text-muted-foreground font-mono">
        {formatDate(milestone.generated_at, lang as any, 'date_short')}
      </p>
      <p className="text-sm text-foreground leading-relaxed mt-0.5">{body}</p>
    </div>
  );
}

// Convenience wrapper — pulls the active player from auth so PlayerProfilePage
// doesn't need to handle that itself.
export function ActivePlayerMilestonesTimeline() {
  const { playerProfile } = useAuth();
  if (!playerProfile?.id) return null;
  return <PlayerMilestonesTimeline playerId={playerProfile.id} />;
}
