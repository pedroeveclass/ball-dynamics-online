import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Swords, AlertCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ClubOption {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  reputation: number;
}

export default function ManagerMatchCreatePage() {
  const { club, managerProfile } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [awayClubId, setAwayClubId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasLineup, setHasLineup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club) return;
    const load = async () => {
      const [clubsRes, lineupRes] = await Promise.all([
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, reputation').neq('id', club.id),
        supabase.from('lineups').select('id').eq('club_id', club.id).eq('is_active', true).limit(1),
      ]);
      setClubs(clubsRes.data || []);
      setHasLineup((lineupRes.data || []).length > 0);
      setLoading(false);
    };
    load();
    // Default to tomorrow at 20:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);
    setScheduledAt(tomorrow.toISOString().slice(0, 16));
  }, [club]);

  const handleSendChallenge = async () => {
    if (!club || !awayClubId || !scheduledAt || !managerProfile) return;
    setSending(true);

    try {
      // Get manager profile of the challenged club
      const { data: awayClubData } = await supabase
        .from('clubs')
        .select('manager_profile_id')
        .eq('id', awayClubId)
        .single();

      if (!awayClubData?.manager_profile_id) {
        toast.error('Clube adversário não tem manager registrado.');
        setSending(false);
        return;
      }

      // Get away manager's user_id for notification
      const { data: awayMgrData } = await supabase
        .from('manager_profiles')
        .select('user_id, full_name')
        .eq('id', awayClubData.manager_profile_id)
        .single();

      // Create the challenge
      const { data: challenge, error } = await supabase
        .from('match_challenges')
        .insert({
          challenger_club_id: club.id,
          challenged_club_id: awayClubId,
          challenger_manager_profile_id: managerProfile.id,
          challenged_manager_profile_id: awayClubData.manager_profile_id,
          scheduled_at: new Date(scheduledAt).toISOString(),
          message: message.trim() || null,
          status: 'proposed',
        })
        .select('id')
        .single();

      if (error) throw error;

      // Send notification to the challenged manager
      if (awayMgrData?.user_id) {
        await supabase.from('notifications').insert({
          user_id: awayMgrData.user_id,
          title: '⚔️ Convite de Amistoso',
          body: `${club.name} quer jogar um amistoso contra você em ${new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
          type: 'match',
        });
      }

      toast.success('Convite enviado! Aguarde o adversário aceitar.');
      navigate('/manager/challenges');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar convite');
      setSending(false);
    }
  };

  if (loading) return <ManagerLayout><p className="text-muted-foreground">Carregando...</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Swords className="h-6 w-6 text-tactical" /> Convidar para Amistoso
        </h1>

        {!hasLineup && (
          <div className="stat-card border-destructive/30 bg-destructive/5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-display font-bold text-sm">Escalação necessária</p>
              <p className="text-xs text-muted-foreground">Defina uma escalação ativa antes de enviar convite.</p>
            </div>
          </div>
        )}

        <div className="stat-card space-y-5">
          {/* Your club */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Seu Clube (Casa)</p>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-xs font-display font-bold"
                style={{ backgroundColor: club?.primary_color, color: club?.secondary_color }}
              >
                {club?.short_name}
              </div>
              <span className="font-display font-bold">{club?.name}</span>
            </div>
          </div>

          {/* Opponent */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Adversário</Label>
            <Select value={awayClubId} onValueChange={setAwayClubId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o clube adversário" />
              </SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-sm inline-block" style={{ backgroundColor: c.primary_color }} />
                      {c.name} <span className="text-muted-foreground text-xs">Rep: {c.reputation}</span>
                    </span>
                  </SelectItem>
                ))}
                {clubs.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum clube encontrado.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date & time */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data e Hora</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>

          {/* Optional message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensagem (opcional)</Label>
            <Textarea
              placeholder="Escreva uma mensagem para o adversário..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSendChallenge}
            disabled={sending || !awayClubId || !scheduledAt || !hasLineup}
            className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? 'Enviando...' : 'ENVIAR CONVITE'}
          </Button>
        </div>
      </div>
    </ManagerLayout>
  );
}
