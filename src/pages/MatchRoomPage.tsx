import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getInitialMatchEngineFunction, invokeConfiguredMatchEngine } from '@/lib/matchEngine';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Bot, User, Eye, ChevronDown, ChevronRight, Square, LogOut } from 'lucide-react';

// ─── Formation layouts ─────────────────────────────────────────
const FORMATION_POSITIONS: Record<string, Array<{ x: number; y: number; pos: string }>> = {
  '4-4-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 42, y: 15, pos: 'LM' }, { x: 42, y: 37, pos: 'CM' }, { x: 42, y: 63, pos: 'CM' }, { x: 42, y: 85, pos: 'RM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '4-3-3': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 15, pos: 'LW' }, { x: 62, y: 50, pos: 'ST' }, { x: 60, y: 85, pos: 'RW' },
  ],
  '4-2-3-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 36, y: 35, pos: 'CDM' }, { x: 36, y: 65, pos: 'CDM' },
    { x: 50, y: 15, pos: 'LM' }, { x: 50, y: 50, pos: 'CAM' }, { x: 50, y: 85, pos: 'RM' },
    { x: 63, y: 50, pos: 'ST' },
  ],
  'test-home': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 25, y: 50, pos: 'CB' },
  ],
  'test-away': [
    { x: 70, y: 35, pos: 'ST' },
    { x: 70, y: 65, pos: 'ST' },
  ],
};

const DEFAULT_FORMATION = '4-4-2';

function getFormationPositions(formation: string, isHome: boolean) {
  const base = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  if (isHome) return base;
  return base.map(p => ({ ...p, x: 100 - p.x }));
}

// ─── Types ────────────────────────────────────────────────────
interface MatchData {
  id: string; status: string; home_score: number; away_score: number;
  current_phase: string | null; current_turn_number: number;
  scheduled_at: string; started_at: string | null;
  home_club_id: string; away_club_id: string;
  home_lineup_id: string | null; away_lineup_id: string | null;
  possession_club_id: string | null;
}

interface ClubInfo {
  id: string; name: string; short_name: string;
  primary_color: string; secondary_color: string; formation?: string;
}

interface Participant {
  id: string; match_id: string; player_profile_id: string | null;
  club_id: string; lineup_slot_id: string | null; role_type: string;
  is_bot: boolean; connected_user_id: string | null;
  pos_x: number | null; pos_y: number | null;
  player_name?: string; slot_position?: string; overall?: number;
  field_x?: number; field_y?: number; field_pos?: string;
  jersey_number?: number;
}

interface MatchTurn {
  id: string; turn_number: number; phase: string;
  possession_club_id: string | null; ball_holder_participant_id: string | null;
  started_at: string; ends_at: string; status: string;
}

interface EventLog {
  id: string; event_type: string; title: string; body: string; created_at: string;
}

interface MatchAction {
  id: string;
  match_id: string;
  match_turn_id: string;
  participant_id: string;
  controlled_by_type: string;
  action_type: string;
  target_x: number | null;
  target_y: number | null;
  target_participant_id: string | null;
  status: string;
  created_at?: string;
  turn_phase?: string | null;
  turn_number?: number;
}

interface PendingInterceptChoice {
  participantId: string;
  targetX: number;
  targetY: number;
}

// ─── Constants ────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  ball_holder: 'Portador', attacking_support: 'Ataque',
  defending_response: 'Defesa', resolution: 'Motion', pre_match: 'Pré-jogo',
  processing: 'Pausa',
  positioning_attack: 'Posicionar ⚽', positioning_defense: 'Posicionar 🛡️',
};

const ACTION_LABELS: Record<string, string> = {
  move: 'MOVER', pass_low: 'PASSE RASTEIRO', pass_high: 'PASSE ALTO',
  pass_launch: 'LANÇAMENTO', shoot: 'CHUTAR',
  shoot_controlled: 'CHUTE CONTROLADO', shoot_power: 'CHUTE FORTE',
  press: 'PRESSIONAR', intercept: 'INTERCEPTAR',
  block_lane: 'BLOQUEAR', no_action: 'SEM AÇÃO', receive: 'DOMINAR BOLA',
};

const PHASE_DURATION = 6;
const RESOLUTION_PHASE_DURATION = 3;
const PRE_MATCH_COUNTDOWN_SECONDS = 10;
const PRE_MATCH_COUNTDOWN_MS = PRE_MATCH_COUNTDOWN_SECONDS * 1000;
const INTERCEPT_RADIUS = 0.6; // very small domination window, close to the ball path
const GOAL_LINE_OVERFLOW_PCT = 0.12; // makes the shot arrow/ball slightly cross the goal line
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeAttr = (val: number) => Math.max(0, Math.min(1, (val - 10) / 89));
const pointToSegmentDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp((((px - ax) * dx) + ((py - ay) * dy)) / ((dx * dx) + (dy * dy)), 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
};

// ─── Drawing state ────────────────────────────────────────────
interface DrawingState {
  type: 'move' | 'pass_low' | 'pass_high' | 'pass_launch' | 'shoot_controlled' | 'shoot_power';
  fromParticipantId: string;
}

// Safe date formatter
function formatScheduledDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Data inválida';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return 'Data inválida';
  }
}

