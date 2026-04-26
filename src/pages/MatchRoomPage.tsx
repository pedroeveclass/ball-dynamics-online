import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { sounds } from '@/lib/sounds';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getInitialMatchEngineFunction, invokeConfiguredMatchEngine } from '@/lib/matchEngine';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { DEFAULT_FORMATION, getFormationPositions } from '@/lib/formations';
import type { MatchData, ClubInfo, Participant, MatchTurn, EventLog, MatchAction, ClubUniform, PendingInterceptChoice, PlayerProfileSummary, LineupSlotSummary, TurnMeta, DrawingState, ResolutionScript } from './match/types';
import { PHASE_LABELS, ACTION_LABELS, PHASE_DURATION, POSITIONING_PHASE_DURATION, RESOLUTION_PHASE_DURATION, PRE_MATCH_COUNTDOWN_SECONDS, PRE_MATCH_COUNTDOWN_MS, LIVE_EVENT_LIMIT, TURN_ACTION_RECONCILE_DELAY_MS, CLIENT_MATCH_PROCESSOR_RETRY_MS, ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK, INTERCEPT_RADIUS, GOAL_LINE_OVERFLOW_PCT, GOAL_Y_MIN, GOAL_Y_MAX, SET_PIECE_EXCLUSION_RADIUS, ACTION_PHASE_ORDER, FIELD_W, FIELD_H, PAD, INNER_W, INNER_H, clamp, normalizeAttr, pointToSegmentDistance, isShootAction, isPassAction, isHeaderAction, isAnyShootAction, isAnyPassAction, formatScheduledDate, getBallZoneAtProgress, canReachTrajectoryPoint, getBallSpeedFactor } from './match/constants';
import { filterEffectiveTurnActions, dedupeAndSortTurnActions, buildParticipantLayout, buildParticipantAttrsMap } from './match/utils';
import { positionalMultiplier } from '@/lib/positions';
import { MatchScoreboard } from './match/MatchScoreboard';
import { MatchSidebar } from './match/MatchSidebar';
import { HelpModal } from '@/components/HelpModal';
import { MatchActionMenu } from './match/MatchActionMenu';
import { PitchSVG, DEFAULT_STADIUM_STYLE } from '@/components/PitchSVG';
import type { StadiumStyle } from '@/components/PitchSVG';

// Y-scale correction: equalizes physical distance across field axes
const FIELD_Y_MOVE_SCALE = INNER_H / INNER_W; // ≈ 0.628
function getFieldMoveDist(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + (dy * FIELD_Y_MOVE_SCALE) * (dy * FIELD_Y_MOVE_SCALE));
}

// Ball outcome resolver — engine events are the source of truth for what
// actually happened in resolution. The client used to predict using submitted
// actions (which produced visuals that disagreed with the engine's result:
// "animation showed the pass completing but next turn I had the ball"). Now
// the trajectory selection asks this helper first.
//
// Returns an explicit outcome; `hasConclusiveEvent` flips to true as soon as a
// definitive event arrives so callers can stop using the action-based fallback.
interface BallOutcome {
  interceptor: MatchAction | null;
  hasConclusiveEvent: boolean;
  passCompleted: boolean;
  dribbled: boolean;
  tackled: boolean;
  blocked: boolean;
}

function resolveBallOutcome(
  actions: MatchAction[],
  resEvents: EventLog[],
  bhId: string,
): BallOutcome {
  const out: BallOutcome = {
    interceptor: null,
    hasConclusiveEvent: false,
    passCompleted: false,
    dribbled: false,
    tackled: false,
    blocked: false,
  };

  const findReceiveActionFor = (pid: string): MatchAction | null => {
    return actions.find(a =>
      a.participant_id === pid
      && (a.action_type === 'receive' || a.action_type === 'receive_hard' || a.action_type === 'block')
      && a.target_x != null
      && a.target_y != null
    ) ?? null;
  };

  // Scan events in order. Later conclusive events override earlier ones (the
  // engine emits per-candidate failures before the final success).
  for (const ev of resEvents) {
    const payload = (ev.payload ?? {}) as Record<string, any>;
    switch (ev.event_type) {
      case 'receive_success':
      case 'intercepted': {
        const pid = payload.participant_id ?? payload.new_ball_holder_participant_id;
        if (pid) {
          out.interceptor = findReceiveActionFor(pid);
          out.hasConclusiveEvent = true;
          out.passCompleted = false;
        }
        break;
      }
      case 'possession_change': {
        const pid = payload.new_ball_holder_participant_id;
        if (pid && pid !== bhId) {
          out.interceptor = findReceiveActionFor(pid);
          out.hasConclusiveEvent = true;
          out.passCompleted = false;
        }
        break;
      }
      case 'tackle': {
        const pid = payload.tackler_participant_id ?? payload.new_ball_holder_participant_id;
        if (pid) {
          out.interceptor = findReceiveActionFor(pid);
          out.tackled = true;
          out.hasConclusiveEvent = true;
        }
        break;
      }
      case 'dribble': {
        out.dribbled = true;
        out.interceptor = null;
        out.hasConclusiveEvent = true;
        break;
      }
      case 'pass_complete': {
        out.passCompleted = true;
        out.interceptor = null;
        out.hasConclusiveEvent = true;
        break;
      }
      case 'blocked':
      case 'block':
      case 'saved':
      case 'gk_save': {
        const pid = payload.blocker_participant_id ?? payload.gk_participant_id;
        if (pid) {
          out.interceptor = findReceiveActionFor(pid);
          out.blocked = true;
          out.hasConclusiveEvent = true;
        }
        break;
      }
      case 'loose_ball':
      case 'loose_ball_phase': {
        // Nobody dominated the ball — it went loose. Clear any predicted
        // interceptor so the ball animation follows the full pass/shot
        // trajectory instead of stopping at a defender who tried and failed.
        out.interceptor = null;
        out.hasConclusiveEvent = true;
        break;
      }
      case 'shot_missed':
      case 'shot_over': {
        // Shot went wide / over — no interception, ball travels to target.
        out.interceptor = null;
        out.hasConclusiveEvent = true;
        break;
      }
      case 'goal': {
        out.hasConclusiveEvent = true;
        break;
      }
    }
  }

  return out;
}

// Single source of truth for resolving loose ball position from history.
// Used by both the turn-transition useEffect and the render IIFE so both
// paths agree on which position to surface when no canonical state exists.
const HISTORY_EVENT_SCAN_LIMIT = 50;
// Only events that actually establish a ball position — scanning chat / card /
// sub events would return stale or irrelevant coordinates.
const BALL_POSITION_EVENT_TYPES = new Set<string>([
  'loose_ball', 'loose_ball_phase', 'ball_inertia',
  'pass_complete', 'shot_missed', 'shot_over',
  'goal_kick', 'corner', 'throw_in', 'free_kick', 'foul', 'penalty',
  'intercepted', 'receive_success', 'tackle', 'blocked', 'block',
  'saved', 'gk_save', 'offside', 'dispute',
]);
function resolveLooseBallFromHistory(
  events: EventLog[],
  turnActions: MatchAction[],
  currentTurnNumber?: number | null,
): { x: number; y: number } | null {
  const extract = (payload: any): { x: number; y: number } | null => {
    if (!payload) return null;
    if (payload.ball_x != null && payload.ball_y != null) {
      return { x: Number(payload.ball_x), y: Number(payload.ball_y) };
    }
    if (payload.x != null && payload.y != null) {
      return { x: Number(payload.x), y: Number(payload.y) };
    }
    return null;
  };
  const start = events.length - 1;
  const stop = Math.max(0, events.length - HISTORY_EVENT_SCAN_LIMIT);
  // Pass 1: prefer events from the CURRENT turn if turn number is known.
  if (currentTurnNumber != null) {
    for (let i = start; i >= stop; i--) {
      const ev = events[i];
      if (!ev || !BALL_POSITION_EVENT_TYPES.has(ev.event_type)) continue;
      const payload = ev.payload as any;
      if (Number(payload?.turn_number) !== Number(currentTurnNumber)) continue;
      const pos = extract(payload);
      if (pos) return pos;
    }
  }
  // Pass 2: most recent qualifying event across the scan window.
  for (let i = start; i >= stop; i--) {
    const ev = events[i];
    if (!ev || !BALL_POSITION_EVENT_TYPES.has(ev.event_type)) continue;
    const pos = extract(ev.payload);
    if (pos) return pos;
  }
  const lastBallAction = turnActions.find(a =>
    (isAnyPassAction(a.action_type) || isAnyShootAction(a.action_type) || a.action_type === 'move') &&
    a.target_x != null && a.target_y != null
  );
  if (lastBallAction) return { x: lastBallAction.target_x!, y: lastBallAction.target_y! };
  return null;
}

