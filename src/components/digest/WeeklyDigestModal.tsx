import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Newspaper } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';

interface DigestRow {
  id: number;
  body_pt: string;
  body_en: string;
  generated_at: string;
  read_at: string | null;
  round_number: number | null;
}

// Auto-pops at first login of the week with the latest unread weekly
// digest. The user can dismiss (mark as read) or open the inbox for
// previous digests. After dismiss, the modal stays closed for the
// session — won't re-pop on tab switches.
export function WeeklyDigestModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<DigestRow | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('user_digests')
        .select('id, body_pt, body_en, generated_at, read_at, round_number')
        .is('read_at', null)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setDigest(data);
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleDismiss = async () => {
    if (!digest) { setOpen(false); return; }
    setMarking(true);
    try {
      await (supabase as any).rpc('mark_digest_read', { p_digest_id: digest.id });
    } catch { /* swallow */ }
    setMarking(false);
    setOpen(false);
  };

  const handleOpenInbox = async () => {
    await handleDismiss();
    navigate('/inbox');
  };

  if (!digest) return null;
  const body = lang === 'en' ? digest.body_en : digest.body_pt;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-tactical" />
            {t('weeklyDigest.modal.title')}
          </DialogTitle>
        </DialogHeader>
        <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground">{body}</pre>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleOpenInbox} disabled={marking}>
            {t('weeklyDigest.modal.open_inbox')}
          </Button>
          <Button onClick={handleDismiss} disabled={marking}>
            {t('weeklyDigest.modal.mark_read')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
