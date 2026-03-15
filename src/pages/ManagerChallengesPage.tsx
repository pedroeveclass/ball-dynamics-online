import { useEffect, useState, useCallback } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Swords, Clock, CheckCircle2, XCircle, Ban, Send, Plus, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Challenge {
  id: string;
  challenger_club_id: string;
  challenged_club_id: string;
  challenger_manager_profile_id: string;
  challenged_manager_profile_id: string | null;
  scheduled_at: string;
  message: string | null;
  status: string;
  match_id: string | null;
  created_at: string;
  challenger_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
  challenged_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  proposed: { label: 'Aguardando', className: 'bg-warning/20 text-warning border-warning/30' },
  accepted: { label: 'Aceito', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  rejected: { label: 'Recusado', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: 'Expirado', className: 'bg-muted text-muted-foreground border-border' },
};

export default function ManagerChallengesPage() {
  const { club, managerProfile } = useAuth();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    if (!club) return;
    const { data } = await supabase
      .from('match_challenges')
      .select('*')
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Enrich with club info
    const clubIds = [...new Set(data.flatMap(c => [c.challenger_club_id, c.challenged_club_id]))];
    const { data: clubsData } = await supabase
      .from('clubs')
      .select('id, name, short_name, primary_color, secondary_color')
      .in('id', clubIds);

    const clubMap = new Map((clubsData || []).map(c => [c.id, c]));

    const enriched = data.map(c => ({
      ...c,
      challenger_club: clubMap.get(c.challenger_club_id),
      challenged_club: clubMap.get(c.challenged_club_id),
    }));

    setChallenges(enriched);
    setLoading(false);
  }, [club]);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  const handleAccept = async (challenge: Challenge) => {
    if (!club || !managerProfile) return;
    setActing(challenge.id);
    try {
      // Get both active lineups
      const [homeLineupRes, awayLineupRes] = await Promise.all([
        supabase.from('lineups').select('id').eq('club_id', challenge.challenger_club_id).eq('is_active', true).limit(1).single(),
        supabase.from('lineups').select('id').eq('club_id', challenge.challenged_club_id).eq('is_active', true).limit(1).single(),
      ]);

      if (!homeLineupRes.data) {
        toast.error('O clube desafiante não tem escalação ativa.');
        setActing(null);
        return;
      }
      if (!awayLineupRes.data) {
        toast.error('Você precisa definir uma escalação ativa antes de aceitar.');
        setActing(null);
        return;
      }

      // Create the match
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          home_club_id: challenge.challenger_club_id,
          away_club_id: challenge.challenged_club_id,
          home_lineup_id: homeLineupRes.data.id,
          away_lineup_id: awayLineupRes.data.id,
          status: 'scheduled',
          current_phase: 'pre_match',
          scheduled_at: challenge.scheduled_at,
        })
        .select('id')
        .single();

      if (matchError) throw matchError;

      // Get lineup slots for both lineups
      const { data: slots } = await supabase
        .from('lineup_slots')
        .select('id, lineup_id, player_profile_id, slot_position, role_type')
        .in('lineup_id', [homeLineupRes.data.id, awayLineupRes.data.id]);

      // Get player user_ids
      const playerIds = (slots || []).filter(s => s.player_profile_id).map(s => s.player_profile_id!);
      const { data: players } = playerIds.length > 0
        ? await supabase.from('player_profiles').select('id, user_id').in('id', playerIds)
        : { data: [] };
      const playerUserMap = new Map((players || []).map(p => [p.id, p.user_id]));

      // Create player participants
      const participants = (slots || []).map(slot => {
        const clubId = slot.lineup_id === homeLineupRes.data!.id
          ? challenge.challenger_club_id
          : challenge.challenged_club_id;
        const userId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
        return {
          match_id: match!.id,
          player_profile_id: slot.player_profile_id || null,
          club_id: clubId,
          lineup_slot_id: slot.id,
          role_type: 'player',
          is_bot: !userId,
          is_ready: false,
          connected_user_id: userId || null,
        };
      });

      if (participants.length > 0) {
        const { error: partError } = await supabase.from('match_participants').insert(participants);
        if (partError) throw partError;
      }

      // Add manager participants
      const { data: challengerMgr } = await supabase
        .from('manager_profiles')
        .select('user_id')
        .eq('id', challenge.challenger_manager_profile_id)
        .single();

      const managerParticipants = [];
      if (challengerMgr?.user_id) {
        managerParticipants.push({
          match_id: match!.id,
          club_id: challenge.challenger_club_id,
          role_type: 'manager',
          is_bot: false,
          is_ready: false,
          connected_user_id: challengerMgr.user_id,
        });
      }
      managerParticipants.push({
        match_id: match!.id,
        club_id: challenge.challenged_club_id,
        role_type: 'manager',
        is_bot: false,
        is_ready: false,
        connected_user_id: (await supabase.auth.getUser()).data.user?.id || null,
      });

      await supabase.from('match_participants').insert(managerParticipants);

      // Log event
      await supabase.from('match_event_logs').insert({
        match_id: match!.id,
        event_type: 'system',
        title: '⚔️ Amistoso agendado',
        body: `${challenge.challenger_club?.name} vs ${challenge.challenged_club?.name} — ${format(new Date(challenge.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });

      // Update challenge status and link match
      await supabase
        .from('match_challenges')
        .update({ status: 'accepted', match_id: match!.id })
        .eq('id', challenge.id);

      // Notify challenger
      if (challengerMgr?.user_id) {
        await supabase.from('notifications').insert({
          user_id: challengerMgr.user_id,
          title: '✅ Convite aceito!',
          body: `${challenge.challenged_club?.name} aceitou o amistoso. A partida está agendada!`,
          type: 'match_challenge_accepted',
        });
      }

      toast.success('Amistoso aceito! Partida criada.');
      loadChallenges();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aceitar convite');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (challenge: Challenge) => {
    setActing(challenge.id);
    try {
      await supabase.from('match_challenges').update({ status: 'rejected' }).eq('id', challenge.id);

      // Notify challenger
      const { data: challengerMgr } = await supabase
        .from('manager_profiles')
        .select('user_id')
        .eq('id', challenge.challenger_manager_profile_id)
        .single();

      if (challengerMgr?.user_id) {
        await supabase.from('notifications').insert({
          user_id: challengerMgr.user_id,
          title: '❌ Convite recusado',
          body: `${challenge.challenged_club?.name} recusou o convite de amistoso.`,
          type: 'match_challenge_rejected',
        });
      }

      toast.success('Convite recusado.');
      loadChallenges();
    } catch (err: any) {
      toast.error(err.message || 'Erro');
    } finally {
      setActing(null);
    }
  };

  const handleCancel = async (challenge: Challenge) => {
    setActing(challenge.id);
    try {
      await supabase.from('match_challenges').update({ status: 'cancelled' }).eq('id', challenge.id);
      toast.success('Convite cancelado.');
      loadChallenges();
    } catch (err: any) {
      toast.error(err.message || 'Erro');
    } finally {
      setActing(null);
    }
  };

  const isMyChallengeReceived = (c: Challenge) => c.challenged_club_id === club?.id;
  const isMyChallengeOut = (c: Challenge) => c.challenger_club_id === club?.id;

  const received = challenges.filter(isMyChallengeReceived);
  const sent = challenges.filter(isMyChallengeOut);

  if (loading) return <ManagerLayout><p className="text-muted-foreground">Carregando...</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-tactical" /> Amistosos
          </h1>
          <Link to="/manager/match/create">
            <Button size="sm" className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
              <Plus className="h-4 w-4 mr-1" /> Enviar Convite
            </Button>
          </Link>
        </div>

        {/* Received */}
        <section>
          <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
            Convites Recebidos ({received.length})
          </h2>
          {received.length === 0 && (
            <div className="stat-card text-center py-8">
              <p className="text-muted-foreground text-sm">Nenhum convite recebido ainda.</p>
            </div>
          )}
          <div className="space-y-3">
            {received.map(c => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                direction="received"
                isActing={acting === c.id}
                onAccept={() => handleAccept(c)}
                onReject={() => handleReject(c)}
                onViewMatch={() => c.match_id && navigate(`/match/${c.match_id}`)}
              />
            ))}
          </div>
        </section>

        {/* Sent */}
        <section>
          <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
            Convites Enviados ({sent.length})
          </h2>
          {sent.length === 0 && (
            <div className="stat-card text-center py-8">
              <p className="text-muted-foreground text-sm">Nenhum convite enviado ainda.</p>
            </div>
          )}
          <div className="space-y-3">
            {sent.map(c => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                direction="sent"
                isActing={acting === c.id}
                onCancel={() => handleCancel(c)}
                onViewMatch={() => c.match_id && navigate(`/match/${c.match_id}`)}
              />
            ))}
          </div>
        </section>
      </div>
    </ManagerLayout>
  );
}

function ChallengeCard({
  challenge: c,
  direction,
  isActing,
  onAccept,
  onReject,
  onCancel,
  onViewMatch,
}: {
  challenge: Challenge;
  direction: 'received' | 'sent';
  isActing: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onViewMatch?: () => void;
}) {
  const statusInfo = STATUS_INFO[c.status] || { label: c.status, className: 'bg-muted text-muted-foreground' };
  const opponent = direction === 'received' ? c.challenger_club : c.challenged_club;
  const scheduled = new Date(c.scheduled_at);

  return (
    <div className="stat-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {opponent && (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-sm shrink-0"
              style={{ backgroundColor: opponent.primary_color, color: opponent.secondary_color }}
            >
              {opponent.short_name}
            </div>
          )}
          <div>
            <p className="font-display font-bold text-sm">{opponent?.name || '—'}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <CalendarClock className="h-3 w-3" />
              {format(scheduled, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${statusInfo.className}`}>
          {statusInfo.label}
        </Badge>
      </div>

      {c.message && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{c.message}</p>
      )}

      <div className="flex items-center gap-2">
        {/* Received: pending → accept/reject */}
        {direction === 'received' && c.status === 'proposed' && (
          <>
            <Button size="sm" disabled={isActing} onClick={onAccept}
              className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Aceitar
            </Button>
            <Button size="sm" variant="outline" disabled={isActing} onClick={onReject}
              className="text-xs font-display border-destructive/40 text-destructive hover:bg-destructive/10">
              <XCircle className="h-3 w-3 mr-1" /> Recusar
            </Button>
          </>
        )}
        {/* Sent: pending → cancel */}
        {direction === 'sent' && c.status === 'proposed' && (
          <Button size="sm" variant="outline" disabled={isActing} onClick={onCancel}
            className="text-xs font-display border-muted text-muted-foreground hover:bg-muted/50">
            <Ban className="h-3 w-3 mr-1" /> Cancelar
          </Button>
        )}
        {/* View match if exists */}
        {c.match_id && (
          <Button size="sm" variant="outline" onClick={onViewMatch}
            className="text-xs font-display ml-auto">
            <Swords className="h-3 w-3 mr-1" /> Ver Partida
          </Button>
        )}
      </div>
    </div>
  );
}