export default function MatchRoomPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, club, profile, playerProfile } = useAuth();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [homeUniforms, setHomeUniforms] = useState<ClubUniform[]>([]);
  const [awayUniforms, setAwayUniforms] = useState<ClubUniform[]>([]);
  const [stadiumStyle, setStadiumStyle] = useState<StadiumStyle>(DEFAULT_STADIUM_STYLE);
  const [participants, _setParticipantsRaw] = useState<Participant[]>([]);
  const [participantsVer, setParticipantsVer] = useState(0);
  const setParticipants = useCallback((update: Participant[] | ((prev: Participant[]) => Participant[])) => {
    _setParticipantsRaw(update);
    setParticipantsVer(v => v + 1);
  }, []);
  const [activeTurn, setActiveTurn] = useState<MatchTurn | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [leagueRoundNumber, setLeagueRoundNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<'player' | 'manager' | 'spectator'>('spectator');
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(PHASE_DURATION);
  const phaseTimeLeftRef = useRef(PHASE_DURATION);
  const timerDisplayRef = useRef<HTMLSpanElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);
  const [preMatchCountdownLeft, setPreMatchCountdownLeft] = useState(PRE_MATCH_COUNTDOWN_SECONDS);
  const [submittingAction, setSubmittingAction] = useState(false);
  // Help modal — auto-opens on first match (localStorage flag).
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('bdo_tutorial_seen') !== '1') {
      setHelpOpen(true);
      localStorage.setItem('bdo_tutorial_seen', '1');
    }
  }, []);
  // Tracks players whose menu was already auto-opened this phase. Prevents the
  // auto-open effect from re-triggering after the player submits (the effect
  // re-runs because turnActions changes from the insert, and submittedActions
  // might not have flushed yet in React state).
  const menuAutoOpenedRef = useRef<Set<string>>(new Set());
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
  const invokeMatchEngine = useCallback(async (body: Record<string, unknown>) => {
    // Always get fresh session - check expiry to avoid sending stale tokens
    let { data: { session } } = await supabase.auth.getSession();
    const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
    if (!session?.access_token || expiresAt < Date.now() + 60000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session?.access_token) {
      toast.error('Sessão expirada. Faça login novamente.');
      return { response: new Response(null, { status: 401 }), result: { error: 'No session' }, resolvedFunction: '' };
    }
    return invokeConfiguredMatchEngine({
      body,
      accessToken: session.access_token,
      onServerNow: updateServerOffset,
      resolvedFunctionRef: resolvedMatchEngineRef,
    });
  }, [updateServerOffset]);

  // Interactive drawing
  const [drawingAction, setDrawingAction] = useState<DrawingState | null>(null);
  const [mouseFieldPct, setMouseFieldPct] = useState<{ x: number; y: number } | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [submittedActions, setSubmittedActions] = useState<Set<string>>(new Set());
  const [pendingInterceptChoice, setPendingInterceptChoice] = useState<PendingInterceptChoice | null>(null);

  // Pending substitutions: queued until next dead ball / positioning phase
  const [pendingSubstitutions, setPendingSubstitutions] = useState<Array<{ outId: string; inId: string }>>([]);
  // Track players who were already substituted out (cannot re-enter)
  const [substitutedOutIds, setSubstitutedOutIds] = useState<Set<string>>(new Set());

  // Persisted actions for current turn (loaded from DB)
  const [turnActions, setTurnActions] = useState<MatchAction[]>([]);

  // Animation state for phase 4
  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const animProgressRef = useRef(0);
  const [resolutionStartPositions, setResolutionStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  // Final positions after animation (locked until next turn)
  const [finalPositions, setFinalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [finalBallPos, setFinalBallPos] = useState<{ x: number; y: number } | null>(null);
  const [carriedLooseBallPos, setCarriedLooseBallPos] = useState<{ x: number; y: number } | null>(null);
  const [ballInertiaDir, setBallInertiaDir] = useState<{ dx: number; dy: number } | null>(null);
  const [playerAttrsMap, setPlayerAttrsMap] = useState<Record<string, any>>({});
  const prevDirectionsRef = useRef<Record<string, { x: number; y: number }>>({});
  // Inertia power per participant (0-100, from previous turn's move payload).
  // Scales the directional inertia multiplier: 100 = full effect, 0 = no effect.
  const inertiaPowerRef = useRef<Record<string, number>>({});
  // Safety helpers for the deferred move (declared here so they're visible
  // to the unmount effect below). Defined as inline functions so they always
  // close over the latest state/refs.
  // Flush the pending move with the given power (default 100) if any.
  const flushPendingMoveRef = useRef<((power?: number) => void) | null>(null);

  // Inertia arrow: after confirming a move, a thick orange arrow extends from
  // the move endpoint in the same direction. The player clicks to set how far
  // the arrow goes (0-100% of move distance → inertia_power). Replaces the
  // slider with a more intuitive "second move" visual.
  const [inertiaArrow, setInertiaArrow] = useState<{
    participantId: string;
    startX: number; startY: number;   // field % — end of the move arrow
    dirX: number; dirY: number;       // normalised direction of the move
    maxLen: number;                    // max arrow length in field %
  } | null>(null);
  // Pending move: held locally until the inertia arrow is confirmed. The
  // submitAction call is deferred so the inertia_power goes in the INITIAL
  // insert — no more payload race with the engine's resolve. If the player
  // doesn't confirm, a safety net auto-flushes with 100% before phase end.
  const pendingMoveRef = useRef<{ participantId: string; targetX: number; targetY: number } | null>(null);

  // Safety: auto-submit any deferred move with 100% before the phase timer
  // expires. Also fires on unmount (tab close / navigate away) so the move
  // isn't silently lost.
  useEffect(() => {
    flushPendingMoveRef.current = (power: number = 100) => {
      const pending = pendingMoveRef.current;
      if (!pending) return;
      pendingMoveRef.current = null;
      setInertiaArrow(null);
      submitAction('move', pending.participantId, pending.targetX, pending.targetY, undefined, { inertia_power: power });
    };
  });
  // Phase timer watcher: when time is getting low, flush pending.
  useEffect(() => {
    if (phaseTimeLeft <= 1 && pendingMoveRef.current) {
      flushPendingMoveRef.current?.(100);
    }
  }, [phaseTimeLeft]);
  // Unmount flush.
  useEffect(() => {
    return () => { flushPendingMoveRef.current?.(100); };
  }, []);
  const finalBallPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBallDirRef = useRef<{ dx: number; dy: number } | null>(null);
  const inertiaConsumedRef = useRef<boolean>(false);
  // Tracks the turn_number that last seeded ballInertiaDir from lastBallDirRef. Prevents
  // the "0x or 2x" bug where the turn-transition effect could re-run and apply inertia twice
  // (or skip it) due to race conditions with realtime events or React effect re-execution.
  const inertiaAppliedForTurnRef = useRef<number | null>(null);
  const prevTurnWasPositioningRef = useRef<boolean>(false);
  const oneTouchPendingForRef = useRef<string | null>(null);
  // Track resolution event logs so the animation end-state can incorporate actual results
  const resolutionEventsRef = useRef<EventLog[]>([]);
  // Server-authoritative resolution script for the current resolution turn.
  // Populated from the Realtime UPDATE on match_turns that flips status→resolved.
  // When present it IS the truth: events, final positions, interrupt progress,
  // animation duration — all pre-computed. The animator uses it to kick off
  // without polling for individual event logs.
  const resolutionScriptRef = useRef<ResolutionScript | null>(null);
  const resolutionScriptTurnIdRef = useRef<string | null>(null);
  // Players who failed a tackle in the previous turn — cannot tackle again this turn
  const [tackleBlockedIds, setTackleBlockedIds] = useState<Set<string>>(new Set());
  // Multiplier applied to max move range this turn for players who failed a tackle last turn.
  // 0.85 = missed a regular desarme (−15%), 0.50 = missed a carrinho (−50%).
  const [tackleMovementPenalty, setTackleMovementPenalty] = useState<Record<string, number>>({});

  // Possession change visual feedback
  const [possessionChangePulse, setPossessionChangePulse] = useState<string | null>(null);
  const prevPossClubRef = useRef<string | null>(null);

  // Contest visual feedback during phase 4
  type ContestEffectKind =
    | 'tackle_fail' | 'tackle_success' | 'block' | 'dribble' | 'save' | 'intercept'
    | 'goal' | 'foul' | 'penalty' | 'yellow_card' | 'red_card'
    | 'receive_ok' | 'receive_fail';
  const [contestEffect, setContestEffect] = useState<{ type: ContestEffectKind; x: number; y: number; label: string } | null>(null);
  const contestEffectTsRef = useRef<number>(0);

  // Captain IDs (player_profile_id) for captain armband display
  const [homeCaptainProfileId, setHomeCaptainProfileId] = useState<string | null>(null);
  const [awayCaptainProfileId, setAwayCaptainProfileId] = useState<string | null>(null);

  // Accordion states
  const [homeAccOpen, setHomeAccOpen] = useState(false);
  const [awayAccOpen, setAwayAccOpen] = useState(false);
  const [logAccOpen, setLogAccOpen] = useState(false);
  const [chatAccOpen, setChatAccOpen] = useState(true);

  // Force a re-render every second during halftime so derived props that compare
  // `match.half_started_at` against `Date.now()` (e.g., `isHalftime`, banner, countdown)
  // switch off exactly when the countdown hits zero rather than getting stuck.
  const [, setHalftimeTick] = useState(0);
  useEffect(() => {
    if (match?.current_half !== 2 || !match?.half_started_at) return;
    const untilMs = new Date(match.half_started_at).getTime() - Date.now();
    if (untilMs <= 0) return;
    const id = setInterval(() => setHalftimeTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [match?.current_half, match?.half_started_at]);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const animatedResolutionIdRef = useRef<string | null>(null);
  // Holds a pending "apply next turn" callback when it arrives during an active resolution
  // animation. Flushed either when the animation ends (useEffect on `animating`) or after a
  // safety timeout so the match never stalls.
  const pendingTurnApplyRef = useRef<(() => void) | null>(null);
  const pendingTurnSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_TURN_APPLY_WAIT_MS = 1800;
  const playerGroupRefsMap = useRef<Map<string, SVGGElement>>(new Map());
  const ballGroupRef = useRef<SVGGElement>(null);
  const lastMouseMoveTimeRef = useRef(0);
  const resolvedMatchEngineRef = useRef(getInitialMatchEngineFunction());
  const matchRef = useRef<MatchData | null>(null);
  const homeClubRef = useRef<ClubInfo | null>(null);
  const awayClubRef = useRef<ClubInfo | null>(null);
  const activeTurnRef = useRef<MatchTurn | null>(null);
  const participantRowsRef = useRef<Participant[]>([]);
  const playerProfileCacheRef = useRef<Map<string, PlayerProfileSummary>>(new Map());
  const lineupSlotCacheRef = useRef<Map<string, LineupSlotSummary>>(new Map());
  const turnMetaByIdRef = useRef<Map<string, TurnMeta>>(new Map());
  const turnActionsRef = useRef<MatchAction[]>([]);
  const turnActionsFetchInFlightRef = useRef(false);
  const turnActionsFetchQueuedRef = useRef(false);
  const turnActionsFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSnapshotInFlightRef = useRef(false);
  const scheduledMatchStartInFlightRef = useRef(false);
  const realtimeHasSubscribedRef = useRef(false);
  const realtimeNeedsRecoveryRef = useRef(false);
  const phaseProcessorInFlightRef = useRef(false);
  const phaseProcessorLastAttemptRef = useRef<{ turnId: string | null; at: number }>({ turnId: null, at: 0 });
  const lastTurnChangeRef = useRef<number>(Date.now()); // tracks when we last received a turn change via realtime
  const invokeMatchEngineRef = useRef(invokeMatchEngine);
  invokeMatchEngineRef.current = invokeMatchEngine;

  // ── Load match data ──────────────────────────────────────────
  const currentTurnNumber = activeTurn?.turn_number ?? match?.current_turn_number ?? null;
  const currentTurnNumberRef = useRef<number | null>(currentTurnNumber);

  useEffect(() => {
    matchRef.current = match;
    homeClubRef.current = homeClub;
    awayClubRef.current = awayClub;
    activeTurnRef.current = activeTurn;
    turnActionsRef.current = turnActions;
    currentTurnNumberRef.current = currentTurnNumber;
  }, [match, homeClub, awayClub, activeTurn, turnActions, currentTurnNumber]);

  const setTurnActionsState = useCallback((actions: MatchAction[]) => {
    const nextActions = dedupeAndSortTurnActions(actions);
    turnActionsRef.current = nextActions;
    setTurnActions(nextActions);
  }, []);

  const pushOptimisticTurnAction = useCallback((action: Omit<MatchAction, 'id'>) => {
    const optimisticAction: MatchAction = {
      ...action,
      id: `optimistic-${action.participant_id}-${action.match_turn_id}-${action.turn_phase || 'unknown'}-${Date.now()}`,
    };

    // Mirror the server's submit_action DELETE: when a new move/receive/block or ball
    // action is pushed, evict any prior row of the same category for this
    // (participant, phase). Without this the UI briefly showed the old arrow alongside
    // the new one (double-render) before the reconcile caught up.
    const isMoveLike = optimisticAction.action_type === 'move'
      || optimisticAction.action_type === 'receive'
      || optimisticAction.action_type === 'block';
    const isBallAction = isPassAction(optimisticAction.action_type)
      || isShootAction(optimisticAction.action_type)
      || isHeaderAction(optimisticAction.action_type);

    setTurnActionsState([
      ...turnActionsRef.current.filter(existing => {
        const samePidPhase = existing.participant_id === optimisticAction.participant_id
          && existing.turn_phase === optimisticAction.turn_phase;
        if (!samePidPhase) return true;
        if (String(existing.id).startsWith('optimistic-')) return false;
        if (isMoveLike && (existing.action_type === 'move' || existing.action_type === 'receive' || existing.action_type === 'block')) return false;
        if (isBallAction && (isPassAction(existing.action_type) || isShootAction(existing.action_type) || isHeaderAction(existing.action_type))) return false;
        return true;
      }),
      optimisticAction,
    ]);
  }, [setTurnActionsState]);

  const appendEventLog = useCallback((event: EventLog) => {
    // Track resolution-relevant events so animation can incorporate actual results
    const resolutionEventTypes = ['blocked', 'intercepted', 'saved', 'tackle', 'possession_change', 'goal', 'gk_save', 'gk_save_failed', 'receive_failed', 'block', 'block_failed', 'pass_complete', 'receive_success', 'dribble', 'tackle_failed', 'loose_ball', 'dispute', 'shot_over', 'shot_missed', 'offside', 'turn_interrupted'];
    if (resolutionEventTypes.includes(event.event_type)) {
      resolutionEventsRef.current = [...resolutionEventsRef.current, event];
    }
    setEvents(prev => {
      const nextEvents = [...prev, event];
      return nextEvents.length > LIVE_EVENT_LIMIT ? nextEvents.slice(-LIVE_EVENT_LIMIT) : nextEvents;
    });
  }, []);

  const applyParticipantRows = useCallback((rows: Participant[], matchData?: MatchData | null) => {
    const effectiveMatch = matchData ?? matchRef.current;
    if (!matchId || !effectiveMatch) return;
    participantRowsRef.current = rows;
    setParticipants(
      buildParticipantLayout(
        rows,
        effectiveMatch,
        homeClubRef.current,
        awayClubRef.current,
        playerProfileCacheRef.current,
        lineupSlotCacheRef.current,
        matchId,
      )
    );
  }, [matchId]);

  const runTurnActionsReconcile = useCallback(async () => {
    const turnNumber = currentTurnNumberRef.current;
    if (!matchId || !turnNumber) {
      turnMetaByIdRef.current = new Map();
      setTurnActionsState([]);
      return;
    }

    if (turnActionsFetchInFlightRef.current) {
      turnActionsFetchQueuedRef.current = true;
      return;
    }

    turnActionsFetchInFlightRef.current = true;
    try {
      const { data: phaseTurns } = await supabase
        .from('match_turns')
        .select('id, phase, turn_number, created_at')
        .eq('match_id', matchId)
        .eq('turn_number', turnNumber)
        .order('created_at', { ascending: true });

      const nextTurnMeta = new Map<string, TurnMeta>();
      for (const turn of (phaseTurns || [])) {
        nextTurnMeta.set(turn.id, { phase: turn.phase, turn_number: turn.turn_number });
      }
      turnMetaByIdRef.current = nextTurnMeta;

      const turnIds = (phaseTurns || []).map(turn => turn.id);
      if (turnIds.length === 0) {
        setTurnActionsState([]);
        return;
      }

      const { data: actions } = await supabase
        .from('match_actions')
        .select('*')
        .in('match_turn_id', turnIds)
        .order('created_at', { ascending: true });

      const enrichedActions = ((actions || []) as MatchAction[]).map(action => ({
        ...action,
        turn_phase: nextTurnMeta.get(action.match_turn_id)?.phase ?? null,
        turn_number: turnNumber,
      }));

      // Preserve in-flight optimistic rows across reconcile. Otherwise if a reconcile
      // fires between the moment the user submits a replacement action and the server
      // committing the DELETE+INSERT, the DB query returns the OLD row and the UI
      // reverts to it for a frame before the realtime events catch up — visual flicker
      // between the two moves. Dedupe picks the newer optimistic after this merge.
      const pendingOptimistic = turnActionsRef.current.filter(a => String(a.id).startsWith('optimistic-'));
      setTurnActionsState([...enrichedActions, ...pendingOptimistic]);
    } finally {
      turnActionsFetchInFlightRef.current = false;
      if (turnActionsFetchQueuedRef.current) {
        turnActionsFetchQueuedRef.current = false;
        void runTurnActionsReconcile();
      }
    }
  }, [matchId, setTurnActionsState]);

  const scheduleTurnActionsReconcile = useCallback((immediate = false) => {
    if (!matchId) return;

    if (turnActionsFetchInFlightRef.current) {
      turnActionsFetchQueuedRef.current = true;
      return;
    }

    if (turnActionsFetchTimerRef.current) {
      if (!immediate) return;
      clearTimeout(turnActionsFetchTimerRef.current);
      turnActionsFetchTimerRef.current = null;
    }

    if (immediate) {
      void runTurnActionsReconcile();
      return;
    }

    turnActionsFetchTimerRef.current = setTimeout(() => {
      turnActionsFetchTimerRef.current = null;
      void runTurnActionsReconcile();
    }, TURN_ACTION_RECONCILE_DELAY_MS);
  }, [matchId, runTurnActionsReconcile]);

  const applyIncomingTurnAction = useCallback((actionRow: MatchAction | null | undefined) => {
    if (!actionRow) return;
    const turnMeta = turnMetaByIdRef.current.get(actionRow.match_turn_id);
    if (!turnMeta || turnMeta.turn_number == null) {
      scheduleTurnActionsReconcile();
      return;
    }
    if (turnMeta.turn_number !== currentTurnNumberRef.current) return;

    // Skip bot actions arriving via realtime during an active phase.
    // Bot actions are generated server-side when a phase expires. Showing them
    // before resolution causes a visual flash (bot arrow appearing then disappearing
    // when the human action arrives or the phase transitions).
    // Only apply bot actions if we're in resolution phase or the phase is already over.
    if (actionRow.controlled_by_type === 'bot') {
      const currentPhase = activeTurnRef.current?.phase;
      if (currentPhase && currentPhase !== 'resolution') {
        // Don't show bot actions during active phases — they'll appear during resolution
        return;
      }
    }

    const nextAction: MatchAction = {
      ...actionRow,
      turn_phase: turnMeta.phase,
      turn_number: turnMeta.turn_number,
    };

    setTurnActionsState([
      ...turnActionsRef.current.filter(existing => existing.id !== nextAction.id),
      nextAction,
    ]);
    scheduleTurnActionsReconcile();
  }, [scheduleTurnActionsReconcile, setTurnActionsState]);

  const loadStaticMatchData = useCallback(async () => {
    if (!matchId) return null;

    const { data: matchRow } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!matchRow) return null;

    const matchData = matchRow as MatchData;
    matchRef.current = matchData;
    setMatch(matchData);

    const [homeClubRes, awayClubRes, homeSettingsRes, awaySettingsRes] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.away_club_id).single(),
      supabase.from('club_settings').select('default_formation').eq('club_id', matchData.home_club_id).maybeSingle(),
      supabase.from('club_settings').select('default_formation').eq('club_id', matchData.away_club_id).maybeSingle(),
    ]);

    const nextHomeClub: ClubInfo = {
      ...(homeClubRes.data as ClubInfo),
      formation: homeSettingsRes.data?.default_formation || DEFAULT_FORMATION,
    };
    const nextAwayClub: ClubInfo = {
      ...(awayClubRes.data as ClubInfo),
      formation: awaySettingsRes.data?.default_formation || DEFAULT_FORMATION,
    };

    homeClubRef.current = nextHomeClub;
    awayClubRef.current = nextAwayClub;
    setHomeClub(nextHomeClub);
    setAwayClub(nextAwayClub);

    // Fetch club uniforms (non-blocking, falls back to club colors if table is empty or missing)
    Promise.all([
      supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color, pattern, stripe_color').eq('club_id', matchData.home_club_id),
      supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color, pattern, stripe_color').eq('club_id', matchData.away_club_id),
    ]).then(([homeUniformsRes, awayUniformsRes]) => {
      if (homeUniformsRes.data) setHomeUniforms(homeUniformsRes.data as ClubUniform[]);
      if (awayUniformsRes.data) setAwayUniforms(awayUniformsRes.data as ClubUniform[]);
    }).catch(() => { /* silently fall back to club colors */ });

    // Load home team's stadium style
    supabase.from('stadium_styles').select('*').eq('club_id', matchData.home_club_id).maybeSingle()
      .then(({ data }) => {
        if (data) setStadiumStyle({
          pitch_pattern: data.pitch_pattern,
          border_color: data.border_color,
          lighting: data.lighting,
          net_pattern: data.net_pattern,
          net_style: data.net_style,
          ad_board_color: data.ad_board_color,
          bench_color: data.bench_color,
        });
      });

    // Lookup league round (if this match is linked via league_matches)
    supabase.from('league_matches')
      .select('league_rounds!inner(round_number)')
      .eq('match_id', matchData.id)
      .maybeSingle()
      .then(({ data }) => {
        const rn = (data as any)?.league_rounds?.round_number;
        if (typeof rn === 'number') setLeagueRoundNumber(rn);
      });

    // Load captain IDs from lineups
    if (matchData.home_lineup_id || matchData.away_lineup_id) {
      Promise.all([
        matchData.home_lineup_id ? supabase.from('lineups').select('captain_player_id').eq('id', matchData.home_lineup_id).maybeSingle() : Promise.resolve({ data: null }),
        matchData.away_lineup_id ? supabase.from('lineups').select('captain_player_id').eq('id', matchData.away_lineup_id).maybeSingle() : Promise.resolve({ data: null }),
      ]).then(([homeRes, awayRes]) => {
        if (homeRes.data?.captain_player_id) setHomeCaptainProfileId(homeRes.data.captain_player_id);
        if (awayRes.data?.captain_player_id) setAwayCaptainProfileId(awayRes.data.captain_player_id);
      }).catch(() => { /* ignore */ });
    }

    const { data: participantRows } = await supabase.from('match_participants').select('*').eq('match_id', matchId);
    let nextParticipantRows = ((participantRows || []) as Participant[]);

    const playerIds = [...new Set(nextParticipantRows.filter(participant => participant.player_profile_id).map(participant => participant.player_profile_id!))];
    const slotIds = [...new Set(nextParticipantRows.filter(participant => participant.lineup_slot_id).map(participant => participant.lineup_slot_id!))];

    const [playersRes, slotsRes] = await Promise.all([
      playerIds.length > 0
        ? supabase.from('player_profiles').select('id, full_name, primary_position, secondary_position, overall, jersey_number').in('id', playerIds)
        : Promise.resolve({ data: [] as PlayerProfileSummary[] }),
      slotIds.length > 0
        ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds)
        : Promise.resolve({ data: [] as LineupSlotSummary[] }),
    ]);

    playerProfileCacheRef.current = new Map((playersRes.data || []).map(player => [player.id, player as PlayerProfileSummary] as const));
    lineupSlotCacheRef.current = new Map((slotsRes.data || []).map(slot => [slot.id, slot as LineupSlotSummary]));

    const homePlayers = nextParticipantRows.filter(participant => participant.club_id === matchData.home_club_id && participant.role_type === 'player');
    const awayPlayers = nextParticipantRows.filter(participant => participant.club_id === matchData.away_club_id && participant.role_type === 'player');
    const isTestMatch = !matchData.home_lineup_id && !matchData.away_lineup_id;
    const isKickoffStart = (matchData.current_turn_number ?? 0) <= 1;

    // ── Seed participants from lineups when match has lineup IDs but no participants ──
    const seedFromLineupClient = async (lineupId: string | null, clubId: string, isHome: boolean) => {
      if (!lineupId) return [] as Array<Record<string, unknown>>;
      const { data: slots } = await supabase
        .from('lineup_slots')
        .select('id, player_profile_id, slot_position, sort_order, role_type')
        .eq('lineup_id', lineupId)
        .order('sort_order');
      if (!slots || slots.length === 0) return [] as Array<Record<string, unknown>>;

      // Load player user_ids for connected_user_id
      const profileIds = slots.filter(s => s.player_profile_id).map(s => s.player_profile_id!);
      const { data: profiles } = profileIds.length > 0
        ? await supabase.from('player_profiles').select('id, user_id, full_name, primary_position, secondary_position, overall').in('id', profileIds)
        : { data: [] as any[] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Merge into caches
      for (const p of (profiles || [])) {
        playerProfileCacheRef.current.set(p.id, p as PlayerProfileSummary);
      }
      for (const s of slots) {
        lineupSlotCacheRef.current.set(s.id, s as LineupSlotSummary);
      }

      const starterSlots = slots.filter(s => s.role_type === 'starter' || !s.role_type);
      const benchSlots = slots.filter(s => s.role_type === 'bench');
      const formation = isHome ? (nextHomeClub.formation || DEFAULT_FORMATION) : (nextAwayClub.formation || DEFAULT_FORMATION);
      const positions = getFormationPositions(formation, isHome, isKickoffStart);

      const toInsert: Array<Record<string, unknown>> = [];
      starterSlots.forEach((slot, idx) => {
        const profile = slot.player_profile_id ? profileMap.get(slot.player_profile_id) : null;
        const coords = positions[idx] || { x: isHome ? 30 : 70, y: 50 };
        toInsert.push({
          match_id: matchId,
          club_id: clubId,
          lineup_slot_id: slot.id,
          player_profile_id: slot.player_profile_id || null,
          role_type: 'player',
          is_bot: !profile?.user_id,
          is_ready: false,
          connected_user_id: profile?.user_id || null,
          pos_x: coords.x,
          pos_y: coords.y,
        });
      });
      benchSlots.forEach(slot => {
        const profile = slot.player_profile_id ? profileMap.get(slot.player_profile_id) : null;
        toInsert.push({
          match_id: matchId,
          club_id: clubId,
          lineup_slot_id: slot.id,
          player_profile_id: slot.player_profile_id || null,
          role_type: 'bench',
          is_bot: !profile?.user_id,
          is_ready: false,
          connected_user_id: profile?.user_id || null,
          pos_x: null,
          pos_y: null,
        });
      });
      return toInsert;
    };

    const buildMissingBots = (list: Participant[], formation: string, isHome: boolean, clubId: string) => {
      if (isTestMatch || list.length >= 11) return [] as Array<Record<string, unknown>>;
      const positions = getFormationPositions(formation, isHome, isKickoffStart);
      const botsToInsert: Array<Record<string, unknown>> = [];
      for (let index = list.length; index < 11; index++) {
        const coords = positions[index] || { x: isHome ? 30 : 70, y: 50 };
        botsToInsert.push({
          match_id: matchId,
          player_profile_id: null,
          club_id: clubId,
          lineup_slot_id: null,
          role_type: 'player',
          is_bot: true,
          is_ready: false,
          connected_user_id: null,
          pos_x: coords.x,
          pos_y: coords.y,
        });
      }
      return botsToInsert;
    };

    let botsToInsert: Array<Record<string, unknown>> = [];

    // If match has lineups and no participants yet → seed from lineups (not generic bots)
    if (!isTestMatch && homePlayers.length === 0 && awayPlayers.length === 0) {
      const [homeFromLineup, awayFromLineup] = await Promise.all([
        seedFromLineupClient(matchData.home_lineup_id, matchData.home_club_id, true),
        seedFromLineupClient(matchData.away_lineup_id, matchData.away_club_id, false),
      ]);
      botsToInsert = [...homeFromLineup, ...awayFromLineup];
    } else {
      botsToInsert = [
        ...buildMissingBots(homePlayers, nextHomeClub.formation || DEFAULT_FORMATION, true, matchData.home_club_id),
        ...buildMissingBots(awayPlayers, nextAwayClub.formation || DEFAULT_FORMATION, false, matchData.away_club_id),
      ];
    }

    if (botsToInsert.length > 0) {
      const { data: insertedBots } = await supabase.from('match_participants').insert(botsToInsert as any).select('*');
      nextParticipantRows = [...nextParticipantRows, ...(((insertedBots || []) as Participant[]))];
    }

    const uniqueProfileIds = [...new Set(nextParticipantRows.filter(participant => participant.player_profile_id).map(participant => participant.player_profile_id!))];
    const { data: attrRows } = uniqueProfileIds.length > 0
      ? await supabase.from('player_attributes').select('*').in('player_profile_id', uniqueProfileIds)
      : { data: [] };

    setPlayerAttrsMap(buildParticipantAttrsMap(nextParticipantRows, attrRows || []));
    applyParticipantRows(nextParticipantRows, matchData);

    return matchData;
  }, [applyParticipantRows, matchId]);

  const loadLiveSnapshot = useCallback(async () => {
    if (!matchId || liveSnapshotInFlightRef.current) return;
    liveSnapshotInFlightRef.current = true;

    try {
      const [matchRes, turnRes, eventsRes, partRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).single(),
        supabase.from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('match_event_logs').select('*').eq('match_id', matchId)
          .order('created_at', { ascending: false }).limit(LIVE_EVENT_LIMIT),
        supabase.from('match_participants').select('id, pos_x, pos_y').eq('match_id', matchId),
      ]);

      if (matchRes.data) {
        const matchData = matchRes.data as MatchData;
        matchRef.current = matchData;
        setMatch(matchData);
        if (participantRowsRef.current.length > 0) applyParticipantRows(participantRowsRef.current, matchData);
      }

      // Sync authoritative positions from DB to prevent client desync
      if (partRes.data && partRes.data.length > 0) {
        const dbMap = new Map(partRes.data.map((r: any) => [r.id, { x: Number(r.pos_x), y: Number(r.pos_y) }]));
        setParticipants(prev => prev.map(p => {
          const db = dbMap.get(p.id);
          if (db) return { ...p, field_x: db.x, field_y: db.y, pos_x: db.x, pos_y: db.y };
          return p;
        }));
      }

      if (turnRes.data) {
        const turnData = turnRes.data as MatchTurn;
        const endsAt = new Date(turnData.ends_at);
        if (!isNaN(endsAt.getTime())) {
          activeTurnRef.current = turnData;
          turnMetaByIdRef.current.set(turnData.id, { phase: turnData.phase, turn_number: turnData.turn_number });
          setActiveTurn(turnData);
        }
      } else {
        activeTurnRef.current = null;
        setActiveTurn(null);
      }

      // Query fetches latest N events in descending order; reverse for chronological display
      setEvents(((eventsRes.data || []) as EventLog[]).reverse());
      scheduleTurnActionsReconcile(true);
    } finally {
      liveSnapshotInFlightRef.current = false;
    }
  }, [applyParticipantRows, matchId, scheduleTurnActionsReconcile]);

  const ensureScheduledMatchStarted = useCallback(async () => {
    if (!matchId || scheduledMatchStartInFlightRef.current) return;

    scheduledMatchStartInFlightRef.current = true;
    try {
      await invokeMatchEngine({ action: 'auto_start', match_id: matchId });
    } catch (error) {
      console.error('Scheduled match start recovery failed:', error);
    } finally {
      scheduledMatchStartInFlightRef.current = false;
      await loadLiveSnapshot();
    }
  }, [invokeMatchEngine, loadLiveSnapshot, matchId]);

  useEffect(() => {
    if (!matchId) return;

    matchRef.current = null;
    homeClubRef.current = null;
    awayClubRef.current = null;
    activeTurnRef.current = null;
    participantRowsRef.current = [];
    playerProfileCacheRef.current = new Map();
    lineupSlotCacheRef.current = new Map();
    turnMetaByIdRef.current = new Map();
    turnActionsRef.current = [];
    turnActionsFetchInFlightRef.current = false;
    turnActionsFetchQueuedRef.current = false;
    scheduledMatchStartInFlightRef.current = false;
    realtimeHasSubscribedRef.current = false;
    realtimeNeedsRecoveryRef.current = false;
    phaseProcessorInFlightRef.current = false;
    phaseProcessorLastAttemptRef.current = { turnId: null, at: 0 };
    if (turnActionsFetchTimerRef.current) {
      clearTimeout(turnActionsFetchTimerRef.current);
      turnActionsFetchTimerRef.current = null;
    }

    setLoading(true);
    setMatch(null);
    setHomeClub(null);
    setAwayClub(null);
    setActiveTurn(null);
    setEvents([]);
    setLeagueRoundNumber(null);
    setParticipants([]);
    setTurnActions([]);
    setPlayerAttrsMap({});

    let cancelled = false;

    (async () => {
      try {
        await loadStaticMatchData();
        if (cancelled) return;
        await loadLiveSnapshot();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (turnActionsFetchTimerRef.current) {
        clearTimeout(turnActionsFetchTimerRef.current);
        turnActionsFetchTimerRef.current = null;
      }
    };
  }, [loadLiveSnapshot, loadStaticMatchData, matchId]);

  const persistedSubmittedIds = useMemo(() => new Set(turnActions.map(action => action.participant_id)), [turnActions]);
  const allSubmittedIds = useMemo(
    () => new Set([...Array.from(persistedSubmittedIds), ...Array.from(submittedActions)]),
    [persistedSubmittedIds, submittedActions]
  );

  // Ref to participants — keeps current snapshot accessible in callbacks/effects without
  // creating dependency-array re-render cascades (prevents React #310).
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  // ── Determine user role ─────────────────────────────────────
  // Guard ref prevents the async DB claim from being sent multiple times
  // (Realtime events can bump participantsVer many times before .then() resolves)
  const roleClaimSentRef = useRef(false);
  const lastRoleRef = useRef<{ role: string; participantId: string | null; clubId: string | null }>({ role: '', participantId: null, clubId: null });
  useEffect(() => {
    if (!user || !match) return;
    const parts = participantsRef.current;
    if (parts.length === 0) return; // Wait until participants are loaded

    // 1. Check by connected_user_id (primary)
    let playerPart = parts.find(p => p.connected_user_id === user.id && p.role_type === 'player');

    // 2. Fallback: check by player_profile_id matching current active player profile
    if (!playerPart && playerProfile?.id) {
      playerPart = parts.find(p => p.player_profile_id === playerProfile.id && p.role_type === 'player');
      // Claim this participant: update connected_user_id in DB so future checks work
      // Guard: only send the claim ONCE to prevent cascading re-renders
      if (playerPart && !playerPart.connected_user_id && !roleClaimSentRef.current) {
        roleClaimSentRef.current = true;
        supabase.from('match_participants')
          .update({ connected_user_id: user.id, is_bot: false })
          .eq('id', playerPart.id)
          .then(() => {
            setParticipants(prev => prev.map(p =>
              p.id === playerPart!.id ? { ...p, connected_user_id: user.id, is_bot: false } : p
            ));
          });
      }
    }

    const managerPart = parts.find(p => p.connected_user_id === user.id && p.role_type === 'manager');
    const isManagerOfHome = club?.id === match.home_club_id;
    const isManagerOfAway = club?.id === match.away_club_id;
    const isManagerOfMatch = isManagerOfHome || isManagerOfAway;

    // Only update role state if it actually changed (avoids redundant renders)
    let nextRole: 'player' | 'manager' | 'spectator' = 'spectator';
    let nextParticipant: Participant | null = null;
    let nextClubId: string | null = null;

    if (playerPart) {
      nextRole = 'player';
      nextParticipant = playerPart;
      nextClubId = playerPart.club_id;
    } else if (managerPart || isManagerOfMatch) {
      nextRole = 'manager';
      nextParticipant = managerPart || null;
      nextClubId = managerPart?.club_id || (isManagerOfHome ? match.home_club_id : match.away_club_id);
    } else {
      const benchPart = playerProfile?.id
        ? parts.find(p => p.player_profile_id === playerProfile.id && p.role_type === 'bench')
        : null;
      if (benchPart) {
        nextParticipant = benchPart;
        nextClubId = benchPart.club_id;
      }
    }

    const prev = lastRoleRef.current;
    if (prev.role !== nextRole || prev.participantId !== nextParticipant?.id || prev.clubId !== nextClubId) {
      lastRoleRef.current = { role: nextRole, participantId: nextParticipant?.id || null, clubId: nextClubId };
      setMyRole(nextRole);
      setMyParticipant(nextParticipant);
      setMyClubId(nextClubId);
      if (nextRole === 'player' && nextParticipant) setSelectedParticipantId(nextParticipant.id);
    }
  }, [user, participantsVer, match, club, playerProfile]);

  const computeMaxMoveRange = useCallback((participantId: string, targetDirection?: { x: number; y: number }, overrideMultiplier?: number): number => {
    const attrs = playerAttrsMap[participantId];
    const turnNum = match?.current_turn_number ?? 1;
    // Positional penalty: if fielded out of position, scale move-relevant attrs down
    const part = participants.find(p => p.id === participantId);
    const profile = part?.player_profile_id ? playerProfileCacheRef.current.get(part.player_profile_id) : null;
    const posMult = part && profile
      ? positionalMultiplier(part.slot_position || part.field_pos, profile.primary_position, profile.secondary_position)
      : 1;
    const vel = Number(attrs?.velocidade ?? 40) * posMult;
    const accel = Number(attrs?.aceleracao ?? 40) * posMult;
    const stam = Number(attrs?.stamina ?? 40) * posMult;
    const accelFactor = 0.3 + normalizeAttr(accel) * 0.5;
    // Halved from the original 10+n*6 after feedback from the first human league round,
    // then bumped 1.2× — 40 → ~7.2u, 70 → ~8.4u, 90 → ~9u, 99 → ~9.6u per turn.
    const maxSpeed = (5 + normalizeAttr(vel) * 3) * 1.2;
    const staminaDecay = 1.0 - (Math.max(0, turnNum - 20) / 40) * (1 - normalizeAttr(stam)) * 0.2;
    let range = 0;
    let speed = 0;

    for (let i = 0; i < 10; i += 1) {
      speed = speed * (1 - accelFactor) + (maxSpeed / 10) * staminaDecay * accelFactor;
      range += Math.min(speed, maxSpeed / 10);
    }

    // ── GK extra reach when ball action targets his own penalty area ──
    // Penalty kick → 1.5×, ball-action trajectory into own PA → 2.0×, else 1.0×.
    // Applied BEFORE BH/cooldown/inertia multipliers so they stack on top.
    // MUST match supabase/functions/match-engine-lab/index.ts getGkAreaMultiplier.
    {
      const slotPos = (part?.slot_position || part?.field_pos || '').toString().replace(/[0-9]/g, '').toUpperCase();
      const isGK = slotPos === 'GK' || slotPos === 'GOL';
      if (isGK && part && match) {
        let gkMult = 1.0;
        const setPieceType = activeTurn?.set_piece_type;
        if (setPieceType === 'penalty') {
          gkMult = 1.5;
        } else {
          const bhId = activeTurn?.ball_holder_participant_id;
          const bhAct = bhId
            ? turnActions.find(a => a.participant_id === bhId
                && (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
                && a.target_x != null && a.target_y != null)
            : undefined;
          if (bhAct) {
            const at = bhAct.action_type;
            const isShot = at === 'shoot_controlled' || at === 'shoot_power' || at === 'header_controlled' || at === 'header_power';
            if (isShot) {
              gkMult = 2.0;
            } else if (bhAct.target_x != null && bhAct.target_y != null) {
              const isSecondHalf = (match.current_half ?? 1) >= 2;
              const isHomeRaw = part.club_id === match.home_club_id;
              const defendsLeft = isHomeRaw ? !isSecondHalf : isSecondHalf;
              const tx = Number(bhAct.target_x);
              const ty = Number(bhAct.target_y);
              const yInArea = ty >= 20 && ty <= 80;
              const xInOwnArea = defendsLeft ? tx <= 18 : tx >= 82;
              if (yInArea && xInOwnArea) gkMult = 2.0;
            }
          }
        }
        if (gkMult !== 1.0) range *= gkMult;
      }
    }

    const isBallHolder = activeTurn?.ball_holder_participant_id === participantId;
    if (isBallHolder) {
      if (activeTurn?.phase === 'attacking_support') {
        range *= 0.50; // BH move while passing/shooting
      } else if (activeTurn?.phase === 'ball_holder') {
        range *= 0.85; // BH conducting ball — 15% penalty
      }
    }

    // Failed-tackle cooldown penalty: desarme miss → ×0.85, carrinho miss → ×0.50.
    const failedTacklePenalty = tackleMovementPenalty[participantId];
    if (failedTacklePenalty != null) {
      range *= failedTacklePenalty;
    }

    if (overrideMultiplier != null) range *= overrideMultiplier;

    // One-touch turn: movement scaled by ball speed (faster ball = less reaction time).
    // ONLY applied to the participant actually executing the one-touch action (the intended
    // receiver). Other teammates must be free to reposition at full base range — otherwise
    // a cross (pass_launch) compounds penalties and teammates can't reach the ball.
    // Must match supabase/functions/match-engine-lab/index.ts attacking_support resolution.
    const oneTouchAct = turnActions.find(a =>
      a.participant_id === participantId &&
      a.payload && typeof a.payload === 'object' &&
      ((a.payload as any).one_touch_executed === true || (a.payload as any).one_touch === true)
    );
    if (oneTouchAct) {
      const originType = (oneTouchAct.payload as any).origin_action_type || 'pass_low';
      const otSpeedFactor =
        (originType === 'shoot_power' || originType === 'header_power') ? 0.25 :
        (originType === 'shoot_controlled' || originType === 'header_controlled') ? 0.35 :
        originType === 'pass_launch' ? 1.0 :
        (originType === 'pass_high' || originType === 'header_high') ? 0.65 :
        1.0;
      range *= otSpeedFactor * 0.5;
    }

    // ── Directional inertia: bonus for same direction, penalty for reversing ──
    // Same direction as last turn = 1.2× range. Reversing = 0.5× range. Linear between.
    if (targetDirection) {
      const prevDir = prevDirectionsRef.current[participantId];
      if (prevDir) {
        const FIELD_Y_SCALE = INNER_H / INNER_W;
        const prevX = prevDir.x, prevY = prevDir.y * FIELD_Y_SCALE;
        const curX = targetDirection.x, curY = targetDirection.y * FIELD_Y_SCALE;
        const prevLen = Math.sqrt(prevX * prevX + prevY * prevY);
        const curLen = Math.sqrt(curX * curX + curY * curY);
        if (prevLen > 0.1 && curLen > 0.1) {
          const dot = (prevX * curX + prevY * curY) / (prevLen * curLen);
          const angleDiff = Math.acos(Math.max(-1, Math.min(1, dot)));
          const normalizedAngle = angleDiff / Math.PI;
          const rawDirMult = 1.2 - 0.7 * normalizedAngle; // 1.2x→0.5x
          // Scale by inertia power (0-100%): 100% = full effect, 0% = no effect.
          const power = (inertiaPowerRef.current[participantId] ?? 100) / 100;
          const dirMult = 1.0 + (rawDirMult - 1.0) * power;
          range *= dirMult;
          // Debug: surface what the inertia is doing so we can catch any inversion.
          if (typeof window !== 'undefined' && (window as any).__bdo_inertia_log) {
            console.log('[INERTIA]', participantId.slice(0, 8),
              'prev', { x: prevDir.x.toFixed(1), y: prevDir.y.toFixed(1) },
              'cur', { x: targetDirection.x.toFixed(1), y: targetDirection.y.toFixed(1) },
              'dot', dot.toFixed(2), 'mult', dirMult.toFixed(2));
          }
        }
      }
    }

    return range;
  }, [playerAttrsMap, match?.current_turn_number, match?.current_half, match?.home_club_id, activeTurn?.ball_holder_participant_id, activeTurn?.phase, activeTurn?.set_piece_type, turnActions, participants, tackleMovementPenalty]);

  // Apply ballSpeedFactor to a player's range based on current ball trajectory action.
  // Outfield players get reduced range (fast ball = less time to react).
  // GK is handled by getGkAreaMultiplier (applied earlier in computeMaxMoveRange): ×2.0 on
  // any shot or on passes/headers into the penalty area, ×1.5 on penalty, else ×1.0.
  // We skip ballSpeedFactor for GK so it doesn't stack on top of that bonus.
  const applyBallSpeedFactor = useCallback((baseRange: number, participantId: string, trajectoryActionType: string | null | undefined): number => {
    if (!trajectoryActionType) return baseRange;
    const player = participantsRef.current.find(p => p.id === participantId);
    const isGK = player?.field_pos === 'GK' || (player as any)?.slot_position === 'GK';
    if (isGK) return baseRange;
    const factor =
      (trajectoryActionType === 'shoot_power' || trajectoryActionType === 'header_power') ? 0.25 :
      (trajectoryActionType === 'shoot_controlled' || trajectoryActionType === 'header_controlled') ? 0.35 :
      trajectoryActionType === 'pass_launch' ? 0.65 :
      (trajectoryActionType === 'pass_high' || trajectoryActionType === 'header_high') ? 0.65 :
      1.0;
    return baseRange * factor;
  }, []);

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
        void ensureScheduledMatchStarted();
      }
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [ensureScheduledMatchStarted, match?.status, match?.scheduled_at, serverNow]);

  // ── Phase countdown timer (rAF + ref, no per-tick setState) ──
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (!activeTurn || match?.status !== 'live') return;

    // Validate ends_at before using
    const endsAt = new Date(activeTurn.ends_at);
    if (isNaN(endsAt.getTime())) {
      setPhaseTimeLeft(0);
      phaseTimeLeftRef.current = 0;
      return;
    }

    let rafId: number | null = null;
    let hitZero = false;

    const tick = () => {
      const remaining = Math.max(0, endsAt.getTime() - serverNow());
      const seconds = Math.ceil(remaining / 1000);
      phaseTimeLeftRef.current = seconds;

      // Update DOM directly for countdown display
      if (timerDisplayRef.current) {
        timerDisplayRef.current.textContent = `${seconds}s`;
        timerDisplayRef.current.className = `font-display font-bold text-sm tabular-nums ${seconds <= 2 ? 'text-destructive animate-pulse' : 'text-foreground'}`;
      }

      // Update timer bar width directly
      if (timerBarRef.current) {
        const phase = activeTurnRef.current?.phase;
        const dur = phase === 'resolution' ? RESOLUTION_PHASE_DURATION
          : (phase === 'positioning_attack' || phase === 'positioning_defense') ? POSITIONING_PHASE_DURATION : PHASE_DURATION;
        const pct = dur > 0 ? (seconds / dur) * 100 : 0;
        timerBarRef.current.style.width = `${pct}%`;
        timerBarRef.current.style.background = seconds <= 2
          ? 'hsl(var(--destructive))'
          : 'linear-gradient(90deg, hsl(var(--pitch-green)), hsl(var(--warning-amber)))';
      }

      // Pre-trigger removed — the cron handles processing every 1s.
      // Client fallback only fires if cron appears stuck (see effect below).

      if (seconds <= 0 && !hitZero) {
        hitZero = true;
        setPhaseTimeLeft(0);
      }

      if (!hitZero) {
        rafId = requestAnimationFrame(tick);
      }
    };

    // Initial sync: set state once so effects that read phaseTimeLeft work
    const initialRemaining = Math.max(0, endsAt.getTime() - serverNow());
    const initialSeconds = Math.ceil(initialRemaining / 1000);
    phaseTimeLeftRef.current = initialSeconds;
    setPhaseTimeLeft(initialSeconds);

    rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [activeTurn, match?.status]);

  // Reset the per-phase submitted cache when the phase flips (ball_holder →
  // attacking_support → defending_response). Without this, a defender who submitted
  // a receive in attacking_support stays in `submittedActions` and the action menu
  // never auto-opens for them in defending_response. The persisted submitted ids
  // (derived from turnActions) cover cross-phase display separately.
  useEffect(() => {
    // Before wiping, flush any deferred move so we don't silently lose it
    // across phase transitions (the phase-timer watcher should have fired
    // first, but belt-and-suspenders).
    flushPendingMoveRef.current?.(100);
    setSubmittedActions(new Set());
    menuAutoOpenedRef.current = new Set();
    setInertiaArrow(null);
  }, [activeTurn?.phase]);

  // Reset local submission cache only when a brand-new turn starts
  useEffect(() => {
    setSubmittedActions(new Set());
    setResolutionStartPositions({});
    setFinalPositions({});

    // Capture players who failed a tackle in the turn we're LEAVING — they can't tackle
    // in the new turn AND have their movement capped (−15% desarme / −50% carrinho).
    const prevTurnFailed = new Set<string>();
    const prevTurnPenalty: Record<string, number> = {};
    for (const ev of resolutionEventsRef.current) {
      if (ev.event_type === 'tackle_failed') {
        const p = ev.payload as any;
        if (p?.participant_id) {
          prevTurnFailed.add(p.participant_id);
          prevTurnPenalty[p.participant_id] = p.hard_tackle ? 0.50 : 0.85;
        }
      }
    }
    setTackleBlockedIds(prevTurnFailed);
    setTackleMovementPenalty(prevTurnPenalty);
    resolutionEventsRef.current = [];
    resolutionScriptRef.current = null;
    resolutionScriptTurnIdRef.current = null;

    const currentTurnNumberForInertia = activeTurn?.turn_number ?? null;
    const alreadySeededForThisTurn = currentTurnNumberForInertia != null
      && inertiaAppliedForTurnRef.current === currentTurnNumberForInertia;

    if (activeTurn?.ball_holder_participant_id == null) {
      // Ball loose — always re-seed from server events (loose_ball / ball_inertia).
      // The engine applies 0.15 decay on the first loose turn and 0.08 on every
      // subsequent one; short-circuiting on the "already loose" case left the
      // cached position stuck at the first-turn prediction while the server kept
      // rolling the ball, causing the client-displayed ball to be in a different
      // place than where the engine thought it was — players targeting the visible
      // ball ended up >2.65 units from the server position and were rejected.
      const turnBall = (activeTurn as any)?.ball_x != null && (activeTurn as any)?.ball_y != null
        ? { x: Number((activeTurn as any).ball_x), y: Number((activeTurn as any).ball_y) }
        : null;
      const pos = finalBallPosRef.current
        ?? finalBallPos
        ?? resolveLooseBallFromHistory(events, turnActions, currentTurnNumberForInertia)
        ?? turnBall;
      if (pos) {
        setCarriedLooseBallPos(pos);
        // Seed ball direction for the animation. Done every loose turn (not just
        // the first) so subsequent turns can still animate the server's continuing
        // decay — lastBallDirRef is kept alive for exactly this purpose.
        if (!alreadySeededForThisTurn && lastBallDirRef.current) {
          setBallInertiaDir(lastBallDirRef.current);
          inertiaAppliedForTurnRef.current = currentTurnNumberForInertia;
        }
      }
    } else {
      setCarriedLooseBallPos(null);
      setBallInertiaDir(null);
      lastBallDirRef.current = null;
      inertiaConsumedRef.current = false;
      inertiaAppliedForTurnRef.current = null;
    }

    setFinalBallPos(null);
    finalBallPosRef.current = null;
    animatedResolutionIdRef.current = null;
    // Drop any leftover RAF transform from the previous turn so the new turn's
    // React-rendered ball base isn't offset by a stale translate().
    const ballGElTurn = ballGroupRef.current;
    if (ballGElTurn) ballGElTurn.removeAttribute('transform');
  }, [activeTurn?.turn_number]);

  useEffect(() => {
    setDrawingAction(null);
    setShowActionMenu(null);
    setPendingInterceptChoice(null);
    // Don't reset animation state when entering resolution - the animation effect handles it
    if (activeTurn?.phase !== 'resolution') {
      setAnimating(false);
      setAnimProgress(0);
      animProgressRef.current = 0;
    }
    // Track if this turn follows a positioning turn (dead ball)
    if (activeTurn?.phase === 'ball_holder') {
      // prevTurnWasPositioningRef is already set from the previous phase
    } else if (activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense') {
      prevTurnWasPositioningRef.current = true;
      // Entering a positioning phase means the ball was dead (kick-off, goal kick,
      // throw-in, etc.). Zero ALL player inertia and ball inertia so the restart
      // doesn't carry momentum from the play that ended.
      prevDirectionsRef.current = {};
      setBallInertiaDir(null);
      lastBallDirRef.current = null;
      inertiaConsumedRef.current = false;
    } else {
      prevTurnWasPositioningRef.current = false;
    }
  }, [activeTurn?.id, activeTurn?.phase]);

  // Positioning turn detection
  // Halftime = half 2 has been scheduled but its start is still in the future.
  // During halftime no action submissions, no draw/drag, no positioning prompts.
  const isHalftimeNow = match?.current_half === 2
    && !!match?.half_started_at
    && new Date(match.half_started_at).getTime() > Date.now();
  // A positioning turn is "active for the user" only when we're not mid-halftime.
  const isPositioningTurn = !isHalftimeNow && (activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense');
  const isPositioningAttack = activeTurn?.phase === 'positioning_attack';
  const isPositioningDefense = activeTurn?.phase === 'positioning_defense';
  // True only when the current positioning phase belongs to the viewer's team
  // (attack phase → user's team has possession; defense phase → user's team doesn't).
  // Used to scope the pulsing "act now" cue so the defending side doesn't flash during
  // the attacking side's positioning turn (and vice-versa).
  const isMyPositioningPhase = isPositioningTurn && myClubId != null && activeTurn?.possession_club_id != null && (
    (isPositioningAttack && myClubId === activeTurn.possession_club_id) ||
    (isPositioningDefense && myClubId !== activeTurn.possession_club_id)
  );
  // Dead ball: first ball_holder phase after a positioning turn (kickoff, throw-in, corner, goal kick)
  const isDeadBall = activeTurn?.phase === 'ball_holder' && prevTurnWasPositioningRef.current;

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

  // ── Contest visual effect + sounds from event logs ────────────
  useEffect(() => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    if (!last) return;

    // Sound effects based on event type
    if (last.event_type === 'goal') sounds.goal();
    else if (last.event_type === 'foul' || last.event_type === 'penalty') sounds.foul();
    else if (last.event_type === 'kickoff') sounds.whistle();
    else if (last.event_type === 'final_whistle' || last.event_type === 'second_half') sounds.whistleLong();
    else if (last.event_type === 'corner' || last.event_type === 'throw_in' || last.event_type === 'free_kick') sounds.setPiece();
    else if (last.event_type === 'yellow_card' || last.event_type === 'red_card') sounds.foul();

    // Events that should pop a visual pill on the pitch.
    const PILL_EVENTS: Record<string, ContestEffectKind> = {
      tackle: 'tackle_success',
      tackle_failed: 'tackle_fail',
      dribble: 'dribble',
      blocked: 'block',
      saved: 'save',
      intercepted: 'intercept',
      goal: 'goal',
      foul: 'foul',
      penalty: 'penalty',
      yellow_card: 'yellow_card',
      red_card: 'red_card',
      receive_success: 'receive_ok',
      receive_failed: 'receive_fail',
    };
    const effectType = PILL_EVENTS[last.event_type];
    if (!effectType) return;

    // Skip block/save pill if the shot actually missed the frame (event batch contradicts itself).
    const recentTypes = new Set(events.slice(-8).map(e => e.event_type));
    if ((last.event_type === 'blocked' || last.event_type === 'saved') &&
        (recentTypes.has('shot_missed') || recentTypes.has('shot_over'))) return;
    // If a tackle was followed by a dribble in the same batch, the tackle failed.
    if (last.event_type === 'tackle' && recentTypes.has('dribble')) return;

    // Resolve position. Prefer the participant named in the event payload
    // (yellow/red cards, receives, tackles targeted at someone); fall back to
    // ball holder position; then to midfield.
    const payload = (last.payload || {}) as Record<string, any>;
    const pidCandidates = [payload.participant_id, payload.target_participant_id, payload.victim_participant_id].filter(Boolean);
    const participantMatch = pidCandidates
      .map(pid => participants.find(p => p.id === pid))
      .find(Boolean);
    const bhPart = participants.find(p => p.id === activeTurn?.ball_holder_participant_id);
    const ref = participantMatch || bhPart;
    const effectX = ref?.field_x ?? 50;
    const effectY = ref?.field_y ?? 50;

    setContestEffect({ type: effectType, x: effectX, y: effectY, label: last.title });
    contestEffectTsRef.current = Date.now();

    // Safety: always clear after 3500ms even if animation never ends.
    const safety = setTimeout(() => setContestEffect(null), 3500);
    return () => clearTimeout(safety);
  }, [events.length]);

  // Clear the contest effect shortly after the resolution animation actually ends,
  // but keep it visible for at least 1600ms so it doesn't flicker past.
  useEffect(() => {
    if (animating) return;
    if (!contestEffect) return;
    const MIN_VISIBLE = 1600;
    const elapsed = Date.now() - contestEffectTsRef.current;
    const remaining = Math.max(0, MIN_VISIBLE - elapsed);
    const t = setTimeout(() => setContestEffect(null), remaining + 200);
    return () => clearTimeout(t);
  }, [animating, contestEffect]);

  // Flush a queued next-turn apply as soon as the resolution animation ends.
  useEffect(() => {
    if (animating) return;
    const pending = pendingTurnApplyRef.current;
    if (!pending) return;
    pendingTurnApplyRef.current = null;
    if (pendingTurnSafetyTimerRef.current) {
      clearTimeout(pendingTurnSafetyTimerRef.current);
      pendingTurnSafetyTimerRef.current = null;
    }
    pending();
  }, [animating]);

  // Auto-show action menu for ball holder in phase 1
  // For loose ball (no ball_holder), skip phase 1 — handled by engine
  // IMPORTANT: If there's already a one_touch_executed action for this turn, DON'T auto-open
  useEffect(() => {
    if (!activeTurn || match?.status !== 'live' || isPhaseProcessing) return;
    // Don't open menus while the inertia arrow is active — the menu overlay
    // would steal the click the user intends for the slider confirmation.
    if (inertiaArrow) return;

    // Positioning turn: no auto-open action menu, players click manually
    if (isPositioningTurn) return;

    // ── Phase 1: ball holder ──
    if (activeTurn.phase === 'ball_holder' && activeTurn.ball_holder_participant_id) {
      const hasOneTouchAction = turnActions.some(a =>
        a.participant_id === activeTurn.ball_holder_participant_id &&
        a.payload && typeof a.payload === 'object' &&
        ((a.payload as any).one_touch_executed === true || (a.payload as any).one_touch === true)
      );
      if (hasOneTouchAction) return;

      if (oneTouchPendingForRef.current === activeTurn.ball_holder_participant_id) {
        oneTouchPendingForRef.current = null;
        return;
      }

      const bhAlreadySubmitted = submittedActions.has(activeTurn.ball_holder_participant_id);
      if (bhAlreadySubmitted) return;

      // Ignore actions from previous phases of the SAME turn — the
      // BH likely submitted a 'move' during positioning_attack, which
      // would otherwise trick this check into treating the ball_holder
      // phase as already-actioned and skip the menu auto-open.
      const bhHasAction = turnActions.some(a =>
        a.participant_id === activeTurn.ball_holder_participant_id &&
        a.action_type !== 'receive' &&
        a.turn_phase === 'ball_holder'
      );
      if (bhHasAction) return;

      const parts = participantsRef.current;
      const bh = parts.find(p => p.id === activeTurn.ball_holder_participant_id);
      const hCount = parts.filter(pp => pp.club_id === match?.home_club_id && pp.role_type === 'player').length;
      const aCount = parts.filter(pp => pp.club_id === match?.away_club_id && pp.role_type === 'player').length;
      const isTest = hCount <= 4 && aCount <= 4;
      const canControlBH = bh && (
        (myRole === 'player' && myParticipant?.id === bh.id) ||
        (myRole === 'manager' && (bh.club_id === myClubId || isTest))
      );
      if (canControlBH && !menuAutoOpenedRef.current.has(bh.id)) {
        setShowActionMenu(bh.id);
        setSelectedParticipantId(bh.id);
        menuAutoOpenedRef.current.add(bh.id);
      }
      return;
    }

    // ── Phase 2/3: auto-open menu (always) ──
    // Player: opens for their own participant when their team is acting.
    // Manager: opens for the currently selected participant (defaulting to the
    // ball holder carried over from phase 1) when that player's team is acting.
    {
      const isAttackingPhase = activeTurn.phase === 'attacking_support';
      const isDefendingPhase = activeTurn.phase === 'defending_response';
      if (!isAttackingPhase && !isDefendingPhase) return;

      const possClubId = activeTurn.possession_club_id;
      const phaseIsAttacking = isAttackingPhase;
      // In loose-ball turns both teams act in BOTH phases (see the filter in
      // getActionsForParticipant). The regular attacking/defending phase gate
      // would skip the non-possession team's menu, so relax it when loose.
      const isLooseBallTurn = activeTurn.ball_holder_participant_id == null;

      let targetPid: string | null = null;
      if (myRole === 'player' && myParticipant?.id) {
        const isMyTeamAttacking = myClubId === possClubId;
        const shouldActInThisPhase = isLooseBallTurn
          || (phaseIsAttacking && isMyTeamAttacking)
          || (!phaseIsAttacking && !isMyTeamAttacking);
        if (shouldActInThisPhase) targetPid = myParticipant.id;
      } else if (myRole === 'manager') {
        const parts = participantsRef.current;
        const hCount = parts.filter(pp => pp.club_id === match?.home_club_id && pp.role_type === 'player').length;
        const aCount = parts.filter(pp => pp.club_id === match?.away_club_id && pp.role_type === 'player').length;
        const isTest = hCount <= 4 && aCount <= 4;

        // Manager must explicitly click a player — no random fallback.
        // Previously fell back to ball_holder, which opened the menu for a
        // player the manager didn't intend to control.
        const candidateId = selectedParticipantId || null;
        const candidate = candidateId ? parts.find(p => p.id === candidateId) : null;
        if (candidate && candidate.role_type === 'player') {
          const candidateIsAttacking = candidate.club_id === possClubId;
          const managerControlsCandidate = isTest || candidate.club_id === myClubId;
          const candidateShouldAct = isLooseBallTurn
            || (phaseIsAttacking && candidateIsAttacking)
            || (!phaseIsAttacking && !candidateIsAttacking);
          if (managerControlsCandidate && candidateShouldAct) targetPid = candidate.id;
        }
      }

      if (!targetPid) return;
      if (submittedActions.has(targetPid)) return;
      if (menuAutoOpenedRef.current.has(targetPid)) return;

      // Ball holder in attacking_support: auto-start move drawing ONLY when BH
      // submitted a ball action (pass/shoot/header) in ball_holder phase. If BH
      // chose to dribble (move) in phase 1, they can't act again in phase 2.
      // This check MUST run before the generic "alreadyHasAction" gate below —
      // the BH's phase-1 ball action would otherwise count as "already acted"
      // and skip the auto-move (seen after free-kick shots).
      const isBH = isAttackingPhase
        && activeTurn.ball_holder_participant_id === targetPid;
      if (isBH) {
        const bhHasBallAction = turnActions.some(a =>
          a.participant_id === targetPid &&
          (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
        );
        const bhHasPhase2Action = turnActions.some(a =>
          a.participant_id === targetPid
          && a.turn_phase === 'attacking_support'
          && a.action_type !== 'receive'
        );
        if (bhHasPhase2Action) {
          // Already acted in phase 2 — respect that.
          menuAutoOpenedRef.current.add(targetPid);
          return;
        }
        if (!bhHasBallAction) {
          // BH dribbled (or no phase-1 ball action) — no move available in phase 2.
          menuAutoOpenedRef.current.add(targetPid);
          return;
        }
        setSelectedParticipantId(targetPid);
        setDrawingAction({ type: 'move', fromParticipantId: targetPid });
        // Seed mouseFieldPct so the glow + zero-length arrow render immediately.
        const parts = participantsRef.current;
        const autoFrom = parts.find(p => p.id === targetPid);
        if (autoFrom?.field_x != null && autoFrom?.field_y != null) {
          setMouseFieldPct({ x: autoFrom.field_x, y: autoFrom.field_y });
        }
        menuAutoOpenedRef.current.add(targetPid);
        return;
      }

      // Only treat as "already acted" if the action was submitted in the CURRENT phase.
      // A move submitted during positioning_attack/defense must not block the
      // attacking_support / defending_response menu.
      const alreadyHasAction = turnActions.some(a =>
        a.participant_id === targetPid
        && a.action_type !== 'receive'
        && a.turn_phase === activeTurn.phase
      );
      if (alreadyHasAction) return;

      // Before opening the menu, check if this player is already on the ball
      // trajectory. If so, pre-fill pendingInterceptChoice so the menu shows
      // receive/block/one-touch immediately — no need to drag to the trajectory.
      tryAutoDetectIntercept(targetPid);
      setShowActionMenu(targetPid);
      setSelectedParticipantId(targetPid);
      menuAutoOpenedRef.current.add(targetPid);
    }
  }, [activeTurn?.phase, activeTurn?.id, match?.status, myRole, myParticipant?.id, myClubId, isPhaseProcessing, isPositioningTurn, turnActions, submittedActions, activeTurn?.possession_club_id, selectedParticipantId, match?.home_club_id, match?.away_club_id]);

  // ── Positioning auto-draw: players only ──
  // During a positioning phase, if the current user is a PLAYER (not manager) and hasn't
  // submitted yet, pre-activate the move drawing on their own avatar. Result: first click on
  // the field picks the destination. Managers continue to pick their player manually.
  useEffect(() => {
    if (!isPositioningTurn) return;
    if (match?.status !== 'live' || isPhaseProcessing) return;
    if (myRole !== 'player') return;
    if (!myParticipant) return;
    if (myParticipant.is_sent_off) return;
    if (myParticipant.role_type !== 'player') return;
    if (submittedActions.has(myParticipant.id)) return;
    if (drawingAction) return; // don't override an in-progress draw
    // Only my side's positioning phase — don't arm the cursor while the opposing team
    // is positioning (no green circle, no auto-draw on my avatar).
    if (!isMyPositioningPhase) return;
    // The set-piece taker (ball holder) is anchored on the ball and cannot reposition.
    if (myParticipant.id === activeTurn?.ball_holder_participant_id) return;

    setSelectedParticipantId(myParticipant.id);
    setDrawingAction({ type: 'move', fromParticipantId: myParticipant.id });
    if (myParticipant.field_x != null && myParticipant.field_y != null) {
      setMouseFieldPct({ x: myParticipant.field_x, y: myParticipant.field_y });
    }
  }, [isPositioningTurn, isMyPositioningPhase, activeTurn?.id, activeTurn?.ball_holder_participant_id, match?.status, isPhaseProcessing, myRole, myParticipant?.id, myParticipant?.is_sent_off, myParticipant?.role_type, submittedActions, drawingAction]);

  // ── Z hotkey: cancel current action + reopen menu for a fresh choice ─────────
  // If the player never picks a new action from the menu, the submitted
  // "no action" (move to current position) sticks — same behaviour as clicking
  // "Nenhuma ação" manually.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'z' && e.key !== 'Z') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (match?.status !== 'live' || !activeTurn) return;
      if (isPhaseProcessing || isPositioningTurn) return;

      const parts = participantsRef.current;
      const hCount = parts.filter(pp => pp.club_id === match?.home_club_id && pp.role_type === 'player').length;
      const aCount = parts.filter(pp => pp.club_id === match?.away_club_id && pp.role_type === 'player').length;
      const isTest = hCount <= 4 && aCount <= 4;

      const candidateId = selectedParticipantId
        || (myRole === 'player' ? myParticipant?.id : null)
        || activeTurn.ball_holder_participant_id
        || null;
      const candidate = candidateId ? parts.find(p => p.id === candidateId) : null;
      if (!candidate || candidate.role_type !== 'player') return;

      const canControl = (myRole === 'player' && myParticipant?.id === candidate.id)
        || (myRole === 'manager' && (isTest || candidate.club_id === myClubId));
      if (!canControl) return;

      e.preventDefault();
      // Cancel any pending inertia-confirmation: the Z is overriding the move.
      pendingMoveRef.current = null;
      setInertiaArrow(null);
      setSelectedParticipantId(candidate.id);
      setDrawingAction(null);
      setPendingInterceptChoice(null);

      // "Sem Ação" is submitted as a zero-length 'move' with payload.no_action=true
      // so label renderers (toast, on-field popup, arrow label) show "SEM AÇÃO"
      // instead of "MOVER". See feedback_no_action_payload.md.
      const cx = candidate.field_x ?? candidate.pos_x ?? 50;
      const cy = candidate.field_y ?? candidate.pos_y ?? 50;
      void submitAction('move', candidate.id, cx, cy, undefined, { no_action: true });

      setShowActionMenu(candidate.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTurn?.id, activeTurn?.phase, activeTurn?.ball_holder_participant_id, match?.status, match?.home_club_id, match?.away_club_id, myRole, myParticipant?.id, myClubId, selectedParticipantId, isPhaseProcessing, isPositioningTurn]);

  // ── Action letter hotkeys (mão esquerda, 3 linhas semânticas) ────────────────
  // Fires when the action menu is open. Maps a letter to the action if it's
  // currently available for the selected player.
  //   Linha de cima (QWERT) → passes e chutes (pé)
  //   Linha do meio (ASDF)  → cabeceios
  //   Linha de baixo (XCVB) → movimento e defesa
  // Z (global) continua como cancelar/no_action — tratado no handler acima.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (match?.status !== 'live' || !activeTurn) return;
      if (isPhaseProcessing) return;
      if (!showActionMenu) return; // hotkeys only active when menu is open
      const key = e.key.toLowerCase();

      const shortcutMap: Record<string, string> = {
        q: 'pass_low',
        w: 'pass_high',
        e: 'pass_launch',
        r: 'shoot_controlled',
        t: 'shoot_power',
        a: 'header_low',
        s: 'header_high',
        d: 'header_controlled',
        f: 'header_power',
        x: 'move',
        c: 'receive',
        v: 'receive_hard',
        b: 'block',
      };
      const actionType = shortcutMap[key];
      if (!actionType) return;

      // Only fire if this action is currently available in the menu.
      const availableActions = getActionsForParticipant(showActionMenu);
      if (!availableActions.includes(actionType)) return;

      e.preventDefault();
      handleActionMenuSelect(actionType, showActionMenu);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showActionMenu, activeTurn, match?.status, isPhaseProcessing]);

  // ── Engine tick — process once per phase end with explicit pause ─────────────
  useEffect(() => {
    if (match?.status !== 'live' || !activeTurn) {
      setIsPhaseProcessing(false);
      return;
    }
    if (phaseTimeLeft > 0) {
      setIsPhaseProcessing(false);
      return;
    }

    setIsPhaseProcessing(true);
    setProcessingLabel(
      isPositioningTurn
        ? 'Aguardando posicionamento...'
        : activeTurn.phase === 'resolution'
          ? 'Aguardando proximo turno...'
          : 'Aguardando servidor...'
    );
  }, [activeTurn?.id, activeTurn?.phase, isPositioningTurn, match?.status, phaseTimeLeft]);
  useEffect(() => {
    if (!matchId) return;
    realtimeHasSubscribedRef.current = false;
    realtimeNeedsRecoveryRef.current = false;
    const channel = supabase.channel(`match-room-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload: any) => {
        const nextMatch = payload.new as MatchData;
        if (!nextMatch?.id) return;
        matchRef.current = nextMatch;
        setMatch(nextMatch);
        if (participantRowsRef.current.length > 0) applyParticipantRows(participantRowsRef.current, nextMatch);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_turns', filter: `match_id=eq.${matchId}` }, (payload: any) => {
        const eventType = payload.eventType as string;
        const nextTurn = (eventType === 'DELETE' ? payload.old : payload.new) as MatchTurn | null;
        const previousTurn = payload.old as MatchTurn | null;
        const turnForMeta = nextTurn || previousTurn;

        if (turnForMeta?.id && turnForMeta.turn_number != null) {
          turnMetaByIdRef.current.set(turnForMeta.id, {
            phase: nextTurn?.phase ?? previousTurn?.phase ?? null,
            turn_number: nextTurn?.turn_number ?? previousTurn?.turn_number ?? null,
          });
        }

        // ── Resolution script arrival ──
        // The engine writes resolution_script on the current resolution turn
        // at the end of its tick, together with status→'resolved'. That UPDATE
        // is the signal the client uses to kick off the animation with fully
        // pre-computed truth: events, final positions, interrupt progress,
        // animation duration. Capture BEFORE the status!='active' branch below
        // nulls out activeTurn.
        if (nextTurn && nextTurn.phase === 'resolution' && (nextTurn as any).resolution_script) {
          const script = (nextTurn as any).resolution_script as ResolutionScript;
          if (resolutionScriptTurnIdRef.current !== nextTurn.id) {
            resolutionScriptRef.current = script;
            resolutionScriptTurnIdRef.current = nextTurn.id;
            // Seed the event buffer the existing animator reads from so
            // resolveBallOutcome and the RAF loop light up without needing
            // individual event-log inserts to arrive first.
            const nowIso = new Date().toISOString();
            const scriptEvents: EventLog[] = (script.events || []).map((ev, idx) => ({
              id: `script-${nextTurn.id}-${idx}`,
              event_type: ev.event_type,
              title: ev.title ?? '',
              body: ev.body ?? '',
              payload: (ev.payload ?? null) as Record<string, any> | null,
              created_at: nowIso,
            }));
            // Merge with whatever arrived via Realtime inserts already, then
            // dedupe by event_type + payload-identity to avoid double counts
            // if events also arrive via match_event_logs realtime.
            const existing = resolutionEventsRef.current;
            const merged = [...scriptEvents];
            for (const ev of existing) {
              const dup = merged.some(m => m.event_type === ev.event_type
                && JSON.stringify(m.payload ?? null) === JSON.stringify(ev.payload ?? null));
              if (!dup) merged.push(ev);
            }
            resolutionEventsRef.current = merged;
          }
        }

        if (nextTurn?.status === 'active') {
          const endsAt = new Date(nextTurn.ends_at);
          if (!isNaN(endsAt.getTime())) {
            // If resolution animation is still playing, delay applying the new turn
            // This prevents "two games" visual where old animation + new state overlap
            const applyNewTurn = () => {
              lastTurnChangeRef.current = Date.now();
              activeTurnRef.current = nextTurn;
              setActiveTurn(nextTurn);
              scheduleTurnActionsReconcile(true);
              setTimeout(() => scheduleTurnActionsReconcile(true), 500);

              // Pre-schedule engine trigger for when this phase expires
              // This ensures instant processing without waiting for cron
              if (nextTurn.ends_at) {
                const msUntilExpiry = new Date(nextTurn.ends_at).getTime() - Date.now() + 300; // +300ms buffer
                if (msUntilExpiry > 0 && msUntilExpiry < 30000) {
                  setTimeout(() => {
                    invokeMatchEngineRef.current({ action: 'process_due_matches', match_id: matchId }).catch(() => {});
                  }, msUntilExpiry);
                }
              }
            };

            if (animatedResolutionIdRef.current && animFrameRef.current) {
              // Resolution animation still running — queue the new turn. The useEffect on
              // `animating` flushes it the moment the animation ends; the safety timer below
              // guarantees we never stall if something goes wrong with the animation loop.
              pendingTurnApplyRef.current = applyNewTurn;
              if (pendingTurnSafetyTimerRef.current) clearTimeout(pendingTurnSafetyTimerRef.current);
              pendingTurnSafetyTimerRef.current = setTimeout(() => {
                pendingTurnSafetyTimerRef.current = null;
                const pending = pendingTurnApplyRef.current;
                if (pending) {
                  pendingTurnApplyRef.current = null;
                  pending();
                }
              }, MAX_TURN_APPLY_WAIT_MS);
            } else {
              applyNewTurn();
            }
          }
          return;
        }

        if ((eventType === 'UPDATE' || eventType === 'DELETE') && previousTurn?.id && activeTurnRef.current?.id === previousTurn.id) {
          activeTurnRef.current = null;
          setActiveTurn(null);
          scheduleTurnActionsReconcile();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_event_logs', filter: `match_id=eq.${matchId}` }, (payload: any) => {
        appendEventLog(payload.new as EventLog);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_actions', filter: `match_id=eq.${matchId}` }, (payload: any) => {
        const eventType = payload.eventType as string;
        const actionRow = (eventType === 'DELETE' ? payload.old : payload.new) as MatchAction | null;
        if (eventType === 'DELETE' && actionRow?.id) {
          setTurnActionsState(turnActionsRef.current.filter(action => action.id !== actionRow.id));
          scheduleTurnActionsReconcile();
          return;
        }
        applyIncomingTurnAction(actionRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants', filter: `match_id=eq.${matchId}` }, (payload: any) => {
        const eventType = payload.eventType as string;
        const row = (eventType === 'DELETE' ? payload.old : payload.new) as Participant | null;
        if (!row) return;

        const nextRows = [...participantRowsRef.current];
        const existingIndex = nextRows.findIndex(participant => participant.id === row.id);

        if (eventType === 'DELETE') {
          if (existingIndex >= 0) nextRows.splice(existingIndex, 1);
        } else if (existingIndex >= 0) {
          nextRows[existingIndex] = { ...nextRows[existingIndex], ...row };
        } else {
          nextRows.push(row);
        }

        const effectiveMatch = matchRef.current;
        if (effectiveMatch) applyParticipantRows(nextRows, effectiveMatch);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          if (realtimeHasSubscribedRef.current) {
            if (realtimeNeedsRecoveryRef.current) {
              realtimeNeedsRecoveryRef.current = false;
              void loadLiveSnapshot();
            }
            return;
          }
          realtimeHasSubscribedRef.current = true;
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeNeedsRecoveryRef.current = true;
        }
      });
    return () => {
      realtimeHasSubscribedRef.current = false;
      realtimeNeedsRecoveryRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [applyIncomingTurnAction, applyParticipantRows, appendEventLog, loadLiveSnapshot, matchId, scheduleTurnActionsReconcile, setTurnActionsState]);

  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  // Client fallback processor — ONLY fires if the cron appears stuck.
  // The cron runs every 1s. If 3s pass after phase expiry with no turn change, we nudge.
  useEffect(() => {
    if (!ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK || !matchId) return;
    if (match?.status !== 'live' || !activeTurn || phaseTimeLeft > 0) return;

    let cancelled = false;
    // Cron runs server-side every 1s, so wait ~1.2s before nudging to avoid redundant
    // client-triggered processing while cron is healthy. Retry every 2.5s after that.
    const STALE_THRESHOLD_MS = 1200;
    const RETRY_INTERVAL = 2500;

    const triggerProcessing = async () => {
      if (cancelled || phaseProcessorInFlightRef.current) return;
      const currentTurnId = activeTurnRef.current?.id;
      if (!currentTurnId) return;

      // Don't fire if a turn change happened recently (cron is working)
      const timeSinceLastChange = Date.now() - lastTurnChangeRef.current;
      if (timeSinceLastChange < STALE_THRESHOLD_MS) return;

      // Don't fire if we already tried this turn
      const lastAttempt = phaseProcessorLastAttemptRef.current;
      if (lastAttempt.turnId === currentTurnId && Date.now() - lastAttempt.at < RETRY_INTERVAL) return;

      phaseProcessorLastAttemptRef.current = { turnId: currentTurnId, at: Date.now() };
      phaseProcessorInFlightRef.current = true;
      try {
        await invokeMatchEngine({ action: 'process_due_matches', match_id: matchId });
      } catch (error) {
        console.error('Client fallback processor failed:', error);
      } finally {
        phaseProcessorInFlightRef.current = false;
      }
    };

    // Fire quickly after phase expires (don't wait for cron)
    const initialTimeout = setTimeout(() => {
      if (!cancelled) void triggerProcessing();
    }, STALE_THRESHOLD_MS);

    const interval = setInterval(() => void triggerProcessing(), RETRY_INTERVAL);

    return () => {
      cancelled = true;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [activeTurn?.id, invokeMatchEngine, match?.status, matchId, phaseTimeLeft]);

  useEffect(() => {
    if (!matchId || match?.status !== 'live' || !activeTurn || phaseTimeLeft > 0) return;

    void loadLiveSnapshot();
    scheduleTurnActionsReconcile(true);

    const interval = setInterval(() => {
      void loadLiveSnapshot();
      scheduleTurnActionsReconcile(true);
    }, 1200);

    return () => clearInterval(interval);
  }, [activeTurn?.id, activeTurn?.phase, loadLiveSnapshot, match?.status, matchId, phaseTimeLeft, scheduleTurnActionsReconcile]);

  const submitAction = async (actionType: string, participantId?: string, targetX?: number, targetY?: number, targetParticipantId?: string, payload?: Record<string, unknown>) => {
    const pid = participantId || selectedParticipantId;
    if (!matchId || !pid) return;
    // Halftime lockout — during the break only the ready-check is allowed. Any move/pass/shoot
    // would "unfreeze" the game (the server keeps ticking), so reject on the client.
    if (match?.current_half === 2 && match?.half_started_at && new Date(match.half_started_at).getTime() > Date.now()) {
      toast.info('Intervalo em andamento. Aguarde o fim ou clique em "Pronto" para pular.');
      return;
    }

    // OPTIMISTIC UPDATE — push the action into local state BEFORE the HTTP
    // round-trip so arrows / submitted badges appear instantly. The engine's
    // validation rules match the client's, so rejections are rare; on failure
    // we roll back the optimistic entry below.
    const turnAtClick = activeTurnRef.current;
    let optimisticPushed = false;
    if (turnAtClick) {
      pushOptimisticTurnAction({
        match_id: matchId,
        match_turn_id: turnAtClick.id,
        participant_id: pid,
        controlled_by_type: myRole === 'manager' ? 'manager' : 'player',
        controlled_by_user_id: user?.id ?? null,
        action_type: actionType,
        target_x: targetX ?? null,
        target_y: targetY ?? null,
        target_participant_id: targetParticipantId ?? null,
        status: 'pending',
        created_at: new Date().toISOString(),
        turn_phase: turnAtClick.phase,
        turn_number: turnAtClick.turn_number,
        payload: payload ?? null,
      });
      setSubmittedActions(prev => new Set([...prev, pid]));
      optimisticPushed = true;
    }

    const rollbackOptimistic = () => {
      if (!optimisticPushed) return;
      // Remove the optimistic row by matching the participant + turn_phase.
      // Keeps any server-confirmed action that may have landed in the meantime.
      setTurnActionsState(
        turnActionsRef.current.filter(a =>
          !(a.participant_id === pid
            && a.turn_phase === turnAtClick?.phase
            && String(a.id).startsWith('optimistic-'))
        )
      );
      setSubmittedActions(prev => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    };

    setSubmittingAction(true);
    try {
      const { response, result } = await invokeMatchEngine({
        action: 'submit_action', match_id: matchId,
        participant_id: pid, action_type: actionType,
        target_x: targetX, target_y: targetY,
        target_participant_id: targetParticipantId,
        ...(payload ? { payload } : {}),
      });
      if (!response.ok && !result?.error) {
        rollbackOptimistic();
        throw new Error('Erro ao enviar ação');
      }
      if (result.error) {
        rollbackOptimistic();
        if (result.recoverable || result.error === 'No active turn') {
          console.warn('[SUBMIT] No active turn - phase transition in progress, retrying...');
          await loadLiveSnapshot();
          toast.info('Turno em transicao, tente novamente');
        } else {
          toast.error(String(result.error));
        }
      }
      else {
        scheduleTurnActionsReconcile(true);
        // Context-aware label: 'receive' becomes DESARME when tackling,
        // AGARRAR when GK catches a shot, etc.
        let toastLabel = ACTION_LABELS[actionType] || actionType;
        if (actionType === 'move' && payload && (payload as any).no_action) {
          toastLabel = ACTION_LABELS.no_action;
        }
        if (actionType === 'receive') {
          const bhId = activeTurnRef.current?.ball_holder_participant_id;
          const bhPart = bhId ? participantsRef.current.find(pp => pp.id === bhId) : null;
          const actingPart = participantsRef.current.find(pp => pp.id === pid);
          const bhAction = turnActionsRef.current.find(a => a.participant_id === bhId);
          const isOpponent = actingPart && bhPart && actingPart.club_id !== bhPart.club_id;
          const isGK = actingPart?.field_pos === 'GK' || actingPart?.slot_position === 'GK';
          if (bhAction?.action_type === 'move' && isOpponent) toastLabel = 'DESARME';
          else if (isAnyShootAction(bhAction?.action_type ?? '') && isGK) toastLabel = 'AGARRAR';
        }
        toast.success(`✅ ${toastLabel}`);
        // Sound effects
        if (isAnyShootAction(actionType)) sounds.kick();
        else if (isAnyPassAction(actionType)) sounds.pass();
        else sounds.phaseChange();
      }
    } catch {
      rollbackOptimistic();
      toast.error('Erro ao enviar ação');
    }
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
      void loadLiveSnapshot();
    } catch { toast.error('Erro ao finalizar'); }
  };

  const exitToDashboard = () => {
    navigate(myRole === 'manager' ? '/manager' : '/player');
  };

  // Queue a substitution — will be applied on next dead ball / positioning phase
  const handleSubstitute = useCallback((outPlayerId: string, inPlayerId: string) => {
    setPendingSubstitutions(prev => {
      if (prev.some(s => s.outId === outPlayerId || s.inId === inPlayerId)) return prev;
      return [...prev, { outId: outPlayerId, inId: inPlayerId }];
    });
    toast.success('Substituição agendada! Será aplicada na próxima parada de jogo.');
  }, []);

  const handleToggleReady = useCallback(async (participantId: string, nextReady: boolean) => {
    if (!matchId) return;
    const { response, result } = await invokeMatchEngine({ action: 'toggle_ready', match_id: matchId, participant_id: participantId, ready: nextReady });
    if (!response.ok) {
      toast.error((result as any)?.error || 'Erro ao marcar pronto');
    } else if ((result as any)?.shortened) {
      toast.success('Todos prontos! Segundo tempo em 5s.');
    }
  }, [invokeMatchEngine, matchId]);

  const handleMarkTeamReady = useCallback(async (clubId: string) => {
    if (!matchId) return;
    const { response, result } = await invokeMatchEngine({ action: 'toggle_ready', match_id: matchId, mark_team_club_id: clubId, ready: true });
    if (!response.ok) {
      toast.error((result as any)?.error || 'Erro ao marcar time');
    } else if ((result as any)?.shortened) {
      toast.success('Todos prontos! Segundo tempo em 5s.');
    }
  }, [invokeMatchEngine, matchId]);

  // Ref to avoid stale closure in applyPendingSubstitutions
  const pendingSubsRef = useRef(pendingSubstitutions);
  pendingSubsRef.current = pendingSubstitutions;
  const participantsRefForSubs = useRef(participants);
  participantsRefForSubs.current = participants;

  // Apply all pending substitutions (called when dead ball / positioning detected)
  const applyPendingSubstitutions = useCallback(async () => {
    const pending = pendingSubsRef.current;
    if (pending.length === 0) return;
    const toApply = [...pending];
    setPendingSubstitutions([]);

    for (const { outId, inId } of toApply) {
      const currentParticipants = participantsRefForSubs.current;
      const outPlayer = currentParticipants.find(p => p.id === outId);
      const inPlayer = currentParticipants.find(p => p.id === inId);
      if (!outPlayer || !inPlayer) continue;
      setSubstitutedOutIds(prev => new Set([...prev, outId]));

      await Promise.all([
        supabase.from('match_participants').update({
          role_type: 'bench', pos_x: null, pos_y: null,
        }).eq('id', outId),
        supabase.from('match_participants').update({
          role_type: 'player', pos_x: outPlayer.pos_x ?? outPlayer.field_x ?? null, pos_y: outPlayer.pos_y ?? outPlayer.field_y ?? null,
        }).eq('id', inId),
      ]);

      setParticipants(prev => prev.map(p => {
        if (p.id === outId) return { ...p, role_type: 'bench', pos_x: null, pos_y: null, field_x: undefined, field_y: undefined };
        if (p.id === inId) return {
          ...p, role_type: 'player',
          pos_x: outPlayer.pos_x ?? outPlayer.field_x ?? null,
          pos_y: outPlayer.pos_y ?? outPlayer.field_y ?? null,
          field_x: outPlayer.field_x, field_y: outPlayer.field_y, field_pos: outPlayer.field_pos,
          jersey_number: outPlayer.jersey_number,
        };
        return p;
      }));

      await supabase.from('match_event_logs').insert({
        match_id: matchId,
        event_type: 'substitution',
        title: '🔄 Substituição',
        body: `${inPlayer.player_name || 'Jogador'} entra no lugar de ${outPlayer.player_name || 'Jogador'}`,
        payload: {
          out_participant_id: outId,
          out_player_name: outPlayer.player_name ?? null,
          in_participant_id: inId,
          in_player_name: inPlayer.player_name ?? null,
          club_id: outPlayer.club_id,
        },
      });

      toast.success(`Substituição: ${inPlayer.player_name?.split(' ')[0] || 'Jogador'} entrou!`);
    }
  }, [matchId]);

  // ── Apply pending substitutions when dead ball / positioning phase starts ──
  useEffect(() => {
    if (pendingSubstitutions.length > 0 && isPositioningTurn) {
      applyPendingSubstitutions();
    }
  }, [isPositioningTurn, pendingSubstitutions.length, applyPendingSubstitutions]);

  const handleActionMenuSelect = (actionType: string, participantId: string) => {
    if (actionType === 'no_action') {
      const p = participants.find(x => x.id === participantId);
      submitAction('move', participantId, p?.field_x, p?.field_y, undefined, { no_action: true });
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    if (actionType === 'receive' || actionType === 'receive_hard') {
      // `receive_hard` is the "Carrinho" variant — submitted as a normal receive with the
      // hard_tackle flag in the payload so the engine picks up the success/foul/card bias.
      const payload = actionType === 'receive_hard' ? { hard_tackle: true } : undefined;
      if (pendingInterceptChoice && pendingInterceptChoice.participantId === participantId) {
        submitAction('receive', participantId, pendingInterceptChoice.targetX, pendingInterceptChoice.targetY, undefined, payload);
      } else {
        submitAction('receive', participantId, undefined, undefined, undefined, payload);
      }
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    if (actionType === 'block') {
      // GK block (espalmar): enter drawing mode to choose deflection direction
      const p = participants.find(x => x.id === participantId);
      const isGK = p?.field_pos === 'GK' || p?.slot_position === 'GK';
      if (isGK && pendingInterceptChoice && pendingInterceptChoice.participantId === participantId) {
        // GK: enter deflection drawing mode — keep pendingInterceptChoice alive
        setDrawingAction({ type: 'block' as DrawingState['type'], fromParticipantId: participantId });
        setShowActionMenu(null);
        return;
      }
      // Non-GK block or no intercept context: submit immediately
      if (pendingInterceptChoice && pendingInterceptChoice.participantId === participantId) {
        submitAction(actionType, participantId, pendingInterceptChoice.targetX, pendingInterceptChoice.targetY);
      } else {
        submitAction(actionType, participantId);
      }
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    // One-touch actions: if player has a pendingInterceptChoice (they clicked on a trajectory),
    // pass/shoot actions become one-touch — they need a target, so enter drawing mode with the
    // intercept position as the starting point for the action
    if (pendingInterceptChoice && pendingInterceptChoice.participantId === participantId &&
        (actionType === 'pass_low' || actionType === 'pass_high' || actionType === 'pass_launch' || actionType === 'shoot_controlled' || actionType === 'shoot_power' ||
         actionType === 'header_low' || actionType === 'header_high' || actionType === 'header_controlled' || actionType === 'header_power')) {
      // Store the one-touch context — the drawing will submit with one_touch payload
      setDrawingAction({ type: actionType as DrawingState['type'], fromParticipantId: participantId });
      setShowActionMenu(null);
      // Keep pendingInterceptChoice alive so we know this is a one-touch
      return;
    }
    setDrawingAction({ type: actionType as DrawingState['type'], fromParticipantId: participantId });
    // Seed mouseFieldPct at the player's position so the drawing-state visuals
    // (player glow, action circle, zero-length arrow) render IMMEDIATELY on
    // click. Previously they waited for the first mousemove event, which felt
    // sluggish ("clicked MOVER and nothing happened until I moved the mouse").
    const draftFrom = participants.find(p => p.id === participantId);
    if (draftFrom?.field_x != null && draftFrom?.field_y != null) {
      setMouseFieldPct({ x: draftFrom.field_x, y: draftFrom.field_y });
    }
    setShowActionMenu(null);
    setPendingInterceptChoice(null);
  };

  const handleFieldClick = (pctX: number, pctY: number) => {
    // Inertia arrow confirmation: submit the DEFERRED move with the chosen
    // power. No more racing the engine's resolve — the single insert carries
    // the final inertia_power from the start.
    if (inertiaArrow) {
      const { startX, startY, dirX, dirY, maxLen } = inertiaArrow;
      const cdx = pctX - startX;
      const cdy = pctY - startY;
      const proj = cdx * dirX + cdy * dirY;
      const clampedLen = Math.max(0, Math.min(maxLen, proj));
      const power = maxLen > 0 ? Math.round((clampedLen / maxLen) * 100) : 100;

      const pending = pendingMoveRef.current;
      if (pending) {
        submitAction('move', pending.participantId, pending.targetX, pending.targetY, undefined, { inertia_power: power });
        pendingMoveRef.current = null;
      }
      setInertiaArrow(null);
      return;
    }

    if (!drawingAction) return;

    // GK block deflection drawing: submit block with deflection target in payload
    if (drawingAction.type === 'block' && pendingInterceptChoice && pendingInterceptChoice.participantId === drawingAction.fromParticipantId) {
      const deflectPayload = {
        deflect_target_x: pctX,
        deflect_target_y: pctY,
      };
      submitAction('block', drawingAction.fromParticipantId, pendingInterceptChoice.targetX, pendingInterceptChoice.targetY, undefined, deflectPayload);
      setDrawingAction(null);
      setPendingInterceptChoice(null);
      return;
    }

    const allPlayers = [...homePlayers, ...awayPlayers];
    const nearPlayer = allPlayers.find(p => {
      if (!p.field_x || !p.field_y) return false;
      const dx = p.field_x - pctX;
      const dy = p.field_y - pctY;
      return Math.sqrt(dx * dx + dy * dy) < 5;
    });

    // Determine if this is a one-touch action (player intercepting trajectory + choosing pass/shoot)
    const isOneTouch = pendingInterceptChoice && pendingInterceptChoice.participantId === drawingAction.fromParticipantId;

    if (isOneTouch) {
      // One-touch: submit a 'receive' action with a one_touch_next payload
      // The player first moves to intercept, and if they win the ball contest,
      // the pass/shot executes automatically in the next turn's phase 1
      const oneTouchNextPayload = {
        one_touch: true,
        origin_action_type: pendingInterceptChoice!.trajectoryActionType || 'pass_low',
        intercept_x: pendingInterceptChoice!.targetX,
        intercept_y: pendingInterceptChoice!.targetY,
        next_action_type: drawingAction.type,
        next_target_x: isAnyShootAction(drawingAction.type)
          ? (() => { const s = participants.find(p => p.id === drawingAction.fromParticipantId); return s ? getShootTarget(s).x : pctX; })()
          : pctX,
        next_target_y: isAnyShootAction(drawingAction.type)
          ? clamp(pctY, GOAL_Y_MIN, GOAL_Y_MAX)
          : pctY,
        next_target_participant_id: nearPlayer?.id || null,
      };
      oneTouchPendingForRef.current = drawingAction.fromParticipantId;
      // Use block or receive based on trajectory context
      const oneTouchReceiveActions = getReceiveActions(drawingAction.fromParticipantId);
      const oneTouchActionType = oneTouchReceiveActions.includes('block') && !oneTouchReceiveActions.includes('receive') ? 'block' : 'receive';
      submitAction(oneTouchActionType, drawingAction.fromParticipantId, pendingInterceptChoice!.targetX, pendingInterceptChoice!.targetY, undefined, oneTouchNextPayload);
    } else if (isAnyShootAction(drawingAction.type)) {
      const shooter = participants.find(p => p.id === drawingAction.fromParticipantId);
      if (!shooter) return;
      const goalTarget = getShootTarget(shooter);
      submitAction(drawingAction.type, drawingAction.fromParticipantId, goalTarget.x, clamp(pctY, GOAL_Y_MIN, GOAL_Y_MAX));
    } else if (isAnyPassAction(drawingAction.type)) {
      // Apply pass distance clamping
      const fromP = participants.find(p => p.id === drawingAction.fromParticipantId);
      let finalPctX = pctX, finalPctY = pctY;
      if (fromP && fromP.field_x != null && fromP.field_y != null) {
        const clamped = clampPassDistance(fromP.field_x, fromP.field_y, pctX, pctY, drawingAction.type);
        finalPctX = clamped.x;
        finalPctY = clamped.y;
      }
      submitAction(drawingAction.type, drawingAction.fromParticipantId, finalPctX, finalPctY, nearPlayer?.id);
    } else {
      // Move action - check if clicking near a ball trajectory for domination / steal
      const drawingParticipant = participants.find(p => p.id === drawingAction.fromParticipantId);
      const ballHolderNow = participants.find(p => p.id === activeTurn?.ball_holder_participant_id);
      
      // Allow tackling stationary ball carrier (no action or stayed still)
      const ballPathAction = (() => {
        if (!activeTurn?.ball_holder_participant_id) return null;
        const bhAction = turnActions.find(action => {
          if (action.participant_id !== activeTurn.ball_holder_participant_id) return false;
          return isAnyPassAction(action.action_type) || isAnyShootAction(action.action_type) || action.action_type === 'move';
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
      // When the action circle is purple (canReachBall), clicking anywhere in the circle should trigger intercept
      // Guard: the ball holder themselves cannot "intercept" their own pass/shot. They may
      // move freely during attacking_support (e.g., running to receive a return pass).
      const isBallHolderSelf = drawingAction.fromParticipantId === activeTurn?.ball_holder_participant_id;
      if (
        !isBallHolderSelf &&
        drawingParticipant &&
        ballPathAction &&
        ballHolderNow?.field_x != null &&
        ballHolderNow.field_y != null &&
        ballPathAction.target_x != null &&
        ballPathAction.target_y != null &&
        (canContestBallPath || canContestCarrierMove)
      ) {
        // Use raw field_x/y — NO ball-visual offset. Must match the purple-circle
        // render which also uses effectiveHolder.field_x/y directly. The old +1.2/-1.2
        // offset shifted the trajectory line enough to make canReach fail on click
        // even when the purple circle was visible.
        // Use mouseFieldPct (what the render saw when it decided purple/green) instead
        // of pctX/pctY so the menu-open decision is provably identical to the rendered
        // circle color — eliminates a class of bugs where the cursor moved a hair between
        // the last mousemove frame and the click event.
        const decideX = mouseFieldPct?.x ?? pctX;
        const decideY = mouseFieldPct?.y ?? pctY;
        const _bhOriginX = ballHolderNow.field_x;
        const _bhOriginY = ballHolderNow.field_y;
        const _tdx = ballPathAction.target_x - _bhOriginX;
        const _tdy = ballPathAction.target_y - _bhOriginY;
        const _tlen2 = _tdx * _tdx + _tdy * _tdy;
        const _t = _tlen2 > 0 ? clamp(((decideX - _bhOriginX) * _tdx + (decideY - _bhOriginY) * _tdy) / _tlen2, 0, 1) : 0;
        const isRedZone = (ballPathAction.action_type === 'pass_high' && _t > 0.2 && _t < 0.8) ||
                          (ballPathAction.action_type === 'pass_launch' && _t > 0.35 && _t < 0.65);
        
        // Reachability check — unified formula `d ≤ t × range × ballSpeedFactor`.
        // Exactly matches the engine's resolveBallContest and the purple-circle render
        // so "what you see is what the server accepts".
        let canReach = false;
        let interceptTargetX = pctX;
        let interceptTargetY = pctY;
        if (drawingParticipant.field_x != null && drawingParticipant.field_y != null) {
          const bfx = _bhOriginX;
          const bfy = _bhOriginY;
          const btx = ballPathAction.target_x;
          const bty = ballPathAction.target_y;
          const circleRadiusField = 9 / INNER_W * 100;

          // Candidate intercept point = projection of cursor onto the trajectory at progress _t
          const projX = bfx + _tdx * _t;
          const projY = bfy + _tdy * _t;

          // Intercept check uses BASE range (no inertia direction) to match the engine:
          // findInterceptorCandidates calls computeMaxMoveRange without targetDirection,
          // so applying inertia here would make the client stricter than the server.
          const baseRange = computeMaxMoveRange(drawingAction.fromParticipantId);
          const clickIsGK = drawingParticipant.field_pos === 'GK' || drawingParticipant.slot_position === 'GK';
          const clickActionType = ballPathAction.action_type;
          const clickIsShot = clickActionType === 'shoot_controlled' || clickActionType === 'shoot_power' || clickActionType === 'header_controlled' || clickActionType === 'header_power';
          // For GK-on-shot: pass action type 'move' (ballSpeedFactor=1) so range isn't shrunk.
          const effectiveActionType = (clickIsGK && clickIsShot) ? 'move' : clickActionType;

          // Physical reach: defender start → projection point within t × range × factor.
          // Tolerance 0.5 matches the engine's TIMING_TOLERANCE — see match-engine-lab/index.ts
          // (was 1.5; trimmed so the purple circle never lies about what the server will accept).
          const reachesTrajPoint = canReachTrajectoryPoint(
            { x: drawingParticipant.field_x, y: drawingParticipant.field_y },
            { x: bfx, y: bfy },
            { x: btx, y: bty },
            _t,
            baseRange,
            effectiveActionType,
            0.5,
          );

          // Cursor must be near the trajectory line itself (otherwise they clicked way off).
          // Use the same mouseFieldPct the render evaluated against, so a one-frame jitter
          // between mousemove and click can't disagree about purple-vs-green.
          // Threshold 1.0 matches the engine's INTERCEPT_THRESHOLD on submitted-target distance.
          const distToTraj = pointToSegmentDistance(decideX, decideY, bfx, bfy, btx, bty);
          const cursorNearTraj = distToTraj <= 1.0;

          canReach = reachesTrajPoint && cursorNearTraj;
          if (typeof window !== 'undefined' && (window as any).__bdo_reach_log) {
            const mdx = decideX - drawingParticipant.field_x;
            const mdy = decideY - drawingParticipant.field_y;
            console.log('[REACH][click]', { _t: _t.toFixed(2), d: Math.hypot(mdx, mdy).toFixed(1), baseRange: baseRange.toFixed(1), factor: getBallSpeedFactor(effectiveActionType), distToTraj: distToTraj.toFixed(2), reaches: reachesTrajPoint, near: cursorNearTraj });
          }

          // When accepted but the click itself was slightly off the line, snap to the line.
          if (canReach) {
            const distClickToTraj = pointToSegmentDistance(pctX, pctY, bfx, bfy, btx, bty);
            if (distClickToTraj > INTERCEPT_RADIUS) {
              interceptTargetX = projX;
              interceptTargetY = projY;
            }
          }
        }
        
        // Tackle cooldown: if this player failed a tackle last turn, block tackle attempts (move trajectory = tackle)
        const isTackleAttempt = ballPathAction.action_type === 'move';
        const blockedByTackleCooldown = isTackleAttempt && tackleBlockedIds.has(drawingAction.fromParticipantId);

        if (!isRedZone && canReach && !blockedByTackleCooldown) {
          setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: interceptTargetX, targetY: interceptTargetY, trajectoryActionType: ballPathAction.action_type, trajectoryProgress: _t });
          setShowActionMenu(drawingAction.fromParticipantId);
          setDrawingAction(null);
          setMouseFieldPct(null);
          return;
        }
      }
      
      // Check if clicking during loose ball — if player can reach ball (purple circle), ANY click opens intercept.
      // Reach formula MUST match the purple-circle render at the bottom of the SVG (search
      // "Loose-ball scenario: no trajectory, just a ball at a fixed point"). Both the
      // player-range check AND the cursor-on-ball check must mirror the render, otherwise
      // the click can fire dominate when the user only sees the green circle (e.g. cursor
      // far from the ball) — that's the "dominei sem chegar perto" bug.
      if (isLooseBall && looseBallPos) {
        const dp = participantsRef.current.find(p => p.id === drawingAction.fromParticipantId);
        if (dp && dp.field_x != null && dp.field_y != null) {
          const FIELD_Y_SCALE = INNER_H / INNER_W;
          const decideX = mouseFieldPct?.x ?? pctX;
          const decideY = mouseFieldPct?.y ?? pctY;
          const baseRange = computeMaxMoveRange(drawingAction.fromParticipantId);
          const circleRadiusField = 9 / INNER_W * 100;

          // Path A — cursor on the inertia arrow (ball rolling). Aligns with the
          // purple-circle render's trajectory branch. The engine's
          // findLooseBallClaimer now checks distance to the full ball-rolling
          // segment, so we can submit the projection point as target and the
          // server will accept it.
          if (ballInertiaDir) {
            const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
            const bfx = looseBallPos.x;
            const bfy = looseBallPos.y;
            const btx = looseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY;
            const bty = looseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY;
            const tdx = btx - bfx;
            const tdy = bty - bfy;
            const tlen2 = tdx * tdx + tdy * tdy;
            if (tlen2 > 0.01) {
              const t = clamp(((decideX - bfx) * tdx + (decideY - bfy) * tdy) / tlen2, 0, 1);
              const projX = bfx + tdx * t;
              const projY = bfy + tdy * t;
              const distToTraj = pointToSegmentDistance(decideX, decideY, bfx, bfy, btx, bty);
              const reachesTrajPoint = canReachTrajectoryPoint(
                { x: dp.field_x, y: dp.field_y },
                { x: bfx, y: bfy }, { x: btx, y: bty },
                t, baseRange, 'pass_low', 0.5,
              );
              if (distToTraj <= 1.0 && reachesTrajPoint) {
                setPendingInterceptChoice({
                  participantId: drawingAction.fromParticipantId,
                  targetX: projX,
                  targetY: projY,
                });
                setShowActionMenu(drawingAction.fromParticipantId);
                setDrawingAction(null);
                setMouseFieldPct(null);
                return;
              }
            }
          }

          // Path B — cursor directly on the ball (no inertia or ball already stopped).
          // Mirrors the render's fixed-point branch + engine's findLooseBallClaimer
          // point check when ballEndPos isn't passed.
          const dxP = dp.field_x - looseBallPos.x;
          const dyP = (dp.field_y - looseBallPos.y) * FIELD_Y_SCALE;
          const distPlayerToBall = Math.sqrt(dxP * dxP + dyP * dyP);
          const cxP = decideX - looseBallPos.x;
          const cyP = (decideY - looseBallPos.y) * FIELD_Y_SCALE;
          const distCursorToBall = Math.sqrt(cxP * cxP + cyP * cyP);
          if (distPlayerToBall <= baseRange + 0.5
              && distCursorToBall <= circleRadiusField + INTERCEPT_RADIUS + 1) {
            setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: looseBallPos.x, targetY: looseBallPos.y });
            setShowActionMenu(drawingAction.fromParticipantId);
            setDrawingAction(null);
            setMouseFieldPct(null);
            return;
          }
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
          const isSecondHalf = (match?.current_half ?? 1) >= 2;
          // In 2nd half, home is on the RIGHT side, away on LEFT
          const ownHalfIsLeft = isHome ? !isSecondHalf : isSecondHalf;
          if (ownHalfIsLeft) mx = Math.min(mx, 49);
          else mx = Math.max(mx, 51);
          // Center circle restriction for opponents (defending team during kickoff)
          const possClubId = activeTurn?.possession_club_id;
          const isDefending = moveFrom.club_id !== possClubId;
          if (isDefending) {
            const CENTER_CIRCLE_RADIUS = 10; // matches engine constraint
            const distToCenter = Math.sqrt((mx - 50) * (mx - 50) + (my - 50) * (my - 50));
            if (distToCenter < CENTER_CIRCLE_RADIUS) {
              // Push out of center circle
              const angle = Math.atan2(my - 50, mx - 50);
              mx = 50 + Math.cos(angle) * CENTER_CIRCLE_RADIUS;
              my = 50 + Math.sin(angle) * CENTER_CIRCLE_RADIUS;
              // Re-apply half restriction
              if (ownHalfIsLeft) mx = Math.min(mx, 49);
              else mx = Math.max(mx, 51);
            }
          }
        }
      } else if (moveFrom && moveFrom.field_x != null && moveFrom.field_y != null) {
        const dx = pctX - moveFrom.field_x;
        const dy = pctY - moveFrom.field_y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const direction = dist > 0.1 ? { x: dx, y: dy } : undefined;
        let maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, direction);
        // Apply ballSpeedFactor when there's an active ball trajectory (match ball preview limit)
        if ((activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && ballTrajectoryAction?.action_type) {
          maxRange = applyBallSpeedFactor(maxRange, drawingAction.fromParticipantId, ballTrajectoryAction.action_type);
        }
        if (dist > maxRange) {
          const scale = maxRange / dist;
          mx = moveFrom.field_x + dx * scale;
          my = moveFrom.field_y + dy * scale;
        }
        console.log(`[PHYSICS] Move submitted: player=${drawingAction.fromParticipantId.slice(0,8)} dist=${dist.toFixed(1)} maxRange=${maxRange.toFixed(1)} clamped=${dist > maxRange} inertia=${direction ? 'yes' : 'no'}`);
      }
      // DEFER the submit until the inertia arrow is confirmed (or safety
      // net auto-flush before phase end). Positioning moves skip the arrow
      // and submit immediately.
      const drawnParticipantId = drawingAction.fromParticipantId;
      if (isPositioningTurn) {
        submitAction('move', drawnParticipantId, mx, my, undefined, { inertia_power: 100 });
      } else if (moveFrom && moveFrom.field_x != null && moveFrom.field_y != null) {
        // Push an optimistic row so the move arrow renders immediately
        // (visual feedback) while we wait for the inertia confirmation.
        const turnAtClick = activeTurnRef.current;
        if (turnAtClick) {
          pushOptimisticTurnAction({
            match_id: matchId!,
            match_turn_id: turnAtClick.id,
            participant_id: drawnParticipantId,
            controlled_by_type: myRole === 'manager' ? 'manager' : 'player',
            controlled_by_user_id: user?.id ?? null,
            action_type: 'move',
            target_x: mx,
            target_y: my,
            target_participant_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
            turn_phase: turnAtClick.phase,
            turn_number: turnAtClick.turn_number,
            payload: { inertia_power: 100 },
          });
          setSubmittedActions(prev => new Set([...prev, drawnParticipantId]));
        }
        pendingMoveRef.current = { participantId: drawnParticipantId, targetX: mx, targetY: my };

        const adx = mx - moveFrom.field_x;
        const ady = my - moveFrom.field_y;
        const alen = Math.sqrt(adx * adx + ady * ady);
        if (alen > 0.3) {
          setInertiaArrow({
            participantId: drawnParticipantId,
            startX: mx,
            startY: my,
            dirX: adx / alen,
            dirY: ady / alen,
            maxLen: alen,
          });
        } else {
          // Zero-length move (click on current position) — submit immediately.
          submitAction('move', drawnParticipantId, mx, my, undefined, { inertia_power: 100 });
          pendingMoveRef.current = null;
        }
      }
    }
    setDrawingAction(null);
    setMouseFieldPct(null);
  };

  const handlePlayerClick = (participantId: string) => {
    if (isPhaseProcessing) return;

    // Inertia arrow is active → treat the click as a slider confirmation at
    // the clicked player's field position. Previously this opened the clicked
    // player's action menu, stealing the click the user intended for the slider.
    if (inertiaArrow) {
      const p = participants.find(x => x.id === participantId);
      if (p && p.field_x != null && p.field_y != null) {
        handleFieldClick(p.field_x, p.field_y);
      }
      return;
    }

    if (drawingAction) {
      const p = participants.find(x => x.id === participantId);
      // Pass/shot targeting a teammate: submit to their position.
      if (p && isAnyPassAction(drawingAction.type)) {
        submitAction(drawingAction.type, drawingAction.fromParticipantId, p.field_x, p.field_y, participantId);
        setDrawingAction(null);
        setMouseFieldPct(null);
        return;
      }
      // Any other in-progress draw (move/block/intercept): let the SVG click handler
      // decide (it does purple-circle detection + move submission). Calling into the
      // player-selection branch below would open an action menu for the clicked player,
      // which is what was happening when the ball hugged the ball holder and the user's
      // intercept click was being hijacked as "click the ball holder, open their menu".
      return;
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

        // Block manual menu open if one-touch action is already set for this participant
        const hasOneTouchAction = turnActions.some(a =>
          a.participant_id === participantId &&
          a.payload && typeof a.payload === 'object' && (a.payload as any).one_touch_executed === true
        );
        if (hasOneTouchAction) return;

        if (
          (phase === 'ball_holder' && isBH) ||
          (phase === 'attacking_support' && isAttacking) ||
          (phase === 'defending_response' && !isAttacking)
        ) {
          // Auto-detect trajectory overlap before opening menu.
          tryAutoDetectIntercept(participantId);
          setShowActionMenu(participantId);
        }
      }
    }
  };

  // ─── Filter bot arrows when human already acted ───────────────
  // Optimistic ids are scoped to the current activeTurn.phase — a user
  // submitting in attacking_support shouldn't retroactively erase the bot's
  // ball_holder arrow for the same participant.
  const visibleActions = useMemo(() => {
    const humanActionedIds = new Set<string>();
    for (const pid of submittedActions) {
      humanActionedIds.add(pid);
    }
    return filterEffectiveTurnActions(turnActions, humanActionedIds, activeTurn?.phase ?? null);
  }, [turnActions, submittedActions, activeTurn?.phase]);

  // ─── Animation for phase 4 ─────────────────────────────────

  const getEffectiveActionTarget = useCallback((
    action: MatchAction,
    start?: { x: number; y: number },
    actions: MatchAction[] = turnActionsRef.current,
  ) => {
    if (action.target_x == null || action.target_y == null) return null;
    if (action.action_type !== 'move' && action.action_type !== 'receive') {
      return { x: action.target_x, y: action.target_y };
    }

    const participant = participantsRef.current.find(p => p.id === action.participant_id);
    const startX = start?.x ?? participant?.field_x ?? participant?.pos_x ?? 50;
    const startY = start?.y ?? participant?.field_y ?? participant?.pos_y ?? 50;
    const hasDeferredBallAction = action.action_type === 'move'
      && action.participant_id === activeTurnRef.current?.ball_holder_participant_id
      && actions.some(candidate => candidate.participant_id === action.participant_id && (
        candidate.action_type === 'pass_low'
        || candidate.action_type === 'pass_high'
        || candidate.action_type === 'pass_launch'
        || candidate.action_type === 'shoot'
        || candidate.action_type === 'shoot_controlled'
        || candidate.action_type === 'shoot_power'
      ));
    const maxRange = computeMaxMoveRange(action.participant_id, undefined, hasDeferredBallAction ? 0.50 : undefined);
    const dx = action.target_x - startX;
    const dy = action.target_y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= maxRange || dist === 0) {
      return { x: action.target_x, y: action.target_y };
    }

    const scale = maxRange / dist;
    return {
      x: startX + dx * scale,
      y: startY + dy * scale,
    };
  }, [computeMaxMoveRange]);


  useEffect(() => {
    if (!activeTurn || activeTurn.phase !== 'resolution') return;
    if (animatedResolutionIdRef.current === activeTurn.id) return;

    // ── Wait for engine to finish resolving BEFORE starting animation ──
    // Primary signal: a resolution_script arrived on this turn via Realtime
    // (the engine emits it at the end of the defense processing). When that
    // lands, we kick off immediately — no MIN_WAIT_MS gate, no event-log
    // polling. Legacy fallback: any resolution event in the buffer still
    // triggers an animation (for builds without the script). MAX_WAIT_MS
    // caps the wait so a missing signal never hangs the UI.
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const pollStartTime = Date.now();
    const MAX_WAIT_MS = 2500;
    const MIN_WAIT_MS = 250;

    const scriptReadyForTurn = () =>
      resolutionScriptRef.current != null
      && resolutionScriptTurnIdRef.current === activeTurn.id;

    const hasResolutionSignal = () => {
      if (scriptReadyForTurn()) return true;
      const resEvents = resolutionEventsRef.current;
      if (resEvents.length > 0) return true;
      return false;
    };

    const tryStart = () => {
      if (animatedResolutionIdRef.current === activeTurn.id) {
        if (pollInterval) clearInterval(pollInterval);
        return;
      }
      const elapsed = Date.now() - pollStartTime;
      const scriptReady = scriptReadyForTurn();
      // Script is authoritative — start immediately. Otherwise fall back to
      // the event-buffer gate with a MIN_WAIT_MS debounce.
      const ready = scriptReady || (hasResolutionSignal() && elapsed >= MIN_WAIT_MS);
      const timedOut = elapsed >= MAX_WAIT_MS;
      if (!ready && !timedOut) return;

      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

      // The resolution_script (when present) is server-authoritative for both
      // the turn's starting positions and its final positions. Prefer it over
      // the client's participant state to avoid two kinds of drift:
      //   (a) participantsRef may be mid-update if realtime is lagging, so the
      //       "start" snapshot could be a stale or half-applied state;
      //   (b) the client recomputes move targets with a simpler maxRange
      //       formula that omits the engine's directional-inertia multiplier,
      //       so the animation finish would differ from the DB end position.
      // Falling back to the local participantsRef preserves behaviour on
      // builds that haven't deployed the script yet.
      const script = resolutionScriptRef.current;
      const currentParticipants = participantsRef.current;
      const snapshot = script?.initial_positions
        ? Object.fromEntries(
            Object.entries(script.initial_positions).map(([id, pos]) => [id, { x: pos.x, y: pos.y }])
          )
        : Object.fromEntries(
            currentParticipants
              .filter(p => p.field_x != null && p.field_y != null)
              .map(p => [p.id, { x: p.field_x as number, y: p.field_y as number }])
          );

      setResolutionStartPositions(snapshot);
      animatedResolutionIdRef.current = activeTurn.id;
      // Lock the interceptor for the full duration of this resolution so late events
      // cannot change the ball's trajectory mid-flight (prevents visual teleport).
      animationInterceptorSnapshotRef.current = interceptorActionRef.current;
      setAnimating(true);
      setAnimProgress(0);
      animProgressRef.current = 0;

      // Read the interruption progress emitted by the engine (turn_interrupted event).
      // When the play was cut short at T% of the trajectory, every planned move caps
      // at the same T in animation time — mirrors the engine's position scaling so
      // the final animated pose matches the DB state without any tail-end teleport.
      let interruptT: number | null = null;
      for (const ev of resolutionEventsRef.current) {
        if (ev.event_type === 'turn_interrupted') {
          const p = (ev.payload ?? {}) as Record<string, any>;
          if (typeof p.progress === 'number' && p.progress >= 0 && p.progress <= 1) {
            interruptT = p.progress;
          }
        }
      }
      interruptProgressRef.current = interruptT;

      // Helper: compute eased position for a participant during animation
      const computeAnimPos = (pId: string, raw: number, actionsSnap: MatchAction[]) => {
        const startPos = snapshot[pId];
        if (!startPos) return null;
        const moveAction = actionsSnap.find(
          a => a.participant_id === pId && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null
        );
        if (!moveAction || moveAction.target_x == null || moveAction.target_y == null) {
          return startPos;
        }

        // Scale player arrival by move distance (short moves arrive early)
        const targetX = moveAction.target_x;
        const targetY = moveAction.target_y;
        const moveDist = getFieldMoveDist(targetX - startPos.x, targetY - startPos.y);
        const MAX_RANGE_APPROX = 6;
        const arrivalFraction = Math.max(0.15, Math.min(1, moveDist / MAX_RANGE_APPROX));
        // Clamp the time axis to the point where the play was interrupted. A player
        // whose arrivalFraction ≤ interruptT still finishes (timing constraint already
        // ensures the tackler / interceptor covers their distance within T).
        const cappedRaw = interruptT != null ? Math.min(raw, interruptT) : raw;
        const scaledRaw = Math.min(1, cappedRaw / arrivalFraction);

        let t: number;
        if (scaledRaw < 0.3) {
          const seg = scaledRaw / 0.3;
          t = seg * seg * 0.3;
        } else if (scaledRaw < 0.8) {
          const seg = (scaledRaw - 0.3) / 0.5;
          t = 0.3 + seg * 0.55;
        } else {
          const seg = (scaledRaw - 0.8) / 0.2;
          t = 0.85 + (1 - Math.pow(1 - seg, 2)) * 0.15;
        }
        // Prefer the server-authoritative final position from the script —
        // that's exactly where the engine wrote the player. Falling back to
        // the client's local clamp is only for builds without a script.
        const scriptFinal = script?.final_positions?.[pId];
        const effectiveTarget = scriptFinal
          ? { x: scriptFinal.x, y: scriptFinal.y }
          : getEffectiveActionTarget(moveAction, startPos, actionsSnap);
        return {
          x: startPos.x + ((effectiveTarget?.x ?? targetX) - startPos.x) * t,
          y: startPos.y + ((effectiveTarget?.y ?? targetY) - startPos.y) * t,
        };
      };

      // Helper: compute ball position during animation using refs
      const computeAnimBallPos = (raw: number, actionsSnap: MatchAction[]) => {
        const bhId = activeTurn?.ball_holder_participant_id ?? null;
        const bhPart = bhId ? participantsRef.current.find(p => p.id === bhId) : null;

        if (!bhPart) {
          // Loose ball with inertia. The server-authoritative endpoint is
          // resolution_script.ball_end_pos — this is where the engine actually
          // stopped the ball, which may be SHORT of the full inertia endpoint
          // when a player claimed it mid-flight. Using the raw inertia endpoint
          // made the ball visually roll past the claimer even though the engine
          // had already awarded possession, producing the "ball goes through
          // the player but next turn he has it" effect the user reported.
          const ballEnd = script?.ball_end_pos
            ? { x: script.ball_end_pos.x, y: script.ball_end_pos.y }
            : null;
          if (ballEnd && carriedLooseBallPos) {
            const ballEaseK = 3;
            const expDecay = 1 - Math.exp(-ballEaseK * raw);
            const normFactor = 1 - Math.exp(-ballEaseK);
            const t = expDecay / normFactor;
            return {
              x: carriedLooseBallPos.x + (ballEnd.x - carriedLooseBallPos.x) * t,
              y: carriedLooseBallPos.y + (ballEnd.y - carriedLooseBallPos.y) * t,
            };
          }
          if (ballInertiaDir && carriedLooseBallPos) {
            // Legacy fallback (builds without a resolution_script). Mirrors
            // engine decay: 0.15 first loose turn, 0.08 subsequent.
            const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
            const endX = carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY;
            const endY = carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY;
            const ballEaseK = 3;
            const expDecay = 1 - Math.exp(-ballEaseK * raw);
            const normFactor = 1 - Math.exp(-ballEaseK);
            const t = expDecay / normFactor;
            return {
              x: carriedLooseBallPos.x + (endX - carriedLooseBallPos.x) * t,
              y: carriedLooseBallPos.y + (endY - carriedLooseBallPos.y) * t,
            };
          }
          return null;
        }

        const holderPos = computeAnimPos(bhPart.id, raw, actionsSnap);
        const startPos = snapshot[bhPart.id] ?? { x: bhPart.field_x ?? 50, y: bhPart.field_y ?? 50 };
        const ballStartX = startPos.x + 1.2;
        const ballStartY = startPos.y - 1.2;
        const defaultBallPos = holderPos ? { x: holderPos.x + 1.2, y: holderPos.y - 1.2 } : { x: ballStartX, y: ballStartY };

        const bhAllActions = actionsSnap
          .filter(a => a.participant_id === bhPart.id)
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type)) || bhAllActions[0];
        if (!ballAction) return defaultBallPos;

        // Linear interpolation (ported from Solo Lab — constant ball speed, arc provides naturalism)
        const t = raw;

        // Resolve the authoritative ball outcome using engine events. This is the source
        // of truth for where the ball ends up — the action-based prediction was wrong in
        // cases like: user submitted `receive` that succeeded (engine said intercepted)
        // but animation still showed the pass completing, or user submitted a tackle
        // that failed (engine said dribble) but animation showed the ball stopping.
        const outcome = resolveBallOutcome(actionsSnap, resolutionEventsRef.current, bhPart.id);
        const interceptAction = outcome.interceptor
          ?? (outcome.hasConclusiveEvent
            ? null
            : (animationInterceptorSnapshotRef.current
              ?? interceptorActionRef.current
              ?? actionsSnap.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null)
              ?? null));

        if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
          const effectiveTarget = getEffectiveActionTarget(ballAction, startPos, actionsSnap);
          const endX = effectiveTarget?.x ?? ballAction.target_x;
          const endY = effectiveTarget?.y ?? ballAction.target_y;
          const dx = endX - startPos.x;
          const dy = endY - startPos.y;
          // Ball offset is in the direction of dribble (in front of player), not a fixed corner
          const dribLen = Math.sqrt(dx * dx + dy * dy);
          // Ball glued to the dribbler's centre — no offset, so the ball visual
          // stays inside the player circle during a dribble (user spec).
          const OFFSET = 0;
          const offX = 0;
          const offY = 0;
          void dribLen;
          // Engine truth for move: `dribble` = dribbler kept ball (ignore tacklers),
          // `tackle` = tackler took it (ball stops at tackler). Only fall back to the
          // action-based interceptor when no conclusive event exists yet.
          if (outcome.dribbled) {
            return holderPos ? { x: holderPos.x + offX, y: holderPos.y + offY } : defaultBallPos;
          }
          if ((outcome.tackled || !outcome.hasConclusiveEvent) && interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
            const len2 = dx * dx + dy * dy;
            const interceptT = len2 > 0 ? clamp(((interceptAction.target_x - startPos.x) * dx + (interceptAction.target_y - startPos.y) * dy) / len2, 0, 1) : 1;
            const effectiveT = Math.min(t, interceptT);
            return { x: startPos.x + dx * effectiveT + offX, y: startPos.y + dy * effectiveT + offY };
          }
          return holderPos ? { x: holderPos.x + offX, y: holderPos.y + offY } : defaultBallPos;
        }

        const isBallPass = isPassAction(ballAction.action_type) || (isHeaderAction(ballAction.action_type) && !isAnyShootAction(ballAction.action_type));
        const isBallShoot = isShootAction(ballAction.action_type) || isAnyShootAction(ballAction.action_type);
        if ((isBallPass || isBallShoot) && ballAction.target_x != null && ballAction.target_y != null) {
          if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
            // Ball animates straight to the interceptor's target point and stops there —
            // matches where fbp places it at animation end, so no forward jump visible.
            const endX = interceptAction.target_x;
            const endY = interceptAction.target_y;
            return { x: ballStartX + (endX - ballStartX) * t, y: ballStartY + (endY - ballStartY) * t };
          }
          if (isBallShoot) {
            const isHome = bhPart.club_id === matchRef.current?.home_club_id;
            const isSecondHalf = (matchRef.current?.current_half ?? 1) >= 2;
            const attacksRight = isHome ? !isSecondHalf : isSecondHalf;
            const goalX = attacksRight ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT;
            return { x: ballStartX + (goalX - ballStartX) * t, y: ballStartY + (ballAction.target_y - ballStartY) * t };
          }
          return { x: ballStartX + (ballAction.target_x - ballStartX) * t, y: ballStartY + (ballAction.target_y - ballStartY) * t };
        }
        return defaultBallPos;
      };

      // Helper: compute ball arc lift (ported from Solo Lab — arc scales with distance)
      const computeBallArcLift = (raw: number, actionsSnap: MatchAction[]) => {
        const bhId = activeTurn?.ball_holder_participant_id ?? null;
        const bhPart = bhId ? participantsRef.current.find(p => p.id === bhId) : null;
        if (!bhPart) return 0;
        const bhAllActions = actionsSnap
          .filter(a => a.participant_id === bhPart.id)
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type));
        if (!ballAction) return 0;
        const actionType = ballAction.action_type;
        // Arc height scales with pass distance for more naturalism
        const sp = snapshot[bhPart.id] ?? { x: bhPart.field_x ?? 50, y: bhPart.field_y ?? 50 };
        const bDist = ballAction.target_x != null && ballAction.target_y != null
          ? Math.sqrt((ballAction.target_x - sp.x) ** 2 + (ballAction.target_y - sp.y) ** 2)
          : 20;
        const distScale = Math.max(0.5, Math.min(2, bDist / 30)); // normalize around 30 units
        let arcHeight = 0;
        if (actionType === 'pass_high' || actionType === 'header_high') arcHeight = 25 * distScale;
        else if (actionType === 'pass_launch') arcHeight = 38 * distScale;
        else if (actionType === 'shoot_controlled' || actionType === 'header_controlled') arcHeight = 12 * distScale;
        else if (actionType === 'shoot_power' || actionType === 'header_power') arcHeight = 7 * distScale;
        else return 0;
        return Math.sin(raw * Math.PI) * arcHeight;
      };

      // Animation duration scales with distance + action type (ported from Solo Lab)
      const actionsForDuration = turnActionsRef.current;
      const bhAction = actionsForDuration.find(a => a.participant_id === (activeTurn?.ball_holder_participant_id ?? '') && (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type)));
      const bhActionType = bhAction?.action_type || 'move';
      const bhPartForDur = activeTurn?.ball_holder_participant_id ? participantsRef.current.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
      const bhStartForDur = bhPartForDur ? (snapshot[bhPartForDur.id] ?? { x: bhPartForDur.field_x ?? 50, y: bhPartForDur.field_y ?? 50 }) : { x: 50, y: 50 };
      const ballDist = bhAction?.target_x != null && bhAction?.target_y != null
        ? Math.sqrt((bhAction.target_x - bhStartForDur.x) ** 2 + (bhAction.target_y - bhStartForDur.y) ** 2)
        : 30; // fallback
      let duration: number;
      switch (bhActionType) {
        case 'pass_low': case 'header_low': duration = Math.round(420 + ballDist * 16); break;
        case 'pass_high': case 'header_high': duration = Math.round(620 + ballDist * 18); break;
        case 'pass_launch': duration = Math.round(760 + ballDist * 19); break;
        case 'shoot_controlled': case 'header_controlled': duration = Math.round(380 + ballDist * 11); break;
        case 'shoot_power': case 'header_power': duration = Math.round(260 + ballDist * 7); break;
        default: duration = Math.round(500 + ballDist * 14); break;
      }
      duration = Math.max(400, Math.min(duration, 2500)); // clamp 400ms-2500ms
      let startTime: number | null = null;

      const animate = (now: number) => {
        if (startTime === null) startTime = now;
        const progress = Math.min(1, (now - startTime) / duration);
        animProgressRef.current = progress;

        // --- DOM manipulation for player positions during animation via transform ---
        const actionsSnap = turnActionsRef.current;
        const allParts = participantsRef.current;
        for (const p of allParts) {
          if (p.field_x == null || p.field_y == null) continue;
          const animPos = computeAnimPos(p.id, progress, actionsSnap);
          if (!animPos) continue;
          const gEl = playerGroupRefsMap.current.get(p.id);
          if (gEl) {
            const baseX = parseFloat(gEl.getAttribute('data-base-x') || '0');
            const baseY = parseFloat(gEl.getAttribute('data-base-y') || '0');
            const svgPos = { x: PAD + (animPos.x / 100) * INNER_W, y: PAD + (animPos.y / 100) * INNER_H };
            gEl.setAttribute('transform', `translate(${svgPos.x - baseX},${svgPos.y - baseY})`);
          }
        }

        // Update ball position via DOM transform
        const ballGEl = ballGroupRef.current;
        if (ballGEl) {
          const ballPos = computeAnimBallPos(progress, actionsSnap);
          if (ballPos) {
            const arcLift = computeBallArcLift(progress, actionsSnap);
            const bsvg = { x: PAD + (ballPos.x / 100) * INNER_W, y: PAD + (ballPos.y / 100) * INNER_H };
            const baseBallX = parseFloat(ballGEl.getAttribute('data-base-x') || '0');
            const baseBallY = parseFloat(ballGEl.getAttribute('data-base-y') || '0');
            ballGEl.setAttribute('transform', `translate(${bsvg.x - baseBallX},${bsvg.y - baseBallY - arcLift})`);
          }
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Final state update via React setState
          setAnimProgress(1);
          animProgressRef.current = 1;
          // Animation done: lock final positions
          const latestActions = turnActionsRef.current;
          const finals: Record<string, { x: number; y: number }> = {};
          const bhId = activeTurn?.ball_holder_participant_id ?? null;
          
          const ballHolderHasBallAction = Boolean(
            bhId && latestActions.some(action => action.participant_id === bhId && (
              isPassAction(action.action_type) || isShootAction(action.action_type) || isHeaderAction(action.action_type)
            ))
          );

          for (const p of participantsRef.current) {
            // Prefer server-authoritative final position from resolution_script.
            // This avoids the silent teleport at animation end that happened when
            // the client's locally-recomputed target differed from the engine's
            // result (engine applies directional-inertia multiplier on maxRange;
            // client's getEffectiveActionTarget does not). Also fixes the stored
            // inertia direction that was based on client-clamped endpoints.
            const scriptFinal = script?.final_positions?.[p.id];
            if (scriptFinal) {
              finals[p.id] = { x: scriptFinal.x, y: scriptFinal.y };
              continue;
            }
            // Both 'move' and 'receive' actions cause player to end at target
            const action = latestActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
            if (action && action.target_x != null && action.target_y != null) {
              const effectiveTarget = getEffectiveActionTarget(action, snapshot[p.id], latestActions);
              if (effectiveTarget) {
                // Clamp final pose to the interruption point so the animator doesn't
                // rest at a different spot than the engine wrote to the DB.
                const startPos = snapshot[p.id];
                if (interruptT != null && interruptT < 1 && startPos) {
                  const dx = effectiveTarget.x - startPos.x;
                  const dy = effectiveTarget.y - startPos.y;
                  const moveDist = getFieldMoveDist(dx, dy);
                  const MAX_RANGE_APPROX = 6;
                  const arrivalFraction = Math.max(0.15, Math.min(1, moveDist / MAX_RANGE_APPROX));
                  const timeScale = Math.min(1, interruptT / arrivalFraction);
                  finals[p.id] = {
                    x: startPos.x + dx * timeScale,
                    y: startPos.y + dy * timeScale,
                  };
                } else {
                  finals[p.id] = effectiveTarget;
                }
              }
            } else {
              const startPos = snapshot[p.id];
              if (startPos) finals[p.id] = startPos;
            }
          }

          setFinalPositions(finals);

          // Store movement directions for inertia system.
          // Use the player's INTENT (action target − snapshot) rather than
          // `finals - snapshot`. The engine's bump-pass collision handler can
          // shove a player perpendicular to their chosen direction; using the
          // post-bump endpoint as inertia would store the bump direction, so a
          // user who clicked "up" but got nudged left would see their next-turn
          // inertia arrow pointing left, which is not what they chose. We only
          // care about angle here (dirMult ignores magnitude), so it's safe to
          // use the unclamped target.
          // Falls back to (finals − snapshot) for participants without a move
          // action this turn (e.g. positioning rows, or a teammate's idle).
          const newDirections: Record<string, { x: number; y: number }> = { ...prevDirectionsRef.current };
          for (const p of participantsRef.current) {
            const sp = snapshot[p.id];
            const endPos = finals[p.id];
            if (!sp || !endPos) {
              delete newDirections[p.id];
              continue;
            }
            const moveAction = latestActions.find(a =>
              a.participant_id === p.id
              && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block')
              && a.target_x != null && a.target_y != null
            );
            const ddx = moveAction
              ? Number(moveAction.target_x) - sp.x
              : endPos.x - sp.x;
            const ddy = moveAction
              ? Number(moveAction.target_y) - sp.y
              : endPos.y - sp.y;
            // Decide "stayed still" against the ACTUAL displacement so a click
            // on the player's own spot still drops the entry.
            const actualDisp = Math.sqrt((endPos.x - sp.x) ** 2 + (endPos.y - sp.y) ** 2);
            if (actualDisp > 0.5 && Math.sqrt(ddx * ddx + ddy * ddy) > 0.5) {
              newDirections[p.id] = { x: ddx, y: ddy };
            } else {
              delete newDirections[p.id]; // Stayed still — reset inertia
            }
          }
          prevDirectionsRef.current = newDirections;
          // Store each participant's inertia_power from their move action payload
          // so next turn's computeMaxMoveRange can scale the directional bonus/penalty.
          // MERGE — don't replace the whole ref. If this resolution had no move for
          // a player (e.g., positioning phase or they didn't act), keep the PREVIOUS
          // value. Replacing the whole ref would reset to {} → default 100%.
          const updatedPowers = { ...inertiaPowerRef.current };
          for (const a of latestActions) {
            if (a.action_type === 'move' && a.payload && typeof a.payload === 'object') {
              const pw = (a.payload as any).inertia_power;
              if (typeof pw === 'number') updatedPowers[a.participant_id] = pw;
            }
          }
          inertiaPowerRef.current = updatedPowers;
          if (typeof window !== 'undefined' && (window as any).__bdo_inertia_log) {
            console.log('[INERTIA STORE] turn', activeTurn?.turn_number, Object.entries(newDirections).map(
              ([id, d]) => `${id.slice(0, 8)}=(${d.x.toFixed(1)},${d.y.toFixed(1)})`
            ).join(' | '));
          }
          
           // Compute final ball position (bhId already declared above)
           // Source of truth: engine events. See resolveBallOutcome.
           const finalOutcome = bhId
             ? resolveBallOutcome(latestActions, resolutionEventsRef.current, bhId)
             : null;
           const interceptAction = finalOutcome?.interceptor
             ?? (finalOutcome?.hasConclusiveEvent
               ? null
               : latestActions.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null) ?? null);

           if (bhId) {
             // Prioritize pass/shoot over move for ball destination
             const bhAllActions = latestActions
               .filter(a => a.participant_id === bhId)
               .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
             const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
               || bhAllActions[0];
             
              if (ballAction) {
                let fbp: { x: number; y: number } | null = null;
                const sp = snapshot[bhId];
                
                if ((ballAction.action_type === 'pass_low' || ballAction.action_type === 'pass_high' || ballAction.action_type === 'pass_launch') && ballAction.target_x != null && ballAction.target_y != null) {
                  // Ball settles exactly at the arrow tip (or the interceptor's target point)
                  // — no extra offset toward/past the receiver. The engine's bump pass may
                  // move the receiver slightly after animation ends, so any client-computed
                  // "receiver-relative" offset drifts out of sync with where the receiver
                  // actually lands. Keeping the ball exactly at the trajectory endpoint is
                  // predictable and matches what the user sees on the arrow.
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
                    const isSecondHalf2 = (matchRef.current?.current_half ?? 1) >= 2;
                    const attacksRight2 = isHome ? !isSecondHalf2 : isSecondHalf2;
                    fbp = { x: attacksRight2 ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT, y: ballAction.target_y };
                  }
                  // Store direction for missed shots too
                  if (sp) {
                    lastBallDirRef.current = { dx: ballAction.target_x - sp.x, dy: ballAction.target_y - sp.y };
                  }
                } else if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
                  const effectiveTarget = getEffectiveActionTarget(ballAction, snapshot[bhId], latestActions);
                  // Engine truth: if `dribble` fired, ball stays with BH; if `tackle`
                  // fired, ball snaps to tackler's receive target. Action-based fallback
                  // only runs while no conclusive event exists yet.
                  const useIntercept = (finalOutcome?.tackled === true)
                    || (!finalOutcome?.hasConclusiveEvent && !!interceptAction);
                  if (useIntercept && interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                    fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                  } else {
                    const endPos = effectiveTarget ?? { x: ballAction.target_x, y: ballAction.target_y };
                    // Ball glued to the dribbler's centre — no offset at all during move.
                    fbp = { x: endPos.x, y: endPos.y };
                  }
                  lastBallDirRef.current = null; // No inertia for dribble
                }

                if (fbp) {
                  // Check if a new turn has already arrived with the actual result.
                  // If so, snap the ball to the actual holder's position so the
                  // visual matches the server-resolved outcome (block/intercept).
                  const nextTurn = activeTurnRef.current;
                  const isNextTurnReady = nextTurn && nextTurn.id !== activeTurn?.id;
                  // Only override ball position if NO interception happened
                  // (if intercepted, keep ball at intercept point)
                  const wasIntercepted = interceptAction && interceptAction.participant_id !== bhId;
                  // Skip the nextTurn snap for move actions: the dribble's own branch
                  // above already decided whether the ball stays with the dribbler
                  // (dribble success) or moves to the interceptor's point. If the new
                  // turn shows a different ball_holder (e.g., GK briefly via a transient
                  // DB write), snapping the ball to that player produces the "ball
                  // appeared with GK at end of move" visual bug. Trust the move-branch
                  // fbp, let the next-turn render correct it naturally.
                  const isMoveAction = ballAction.action_type === 'move';
                  if (!isMoveAction && isNextTurnReady && nextTurn.ball_holder_participant_id && !wasIntercepted) {
                    const actualHolder = participantsRef.current.find(
                      p => p.id === nextTurn.ball_holder_participant_id
                    );
                    if (actualHolder) {
                      const actualPos = finals[actualHolder.id]
                        ?? { x: actualHolder.field_x ?? actualHolder.pos_x ?? 50, y: actualHolder.field_y ?? actualHolder.pos_y ?? 50 };
                      // Ball position near new holder, offset toward where ball came from
                      const prevBhAction = turnActionsRef.current.find(a => a.participant_id === bhId && (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type)));
                      if (prevBhAction?.target_x != null && prevBhAction?.target_y != null) {
                        const dx = prevBhAction.target_x - actualPos.x;
                        const dy = prevBhAction.target_y - actualPos.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        if (len > 0.5) {
                          // Ball slightly toward where it came from (at player's feet in receive direction)
                          const fromDx = actualPos.x - prevBhAction.target_x;
                          const fromDy = actualPos.y - prevBhAction.target_y;
                          const fromLen = Math.sqrt(fromDx * fromDx + fromDy * fromDy);
                          fbp = { x: actualPos.x + (fromDx / fromLen) * 0.8, y: actualPos.y + (fromDy / fromLen) * 0.8 };
                        } else {
                          fbp = { x: actualPos.x + 1.2, y: actualPos.y };
                        }
                      } else {
                        fbp = { x: actualPos.x + 1.2, y: actualPos.y };
                      }
                    }
                  } else if (!isNextTurnReady) {
                    // Next turn hasn't arrived yet -- check resolution event logs
                    // for blocks/intercepts to correct the end position early
                    const resEvents = resolutionEventsRef.current;
                    const hasBlock = resEvents.some(e => e.event_type === 'blocked' || e.event_type === 'saved' || e.event_type === 'block' || e.event_type === 'gk_save');
                    const hasIntercept = resEvents.some(e => e.event_type === 'intercepted');
                    if (hasBlock || hasIntercept) {
                      // Ball was blocked/intercepted -- use intercept point if
                      // available, otherwise snap to ball holder's end position
                      if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                        fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                      } else if (bhId) {
                        const holderFinal = finals[bhId];
                        if (holderFinal) {
                          fbp = { x: holderFinal.x + 1.2, y: holderFinal.y - 1.2 };
                        }
                      }
                      // Block/espalmar: clear inertia direction so loose ball doesn't fly toward original shot target
                      lastBallDirRef.current = null;
                    }
                  }

                  setFinalBallPos(fbp);
                  finalBallPosRef.current = fbp;
                }
              }
            } else if (!bhId && carriedLooseBallPos && ballInertiaDir) {
              // Loose ball with inertia: mirror the engine's decay (0.15 first
              // turn, 0.08 subsequent) so the animation's end-of-frame matches
              // the position the server persists in ball_inertia. Keeping
              // lastBallDirRef alive lets the next loose turn animate too.
              const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
              const newX = carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY;
              const newY = carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY;
              const newPos = { x: newX, y: newY };
              setCarriedLooseBallPos(newPos);
              finalBallPosRef.current = newPos;
              setFinalBallPos(newPos);
              inertiaConsumedRef.current = true;
            }

          // Release the interceptor snapshot — next render uses the live memo again.
          animationInterceptorSnapshotRef.current = null;
          // Release the interruption clamp; subsequent turns start from a clean slate.
          interruptProgressRef.current = null;

          // Clear the ball's RAF-managed `transform` attribute. React doesn't set
          // `transform` on the ball group in JSX, so if we leave it dirty the next
          // React render (which updates `data-base-x/y` to the new fbp position)
          // will display: fbp + stale_transform → ball floats past the arrow tip.
          // This was the root cause of the pass/dribble overshoot visual.
          const ballGElFinal = ballGroupRef.current;
          if (ballGElFinal) ballGElFinal.removeAttribute('transform');

          setAnimating(false);

          // Fetch authoritative positions from DB (prevents client desync)
          supabase.from('match_participants').select('id, pos_x, pos_y').eq('match_id', matchId).then(({ data: dbRows }) => {
            if (dbRows && dbRows.length > 0) {
              const dbMap = new Map(dbRows.map((r: any) => [r.id, { x: Number(r.pos_x), y: Number(r.pos_y) }]));
              setParticipants(prev => prev.map(p => {
                const db = dbMap.get(p.id);
                if (db) return { ...p, field_x: db.x, field_y: db.y, pos_x: db.x, pos_y: db.y };
                return p;
              }));
            }
          });
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    };

    // Try immediately (events may already be there from sub), then poll every 80ms
    tryStart();
    pollInterval = setInterval(tryStart, 80);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // Drop any stale RAF transform so the next animation starts from a clean slate.
      const ballGElCleanup = ballGroupRef.current;
      if (ballGElCleanup) ballGElCleanup.removeAttribute('transform');
    };
  }, [activeTurn?.phase, activeTurn?.id]);

  // ── Compute animated positions (physics-based easing) ───────
  const getAnimatedPos = useCallback((p: Participant): { x: number; y: number } => {
    // If we have final locked positions (post-animation), use them
    if (finalPositions[p.id] && !animating) {
      return finalPositions[p.id];
    }

    if (!animating || activeTurn?.phase !== 'resolution') {
      // During positioning, if this player has submitted a move, render them
      // directly at the target (no arrow/dot — the sprite itself moves).
      if (activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense') {
        const posMove = turnActions.find(a =>
          a.participant_id === p.id && a.action_type === 'move'
          && a.target_x != null && a.target_y != null
        );
        if (posMove) return { x: posMove.target_x as number, y: posMove.target_y as number };
      }
      return { x: p.field_x ?? 50, y: p.field_y ?? 50 };
    }

    // Move, receive, and block actions cause the player to move to target
    const moveAction = turnActions.find(
      a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null
    );
    const startPos = resolutionStartPositions[p.id];
    const startX = startPos?.x ?? p.field_x ?? 50;
    const startY = startPos?.y ?? p.field_y ?? 50;

    if (!moveAction || moveAction.target_x == null || moveAction.target_y == null) {
      return { x: startX, y: startY };
    }

    const effectiveTarget = getEffectiveActionTarget(moveAction, { x: startX, y: startY }, turnActions);
    const targetX = effectiveTarget?.x ?? moveAction.target_x;
    const targetY = effectiveTarget?.y ?? moveAction.target_y;

    // Calculate move distance as fraction of max range (~12% of field)
    const moveDist = getFieldMoveDist(targetX - startX, targetY - startY);
    const MAX_RANGE_APPROX = 6; // approximate max move range in field %
    const moveFraction = Math.min(1, moveDist / MAX_RANGE_APPROX);

    // Scale animation: player arrives at (moveFraction * 100%) of the animation timeline
    // e.g., if player moves 50% of max range, they arrive at 50% of the animation
    const rawProgress = animProgressRef.current;
    // Clamp to interruption T — the play ended early, so planned moves do too.
    const interruptT = interruptProgressRef.current;
    const raw = interruptT != null ? Math.min(rawProgress, interruptT) : rawProgress;
    const arrivalTime = Math.max(0.1, moveFraction); // at least 10% of animation
    const scaledRaw = Math.min(1, raw / arrivalTime); // 0→1 within the arrival window

    // Easing within the scaled time
    let t: number;
    if (scaledRaw < 0.4) {
      t = (scaledRaw / 0.4) ** 2 * 0.4;
    } else {
      t = 0.4 + (1 - Math.pow(1 - (scaledRaw - 0.4) / 0.6, 2)) * 0.6;
    }

    return {
      x: startX + (targetX - startX) * t,
      y: startY + (targetY - startY) * t,
    };
  }, [finalPositions, animating, activeTurn?.phase, turnActions, resolutionStartPositions, getEffectiveActionTarget]);

  // ─── Memoized player lists ─────────────────────────────────
  const homePlayersMemo = useMemo(
    () => participantsRef.current.filter(p => p.club_id === match?.home_club_id && p.role_type === 'player'),
    [participantsVer, match?.home_club_id]
  );
  const awayPlayersMemo = useMemo(
    () => participantsRef.current.filter(p => p.club_id === match?.away_club_id && p.role_type === 'player'),
    [participantsVer, match?.away_club_id]
  );
  const homeBenchMemo = useMemo(
    () => participantsRef.current.filter(p => p.club_id === match?.home_club_id && p.role_type === 'bench'),
    [participantsVer, match?.home_club_id]
  );
  const awayBenchMemo = useMemo(
    () => participantsRef.current.filter(p => p.club_id === match?.away_club_id && p.role_type === 'bench'),
    [participantsVer, match?.away_club_id]
  );

  // Find the interceptor whose receive/block actually SUCCEEDED
  // Uses next turn's ball holder to determine who won the ball contest
  // Must be reactive to events so animation updates when resolution events arrive
  // NOTE: Must be declared before any early return to satisfy Rules of Hooks
  const interceptorAction = useMemo(() => {
    const resEvents = resolutionEventsRef.current;
    const allResEvents = [...resEvents, ...events.filter(e =>
      ['blocked', 'intercepted', 'saved', 'tackle', 'possession_change', 'goal', 'gk_save', 'gk_save_failed', 'receive_failed', 'block'].includes(e.event_type)
    )];
    const goalScored = allResEvents.some(e => e.event_type === 'goal');
    const gkFailed = allResEvents.some(e => e.event_type === 'gk_save_failed');
    if (goalScored || gkFailed) return null;

    const candidates = turnActions.filter(a => (a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null);
    if (candidates.length === 0) return null;

    const failedIds = new Set(
      allResEvents.filter(e => e.event_type === 'receive_failed').map(e => (e.payload as any)?.participant_id).filter(Boolean)
    );

    const bhAction = turnActions.find(a =>
      a.participant_id === activeTurn?.ball_holder_participant_id &&
      (a.action_type === 'pass_low' || a.action_type === 'pass_high' || a.action_type === 'pass_launch' ||
       a.action_type === 'shoot_controlled' || a.action_type === 'shoot_power' ||
       a.action_type === 'header_low' || a.action_type === 'header_high' ||
       a.action_type === 'header_controlled' || a.action_type === 'header_power' ||
       a.action_type === 'move')
    );
    const bh = participantsRef.current.find(p => p.id === activeTurn?.ball_holder_participant_id);
    if (bhAction && bh && bhAction.target_x != null && bhAction.target_y != null && bh.field_x != null && bh.field_y != null) {
      const tdx = bhAction.target_x - bh.field_x;
      const tdy = bhAction.target_y - bh.field_y;
      const tlen2 = tdx * tdx + tdy * tdy;
      if (tlen2 > 0) {
        candidates.sort((a, b) => {
          const tA = clamp(((a.target_x! - bh.field_x!) * tdx + (a.target_y! - bh.field_y!) * tdy) / tlen2, 0, 1);
          const tB = clamp(((b.target_x! - bh.field_x!) * tdx + (b.target_y! - bh.field_y!) * tdy) / tlen2, 0, 1);
          return tA - tB;
        });
      }
    }

    for (const c of candidates) {
      if (!failedIds.has(c.participant_id)) return c;
    }
    return null;
  }, [turnActions, events, activeTurn?.phase, activeTurn?.ball_holder_participant_id]);

  // Ref mirror so the animation loop can access the latest interceptor without re-running the effect
  const interceptorActionRef = useRef(interceptorAction);
  interceptorActionRef.current = interceptorAction;

  // Snapshot of the interceptor captured when the resolution animation begins.
  // Stays frozen through the animation so late-arriving events cannot teleport the ball mid-flight.
  // Cleared when animation ends (and refreshed at next animation start).
  const animationInterceptorSnapshotRef = useRef<MatchAction | null>(null);
  // Interruption progress (0..1) from the engine's `turn_interrupted` event, or null
  // when the play completed cleanly. Read by both the animation loop and the React
  // render helper (`getAnimatedPos`) so previews + static renders agree on the clamp.
  const interruptProgressRef = useRef<number | null>(null);
  // Resolves which interceptor to use. During animation: the locked snapshot.
  // Outside animation: the live memoised value (needed for post-animation static render).
  const getLockedInterceptor = (): MatchAction | null => {
    if (animating && animationInterceptorSnapshotRef.current !== null) {
      return animationInterceptorSnapshotRef.current;
    }
    return interceptorAction;
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

  const homePlayers = homePlayersMemo;
  const awayPlayers = awayPlayersMemo;

  const possClubId = activeTurn?.possession_club_id ?? match.possession_club_id;
  const isTestMatch = !match.home_lineup_id && !match.away_lineup_id;

  // Active uniform colors (fall back to club colors if no uniform data)
  const homeActiveUniform = homeUniforms.find(u => u.uniform_number === (match.home_uniform ?? 1))
    || { shirt_color: homeClub?.primary_color ?? '#dc2626', number_color: homeClub?.secondary_color ?? '#fff', pattern: 'solid', stripe_color: '#fff' };
  const awayActiveUniform = awayUniforms.find(u => u.uniform_number === (match.away_uniform ?? 2))
    || { shirt_color: awayClub?.primary_color ?? '#16a34a', number_color: awayClub?.secondary_color ?? '#fff', pattern: 'solid', stripe_color: '#fff' };
  const homeGKUniform = homeUniforms.find(u => u.uniform_number === 3)
    || { shirt_color: '#111', number_color: '#fff', pattern: 'solid', stripe_color: '#fff' };
  const awayGKUniform = awayUniforms.find(u => u.uniform_number === 3)
    || { shirt_color: '#333', number_color: '#fff', pattern: 'solid', stripe_color: '#fff' };
  const isLooseBall = activeTurn && !activeTurn.ball_holder_participant_id;

  // Determine receive/block actions based on ball trajectory type and height zone
  const getReceiveActions = (participantId: string): string[] => {
    const pic = pendingInterceptChoice;
    if (!pic || pic.participantId !== participantId) return ['receive'];
    const trajType = pic.trajectoryActionType;
    const trajProgress = pic.trajectoryProgress ?? 0.5;
    const p = participants.find(x => x.id === participantId);
    const isGK = p?.field_pos === 'GK' || p?.slot_position === 'GK';
    const isHome = p?.club_id === match.home_club_id;
    const gkX = p?.field_x ?? 50;
    const isSecondHalf = (match?.current_half ?? 1) >= 2;
    const ownGoalIsLeft = isHome ? !isSecondHalf : isSecondHalf;
    const inBox = isGK && (ownGoalIsLeft ? (gkX <= 18) : (gkX >= 82));

    // Shoot trajectory
    if (trajType && isAnyShootAction(trajType)) {
      if (isGK && inBox) return ['receive', 'block']; // Agarrar + Espalmar
      return ['block']; // Bloquear for outfield
    }

    // Determine zone
    const zone = trajType ? getBallZoneAtProgress(trajType, trajProgress) : 'green';

    // Yellow zone: check if ascending (ball going up) or descending (ball coming down)
    if (zone === 'yellow') {
      // Ascending yellow = ball rising, only block allowed
      // Descending yellow = ball falling, receive allowed
      const isAscending = trajProgress < 0.5; // first half of trajectory = ascending
      if (isAscending) {
        return ['block'];
      }
      return ['receive']; // descending yellow — can receive (header)
    }

    // Tackle scenario: ball holder is dribbling → offer Desarme + Carrinho (hard tackle).
    // Only applies when it's an opponent trying to stop a dribble.
    if (trajType === 'move') {
      const bh = participants.find(pp => pp.id === activeTurn?.ball_holder_participant_id);
      const isOpponent = p && bh && p.club_id !== bh.club_id;
      if (isOpponent) return ['receive', 'receive_hard'];
    }

    // Green zone: normal foot receive
    return ['receive'];
  };

  // Get the ball zone for a participant's pending intercept
  const getInterceptZone = (participantId: string): 'green' | 'yellow' | 'red' => {
    const pic = pendingInterceptChoice;
    if (!pic || pic.participantId !== participantId || !pic.trajectoryActionType) return 'green';
    return getBallZoneAtProgress(pic.trajectoryActionType, pic.trajectoryProgress ?? 0.5);
  };

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

    // Check if player is in attacking half (can shoot)
    // In second half, sides are flipped: home attacks left, away attacks right
    const isHomeTeam = p.club_id === match.home_club_id;
    const isSecondHalf = (match.current_half ?? 1) >= 2;
    const playerX = p.field_x ?? p.pos_x ?? 50;
    const attacksRight = isHomeTeam ? !isSecondHalf : isSecondHalf;
    const inAttackingHalf = attacksRight ? playerX >= 45 : playerX <= 55; // slight margin

    const filterShots = (actions: string[]) => {
      if (inAttackingHalf) return actions;
      return actions.filter(a => a !== 'shoot_controlled' && a !== 'shoot_power' && a !== 'header_controlled' && a !== 'header_power');
    };

    // Build receive/block actions based on trajectory context
    const receiveActions = getReceiveActions(participantId);
    const interceptZone = hasReceivePrompt ? getInterceptZone(participantId) : 'green';

    // GK-specific: check if participant is GK
    const isGK = p?.field_pos === 'GK' || p?.slot_position === 'GK';

    // Tackle (move trajectory) or block-only = no one-touch options
    // GK facing a shot: no one-touch, only agarrar/espalmar
    const isTackle = pendingInterceptChoice?.participantId === participantId && pendingInterceptChoice?.trajectoryActionType === 'move';
    const trajType2 = pendingInterceptChoice?.participantId === participantId ? pendingInterceptChoice?.trajectoryActionType : null;
    const isGKFacingShot = isGK && trajType2 && isAnyShootAction(trajType2);
    const canOneTouch = receiveActions.includes('receive') && !isTackle && !isGKFacingShot;

    // Tackle cooldown: if this player failed a desarme OR carrinho last turn, they
    // cannot tackle again — remove BOTH variants from the tackle menu (engine also
    // enforces this in findInterceptorCandidates for submissions that slip through).
    if (isTackle && tackleBlockedIds.has(participantId)) {
      for (const opt of ['receive', 'receive_hard']) {
        const idx = receiveActions.indexOf(opt);
        if (idx >= 0) receiveActions.splice(idx, 1);
      }
    }

    // One-touch actions: in yellow zone, offer BOTH header and foot actions
    const footOneTouchActions = ['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power'];
    const headerOneTouchActions = ['header_low', 'header_high', 'header_controlled', 'header_power'];
    const oneTouchActions = interceptZone === 'yellow'
      ? [...headerOneTouchActions, ...footOneTouchActions]
      : footOneTouchActions;

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
      if (phase === 'attacking_support' && isAttacking) return hasReceivePrompt ? filterShots([...receiveActions, ...(canOneTouch ? oneTouchActions : []), 'move', 'no_action']) : ['no_action', 'move'];
      if (phase === 'defending_response' && !isAttacking) return hasReceivePrompt ? filterShots([...receiveActions, ...(canOneTouch ? oneTouchActions : []), 'move', 'no_action']) : ['no_action', 'move'];
      return [];
    }

    // Dead ball (kickoff/set piece): ball holder can only pass or shoot, no dribble/carry
    const setPieceType = activeTurn.set_piece_type;
    if (phase === 'ball_holder' && isBH && setPieceType) {
      if (setPieceType === 'throw_in') return ['pass_low', 'pass_high', 'pass_launch'];
      return filterShots(['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power']);
    }
    if (phase === 'ball_holder' && isBH && isDeadBall) return filterShots(['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power']);
    if (phase === 'ball_holder' && isBH) return filterShots(['move', 'pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power']);
    // Ball holder in phase 2: can mini-move ONLY if they submitted a ball action
    // (pass/shoot/header) in phase 1. If they dribbled, no further action allowed.
    if (phase === 'attacking_support' && isBH) {
      const bhHasBallAction = turnActions.some(a =>
        a.participant_id === participantId &&
        (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
      );
      return bhHasBallAction ? ['move', 'no_action'] : [];
    }
    if (phase === 'attacking_support' && isAttacking && !isBH) return hasReceivePrompt ? filterShots([...receiveActions, ...(canOneTouch ? oneTouchActions : []), 'move', 'no_action']) : ['no_action', 'move'];
    if (phase === 'defending_response' && !isAttacking) return hasReceivePrompt ? filterShots([...receiveActions, ...(canOneTouch ? oneTouchActions : []), 'move', 'no_action']) : ['no_action', 'move'];
    return [];
  };

  // ─── Field constants (use module-level) ────────────────────

  const toSVG = (pctX: number, pctY: number) => ({
    x: PAD + (pctX / 100) * INNER_W,
    y: PAD + (pctY / 100) * INNER_H,
  });

  const toField = (svgX: number, svgY: number) => ({
    x: ((svgX - PAD) / INNER_W) * 100,
    y: ((svgY - PAD) / INNER_H) * 100,
  });

  // Max pass/cross distance limits (% of field)
  const MAX_PASS_DISTANCE: Record<string, number> = {
    pass_low: 50,
    pass_high: 60,
    pass_launch: 70,
    header_low: 35,
    header_high: 45,
  };

  const clampPassDistance = (fromX: number, fromY: number, toX: number, toY: number, actionType: string): { x: number; y: number } => {
    const maxDist = MAX_PASS_DISTANCE[actionType];
    if (!maxDist) return { x: toX, y: toY };
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= maxDist) return { x: toX, y: toY };
    const scale = maxDist / dist;
    return { x: fromX + dx * scale, y: fromY + dy * scale };
  };

  const getDrawingBounds = (type: DrawingState['type']) => {
    if (type === 'move') return { min: 0, max: 100 };
    return { min: -8, max: 108 };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // Track mouse for inertia arrow even when drawingAction is cleared.
    if (inertiaArrow && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * FIELD_W;
      const svgY = ((e.clientY - rect.top) / rect.height) * FIELD_H;
      const fp = toField(svgX, svgY);
      setMouseFieldPct({ x: clamp(fp.x, 1, 99), y: clamp(fp.y, 1, 99) });
      return;
    }
    if (!drawingAction || !svgRef.current) return;
    // Throttle to ~30fps (33ms) to avoid re-renders on every pixel
    const now = performance.now();
    if (now - lastMouseMoveTimeRef.current < 33) return;
    lastMouseMoveTimeRef.current = now;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W;
    const totalH = FIELD_H;
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
            // Center circle restriction for defending team
            const possClubId = activeTurn?.possession_club_id;
            const isDefending = fromP.club_id !== possClubId;
            if (isDefending) {
              const CENTER_CIRCLE_RADIUS = 9.15;
              const distToCenter = Math.sqrt((finalX - 50) * (finalX - 50) + (finalY - 50) * (finalY - 50));
              if (distToCenter < CENTER_CIRCLE_RADIUS) {
                const angle = Math.atan2(finalY - 50, finalX - 50);
                finalX = 50 + Math.cos(angle) * CENTER_CIRCLE_RADIUS;
                finalY = 50 + Math.sin(angle) * CENTER_CIRCLE_RADIUS;
                if (isHome) finalX = Math.min(finalX, 49);
                else finalX = Math.max(finalX, 51);
              }
            }
          }
        }
      } else {
        const fromP = participants.find(p => p.id === drawingAction.fromParticipantId);
        if (fromP && fromP.field_x != null && fromP.field_y != null) {
          const dx = finalX - fromP.field_x;
          const dy = finalY - fromP.field_y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const direction = dist > 0.1 ? { x: dx, y: dy } : undefined;
          let maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, direction);
          if ((activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && ballTrajectoryAction?.action_type) {
            maxRange = applyBallSpeedFactor(maxRange, drawingAction.fromParticipantId, ballTrajectoryAction.action_type);
          }
          if (dist > maxRange) {
            const scale = maxRange / dist;
            finalX = fromP.field_x + dx * scale;
            finalY = fromP.field_y + dy * scale;
          }
        }
      }
    }

    // Clamp pass distance for pass-type drawing actions
    if (isAnyPassAction(drawingAction.type)) {
      const fromP = participants.find(p => p.id === drawingAction.fromParticipantId);
      if (fromP && fromP.field_x != null && fromP.field_y != null) {
        // For one-touch, origin is the intercept point
        const originX = pendingInterceptChoice?.participantId === drawingAction.fromParticipantId ? pendingInterceptChoice.targetX : fromP.field_x;
        const originY = pendingInterceptChoice?.participantId === drawingAction.fromParticipantId ? pendingInterceptChoice.targetY : fromP.field_y;
        // Map header passes to foot equivalents for distance clamping
        const clampType = drawingAction.type === 'header_low' ? 'pass_low' : drawingAction.type === 'header_high' ? 'pass_high' : drawingAction.type;
        const clamped = clampPassDistance(originX, originY, finalX, finalY, clampType);
        finalX = clamped.x;
        finalY = clamped.y;
      }
    }

    setMouseFieldPct({ x: finalX, y: finalY });
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Inertia arrow click: convert to field coords and pass to handleFieldClick.
    if (inertiaArrow && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * FIELD_W;
      const svgY = ((e.clientY - rect.top) / rect.height) * FIELD_H;
      const fp = toField(svgX, svgY);
      handleFieldClick(clamp(fp.x, 1, 99), clamp(fp.y, 1, 99));
      return;
    }
    if (!drawingAction || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W;
    const totalH = FIELD_H;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    const bounds = getDrawingBounds(drawingAction.type);
    handleFieldClick(clamp(fp.x, bounds.min, bounds.max), clamp(fp.y, bounds.min, bounds.max));
  };

  // Ball holder position
  const ballHolder = [...homePlayers, ...awayPlayers].find(p => p.id === activeTurn?.ball_holder_participant_id);

  // interceptorAction is declared above the early return (Rules of Hooks)

  // Loose ball position: server events are the source of truth. carriedLooseBallPos
  // is just a local cache that can drift across consecutive loose turns because the
  // engine applies 0.15 then 0.08 decay — any divergence between what the client
  // predicted and what the engine stored would make players target a spot that the
  // engine no longer considers "near the ball" (>2.65 units → rejected).
  // Priority: finalBallPos (locked post-animation) > latest server event >
  // local cache > match_turns.ball_x/_y.
  const looseBallPos = (() => {
    if (!isLooseBall) return null;
    if (finalBallPos) return finalBallPos;
    const fromHistory = resolveLooseBallFromHistory(events, turnActions, currentTurnNumber);
    if (fromHistory) return fromHistory;
    if (carriedLooseBallPos) return carriedLooseBallPos;
    const tx = (activeTurn as any)?.ball_x;
    const ty = (activeTurn as any)?.ball_y;
    if (tx != null && ty != null) return { x: Number(tx), y: Number(ty) };
    return null;
  })();



  const getAnimatedBallPos = (): { x: number; y: number } | null => {
    // During animation use the locked snapshot so mid-flight events don't teleport the ball.
    const effectiveInterceptor = getLockedInterceptor();
    // Use locked final ball position if available (post-animation)
    if (finalBallPos && !animating) {
      return finalBallPos;
    }

    // During the resolution animation, RAF fully controls the ball position via a
    // `transform` attribute on the group, computed relative to `data-base-x/y`.
    // If React re-renders mid-animation (from a realtime event, state tick, etc.)
    // and the base position changes, the RAF transform from the previous tick now
    // points at the wrong absolute position — the ball visibly jumps. Returning a
    // STABLE base here (the passer's pre-animation position) guarantees that
    // mid-animation re-renders don't shift `data-base-x/y`, so RAF's math stays
    // consistent.
    if (animating && activeTurn?.phase === 'resolution' && ballHolder) {
      const startPos = resolutionStartPositions[ballHolder.id] ?? {
        x: ballHolder.field_x ?? 50,
        y: ballHolder.field_y ?? 50,
      };
      return { x: startPos.x + 1.2, y: startPos.y - 1.2 };
    }

    if (!ballHolder) {
      // During resolution, animate loose ball along inertia trajectory
      if (animating && activeTurn?.phase === 'resolution' && ballInertiaDir && carriedLooseBallPos) {
        // Mirror engine decay: 0.15 first loose turn, 0.08 subsequent.
        const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
        const endX = clamp(carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY, 2, 98);
        const endY = clamp(carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY, 2, 98);
        const raw = animProgressRef.current;
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

    // Dynamic ball offset: position ball relative to movement/action direction
    const computeBallOffset = (playerPos: { x: number; y: number }): { x: number; y: number } => {
      const BALL_DIST = 0.8; // distance from player center in field %

      // Use START position to compute direction (not interpolated pos, which flips near target)
      const startPos = resolutionStartPositions[ballHolder.id] ?? { x: ballHolder.field_x ?? 50, y: ballHolder.field_y ?? 50 };

      // Pass/shoot/header takes priority over move for ball offset: when the BH committed
      // a ball-action in the ball_holder phase (e.g. bot's shoot_controlled) AND the user
      // also submitted a move in the attack phase, the BH-lock at resolution drops the
      // move and keeps the shot. Matching that priority here avoids the visual glitch where
      // during the attack phase the ball briefly offsets toward the soon-to-be-dropped move
      // target, then snaps to the shot trajectory when resolution starts.
      const ballAction = turnActions.find(a => a.participant_id === ballHolder.id && (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type)));
      if (ballAction?.target_x != null && ballAction?.target_y != null) {
        const dx = ballAction.target_x - startPos.x;
        const dy = ballAction.target_y - startPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.5) {
          return { x: playerPos.x + (dx / len) * BALL_DIST, y: playerPos.y + (dy / len) * BALL_DIST };
        }
      }

      // If BH has a move action (and no ball-action), ball is IN FRONT of movement direction
      const moveAction = turnActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move' && a.target_x != null);
      if (moveAction?.target_x != null && moveAction?.target_y != null) {
        const dx = moveAction.target_x - startPos.x;
        const dy = moveAction.target_y - startPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.5) {
          return { x: playerPos.x + (dx / len) * BALL_DIST, y: playerPos.y + (dy / len) * BALL_DIST };
        }
      }

      // Default: ball slightly ahead (right for home, left for away)
      const isHome = ballHolder.club_id === match?.home_club_id;
      const isSecondHalf = (match?.current_half ?? 1) >= 2;
      const dir = (isHome ? !isSecondHalf : isSecondHalf) ? 1 : -1;
      return { x: playerPos.x + dir * BALL_DIST, y: playerPos.y };
    };

    const defaultBallPos = computeBallOffset(holderRenderPos);

    // Prioritize pass/shoot over move for ball animation
    const bhAllActions = turnActions
      .filter(action => action.participant_id === ballHolder.id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
      || bhAllActions[0];

    if (!animating || activeTurn?.phase !== 'resolution' || !ballAction) {
      return defaultBallPos;
    }

    const startPos = resolutionStartPositions[ballHolder.id] ?? {
      x: ballHolder.field_x ?? 50,
      y: ballHolder.field_y ?? 50,
    };
    // Ball starts from player, offset toward the pass/shoot target direction
    let ballStartX = startPos.x + 1.2;
    let ballStartY = startPos.y - 1.2;
    if (ballAction?.target_x != null && ballAction?.target_y != null) {
      const dx = ballAction.target_x - startPos.x;
      const dy = ballAction.target_y - startPos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.5) {
        ballStartX = startPos.x + (dx / len) * 0.8;
        ballStartY = startPos.y + (dy / len) * 0.8;
      }
    }

    // Linear interpolation (ported from Solo Lab — constant speed, arc provides naturalism)
    const t = animProgressRef.current;

    if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
      const effectiveTarget = getEffectiveActionTarget(ballAction, startPos, turnActions);
      const endX = effectiveTarget?.x ?? ballAction.target_x;
      const endY = effectiveTarget?.y ?? ballAction.target_y;
      const dx = endX - startPos.x;
      const dy = endY - startPos.y;

      // Dribble-success override: if the resolution events confirm the dribble worked
      // (engine emits `dribble`), ignore any intercept candidate from a defender's
      // receive attempt — the ball must stay with the dribbler visually.
      const dribbleSucceeded = resolutionEventsRef.current.some(e => e.event_type === 'dribble');
      if (!dribbleSucceeded && effectiveInterceptor && effectiveInterceptor.target_x != null && effectiveInterceptor.target_y != null) {
        const len2 = dx * dx + dy * dy;
        const interceptT = len2 > 0
          ? clamp(
              ((effectiveInterceptor.target_x - startPos.x) * dx + (effectiveInterceptor.target_y - startPos.y) * dy) / len2,
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

      // Check if tackle happened during dribble — if so, ball stops at tackle point
      const tackleEvent = resolutionEventsRef.current.find(e => e.event_type === 'tackle');
      if (tackleEvent) {
        // Ball stops partway through the dribble (at ~t progress)
        const tackleT = Math.min(t, 0.7); // ball reaches tackle point before end
        return {
          x: startPos.x + dx * tackleT + 1.2,
          y: startPos.y + dy * tackleT - 1.2,
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
      if (effectiveInterceptor && effectiveInterceptor.target_x != null && effectiveInterceptor.target_y != null) {
        // Ball follows trajectory from ball start to target, capped at intercept point
        const dx = ballAction.target_x - ballStartX;
        const dy = ballAction.target_y - ballStartY;
        const len2 = dx * dx + dy * dy;
        let interceptT = 1;
        if (len2 > 0) {
          interceptT = clamp(
            ((effectiveInterceptor.target_x - ballStartX) * dx + (effectiveInterceptor.target_y - ballStartY) * dy) / len2,
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
        const isSecondHalf = (match?.current_half ?? 1) >= 2;
        // In 2nd half, home attacks LEFT instead of RIGHT
        const attacksRight = isHome ? !isSecondHalf : isSecondHalf;
        const goalX = attacksRight ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT;
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

  // ── Ball arc lift (visual only) — arc scales with distance (ported from Solo Lab) ──
  const ballArcLift = (() => {
    if (!animating || activeTurn?.phase !== 'resolution' || !ballHolder) return 0;
    const bhAllActions = turnActions
      .filter(a => a.participant_id === ballHolder.id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type));
    if (!ballAction) return 0;

    const actionType = ballAction.action_type;
    const sp = resolutionStartPositions[ballHolder.id] ?? { x: ballHolder.field_x ?? 50, y: ballHolder.field_y ?? 50 };
    const bDist = ballAction.target_x != null && ballAction.target_y != null
      ? Math.sqrt((ballAction.target_x - sp.x) ** 2 + (ballAction.target_y - sp.y) ** 2)
      : 20;
    const distScale = Math.max(0.5, Math.min(2, bDist / 30));
    let arcHeight = 0;
    if (actionType === 'pass_high' || actionType === 'header_high') arcHeight = 25 * distScale;
    else if (actionType === 'pass_launch') arcHeight = 38 * distScale;
    else if (actionType === 'shoot_controlled' || actionType === 'header_controlled') arcHeight = 12 * distScale;
    else if (actionType === 'shoot_power' || actionType === 'header_power') arcHeight = 7 * distScale;
    else return 0;

    return Math.sin(animProgressRef.current * Math.PI) * arcHeight;
  })();

  // Arrow from drawing action
  const drawingFrom = drawingAction ? participants.find(p => p.id === drawingAction.fromParticipantId) : null;

  // Shot target: for shoot, arrow goes slightly inside the goal
  const getShootTarget = (fromPart: Participant): { x: number; y: number } => {
    const isHome = fromPart.club_id === match.home_club_id;
    const isSecondHalf = (match?.current_half ?? 1) >= 2;
    // In second half, sides flip: home attacks left, away attacks right
    const shootsRight = isHome ? !isSecondHalf : isSecondHalf;
    return shootsRight ? { x: 100 + GOAL_LINE_OVERFLOW_PCT, y: 50 } : { x: 0 - GOAL_LINE_OVERFLOW_PCT, y: 50 };
  };

  // Arrow quality based on distance
  const getArrowQuality = (fromX: number, fromY: number, toX: number, toY: number, type: string, participantId?: string): string => {
    const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    const attrs = participantId ? playerAttrsMap[participantId] : null;
    // Map header types to their foot equivalents for quality calculation
    const mappedType = type === 'header_controlled' ? 'shoot_controlled'
      : type === 'header_power' ? 'shoot_power'
      : type === 'header_high' ? 'pass_high'
      : type === 'header_low' ? 'pass_low'
      : type;

    if (mappedType === 'shoot_controlled') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 12;
      const eDist = dist - accBonus;
      if (eDist < 35) return '#22c55e';
      if (eDist < 55) return '#f59e0b';
      return '#ef4444';
    }
    if (mappedType === 'shoot_power') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 6;
      const powBonus = normalizeAttr(Number(attrs?.forca_chute ?? 40)) * 4;
      const eDist = dist - accBonus - powBonus;
      if (eDist < 25) return '#f59e0b'; // power shot default yellow
      if (eDist < 40) return '#f59e0b';
      return '#ef4444'; // red = over the goal risk
    }
    if (mappedType === 'shoot') {
      const accBonus = normalizeAttr(Number(attrs?.acuracia_chute ?? 40)) * 10;
      const powBonus = normalizeAttr(Number(attrs?.forca_chute ?? 40)) * 5;
      const eDist = dist - accBonus - powBonus;
      if (eDist < 30) return '#22c55e';
      if (eDist < 50) return '#f59e0b';
      return '#ef4444';
    }
    if (mappedType === 'pass_high') {
      const passBonus = normalizeAttr(Number(attrs?.passe_alto ?? 40)) * 10;
      const eDist = dist - passBonus;
      if (eDist < 25) return '#22c55e';
      if (eDist < 45) return '#f59e0b';
      return '#ef4444';
    }
    if (mappedType === 'pass_launch') {
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
    const totalW = FIELD_W;
    const totalH = FIELD_H;
    return {
      left: rect.left + (svgPos.x / totalW) * rect.width,
      top: rect.top + (svgPos.y / totalH) * rect.height,
    };
  };

  const currentPhaseDuration = activeTurn?.phase === 'resolution' ? RESOLUTION_PHASE_DURATION
    : isPositioningTurn ? POSITIONING_PHASE_DURATION : PHASE_DURATION;
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
    if (action.action_type === 'block') {
      return { color: '#f59e0b', markerId: 'ah-yellow', strokeW: 2.5 };
    }
    if (isAnyShootAction(action.action_type)) {
      const color = action.target_x != null && action.target_y != null
        ? getArrowQuality(fromX, fromY, action.target_x, action.target_y, action.action_type, action.participant_id)
        : '#f59e0b';
      const markerId = 'ah-green'; // arrow tip always green
      return { color, markerId, strokeW: 3.5 };
    }
    if (isAnyPassAction(action.action_type)) {
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
          // Mirror engine decay: 0.15 first loose turn, 0.08 subsequent.
          const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
          // Don't clamp — let inertia arrow point outside field if that's where the ball goes
          const endX = looseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY;
          const endY = looseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY;
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
      (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type) || a.action_type === 'move') &&
      a.target_x != null && a.target_y != null
    ) || null;
  };

  const ballTrajectoryAction = getBallTrajectoryAction();

  // Auto-detect if a player is already on/near the ball trajectory. When true,
  // calling this sets pendingInterceptChoice so the menu opens with
  // receive/block/one-touch right away — no need to drag to the trajectory.
  // Not a useCallback because it's defined after the early return — using a hook
  // here would violate Rules of Hooks and crash in production (React error #310).
  // Regular function is fine; it's only called from event handlers and effects.
  const tryAutoDetectIntercept = (participantId: string) => {
    if (!activeTurn) return;
    const phase = activeTurn.phase;
    if (phase !== 'attacking_support' && phase !== 'defending_response') return;

    const bta = getBallTrajectoryAction();
    if (!bta || bta.target_x == null || bta.target_y == null) return;
    const bhNow = participantsRef.current.find(p => p.id === activeTurn.ball_holder_participant_id);
    if (!bhNow || bhNow.field_x == null || bhNow.field_y == null) return;
    const player = participantsRef.current.find(p => p.id === participantId);
    if (!player || player.field_x == null || player.field_y == null) return;
    if (participantId === activeTurn.ball_holder_participant_id) return;

    const bfx = bhNow.field_x;
    const bfy = bhNow.field_y;
    const btx = bta.target_x as number;
    const bty = bta.target_y as number;
    const tdx = btx - bfx;
    const tdy = bty - bfy;
    const tlen2 = tdx * tdx + tdy * tdy;
    if (tlen2 < 0.01) return;

    const t = clamp(((player.field_x - bfx) * tdx + (player.field_y - bfy) * tdy) / tlen2, 0, 1);
    const projX = bfx + tdx * t;
    const projY = bfy + tdy * t;
    const distToTraj = Math.sqrt((player.field_x - projX) ** 2 + (player.field_y - projY) ** 2);

    // Aligned with engine: INTERCEPT_THRESHOLD = 1.0 on perpendicular distance,
    // TIMING_TOLERANCE = 0.5 on the reach formula.
    if (distToTraj > 1.0) return;

    const baseRange = computeMaxMoveRange(participantId);
    const isGK = player.field_pos === 'GK' || player.slot_position === 'GK';
    // GK skips ballSpeedFactor reduction (see applyBallSpeedFactor): force action type to
    // 'move' so canReachTrajectoryPoint uses a factor of 1.0 for the GK.
    const effectiveActionType = isGK ? 'move' : bta.action_type;
    const reaches = canReachTrajectoryPoint(
      { x: player.field_x, y: player.field_y },
      { x: bfx, y: bfy }, { x: btx, y: bty },
      t, baseRange, effectiveActionType, 0.5,
    );
    if (!reaches) return;

    const isRedZone = (bta.action_type === 'pass_high' && t > 0.2 && t < 0.8)
      || (bta.action_type === 'pass_launch' && t > 0.35 && t < 0.65);
    if (isRedZone) return;

    if (bta.action_type === 'move' && tackleBlockedIds.has(participantId)) return;

    setPendingInterceptChoice({
      participantId,
      targetX: projX,
      targetY: projY,
      trajectoryActionType: bta.action_type,
      trajectoryProgress: t,
    });
  };

  // For inertia trajectories, create a virtual holder at the loose ball position
  const ballTrajectoryHolder = ballTrajectoryAction
    ? (ballTrajectoryAction.id === '__inertia__' && looseBallPos
      ? { id: '__inertia_origin__', field_x: looseBallPos.x, field_y: looseBallPos.y, club_id: '' } as unknown as Participant
      : participants.find(p => p.id === ballTrajectoryAction.participant_id) || null)
    : null;

  const handleToggleUniform = async (side: 'home' | 'away') => {
    if (!match) return;
    const uniforms = side === 'home' ? homeUniforms : awayUniforms;
    const currentNum = side === 'home' ? (match.home_uniform ?? 1) : (match.away_uniform ?? 2);
    // Cycle through available uniform numbers, or toggle between 1 and 2
    const availableNums = uniforms.map(u => u.uniform_number).sort((a, b) => a - b);
    let nextNum: number;
    if (availableNums.length > 1) {
      const idx = availableNums.indexOf(currentNum);
      nextNum = availableNums[(idx + 1) % availableNums.length];
    } else {
      nextNum = currentNum === 1 ? 2 : 1;
    }
    const updateField = side === 'home' ? { home_uniform: nextNum } : { away_uniform: nextNum };
    setMatch(prev => prev ? { ...prev, ...updateField } : prev);
    await supabase.from('matches').update(updateField).eq('id', match.id);
  };

  return (
    <div className="h-screen bg-[hsl(140,15%,12%)] text-foreground flex flex-col overflow-hidden">
      {/* ── Top scoreboard bar ── */}
      <MatchScoreboard
        isLive={isLive} isFinished={isFinished} isTestMatch={isTestMatch}
        isLooseBall={!!isLooseBall} isPhaseProcessing={isPhaseProcessing} isPositioningTurn={isPositioningTurn}
        homeClub={homeClub} awayClub={awayClub}
        homeScore={match.home_score} awayScore={match.away_score}
        currentTurnNumber={match.current_turn_number} activeTurnPhase={activeTurn?.phase ?? null}
        halfStartedAt={match.half_started_at ?? null} currentHalf={match.current_half ?? 1}
        myRole={myRole} isBenchPlayer={myRole === 'spectator' && myParticipant?.role_type === 'bench'} isManager={isManager}
        onFinishMatch={finishMatch} onExit={exitToDashboard}
        homeUniformNum={match.home_uniform ?? 1} awayUniformNum={match.away_uniform ?? 2}
        homeActiveUniform={homeActiveUniform} awayActiveUniform={awayActiveUniform}
        onToggleUniform={handleToggleUniform}
        myClubId={myClubId}
        possessionClubId={possClubId ?? null}
        leagueRoundNumber={leagueRoundNumber}
        events={events}
      />

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Field area (dominant) ── */}
        <div className="flex-1 flex items-center justify-center p-1 sm:p-2 relative" style={{ background: 'linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)' }}>
          <div className="relative w-full h-full flex items-center justify-center" style={{ maxWidth: 1200 }}>
            {/* Positioning-phase border pulse: subtle periodic glow around the pitch to
                signal it's time for the user to pick a position. Only visible when the
                user has agency this phase (player or manager of this match). */}
            {isPositioningTurn && (isPlayer || isManager) && (
              <div
                className="pointer-events-none absolute inset-0 rounded-lg"
                style={{
                  boxShadow: '0 0 0 3px rgba(245,158,11,0.55) inset, 0 0 32px 4px rgba(245,158,11,0.25)',
                  animation: 'bdo-positioning-pulse 1.2s ease-in-out infinite',
                  zIndex: 25,
                }}
              />
            )}
            <PitchSVG
              style={stadiumStyle}
              svgRef={svgRef}
              onMouseMove={handleSvgMouseMove}
              onClick={handleSvgClick}
              cursor={drawingAction ? 'crosshair' : 'default'}
              className="max-w-full max-h-full rounded-lg"
            >
              {/* Extra defs not provided by PitchSVG */}
              <defs>
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
                <marker id="ah-orange" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#f59e0b" /></marker>
              </defs>

              {/* ── Kickoff half-field overlay during positioning ── */}
              {isPositioningTurn && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                const isKickoff = bh && Math.abs((bh.field_x ?? bh.pos_x ?? 50) - 50) < 5 && Math.abs((bh.field_y ?? bh.pos_y ?? 50) - 50) < 5;
                if (!isKickoff) return null;
                const centerSvg = toSVG(50, 50);
                // Match the pitch's center circle exactly: <circle r={INNER_H * 0.15}> in PitchSVG
                const circleRadiusSvg = INNER_H * 0.15;
                const possClubId = activeTurn?.possession_club_id;
                const drawingPlayer = drawingAction ? participants.find(p => p.id === drawingAction.fromParticipantId) : null;
                const isDrawingDefender = drawingPlayer && drawingPlayer.club_id !== possClubId;
                return (
                  <>
                    <circle cx={centerSvg.x} cy={centerSvg.y} r={circleRadiusSvg}
                      fill={isDrawingDefender ? "rgba(239,68,68,0.10)" : "none"}
                      stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" strokeDasharray="6,4" />
                    {drawingAction && drawingPlayer && (() => {
                      const isHome = drawingPlayer.club_id === match.home_club_id;
                      const isSecondHalf = (match?.current_half ?? 1) >= 2;
                      // In 2nd half, home's own half is on the RIGHT
                      const ownHalfIsLeft = isHome ? !isSecondHalf : isSecondHalf;
                      const shadeX = ownHalfIsLeft ? toSVG(50, 0).x : PAD;
                      const shadeW = ownHalfIsLeft ? (PAD + INNER_W - toSVG(50, 0).x) : (toSVG(50, 0).x - PAD);
                      return (
                        <rect x={shadeX} y={PAD} width={shadeW} height={INNER_H}
                          fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="6,4" />
                      );
                    })()}
                  </>
                );
              })()}

              {/* ── Free-kick 9m barrier circle ── */}
              {isPositioningTurn && activeTurn?.set_piece_type === 'free_kick' && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                if (!bh || bh.field_x == null || bh.field_y == null) return null;
                const ballSvg = toSVG(bh.field_x, bh.field_y);
                const barrierRadiusSvg = (9.15 / 100) * INNER_W;
                return (
                  <circle
                    cx={ballSvg.x} cy={ballSvg.y} r={barrierRadiusSvg}
                    fill="rgba(239,68,68,0.06)"
                    stroke="rgba(239,68,68,0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                );
              })()}

              {/* ── Throw-in / corner exclusion zone (10-unit circle around ball) ── */}
              {isPositioningTurn
                && (activeTurn?.set_piece_type === 'throw_in'
                  || activeTurn?.set_piece_type === 'corner') && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                if (!bh || bh.field_x == null || bh.field_y == null) return null;
                const ballSvg = toSVG(bh.field_x, bh.field_y);
                const exclusionRadiusSvg = (SET_PIECE_EXCLUSION_RADIUS / 100) * INNER_W;
                return (
                  <circle
                    cx={ballSvg.x} cy={ballSvg.y} r={exclusionRadiusSvg}
                    fill="rgba(239,68,68,0.06)"
                    stroke="rgba(239,68,68,0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                );
              })()}

              {/* ── Goal-kick exclusion: opposing team must stay outside the PA ──
                  FIFA rule — mirrors engine enforcement that pushes opponents out of
                  the kicking team's penalty area (see match-engine-lab `goal_kick` branch). */}
              {isPositioningTurn && activeTurn?.set_piece_type === 'goal_kick' && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                if (!bh) return null;
                const isSecondHalf = (match?.current_half ?? 1) >= 2;
                const isPossHome = bh.club_id === match?.home_club_id;
                const defendsLeft = isPossHome ? !isSecondHalf : isSecondHalf;
                const paMinX = defendsLeft ? 0 : 82;
                const paMaxX = defendsLeft ? 18 : 100;
                const PA_Y_MIN = 20;
                const PA_Y_MAX = 80;
                const tl = toSVG(paMinX, PA_Y_MIN);
                const br = toSVG(paMaxX, PA_Y_MAX);
                return (
                  <rect
                    x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y}
                    fill="rgba(239,68,68,0.08)"
                    stroke="rgba(239,68,68,0.45)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                );
              })()}

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
                      ⚽ Inercia
                    </text>
                  </g>
                );
              })()}

              {/* (Fixed markers removed — live preview replaces them) */}

              {visibleActions.map(action => {
                if (action.target_x == null || action.target_y == null) return null;
                const fromPart = participants.find(p => p.id === action.participant_id);
                if (!fromPart || fromPart.field_x == null || fromPart.field_y == null) return null;

                // Hide all arrows during the entire motion phase — during the animation AND
                // after it ends but before the next turn starts. Without the full-phase gate,
                // arrows flashed back at full opacity after `animating` flipped to false but
                // before `activeTurn.phase` advanced to the next turn's ball_holder.
                if (activeTurn?.phase === 'resolution') return null;
                // Drop stale actions that belong to a previous turn. After resolution ends and
                // activeTurn flips to the next turn, turnActions briefly still holds the prior
                // turn's rows (refetch races the phase change) — without this guard, the old
                // pass arrow flashes for one frame before the new turn's actions arrive.
                // Compare by turn_number (not match_turn_id): each phase within a turn inserts
                // its own match_turns row, so filtering by id would hide arrows submitted in
                // an earlier phase of the same turn (e.g. a pass drawn in ball_holder vanished
                // when the phase advanced to attacking_support).
                if (activeTurn?.turn_number != null && action.turn_number != null && action.turn_number !== activeTurn.turn_number) return null;

                // Hide bot arrows during positioning phases (they just clutter the field)
                if (action.controlled_by_type === 'bot' && isPositioningTurn) return null;

                // Hide ALL move arrows during positioning — the player sprite animates
                // straight to the target via getAnimatedPos override; a visible arrow
                // duplicates that motion and adds a stray "MOVER" label at the midpoint.
                if (isPositioningTurn && action.action_type === 'move') return null;

                // Hide positioning phase arrows once we've moved past positioning
                if (!isPositioningTurn && (action.turn_phase === 'positioning_attack' || action.turn_phase === 'positioning_defense')) return null;

                // Hide bot receive/block arrows that are clearly impossible
                if (action.controlled_by_type === 'bot' && (action.action_type === 'receive' || action.action_type === 'block')) {
                  const moveDist = getFieldMoveDist(fromPart.field_x - action.target_x!, fromPart.field_y - action.target_y!);
                  if (moveDist > 15) return null; // >15% of field = clearly impossible
                  // Hide bot desarme when target is too far from ball holder (not a real tackle)
                  if (ballHolder && fromPart.club_id !== ballHolder.club_id && action.target_x != null) {
                    const bhX = ballHolder.field_x ?? 50;
                    const bhY = ballHolder.field_y ?? 50;
                    const distTargetToBh = Math.sqrt((action.target_x - bhX) ** 2 + (action.target_y! - bhY) ** 2);
                    if (distTargetToBh > 15) return null; // target nowhere near ball holder
                  }
                }

                // Hide bot move arrows where bot already arrived (distance ≈ 0)
                if (action.controlled_by_type === 'bot' && action.action_type === 'move') {
                  const dist = Math.sqrt((fromPart.field_x - action.target_x) ** 2 + (fromPart.field_y - action.target_y) ** 2);
                  if (dist < 1) return null;
                }

                const lockedOrigin = activeTurn?.phase === 'resolution' ? resolutionStartPositions[action.participant_id] : null;
                const isBHAction = action.participant_id === activeTurn?.ball_holder_participant_id && (isPassAction(action.action_type) || isShootAction(action.action_type) || isHeaderAction(action.action_type));
                const baseFromX = lockedOrigin?.x ?? fromPart.field_x;
                const baseFromY = lockedOrigin?.y ?? fromPart.field_y;
                // Pass/shoot arrows start from the BALL position, offset from the player
                // in the direction of the target (matches the live ball render and the
                // resolution animation's ball start, so the arrow and the ball line up).
                let fromX = baseFromX;
                let fromY = baseFromY;
                if (isBHAction) {
                  const BALL_DIST_FROM_PLAYER = 0.8;
                  const dxBall = action.target_x - baseFromX;
                  const dyBall = action.target_y - baseFromY;
                  const lenBall = Math.sqrt(dxBall * dxBall + dyBall * dyBall);
                  if (lenBall > 0.5) {
                    fromX = baseFromX + (dxBall / lenBall) * BALL_DIST_FROM_PLAYER;
                    fromY = baseFromY + (dyBall / lenBall) * BALL_DIST_FROM_PLAYER;
                  } else {
                    fromX = baseFromX + BALL_DIST_FROM_PLAYER;
                    fromY = baseFromY;
                  }
                }
                const from = toSVG(fromX, fromY);
                const to = toSVG(action.target_x, action.target_y);
                const { color, markerId, strokeW } = getActionArrowColor(action, fromPart, { x: fromX, y: fromY });
                const controlLabel = action.controlled_by_type === 'bot' ? 'BOT' : action.controlled_by_type === 'manager' ? 'MGR' : 'PLR';
                const opacity = 0.8;
                const dashArray = action.controlled_by_type === 'bot' ? '4,3' : 'none';

                // Multi-segment arrow rendering for height-based actions
                const renderMultiSegmentArrow = () => {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;

                  // Positioning move: no visual — the player sprite itself moves
                  // to the target via getAnimatedPos.
                  if (isPositioningTurn && action.action_type === 'move') {
                    return [];
                  }

                  // Map header types to their visual equivalents
                  const visualType = action.action_type === 'header_low' ? 'pass_low'
                    : action.action_type === 'header_high' ? 'pass_high'
                    : action.action_type === 'header_controlled' ? 'shoot_controlled'
                    : action.action_type === 'header_power' ? 'shoot_power'
                    : action.action_type;

                  if (visualType === 'pass_high') {
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

                  if (visualType === 'pass_launch') {
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

                  if (visualType === 'shoot_power') {
                    // Authoritative signal from engine: shot_outcome in the action payload
                    // 'over' → yellow front half + red back half (went over the bar)
                    // 'wide' or 'on_target' or undefined → full yellow
                    const shotOutcome = (action.payload && typeof action.payload === 'object') ? (action.payload as any).shot_outcome : undefined;

                    if (shotOutcome === 'over') {
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

                    // Default: full yellow (on-target or wide — engine already deviated target)
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

                  // pass_low: first 10% yellow (block-only, no receive), rest green
                  if (visualType === 'pass_low') {
                    return [
                      <line key="pl-start"
                        x1={from.x} y1={from.y}
                        x2={from.x + dx * 0.1} y2={from.y + dy * 0.1}
                        stroke="#f59e0b" strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        strokeDasharray={dashArray}
                      />,
                      <line key="pl-main"
                        x1={from.x + dx * 0.1} y1={from.y + dy * 0.1}
                        x2={to.x} y2={to.y}
                        stroke="#22c55e" strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        markerEnd={`url(#${markerId})`}
                        strokeDasharray={dashArray}
                      />,
                    ];
                  }

                  // shoot_controlled, move, receive — single solid line
                  return [(
                    <line key="single"
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={visualType === 'shoot_controlled' ? '#22c55e' : color}
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
                      {controlLabel} {(() => {
                        // `no_action` is submitted as a zero-length 'move' with payload.no_action;
                        // render the correct label so the field popup doesn't show "MOVER".
                        if (action.action_type === 'move'
                          && action.payload && typeof action.payload === 'object'
                          && (action.payload as any).no_action) {
                          return ACTION_LABELS.no_action;
                        }
                        if (action.action_type === 'receive') {
                          // If BH is doing a move (dribble) and this player is opponent → "DESARME"
                          const bhAction = visibleActions.find(a => a.participant_id === activeTurn?.ball_holder_participant_id && (a.action_type === 'move'));
                          if (bhAction && fromPart.club_id !== ballHolder?.club_id) return 'DESARME';
                          return ACTION_LABELS[action.action_type];
                        }
                        return ACTION_LABELS[action.action_type] || action.action_type;
                      })()}
                    </text>
                  </g>
                );
              })}

              {/* Drawing arrow (follows mouse) */}
              {drawingAction && drawingFrom && mouseFieldPct && (() => {
                // One-touch: show move line (player → intercept) + ball action arrow (intercept → target)
                const isOneTouchDraw = pendingInterceptChoice && pendingInterceptChoice.participantId === drawingAction.fromParticipantId &&
                  drawingAction.type !== 'move';

                if (isOneTouchDraw) {
                  // Move line: player → intercept point
                  const playerPos = toSVG(drawingFrom.field_x!, drawingFrom.field_y!);
                  const interceptPos = toSVG(pendingInterceptChoice!.targetX, pendingInterceptChoice!.targetY);
                  // Ball action: intercept → target
                  let targetFieldX: number, targetFieldY: number;
                  if (isAnyShootAction(drawingAction.type)) {
                    const goalTarget = getShootTarget(drawingFrom);
                    targetFieldX = goalTarget.x;
                    targetFieldY = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, mouseFieldPct.y));
                  } else {
                    targetFieldX = mouseFieldPct.x;
                    targetFieldY = mouseFieldPct.y;
                  }
                  const targetPos = toSVG(targetFieldX, targetFieldY);
                  const isShoot = isAnyShootAction(drawingAction.type);
                  const ballColor = isShoot ? '#f59e0b' : '#22c55e';
                  return (
                    <g>
                      {/* Movement line */}
                      <line x1={playerPos.x} y1={playerPos.y} x2={interceptPos.x} y2={interceptPos.y}
                        stroke="#1a1a2e" strokeWidth={2} strokeLinecap="round" opacity={0.85}
                        markerEnd="url(#ah-black)" />
                      {/* Ball action arrow from intercept */}
                      <line x1={interceptPos.x} y1={interceptPos.y} x2={targetPos.x} y2={targetPos.y}
                        stroke={ballColor} strokeWidth={3} strokeLinecap="round" opacity={0.85}
                        markerEnd="url(#ah-green)" />
                      {/* Label */}
                      <text x={(interceptPos.x + targetPos.x) / 2} y={(interceptPos.y + targetPos.y) / 2 - 6}
                        textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.8)"
                        fontFamily="'Barlow Condensed', sans-serif">
                        {ACTION_LABELS[drawingAction.type] || drawingAction.type} (1ª)
                      </text>
                    </g>
                  );
                }

                // Move arrows start from player center; pass/shoot arrows start from ball position
                const isBallHolderAction = drawingAction.fromParticipantId === activeTurn?.ball_holder_participant_id;
                const isBallAction = drawingAction.type !== 'move';
                const fromFieldX = isBallHolderAction && isBallAction && ballDisplayPos ? ballDisplayPos.x : drawingFrom.field_x!;
                const fromFieldY = isBallHolderAction && isBallAction && ballDisplayPos ? ballDisplayPos.y : drawingFrom.field_y!;
                const from = toSVG(fromFieldX, fromFieldY);
                let to: { x: number; y: number };
                let toFieldX: number, toFieldY: number;
                if (isAnyShootAction(drawingAction.type)) {
                  const goalTarget = getShootTarget(drawingFrom);
                  toFieldX = goalTarget.x;
                  toFieldY = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, mouseFieldPct.y));
                  to = toSVG(toFieldX, toFieldY);
                } else {
                  toFieldX = mouseFieldPct.x;
                  toFieldY = mouseFieldPct.y;
                  // Clamp move arrow to maxRange (with ballSpeedFactor applied when there's active ball trajectory)
                  // Positioning phases have no range limit — player can be placed anywhere.
                  if (drawingAction.type === 'move' && drawingFrom.field_x != null && drawingFrom.field_y != null && !isPositioningTurn) {
                    const mdx = toFieldX - drawingFrom.field_x;
                    const mdy = toFieldY - drawingFrom.field_y;
                    const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                    let arrowMaxRange = computeMaxMoveRange(drawingAction.fromParticipantId, mdist > 0.1 ? { x: mdx, y: mdy } : undefined);
                    if ((activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && ballTrajectoryAction?.action_type) {
                      arrowMaxRange = applyBallSpeedFactor(arrowMaxRange, drawingAction.fromParticipantId, ballTrajectoryAction.action_type);
                    }
                    if (mdist > arrowMaxRange) {
                      const scale = arrowMaxRange / mdist;
                      toFieldX = drawingFrom.field_x + mdx * scale;
                      toFieldY = drawingFrom.field_y + mdy * scale;
                    }
                  }
                  to = toSVG(toFieldX, toFieldY);
                }
                const isMove = drawingAction.type === 'move';
                const isShoot = isAnyShootAction(drawingAction.type);
                const strokeW = isMove ? 2 : isShoot ? 3.5 : 3;
                const opacity = 0.85;

                if (isMove) {
                  // Positioning phases: no preview visual — the player sprite
                  // repositions directly on click via getAnimatedPos override.
                  if (isPositioningTurn) {
                    return null;
                  }
                  return (
                    <line
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#1a1a2e" strokeWidth={strokeW}
                      strokeLinecap="round" opacity={opacity}
                      markerEnd="url(#ah-black)"
                    />
                  );
                }

                // Map header types to visual equivalents for preview
                const previewType = drawingAction.type === 'header_low' ? 'pass_low'
                  : drawingAction.type === 'header_high' ? 'pass_high'
                  : drawingAction.type === 'header_controlled' ? 'shoot_controlled'
                  : drawingAction.type === 'header_power' ? 'shoot_power'
                  : drawingAction.type;

                // Multi-segment preview for passes
                if (previewType === 'pass_high') {
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
                if (previewType === 'pass_launch') {
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
                if (previewType === 'pass_low') {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  return (
                    <g>
                      <line
                        x1={from.x} y1={from.y}
                        x2={from.x + dx * 0.05} y2={from.y + dy * 0.05}
                        stroke="#f59e0b" strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                      />
                      <line
                        x1={from.x + dx * 0.05} y1={from.y + dy * 0.05}
                        x2={to.x} y2={to.y}
                        stroke="#22c55e" strokeWidth={strokeW}
                        strokeLinecap="round" opacity={opacity}
                        markerEnd="url(#ah-green)"
                      />
                    </g>
                  );
                }
                // Shots: preview only green/yellow (no red — surprise)
                const color = getArrowQuality(fromFieldX, fromFieldY, toFieldX, toFieldY, drawingAction.type, drawingAction.fromParticipantId);
                const previewColor = previewType === 'shoot_controlled' ? '#22c55e' :
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

              {/* ── Inertia arrow: thick orange line extending from move endpoint ── */}
              {inertiaArrow && mouseFieldPct && (() => {
                const { startX, startY, dirX, dirY, maxLen } = inertiaArrow;
                // Project cursor onto move direction to get current arrow length.
                const cdx = mouseFieldPct.x - startX;
                const cdy = mouseFieldPct.y - startY;
                const proj = cdx * dirX + cdy * dirY;
                const clampedLen = Math.max(0, Math.min(maxLen, proj));
                const power = maxLen > 0 ? Math.round((clampedLen / maxLen) * 100) : 100;

                const endX = startX + dirX * clampedLen;
                const endY = startY + dirY * clampedLen;
                const svgStart = toSVG(startX, startY);
                const svgEnd = toSVG(endX, endY);

                // Also show the 100% ghost line for reference.
                const fullEndX = startX + dirX * maxLen;
                const fullEndY = startY + dirY * maxLen;
                const svgFullEnd = toSVG(fullEndX, fullEndY);

                return (
                  <g pointerEvents="none">
                    {/* Ghost: full extent at low opacity */}
                    <line x1={svgStart.x} y1={svgStart.y} x2={svgFullEnd.x} y2={svgFullEnd.y}
                      stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" opacity={0.15} />
                    {/* Active portion */}
                    {clampedLen > 0.2 && (
                      <line x1={svgStart.x} y1={svgStart.y} x2={svgEnd.x} y2={svgEnd.y}
                        stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}
                        markerEnd="url(#ah-orange)" />
                    )}
                    {/* Endpoint dot */}
                    <circle cx={svgEnd.x} cy={svgEnd.y} r={4} fill="#f59e0b" opacity={0.9} />
                    {/* Power label */}
                    <text x={svgEnd.x} y={svgEnd.y - 10} textAnchor="middle" fontSize="9"
                      fontWeight="800" fontFamily="'Barlow Condensed', sans-serif" fill="#f59e0b">
                      {power}%
                    </text>
                  </g>
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
                
                // Ball holder can't intercept their own trajectory — hide purple for BH.
                const isBHSelf = drawingAction.fromParticipantId === activeTurn?.ball_holder_participant_id;
                if (isMove && !isBHSelf && effectiveBallTrajectoryAction && effectiveHolder &&
                    effectiveHolder.field_x != null && effectiveHolder.field_y != null &&
                    effectiveBallTrajectoryAction.target_x != null && effectiveBallTrajectoryAction.target_y != null &&
                    (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response')) {
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

                    // Red zone check: ball is too high to intercept
                    const actionType = effectiveBallTrajectoryAction.action_type;
                    const isRedZone = (actionType === 'pass_high' && tCursor > 0.2 && tCursor < 0.8) ||
                                      (actionType === 'pass_launch' && tCursor > 0.35 && tCursor < 0.65);

                    // Intercept check uses BASE range (no inertia direction) to match the
                    // engine's findInterceptorCandidates which doesn't apply inertia either.
                    const baseRange = computeMaxMoveRange(drawingAction.fromParticipantId);
                    const drawingIsGK = drawingFrom.field_pos === 'GK' || drawingFrom.slot_position === 'GK';
                    const isShot = actionType === 'shoot_controlled' || actionType === 'shoot_power' || actionType === 'header_controlled' || actionType === 'header_power';
                    const effectiveActionType = (drawingIsGK && isShot) ? 'move' : actionType;

                    // Tolerance 0.5 + proximity 1.0 mirror the engine's TIMING_TOLERANCE
                    // and INTERCEPT_THRESHOLD — purple shows iff the server would accept.
                    const reachesTrajPoint = canReachTrajectoryPoint(
                      { x: drawingFrom.field_x!, y: drawingFrom.field_y! },
                      { x: bfx, y: bfy },
                      { x: btx, y: bty },
                      tCursor,
                      baseRange,
                      effectiveActionType,
                      0.5,
                    );
                    const cursorNearTraj = distToTraj <= 1.0;
                    canReachBall = !isRedZone && reachesTrajPoint && cursorNearTraj;
                    if (typeof window !== 'undefined' && (window as any).__bdo_reach_log) {
                      const dxDbg = mouseFieldPct.x - drawingFrom.field_x!;
                      const dyDbg = mouseFieldPct.y - drawingFrom.field_y!;
                      console.log('[REACH][render]', { tCursor: tCursor.toFixed(2), d: Math.hypot(dxDbg, dyDbg).toFixed(1), baseRange: baseRange.toFixed(1), factor: getBallSpeedFactor(effectiveActionType), distToTraj: distToTraj.toFixed(2), reaches: reachesTrajPoint, near: cursorNearTraj, purple: canReachBall });
                    }
                  } else {
                    // Stationary ball holder — if within reach, can tackle
                    const distToBH = Math.sqrt((mouseFieldPct.x - bfx) ** 2 + (mouseFieldPct.y - bfy) ** 2);
                    canReachBall = distToBH <= (circleRadiusField + INTERCEPT_RADIUS + 2);
                  }

                  // Tackle cooldown: hide purple circle if player is blocked from tackling
                  // (tackle scenario = ball holder is dribbling with a 'move' action)
                  const isTackleScenario = effectiveBallTrajectoryAction?.action_type === 'move';
                  if (isTackleScenario && tackleBlockedIds.has(drawingAction.fromParticipantId)) {
                    canReachBall = false;
                  }
                }

                // Loose-ball scenario: the ball rolls from looseBallPos along
                // ballInertiaDir. Purple iff (a) the cursor sits on/near the
                // rolling path, (b) the player can PHYSICALLY reach the claim
                // point, and (c) the player arrives at the claim point before
                // the ball rolls past it — without (c) a far-away player could
                // claim near the start of the arrow, but by the time they get
                // there the ball has already left.
                if (isMove && isLooseBall && looseBallPos &&
                    drawingFrom.field_x != null && drawingFrom.field_y != null) {
                  const FIELD_Y_SCALE = INNER_H / INNER_W;
                  const looseBallRange = computeMaxMoveRange(drawingAction.fromParticipantId);
                  const circleRadiusField = 9 / INNER_W * 100;

                  // Cursor → nearest point on the ball's rolling segment, and
                  // the time-fraction the ball reaches that projected point.
                  const INERTIA_DISPLAY = inertiaConsumedRef.current ? 0.08 : 0.15;
                  const endX = ballInertiaDir ? looseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY : looseBallPos.x;
                  const endY = ballInertiaDir ? looseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY : looseBallPos.y;
                  const segDx = endX - looseBallPos.x;
                  const segDy = endY - looseBallPos.y;
                  const segLenSq = segDx * segDx + segDy * segDy;
                  let tBallAtTarget = 0;
                  let projX = looseBallPos.x;
                  let projY = looseBallPos.y;
                  if (segLenSq > 1e-6) {
                    tBallAtTarget = ((mouseFieldPct.x - looseBallPos.x) * segDx + (mouseFieldPct.y - looseBallPos.y) * segDy) / segLenSq;
                    tBallAtTarget = Math.max(0, Math.min(1, tBallAtTarget));
                    projX = looseBallPos.x + segDx * tBallAtTarget;
                    projY = looseBallPos.y + segDy * tBallAtTarget;
                  }
                  const cxP = (mouseFieldPct.x - projX);
                  const cyP = (mouseFieldPct.y - projY) * FIELD_Y_SCALE;
                  const distCursorToPath = Math.sqrt(cxP * cxP + cyP * cyP);

                  // Player → claim target (Y-scaled, same as engine).
                  const pxToT = (mouseFieldPct.x - drawingFrom.field_x!);
                  const pyToT = (mouseFieldPct.y - drawingFrom.field_y!) * FIELD_Y_SCALE;
                  const distPlayerToTarget = Math.sqrt(pxToT * pxToT + pyToT * pyToT);

                  const withinCircle = distCursorToPath <= circleRadiusField + INTERCEPT_RADIUS + 1;
                  const withinReach = distPlayerToTarget <= looseBallRange + 0.5;
                  // Temporal: player must arrive before (or as) ball passes.
                  // 0.15 slack mirrors findLooseBallClaimer in the engine.
                  const tPlayer = looseBallRange > 0 ? distPlayerToTarget / looseBallRange : 1;
                  const inTime = tPlayer <= tBallAtTarget + 0.15;

                  if (withinCircle && withinReach && inTime) {
                    canReachBall = true;
                  }
                }

                const circleColor = canReachBall ? 'rgba(139,92,246,0.35)' : 'rgba(34,197,94,0.15)';
                const circleStroke = canReachBall ? 'rgba(139,92,246,0.7)' : 'rgba(34,197,94,0.45)';
                const glowColor = canReachBall ? 'rgba(139,92,246,0.3)' : 'rgba(34,197,94,0.3)';
                const glowStroke = canReachBall ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)';

                // Positioning-phase attention pulse: only for the user's OWN player during
                // a positioning turn. Makes the cursor circle pulse amber to grab attention
                // now that the drawing is auto-activated (no need to click-to-select first).
                const showPositioningPulse = isMove
                  && isMyPositioningPhase
                  && isPlayer
                  && drawingAction?.fromParticipantId === myParticipant?.id;

                return (
                  <>
                    {/* Outer glow around active player (all actions) */}
                    <circle cx={fromSvg.x} cy={fromSvg.y} r={18} fill="none" stroke={glowColor} strokeWidth="2" filter="url(#pulse-glow)" />
                    <circle cx={fromSvg.x} cy={fromSvg.y} r={14} fill="none" stroke={glowStroke} strokeWidth="4" />
                    {/* Action circle at cursor (only for MOVE) — green=can't reach, purple=can reach */}
                    {isMove && (
                      <circle cx={cursorSvg.x} cy={cursorSvg.y} r={9} fill={circleColor} stroke={circleStroke} strokeWidth="1.2" />
                    )}
                    {/* Amber attention pulse overlay — tight loop, catches the eye */}
                    {showPositioningPulse && (
                      <>
                        <circle cx={cursorSvg.x} cy={cursorSvg.y} r={9} fill="none" stroke="#f59e0b" strokeWidth="2">
                          <animate attributeName="opacity" values="0.95;0.25;0.95" dur="0.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={cursorSvg.x} cy={cursorSvg.y} r={9} fill="none" stroke="#fbbf24" strokeWidth="1.5">
                          <animate attributeName="r" from="9" to="16" dur="0.6s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.75" to="0" dur="0.6s" repeatCount="indefinite" />
                        </circle>
                      </>
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
                  const moveDist = getFieldMoveDist(mdx, mdy);
                  let maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);

                  // Apply ball speed factor to match engine behavior. GK skips this: their
                  // bonus comes from getGkAreaMultiplier (already applied inside computeMaxMoveRange).
                  const previewActionType = ballTrajectoryAction.action_type;
                  const previewIsGK = drawingFrom.field_pos === 'GK' || drawingFrom.slot_position === 'GK';
                  if (!previewIsGK) {
                    const previewBallSpeedFactor =
                      (previewActionType === 'shoot_power' || previewActionType === 'header_power') ? 0.25 :
                      (previewActionType === 'shoot_controlled' || previewActionType === 'header_controlled') ? 0.35 :
                      previewActionType === 'pass_launch' ? 0.65 :
                      (previewActionType === 'pass_high' || previewActionType === 'header_high') ? 0.65 :
                      1.0;
                    maxRange *= previewBallSpeedFactor;
                  }

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
                        Bola {Math.round(movePct * 100)}%
                      </text>
                    </g>
                  );
              })()}

              {/* Players */}
              {(() => {
                // Z-order: winner of any overlap renders on top. Priority used by the
                // engine's bump pass = ball holder first, then higher `forca`. Same order
                // here so the circle that "wins" the push is drawn last (top-most in SVG).
                const bhIdForZ = activeTurn?.ball_holder_participant_id ?? null;
                const zRank = (p: Participant): number => {
                  if (p.id === bhIdForZ) return 1e6;
                  const attrs = playerAttrsMap[p.id];
                  return Number(attrs?.forca ?? 40);
                };
                const rendered = [...homePlayers, ...awayPlayers].slice().sort((a, b) => zRank(a) - zRank(b));
                return rendered;
              })().map((p, idx) => {
                if (p.field_x == null || p.field_y == null) return null;
                // Sent-off players are removed from the pitch visually (team plays with 10).
                if (p.is_sent_off) return null;
                const animPos = getAnimatedPos(p);
                const basePos = toSVG(p.field_x ?? 50, p.field_y ?? 50);
                const svgAnimPos = toSVG(animPos.x, animPos.y);
                const tx = svgAnimPos.x - basePos.x;
                const ty = svgAnimPos.y - basePos.y;
                const x = basePos.x;
                const y = basePos.y;
                const isHome = p.club_id === match.home_club_id;
                const isBH = activeTurn?.ball_holder_participant_id === p.id;
                const isMe = p.id === myParticipant?.id;
                const isSelected = p.id === selectedParticipantId;
                const isControllable = (isManager && p.club_id === myClubId) || (isPlayer && p.id === myParticipant?.id);
                const hasSubmitted = allSubmittedIds.has(p.id);
                const isPulsingNewCarrier = possessionChangePulse === p.id;
                const R = 9;

                return (
                  <g key={p.id}
                    ref={(el) => { if (el) playerGroupRefsMap.current.set(p.id, el); }}
                    transform={`translate(${tx},${ty})`}
                    data-player-id={p.id}
                    data-base-x={basePos.x}
                    data-base-y={basePos.y}
                    onClick={(e) => { if (!drawingAction) e.stopPropagation(); handlePlayerClick(p.id); }}
                    style={{ cursor: isControllable ? 'pointer' : 'default' }}
                  >
                    {/* Native tooltip on hover: jersey + name + position */}
                    <title>
                      {`${p.jersey_number ? `#${p.jersey_number} ` : ''}${p.player_name ?? 'Jogador'}${p.field_pos ? ` (${p.field_pos})` : ''}`}
                    </title>
                    {/* Positioning-phase cue on YOUR own avatar: pulsing amber ring + small
                        outward wave — makes it impossible to miss that it's your turn to act.
                        Scoped to the viewer's own positioning phase so the defending side
                        doesn't flash during the attacking side's positioning turn. */}
                    {isMyPositioningPhase && isControllable && !hasSubmitted && (
                      <>
                        <circle cx={x} cy={y} r={R + 4} fill="none" stroke="#f59e0b" strokeWidth="2" opacity={0.85} filter="url(#pulse-glow)">
                          <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r={R + 4} fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity={0.6}>
                          <animate attributeName="r" from={String(R + 4)} to={String(R + 14)} dur="1.2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" repeatCount="indefinite" />
                        </circle>
                      </>
                    )}
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
                    {/* Controlled-avatar highlight: amber ring around whoever the viewer
                        is controlling. Manager → the participant they selected. Player →
                        their own avatar (always). Same visual so the controlled unit is
                        unmistakable in both views. */}
                    {((isManager && isSelected) || (isPlayer && isMe)) && (
                      <circle cx={x} cy={y} r={R + 3} fill="none" stroke="#f59e0b" strokeWidth="2" opacity={0.9} filter="url(#glow)" />
                    )}
                    {hasSubmitted && (
                      <circle cx={x} cy={y} r={R + 3} fill="none" stroke="#22c55e" strokeWidth="1" opacity={0.6} />
                    )}
                    <circle
                      cx={x} cy={y} r={R}
                      fill={p.field_pos === 'GK' ? (isHome ? homeGKUniform.shirt_color : awayGKUniform.shirt_color) : (isHome ? homeActiveUniform.shirt_color : awayActiveUniform.shirt_color)}
                      stroke={isMe ? '#fff' : 'rgba(0,0,0,0.4)'}
                      strokeWidth={isMe ? 1.5 : 0.8}
                      filter="url(#shadow)"
                    />
                    {/* Pattern overlay on player circle */}
                    {(() => {
                      const uniform = p.field_pos === 'GK'
                        ? (isHome ? homeGKUniform : awayGKUniform)
                        : (isHome ? homeActiveUniform : awayActiveUniform);
                      if (!uniform.pattern || uniform.pattern === 'solid') return null;
                      const sc = uniform.stripe_color || '#fff';
                      const pat = uniform.pattern;
                      // Vertical (unique = single center line, single/double/triple = repeating)
                      if (pat.startsWith('stripe_vertical')) {
                        if (pat.includes('unique')) return <line x1={x} y1={y-R+1} x2={x} y2={y+R-1} stroke={sc} strokeWidth="3" opacity="0.9"/>;
                        if (pat.includes('triple')) return <><line x1={x-4} y1={y-R+2} x2={x-4} y2={y+R-2} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x} y1={y-R+1} x2={x} y2={y+R-1} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x+4} y1={y-R+2} x2={x+4} y2={y+R-2} stroke={sc} strokeWidth="1" opacity="0.8"/></>;
                        if (pat.includes('double')) return <><line x1={x-3} y1={y-R+1} x2={x-3} y2={y+R-1} stroke={sc} strokeWidth="1.5" opacity="0.8"/><line x1={x+3} y1={y-R+1} x2={x+3} y2={y+R-1} stroke={sc} strokeWidth="1.5" opacity="0.8"/></>;
                        return <line x1={x} y1={y-R+1} x2={x} y2={y+R-1} stroke={sc} strokeWidth="2" opacity="0.8"/>;
                      }
                      // Horizontal
                      if (pat.startsWith('stripe_horizontal')) {
                        if (pat.includes('unique')) return <line x1={x-R+1} y1={y} x2={x+R-1} y2={y} stroke={sc} strokeWidth="3" opacity="0.9"/>;
                        if (pat.includes('triple')) return <><line x1={x-R+2} y1={y-4} x2={x+R-2} y2={y-4} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x-R+1} y1={y} x2={x+R-1} y2={y} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x-R+2} y1={y+4} x2={x+R-2} y2={y+4} stroke={sc} strokeWidth="1" opacity="0.8"/></>;
                        if (pat.includes('double')) return <><line x1={x-R+1} y1={y-3} x2={x+R-1} y2={y-3} stroke={sc} strokeWidth="1.5" opacity="0.8"/><line x1={x-R+1} y1={y+3} x2={x+R-1} y2={y+3} stroke={sc} strokeWidth="1.5" opacity="0.8"/></>;
                        return <line x1={x-R+1} y1={y} x2={x+R-1} y2={y} stroke={sc} strokeWidth="2" opacity="0.8"/>;
                      }
                      // Diagonal
                      if (pat.startsWith('stripe_diagonal')) {
                        if (pat.includes('unique')) return <line x1={x-R+2} y1={y+R-2} x2={x+R-2} y2={y-R+2} stroke={sc} strokeWidth="3" opacity="0.9"/>;
                        if (pat.includes('triple')) return <><line x1={x-R+1} y1={y+R-5} x2={x+R-5} y2={y-R+1} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x-R+2} y1={y+R-2} x2={x+R-2} y2={y-R+2} stroke={sc} strokeWidth="1" opacity="0.8"/><line x1={x-R+5} y1={y+R-1} x2={x+R-1} y2={y-R+5} stroke={sc} strokeWidth="1" opacity="0.8"/></>;
                        if (pat.includes('double')) return <><line x1={x-R+2} y1={y+R-5} x2={x+R-5} y2={y-R+2} stroke={sc} strokeWidth="1.5" opacity="0.8"/><line x1={x-R+5} y1={y+R-2} x2={x+R-2} y2={y-R+5} stroke={sc} strokeWidth="1.5" opacity="0.8"/></>;
                        return <line x1={x-R+2} y1={y+R-2} x2={x+R-2} y2={y-R+2} stroke={sc} strokeWidth="2" opacity="0.8"/>;
                      }
                      // Bicolor: vertical (right half), horizontal (bottom half), diagonal (triangle)
                      if (pat === 'bicolor_vertical') return <path d={`M${x},${y-R} A${R},${R} 0 0,1 ${x},${y+R} L${x},${y-R}`} fill={sc} opacity="0.9"/>;
                      if (pat === 'bicolor_horizontal') return <path d={`M${x-R},${y} A${R},${R} 0 0,0 ${x+R},${y} L${x-R},${y}`} fill={sc} opacity="0.9"/>;
                      if (pat === 'bicolor_diagonal') return <path d={`M${x-R+1},${y+R-1} L${x+R-1},${y-R+1} L${x+R-1},${y+R-1} Z`} fill={sc} opacity="0.9"/>;
                      return null;
                    })()}
                    <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
                      fontSize="7" fontWeight="800"
                      fontFamily="'Barlow Condensed', sans-serif"
                      fill={p.field_pos === 'GK' ? (isHome ? homeGKUniform.number_color : awayGKUniform.number_color) : (isHome ? homeActiveUniform.number_color : awayActiveUniform.number_color)}
                    >
                      {p.jersey_number || idx + 1}
                    </text>
                    {p.player_profile_id && (
                      (isHome && p.player_profile_id === homeCaptainProfileId) ||
                      (!isHome && p.player_profile_id === awayCaptainProfileId)
                    ) && (
                      <text x={x + R + 2} y={y - R + 2} textAnchor="start" fontSize="6" fontWeight="900"
                        fontFamily="'Barlow Condensed', sans-serif" fill="#fbbf24" stroke="#000" strokeWidth="0.3"
                      >C</text>
                    )}
                    {/* Inertia arrow: small triangle at the rim pointing where the player
                        moved LAST turn. Color encodes the inertia_power they spent (0%→
                        black/faded, 1-33%→yellow, 34-66%→orange, 67-100%→red). No arrow
                        when they stayed still — prevDirectionsRef drops the entry on a
                        no-move turn and on dead-ball restarts, so the visual disappears
                        exactly when the inertia bonus is actually gone. */}
                    {(() => {
                      // Hide while the resolution animation is playing — the refs still
                      // hold the PREVIOUS turn's data until animation end, which would
                      // show a stale arrow on a player visibly moving a different way.
                      if (animating) return null;
                      const prevDir = prevDirectionsRef.current[p.id];
                      if (!prevDir) return null;
                      // Convert field-% delta to SVG delta so the tip points the right way
                      // on the non-square pitch, then normalise.
                      const sdx = (prevDir.x / 100) * INNER_W;
                      const sdy = (prevDir.y / 100) * INNER_H;
                      const len = Math.sqrt(sdx * sdx + sdy * sdy);
                      if (len < 0.01) return null;
                      const ux = sdx / len;
                      const uy = sdy / len;
                      const power = inertiaPowerRef.current[p.id] ?? 100;
                      let fill: string, stroke: string, op: number;
                      if (power <= 0)       { fill = '#1a1a1a'; stroke = '#000'; op = 0.55; }
                      else if (power <= 33) { fill = '#fbbf24'; stroke = '#000'; op = 0.95; }
                      else if (power <= 66) { fill = '#f97316'; stroke = '#000'; op = 0.95; }
                      else                  { fill = '#ef4444'; stroke = '#000'; op = 0.95; }
                      const tipR = R + 3.5;
                      const baseR = R - 0.5;
                      const half = 2.4;
                      const tipX = x + ux * tipR, tipY = y + uy * tipR;
                      const baseCX = x + ux * baseR, baseCY = y + uy * baseR;
                      const px = -uy, py = ux; // perpendicular
                      const b1x = baseCX + px * half, b1y = baseCY + py * half;
                      const b2x = baseCX - px * half, b2y = baseCY - py * half;
                      return (
                        <polygon
                          pointerEvents="none"
                          points={`${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`}
                          fill={fill} stroke={stroke} strokeWidth="0.5"
                          strokeLinejoin="round" opacity={op}
                        />
                      );
                    })()}
                  </g>
                );
              })}

              {ballDisplayPos && (() => {
                const { x, y } = toSVG(ballDisplayPos.x, ballDisplayPos.y);
                const r = 5.5;
                // Shadow stays on ground, shrinks/fades as ball lifts
                const shadowScale = ballArcLift > 0 ? Math.max(0.4, 1 - ballArcLift / 60) : 1;
                const shadowOpacity = ballArcLift > 0 ? Math.max(0.1, 0.3 - ballArcLift / 150) : 0.3;
                return (
                  <g pointerEvents="none" ref={ballGroupRef} data-base-x={x} data-base-y={y}>
                    {/* Shadow (stays on ground) */}
                    <ellipse cx={x + 0.8} cy={y + 2.5} rx={r * 0.9 * shadowScale} ry={r * 0.35 * shadowScale} fill={`rgba(0,0,0,${shadowOpacity})`} />
                    {/* Ball body (lifts with arc) */}
                    <g transform={`translate(0 ${-ballArcLift})`}>
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
                  </g>
                );
              })()}

              {/* Contest visual effect during phase 4 */}
              {contestEffect && (() => {
                const pos = toSVG(contestEffect.x, contestEffect.y);
                // Color palette: green = in-possession/positive for the attacker,
                // red = defender stop, amber = referee-neutral, red-card = deep red.
                const POSITIVE = '#22c55e', NEGATIVE = '#ef4444', AMBER = '#f59e0b', GOLD = '#fbbf24';
                let color = POSITIVE;
                switch (contestEffect.type) {
                  case 'tackle_success':
                  case 'block':
                  case 'intercept':
                  case 'save':
                  case 'tackle_fail':
                  case 'receive_fail':
                  case 'red_card':
                    color = NEGATIVE; break;
                  case 'dribble':
                  case 'receive_ok':
                    color = POSITIVE; break;
                  case 'foul':
                  case 'yellow_card':
                  case 'penalty':
                    color = AMBER; break;
                  case 'goal':
                    color = GOLD; break;
                }
                // Goal gets a bigger, longer flash.
                const isGoal = contestEffect.type === 'goal';
                const maxR = isGoal ? 55 : 35;
                const dur = isGoal ? '2.2s' : '1.5s';
                const bgColor = `${color}26`; // ~15% alpha
                return (
                  <g pointerEvents="none">
                    {/* Expanding ring */}
                    <circle cx={pos.x} cy={pos.y} r={8} fill="none" stroke={color} strokeWidth={isGoal ? 3.5 : 2.5} opacity="0.7">
                      <animate attributeName="r" from="8" to={String(maxR)} dur={dur} fill="freeze" />
                      <animate attributeName="opacity" from="0.9" to="0" dur={dur} fill="freeze" />
                    </circle>
                    {/* Inner flash */}
                    <circle cx={pos.x} cy={pos.y} r={12} fill={bgColor}>
                      <animate attributeName="r" from="6" to={String(maxR * 0.6)} dur="0.9s" fill="freeze" />
                      <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" fill="freeze" />
                    </circle>
                    {/* Label */}
                    <text x={pos.x} y={pos.y - 22} textAnchor="middle" fontSize={isGoal ? 12 : 8} fontWeight="800"
                      fontFamily="'Barlow Condensed', sans-serif" fill={color}>
                      <animate attributeName="y" from={String(pos.y - 14)} to={String(pos.y - 34)} dur={dur} fill="freeze" />
                      <animate attributeName="opacity" from="1" to="0" dur="2s" fill="freeze" />
                      {contestEffect.label}
                    </text>
                  </g>
                );
              })()}
            </PitchSVG>

            {/* Action menu overlay */}
            {showActionMenu && !drawingAction && (() => {
              const menuPos = getActionMenuScreenPos(showActionMenu);
              if (!menuPos) return null;
              const actions = getActionsForParticipant(showActionMenu);
              if (actions.length === 0) return null;
              const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
              if (!containerRect) return null;
              return (
                <MatchActionMenu
                  actions={actions}
                  menuPos={menuPos}
                  containerRect={containerRect}
                  showActionMenu={showActionMenu}
                  submittingAction={submittingAction}
                  onSelect={handleActionMenuSelect}
                  participants={participants}
                  ballTrajectoryAction={ballTrajectoryAction}
                  ballTrajectoryHolder={ballTrajectoryHolder}
                  pendingInterceptChoice={pendingInterceptChoice}
                  match={match}
                  activeBallHolderId={activeTurn?.ball_holder_participant_id}
                />
              );
            })()}

            {/* Help button — floating "?" at top-right of the field */}
            <button
              onClick={() => setHelpOpen(true)}
              className="fixed top-2 right-12 z-50 bg-[hsl(220,20%,12%)]/90 border border-[hsl(220,10%,30%)] rounded-md w-7 h-7 flex items-center justify-center text-[12px] font-display font-bold text-[hsl(45,30%,80%)] shadow-lg hover:bg-[hsl(220,20%,18%)] md:right-14"
              aria-label="Ajuda"
              title="Como jogar"
            >
              ?
            </button>

            {/* Pass/Shot quality indicator */}
            {drawingAction && drawingFrom && mouseFieldPct && drawingAction.type !== 'move' && (() => {
              const color = getArrowQuality(drawingFrom.field_x!, drawingFrom.field_y!, mouseFieldPct.x, mouseFieldPct.y, drawingAction.type, drawingAction.fromParticipantId);
              const label = color === '#22c55e' ? 'Boa' : color === '#f59e0b' ? 'Media' : 'Ruim';
              const isShoot = isAnyShootAction(drawingAction.type);
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

            {/* Energy bar: shown for player (own energy) or manager (selected player).
                Look up fresh from `participants` instead of using the cached `myParticipant`
                state (that one only updates when the ID changes — energy updates via realtime
                land in `participants`). */}
            {(() => {
              const energyParticipant = isPlayer && myParticipant
                ? (participants.find(p => p.id === myParticipant.id) ?? myParticipant)
                : (isManager && selectedParticipantId)
                  ? participants.find(p => p.id === selectedParticipantId && p.club_id === myClubId)
                  : null;
              if (!energyParticipant || !isLive) return null;
              const energy = Number(energyParticipant.match_energy ?? 100);
              const barColor = energy > 50 ? '#22c55e' : energy > 30 ? '#f59e0b' : energy > 15 ? '#f97316' : '#ef4444';
              const playerName = energyParticipant.player_name || `#${energyParticipant.jersey_number ?? '?'}`;
              const posLabel = energyParticipant.field_pos || energyParticipant.slot_position || '';
              return (
                <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-[hsl(140,10%,8%)] rounded px-3 py-1.5 border border-[hsl(140,10%,20%)] z-30">
                  <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                    {posLabel} {playerName}
                  </span>
                  <div className="w-20 h-3 bg-[hsl(140,10%,15%)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${energy}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="text-[10px] font-display font-bold tabular-nums" style={{ color: barColor }}>{Math.round(energy)}%</span>
                </div>
              );
            })()}

            {/* Inertia arrow UI moved to SVG overlay below */}

            {/* Clock moved to scoreboard — removed from field */}

            {(animating || isPhaseProcessing) && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[hsl(220,20%,10%)]/90 border border-tactical/40 rounded px-4 py-1.5 z-40">
                <span className="text-[11px] font-display font-bold text-tactical animate-pulse">
                  {isPhaseProcessing ? `⏸ ${processingLabel}` : '⚡ MOTION — Resolvendo jogada...'}
                </span>
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
        <MatchSidebar
          activeTurn={activeTurn}
          phaseTimeLeft={phaseTimeLeft}
          currentTurnNumber={match.current_turn_number}
          possessionClub={possClubId === match.home_club_id ? homeClub : awayClub}
          currentPhaseDuration={currentPhaseDuration}
          isLooseBall={!!isLooseBall}
          isHalftime={match.current_half === 2 && !!match.half_started_at && new Date(match.half_started_at).getTime() > Date.now()}
          timerDisplayRef={timerDisplayRef}
          timerBarRef={timerBarRef}
          homeClub={homeClub}
          awayClub={awayClub}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          ballHolderId={activeTurn?.ball_holder_participant_id ?? null}
          myId={myParticipant?.id ?? null}
          selectedId={selectedParticipantId}
          onSelectPlayer={handlePlayerClick}
          submittedIds={allSubmittedIds}
          homeBench={homeBenchMemo}
          awayBench={awayBenchMemo}
          isManager={isManager}
          myClubId={myClubId}
          onSubstitute={handleSubstitute}
          pendingSubstitutions={pendingSubstitutions}
          substitutedOutIds={substitutedOutIds}
          homeAccOpen={homeAccOpen}
          awayAccOpen={awayAccOpen}
          logAccOpen={logAccOpen}
          onToggleHome={() => setHomeAccOpen(!homeAccOpen)}
          onToggleAway={() => setAwayAccOpen(!awayAccOpen)}
          onToggleLog={() => setLogAccOpen(!logAccOpen)}
          chatAccOpen={chatAccOpen}
          onToggleChat={() => setChatAccOpen(!chatAccOpen)}
          events={events}
          eventsEndRef={eventsEndRef}
          match={match}
          matchId={matchId!}
          userId={user?.id ?? null}
          username={profile?.username ?? null}
          onToggleReady={handleToggleReady}
          onMarkTeamReady={handleMarkTeamReady}
          canMarkReady={(p) => {
            if (!user) return false;
            if (p.connected_user_id === user.id) return true;
            return isManager && p.club_id === myClubId;
          }}
        />
      </div>
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}



