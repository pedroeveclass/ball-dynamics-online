import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, User, CheckCircle2, Circle, Swords, Clock, Play, Eye } from 'lucide-react';

interface MatchData {
  id: string;
  status: string;
  home_score: number;
  away_score: number;
  current_phase: string | null;
  current_turn_number: number;
  scheduled_at: string;
  started_at: string | null;
  home_club_id: string;
  away_club_id: string;
  home_lineup_id: string | null;
  away_lineup_id: string | null;
}

interface ClubInfo {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
}

interface Participant {
  id: string;
  match_id: string;
  player_profile_id: string | null;
  club_id: string;
  lineup_slot_id: string | null;
  role_type: string;
  is_bot: boolean;
  is_ready: boolean;
  connected_user_id: string | null;
  player_name?: string;
  slot_position?: string;
  primary_position?: string;
  overall?: number;
}

interface EventLog {
  id: string;
  event_type: string;
  title: string;
  body: string;
  created_at: string;
}

const PHASE_LABELS: Record<string, string> = {
  pre_match: 'Pré-Jogo',
  ball_holder: 'Portador da Bola',
  attacking_support: 'Apoio Ofensivo',
  defending_response: 'Resposta Defensiva',
  resolution: 'Resolução',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  waiting: 'Aguardando Jogadores',
  live: 'Ao Vivo',
  finished: 'Encerrada',
};