// ─── Main Component ───────────────────────────────────────────
export default function MatchRoomPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, club } = useAuth();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTurn, setActiveTurn] = useState<MatchTurn | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'player' | 'manager' | 'spectator'>('spectator');
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(PHASE_DURATION);
  const [preMatchCountdownLeft, setPreMatchCountdownLeft] = useState(PRE_MATCH_COUNTDOWN_SECONDS);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [isPhaseProcessing, setIsPhaseProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Processando todos os movimientos...');
  // Server clock offset: serverTime ≈ Date.now() + serverClockOffset
  const serverClockOffsetRef = useRef(0);
  const serverNow = useCallback(() => Date.now() + serverClockOffsetRef.current, []);
  const updateServerOffset = useCallback((serverTimestamp: number) => {
    if (serverTimestamp && serverTimestamp > 0) {
      serverClockOffsetRef.current = serverTimestamp - Date.now();
    }
  }, []);

  // Interactive drawing
  const [drawingAction, setDrawingAction] = useState<DrawingState | null>(null);
  const [mouseFieldPct, setMouseFieldPct] = useState<{ x: number; y: number } | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [submittedActions, setSubmittedActions] = useState<Set<string>>(new Set());
  const [pendingInterceptChoice, setPendingInterceptChoice] = useState<PendingInterceptChoice | null>(null);

  // Persisted actions for current turn (loaded from DB)
  const [turnActions, setTurnActions] = useState<MatchAction[]>([]);

  // Animation state for phase 4
  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const [resolutionStartPositions, setResolutionStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  // Final positions after animation (locked until next turn)
  const [finalPositions, setFinalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [finalBallPos, setFinalBallPos] = useState<{ x: number; y: number } | null>(null);
  const [carriedLooseBallPos, setCarriedLooseBallPos] = useState<{ x: number; y: number } | null>(null);
  const [ballInertiaDir, setBallInertiaDir] = useState<{ dx: number; dy: number } | null>(null);
  const [playerAttrsMap, setPlayerAttrsMap] = useState<Record<string, any>>({});
  const prevDirectionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const finalBallPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBallDirRef = useRef<{ dx: number; dy: number } | null>(null);
  const attrsLoadedRef = useRef(false);

  // Possession change visual feedback
  const [possessionChangePulse, setPossessionChangePulse] = useState<string | null>(null);
  const prevPossClubRef = useRef<string | null>(null);

  // Contest visual feedback during phase 4
  const [contestEffect, setContestEffect] = useState<{ type: 'tackle_fail' | 'tackle_success' | 'block' | 'dribble' | 'save' | 'intercept'; x: number; y: number; label: string } | null>(null);

  // Accordion states
  const [homeAccOpen, setHomeAccOpen] = useState(false);
  const [awayAccOpen, setAwayAccOpen] = useState(false);
  const [logAccOpen, setLogAccOpen] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const animatedResolutionIdRef = useRef<string | null>(null);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedMatchEngineRef = useRef(getInitialMatchEngineFunction());

  // ── Load match data ──────────────────────────────────────────
  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!m) return;

    // Safely check scheduled_at
    const scheduledDate = new Date(m.scheduled_at);
    const isValidDate = !isNaN(scheduledDate.getTime());
    const shouldAutoStart = isValidDate && (scheduledDate.getTime() + PRE_MATCH_COUNTDOWN_MS) <= serverNow();

    if (m.status === 'scheduled' && shouldAutoStart) {
      await callEngine({ action: 'auto_start' });
      const { data: updated } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (updated) setMatch(updated as MatchData);
      else setMatch(m as MatchData);
    } else {
      setMatch(m as MatchData);
    }

    const [hcRes, acRes, hSettings, aSettings] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.away_club_id).single(),
      supabase.from('club_settings').select('default_formation').eq('club_id', m.home_club_id).maybeSingle(),
      supabase.from('club_settings').select('default_formation').eq('club_id', m.away_club_id).maybeSingle(),
    ]);

    const homeClubData: ClubInfo = { ...(hcRes.data as ClubInfo), formation: hSettings.data?.default_formation || DEFAULT_FORMATION };
    const awayClubData: ClubInfo = { ...(acRes.data as ClubInfo), formation: aSettings.data?.default_formation || DEFAULT_FORMATION };
    setHomeClub(homeClubData);
    setAwayClub(awayClubData);

    // Participants
    const { data: parts } = await supabase.from('match_participants').select('*').eq('match_id', matchId);

    if (parts && parts.length > 0) {
      const playerIds = parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!);
      const slotIds = parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!);

      const [playersRes, slotsRes] = await Promise.all([
        playerIds.length > 0 ? supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds) : { data: [] },
        slotIds.length > 0 ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds) : { data: [] },
      ]);

      const playerMap = new Map((playersRes.data || []).map(p => [p.id, p]));
      const slotMap = new Map((slotsRes.data || []).map(s => [s.id, s]));

      const enriched: Participant[] = parts.map(p => ({
        ...p,
        player_name: p.player_profile_id ? playerMap.get(p.player_profile_id)?.full_name : undefined,
        overall: p.player_profile_id ? playerMap.get(p.player_profile_id)?.overall : undefined,
        slot_position: p.lineup_slot_id ? slotMap.get(p.lineup_slot_id)?.slot_position : undefined,
      }));

      const homeParts = enriched.filter(p => p.club_id === m.home_club_id && p.role_type === 'player');
      const awayParts = enriched.filter(p => p.club_id === m.away_club_id && p.role_type === 'player');

      const isTestMatch = homeParts.length <= 4 && awayParts.length <= 4;

      const assignPositions = (list: Participant[], formation: string, isHome: boolean): Participant[] => {
        const positions = getFormationPositions(formation, isHome);
        return list.map((p, i) => ({
          ...p,
          field_x: p.pos_x ?? positions[i]?.x ?? (isHome ? 30 : 70),
          field_y: p.pos_y ?? positions[i]?.y ?? 50,
          field_pos: p.slot_position || positions[i]?.pos || '?',
          jersey_number: i + 1,
        }));
      };

      const ensureEleven = (list: Participant[], formation: string, isHome: boolean, clubId: string): Participant[] => {
        const positioned = assignPositions(list, formation, isHome);
        if (isTestMatch) return positioned;
        const positions = getFormationPositions(formation, isHome);
        for (let i = positioned.length; i < 11; i++) {
          positioned.push({
            id: `virtual-${isHome ? 'home' : 'away'}-${i}`,
            match_id: matchId!,
            player_profile_id: null, club_id: clubId,
            lineup_slot_id: null, role_type: 'player',
            is_bot: true, connected_user_id: null,
            pos_x: null, pos_y: null,
            field_x: positions[i]?.x ?? (isHome ? 30 : 70),
            field_y: positions[i]?.y ?? 50,
            field_pos: positions[i]?.pos ?? '?',
            jersey_number: i + 1,
          });
        }
        return positioned;
      };

      const homeFmt = homeClubData.formation || DEFAULT_FORMATION;
      const awayFmt = awayClubData.formation || DEFAULT_FORMATION;

      const homeWithPos = ensureEleven(homeParts, isTestMatch ? 'test-home' : homeFmt, true, m.home_club_id);
      const awayWithPos = ensureEleven(awayParts, isTestMatch ? 'test-away' : awayFmt, false, m.away_club_id);
      const managersAndSpecs = enriched.filter(p => p.role_type !== 'player');

      setParticipants([...homeWithPos, ...awayWithPos, ...managersAndSpecs]);
    }

    const { data: turn } = await supabase
      .from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    
    // Validate turn ends_at before setting
    if (turn) {
      const endsAt = new Date(turn.ends_at);
      if (isNaN(endsAt.getTime())) {
        console.error('Invalid ends_at in turn:', turn.ends_at);
        // Don't set an invalid turn
      } else {
        setActiveTurn(turn as MatchTurn | null);
      }
    } else {
      setActiveTurn(null);
    }

    const { data: evts } = await supabase
      .from('match_event_logs').select('*').eq('match_id', matchId)
      .order('created_at', { ascending: true }).limit(60);
    setEvents(evts || []);

    setLoading(false);
  }, [matchId]);

  // ── Load actions for current turn ──────────────────────────
  const currentTurnNumber = activeTurn?.turn_number ?? match?.current_turn_number ?? null;

  const loadTurnActions = useCallback(async () => {
    if (!matchId || !currentTurnNumber) {
      setTurnActions([]);
      return;
    }

    const { data: phaseTurns } = await supabase
      .from('match_turns')
      .select('id, phase, turn_number, created_at')
      .eq('match_id', matchId)
      .eq('turn_number', currentTurnNumber)
      .order('created_at', { ascending: true });

    const turnIds = (phaseTurns || []).map(turn => turn.id);
    if (turnIds.length === 0) {
      setTurnActions([]);
      return;
    }

    const phaseByTurnId = new Map((phaseTurns || []).map(turn => [turn.id, turn.phase]));
    const { data: actions } = await supabase
      .from('match_actions')
      .select('*')
      .in('match_turn_id', turnIds)
      .order('created_at', { ascending: true });

    const priorityByController: Record<string, number> = { player: 3, manager: 2, bot: 1 };
    const dedupedByParticipantAndPhase = new Map<string, MatchAction>();

    for (const action of ((actions || []) as MatchAction[])) {
      const enriched: MatchAction = {
        ...action,
        turn_phase: phaseByTurnId.get(action.match_turn_id) ?? null,
        turn_number: currentTurnNumber,
      };
      const key = `${enriched.turn_phase ?? 'unknown'}:${enriched.participant_id}`;
      const existing = dedupedByParticipantAndPhase.get(key);

      if (!existing) {
        dedupedByParticipantAndPhase.set(key, enriched);
        continue;
      }

      const existingPriority = priorityByController[existing.controlled_by_type] ?? 0;
      const nextPriority = priorityByController[enriched.controlled_by_type] ?? 0;
      const existingCreatedAt = new Date(existing.created_at || 0).getTime();
      const nextCreatedAt = new Date(enriched.created_at || 0).getTime();

      if (nextPriority > existingPriority || (nextPriority === existingPriority && nextCreatedAt >= existingCreatedAt)) {
        dedupedByParticipantAndPhase.set(key, enriched);
      }
    }

    const phaseOrder: Record<string, number> = {
      positioning_attack: -2,
      positioning_defense: -1,
      ball_holder: 0,
      attacking_support: 1,
      defending_response: 2,
      resolution: 3,
    };

    setTurnActions(
      Array.from(dedupedByParticipantAndPhase.values()).sort((a, b) => {
        const phaseDiff = (phaseOrder[a.turn_phase || 'resolution'] ?? 99) - (phaseOrder[b.turn_phase || 'resolution'] ?? 99);
        if (phaseDiff !== 0) return phaseDiff;
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      })
    );
  }, [matchId, currentTurnNumber, activeTurn?.id]);

  useEffect(() => { loadTurnActions(); }, [loadTurnActions]);

  const persistedSubmittedIds = useMemo(() => new Set(turnActions.map(action => action.participant_id)), [turnActions]);
  const allSubmittedIds = useMemo(
    () => new Set([...Array.from(persistedSubmittedIds), ...Array.from(submittedActions)]),
    [persistedSubmittedIds, submittedActions]
  );

  // ── Determine user role ─────────────────────────────────────
  useEffect(() => {
    if (!user || !match) return;
    const playerPart = participants.find(p => p.connected_user_id === user.id && p.role_type === 'player');
    const managerPart = participants.find(p => p.connected_user_id === user.id && p.role_type === 'manager');
    const isManagerOfHome = club?.id === match.home_club_id;
    const isManagerOfAway = club?.id === match.away_club_id;
    const isManagerOfMatch = isManagerOfHome || isManagerOfAway;

    if (playerPart) {
      setMyRole('player');
      setMyParticipant(playerPart);
      setSelectedParticipantId(playerPart.id);
      setMyClubId(playerPart.club_id);
    } else if (managerPart || isManagerOfMatch) {
      setMyRole('manager');
      setMyParticipant(managerPart || null);
      setMyClubId(managerPart?.club_id || (isManagerOfHome ? match.home_club_id : match.away_club_id));
    } else {
      setMyRole('spectator'); setMyParticipant(null); setMyClubId(null);
    }
  }, [user, participants, match, club]);

  useEffect(() => { loadMatch(); }, [loadMatch]);

  // ── Load player attributes for physics constraints ──
  useEffect(() => {
    if (attrsLoadedRef.current || participants.length === 0) return;
    const profileIds = [...new Set(participants.filter(p => p.player_profile_id).map(p => p.player_profile_id!))];
    if (profileIds.length === 0) return;
    attrsLoadedRef.current = true;
    (async () => {
      const { data } = await supabase.from('player_attributes').select('*').in('player_profile_id', profileIds);
      if (!data) return;
      const map: Record<string, any> = {};
      for (const row of data) {
        for (const part of participants.filter(p => p.player_profile_id === row.player_profile_id)) {
          map[part.id] = row;
        }
      }
      setPlayerAttrsMap(map);
      console.log('[PHYSICS] Loaded attributes for', Object.keys(map).length, 'participants');
      for (const [pid, a] of Object.entries(map)) {
        console.log(`[PHYSICS] ${pid.slice(0,8)}: vel=${a.velocidade} accel=${a.aceleracao} agil=${a.agilidade} stam=${a.stamina} forca=${a.forca} ctrl=${a.controle_bola} pass_lo=${a.passe_baixo} pass_hi=${a.passe_alto} shot_acc=${a.acuracia_chute} shot_pow=${a.forca_chute}`);
      }
    })();
  }, [participants]);

  // ── Compute max move range from player attributes ──
  const computeMaxMoveRange = useCallback((participantId: string, targetDirection?: { x: number; y: number }, overrideMultiplier?: number): number => {
    const attrs = playerAttrsMap[participantId];
    const turnNum = match?.current_turn_number ?? 1;
    const vel = Number(attrs?.velocidade ?? 40);
    const accel = Number(attrs?.aceleracao ?? 40);
    const stam = Number(attrs?.stamina ?? 40);
    const forca = Number(attrs?.forca ?? 40);
    const baseRange = 8 + normalizeAttr(vel) * 17;
    const accelFactor = 0.6 + normalizeAttr(accel) * 0.4;
    const staminaDecay = 1.0 - (Math.max(0, turnNum - 20) / 40) * (1 - normalizeAttr(stam)) * 0.2;
    const forceFactor = 1.0 + normalizeAttr(forca) * 0.1;
    let range = baseRange * accelFactor * staminaDecay * forceFactor;

    // Ball carrier speed penalty (carrying ball = 15% slower)
    const isBallHolder = activeTurn?.ball_holder_participant_id === participantId;
    if (isBallHolder) {
      // In phase 2 (attacking_support), ball holder who already acted gets only 35% range
      if (activeTurn?.phase === 'attacking_support') {
        range *= 0.35;
      } else {
        range *= 0.85;
      }
    }

    // Inertia multiplier based on previous direction
    if (targetDirection) {
      const prevDir = prevDirectionsRef.current[participantId];
      if (prevDir) {
        const prevLen = Math.sqrt(prevDir.x * prevDir.x + prevDir.y * prevDir.y);
        const curLen = Math.sqrt(targetDirection.x * targetDirection.x + targetDirection.y * targetDirection.y);
        if (prevLen > 0.1 && curLen > 0.1) {
          const dot = (prevDir.x * targetDirection.x + prevDir.y * targetDirection.y) / (prevLen * curLen);
          const angleDiff = Math.acos(Math.max(-1, Math.min(1, dot)));
          const normalizedAngle = angleDiff / Math.PI; // 0 = same dir, 1 = opposite
          const multiplier = 1.2 - 0.4 * normalizedAngle; // 1.2x same, 0.8x opposite
          range *= multiplier;
        }
      }
    }

    if (overrideMultiplier != null) range *= overrideMultiplier;

    return range;
  }, [playerAttrsMap, match?.current_turn_number, activeTurn?.ball_holder_participant_id, activeTurn?.phase]);

  // ── Pre-match countdown / auto-start ────────────────────────
  useEffect(() => {
    if (!match || match.status !== 'scheduled') return;

    const scheduledDate = new Date(match.scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      setPreMatchCountdownLeft(PRE_MATCH_COUNTDOWN_SECONDS);
      return;
    }

    const countdownStart = scheduledDate.getTime();
    const countdownEnd = countdownStart + PRE_MATCH_COUNTDOWN_MS;
    let triggered = false;

    const update = () => {
      const now = serverNow();
      if (now < countdownStart) {
        setPreMatchCountdownLeft(PRE_MATCH_COUNTDOWN_SECONDS);
        return;
      }

      const remainingMs = Math.max(0, countdownEnd - now);
      setPreMatchCountdownLeft(Math.max(0, Math.ceil(remainingMs / 1000)));

      if (!triggered && now >= countdownEnd) {
        triggered = true;
        loadMatch();
      }
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [match?.status, match?.scheduled_at, loadMatch]);

  // ── Phase countdown timer ────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!activeTurn || match?.status !== 'live') return;
    
    // Validate ends_at before using
    const endsAt = new Date(activeTurn.ends_at);
    if (isNaN(endsAt.getTime())) {
      setPhaseTimeLeft(0);
      return;
    }
    
    tickRef.current = setInterval(() => {
      const remaining = Math.max(0, endsAt.getTime() - serverNow());
      setPhaseTimeLeft(Math.ceil(remaining / 1000));
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeTurn, match?.status]);

  // Reset local submission cache only when a brand-new turn starts
  useEffect(() => {
    setSubmittedActions(new Set());
    setResolutionStartPositions({});
    setFinalPositions({});

    if (activeTurn?.ball_holder_participant_id == null) {
      if (carriedLooseBallPos) {
        // Ball was ALREADY loose — inertia only lasts ONE turn, stop it
        setBallInertiaDir(null);
        // Keep carriedLooseBallPos where it is (ball stays put)
      } else {
        // Ball JUST became loose — use ref for position (avoids race condition with state)
        const pos = finalBallPosRef.current || finalBallPos;
        if (pos) {
          setCarriedLooseBallPos(pos);
          // Use stored direction from animation end
          if (lastBallDirRef.current) {
            setBallInertiaDir(lastBallDirRef.current);
          }
        }
      }
    } else {
      setCarriedLooseBallPos(null);
      setBallInertiaDir(null);
      lastBallDirRef.current = null;
    }

    setFinalBallPos(null);
    // Don't clear finalBallPosRef here — it's consumed above
    animatedResolutionIdRef.current = null;
  }, [activeTurn?.turn_number]);

  useEffect(() => {
    setDrawingAction(null);
    setShowActionMenu(null);
    setPendingInterceptChoice(null);
    // Don't reset animation state when entering resolution - the animation effect handles it
    if (activeTurn?.phase !== 'resolution') {
      setAnimating(false);
      setAnimProgress(0);
    }
  }, [activeTurn?.id, activeTurn?.phase]);

  // Positioning turn detection
  const isPositioningTurn = activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense';
  const isPositioningAttack = activeTurn?.phase === 'positioning_attack';
  const isPositioningDefense = activeTurn?.phase === 'positioning_defense';

  // ── Possession change detection ────────────────────────────
  useEffect(() => {
    if (!activeTurn) return;
    const currentPoss = activeTurn.possession_club_id;
    if (prevPossClubRef.current && currentPoss && prevPossClubRef.current !== currentPoss) {
      // Possession changed! Find new ball holder and pulse
      if (activeTurn.ball_holder_participant_id) {
        setPossessionChangePulse(activeTurn.ball_holder_participant_id);
        setTimeout(() => setPossessionChangePulse(null), 2000);
      }
    }
    prevPossClubRef.current = currentPoss ?? null;
  }, [activeTurn?.possession_club_id, activeTurn?.ball_holder_participant_id]);

  // ── Contest visual effect from event logs ────────────────────
  useEffect(() => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    if (!last) return;
    // Only trigger during/near resolution
    const isContest = ['tackle', 'dribble', 'blocked', 'saved', 'intercepted', 'possession_change'].includes(last.event_type);
    if (!isContest) return;
    
    // Find approximate position from interceptor or ball holder
    const bhPart = participants.find(p => p.id === activeTurn?.ball_holder_participant_id);
    const effectX = bhPart?.field_x ?? 50;
    const effectY = bhPart?.field_y ?? 50;
    
    let effectType: typeof contestEffect extends { type: infer T } | null ? T : never = 'intercept';
    if (last.event_type === 'tackle') effectType = 'tackle_success';
    else if (last.event_type === 'dribble') effectType = 'dribble';
    else if (last.event_type === 'blocked') effectType = 'block';
    else if (last.event_type === 'saved') effectType = 'tackle_success';
    
    setContestEffect({ type: effectType, x: effectX, y: effectY, label: last.title });
    setTimeout(() => setContestEffect(null), 2500);
  }, [events.length]);

  // Auto-show action menu for ball holder in phase 1
  // For loose ball (no ball_holder), skip phase 1 — handled by engine
  useEffect(() => {
    if (!activeTurn || match?.status !== 'live' || isPhaseProcessing) return;
    
    // Positioning turn: no auto-open action menu, players click manually
    if (isPositioningTurn) return;
    
    if (activeTurn.phase === 'ball_holder' && activeTurn.ball_holder_participant_id) {
      const bh = participants.find(p => p.id === activeTurn.ball_holder_participant_id);
      const hCount = participants.filter(pp => pp.club_id === match?.home_club_id && pp.role_type === 'player').length;
      const aCount = participants.filter(pp => pp.club_id === match?.away_club_id && pp.role_type === 'player').length;
      const isTest = hCount <= 4 && aCount <= 4;
      const canControlBH = bh && (
        (myRole === 'player' && myParticipant?.id === bh.id) ||
        (myRole === 'manager' && (bh.club_id === myClubId || isTest))
      );
      if (canControlBH) {
        setShowActionMenu(bh.id);
        setSelectedParticipantId(bh.id);
      }
    }
  }, [activeTurn?.phase, activeTurn?.id, match?.status, participants, myRole, myParticipant?.id, myClubId, isPhaseProcessing, isPositioningTurn]);

  // ── Engine tick — process once per phase end with explicit pause ─────────────
  const tickInFlightRef = useRef(false);
  useEffect(() => {
    if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
    if (match?.status !== 'live' || !matchId || !activeTurn || isPhaseProcessing) return;

    // Validate ends_at
    const endsAtDate = new Date(activeTurn.ends_at);
    if (isNaN(endsAtDate.getTime())) {
      console.error('Invalid ends_at, cannot schedule tick:', activeTurn.ends_at);
      return;
    }

    const processTurnPhase = async () => {
      if (tickInFlightRef.current) return;
      tickInFlightRef.current = true;
      setIsPhaseProcessing(true);
      setProcessingLabel(
        activeTurn.phase === 'defending_response'
          ? 'Processando todos os movimentos...'
          : activeTurn.phase === 'resolution'
            ? 'Processando próximo turno...'
            : 'Processando os movimentos...'
      );

      try {
        const { response, result } = await invokeMatchEngine({ action: 'tick', match_id: matchId });

        if (result?.status === 'waiting') {
          const retryMs = Math.max(150, Number(result.remaining_ms ?? 250));
          tickInFlightRef.current = false;
          setIsPhaseProcessing(false);
          phaseTimeoutRef.current = setTimeout(processTurnPhase, retryMs);
          return;
        }

        // "No active turn" is a recoverable race condition — just reload state
        if (result?.error === 'No active turn' || result?.error === 'Match not found or not live') {
          console.warn('Tick: no active turn or match not live, reloading state...');
          await loadMatch();
          return;
        }

        if (!response.ok || result?.error) {
          throw new Error(String(result?.error || 'Erro ao processar turno'));
        }

        const [matchRes, turnRes, partsRes] = await Promise.all([
          supabase.from('matches').select('*').eq('id', matchId).single(),
          supabase.from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('match_participants').select('*').eq('match_id', matchId),
        ]);

        if (matchRes.data) setMatch(matchRes.data as MatchData);
        if (turnRes.data !== undefined) {
          // Validate turn before setting
          if (turnRes.data) {
            const endsAt = new Date(turnRes.data.ends_at);
            if (!isNaN(endsAt.getTime())) {
              setActiveTurn(turnRes.data as MatchTurn | null);
            }
          } else {
            setActiveTurn(null);
          }
        }
        if (partsRes.data && matchRes.data) await reEnrichParticipants(partsRes.data, matchRes.data as MatchData);
        await loadTurnActions();
      } catch (e) {
        console.error('Tick failed:', e);
        toast.error('Erro ao processar a próxima parte do turno');
      } finally {
        tickInFlightRef.current = false;
        setIsPhaseProcessing(false);
      }
    };

    const remaining = Math.max(0, endsAtDate.getTime() - serverNow());
    phaseTimeoutRef.current = setTimeout(processTurnPhase, remaining + 50);

    return () => {
      if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
    };
  }, [match?.status, matchId, activeTurn?.id, activeTurn?.ends_at, activeTurn?.phase, isPhaseProcessing, loadMatch, loadTurnActions]);

  // Helper to re-enrich participants after position updates
  async function reEnrichParticipants(parts: any[], matchData: MatchData) {
    if (!matchId || !matchData) return;
    const playerIds = parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!);
    const slotIds = parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!);

    const [playersRes, slotsRes] = await Promise.all([
      playerIds.length > 0 ? supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds) : { data: [] },
      slotIds.length > 0 ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds) : { data: [] },
    ]);

    const playerMap = new Map((playersRes.data || []).map(p => [p.id, p]));
    const slotMap = new Map((slotsRes.data || []).map(s => [s.id, s]));

    const enriched: Participant[] = parts.map(p => ({
      ...p,
      player_name: p.player_profile_id ? playerMap.get(p.player_profile_id)?.full_name : undefined,
      overall: p.player_profile_id ? playerMap.get(p.player_profile_id)?.overall : undefined,
      slot_position: p.lineup_slot_id ? slotMap.get(p.lineup_slot_id)?.slot_position : undefined,
    }));

    const homeParts = enriched.filter(p => p.club_id === matchData.home_club_id && p.role_type === 'player');
    const awayParts = enriched.filter(p => p.club_id === matchData.away_club_id && p.role_type === 'player');
    const isTestMatch = homeParts.length <= 4 && awayParts.length <= 4;

    const assignPositions = (list: Participant[], formation: string, isHome: boolean): Participant[] => {
      const positions = getFormationPositions(formation, isHome);
      return list.map((p, i) => ({
        ...p,
        field_x: p.pos_x ?? positions[i]?.x ?? (isHome ? 30 : 70),
        field_y: p.pos_y ?? positions[i]?.y ?? 50,
        field_pos: p.slot_position || positions[i]?.pos || '?',
        jersey_number: i + 1,
      }));
    };

    const ensureEleven = (list: Participant[], formation: string, isHome: boolean, clubId: string): Participant[] => {
      const positioned = assignPositions(list, formation, isHome);
      if (isTestMatch) return positioned;
      const positions = getFormationPositions(formation, isHome);
      for (let i = positioned.length; i < 11; i++) {
        positioned.push({
          id: `virtual-${isHome ? 'home' : 'away'}-${i}`,
          match_id: matchId!,
          player_profile_id: null, club_id: clubId,
          lineup_slot_id: null, role_type: 'player',
          is_bot: true, connected_user_id: null,
          pos_x: null, pos_y: null,
          field_x: positions[i]?.x ?? (isHome ? 30 : 70),
          field_y: positions[i]?.y ?? 50,
          field_pos: positions[i]?.pos ?? '?',
          jersey_number: i + 1,
        });
      }
      return positioned;
    };

    const homeFmt = homeClub?.formation || DEFAULT_FORMATION;
    const awayFmt = awayClub?.formation || DEFAULT_FORMATION;

    const homeWithPos = ensureEleven(homeParts, isTestMatch ? 'test-home' : homeFmt, true, matchData.home_club_id);
    const awayWithPos = ensureEleven(awayParts, isTestMatch ? 'test-away' : awayFmt, false, matchData.away_club_id);
    const managersAndSpecs = enriched.filter(p => p.role_type !== 'player');

    setParticipants([...homeWithPos, ...awayWithPos, ...managersAndSpecs]);
  }

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
          .then(({ data }) => {
            if (data) {
              const endsAt = new Date(data.ends_at);
              if (!isNaN(endsAt.getTime())) {
                setActiveTurn(data as MatchTurn | null);
              }
            } else {
              setActiveTurn(null);
            }
          });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_event_logs', filter: `match_id=eq.${matchId}` }, (p) => {
        setEvents(prev => [...prev, p.new as EventLog]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_actions', filter: `match_id=eq.${matchId}` }, () => {
        loadTurnActions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants', filter: `match_id=eq.${matchId}` }, () => {
        supabase.from('match_participants').select('*').eq('match_id', matchId).then(({ data }) => {
          if (data && match) reEnrichParticipants(data, match);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, match, loadTurnActions]);

  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  // ── Helpers ──────────────────────────────────────────────────
  const invokeMatchEngine = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    return invokeConfiguredMatchEngine({
      body,
      accessToken: session?.access_token,
      onServerNow: updateServerOffset,
      resolvedFunctionRef: resolvedMatchEngineRef,
    });
  }, [updateServerOffset]);

  const callEngine = async (body: Record<string, unknown>) => {
    try {
      const { result } = await invokeMatchEngine(body);
      return result;
    } catch (e) { console.error('Engine call failed:', e); return {}; }
  };

  const submitAction = async (actionType: string, participantId?: string, targetX?: number, targetY?: number, targetParticipantId?: string) => {
    const pid = participantId || selectedParticipantId;
    if (!matchId || !pid) return;
    setSubmittingAction(true);
    try {
      const { response, result } = await invokeMatchEngine({
        action: 'submit_action', match_id: matchId,
        participant_id: pid, action_type: actionType,
        target_x: targetX, target_y: targetY,
        target_participant_id: targetParticipantId,
      });
      if (!response.ok && !result?.error) {
        throw new Error('Erro ao enviar ação');
      }
      if (result.error) {
        if (result.recoverable || result.error === 'No active turn') {
          console.warn('[SUBMIT] No active turn — phase transition in progress, retrying...');
          await loadMatch();
          toast.info('Turno em transição, tente novamente');
        } else {
          toast.error(String(result.error));
        }
      }
      else {
        setSubmittedActions(prev => new Set([...prev, pid]));
        toast.success(`✅ ${ACTION_LABELS[actionType] || actionType}`);
        loadTurnActions();
      }
    } catch { toast.error('Erro ao enviar ação'); }
    finally { setSubmittingAction(false); }
  };

  const finishMatch = async () => {
    if (!matchId) return;
    try {
      const { response, result } = await invokeMatchEngine({ action: 'finish_match', match_id: matchId });
      if (!response.ok || result?.error) {
        throw new Error(String(result?.error || 'Erro ao finalizar'));
      }
      toast.success('Partida finalizada!');
      loadMatch();
    } catch { toast.error('Erro ao finalizar'); }
  };

  const exitToDashboard = () => {
    navigate(myRole === 'manager' ? '/manager' : '/player');
  };

  const handleActionMenuSelect = (actionType: string, participantId: string) => {
    if (actionType === 'no_action') {
      const p = participants.find(x => x.id === participantId);
      submitAction('move', participantId, p?.field_x, p?.field_y);
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    if (actionType === 'receive') {
      if (pendingInterceptChoice && pendingInterceptChoice.participantId === participantId) {
        submitAction('receive', participantId, pendingInterceptChoice.targetX, pendingInterceptChoice.targetY);
      } else {
        submitAction('receive', participantId);
      }
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    setDrawingAction({ type: actionType as DrawingState['type'], fromParticipantId: participantId });
    setShowActionMenu(null);
    setPendingInterceptChoice(null);
  };

  const handleFieldClick = (pctX: number, pctY: number) => {
    if (!drawingAction) return;
    const allPlayers = [...homePlayers, ...awayPlayers];
    const nearPlayer = allPlayers.find(p => {
      if (!p.field_x || !p.field_y) return false;
      const dx = p.field_x - pctX;
      const dy = p.field_y - pctY;
      return Math.sqrt(dx * dx + dy * dy) < 5;
    });

    if (drawingAction.type === 'shoot_controlled' || drawingAction.type === 'shoot_power') {
      const shooter = participants.find(p => p.id === drawingAction.fromParticipantId);
      if (!shooter) return;
      const goalTarget = getShootTarget(shooter);
      submitAction(drawingAction.type, drawingAction.fromParticipantId, goalTarget.x, clamp(pctY, 38, 62));
    } else if (drawingAction.type === 'pass_low' || drawingAction.type === 'pass_high' || drawingAction.type === 'pass_launch') {
      submitAction(drawingAction.type, drawingAction.fromParticipantId, pctX, pctY, nearPlayer?.id);
    } else {
      // Move action - check if clicking near a ball trajectory for domination / steal
      const drawingParticipant = participants.find(p => p.id === drawingAction.fromParticipantId);
      const ballHolderNow = participants.find(p => p.id === activeTurn?.ball_holder_participant_id);
      
      // Allow tackling stationary ball carrier (no action or stayed still)
      const ballPathAction = (() => {
        if (!activeTurn?.ball_holder_participant_id) return null;
        const bhAction = turnActions.find(action => {
          if (action.participant_id !== activeTurn.ball_holder_participant_id) return false;
          return action.action_type === 'pass_low' || action.action_type === 'pass_high' || action.action_type === 'pass_launch' || action.action_type === 'shoot_controlled' || action.action_type === 'shoot_power' || action.action_type === 'shoot' || action.action_type === 'move';
        });
        // If ball holder has no action (stationary), treat as move to current position
        if (!bhAction && ballHolderNow && ballHolderNow.field_x != null && ballHolderNow.field_y != null) {
          return { action_type: 'move', target_x: ballHolderNow.field_x, target_y: ballHolderNow.field_y, participant_id: activeTurn.ball_holder_participant_id } as MatchAction;
        }
        return bhAction ?? null;
      })();
      
      const canContestCarrierMove = ballPathAction?.action_type === 'move' && drawingParticipant?.club_id !== ballHolderNow?.club_id;
      const canContestBallPath = ballPathAction?.action_type !== 'move';
      
      // Check interception / domination of ball trajectory
      if (
        drawingParticipant &&
        ballPathAction &&
        ballHolderNow?.field_x != null &&
        ballHolderNow.field_y != null &&
        ballPathAction.target_x != null &&
        ballPathAction.target_y != null &&
        (canContestBallPath || canContestCarrierMove) &&
        pointToSegmentDistance(pctX, pctY, ballHolderNow.field_x, ballHolderNow.field_y, ballPathAction.target_x, ballPathAction.target_y) <= INTERCEPT_RADIUS
      ) {
        // Check if click falls in red (uninterceptable altitude) zone
        const _tdx = ballPathAction.target_x - ballHolderNow.field_x;
        const _tdy = ballPathAction.target_y - ballHolderNow.field_y;
        const _tlen2 = _tdx * _tdx + _tdy * _tdy;
        const _t = _tlen2 > 0 ? clamp(((pctX - ballHolderNow.field_x) * _tdx + (pctY - ballHolderNow.field_y) * _tdy) / _tlen2, 0, 1) : 0;
        const isRedZone = (ballPathAction.action_type === 'pass_high' && _t > 0.2 && _t < 0.8) ||
                          (ballPathAction.action_type === 'pass_launch' && _t > 0.35 && _t < 0.65);
        
        // Check reachability: can the player's action circle reach the ball BEFORE or AT the same time?
        let canReach = true;
        if (drawingParticipant.field_x != null && drawingParticipant.field_y != null) {
          const mdx = pctX - drawingParticipant.field_x;
          const mdy = pctY - drawingParticipant.field_y;
          const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
          const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);
          const movePct = maxRange > 0 ? Math.min(1, moveDist / maxRange) : 0;
          
          const bfx = ballHolderNow.field_x;
          const bfy = ballHolderNow.field_y;
          const btx = ballPathAction.target_x;
          const bty = ballPathAction.target_y;
          
          const circleRadiusField = 9 / INNER_W * 100;
          
          // Core logic: find the earliest point on trajectory where player can arrive before ball
          // tCursor = where along trajectory (0-1) the cursor's closest projection is
          const tCursor = _tlen2 > 0 ? clamp(((pctX - bfx) * _tdx + (pctY - bfy) * _tdy) / _tlen2, 0, 1) : 0;
          const distToTraj = pointToSegmentDistance(pctX, pctY, bfx, bfy, btx, bty);
          
          // Player arrives at cursor position when movePct of their range is used
          // Ball arrives at tCursor when ball progress = tCursor
          // Player can act if: they arrive BEFORE or WITH the ball
          // movePct = fraction of player's range used to reach cursor (lower = arrives sooner)
          // tCursor = fraction of ball's trajectory at that point (lower = ball arrives sooner)
          // Player arrives first if movePct <= tCursor (needs less % of range than ball needs of trajectory)
          canReach = (distToTraj <= (circleRadiusField + INTERCEPT_RADIUS) && movePct <= tCursor);
        }
        
        if (!isRedZone && canReach) {
          setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: pctX, targetY: pctY });
          setShowActionMenu(drawingAction.fromParticipantId);
          setDrawingAction(null);
          setMouseFieldPct(null);
          return;
        }
        // Red zone or can't reach: treat as normal move, don't offer intercept
      }
      
      // Check if clicking near a loose ball position or its inertia trajectory
      if (isLooseBall && looseBallPos) {
        const distToBall = Math.sqrt((pctX - looseBallPos.x) ** 2 + (pctY - looseBallPos.y) ** 2);
        // Check inertia trajectory interception
        if (ballInertiaDir && ballTrajectoryAction?.id === '__inertia__' && ballTrajectoryAction.target_x != null && ballTrajectoryAction.target_y != null) {
          const distToTraj = pointToSegmentDistance(pctX, pctY, looseBallPos.x, looseBallPos.y, ballTrajectoryAction.target_x, ballTrajectoryAction.target_y);
          if (distToTraj <= INTERCEPT_RADIUS) {
            // Check reachability
            const dp = participants.find(p => p.id === drawingAction.fromParticipantId);
            if (dp && dp.field_x != null && dp.field_y != null) {
              const mdx = pctX - dp.field_x;
              const mdy = pctY - dp.field_y;
              const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
              const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);
              const movePct = maxRange > 0 ? Math.min(1, moveDist / maxRange) : 0;
              const tdx = ballTrajectoryAction.target_x - looseBallPos.x;
              const tdy = ballTrajectoryAction.target_y - looseBallPos.y;
              const tlen2 = tdx * tdx + tdy * tdy;
              const tCursor = tlen2 > 0 ? clamp(((pctX - looseBallPos.x) * tdx + (pctY - looseBallPos.y) * tdy) / tlen2, 0, 1) : 0;
              if (movePct <= tCursor) {
                setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: pctX, targetY: pctY });
                setShowActionMenu(drawingAction.fromParticipantId);
                setDrawingAction(null);
                setMouseFieldPct(null);
                return;
              }
            }
          }
        }
        if (distToBall <= INTERCEPT_RADIUS * 1.2) {
          setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: pctX, targetY: pctY });
          setShowActionMenu(drawingAction.fromParticipantId);
          setDrawingAction(null);
          setMouseFieldPct(null);
          return;
        }
      }
      
      // Clamp move to max range based on player physics + inertia
      const moveFrom = participants.find(p => p.id === drawingAction.fromParticipantId);
      let mx = pctX, my = pctY;
      if (isPositioningTurn) {
        // Positioning: unlimited range, clamp to field + kickoff half
        mx = clamp(mx, 1, 99);
        my = clamp(my, 1, 99);
        const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
        const isKickoff = bh && Math.abs((bh.field_x ?? bh.pos_x ?? 50) - 50) < 5 && Math.abs((bh.field_y ?? bh.pos_y ?? 50) - 50) < 5;
        if (isKickoff && moveFrom) {
          const isHome = moveFrom.club_id === match?.home_club_id;
          if (isHome) mx = Math.min(mx, 49);
          else mx = Math.max(mx, 51);
        }
      } else if (moveFrom && moveFrom.field_x != null && moveFrom.field_y != null) {
        const dx = pctX - moveFrom.field_x;
        const dy = pctY - moveFrom.field_y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const direction = dist > 0.1 ? { x: dx, y: dy } : undefined;
        const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, direction);
        if (dist > maxRange) {
          const scale = maxRange / dist;
          mx = moveFrom.field_x + dx * scale;
          my = moveFrom.field_y + dy * scale;
        }
        console.log(`[PHYSICS] Move submitted: player=${drawingAction.fromParticipantId.slice(0,8)} dist=${dist.toFixed(1)} maxRange=${maxRange.toFixed(1)} clamped=${dist > maxRange} inertia=${direction ? 'yes' : 'no'}`);
      }
      submitAction('move', drawingAction.fromParticipantId, mx, my);
    }
    setDrawingAction(null);
    setMouseFieldPct(null);
  };

  const handlePlayerClick = (participantId: string) => {
    if (isPhaseProcessing) return;

    if (drawingAction) {
      const p = participants.find(x => x.id === participantId);
      if (p && (drawingAction.type === 'pass_low' || drawingAction.type === 'pass_high' || drawingAction.type === 'pass_launch')) {
        submitAction(drawingAction.type, drawingAction.fromParticipantId, p.field_x, p.field_y, participantId);
        setDrawingAction(null);
        setMouseFieldPct(null);
        return;
      }
    }

    const p = participants.find(x => x.id === participantId);
    if (!p) return;

    const hCount = participants.filter(pp => pp.club_id === match?.home_club_id && pp.role_type === 'player').length;
    const aCount = participants.filter(pp => pp.club_id === match?.away_club_id && pp.role_type === 'player').length;
    const isTest = hCount <= 4 && aCount <= 4;
    const canControlInTest = isTest && myRole === 'manager';
    const canControlOwn = myRole === 'manager' && p.club_id === myClubId;
    const canControlSelf = myRole === 'player' && myParticipant?.id === participantId;
    const isControllable = (canControlInTest || canControlOwn || canControlSelf) && p.role_type === 'player';

    if (isControllable) {
      setSelectedParticipantId(participantId);
      if (match?.status === 'live' && activeTurn) {
        const phase = activeTurn.phase;
        const isBH = activeTurn.ball_holder_participant_id === participantId;
        const isAttacking = p.club_id === activeTurn.possession_club_id;

        // Positioning turn: directly start move drawing (skip action menu)
        if (isPositioningTurn) {
          if (isBH) return; // Ball holder can't reposition
          if ((phase === 'positioning_attack' && isAttacking) || (phase === 'positioning_defense' && !isAttacking)) {
            setDrawingAction({ type: 'move', fromParticipantId: participantId });
            setShowActionMenu(null);
          }
          return;
        }

        if (
          (phase === 'ball_holder' && isBH) ||
          (phase === 'attacking_support' && isAttacking) ||
          (phase === 'defending_response' && !isAttacking)
        ) {
          setShowActionMenu(participantId);
        }
      }
    }
  };

  // ─── All submitted actions are always visible ───────────────
  const visibleActions = useMemo(() => {
    return turnActions;
  }, [turnActions]);

  // ─── Animation for phase 4 ─────────────────────────────────
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  const turnActionsRef = useRef(turnActions);
  turnActionsRef.current = turnActions;

  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    if (!activeTurn || activeTurn.phase !== 'resolution') return;
    if (animatedResolutionIdRef.current === activeTurn.id) return;

    const startDelay = setTimeout(() => {
      if (animatedResolutionIdRef.current === activeTurn.id) return;

      const currentParticipants = participantsRef.current;
      const snapshot = Object.fromEntries(
        currentParticipants
          .filter(p => p.field_x != null && p.field_y != null)
          .map(p => [p.id, { x: p.field_x as number, y: p.field_y as number }])
      );

      setResolutionStartPositions(snapshot);
      animatedResolutionIdRef.current = activeTurn.id;
      setAnimating(true);
      setAnimProgress(0);

      const duration = 2500;
      let startTime: number | null = null;

      const animate = (now: number) => {
        if (startTime === null) startTime = now;
        const progress = Math.min(1, (now - startTime) / duration);
        setAnimProgress(progress);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Animation done: lock final positions
          const latestActions = turnActionsRef.current;
          const finals: Record<string, { x: number; y: number }> = {};
          
          for (const p of participantsRef.current) {
            // Both 'move' and 'receive' actions cause player to end at target
            const action = latestActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
            if (action && action.target_x != null && action.target_y != null) {
              finals[p.id] = { x: action.target_x, y: action.target_y };
            } else {
              const startPos = snapshot[p.id];
              if (startPos) finals[p.id] = startPos;
            }
          }
          
          setFinalPositions(finals);

          // Store movement directions for inertia system
          // IMPORTANT: if a player did NOT move this turn, RESET their inertia
          const newDirections: Record<string, { x: number; y: number }> = { ...prevDirectionsRef.current };
          for (const p of participantsRef.current) {
            const moveAct = latestActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
            if (moveAct && moveAct.target_x != null && moveAct.target_y != null) {
              const sp = snapshot[p.id];
              if (sp) {
                const ddx = moveAct.target_x - sp.x;
                const ddy = moveAct.target_y - sp.y;
                if (Math.sqrt(ddx * ddx + ddy * ddy) > 0.5) {
                  newDirections[p.id] = { x: ddx, y: ddy };
                } else {
                  delete newDirections[p.id]; // Stayed still — reset inertia
                }
              }
            } else {
              // Player didn't move at all — reset inertia completely
              delete newDirections[p.id];
            }
          }
          prevDirectionsRef.current = newDirections;
          
           // Compute final ball position
           const bhId = activeTurn.ball_holder_participant_id;
           const interceptAction = latestActions.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null);
           
           if (bhId) {
             // Prioritize pass/shoot over move for ball destination
             const bhAllActions = latestActions
               .filter(a => a.participant_id === bhId)
               .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
             const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type))
               || bhAllActions[0];
             
              if (ballAction) {
                let fbp: { x: number; y: number } | null = null;
                const sp = snapshot[bhId];
                
                if ((ballAction.action_type === 'pass_low' || ballAction.action_type === 'pass_high' || ballAction.action_type === 'pass_launch') && ballAction.target_x != null && ballAction.target_y != null) {
                  if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                    fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                  } else {
                    fbp = { x: ballAction.target_x, y: ballAction.target_y };
                  }
                  // Store direction for inertia (from passer start to ball end)
                  if (sp) {
                    lastBallDirRef.current = { dx: ballAction.target_x - sp.x, dy: ballAction.target_y - sp.y };
                  }
                } else if ((ballAction.action_type === 'shoot' || ballAction.action_type === 'shoot_controlled' || ballAction.action_type === 'shoot_power') && ballAction.target_x != null && ballAction.target_y != null) {
                  if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                    fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                  } else {
                    const shooter = participantsRef.current.find(p => p.id === bhId);
                    const isHome = shooter?.club_id === matchRef.current?.home_club_id;
                    fbp = { x: isHome ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT, y: ballAction.target_y };
                  }
                  // Store direction for missed shots too
                  if (sp) {
                    lastBallDirRef.current = { dx: ballAction.target_x - sp.x, dy: ballAction.target_y - sp.y };
                  }
                } else if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
                  if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                    fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                  } else {
                    fbp = { x: ballAction.target_x, y: ballAction.target_y };
                  }
                  lastBallDirRef.current = null; // No inertia for dribble
                }
                
                if (fbp) {
                  setFinalBallPos(fbp);
                  finalBallPosRef.current = fbp;
                }
              }
            } else if (!bhId && carriedLooseBallPos && ballInertiaDir) {
              // Loose ball with inertia: move ball to post-inertia position
              const INERTIA_DISPLAY = 0.15;
              const newX = clamp(carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY, 2, 98);
              const newY = clamp(carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY, 2, 98);
              const newPos = { x: newX, y: newY };
              setCarriedLooseBallPos(newPos);
              finalBallPosRef.current = newPos;
              setFinalBallPos(newPos);
              // Inertia consumed — ball will stop next turn
              setBallInertiaDir(null);
              lastBallDirRef.current = null;
            }
          
          setAnimating(false);

          // Update participant positions
          setParticipants(prev => prev.map(p => {
            const f = finals[p.id];
            if (f) return { ...p, field_x: f.x, field_y: f.y, pos_x: f.x, pos_y: f.y };
            return p;
          }));
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    }, 200);

    return () => {
      clearTimeout(startDelay);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeTurn?.phase, activeTurn?.id]);

  // ── Compute animated positions (physics-based easing) ───────
  const getAnimatedPos = (p: Participant): { x: number; y: number } => {
    // If we have final locked positions (post-animation), use them
    if (finalPositions[p.id] && !animating) {
      return finalPositions[p.id];
    }
    
    if (!animating || activeTurn?.phase !== 'resolution') {
      return { x: p.field_x ?? 50, y: p.field_y ?? 50 };
    }

    // Both 'move' and 'receive' actions cause the player to move to target
    const moveAction = turnActions.find(
      a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null
    );
    const startPos = resolutionStartPositions[p.id];
    const startX = startPos?.x ?? p.field_x ?? 50;
    const startY = startPos?.y ?? p.field_y ?? 50;

    if (!moveAction || moveAction.target_x == null || moveAction.target_y == null) {
      return { x: startX, y: startY };
    }

    // Physics-based easing: slow start (acceleration), fast mid, slight decel at end
    // Simulates inertia — player needs to accelerate and can't change direction instantly
    const raw = animProgress;
    // Multi-segment ease: slow acceleration phase (0-0.3), cruise (0.3-0.8), slight decel (0.8-1)
    let t: number;
    if (raw < 0.3) {
      // Acceleration phase: quadratic ease-in
      const seg = raw / 0.3;
      t = seg * seg * 0.3;
    } else if (raw < 0.8) {
      // Cruise phase: linear
      const seg = (raw - 0.3) / 0.5;
      t = 0.3 + seg * 0.55;
    } else {
      // Deceleration phase: ease-out
      const seg = (raw - 0.8) / 0.2;
      t = 0.85 + (1 - Math.pow(1 - seg, 2)) * 0.15;
    }

    return {
      x: startX + (moveAction.target_x - startX) * t,
      y: startY + (moveAction.target_y - startY) * t,
    };
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

  const possClubId = activeTurn?.possession_club_id ?? match.possession_club_id;
  const isTestMatch = homePlayers.length <= 4 && awayPlayers.length <= 4;
  const isLooseBall = activeTurn && !activeTurn.ball_holder_participant_id;

  // Get actions for current phase
  const getActionsForParticipant = (participantId: string): string[] => {
    if (!activeTurn || isPhaseProcessing) return [];
    const p = participants.find(x => x.id === participantId);
    if (!p) return [];
    const phase = activeTurn.phase;
    const isBH = activeTurn.ball_holder_participant_id === participantId;
    const currentPossClubId = activeTurn.possession_club_id;
    const isAttacking = p.club_id === currentPossClubId;
    const hasReceivePrompt = pendingInterceptChoice?.participantId === participantId;

    // Positioning turn: move only, ball holder can't move
    if (isPositioningTurn) {
      if (isBH) return []; // Ball holder (kicker) can't reposition
      if (phase === 'positioning_attack' && isAttacking) return ['move'];
      if (phase === 'positioning_defense' && !isAttacking) return ['move'];
      return [];
    }

    // Loose ball: skip phase 1, both teams move in phase 2/3
    if (isLooseBall) {
      if (phase === 'ball_holder') return []; // Skipped
      if (phase === 'attacking_support' && isAttacking) return hasReceivePrompt ? ['receive', 'move', 'no_action'] : ['no_action', 'move'];
      if (phase === 'defending_response' && !isAttacking) return hasReceivePrompt ? ['receive', 'move', 'no_action'] : ['no_action', 'move'];
      return [];
    }

    if (phase === 'ball_holder' && isBH) return ['move', 'pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power'];
    // Ball holder can also mini-move in phase 2 (after passing/shooting in phase 1)
    if (phase === 'attacking_support' && isBH) return ['move', 'no_action'];
    if (phase === 'attacking_support' && isAttacking && !isBH) return hasReceivePrompt ? ['receive', 'move', 'no_action'] : ['no_action', 'move'];
    if (phase === 'defending_response' && !isAttacking) return hasReceivePrompt ? ['receive', 'move', 'no_action'] : ['no_action', 'move'];
    return [];
  };

  // ─── Field constants ───────────────────────────────────────
  const FIELD_W = 900;
  const FIELD_H = 580;
  const PAD = 20;
  const INNER_W = FIELD_W - PAD * 2;
  const INNER_H = FIELD_H - PAD * 2;

  const toSVG = (pctX: number, pctY: number) => ({
    x: PAD + (pctX / 100) * INNER_W,
    y: PAD + (pctY / 100) * INNER_H,
  });

  const toField = (svgX: number, svgY: number) => ({
    x: ((svgX - PAD) / INNER_W) * 100,
    y: ((svgY - PAD) / INNER_H) * 100,
  });

  const getDrawingBounds = (type: DrawingState['type']) => {
    if (type === 'move') return { min: 0, max: 100 };
    return { min: -8, max: 108 };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingAction || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    const bounds = getDrawingBounds(drawingAction.type);
    let finalX = clamp(fp.x, bounds.min, bounds.max);
    let finalY = clamp(fp.y, bounds.min, bounds.max);

    // Clamp move arrow to max range based on player physics + inertia
    if (drawingAction.type === 'move') {
      if (isPositioningTurn) {
        // Positioning: unlimited range, but clamp to field and kickoff half-field
        finalX = clamp(finalX, 1, 99);
        finalY = clamp(finalY, 1, 99);
        // Kickoff half-field constraint
        const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
        const isKickoff = bh && Math.abs((bh.field_x ?? bh.pos_x ?? 50) - 50) < 5 && Math.abs((bh.field_y ?? bh.pos_y ?? 50) - 50) < 5;
        if (isKickoff) {
          const fromP = participants.find(p => p.id === drawingAction.fromParticipantId);
          if (fromP) {
            const isHome = fromP.club_id === match?.home_club_id;
            if (isHome) finalX = Math.min(finalX, 49);
            else finalX = Math.max(finalX, 51);
          }
        }
      } else {
        const fromP = participants.find(p => p.id === drawingAction.fromParticipantId);
        if (fromP && fromP.field_x != null && fromP.field_y != null) {
          const dx = finalX - fromP.field_x;
          const dy = finalY - fromP.field_y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const direction = dist > 0.1 ? { x: dx, y: dy } : undefined;
          const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, direction);
          if (dist > maxRange) {
            const scale = maxRange / dist;
            finalX = fromP.field_x + dx * scale;
            finalY = fromP.field_y + dy * scale;
          }
        }
      }
    }

    setMouseFieldPct({ x: finalX, y: finalY });
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingAction || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    const bounds = getDrawingBounds(drawingAction.type);
    handleFieldClick(clamp(fp.x, bounds.min, bounds.max), clamp(fp.y, bounds.min, bounds.max));
  };

  // Ball holder position
  const ballHolder = [...homePlayers, ...awayPlayers].find(p => p.id === activeTurn?.ball_holder_participant_id);

  // Find if anyone intercepted the ball this turn (has a 'receive' action)
  const interceptorAction = turnActions.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null) || null;

  // Loose ball position: persist across turns until someone regains possession
  const looseBallPos = (() => {
    if (!isLooseBall) return null;
    if (finalBallPos) return finalBallPos;
    if (carriedLooseBallPos) return carriedLooseBallPos;
    const lastBallAction = turnActions.find(a =>
      (a.action_type === 'pass_low' || a.action_type === 'pass_high' || a.action_type === 'pass_launch' || a.action_type === 'shoot' || a.action_type === 'shoot_controlled' || a.action_type === 'shoot_power' || a.action_type === 'move') &&
      a.target_x != null && a.target_y != null
    );
    if (lastBallAction) return { x: lastBallAction.target_x!, y: lastBallAction.target_y! };
    return null;
  })();

  const isShootAction = (t: string) => t === 'shoot' || t === 'shoot_controlled' || t === 'shoot_power';
  const isPassAction = (t: string) => t === 'pass_low' || t === 'pass_high' || t === 'pass_launch';

  const getAnimatedBallPos = (): { x: number; y: number } | null => {
    // Use locked final ball position if available (post-animation)
    if (finalBallPos && !animating) {
      return finalBallPos;
    }

    if (!ballHolder) {
      // During resolution, animate loose ball along inertia trajectory
      if (animating && activeTurn?.phase === 'resolution' && ballInertiaDir && carriedLooseBallPos) {
        const INERTIA_DISPLAY = 0.15;
        const endX = clamp(carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY, 2, 98);
        const endY = clamp(carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY, 2, 98);
        const raw = animProgress;
        const ballEaseK = 3;
        const expDecay = 1 - Math.exp(-ballEaseK * raw);
        const normFactor = 1 - Math.exp(-ballEaseK);
        const t = expDecay / normFactor;
        return {
          x: carriedLooseBallPos.x + (endX - carriedLooseBallPos.x) * t,
          y: carriedLooseBallPos.y + (endY - carriedLooseBallPos.y) * t,
        };
      }
      // Loose ball: show at last known position
      if (looseBallPos) return looseBallPos;
      if (finalBallPos) return finalBallPos;
      return null;
    }

    const holderRenderPos = getAnimatedPos(ballHolder);
    const defaultBallPos = { x: holderRenderPos.x + 1.2, y: holderRenderPos.y - 1.2 };

    // Prioritize pass/shoot over move for ball animation
    const bhAllActions = turnActions
      .filter(action => action.participant_id === ballHolder.id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type))
      || bhAllActions[0];

    if (!animating || activeTurn?.phase !== 'resolution' || !ballAction) {
      return defaultBallPos;
    }

    const startPos = resolutionStartPositions[ballHolder.id] ?? {
      x: ballHolder.field_x ?? 50,
      y: ballHolder.field_y ?? 50,
    };
    // Ball starts from player + offset (matching arrow origin)
    const ballStartX = startPos.x + 1.2;
    const ballStartY = startPos.y - 1.2;

    // Physics-based ball easing: exponential decay (fast launch, decelerating)
    const ballEaseK = (ballAction.action_type === 'shoot' || ballAction.action_type === 'shoot_power') ? 5 : ballAction.action_type === 'shoot_controlled' ? 3 : ballAction.action_type === 'pass_high' ? 2.5 : ballAction.action_type === 'pass_launch' ? 3.5 : 3;
    const rawT = animProgress;
    const expDecay = 1 - Math.exp(-ballEaseK * rawT);
    const normFactor = 1 - Math.exp(-ballEaseK);
    const t = expDecay / normFactor; // normalized to [0, 1]

    if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
      const dx = ballAction.target_x - startPos.x;
      const dy = ballAction.target_y - startPos.y;

      if (interceptorAction && interceptorAction.target_x != null && interceptorAction.target_y != null) {
        const len2 = dx * dx + dy * dy;
        const interceptT = len2 > 0
          ? clamp(
              ((interceptorAction.target_x - startPos.x) * dx + (interceptorAction.target_y - startPos.y) * dy) / len2,
              0,
              1
            )
          : 1;
        const effectiveT = Math.min(t, interceptT);
        // Ball follows player path during dribble + offset
        return {
          x: startPos.x + dx * effectiveT + 1.2,
          y: startPos.y + dy * effectiveT - 1.2,
        };
      }

      // Ball sticks to player during dribbling — use player's animated position
      const playerAnimPos = getAnimatedPos(ballHolder);
      return {
        x: playerAnimPos.x + 1.2,
        y: playerAnimPos.y - 1.2,
      };
    }

    const isBallPass = ballAction.action_type === 'pass_low' || ballAction.action_type === 'pass_high' || ballAction.action_type === 'pass_launch';
    const isBallShoot = ballAction.action_type === 'shoot' || ballAction.action_type === 'shoot_controlled' || ballAction.action_type === 'shoot_power';

    if ((isBallPass || isBallShoot) && ballAction.target_x != null && ballAction.target_y != null) {
      if (interceptorAction && interceptorAction.target_x != null && interceptorAction.target_y != null) {
        // Ball follows trajectory from ball start to target, capped at intercept point
        const dx = ballAction.target_x - ballStartX;
        const dy = ballAction.target_y - ballStartY;
        const len2 = dx * dx + dy * dy;
        let interceptT = 1;
        if (len2 > 0) {
          interceptT = clamp(
            ((interceptorAction.target_x - ballStartX) * dx + (interceptorAction.target_y - ballStartY) * dy) / len2,
            0, 1
          );
        }
        const effectiveT = Math.min(t, interceptT);
        return {
          x: ballStartX + dx * effectiveT,
          y: ballStartY + dy * effectiveT,
        };
      }

      if (isBallShoot) {
        const isHome = ballHolder.club_id === match.home_club_id;
        const goalX = isHome ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT;
        const goalY = ballAction.target_y;
        return {
          x: ballStartX + (goalX - ballStartX) * t,
          y: ballStartY + (goalY - ballStartY) * t,
        };
      }

      // Ball follows exact trajectory line from ball start to target
      return {
        x: ballStartX + (ballAction.target_x - ballStartX) * t,
        y: ballStartY + (ballAction.target_y - ballStartY) * t,
      };
    }

    return defaultBallPos;
  };

  const ballDisplayPos = getAnimatedBallPos();

  // Arrow from drawing action
  const drawingFrom = drawingAction ? participants.find(p => p.id === drawingAction.fromParticipantId) : null;

  // Shot target: for shoot, arrow goes slightly inside the goal
  const getShootTarget = (fromPart: Participant): { x: number; y: number } => {
    const isHome = fromPart.club_id === match.home_club_id;
    return isHome ? { x: 100 + GOAL_LINE_OVERFLOW_PCT, y: 50 } : { x: 0 - GOAL_LINE_OVERFLOW_PCT, y: 50 };
  };

  // Arrow quality based on distance
  const getArrowQuality = (fromX: number, fromY: number, toX: number, toY: number, type: string, participantId?: string): string => {
    const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    const attrs = participantId ? playerAttrsMap[participantId] : null;

    if (type === 'shoot_controlled') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 12;
      const eDist = dist - accBonus;
      if (eDist < 35) return '#22c55e';
      if (eDist < 55) return '#f59e0b';
      return '#ef4444';
    }
    if (type === 'shoot_power') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 6;
      const powBonus = normalizeAttr(Number(attrs?.forca_chute ?? 40)) * 4;
      const eDist = dist - accBonus - powBonus;
      if (eDist < 25) return '#f59e0b'; // power shot default yellow
      if (eDist < 40) return '#f59e0b';
      return '#ef4444'; // red = over the goal risk
    }
    if (type === 'shoot') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 10;
      const powBonus = normalizeAttr(Number(attrs?.forca_chute ?? 40)) * 5;
      const eDist = dist - accBonus - powBonus;
      if (eDist < 30) return '#22c55e';
      if (eDist < 50) return '#f59e0b';
      return '#ef4444';
    }
    if (type === 'pass_high') {
      const passBonus = normalizeAttr(Number(attrs?.passe_alto ?? 40)) * 10;
      const eDist = dist - passBonus;
      if (eDist < 25) return '#22c55e';
      if (eDist < 45) return '#f59e0b';
      return '#ef4444';
    }
    if (type === 'pass_launch') {
      const passBonus = (normalizeAttr(Number(attrs?.passe_baixo ?? 40)) + normalizeAttr(Number(attrs?.passe_alto ?? 40))) / 2 * 9;
      const eDist = dist - passBonus;
      if (eDist < 22) return '#22c55e';
      if (eDist < 42) return '#f59e0b';
      return '#ef4444';
    }
    // pass_low default
    const passBonus = normalizeAttr(Number(attrs?.passe_baixo ?? 40)) * 8;
    const eDist = dist - passBonus;
    if (eDist < 20) return '#22c55e';
    if (eDist < 40) return '#f59e0b';
    return '#ef4444';
  };

  // Action menu position (HTML overlay)
  const getActionMenuScreenPos = (participantId: string): { left: number; top: number } | null => {
    if (!svgRef.current) return null;
    const p = participants.find(x => x.id === participantId);
    if (!p || p.field_x == null || p.field_y == null) return null;
    const svgPos = toSVG(p.field_x, p.field_y);
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    return {
      left: rect.left + (svgPos.x / totalW) * rect.width,
      top: rect.top + (svgPos.y / totalH) * rect.height,
    };
  };

  const currentPhaseDuration = activeTurn?.phase === 'resolution' ? RESOLUTION_PHASE_DURATION : PHASE_DURATION;
  const phaseProgress = phaseTimeLeft > 0 ? phaseTimeLeft / currentPhaseDuration : 0;


  const getActionArrowColor = (
    action: MatchAction,
    fromPart: Participant,
    origin?: { x: number; y: number }
  ): { color: string; markerId: string; strokeW: number } => {
    const fromX = origin?.x ?? fromPart.field_x ?? 50;
    const fromY = origin?.y ?? fromPart.field_y ?? 50;

    if (action.action_type === 'move') {
      return { color: '#1a1a2e', markerId: 'ah-black', strokeW: 2 };
    }
    if (action.action_type === 'receive') {
      return { color: '#1a1a2e', markerId: 'ah-cyan', strokeW: 2 };
    }
    if (isShootAction(action.action_type)) {
      const color = action.target_x != null && action.target_y != null
        ? getArrowQuality(fromX, fromY, action.target_x, action.target_y, action.action_type, action.participant_id)
        : '#f59e0b';
      const markerId = 'ah-green'; // arrow tip always green
      return { color, markerId, strokeW: 3.5 };
    }
    if (isPassAction(action.action_type)) {
      const color = action.target_x != null && action.target_y != null
        ? getArrowQuality(fromX, fromY, action.target_x, action.target_y, action.action_type, action.participant_id)
        : '#06b6d4';
      const markerId = 'ah-green'; // arrow tip always green
      return { color, markerId, strokeW: 3 };
    }
    // fallback
    const color = action.target_x != null && action.target_y != null
      ? getArrowQuality(fromX, fromY, action.target_x, action.target_y, 'pass', action.participant_id)
      : '#06b6d4';
    const markerId = color === '#22c55e' ? 'ah-green' : color === '#f59e0b' ? 'ah-yellow' : 'ah-red';
    return { color, markerId, strokeW: 3 };
  };

  // Compute intercept zone path for ball trajectory
  const getBallTrajectoryAction = (): MatchAction | null => {
    if (!activeTurn?.ball_holder_participant_id) {
      // Loose ball with inertia — create a virtual pass_low trajectory
      if (isLooseBall && looseBallPos && ballInertiaDir) {
        const inertiaLen = Math.sqrt(ballInertiaDir.dx * ballInertiaDir.dx + ballInertiaDir.dy * ballInertiaDir.dy);
        if (inertiaLen >= 0.5) {
          const INERTIA_DISPLAY = 0.15;
          const endX = clamp(looseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY, 2, 98);
          const endY = clamp(looseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY, 2, 98);
          return {
            id: '__inertia__',
            match_id: matchId || '',
            match_turn_id: activeTurn?.id || '',
            participant_id: '__inertia_origin__',
            controlled_by_type: 'system',
            action_type: 'pass_low',
            target_x: endX,
            target_y: endY,
            target_participant_id: null,
            status: 'pending',
          } as MatchAction;
        }
      }
      return null;
    }
    return turnActions.find(a => 
      a.participant_id === activeTurn.ball_holder_participant_id &&
      (isPassAction(a.action_type) || isShootAction(a.action_type) || a.action_type === 'move') &&
      a.target_x != null && a.target_y != null
    ) || null;
  };

  const ballTrajectoryAction = getBallTrajectoryAction();
  // For inertia trajectories, create a virtual holder at the loose ball position
  const ballTrajectoryHolder = ballTrajectoryAction
    ? (ballTrajectoryAction.id === '__inertia__' && looseBallPos
      ? { id: '__inertia_origin__', field_x: looseBallPos.x, field_y: looseBallPos.y, club_id: '' } as unknown as Participant
      : participants.find(p => p.id === ballTrajectoryAction.participant_id) || null)
    : null;

  return (
    <div className="h-screen bg-[hsl(140,15%,12%)] text-foreground flex flex-col overflow-hidden">
      {/* ── Top scoreboard bar ── */}
      <div className="bg-[hsl(140,20%,8%)] border-b border-[hsl(140,10%,20%)] px-4 py-1.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-display text-[10px] ${isLive ? 'border-pitch/60 text-pitch animate-pulse' : 'border-border text-muted-foreground'}`}>
            {isLive && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-pitch inline-block" />}
            {isLive ? 'AO VIVO' : isFinished ? 'ENCERRADA' : 'AGENDADA'}
          </Badge>
          {isTestMatch && <Badge variant="secondary" className="text-[9px] font-display">TESTE 2v2</Badge>}
          {isLooseBall && <Badge variant="secondary" className="text-[9px] font-display text-warning border-warning/40">BOLA SOLTA</Badge>}
          {isPhaseProcessing && <Badge variant="secondary" className="text-[9px] font-display animate-pulse">PROCESSANDO</Badge>}
          {isPositioningTurn && <Badge variant="secondary" className="text-[9px] font-display text-tactical border-tactical/40">📍 POSICIONAMENTO</Badge>}
        </div>

        <div className="flex items-center gap-4">
          <ClubBadgeInline club={homeClub} />
          <div className="font-display text-3xl font-extrabold tracking-widest">
            <span style={{ color: homeClub?.primary_color }}>{match.home_score}</span>
            <span className="text-muted-foreground mx-2 text-lg">:</span>
            <span style={{ color: awayClub?.primary_color }}>{match.away_score}</span>
          </div>
          <ClubBadgeInline club={awayClub} right />
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exitToDashboard} className="h-8 text-[10px] font-display">
            <LogOut className="h-3 w-3" /> Sair
          </Button>
          {isManager && isTestMatch && isLive && (
            <button
              onClick={finishMatch}
              className="flex items-center gap-1 text-[10px] font-display bg-destructive/20 text-destructive border border-destructive/40 px-2 py-1 rounded hover:bg-destructive/30 transition-colors"
            >
              <Square className="h-3 w-3" /> Finalizar
            </button>
          )}
          {myRole === 'spectator' && <Badge variant="secondary" className="text-[10px] font-display"><Eye className="h-3 w-3 mr-1" />Espectador</Badge>}
          {isPlayer && <Badge className="bg-pitch/20 text-pitch text-[10px] border border-pitch/40 font-display"><User className="h-3 w-3 mr-1" />Jogador</Badge>}
          {isManager && (
            <Badge className="bg-tactical/20 text-tactical text-[10px] border border-tactical/40 font-display">
              <User className="h-3 w-3 mr-1" />Manager
            </Badge>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Field area (dominant) ── */}
        <div className="flex-1 flex items-center justify-center p-2 relative" style={{ background: 'linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)' }}>
          <div className="relative w-full" style={{ maxWidth: 960 }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${FIELD_W + PAD * 2} ${FIELD_H + PAD * 2}`}
              className="w-full rounded-lg"
              style={{ cursor: drawingAction ? 'crosshair' : 'default' }}
              onMouseMove={handleSvgMouseMove}
              onClick={handleSvgClick}
            >
              {/* Defs */}
              <defs>
                <pattern id="grass" x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="40" height={INNER_H} fill="hsl(100,45%,28%)" />
                  <rect x="40" y="0" width="40" height={INNER_H} fill="hsl(100,42%,25%)" />
                </pattern>
                <filter id="glow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.5" /></filter>
                <filter id="pulse-glow">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Arrow markers — smaller (ball-sized) */}
                <marker id="ah-black" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#1a1a2e" /></marker>
                <marker id="ah-green" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#22c55e" /></marker>
                <marker id="ah-yellow" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#f59e0b" /></marker>
                <marker id="ah-red" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#ef4444" /></marker>
                <marker id="ah-cyan" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#06b6d4" /></marker>
              </defs>

              {/* Border frame */}
              <rect x="0" y="0" width={FIELD_W + PAD * 2} height={FIELD_H + PAD * 2} fill="hsl(140,10%,15%)" rx="8" />

              {/* Grass surface */}
              <rect x={PAD} y={PAD} width={INNER_W} height={INNER_H} fill="url(#grass)" />

              {/* Field lines */}
              <g stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none">
                <rect x={PAD + 2} y={PAD + 2} width={INNER_W - 4} height={INNER_H - 4} />
                <line x1={PAD + INNER_W / 2} y1={PAD + 2} x2={PAD + INNER_W / 2} y2={PAD + INNER_H - 2} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={INNER_H * 0.15} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={3} fill="rgba(255,255,255,0.6)" />
                <rect x={PAD + 2} y={PAD + INNER_H * 0.22} width={INNER_W * 0.16} height={INNER_H * 0.56} />
                <rect x={PAD + 2} y={PAD + INNER_H * 0.35} width={INNER_W * 0.06} height={INNER_H * 0.30} />
                <path d={`M ${PAD + 2 + INNER_W * 0.16} ${PAD + INNER_H * 0.38} A ${INNER_H * 0.12} ${INNER_H * 0.12} 0 0 1 ${PAD + 2 + INNER_W * 0.16} ${PAD + INNER_H * 0.62}`} />
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

              {/* ── Kickoff half-field overlay during positioning ── */}
              {isPositioningTurn && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                const isKickoff = bh && Math.abs((bh.field_x ?? bh.pos_x ?? 50) - 50) < 5 && Math.abs((bh.field_y ?? bh.pos_y ?? 50) - 50) < 5;
                if (!isKickoff || !drawingAction) return null;
                const drawingPlayer = participants.find(p => p.id === drawingAction.fromParticipantId);
                if (!drawingPlayer) return null;
                const isHome = drawingPlayer.club_id === match.home_club_id;
                // Shade the opponent's half
                const shadeX = isHome ? toSVG(50, 0).x : PAD;
                const shadeW = isHome ? (PAD + INNER_W - toSVG(50, 0).x) : (toSVG(50, 0).x - PAD);
                return (
                  <rect x={shadeX} y={PAD} width={shadeW} height={INNER_H}
                    fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="6,4" />
                );
              })()}

              {/* ── Intercept zone visualization ── */}
              {ballTrajectoryAction && ballTrajectoryHolder && ballTrajectoryHolder.field_x != null && ballTrajectoryHolder.field_y != null &&
                ballTrajectoryAction.target_x != null && ballTrajectoryAction.target_y != null &&
                (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (
                (() => {
                  const fromSvg = toSVG(ballTrajectoryHolder.field_x!, ballTrajectoryHolder.field_y!);
                  const toSvgPt = toSVG(ballTrajectoryAction.target_x!, ballTrajectoryAction.target_y!);
                  const dx = toSvgPt.x - fromSvg.x;
                  const dy = toSvgPt.y - fromSvg.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len < 1) return null;
                  // Perpendicular offset for the zone width
                  const px = (-dy / len) * (INTERCEPT_RADIUS / 100) * INNER_W;
                  const py = (dx / len) * (INTERCEPT_RADIUS / 100) * INNER_H;
                  const points = [
                    `${fromSvg.x + px},${fromSvg.y + py}`,
                    `${toSvgPt.x + px},${toSvgPt.y + py}`,
                    `${toSvgPt.x - px},${toSvgPt.y - py}`,
                    `${fromSvg.x - px},${fromSvg.y - py}`,
                  ].join(' ');
                  return (
                    <polygon
                      points={points}
                      fill="rgba(59, 130, 246, 0.08)"
                      stroke="rgba(59, 130, 246, 0.25)"
                      strokeWidth="1"
                      strokeDasharray="6,4"
                    />
                  );
                })()
              )}

              {/* ── Loose ball intercept zone (circle around loose ball) ── */}
              {isLooseBall && looseBallPos && !animating &&
                (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (() => {
                const ballSvg = toSVG(looseBallPos.x, looseBallPos.y);
                const zoneR = (INTERCEPT_RADIUS / 100) * INNER_W * 1.15;
                return (
                  <circle
                    cx={ballSvg.x} cy={ballSvg.y} r={zoneR}
                    fill="rgba(59, 130, 246, 0.08)"
                    stroke="rgba(59, 130, 246, 0.25)"
                    strokeWidth="1"
                    strokeDasharray="6,4"
                  />
                );
              })()}

              {/* ── Ball inertia trajectory — green arrow + label (rendered like a real pass_low) ── */}
              {isLooseBall && looseBallPos && ballInertiaDir && !animating &&
                ballTrajectoryAction?.id === '__inertia__' &&
                ballTrajectoryAction.target_x != null && ballTrajectoryAction.target_y != null &&
                (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (() => {
                const from = toSVG(looseBallPos.x, looseBallPos.y);
                const to = toSVG(ballTrajectoryAction.target_x!, ballTrajectoryAction.target_y!);
                return (
                  <g pointerEvents="none">
                    {/* Solid green arrow — same as pass_low */}
                    <line
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#22c55e" strokeWidth={3}
                      strokeLinecap="round" opacity={0.8}
                      markerEnd="url(#ah-green)"
                    />
                    {/* Label */}
                    <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}
                      textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="bold" opacity={0.8}>
                      ⚽ Inércia
                    </text>
                  </g>
                );
              })()}

              {/* (Fixed markers removed — live preview replaces them) */}

              {visibleActions.map(action => {
                if (action.target_x == null || action.target_y == null) return null;
                const fromPart = participants.find(p => p.id === action.participant_id);
                if (!fromPart || fromPart.field_x == null || fromPart.field_y == null) return null;

                const lockedOrigin = activeTurn?.phase === 'resolution' ? resolutionStartPositions[action.participant_id] : null;
                const isBHAction = action.participant_id === activeTurn?.ball_holder_participant_id && (isPassAction(action.action_type) || isShootAction(action.action_type));
                const baseFromX = lockedOrigin?.x ?? fromPart.field_x;
                const baseFromY = lockedOrigin?.y ?? fromPart.field_y;
                // Pass/shoot arrows start from ball position
                const fromX = isBHAction ? (baseFromX + 1.2) : baseFromX;
                const fromY = isBHAction ? (baseFromY - 1.2) : baseFromY;
                const from = toSVG(fromX, fromY);
                const to = toSVG(action.target_x, action.target_y);
                const { color, markerId, strokeW } = getActionArrowColor(action, fromPart, { x: fromX, y: fromY });
                const controlLabel = action.controlled_by_type === 'bot' ? '🤖' : action.controlled_by_type === 'manager' ? '📋' : '👤';
                const opacity = animating && activeTurn?.phase === 'resolution' ? 0.45 : 0.8;
                const dashArray = action.controlled_by_type === 'bot' ? '4,3' : 'none';

                // Multi-segment arrow rendering for height-based actions
                const renderMultiSegmentArrow = () => {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;

                  if (action.action_type === 'pass_high') {
                    // Yellow (20%) → Red (60%) → Yellow (20%), tip green
                    const seg = [
                      { t0: 0, t1: 0.2, color: '#f59e0b' },
                      { t0: 0.2, t1: 0.8, color: '#ef4444' },
                      { t0: 0.8, t1: 1, color: '#f59e0b' },
                    ];
                    return seg.map((s, i) => (
                      <line key={i}
                        x1={from.x + dx * s.t0} y1={from.y + dy * s.t0}
                        x2={from.x + dx * s.t1} y2={from.y + dy * s.t1}
                        stroke={s.color} strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        strokeDasharray={dashArray}
                        markerEnd={i === seg.length - 1 ? `url(#${markerId})` : undefined}
                      />
                    ));
                  }

                  if (action.action_type === 'pass_launch') {
                    // Yellow (35%) → Red (30%) → Yellow (35%), tip green
                    const seg = [
                      { t0: 0, t1: 0.35, color: '#f59e0b' },
                      { t0: 0.35, t1: 0.65, color: '#ef4444' },
                      { t0: 0.65, t1: 1, color: '#f59e0b' },
                    ];
                    return seg.map((s, i) => (
                      <line key={i}
                        x1={from.x + dx * s.t0} y1={from.y + dy * s.t0}
                        x2={from.x + dx * s.t1} y2={from.y + dy * s.t1}
                        stroke={s.color} strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        strokeDasharray={dashArray}
                        markerEnd={i === seg.length - 1 ? `url(#${markerId})` : undefined}
                      />
                    ));
                  }

                  if (action.action_type === 'shoot_power') {
                    // Yellow→Red segments based on quality
                    if (color === '#ef4444') {
                      // Full red = terrible
                      return [(
                        <line key="power"
                          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                          stroke="#ef4444" strokeWidth={strokeW}
                          strokeLinecap="round" opacity={opacity}
                          markerEnd="url(#ah-red)"
                          strokeDasharray={dashArray}
                        />
                      )];
                    }
                    // Check if it's a borderline case — yellow→red at end
                    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
                    const attrs = playerAttrsMap[action.participant_id];
                    const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 6;
                    const powBonus = normalizeAttr(Number(attrs?.forca_chute ?? 40)) * 4;
                    const eDist = (Math.sqrt((action.target_x! - (fromPart.field_x ?? 50)) ** 2 + (action.target_y! - (fromPart.field_y ?? 50)) ** 2)) - accBonus - powBonus;
                    if (eDist > 25) {
                      // Yellow front half, red back half
                      const seg = [
                        { t0: 0, t1: 0.5, color: '#f59e0b' },
                        { t0: 0.5, t1: 1, color: '#ef4444' },
                      ];
                      return seg.map((s, i) => (
                        <line key={i}
                          x1={from.x + (to.x - from.x) * s.t0} y1={from.y + (to.y - from.y) * s.t0}
                          x2={from.x + (to.x - from.x) * s.t1} y2={from.y + (to.y - from.y) * s.t1}
                          stroke={s.color} strokeWidth={strokeW}
                          strokeLinecap="round" opacity={opacity}
                          strokeDasharray={dashArray}
                          markerEnd={i === seg.length - 1 ? 'url(#ah-red)' : undefined}
                        />
                      ));
                    }
                    // Full yellow = decent
                    return [(
                      <line key="power"
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke="#f59e0b" strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        markerEnd="url(#ah-yellow)"
                        strokeDasharray={dashArray}
                      />
                    )];
                  }

                  // pass_low, shoot_controlled, move, receive — single solid line
                  return [(
                    <line key="single"
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={action.action_type === 'pass_low' || action.action_type === 'shoot_controlled' ? '#22c55e' : color}
                      strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd={`url(#${markerId})`}
                      strokeDasharray={dashArray}
                    />
                  )];
                };

                return (
                  <g key={action.id}>
                    {renderMultiSegmentArrow()}
                    <text
                      x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.68)"
                      fontFamily="'Barlow Condensed', sans-serif"
                    >
                      {controlLabel} {ACTION_LABELS[action.action_type] || action.action_type}
                    </text>
                  </g>
                );
              })}

              {/* Drawing arrow (follows mouse) */}
              {drawingAction && drawingFrom && mouseFieldPct && (() => {
                // Move arrows start from player center; pass/shoot arrows start from ball position
                const isBallHolderAction = drawingAction.fromParticipantId === activeTurn?.ball_holder_participant_id;
                const isBallAction = drawingAction.type !== 'move';
                const fromFieldX = isBallHolderAction && isBallAction && ballDisplayPos ? ballDisplayPos.x : drawingFrom.field_x!;
                const fromFieldY = isBallHolderAction && isBallAction && ballDisplayPos ? ballDisplayPos.y : drawingFrom.field_y!;
                const from = toSVG(fromFieldX, fromFieldY);
                let to: { x: number; y: number };
                let toFieldX: number, toFieldY: number;
                if (drawingAction.type === 'shoot_controlled' || drawingAction.type === 'shoot_power') {
                  const goalTarget = getShootTarget(drawingFrom);
                  toFieldX = goalTarget.x;
                  toFieldY = Math.max(38, Math.min(62, mouseFieldPct.y));
                  to = toSVG(toFieldX, toFieldY);
                } else {
                  toFieldX = mouseFieldPct.x;
                  toFieldY = mouseFieldPct.y;
                  to = toSVG(toFieldX, toFieldY);
                }
                const isMove = drawingAction.type === 'move';
                const isShoot = drawingAction.type === 'shoot_controlled' || drawingAction.type === 'shoot_power';
                const strokeW = isMove ? 2 : isShoot ? 3.5 : 3;
                const opacity = 0.85;

                if (isMove) {
                  return (
                    <line
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#1a1a2e" strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd="url(#ah-black)"
                    />
                  );
                }

                // Multi-segment preview for passes
                if (drawingAction.type === 'pass_high') {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const seg = [
                    { t0: 0, t1: 0.2, color: '#f59e0b' },
                    { t0: 0.2, t1: 0.8, color: '#ef4444' },
                    { t0: 0.8, t1: 1, color: '#f59e0b' },
                  ];
                  return (<>{seg.map((s, i) => (
                    <line key={i}
                      x1={from.x + dx * s.t0} y1={from.y + dy * s.t0}
                      x2={from.x + dx * s.t1} y2={from.y + dy * s.t1}
                      stroke={s.color} strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd={i === seg.length - 1 ? 'url(#ah-green)' : undefined}
                    />
                  ))}</>);
                }
                if (drawingAction.type === 'pass_launch') {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const seg = [
                    { t0: 0, t1: 0.35, color: '#f59e0b' },
                    { t0: 0.35, t1: 0.65, color: '#ef4444' },
                    { t0: 0.65, t1: 1, color: '#f59e0b' },
                  ];
                  return (<>{seg.map((s, i) => (
                    <line key={i}
                      x1={from.x + dx * s.t0} y1={from.y + dy * s.t0}
                      x2={from.x + dx * s.t1} y2={from.y + dy * s.t1}
                      stroke={s.color} strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd={i === seg.length - 1 ? 'url(#ah-green)' : undefined}
                    />
                  ))}</>);
                }
                if (drawingAction.type === 'pass_low') {
                  return (
                    <line
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#22c55e" strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd="url(#ah-green)"
                    />
                  );
                }
                // Shots: preview only green/yellow (no red — surprise)
                const color = getArrowQuality(fromFieldX, fromFieldY, toFieldX, toFieldY, drawingAction.type, drawingAction.fromParticipantId);
                const previewColor = drawingAction.type === 'shoot_controlled' ? '#22c55e' :
                  (color === '#ef4444' ? '#f59e0b' : color); // cap at yellow for shots
                const markerId = previewColor === '#22c55e' ? 'ah-green' : 'ah-yellow';
                return (
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={previewColor} strokeWidth={strokeW}
                    strokeLinecap="round" opacity={opacity}
                    markerEnd={`url(#${markerId})`}
                  />
                );
              })()}

              {/* Player glow during drawing + action circle (green=can't reach, purple=can reach ball) */}
              {drawingAction && drawingFrom && mouseFieldPct && (() => {
                const cursorSvg = toSVG(mouseFieldPct.x, mouseFieldPct.y);
                const fromSvg = toSVG(drawingFrom.field_x!, drawingFrom.field_y!);
                const isMove = drawingAction.type === 'move';

                // Compute whether the action circle can reach the ball trajectory
                // Key rule: player can act if they reach ANY point on the trajectory BEFORE or AT the same time as the ball
                // Once purple at a point, everything from that point to END of trajectory is also reachable
                let canReachBall = false;
                
                // Also check for stationary ball holder (no action = tackle opportunity)
                const effectiveBallTrajectoryAction = (() => {
                  if (ballTrajectoryAction) return ballTrajectoryAction;
                  // If ball holder has no action, treat as stationary
                  if (activeTurn?.ball_holder_participant_id && ballTrajectoryHolder &&
                      ballTrajectoryHolder.field_x != null && ballTrajectoryHolder.field_y != null) {
                    return { action_type: 'move', target_x: ballTrajectoryHolder.field_x, target_y: ballTrajectoryHolder.field_y, participant_id: activeTurn.ball_holder_participant_id } as MatchAction;
                  }
                  return null;
                })();
                
                const effectiveHolder = effectiveBallTrajectoryAction ? (ballTrajectoryHolder || participants.find(p => p.id === effectiveBallTrajectoryAction.participant_id)) : null;
                
                if (isMove && effectiveBallTrajectoryAction && effectiveHolder &&
                    effectiveHolder.field_x != null && effectiveHolder.field_y != null &&
                    effectiveBallTrajectoryAction.target_x != null && effectiveBallTrajectoryAction.target_y != null &&
                    (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response')) {
                  const mdx = mouseFieldPct.x - drawingFrom.field_x!;
                  const mdy = mouseFieldPct.y - drawingFrom.field_y!;
                  const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
                  const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);
                  const movePct = maxRange > 0 ? Math.min(1, moveDist / maxRange) : 0;

                  const bfx = effectiveHolder.field_x!;
                  const bfy = effectiveHolder.field_y!;
                  const btx = effectiveBallTrajectoryAction.target_x!;
                  const bty = effectiveBallTrajectoryAction.target_y!;

                  const circleRadiusField = 9 / INNER_W * 100;
                  
                  const trajDx = btx - bfx;
                  const trajDy = bty - bfy;
                  const trajLen2 = trajDx * trajDx + trajDy * trajDy;
                  
                  if (trajLen2 > 0) {
                    const tCursor = clamp(((mouseFieldPct.x - bfx) * trajDx + (mouseFieldPct.y - bfy) * trajDy) / trajLen2, 0, 1);
                    const distToTraj = pointToSegmentDistance(mouseFieldPct.x, mouseFieldPct.y, bfx, bfy, btx, bty);
                    
                    // Core reachability: player arrives at this trajectory point (tCursor) before ball does
                    // movePct = fraction of player's range used to reach cursor (lower = arrives sooner)
                    // tCursor = fraction of ball's trajectory at that point (lower = ball arrives sooner)
                    // Player can act if movePct <= tCursor (needs less % of range than ball needs of trajectory)
                    // Once reachable at a point, everything from that point to END is also reachable
                    canReachBall = (distToTraj <= (circleRadiusField + INTERCEPT_RADIUS) && movePct <= tCursor);
                  } else {
                    // Stationary ball holder — if within reach, can tackle
                    const distToBH = Math.sqrt((mouseFieldPct.x - bfx) ** 2 + (mouseFieldPct.y - bfy) ** 2);
                    canReachBall = distToBH <= (circleRadiusField + INTERCEPT_RADIUS + 2);
                  }
                }

                const circleColor = canReachBall ? 'rgba(139,92,246,0.35)' : 'rgba(34,197,94,0.15)';
                const circleStroke = canReachBall ? 'rgba(139,92,246,0.7)' : 'rgba(34,197,94,0.45)';
                const glowColor = canReachBall ? 'rgba(139,92,246,0.3)' : 'rgba(34,197,94,0.3)';
                const glowStroke = canReachBall ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)';

                return (
                  <>
                    {/* Outer glow around active player (all actions) */}
                    <circle cx={fromSvg.x} cy={fromSvg.y} r={18} fill="none" stroke={glowColor} strokeWidth="2" filter="url(#pulse-glow)" />
                    <circle cx={fromSvg.x} cy={fromSvg.y} r={14} fill="none" stroke={glowStroke} strokeWidth="4" />
                    {/* Action circle at cursor (only for MOVE) — green=can't reach, purple=can reach */}
                    {isMove && (
                      <circle cx={cursorSvg.x} cy={cursorSvg.y} r={9} fill={circleColor} stroke={circleStroke} strokeWidth="1.2" />
                    )}
                  </>
                );
              })()}

              {/* Live ball preview synced to movement % during phases 2/3 (works for ALL ball actions including move/dribble) */}
              {drawingAction?.type === 'move' && mouseFieldPct && drawingFrom &&
                ballTrajectoryAction && ballTrajectoryHolder &&
                ballTrajectoryHolder.field_x != null && ballTrajectoryHolder.field_y != null &&
                ballTrajectoryAction.target_x != null && ballTrajectoryAction.target_y != null &&
                (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (() => {
                  const mdx = mouseFieldPct.x - drawingFrom.field_x!;
                  const mdy = mouseFieldPct.y - drawingFrom.field_y!;
                  const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
                  const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);
                  const movePct = maxRange > 0 ? Math.min(1, moveDist / maxRange) : 0;

                  const bfx = ballTrajectoryHolder.field_x!;
                  const bfy = ballTrajectoryHolder.field_y!;
                  const btx = ballTrajectoryAction.target_x!;
                  const bty = ballTrajectoryAction.target_y!;
                  const ballPreviewX = bfx + (btx - bfx) * movePct;
                  const ballPreviewY = bfy + (bty - bfy) * movePct;
                  const previewSvg = toSVG(ballPreviewX, ballPreviewY);

                  return (
                    <g pointerEvents="none" opacity={0.55}>
                      <circle cx={previewSvg.x} cy={previewSvg.y} r={5.5}
                        fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.6)"
                        strokeWidth="0.8" strokeDasharray="2,1.5" />
                      <circle cx={previewSvg.x} cy={previewSvg.y} r={2} fill="rgba(255,255,255,0.5)" />
                      <text x={previewSvg.x} y={previewSvg.y - 9} textAnchor="middle"
                        fontSize="6" fill="rgba(255,255,255,0.7)"
                        fontFamily="'Barlow Condensed', sans-serif" fontWeight="700">
                        ⚽ {Math.round(movePct * 100)}%
                      </text>
                    </g>
                  );
              })()}

              {/* Players */}
              {[...homePlayers, ...awayPlayers].map((p, idx) => {
                if (p.field_x == null || p.field_y == null) return null;
                const animPos = getAnimatedPos(p);
                const { x, y } = toSVG(animPos.x, animPos.y);
                const isHome = p.club_id === match.home_club_id;
                const clubData = isHome ? homeClub : awayClub;
                const isBH = activeTurn?.ball_holder_participant_id === p.id;
                const isMe = p.id === myParticipant?.id;
                const isSelected = p.id === selectedParticipantId;
                const isControllable = (isManager && p.club_id === myClubId) || (isPlayer && p.id === myParticipant?.id);
                const hasSubmitted = allSubmittedIds.has(p.id);
                const isPulsingNewCarrier = possessionChangePulse === p.id;
                const R = 9;

                return (
                  <g key={p.id}
                    onClick={(e) => { e.stopPropagation(); handlePlayerClick(p.id); }}
                    style={{ cursor: isControllable ? 'pointer' : 'default' }}
                  >
                    {/* Possession change pulse */}
                    {isPulsingNewCarrier && (
                      <>
                        <circle cx={x} cy={y} r={R + 10} fill="none" stroke="#f59e0b" strokeWidth="2" opacity={0.6} filter="url(#pulse-glow)">
                          <animate attributeName="r" from={String(R + 4)} to={String(R + 18)} dur="0.8s" repeatCount="3" />
                          <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" repeatCount="3" />
                        </circle>
                        <circle cx={x} cy={y} r={R + 6} fill="none" stroke="#fbbf24" strokeWidth="2.5" opacity={0.9}>
                          <animate attributeName="opacity" from="1" to="0.3" dur="0.5s" repeatCount="indefinite" begin="0s" />
                        </circle>
                      </>
                    )}
                    {isBH && (
                      <circle cx={x} cy={y} r={R + 5} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity={0.6} filter="url(#glow)" />
                    )}
                    {isSelected && (
                      <circle cx={x} cy={y} r={R + 3} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,2" opacity={0.8} />
                    )}
                    {hasSubmitted && (
                      <circle cx={x} cy={y} r={R + 3} fill="none" stroke="#22c55e" strokeWidth="1" opacity={0.6} />
                    )}
                    <circle
                      cx={x} cy={y} r={R}
                      fill={p.field_pos === 'GK' ? '#111' : (clubData?.primary_color || (isHome ? '#dc2626' : '#16a34a'))}
                      stroke={isMe ? '#fff' : 'rgba(0,0,0,0.4)'}
                      strokeWidth={isMe ? 1.5 : 0.8}
                      filter="url(#shadow)"
                    />
                    <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
                      fontSize="7" fontWeight="800"
                      fontFamily="'Barlow Condensed', sans-serif"
                      fill={p.field_pos === 'GK' ? '#fff' : (clubData?.secondary_color || '#fff')}
                    >
                      {p.jersey_number || idx + 1}
                    </text>
                  </g>
                );
              })}

              {ballDisplayPos && (() => {
                const { x, y } = toSVG(ballDisplayPos.x, ballDisplayPos.y);
                const r = 5.5;
                return (
                  <g pointerEvents="none">
                    {/* Shadow */}
                    <ellipse cx={x + 0.8} cy={y + 2.5} rx={r * 0.9} ry={r * 0.35} fill="rgba(0,0,0,0.3)" />
                    {/* Ball body */}
                    <circle cx={x} cy={y} r={r} fill="#f5f5f5" stroke="#2a2a2a" strokeWidth="0.7" />
                    {/* Soccer ball pentagon pattern */}
                    <polygon points={`${x},${y - r * 0.45} ${x + r * 0.43},${y - r * 0.14} ${x + r * 0.26},${y + r * 0.36} ${x - r * 0.26},${y + r * 0.36} ${x - r * 0.43},${y - r * 0.14}`}
                      fill="#2a2a2a" opacity="0.75" />
                    {/* Side patches */}
                    <circle cx={x - r * 0.55} cy={y - r * 0.4} r={r * 0.18} fill="#2a2a2a" opacity="0.5" />
                    <circle cx={x + r * 0.55} cy={y - r * 0.4} r={r * 0.18} fill="#2a2a2a" opacity="0.5" />
                    <circle cx={x - r * 0.6} cy={y + r * 0.3} r={r * 0.16} fill="#2a2a2a" opacity="0.45" />
                    <circle cx={x + r * 0.6} cy={y + r * 0.3} r={r * 0.16} fill="#2a2a2a" opacity="0.45" />
                    <circle cx={x} cy={y + r * 0.65} r={r * 0.15} fill="#2a2a2a" opacity="0.4" />
                    {/* Highlight */}
                    <circle cx={x - r * 0.25} cy={y - r * 0.3} r={r * 0.22} fill="rgba(255,255,255,0.4)" />
                  </g>
                );
              })()}

              {/* Contest visual effect during phase 4 */}
              {contestEffect && (() => {
                const pos = toSVG(contestEffect.x, contestEffect.y);
                const isSuccess = contestEffect.type === 'tackle_success' || contestEffect.type === 'block' || contestEffect.type === 'intercept';
                const color = isSuccess ? '#ef4444' : '#22c55e';
                const bgColor = isSuccess ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)';
                return (
                  <g pointerEvents="none">
                    {/* Expanding ring */}
                    <circle cx={pos.x} cy={pos.y} r={8} fill="none" stroke={color} strokeWidth="2.5" opacity="0.7">
                      <animate attributeName="r" from="8" to="35" dur="1.5s" fill="freeze" />
                      <animate attributeName="opacity" from="0.8" to="0" dur="1.5s" fill="freeze" />
                    </circle>
                    {/* Inner flash */}
                    <circle cx={pos.x} cy={pos.y} r={12} fill={bgColor}>
                      <animate attributeName="r" from="6" to="20" dur="0.8s" fill="freeze" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="1.2s" fill="freeze" />
                    </circle>
                    {/* Label */}
                    <text x={pos.x} y={pos.y - 22} textAnchor="middle" fontSize="8" fontWeight="800"
                      fontFamily="'Barlow Condensed', sans-serif" fill={color}>
                      <animate attributeName="y" from={String(pos.y - 14)} to={String(pos.y - 30)} dur="1.5s" fill="freeze" />
                      <animate attributeName="opacity" from="1" to="0" dur="2s" fill="freeze" />
                      {contestEffect.label}
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* Action menu overlay */}
            {showActionMenu && !drawingAction && (() => {
              const menuPos = getActionMenuScreenPos(showActionMenu);
              if (!menuPos) return null;
              const actions = getActionsForParticipant(showActionMenu);
              if (actions.length === 0) return null;

              const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
              if (!containerRect) return null;
              const left = menuPos.left - containerRect.left + 16;
              const top = menuPos.top - containerRect.top - 10;

              return (
                <div
                  className="absolute z-50 bg-[hsl(45,30%,90%)] border border-[hsl(45,20%,60%)] rounded shadow-lg py-1 min-w-[140px]"
                  style={{ left, top, transform: 'translateY(-50%)' }}
                >
                  {actions.map(a => {
                    // Context-aware label for 'receive' action
                    let label = ACTION_LABELS[a];
                    let icon = '';
                    if (a === 'move') icon = '↗';
                    else if (a === 'pass_low') icon = '➡';
                    else if (a === 'pass_high') icon = '⤴';
                    else if (a === 'pass_launch') icon = '🚀';
                    else if (a === 'shoot_controlled') icon = '🎯';
                    else if (a === 'shoot_power') icon = '💥';
                    else if (a === 'no_action') icon = '⊘';
                    else if (a === 'receive') {
                      icon = '🤲';
                      // Determine context
                      const menuPlayer = participants.find(p => p.id === showActionMenu);
                      const bhAction = ballTrajectoryAction;
                      const bhPlayer = ballTrajectoryHolder;
                      if (bhAction && bhPlayer && menuPlayer) {
                        const isOpponent = menuPlayer.club_id !== bhPlayer.club_id;
                        if (bhAction.action_type === 'move' && isOpponent) {
                          label = 'DESARME';
                          icon = '🦵';
                        } else if (isShootAction(bhAction.action_type) && isOpponent) {
                          const isGK = menuPlayer.field_pos === 'GK';
                          if (isGK) {
                            label = 'DEFENDER';
                            icon = '🧤';
                          } else {
                            label = 'BLOQUEAR';
                            icon = '🛡️';
                          }
                        }
                      }
                    }
                    return (
                      <button
                        key={a}
                        disabled={submittingAction}
                        onClick={() => handleActionMenuSelect(a, showActionMenu)}
                        className="w-full text-left px-3 py-1 text-xs font-display font-bold text-[hsl(220,20%,20%)] hover:bg-[hsl(45,30%,80%)] transition-colors flex items-center gap-2"
                      >
                        <span className="text-[10px]">{icon}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Pass/Shot quality indicator */}
            {drawingAction && drawingFrom && mouseFieldPct && drawingAction.type !== 'move' && (() => {
              const color = getArrowQuality(drawingFrom.field_x!, drawingFrom.field_y!, mouseFieldPct.x, mouseFieldPct.y, drawingAction.type, drawingAction.fromParticipantId);
              const label = color === '#22c55e' ? 'Boa' : color === '#f59e0b' ? 'Média' : 'Ruim';
              const isShoot = drawingAction.type === 'shoot_controlled' || drawingAction.type === 'shoot_power';
              const actionName = ACTION_LABELS[drawingAction.type] || (isShoot ? 'Chute' : 'Passe');
              return (
                <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-[hsl(140,10%,8%)] rounded px-3 py-1.5 border border-[hsl(140,10%,20%)]">
                  <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                    {actionName}:
                  </span>
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="w-3 h-4 rounded-sm" style={{
                        backgroundColor: i < (color === '#22c55e' ? 5 : color === '#f59e0b' ? 3 : 1) ? color : 'hsl(140,10%,20%)',
                      }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-display font-bold" style={{ color }}>{label}</span>
                </div>
              );
            })()}

            {(animating || isPhaseProcessing) && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[hsl(220,20%,10%)]/90 border border-tactical/40 rounded px-4 py-1.5 z-40">
                <span className="text-[11px] font-display font-bold text-tactical animate-pulse">
                  {isPhaseProcessing ? `⏸ ${processingLabel}` : '⚡ MOTION — Resolvendo jogada...'}
                </span>
              </div>
            )}

            {/* Intercept zone hint */}
            {ballTrajectoryAction && !animating && (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (
              <div className="absolute bottom-2 right-2 bg-[hsl(220,20%,10%)]/80 border border-blue-500/30 rounded px-3 py-1 z-30">
                <span className="text-[9px] font-display text-blue-400">💡 Mova para a zona azul para DOMINAR BOLA</span>
              </div>
            )}

            {/* Status overlay for non-live */}
            {!isLive && !isFinished && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <p className="font-display text-lg text-white/80">
                  {(() => {
                    const scheduledDate = new Date(match.scheduled_at);
                    if (isNaN(scheduledDate.getTime())) return 'Aguardando início...';
                    const now = serverNow();
                    const countdownStart = scheduledDate.getTime();
                    const countdownEnd = countdownStart + PRE_MATCH_COUNTDOWN_MS;
                    if (now < countdownStart) return `Começa: ${formatScheduledDate(match.scheduled_at)}`;
                    if (now < countdownEnd) return `Preparar... ${preMatchCountdownLeft}s`;
                    return 'Iniciando partida...';
                  })()}
                </p>
              </div>
            )}
            {isFinished && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <p className="font-display font-extrabold text-xl text-white">
                  ⏱ ENCERRADA — {match.home_score} × {match.away_score}
                </p>
              </div>
            )}
          </div>

          {/* Cancel drawing overlay */}
          {drawingAction && (
            <button
              onClick={() => { setDrawingAction(null); setMouseFieldPct(null); }}
              className="absolute top-3 left-3 bg-destructive/80 text-white text-[10px] font-display px-2 py-1 rounded hover:bg-destructive"
            >
              ✕ Cancelar
            </button>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-72 shrink-0 bg-[hsl(140,10%,10%)] border-l border-[hsl(140,10%,18%)] flex flex-col overflow-hidden">

          {/* Turn Wheel */}
          <div className="p-3 border-b border-[hsl(140,10%,18%)]">
            <TurnWheel
              currentPhase={activeTurn?.phase ?? null}
              timeLeft={phaseTimeLeft}
              turnNumber={match.current_turn_number}
              possessionClub={possClubId === match.home_club_id ? homeClub : awayClub}
              phaseDuration={currentPhaseDuration}
              isLooseBall={!!isLooseBall}
            />
          </div>

          {/* Accordion: Home team */}
          <AccordionSection
            title={homeClub?.name || 'Time Casa'}
            badge={`${homePlayers.filter(p => !p.id.startsWith('virtual')).length}`}
            color={homeClub?.primary_color}
            open={homeAccOpen}
            onToggle={() => setHomeAccOpen(!homeAccOpen)}
          >
            <TeamList
              players={homePlayers}
              ballHolderId={activeTurn?.ball_holder_participant_id ?? null}
              myId={myParticipant?.id ?? null}
              selectedId={selectedParticipantId}
              onSelect={handlePlayerClick}
              submittedIds={allSubmittedIds}
            />
          </AccordionSection>

          {/* Accordion: Away team */}
          <AccordionSection
            title={awayClub?.name || 'Time Fora'}
            badge={`${awayPlayers.filter(p => !p.id.startsWith('virtual')).length}`}
            color={awayClub?.primary_color}
            open={awayAccOpen}
            onToggle={() => setAwayAccOpen(!awayAccOpen)}
          >
            <TeamList
              players={awayPlayers}
              ballHolderId={activeTurn?.ball_holder_participant_id ?? null}
              myId={myParticipant?.id ?? null}
              selectedId={selectedParticipantId}
              onSelect={handlePlayerClick}
              submittedIds={allSubmittedIds}
            />
          </AccordionSection>

          {/* Accordion: Match Flow */}
          <AccordionSection
            title="Match Flow"
            open={logAccOpen}
            onToggle={() => setLogAccOpen(!logAccOpen)}
            className="flex-1"
          >
            <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
              {events.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-1">Aguardando eventos...</p>
              )}
               {events.slice(-30).map(e => (
                 <div key={e.id} className={`text-[10px] border-l-2 pl-1.5 leading-tight py-0.5 ${
                   e.event_type === 'goal' ? 'border-pitch text-pitch font-bold' :
                   e.event_type === 'kickoff' ? 'border-tactical text-foreground' :
                   e.event_type === 'possession_change' ? 'border-warning/60 text-muted-foreground' :
                   e.event_type === 'final_whistle' ? 'border-destructive text-destructive font-bold' :
                   e.event_type === 'tackle' ? 'border-red-400 text-red-300' :
                   e.event_type === 'dribble' ? 'border-green-400 text-green-300' :
                   e.event_type === 'blocked' ? 'border-orange-400 text-orange-300' :
                   e.event_type === 'saved' ? 'border-blue-400 text-blue-300' :
                   'border-[hsl(140,10%,25%)] text-muted-foreground'
                 }`}>
                   <p className="font-display font-semibold">{e.title}</p>
                   {e.body && <p className="opacity-70 text-[9px]">{e.body}</p>}
                 </div>
               ))}
              <div ref={eventsEndRef} />
            </div>
          </AccordionSection>

          {/* Chat placeholder */}
          <div className="p-3 border-t border-[hsl(140,10%,18%)] mt-auto">
            <p className="text-[9px] font-display text-muted-foreground/40 uppercase tracking-widest text-center">Chat (em breve)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TurnWheel (animated clock) ───────────────────────────────
function TurnWheel({ currentPhase, timeLeft, turnNumber, possessionClub, phaseDuration, isLooseBall }: {
  currentPhase: string | null; timeLeft: number; turnNumber: number;
  possessionClub: ClubInfo | null; phaseDuration: number; isLooseBall: boolean;
}) {
  const isPositioning = currentPhase === 'positioning_attack' || currentPhase === 'positioning_defense';

  const phases = isPositioning
    ? [
        { key: 'positioning_attack', label: '⚽' },
        { key: 'positioning_defense', label: '🛡' },
        { key: '_skip1', label: '—' },
        { key: '_skip2', label: '—' },
      ]
    : [
        { key: 'ball_holder', label: '1' },
        { key: 'attacking_support', label: '2' },
        { key: 'defending_response', label: '3' },
        { key: 'resolution', label: '4' },
      ];
  const currentIdx = phases.findIndex(p => p.key === currentPhase);

  const SIZE = 140;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 62;
  const R_INNER = 28;

  const quadrants = [
    { startAngle: -90, endAngle: 0 },
    { startAngle: 0, endAngle: 90 },
    { startAngle: 90, endAngle: 180 },
    { startAngle: 180, endAngle: 270 },
  ];

  function polar(angleDeg: number, r: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function arcPath(startA: number, endA: number, rI: number, rO: number) {
    const gap = 2;
    const p1 = polar(startA + gap, rO);
    const p2 = polar(endA - gap, rO);
    const p3 = polar(endA - gap, rI);
    const p4 = polar(startA + gap, rI);
    return `M ${p1.x} ${p1.y} A ${rO} ${rO} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rI} ${rI} 0 0 0 ${p4.x} ${p4.y} Z`;
  }

  function labelPos(startA: number, endA: number, r: number) {
    const mid = (startA + endA) / 2;
    return polar(mid, r);
  }

  const sweepProgress = currentIdx >= 0 ? (1 - timeLeft / phaseDuration) : 0;
  const phaseFills = isPositioning
    ? ['hsl(var(--pitch))', 'hsl(var(--tactical))', 'hsl(var(--muted))', 'hsl(var(--muted))']
    : ['hsl(var(--pitch))', 'hsl(var(--warning))', 'hsl(var(--warning))', 'hsl(var(--muted))'];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-between w-full px-2">
        <span className="text-[10px] font-display text-muted-foreground uppercase tracking-widest">Turno</span>
        <span className="font-display font-bold text-sm text-foreground">{turnNumber || '—'}</span>
      </div>

      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {quadrants.map((q, i) => {
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          const isSkipped = (isLooseBall && i === 0 && !isPositioning) || (isPositioning && i >= 2);
          const fillColor = isSkipped ? 'hsl(var(--muted))' : isActive ? phaseFills[i] : isPast ? 'hsl(var(--secondary))' : 'hsl(var(--muted))';

          return (
            <g key={i}>
              <path
                d={arcPath(q.startAngle, q.endAngle, R_INNER, R_OUTER)}
                fill={fillColor}
                opacity={isSkipped ? 0.2 : isActive ? 1 : isPast ? 0.6 : 0.35}
                stroke={isActive ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}
                strokeWidth={isActive ? 1.5 : 0.5}
              />
              {(() => {
                const lp = labelPos(q.startAngle, q.endAngle, (R_INNER + R_OUTER) / 2);
                return (
                  <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central"
                    fontSize="14" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
                    fill={isSkipped ? 'hsl(var(--muted-foreground) / 0.3)' : isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
                  >
                    {isSkipped ? '—' : phases[i].label}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {currentIdx >= 0 && sweepProgress > 0.01 && (() => {
          const q = quadrants[currentIdx];
          const sweepEnd = q.startAngle + 2 + (q.endAngle - q.startAngle - 4) * sweepProgress;
          const p1 = polar(q.startAngle + 2, R_OUTER - 2);
          const p2 = polar(sweepEnd, R_OUTER - 2);
          const largeArc = sweepProgress > 0.5 ? 1 : 0;
          return (
            <path
              d={`M ${p1.x} ${p1.y} A ${R_OUTER - 2} ${R_OUTER - 2} 0 ${largeArc} 1 ${p2.x} ${p2.y}`}
              fill="none" stroke="hsl(var(--foreground) / 0.35)" strokeWidth="4" strokeLinecap="round"
            />
          );
        })()}

        <circle cx={CX} cy={CY} r={R_INNER - 2} fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="1" />
        <line x1={CX - 6} y1={CY} x2={CX + 6} y2={CY} stroke="hsl(var(--foreground) / 0.2)" strokeWidth="0.5" />
        <line x1={CX} y1={CY - 6} x2={CX} y2={CY + 6} stroke="hsl(var(--foreground) / 0.2)" strokeWidth="0.5" />

        <text x={CX} y={CY - 2} textAnchor="middle" dominantBaseline="central"
          fontSize="12" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
          fill={currentPhase ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
        >
          {currentPhase ? (PHASE_LABELS[currentPhase] || 'Wait') : 'Wait'}
        </text>
        {currentPhase && timeLeft > 0 && (
          <text x={CX} y={CY + 10} textAnchor="middle"
            fontSize="9" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif"
            fill={timeLeft <= 2 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))'}
          >
            {timeLeft}s
          </text>
        )}
      </svg>

      {currentPhase && (
        <div className="w-full px-3">
          <div className="flex justify-between text-[9px] font-display text-muted-foreground mb-0.5">
            <span>{isLooseBall && currentPhase === 'ball_holder' ? 'Pulando...' : PHASE_LABELS[currentPhase]}</span>
            <span className={timeLeft <= 2 ? 'text-destructive' : ''}>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100 bg-primary"
              style={{ width: `${(timeLeft / phaseDuration) * 100}%` }}
            />
          </div>
        </div>
      )}

      {possessionClub && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: possessionClub.primary_color }} />
          <span className="text-[9px] font-display text-muted-foreground">
            {isLooseBall ? '⚽ BOLA SOLTA' : `⚽ ${possessionClub.short_name}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── AccordionSection ─────────────────────────────────────────
function AccordionSection({ title, badge, color, open, onToggle, children, className }: {
  title: string; badge?: string; color?: string;
  open: boolean; onToggle: () => void;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`border-b border-[hsl(140,10%,18%)] ${className || ''}`}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[hsl(140,10%,14%)] transition-colors text-left"
      >
        {color && <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />}
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
        <span className="font-display text-[11px] font-bold text-foreground flex-1 truncate">{title}</span>
        {badge && <span className="text-[9px] text-muted-foreground font-display">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

// ─── TeamList ─────────────────────────────────────────────────
function TeamList({ players, ballHolderId, myId, selectedId, onSelect, submittedIds }: {
  players: Participant[]; ballHolderId: string | null; myId: string | null;
  selectedId: string | null; onSelect: (id: string) => void; submittedIds: Set<string>;
}) {
  return (
    <div className="space-y-0.5">
      {players.map(p => (
        <button key={p.id}
          onClick={() => onSelect(p.id)}
          className={`w-full flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded transition-colors text-left ${
            selectedId === p.id ? 'bg-tactical/15 text-tactical' : myId === p.id ? 'bg-pitch/10 text-pitch' : 'hover:bg-[hsl(140,10%,16%)] text-muted-foreground'
          }`}
        >
          {p.is_bot
            ? <Bot className="h-2.5 w-2.5 text-amber-400 shrink-0" />
            : <User className="h-2.5 w-2.5 text-pitch shrink-0" />}
          <span className="font-display w-5 shrink-0">{p.jersey_number || '?'}</span>
          <span className="font-display w-6 text-muted-foreground shrink-0">{p.field_pos || '?'}</span>
          <span className="truncate flex-1">{p.player_name?.split(' ')[0] || 'Bot'}</span>
          {ballHolderId === p.id && <span className="text-[8px]">⚽</span>}
          {submittedIds.has(p.id) && <span className="text-[8px] text-pitch">✓</span>}
        </button>
      ))}
    </div>
  );
}

// ─── ClubBadgeInline ──────────────────────────────────────────
function ClubBadgeInline({ club, right }: { club: ClubInfo | null; right?: boolean }) {
  if (!club) return <div className="w-7 h-7 rounded bg-muted animate-pulse" />;
  return (
    <div className={`flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-7 h-7 rounded flex items-center justify-center font-display text-[9px] font-extrabold shadow"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
      >
        {club.short_name.substring(0, 3)}
      </div>
      <span className="font-display font-bold text-[11px] text-muted-foreground hidden sm:block max-w-20 truncate">{club.name}</span>
    </div>
  );
}
