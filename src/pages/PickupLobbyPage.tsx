import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Bot, Clock, LogOut, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PICKUP_SLOTS, totalSlotsPerSide, type PickupFormat } from '@/lib/pickupSlots';

const sb = supabase as any;

type PickupRow = {
  id: string;
  created_by_profile_id: string;
  format: PickupFormat;
  formation: string;
  kickoff_at: string;
  status: 'open' | 'materialized' | 'live' | 'finished' | 'cancelled';
  match_id: string | null;
};

type ParticipantRow = {
  participant_id: string;
  player_profile_id: string;
  full_name: string | null;
  primary_position: string | null;
  team_side: 'home' | 'away';
  slot_id: string;
};

const STATUS_INFO: Record<PickupRow['status'], { label: string; className: string }> = {
  open:         { label: 'Aberto',     className: 'bg-primary/10 text-primary border-primary/30' },
  materialized: { label: 'Preparando', className: 'bg-amber-500/20 text-amber-600 border-amber-500/30' },
  live:         { label: '🔴 Ao Vivo', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  finished:     { label: 'Encerrado',  className: 'bg-muted text-muted-foreground border-border' },
  cancelled:    { label: 'Cancelado',  className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'começando…';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}min`;
  }
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function PickupLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playerProfile } = useAuth();
  const [pickup, setPickup] = useState<PickupRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    const { data: pg } = await sb
      .from('pickup_games')
      .select('id, created_by_profile_id, format, formation, kickoff_at, status, match_id')
      .eq('id', id)
      .maybeSingle();
    setPickup(pg as PickupRow | null);

    const { data: parts } = await sb.rpc('get_pickup_lobby', { p_pickup_id: id });
    setParticipants((parts || []) as ParticipantRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: any change to this pickup or its participants refreshes the
  // lobby; the cheap-load approach keeps logic trivial.
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`pickup-lobby-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_games', filter: `id=eq.${id}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_game_participants', filter: `pickup_game_id=eq.${id}` }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  // Countdown tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-redirect to match when materialization happens. Only for players
  // who joined — spectators (creator who left?) stay here.
  useEffect(() => {
    if (!pickup || !playerProfile) return;
    const iJoined = participants.some(p => p.player_profile_id === playerProfile.id);
    if (!iJoined) return;
    if (pickup.match_id && (pickup.status === 'materialized' || pickup.status === 'live')) {
      navigate(`/match/${pickup.match_id}`);
    }
  }, [pickup, participants, playerProfile, navigate]);

  const myPart = useMemo(
    () => (playerProfile ? participants.find(p => p.player_profile_id === playerProfile.id) : undefined),
    [participants, playerProfile],
  );
  const isCreator = !!playerProfile && !!pickup && pickup.created_by_profile_id === playerProfile.id;
  const canJoin = !!pickup && pickup.status === 'open' && !myPart;
  const canLeave = !!pickup && pickup.status === 'open' && !!myPart;

  const handleJoinSlot = async (side: 'home' | 'away', slotId: string) => {
    if (!pickup || !playerProfile) return;
    // If the slot is already taken, ignore.
    if (participants.some(p => p.team_side === side && p.slot_id === slotId)) return;
    setActing(true);
    const { error } = await sb.rpc('join_pickup_game', {
      p_pickup_id: pickup.id,
      p_team_side: side,
      p_slot_id: slotId,
    });
    setActing(false);
    if (error) {
      toast.error(error.message || 'Não foi possível entrar');
      return;
    }
    toast.success('Entrou no jogo!');
  };

  const handleLeave = async () => {
    if (!pickup) return;
    setActing(true);
    const { error } = await sb.rpc('leave_pickup_game', { p_pickup_id: pickup.id });
    setActing(false);
    if (error) { toast.error(error.message || 'Erro ao sair'); return; }
    toast.success('Você saiu do jogo');
  };

  const handleCancel = async () => {
    if (!pickup) return;
    if (!confirm('Tem certeza que quer cancelar este jogo?')) return;
    setActing(true);
    const { error } = await sb.rpc('cancel_pickup_game', { p_pickup_id: pickup.id });
    setActing(false);
    if (error) { toast.error(error.message || 'Erro ao cancelar'); return; }
    toast.success('Jogo cancelado');
  };

  if (loading) {
    return <AppLayout><p className="text-sm text-muted-foreground">Carregando…</p></AppLayout>;
  }
  if (!pickup) {
    return (
      <AppLayout>
        <Card><CardContent className="p-6 text-center">
          <p>Jogo não encontrado.</p>
          <Button asChild variant="link"><Link to="/varzea">Voltar</Link></Button>
        </CardContent></Card>
      </AppLayout>
    );
  }

  const slots = PICKUP_SLOTS[pickup.format];
  const total = totalSlotsPerSide(pickup.format) * 2;
  const filled = participants.length;
  const kickoffMs = new Date(pickup.kickoff_at).getTime() - now;
  const statusInfo = STATUS_INFO[pickup.status];

  const renderSide = (side: 'home' | 'away') => {
    const teamColor = side === 'home' ? '#22c55e' : '#ef4444';
    const teamLabel = side === 'home' ? 'Time da Casa' : 'Time Visitante';
    const rows = slots.map(s => {
      const taken = participants.find(p => p.team_side === side && p.slot_id === s.slot_id);
      return { slot: s, taken };
    });

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: teamColor }} />
            {teamLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map(({ slot, taken }) => {
            const isMine = taken?.player_profile_id === playerProfile?.id;
            return (
              <div
                key={slot.slot_id}
                className={`flex items-center justify-between gap-2 p-2 rounded border ${
                  isMine ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{slot.label}</Badge>
                  <div className="min-w-0 text-sm truncate">
                    {taken ? (
                      <span className="font-medium">
                        {taken.full_name || 'Humano'}
                        {taken.primary_position && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({taken.primary_position})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic flex items-center gap-1">
                        <Bot className="h-3 w-3" /> vaga (vira bot se ninguém entrar)
                      </span>
                    )}
                  </div>
                </div>
                {!taken && canJoin && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting}
                    onClick={() => handleJoinSlot(side, slot.slot_id)}
                  >
                    Entrar
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/varzea"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-xl font-display font-bold">
                {pickup.format === '5v5' ? 'Pelada 5x5' : 'Jogo 11x11'}
              </h1>
              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(pickup.kickoff_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span>{filled}/{total} preenchidos</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={statusInfo.className} variant="outline">{statusInfo.label}</Badge>
            {pickup.status === 'open' && (
              <Badge variant="outline" className="font-mono">
                <Clock className="h-3 w-3 mr-1" />
                {formatCountdown(kickoffMs)}
              </Badge>
            )}
          </div>
        </div>

        {pickup.status === 'cancelled' && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Este jogo foi cancelado pelo criador.
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {renderSide('home')}
          {renderSide('away')}
        </div>

        <div className="flex items-center justify-end gap-2">
          {canLeave && (
            <Button variant="outline" onClick={handleLeave} disabled={acting}>
              <LogOut className="h-4 w-4 mr-2" /> Sair do jogo
            </Button>
          )}
          {isCreator && pickup.status === 'open' && (
            <Button variant="destructive" onClick={handleCancel} disabled={acting}>
              <XCircle className="h-4 w-4 mr-2" /> Cancelar jogo
            </Button>
          )}
          {pickup.match_id && (pickup.status === 'live' || pickup.status === 'materialized') && (
            <Button asChild>
              <Link to={`/match/${pickup.match_id}`}>Ir para a partida</Link>
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
