import React, { useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Loader2, Film } from 'lucide-react';

// ─── Layout wrapper (same pattern as LeaguePage) ──────────────────
function ReplayLayout({ children }: { children: ReactNode }) {
  const { managerProfile, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Film className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">Replay</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

// ─── Field rendering constants (same as MatchRoomPage) ────────────
const FIELD_W = 900;
const FIELD_H = 580;
const PAD = 20;
const INNER_W = FIELD_W - PAD * 2;
const INNER_H = FIELD_H - PAD * 2;

function toSVG(pctX: number, pctY: number) {
  return {
    x: PAD + (pctX / 100) * INNER_W,
    y: PAD + (pctY / 100) * INNER_H,
  };
}

// ─── Types ───────────────────────────────────────────────────────
interface MatchData {
  id: string;
  status: string;
  home_score: number;
  away_score: number;
  home_club_id: string;
  away_club_id: string;
  home_uniform: number;
  away_uniform: number;
  current_turn_number: number;
}

interface ClubInfo {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
}

interface ClubUniform {
  uniform_number: number;
  shirt_color: string;
  number_color: string;
}

interface TurnRow {
  id: string;
  turn_number: number;
  phase: string;
  possession_club_id: string | null;
  ball_holder_participant_id: string | null;
  status: string;
}

interface ActionRow {
  id: string;
  match_turn_id: string;
  participant_id: string;
  action_type: string;
  target_x: number | null;
  target_y: number | null;
  status: string;
}

interface ParticipantRow {
  id: string;
  club_id: string;
  role_type: string;
  pos_x: number | null;
  pos_y: number | null;
  player_profile_id: string | null;
  lineup_slot_id: string | null;
}

interface EventRow {
  id: string;
  event_type: string;
  title: string;
  body: string;
  created_at: string;
  payload: any;
}

interface Snapshot {
  turnNumber: number;
  turnId: string;
  phase: string;
  possessionClubId: string | null;
  ballHolderParticipantId: string | null;
  positions: Record<string, { x: number; y: number }>;
  ballPosition: { x: number; y: number };
  events: EventRow[];
  actions: ActionRow[];
}

// ─── Speed options ───────────────────────────────────────────────
const SPEED_OPTIONS = [
  { label: '1x', value: 1, ms: 1000 },
  { label: '2x', value: 2, ms: 500 },
  { label: '4x', value: 4, ms: 250 },
];

// ─── Main page component ────────────────────────────────────────
export default function MatchReplayPage() {
  const { id: matchId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [homeUniforms, setHomeUniforms] = useState<ClubUniform[]>([]);
  const [awayUniforms, setAwayUniforms] = useState<ClubUniform[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [slotPositions, setSlotPositions] = useState<Record<string, string>>({});

  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);

  // Animation state
  const [animProgress, setAnimProgress] = useState(1); // 0..1 interpolation between prev and current
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data loading ──────────────────────────────────────────────
  useEffect(() => {
    if (!matchId) return;
    loadReplayData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function loadReplayData() {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch match
      const { data: matchRow, error: matchErr } = await supabase
        .from('matches')
        .select('id, status, home_score, away_score, home_club_id, away_club_id, home_uniform, away_uniform, current_turn_number')
        .eq('id', matchId!)
        .single();
      if (matchErr || !matchRow) { setError('Partida nao encontrada.'); setLoading(false); return; }
      const matchData = matchRow as MatchData;
      setMatch(matchData);

      // 2. Fetch clubs + uniforms in parallel
      const [homeClubRes, awayClubRes, homeUniformsRes, awayUniformsRes] = await Promise.all([
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', matchData.home_club_id).single(),
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', matchData.away_club_id).single(),
        supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color').eq('club_id', matchData.home_club_id),
        supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color').eq('club_id', matchData.away_club_id),
      ]);
      if (homeClubRes.data) setHomeClub(homeClubRes.data as ClubInfo);
      if (awayClubRes.data) setAwayClub(awayClubRes.data as ClubInfo);
      if (homeUniformsRes.data) setHomeUniforms(homeUniformsRes.data as ClubUniform[]);
      if (awayUniformsRes.data) setAwayUniforms(awayUniformsRes.data as ClubUniform[]);

      const hClub = homeClubRes.data as ClubInfo | null;
      const aClub = awayClubRes.data as ClubInfo | null;

      // 3. Fetch participants, turns, actions, events in parallel
      const [participantsRes, turnsRes, actionsRes, eventsRes] = await Promise.all([
        supabase.from('match_participants').select('id, club_id, role_type, pos_x, pos_y, player_profile_id, lineup_slot_id').eq('match_id', matchId!),
        supabase.from('match_turns').select('id, turn_number, phase, possession_club_id, ball_holder_participant_id, status').eq('match_id', matchId!).order('turn_number', { ascending: true }),
        supabase.from('match_actions').select('id, match_turn_id, participant_id, action_type, target_x, target_y, status').eq('match_id', matchId!),
        supabase.from('match_event_logs').select('id, event_type, title, body, created_at, payload').eq('match_id', matchId!).order('created_at', { ascending: true }),
      ]);

      const parts = (participantsRes.data || []) as ParticipantRow[];
      const turns = (turnsRes.data || []) as TurnRow[];
      const actions = (actionsRes.data || []) as ActionRow[];
      const events = (eventsRes.data || []) as EventRow[];
      setParticipants(parts);

      // 4. Fetch player names and slot positions
      const playerIds = [...new Set(parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!))];
      const slotIds = [...new Set(parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!))];

      const [playersRes, slotsRes] = await Promise.all([
        playerIds.length > 0
          ? supabase.from('player_profiles').select('id, full_name, primary_position').in('id', playerIds)
          : Promise.resolve({ data: [] as any[] }),
        slotIds.length > 0
          ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const nameMap: Record<string, string> = {};
      const posMap: Record<string, string> = {};
      for (const pp of (playersRes.data || [])) {
        nameMap[pp.id] = pp.full_name || 'Jogador';
      }
      for (const sl of (slotsRes.data || [])) {
        posMap[sl.id] = sl.slot_position;
      }
      setPlayerNames(nameMap);
      setSlotPositions(posMap);

      // 5. Build snapshots from turns + actions
      // Group actions by turn ID
      const actionsByTurn = new Map<string, ActionRow[]>();
      for (const a of actions) {
        const list = actionsByTurn.get(a.match_turn_id) || [];
        list.push(a);
        actionsByTurn.set(a.match_turn_id, list);
      }

      // Build jersey number map: sort participants by club and assign numbers
      const fieldParts = parts.filter(p => p.role_type === 'player');
      const homeParts = fieldParts.filter(p => p.club_id === matchData.home_club_id);
      const awayParts = fieldParts.filter(p => p.club_id === matchData.away_club_id);

      // Start with initial positions from participants
      const currentPositions: Record<string, { x: number; y: number }> = {};
      for (const p of fieldParts) {
        currentPositions[p.id] = { x: p.pos_x ?? 50, y: p.pos_y ?? 50 };
      }

      // Map events to turns approximately by created_at ordering
      // We associate events with turns based on timeline
      const turnEventMap = new Map<number, EventRow[]>();
      let eventIdx = 0;
      for (let i = 0; i < turns.length; i++) {
        const turnEvents: EventRow[] = [];
        // Associate events that happened around this turn
        // Simple heuristic: partition events evenly or by created_at ordering
        turnEventMap.set(turns[i].turn_number, turnEvents);
      }
      // Distribute events across turns based on order
      if (turns.length > 0 && events.length > 0) {
        const eventsPerTurn = Math.max(1, Math.ceil(events.length / turns.length));
        let ei = 0;
        for (const turn of turns) {
          const turnEvents = turnEventMap.get(turn.turn_number) || [];
          for (let j = 0; j < eventsPerTurn && ei < events.length; j++, ei++) {
            turnEvents.push(events[ei]);
          }
          turnEventMap.set(turn.turn_number, turnEvents);
        }
        // Remaining events go to last turn
        const lastTurn = turns[turns.length - 1];
        const lastEvents = turnEventMap.get(lastTurn.turn_number) || [];
        while (ei < events.length) {
          lastEvents.push(events[ei++]);
        }
        turnEventMap.set(lastTurn.turn_number, lastEvents);
      }

      const builtSnapshots: Snapshot[] = [];

      for (const turn of turns) {
        const turnActions = actionsByTurn.get(turn.id) || [];

        // Apply actions: only move/receive/block update player positions.
        // Pass and shoot actions move the BALL, not the player.
        const ballMovingTypes = new Set(['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power', 'header_low', 'header_high', 'header_controlled', 'header_power']);
        for (const action of turnActions) {
          if (action.target_x != null && action.target_y != null && currentPositions[action.participant_id]) {
            if (!ballMovingTypes.has(action.action_type)) {
              currentPositions[action.participant_id] = { x: action.target_x, y: action.target_y };
            }
          }
        }

        // Determine ball position (at ball holder or last known)
        let ballPosition = { x: 50, y: 50 };
        if (turn.ball_holder_participant_id && currentPositions[turn.ball_holder_participant_id]) {
          ballPosition = { ...currentPositions[turn.ball_holder_participant_id] };
        }

        builtSnapshots.push({
          turnNumber: turn.turn_number,
          turnId: turn.id,
          phase: turn.phase,
          possessionClubId: turn.possession_club_id,
          ballHolderParticipantId: turn.ball_holder_participant_id,
          positions: { ...currentPositions },
          ballPosition,
          events: turnEventMap.get(turn.turn_number) || [],
          actions: turnActions,
        });
      }

      setSnapshots(builtSnapshots);
      setCurrentTurn(0);
      setAnimProgress(1);
    } catch (err) {
      console.error('Replay load error:', err);
      setError('Erro ao carregar replay.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Playback controls ─────────────────────────────────────────
  const speedMs = SPEED_OPTIONS[speedIndex].ms;

  const advanceTurn = useCallback(() => {
    setCurrentTurn(prev => {
      if (prev >= snapshots.length - 1) {
        setIsPlaying(false);
        return prev;
      }
      setAnimProgress(0);
      return prev + 1;
    });
  }, [snapshots.length]);

  const prevTurn = useCallback(() => {
    setIsPlaying(false);
    setCurrentTurn(prev => Math.max(0, prev - 1));
    setAnimProgress(1);
  }, []);

  const nextTurn = useCallback(() => {
    setIsPlaying(false);
    setCurrentTurn(prev => Math.min(snapshots.length - 1, prev + 1));
    setAnimProgress(1);
  }, [snapshots.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev && currentTurn >= snapshots.length - 1) {
        // Restart from beginning
        setCurrentTurn(0);
        setAnimProgress(0);
        return true;
      }
      return !prev;
    });
  }, [currentTurn, snapshots.length]);

  const seekToTurn = useCallback((turn: number) => {
    setIsPlaying(false);
    setCurrentTurn(Math.min(Math.max(0, turn), snapshots.length - 1));
    setAnimProgress(1);
  }, [snapshots.length]);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex(prev => (prev + 1) % SPEED_OPTIONS.length);
  }, []);

  // ─── Animation loop ────────────────────────────────────────────
  const animDone = animProgress >= 1;
  useEffect(() => {
    if (animDone) return;
    const duration = speedMs;
    let startTime: number | null = null;

    function animate(time: number) {
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      setAnimProgress(progress);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentTurn, animDone, speedMs]);

  // Auto-advance when animation completes and playing
  useEffect(() => {
    if (!isPlaying || animProgress < 1) return;
    if (currentTurn >= snapshots.length - 1) {
      setIsPlaying(false);
      return;
    }
    playTimerRef.current = setTimeout(() => {
      advanceTurn();
    }, 100); // Small pause between turns
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isPlaying, animProgress, currentTurn, snapshots.length, advanceTurn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, []);

  // ─── Compute interpolated positions ─────────────────────────────
  const fieldParts = participants.filter(p => p.role_type === 'player');
  const homeParts = fieldParts.filter(p => match && p.club_id === match.home_club_id);
  const awayParts = fieldParts.filter(p => match && p.club_id === match.away_club_id);

  // Jersey number assignment
  const jerseyMap = new Map<string, number>();
  [...homeParts, ...awayParts].forEach((p, i) => {
    const isHome = match ? p.club_id === match.home_club_id : false;
    const teamParts = isHome ? homeParts : awayParts;
    const idx = teamParts.indexOf(p);
    jerseyMap.set(p.id, idx + 1);
  });

  // Position of a field_pos for each participant
  const getFieldPos = (partId: string): string => {
    const part = participants.find(p => p.id === partId);
    if (!part) return '?';
    if (part.lineup_slot_id && slotPositions[part.lineup_slot_id]) return slotPositions[part.lineup_slot_id];
    return '?';
  };

  const currentSnapshot = snapshots[currentTurn] ?? null;
  const prevSnapshot = currentTurn > 0 ? snapshots[currentTurn - 1] : null;

  function getInterpolatedPos(participantId: string): { x: number; y: number } | null {
    if (!currentSnapshot) return null;
    const curr = currentSnapshot.positions[participantId];
    if (!curr) return null;
    if (animProgress >= 1 || !prevSnapshot) return curr;
    const prev = prevSnapshot.positions[participantId] ?? curr;
    return {
      x: prev.x + (curr.x - prev.x) * animProgress,
      y: prev.y + (curr.y - prev.y) * animProgress,
    };
  }

  function getInterpolatedBall(): { x: number; y: number } {
    if (!currentSnapshot) return { x: 50, y: 50 };
    if (animProgress >= 1 || !prevSnapshot) return currentSnapshot.ballPosition;
    const prev = prevSnapshot.ballPosition;
    const curr = currentSnapshot.ballPosition;
    return {
      x: prev.x + (curr.x - prev.x) * animProgress,
      y: prev.y + (curr.y - prev.y) * animProgress,
    };
  }

  // ─── Uniform colors ────────────────────────────────────────────
  const homeActiveUniform = homeUniforms.find(u => u.uniform_number === (match?.home_uniform ?? 1))
    || { shirt_color: homeClub?.primary_color ?? '#dc2626', number_color: homeClub?.secondary_color ?? '#fff' };
  const awayActiveUniform = awayUniforms.find(u => u.uniform_number === (match?.away_uniform ?? 2))
    || { shirt_color: awayClub?.primary_color ?? '#16a34a', number_color: awayClub?.secondary_color ?? '#fff' };

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <ReplayLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ReplayLayout>
    );
  }

  if (error || !match) {
    return (
      <ReplayLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">{error || 'Partida nao encontrada.'}</p>
          <Link to="/league"><Button variant="outline">Voltar</Button></Link>
        </div>
      </ReplayLayout>
    );
  }

  if (snapshots.length === 0) {
    return (
      <ReplayLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Film className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground text-lg">Replay nao disponivel para esta partida</p>
          <Link to="/league"><Button variant="outline">Voltar</Button></Link>
        </div>
      </ReplayLayout>
    );
  }

  const totalTurns = snapshots.length;
  const ballPos = getInterpolatedBall();
  const ballSvg = toSVG(ballPos.x, ballPos.y);

  // Current events
  const currentEvents = currentSnapshot?.events || [];
  const goalEvents = currentEvents.filter(e => e.event_type === 'goal');
  const otherEvents = currentEvents.filter(e => e.event_type !== 'goal');

  return (
    <ReplayLayout>
      <div className="flex flex-col gap-3">
        {/* ── Top bar: clubs + score ── */}
        <div className="bg-card border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="font-display font-bold text-sm">{homeClub?.name}</span>
            <div
              className="h-7 w-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{ backgroundColor: homeActiveUniform.shirt_color, color: homeActiveUniform.number_color }}
            >
              {homeClub?.short_name}
            </div>
          </div>
          <div className="px-4 flex flex-col items-center">
            <span className="font-display font-bold text-2xl">
              {match.home_score} - {match.away_score}
            </span>
            <Badge variant="secondary" className="text-[10px] mt-1">
              <Film className="h-3 w-3 mr-1" />
              Replay
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <div
              className="h-7 w-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{ backgroundColor: awayActiveUniform.shirt_color, color: awayActiveUniform.number_color }}
            >
              {awayClub?.short_name}
            </div>
            <span className="font-display font-bold text-sm">{awayClub?.name}</span>
          </div>
        </div>

        {/* ── Turn indicator ── */}
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Turno {(currentSnapshot?.turnNumber ?? 0)} / {snapshots[snapshots.length - 1]?.turnNumber ?? 0}
          </Badge>
          {currentSnapshot?.phase && (
            <Badge variant="secondary" className="text-[10px]">{currentSnapshot.phase}</Badge>
          )}
        </div>

        {/* ── Field + events area ── */}
        <div className="flex gap-3">
          {/* Field */}
          <div className="flex-1" style={{ background: 'linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)', borderRadius: 8, padding: 4 }}>
            <svg
              viewBox={`0 0 ${FIELD_W + PAD * 2} ${FIELD_H + PAD * 2}`}
              className="w-full rounded-lg"
            >
              {/* Defs */}
              <defs>
                <pattern id="rp-grass" x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="40" height={INNER_H} fill="hsl(100,45%,28%)" />
                  <rect x="40" y="0" width="40" height={INNER_H} fill="hsl(100,42%,25%)" />
                </pattern>
                <filter id="rp-shadow"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.5" /></filter>
                {/* Arrow markers */}
                <marker id="rp-ah-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#22c55e" /></marker>
                <marker id="rp-ah-yellow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#f59e0b" /></marker>
                <marker id="rp-ah-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#ef4444" /></marker>
                <marker id="rp-ah-black" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#1a1a2e" /></marker>
                <marker id="rp-ah-cyan" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#06b6d4" /></marker>
              </defs>

              {/* Border */}
              <rect x="0" y="0" width={FIELD_W + PAD * 2} height={FIELD_H + PAD * 2} fill="hsl(140,10%,15%)" rx="8" />

              {/* Grass */}
              <rect x={PAD} y={PAD} width={INNER_W} height={INNER_H} fill="url(#rp-grass)" />

              {/* Field lines */}
              <g stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none">
                <rect x={PAD + 2} y={PAD + 2} width={INNER_W - 4} height={INNER_H - 4} />
                <line x1={PAD + INNER_W / 2} y1={PAD + 2} x2={PAD + INNER_W / 2} y2={PAD + INNER_H - 2} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={INNER_H * 0.15} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={3} fill="rgba(255,255,255,0.6)" />
                {/* Left penalty area */}
                <rect x={PAD + 2} y={PAD + INNER_H * 0.22} width={INNER_W * 0.16} height={INNER_H * 0.56} />
                <rect x={PAD + 2} y={PAD + INNER_H * 0.35} width={INNER_W * 0.06} height={INNER_H * 0.30} />
                <path d={`M ${PAD + 2 + INNER_W * 0.16} ${PAD + INNER_H * 0.38} A ${INNER_H * 0.12} ${INNER_H * 0.12} 0 0 1 ${PAD + 2 + INNER_W * 0.16} ${PAD + INNER_H * 0.62}`} />
                {/* Right penalty area */}
                <rect x={PAD + INNER_W - INNER_W * 0.16 - 2} y={PAD + INNER_H * 0.22} width={INNER_W * 0.16} height={INNER_H * 0.56} />
                <rect x={PAD + INNER_W - INNER_W * 0.06 - 2} y={PAD + INNER_H * 0.35} width={INNER_W * 0.06} height={INNER_H * 0.30} />
                <path d={`M ${PAD + INNER_W - INNER_W * 0.16 - 2} ${PAD + INNER_H * 0.38} A ${INNER_H * 0.12} ${INNER_H * 0.12} 0 0 0 ${PAD + INNER_W - INNER_W * 0.16 - 2} ${PAD + INNER_H * 0.62}`} />
              </g>

              {/* Goals */}
              <g stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="rgba(255,255,255,0.08)">
                <rect x={PAD - 8} y={PAD + INNER_H * 0.38} width={10} height={INNER_H * 0.24} rx="1" />
                <rect x={PAD + INNER_W - 2} y={PAD + INNER_H * 0.38} width={10} height={INNER_H * 0.24} rx="1" />
              </g>

              {/* Goal nets */}
              <g stroke="rgba(255,255,255,0.15)" strokeWidth="0.5">
                {[0, 1, 2, 3].map(i => (
                  <g key={`net-${i}`}>
                    <line x1={PAD - 8 + i * 3} y1={PAD + INNER_H * 0.38} x2={PAD - 8 + i * 3} y2={PAD + INNER_H * 0.62} />
                    <line x1={PAD + INNER_W - 2 + i * 3} y1={PAD + INNER_H * 0.38} x2={PAD + INNER_W - 2 + i * 3} y2={PAD + INNER_H * 0.62} />
                  </g>
                ))}
              </g>

              {/* Action arrows */}
              {currentSnapshot?.actions.map((action) => {
                if (action.target_x == null || action.target_y == null) return null;
                const startPositions = prevSnapshot?.positions ?? currentSnapshot.positions;
                const startPos = startPositions[action.participant_id];
                if (!startPos) return null;

                const from = toSVG(startPos.x, startPos.y);
                const to = toSVG(action.target_x, action.target_y);

                // Skip tiny moves (already at target)
                const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
                if (dist < 3) return null;

                const isPass = ['pass_low', 'pass_high', 'pass_launch', 'header_low', 'header_high'].includes(action.action_type);
                const isShoot = ['shoot_controlled', 'shoot_power', 'header_controlled', 'header_power'].includes(action.action_type);
                const isReceive = action.action_type === 'receive';
                const isBlock = action.action_type === 'block';
                const isMove = action.action_type === 'move';

                let stroke = '#1a1a2e'; // move = dark
                let marker = 'rp-ah-black';
                let strokeW = 1.5;
                let dashArray = 'none';

                if (isPass) {
                  stroke = '#22c55e'; marker = 'rp-ah-green'; strokeW = 2.5;
                  if (action.action_type === 'pass_high' || action.action_type === 'header_high') {
                    stroke = '#f59e0b'; marker = 'rp-ah-green'; // yellow→green for high passes
                  }
                  if (action.action_type === 'pass_launch') {
                    stroke = '#f59e0b'; marker = 'rp-ah-green';
                  }
                } else if (isShoot) {
                  stroke = '#f59e0b'; marker = 'rp-ah-green'; strokeW = 3;
                } else if (isReceive) {
                  stroke = '#06b6d4'; marker = 'rp-ah-cyan'; strokeW = 1.5; dashArray = '3,2';
                } else if (isBlock) {
                  stroke = '#f59e0b'; marker = 'rp-ah-yellow'; strokeW = 2; dashArray = '3,2';
                } else if (isMove) {
                  dashArray = '4,3';
                }

                // Fade arrows as animation progresses
                const opacity = animProgress < 1 ? 0.7 : 0.35;

                return (
                  <line
                    key={action.id}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={stroke} strokeWidth={strokeW}
                    strokeLinecap="round" opacity={opacity}
                    strokeDasharray={dashArray}
                    markerEnd={`url(#${marker})`}
                  />
                );
              })}

              {/* Players */}
              {fieldParts.map((p) => {
                const pos = getInterpolatedPos(p.id);
                if (!pos) return null;
                const svgPos = toSVG(pos.x, pos.y);
                const isHome = p.club_id === match.home_club_id;
                const R = 11;
                const jersey = jerseyMap.get(p.id) ?? 0;
                const fieldPos = getFieldPos(p.id);
                const isGK = fieldPos === 'GK' || jersey === 1;
                const isBH = currentSnapshot?.ballHolderParticipantId === p.id;

                return (
                  <g key={p.id}>
                    {isBH && (
                      <circle cx={svgPos.x} cy={svgPos.y} r={R + 5} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity={0.6} />
                    )}
                    <circle
                      cx={svgPos.x} cy={svgPos.y} r={R}
                      fill={isGK ? '#111' : (isHome ? homeActiveUniform.shirt_color : awayActiveUniform.shirt_color)}
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={0.8}
                      filter="url(#rp-shadow)"
                    />
                    <text
                      x={svgPos.x} y={svgPos.y + 1}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="7" fontWeight="800"
                      fontFamily="'Barlow Condensed', sans-serif"
                      fill={isGK ? '#fff' : (isHome ? homeActiveUniform.number_color : awayActiveUniform.number_color)}
                    >
                      {jersey}
                    </text>
                  </g>
                );
              })}

              {/* Ball */}
              <circle cx={ballSvg.x} cy={ballSvg.y + 2} r={4.5} fill="rgba(0,0,0,0.25)" />
              <circle cx={ballSvg.x} cy={ballSvg.y} r={5.5} fill="#fff" stroke="#333" strokeWidth={0.8} />
              <circle cx={ballSvg.x - 1.5} cy={ballSvg.y - 1.5} r={1.5} fill="rgba(0,0,0,0.08)" />
            </svg>
          </div>

          {/* Events sidebar */}
          <div className="w-56 shrink-0 bg-card border rounded-lg p-3 flex flex-col gap-1 max-h-[480px] overflow-y-auto hidden md:flex">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Eventos</span>
            {currentEvents.length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhum evento neste turno</span>
            )}
            {currentEvents.map((ev) => (
              <div
                key={ev.id}
                className={`text-xs rounded px-2 py-1.5 ${ev.event_type === 'goal' ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 font-bold' : ev.event_type === 'red_card' ? 'bg-red-500/10 border border-red-500/30 text-red-300' : ev.event_type === 'yellow_card' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300' : 'bg-muted/50 text-muted-foreground'}`}
              >
                <div className="font-semibold">{ev.title}</div>
                {ev.body && <div className="opacity-70 mt-0.5">{ev.body}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Controls bar ── */}
        <div className="bg-card border rounded-lg p-3 flex flex-col gap-3">
          {/* Progress bar */}
          <Slider
            value={[currentTurn]}
            min={0}
            max={Math.max(0, totalTurns - 1)}
            step={1}
            onValueChange={([val]) => seekToTurn(val)}
            className="w-full"
          />

          {/* Buttons */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon" onClick={prevTurn} disabled={currentTurn <= 0}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={nextTurn} disabled={currentTurn >= totalTurns - 1}>
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={cycleSpeed} className="ml-4 font-mono text-xs min-w-[40px]">
              {SPEED_OPTIONS[speedIndex].label}
            </Button>
            <span className="text-xs text-muted-foreground ml-2 font-mono">
              {currentSnapshot?.turnNumber ?? 0} / {snapshots[snapshots.length - 1]?.turnNumber ?? 0}
            </span>
          </div>
        </div>

        {/* Mobile events (shown below on small screens) */}
        <div className="md:hidden bg-card border rounded-lg p-3">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Eventos</span>
          {currentEvents.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhum evento neste turno</span>
          )}
          {currentEvents.map((ev) => (
            <div
              key={ev.id}
              className={`text-xs rounded px-2 py-1.5 mb-1 ${ev.event_type === 'goal' ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 font-bold' : 'bg-muted/50 text-muted-foreground'}`}
            >
              <div className="font-semibold">{ev.title}</div>
              {ev.body && <div className="opacity-70 mt-0.5">{ev.body}</div>}
            </div>
          ))}
        </div>
      </div>
    </ReplayLayout>
  );
}
