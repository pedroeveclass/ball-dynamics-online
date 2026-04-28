import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NotifyPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerUserId: string | null;
  playerName: string;
  daysInactive?: number | null;
}

export function NotifyPlayerDialog({ open, onOpenChange, playerUserId, playerName, daysInactive }: NotifyPlayerDialogProps) {
  const { t } = useTranslation('notify_player_dialog');
  const [title, setTitle] = useState(() => t('default_title'));
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset title to localized default each time the dialog opens
    setTitle(t('default_title'));
    // Suggest a template based on inactivity
    if (daysInactive != null && daysInactive >= 3) {
      setBody(t('template_inactive', { firstName: playerName.split(' ')[0], days: daysInactive }));
    } else {
      setBody('');
    }
  }, [open, playerName, daysInactive, t]);

  const handleSend = async () => {
    if (!playerUserId) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error(t('toast.empty_message'));
      return;
    }
    setSending(true);
    const { error } = await supabase.from('notifications').insert({
      user_id: playerUserId,
      type: 'system',
      title: title.trim() || t('default_title'),
      body: trimmed,
    });
    setSending(false);
    if (error) {
      toast.error(t('toast.send_error'));
      return;
    }
    toast.success(t('toast.sent', { name: playerName }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: playerName })}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">{t('labels.title')}</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">{t('labels.message')}</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={500} placeholder={t('placeholders.message')} />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{body.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>{t('buttons.cancel')}</Button>
          <Button onClick={handleSend} disabled={sending || !body.trim()}>
            {sending ? t('buttons.sending') : t('buttons.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
