import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Bot, User, Swords, Clock, Eye, Zap,
  ArrowRight, Target, Shield, Move
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
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
  possession_club_id: string | null;
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
  connected_user_id: string | null;
  pos_x: number | null;
  pos_y: number | null;
  player_name?: string;
  slot_position?: string;
  overall?: number;
}

interface MatchTurn {
  id: string;
  turn_number: number;
  phase: string;
  possession_club_id: string | null;
  ball_holder_participant_id: string | null;
  started_at: string;
  ends_at: string;
  status: string;
}

interface EventLog {
  id: string;
  event_type: string;
  title: string;
  body: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  ball_holder: 'Portador da Bola',
  attacking_support: 'Apoio Ofensivo',
  defending_response: 'Resposta Defensiva',
  resolution: 'Resolução',
  pre_match: 'Pré-jogo',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  live: '🔴 Ao Vivo',
  finished: 'Encerrada',
};

const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  move:      { label: 'Mover',        icon: <Move className="h-3 w-3" />,       color: 'bg-secondary text-secondary-foreground' },
  pass_low:  { label: 'Passe Curto',  icon: <ArrowRight className="h-3 w-3" />, color: 'bg-tactical/20 text-tactical' },
  pass_high: { label: 'Passe Longo',  icon: <ArrowRight className="h-3 w-3" />, color: 'bg-tactical/30 text-tactical' },
  shoot:     { label: 'Chutar',       icon: <Target className="h-3 w-3" />,     color: 'bg-pitch/20 text-pitch' },
  press:     { label: 'Pressionar',   icon: <Zap className="h-3 w-3" />,        color: 'bg-warning/20 text-warning' },
  intercept: { label: 'Interceptar',  icon: <Shield className="h-3 w-3" />,     color: 'bg-destructive/20 text-destructive' },
  block_lane:{ label: 'Bloquear',     icon: <Shield className="h-3 w-3" />,     color: 'bg-muted text-muted-foreground' },
};

const PHASE_ACTIONS: Record<string, string[]> = {
  ball_holder:          ['pass_low', 'pass_high', 'shoot', 'move'],
  attacking_support:    ['move', 'pass_low'],
  defending_response:   ['press', 'intercept', 'block_lane', 'move'],
  resolution:           ['pass_low', 'shoot', 'move'],
};

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

