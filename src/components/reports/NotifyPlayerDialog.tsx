import { useState, useEffect } from 'react';
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
  const [title, setTitle] = useState('Mensagem do técnico');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Suggest a template based on inactivity
    if (daysInactive != null && daysInactive >= 3) {
      setBody(`Oi ${playerName.split(' ')[0]}, notei que você não treina há ${daysInactive} dias. Bora voltar pros treinos pra manter a forma?`);
    } else {
      setBody('');
    }
  }, [open, playerName, daysInactive]);

  const handleSend = async () => {
    if (!playerUserId) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error('Escreva uma mensagem antes de enviar.');
      return;
    }
    setSending(true);
    const { error } = await supabase.from('notifications').insert({
      user_id: playerUserId,
      type: 'system',
      title: title.trim() || 'Mensagem do técnico',
      body: trimmed,
    });
    setSending(false);
    if (error) {
      toast.error('Falha ao enviar notificação.');
      return;
    }
    toast.success(`Notificação enviada para ${playerName}.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notificar {playerName}</DialogTitle>
          <DialogDescription>
            A mensagem aparece no sino de notificações do jogador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Título</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Mensagem</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={500} placeholder="Escreva uma mensagem para o jogador..." />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{body.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || !body.trim()}>
            {sending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