export default function MatchRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, playerProfile, managerProfile, club } = useAuth();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'player' | 'manager' | 'spectator'>('spectator');
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  const loadMatch = useCallback(async () => {
    if (!id) return;
    const { data: m } = await supabase.from('matches').select('*').eq('id', id).single();
    if (!m) return;
    setMatch(m as MatchData);

    const [hc, ac] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.away_club_id).single(),
    ]);
    setHomeClub(hc.data as ClubInfo);
    setAwayClub(ac.data as ClubInfo);

    // Load participants with player info
    const { data: parts } = await supabase.from('match_participants').select('*').eq('match_id', id);
    if (parts && parts.length > 0) {
      const playerIds = parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!);
      const slotIds = parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!);

      const [playersRes, slotsRes] = await Promise.all([
        playerIds.length > 0 ? supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds) : { data: [] },
        slotIds.length > 0 ? supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds) : { data: [] },
      ]);

      const playerMap = new Map((playersRes.data || []).map(p => [p.id, p]));
      const slotMap = new Map((slotsRes.data || []).map(s => [s.id, s]));

      const enriched = parts.map(p => ({
        ...p,
        player_name: p.player_profile_id ? playerMap.get(p.player_profile_id)?.full_name : undefined,
        primary_position: p.player_profile_id ? playerMap.get(p.player_profile_id)?.primary_position : undefined,
        overall: p.player_profile_id ? playerMap.get(p.player_profile_id)?.overall : undefined,
        slot_position: p.lineup_slot_id ? slotMap.get(p.lineup_slot_id)?.slot_position : undefined,
      }));
      setParticipants(enriched);
    } else {
      setParticipants([]);
    }

    // Load events
    const { data: evts } = await supabase.from('match_event_logs').select('*').eq('match_id', id).order('created_at', { ascending: true });
    setEvents(evts || []);

    setLoading(false);
  }, [id]);

  // Determine user role
  useEffect(() => {
    if (!user || participants.length === 0) return;
    const myPart = participants.find(p => p.connected_user_id === user.id);
    if (myPart) {
      setMyRole(myPart.role_type as 'player' | 'manager');
      setMyParticipantId(myPart.id);
    } else {
      setMyRole('spectator');
      setMyParticipantId(null);
    }
  }, [user, participants]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  // Realtime subscriptions
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`match-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, () => loadMatch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants', filter: `match_id=eq.${id}` }, () => loadMatch())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_event_logs', filter: `match_id=eq.${id}` }, (payload) => {
        setEvents(prev => [...prev, payload.new as EventLog]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadMatch]);

  const handleReady = async () => {
    if (!myParticipantId) return;
    const { error } = await supabase.from('match_participants').update({ is_ready: true }).eq('id', myParticipantId);
    if (error) toast.error(error.message);
    else toast.success('Você está pronto!');
  };

  const handleStartMatch = async () => {
    if (!match) return;
    // Mark unready players as bots
    const unready = participants.filter(p => p.role_type === 'player' && !p.is_ready && !p.is_bot);
    for (const u of unready) {
      await supabase.from('match_participants').update({ is_bot: true }).eq('id', u.id);
    }

    await supabase.from('matches').update({ status: 'waiting', current_phase: 'pre_match' }).eq('id', match.id);
    await supabase.from('match_event_logs').insert({
      match_id: match.id,
      event_type: 'system',
      title: 'Sala aberta',
      body: 'Aguardando jogadores ficarem prontos...',
    });
    toast.success('Sala aberta para jogadores!');
  };

  const handleKickoff = async () => {
    if (!match) return;
    await supabase.from('matches').update({
      status: 'live',
      current_phase: 'ball_holder',
      current_turn_number: 1,
      started_at: new Date().toISOString(),
    }).eq('id', match.id);
    await supabase.from('match_event_logs').insert({
      match_id: match.id,
      event_type: 'kickoff',
      title: '⚽ Início da Partida!',
      body: 'A bola está rolando!',
    });
  };

  if (loading || !match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-tactical border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isManager = myRole === 'manager';
  const isHomeManager = isManager && club?.id === match.home_club_id;
  const homePlayers = participants.filter(p => p.club_id === match.home_club_id && p.role_type === 'player');
  const awayPlayers = participants.filter(p => p.club_id === match.away_club_id && p.role_type === 'player');
  const allPlayersReady = participants.filter(p => p.role_type === 'player' && !p.is_bot).every(p => p.is_ready);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="h-5 w-5 text-tactical" />
            <span className="font-display font-bold text-sm">PARTIDA</span>
            <Badge variant="outline" className="font-display text-xs">
              {STATUS_LABELS[match.status] || match.status}
            </Badge>
            {match.current_phase && (
              <Badge className="bg-tactical/20 text-tactical font-display text-xs">
                {PHASE_LABELS[match.current_phase] || match.current_phase}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {myRole === 'spectator' && <Badge variant="secondary" className="text-xs"><Eye className="h-3 w-3 mr-1" /> Espectador</Badge>}
            {myRole === 'player' && <Badge className="bg-pitch/20 text-pitch text-xs"><User className="h-3 w-3 mr-1" /> Jogador</Badge>}
            {myRole === 'manager' && <Badge className="bg-tactical/20 text-tactical text-xs"><User className="h-3 w-3 mr-1" /> Manager</Badge>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Scoreboard */}
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <ClubBadge club={homeClub} />
              <div className="text-center">
                <div className="font-display text-4xl font-extrabold tracking-wider">
                  {match.home_score} <span className="text-muted-foreground mx-2">–</span> {match.away_score}
                </div>
                {match.current_turn_number > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Turno {match.current_turn_number}</p>
                )}
              </div>
              <ClubBadge club={awayClub} />
            </div>
          </div>

          {/* Field */}
          <div className="stat-card p-0 overflow-hidden">
            <div className="relative bg-gradient-to-b from-pitch/30 to-pitch/10 aspect-[16/10]">
              {/* Field markings */}
              <div className="absolute inset-4 border-2 border-pitch/30 rounded-lg">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-pitch/30" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-pitch/30 rounded-full" />
              </div>

              {/* Home team (top half) */}
              {homePlayers.map((p, i) => {
                const cols = Math.min(homePlayers.length, 5);
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = ((col + 1) / (cols + 1)) * 100;
                const y = 10 + row * 18;
                return (
                  <PlayerDot key={p.id} participant={p} x={x} y={y} color={homeClub?.primary_color || '#1a5276'} textColor={homeClub?.secondary_color || '#fff'} />
                );
              })}

              {/* Away team (bottom half) */}
              {awayPlayers.map((p, i) => {
                const cols = Math.min(awayPlayers.length, 5);
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = ((col + 1) / (cols + 1)) * 100;
                const y = 90 - row * 18;
                return (
                  <PlayerDot key={p.id} participant={p} x={x} y={y} color={awayClub?.primary_color || '#c0392b'} textColor={awayClub?.secondary_color || '#fff'} />
                );
              })}
            </div>
          </div>

          {/* Manager actions */}
          {isHomeManager && match.status === 'scheduled' && (
            <Button onClick={handleStartMatch} className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
              <Play className="h-4 w-4 mr-2" /> ABRIR SALA DE JOGO
            </Button>
          )}
          {isHomeManager && match.status === 'waiting' && allPlayersReady && (
            <Button onClick={handleKickoff} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
              <Swords className="h-4 w-4 mr-2" /> INICIAR PARTIDA
            </Button>
          )}
          {myRole === 'player' && match.status === 'waiting' && !participants.find(p => p.connected_user_id === user?.id)?.is_ready && (
            <Button onClick={handleReady} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
              <CheckCircle2 className="h-4 w-4 mr-2" /> ESTOU PRONTO
            </Button>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Participants */}
          <div className="stat-card">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <User className="h-4 w-4" /> Participantes
            </h3>
            <TeamParticipants label={homeClub?.name || 'Casa'} players={homePlayers} color={homeClub?.primary_color} />
            <div className="border-t border-border my-3" />
            <TeamParticipants label={awayClub?.name || 'Fora'} players={awayPlayers} color={awayClub?.primary_color} />
          </div>

          {/* Event log */}
          <div className="stat-card">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Log da Partida
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento ainda.</p>}
              {events.map(e => (
                <div key={e.id} className="text-xs border-l-2 border-tactical/30 pl-2">
                  <p className="font-display font-bold">{e.title}</p>
                  {e.body && <p className="text-muted-foreground">{e.body}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClubBadge({ club }: { club: ClubInfo | null }) {
  if (!club) return <div className="w-12 h-12 rounded-lg bg-muted animate-pulse" />;
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-display text-sm font-extrabold"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}>
        {club.short_name}
      </div>
      <span className="font-display font-bold text-sm hidden sm:block">{club.name}</span>
    </div>
  );
}

function PlayerDot({ participant: p, x, y, color, textColor }: { participant: Participant; x: number; y: number; color: string; textColor: string }) {
  return (
    <div className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-display font-bold border-2 border-background/50 shadow-md relative"
        style={{ backgroundColor: color, color: textColor }}>
        {p.slot_position || '?'}
        {p.is_bot && <Bot className="absolute -top-1 -right-1 h-3 w-3 text-amber-400" />}
        {p.is_ready && !p.is_bot && <CheckCircle2 className="absolute -top-1 -right-1 h-3 w-3 text-pitch" />}
      </div>
      <span className="text-[9px] font-display text-foreground/70 whitespace-nowrap max-w-16 truncate">
        {p.player_name || 'Bot'}
      </span>
    </div>
  );
}

function TeamParticipants({ label, players, color }: { label: string; players: Participant[]; color?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color || '#888' }} />
        <span className="font-display text-xs font-bold">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{players.length} jogadores</span>
      </div>
      <div className="space-y-1">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-xs">
            {p.is_bot ? <Bot className="h-3 w-3 text-amber-500" /> : <User className="h-3 w-3 text-pitch" />}
            <span className="font-display">{p.player_name || 'Bot'}</span>
            {p.slot_position && <Badge variant="outline" className="text-[10px] py-0 px-1">{p.slot_position}</Badge>}
            {p.overall && <span className="ml-auto text-muted-foreground">{p.overall}</span>}
            {!p.is_bot && (
              p.is_ready
                ? <CheckCircle2 className="h-3 w-3 text-pitch ml-auto" />
                : <Circle className="h-3 w-3 text-muted-foreground ml-auto" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
