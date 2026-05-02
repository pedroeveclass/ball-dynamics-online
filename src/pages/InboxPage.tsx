import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, Loader2, Check } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';

interface DigestRow {
  id: number;
  body_pt: string;
  body_en: string;
  generated_at: string;
  read_at: string | null;
  round_number: number | null;
  season_id: string | null;
}

export default function InboxPage() {
  const { managerProfile, playerProfile, user } = useAuth();
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [items, setItems] = useState<DigestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('user_digests')
        .select('id, body_pt, body_en, generated_at, read_at, round_number, season_id')
        .order('generated_at', { ascending: false });
      if (cancelled) return;
      const list = (data ?? []) as DigestRow[];
      setItems(list);
      if (list.length > 0) setSelectedId(list[0].id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const Layout = managerProfile ? ManagerLayout : AppLayout;
  const selected = items.find(i => i.id === selectedId) ?? null;

  const markRead = async (id: number) => {
    await (supabase as any).rpc('mark_digest_read', { p_digest_id: id });
    setItems(prev => prev.map(i => i.id === id ? { ...i, read_at: new Date().toISOString() } : i));
  };

  const renderBody = (d: DigestRow) => lang === 'en' ? d.body_en : d.body_pt;

  return (
    <Layout>
      <div className="space-y-4 max-w-4xl">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-tactical" />
            {t('weeklyDigest.inbox.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('weeklyDigest.inbox.subtitle')}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t('weeklyDigest.inbox.empty_title')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('weeklyDigest.inbox.empty_subtitle')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1 stat-card p-2 max-h-[70vh] overflow-y-auto">
              <ul className="divide-y">
                {items.map(d => {
                  const isActive = d.id === selectedId;
                  const isUnread = d.read_at == null;
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => { setSelectedId(d.id); if (isUnread) markRead(d.id); }}
                        className={`w-full text-left px-2 py-2 rounded-md transition-colors ${
                          isActive ? 'bg-tactical/10' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm ${isUnread ? 'font-bold' : 'font-normal'}`}>
                            {t('weeklyDigest.inbox.item_title', { round: d.round_number ?? '?' })}
                          </span>
                          {isUnread && <span className="h-2 w-2 rounded-full bg-pitch shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(d.generated_at, lang as any, 'date_short')}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="md:col-span-2 stat-card max-h-[70vh] overflow-y-auto">
              {selected ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-semibold">
                      {t('weeklyDigest.inbox.item_title', { round: selected.round_number ?? '?' })}
                    </h2>
                    {selected.read_at && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3" /> {t('weeklyDigest.inbox.read')}
                      </span>
                    )}
                  </div>
                  <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground">
                    {renderBody(selected)}
                  </pre>
                  {!selected.read_at && (
                    <Button variant="outline" size="sm" onClick={() => markRead(selected.id)}>
                      {t('weeklyDigest.inbox.mark_read')}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('weeklyDigest.inbox.select_item')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