// ─── Main Component ───────────────────────────────────────────
export default function MatchRoomPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const { user, playerProfile, managerProfile, club } = useAuth();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTurn, setActiveTurn] = useState<MatchTurn | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'player' | 'manager' | 'spectator'>('spectator');
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(0);
  const [submittingAction, setSubmittingAction] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // ── Load match data ──────────────────────────────────────────
  const loadMatch = useCallback(async () => {
    if (!matchId) return;

    // Auto-promote scheduled → live if time has come (client-side trigger)
    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!m) return;

    // If it's past scheduled time and still scheduled, call engine to auto-start
    if (m.status === 'scheduled' && new Date(m.scheduled_at) <= new Date()) {
      await callEngine({ action: 'auto_start' });
      // Re-fetch
      const { data: updated } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (updated) setMatch(updated as MatchData);
      else setMatch(m as MatchData);
    } else {
      setMatch(m as MatchData);
    }

    const [hc, ac] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.away_club_id).single(),
    ]);
    setHomeClub(hc.data as ClubInfo);
    setAwayClub(ac.data as ClubInfo);

    // Participants
    const { data: parts } = await supabase.from('match_participants').select('*').eq('match_id', matchId);
    if (parts && parts.length > 0) {
      const playerIds = parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!);
      const slotIds = parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!);

      const [playersRes, slotsRes] = await Promise.all([
        playerIds.length > 0 ? supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds) : { data: [] },
        slotIds.length > 0 ? supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds) : { data: [] },
      ]);

      const playerMap = new Map((playersRes.data || []).map(p => [p.id, p]));
      const slotMap = new Map((slotsRes.data || []).map(s => [s.id, s]));

      const enriched: Participant[] = parts.map(p => ({
        ...p,
        player_name: p.player_profile_id ? playerMap.get(p.player_profile_id)?.full_name : undefined,
        overall: p.player_profile_id ? playerMap.get(p.player_profile_id)?.overall : undefined,
        slot_position: p.lineup_slot_id ? slotMap.get(p.lineup_slot_id)?.slot_position : undefined,
      }));
      setParticipants(enriched);
    } else {
      setParticipants([]);
    }

    // Active turn
    const { data: turn } = await supabase
      .from('match_turns')
      .select('*')
      .eq('match_id', matchId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveTurn(turn as MatchTurn | null);

    // Events
    const { data: evts } = await supabase
      .from('match_event_logs')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
      .limit(50);
    setEvents(evts || []);

    setLoading(false);
  }, [matchId]);

  // ── Determine user role ─────────────────────────────────────
  useEffect(() => {
    if (!user || participants.length === 0) return;
    const myPart = participants.find(p => p.connected_user_id === user.id && p.role_type === 'player');
    const myMgr = participants.find(p => p.connected_user_id === user.id && p.role_type === 'manager');
    if (myPart) {
      setMyRole('player');
      setMyParticipant(myPart);
      setSelectedParticipantId(myPart.id);
    } else if (myMgr) {
      setMyRole('manager');
      setMyParticipant(myMgr);
    } else {
      setMyRole('spectator');
      setMyParticipant(null);
    }
  }, [user, participants]);

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => { loadMatch(); }, [loadMatch]);

  // ── Phase countdown timer ────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!activeTurn || match?.status !== 'live') return;

    tickRef.current = setInterval(() => {
      const remaining = Math.max(0, new Date(activeTurn.ends_at).getTime() - Date.now());
      setPhaseTimeLeft(Math.ceil(remaining / 1000));
    }, 250);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeTurn, match?.status]);

  // ── Engine tick: call match-engine to advance phases ─────────
  useEffect(() => {
    if (engineRef.current) clearInterval(engineRef.current);
    if (match?.status !== 'live' || !matchId) return;

    const tick = async () => {
      await callEngine({ action: 'tick', match_id: matchId });
      // Refresh state after tick
      const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (m) setMatch(m as MatchData);

      const { data: turn } = await supabase
        .from('match_turns')
        .select('*')
        .eq('match_id', matchId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveTurn(turn as MatchTurn | null);
    };

    // Poll every 2 seconds to check if phase has expired
    engineRef.current = setInterval(tick, 2000);
    return () => { if (engineRef.current) clearInterval(engineRef.current); };
  }, [match?.status, matchId]);

  // ── Realtime ─────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase.channel(`match-room-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (p) => {
        setMatch(p.new as MatchData);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_turns', filter: `match_id=eq.${matchId}` }, () => {
        supabase.from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
          .then(({ data }) => setActiveTurn(data as MatchTurn | null));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_event_logs', filter: `match_id=eq.${matchId}` }, (p) => {
        setEvents(prev => [...prev, p.new as EventLog]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // ── Auto-scroll event log ────────────────────────────────────
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // ── Helpers ──────────────────────────────────────────────────
  const callEngine = async (body: Record<string, unknown>) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: session ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify(body),
        }
      );
    } catch (e) {
      console.error('Engine call failed:', e);
    }
  };

  const submitAction = async (actionType: string, targetParticipantId?: string) => {
    if (!matchId || !selectedParticipantId) return;
    setSubmittingAction(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: session ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({
            action: 'submit_action',
            match_id: matchId,
            participant_id: selectedParticipantId,
            action_type: actionType,
            target_participant_id: targetParticipantId,
          }),
        }
      );
      const result = await resp.json();
      if (result.error) toast.error(result.error);
      else toast.success(`Ação enviada: ${ACTION_LABELS[actionType]?.label || actionType}`);
    } catch {
      toast.error('Erro ao enviar ação');
    } finally {
      setSubmittingAction(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  if (loading || !match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-tactical border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isManager = myRole === 'manager';
  const isPlayer = myRole === 'player';
  const homePlayers = participants.filter(p => p.club_id === match.home_club_id && p.role_type === 'player');
  const awayPlayers = participants.filter(p => p.club_id === match.away_club_id && p.role_type === 'player');
  const myClubId = club?.id || myParticipant?.club_id;
  const myClubPlayers = isManager ? participants.filter(p => p.club_id === myClubId && p.role_type === 'player') : [];

  const availableActions = activeTurn ? (PHASE_ACTIONS[activeTurn.phase] || []) : [];
  const isBallHolder = activeTurn?.ball_holder_participant_id === selectedParticipantId;
  const possClubId = match.possession_club_id;
  const hasPossession = possClubId === myClubId;

  // Determine which actions are valid in current phase for the selected participant
  const canAct = isLive && activeTurn && activeTurn.status === 'active' && selectedParticipantId && (
    (isPlayer && myParticipant?.id === selectedParticipantId) ||
    (isManager && myClubPlayers.some(p => p.id === selectedParticipantId))
  );

  const filteredActions = availableActions.filter(a => {
    if (activeTurn?.phase === 'ball_holder' && !isBallHolder) return false;
    if (activeTurn?.phase === 'attacking_support' && (!hasPossession || isBallHolder)) return false;
    if (activeTurn?.phase === 'defending_response' && hasPossession) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Swords className="h-4 w-4 text-tactical shrink-0" />
            <span className="font-display font-bold text-xs uppercase tracking-wide">Partida</span>
            <Badge variant="outline" className={`text-xs font-display ${isLive ? 'border-pitch/50 text-pitch' : ''}`}>
              {STATUS_LABELS[match.status] || match.status}
            </Badge>
            {match.current_phase && isLive && (
              <Badge className="bg-tactical/20 text-tactical font-display text-xs border-tactical/30">
                {PHASE_LABELS[match.current_phase] || match.current_phase}
              </Badge>
            )}
            {isLive && match.current_turn_number > 0 && (
              <span className="text-xs text-muted-foreground font-display">Turno {match.current_turn_number}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myRole === 'spectator' && <Badge variant="secondary" className="text-xs"><Eye className="h-3 w-3 mr-1" />Espectador</Badge>}
            {isPlayer && <Badge className="bg-pitch/20 text-pitch text-xs border-pitch/30"><User className="h-3 w-3 mr-1" />Jogador</Badge>}
            {isManager && <Badge className="bg-tactical/20 text-tactical text-xs border-tactical/30"><User className="h-3 w-3 mr-1" />Manager</Badge>}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── Main area ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Scoreboard */}
          <div className="stat-card">
            <div className="flex items-center justify-between gap-4">
              <ClubBadge club={homeClub} />
              <div className="text-center flex-1">
                <div className="font-display text-5xl font-extrabold tracking-wider">
                  {match.home_score}
                  <span className="text-muted-foreground mx-3 text-3xl">–</span>
                  {match.away_score}
                </div>
                {isLive && activeTurn && (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-display">
                      {phaseTimeLeft}s — {PHASE_LABELS[activeTurn.phase] || activeTurn.phase}
                    </span>
                  </div>
                )}
                {/* Possession indicator */}
                {isLive && possClubId && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    ⚽ Posse:{' '}
                    <span className="font-display font-bold">
                      {possClubId === match.home_club_id ? homeClub?.short_name : awayClub?.short_name}
                    </span>
                  </div>
                )}
                {match.status === 'scheduled' && (
                  <p className="text-xs text-muted-foreground mt-1 font-display">
                    {new Date(match.scheduled_at) <= new Date() ? 'Iniciando...' : `Começa em: ${new Date(match.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                  </p>
                )}
              </div>
              <ClubBadge club={awayClub} right />
            </div>
          </div>

          {/* Field */}
          <div className="stat-card p-0 overflow-hidden">
            <div className="relative bg-gradient-to-b from-pitch/25 via-pitch/10 to-pitch/25 aspect-[16/11]">
              {/* Field lines */}
              <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 70" preserveAspectRatio="none">
                <rect x="2" y="2" width="96" height="66" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <line x1="2" y1="35" x2="98" y2="35" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <circle cx="50" cy="35" r="8" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <rect x="2" y="22" width="15" height="26" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <rect x="83" y="22" width="15" height="26" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <rect x="2" y="29" width="6" height="12" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
                <rect x="92" y="29" width="6" height="12" fill="none" stroke="hsl(var(--pitch))" strokeWidth="0.5"/>
              </svg>

              {/* Home players (left side) */}
              {homePlayers.map((p, i) => {
                const total = homePlayers.length;
                const col = Math.floor(i / 3);
                const row = i % 3;
                const x = 8 + col * 20;
                const y = 15 + (row / Math.max(1, Math.ceil(total / 4) - 1)) * 70;
                return (
                  <FieldPlayer
                    key={p.id}
                    participant={p}
                    x={Math.min(x, 45)}
                    y={Math.max(10, Math.min(y, 90))}
                    color={homeClub?.primary_color || '#1a5276'}
                    textColor={homeClub?.secondary_color || '#fff'}
                    isBallHolder={activeTurn?.ball_holder_participant_id === p.id}
                    isMe={myParticipant?.id === p.id}
                    isSelected={selectedParticipantId === p.id}
                    isSelectable={isManager && p.club_id === myClubId}
                    onClick={() => isManager && p.club_id === myClubId && setSelectedParticipantId(p.id)}
                  />
                );
              })}

              {/* Away players (right side) */}
              {awayPlayers.map((p, i) => {
                const total = awayPlayers.length;
                const col = Math.floor(i / 3);
                const row = i % 3;
                const x = 92 - col * 20;
                const y = 15 + (row / Math.max(1, Math.ceil(total / 4) - 1)) * 70;
                return (
                  <FieldPlayer
                    key={p.id}
                    participant={p}
                    x={Math.max(55, 92 - col * 20)}
                    y={Math.max(10, Math.min(y, 90))}
                    color={awayClub?.primary_color || '#c0392b'}
                    textColor={awayClub?.secondary_color || '#fff'}
                    isBallHolder={activeTurn?.ball_holder_participant_id === p.id}
                    isMe={myParticipant?.id === p.id}
                    isSelected={selectedParticipantId === p.id}
                    isSelectable={isManager && p.club_id === myClubId}
                    onClick={() => isManager && p.club_id === myClubId && setSelectedParticipantId(p.id)}
                  />
                );
              })}

              {/* Status overlay for non-live */}
              {!isLive && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
                  <div className="text-center">
                    {isFinished ? (
                      <p className="font-display font-extrabold text-2xl">Partida Encerrada</p>
                    ) : (
                      <p className="font-display font-bold text-muted-foreground">
                        {new Date(match.scheduled_at) <= new Date() ? 'Iniciando engine...' : 'Aguardando horário...'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action panel */}
          {isLive && canAct && filteredActions.length > 0 && (
            <div className="stat-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">
                  Ações disponíveis
                  {selectedParticipantId && (
                    <span className="text-muted-foreground font-normal ml-2">
                      — {participants.find(p => p.id === selectedParticipantId)?.player_name || 'Selecionado'}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />{phaseTimeLeft}s
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {filteredActions.map(a => {
                  const info = ACTION_LABELS[a];
                  return (
                    <Button
                      key={a}
                      size="sm"
                      disabled={submittingAction}
                      onClick={() => submitAction(a)}
                      className={`font-display text-xs h-9 ${info?.color || ''}`}
                      variant="outline"
                    >
                      {info?.icon}
                      {info?.label || a}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {isBallHolder ? '🟡 Você tem a bola' : hasPossession ? '🔵 Apoio ofensivo' : '🔴 Fase defensiva'}
                {' '}— se não agir, o bot decide.
              </p>
            </div>
          )}

          {/* Manager player selector */}
          {isLive && isManager && myClubPlayers.length > 0 && (
            <div className="stat-card space-y-2">
              <h3 className="font-display font-bold text-xs text-muted-foreground uppercase tracking-wide">Controlar Atleta</h3>
              <div className="flex flex-wrap gap-2">
                {myClubPlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedParticipantId(p.id)}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-display transition-colors
                      ${selectedParticipantId === p.id
                        ? 'border-tactical bg-tactical/10 text-tactical'
                        : 'border-border hover:border-tactical/50 text-foreground'}`}
                  >
                    {p.is_bot ? <Bot className="h-3 w-3 text-amber-500" /> : <User className="h-3 w-3 text-pitch" />}
                    {p.slot_position && <span className="opacity-60">{p.slot_position}</span>}
                    {p.player_name?.split(' ')[0] || 'Bot'}
                    {activeTurn?.ball_holder_participant_id === p.id && <span className="ml-1">⚽</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Participants panel */}
          <div className="stat-card">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <User className="h-4 w-4" /> Participantes
            </h3>
            <TeamList
              label={homeClub?.name || 'Casa'}
              players={homePlayers}
              color={homeClub?.primary_color}
              ballHolderParticipantId={activeTurn?.ball_holder_participant_id || null}
              myParticipantId={myParticipant?.id || null}
            />
            <div className="border-t border-border my-3" />
            <TeamList
              label={awayClub?.name || 'Fora'}
              players={awayPlayers}
              color={awayClub?.primary_color}
              ballHolderParticipantId={activeTurn?.ball_holder_participant_id || null}
              myParticipantId={myParticipant?.id || null}
            />
          </div>

          {/* Event log */}
          <div className="stat-card flex flex-col">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Log da Partida
            </h3>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {events.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento ainda.</p>}
              {events.map(e => (
                <div key={e.id} className={`text-xs border-l-2 pl-2 ${
                  e.event_type === 'goal' ? 'border-pitch text-pitch' :
                  e.event_type === 'kickoff' ? 'border-tactical text-foreground' :
                  e.event_type === 'possession_change' ? 'border-warning/60 text-foreground' :
                  'border-border text-foreground'
                }`}>
                  <p className="font-display font-semibold">{e.title}</p>
                  {e.body && <p className="text-muted-foreground">{e.body}</p>}
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function ClubBadge({ club, right }: { club: ClubInfo | null; right?: boolean }) {
  if (!club) return <div className="w-16 h-16 rounded-xl bg-muted animate-pulse" />;
  return (
    <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center font-display text-sm font-extrabold shadow-md"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
      >
        {club.short_name}
      </div>
      <span className="font-display font-bold text-sm hidden sm:block max-w-24 text-center leading-tight">{club.name}</span>
    </div>
  );
}

function FieldPlayer({
  participant: p, x, y, color, textColor, isBallHolder, isMe, isSelected, isSelectable, onClick,
}: {
  participant: Participant;
  x: number; y: number;
  color: string; textColor: string;
  isBallHolder: boolean;
  isMe: boolean;
  isSelected: boolean;
  isSelectable: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 ${isSelectable ? 'cursor-pointer' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={onClick}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-display font-bold shadow-md relative transition-transform
          ${isSelected ? 'ring-2 ring-offset-1 ring-foreground scale-110' : ''}
          ${isMe ? 'ring-2 ring-offset-1 ring-pitch' : ''}
          ${isBallHolder ? 'ring-2 ring-amber-400 scale-110' : ''}
          ${isSelectable ? 'hover:scale-110' : ''}`}
        style={{ backgroundColor: color, color: textColor }}
      >
        {p.slot_position || '?'}
        {p.is_bot && !isBallHolder && (
          <Bot className="absolute -top-1 -right-1 h-3 w-3 text-amber-400 drop-shadow" />
        )}
        {isBallHolder && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px]">⚽</span>
        )}
      </div>
      <span className="text-[9px] font-display text-foreground/70 whitespace-nowrap max-w-16 truncate bg-background/60 px-0.5 rounded">
        {p.player_name?.split(' ')[0] || 'Bot'}
      </span>
    </div>
  );
}

function TeamList({
  label, players, color, ballHolderParticipantId, myParticipantId,
}: {
  label: string;
  players: Participant[];
  color?: string;
  ballHolderParticipantId: string | null;
  myParticipantId: string | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color || '#888' }} />
        <span className="font-display text-xs font-bold">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{players.length}</span>
      </div>
      <div className="space-y-1">
        {players.map(p => (
          <div key={p.id} className={`flex items-center gap-1.5 text-xs px-1 rounded ${myParticipantId === p.id ? 'bg-pitch/10' : ''}`}>
            {p.is_bot ? (
              <Bot className="h-3 w-3 text-amber-500 shrink-0" />
            ) : (
              <User className="h-3 w-3 text-pitch shrink-0" />
            )}
            <span className="font-display truncate flex-1">{p.player_name || 'Bot'}</span>
            {p.slot_position && <Badge variant="outline" className="text-[10px] py-0 px-1 shrink-0">{p.slot_position}</Badge>}
            {ballHolderParticipantId === p.id && <span className="text-[10px]">⚽</span>}
            {p.overall && <span className="text-muted-foreground shrink-0">{p.overall}</span>}
          </div>
        ))}
        {players.length === 0 && <p className="text-xs text-muted-foreground">Sem jogadores</p>}
      </div>
    </div>
  );
}
