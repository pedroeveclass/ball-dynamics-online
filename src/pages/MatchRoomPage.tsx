import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { sounds } from '@/lib/sounds';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getInitialMatchEngineFunction, invokeConfiguredMatchEngine } from '@/lib/matchEngine';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { DEFAULT_FORMATION, getFormationPositions } from '@/lib/formations';
import type { MatchData, ClubInfo, Participant, MatchTurn, EventLog, MatchAction, ClubUniform, PendingInterceptChoice, PlayerProfileSummary, LineupSlotSummary, TurnMeta, DrawingState } from './match/types';
import { PHASE_LABELS, ACTION_LABELS, PHASE_DURATION, POSITIONING_PHASE_DURATION, RESOLUTION_PHASE_DURATION, PRE_MATCH_COUNTDOWN_SECONDS, PRE_MATCH_COUNTDOWN_MS, LIVE_EVENT_LIMIT, TURN_ACTION_RECONCILE_DELAY_MS, CLIENT_MATCH_PROCESSOR_RETRY_MS, ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK, INTERCEPT_RADIUS, GOAL_LINE_OVERFLOW_PCT, ACTION_PHASE_ORDER, FIELD_W, FIELD_H, PAD, INNER_W, INNER_H, clamp, normalizeAttr, pointToSegmentDistance, isShootAction, isPassAction, isHeaderAction, isAnyShootAction, isAnyPassAction, formatScheduledDate, getBallZoneAtProgress } from './match/constants';
import { filterEffectiveTurnActions, dedupeAndSortTurnActions, buildParticipantLayout, buildParticipantAttrsMap } from './match/utils';
import { MatchScoreboard } from './match/MatchScoreboard';
import { MatchSidebar } from './match/MatchSidebar';
import { MatchActionMenu } from './match/MatchActionMenu';
import { PitchSVG, DEFAULT_STADIUM_STYLE } from '@/components/PitchSVG';
import type { StadiumStyle } from '@/components/PitchSVG';

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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTurn, setActiveTurn] = useState<MatchTurn | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
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
  const finalBallPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBallDirRef = useRef<{ dx: number; dy: number } | null>(null);
  const inertiaConsumedRef = useRef<boolean>(false);
  const prevTurnWasPositioningRef = useRef<boolean>(false);
  const oneTouchPendingForRef = useRef<string | null>(null);
  // Track resolution event logs so the animation end-state can incorporate actual results
  const resolutionEventsRef = useRef<EventLog[]>([]);

  // Possession change visual feedback
  const [possessionChangePulse, setPossessionChangePulse] = useState<string | null>(null);
  const prevPossClubRef = useRef<string | null>(null);

  // Contest visual feedback during phase 4
  const [contestEffect, setContestEffect] = useState<{ type: 'tackle_fail' | 'tackle_success' | 'block' | 'dribble' | 'save' | 'intercept'; x: number; y: number; label: string } | null>(null);

  // Captain IDs (player_profile_id) for captain armband display
  const [homeCaptainProfileId, setHomeCaptainProfileId] = useState<string | null>(null);
  const [awayCaptainProfileId, setAwayCaptainProfileId] = useState<string | null>(null);

  // Accordion states
  const [homeAccOpen, setHomeAccOpen] = useState(false);
  const [awayAccOpen, setAwayAccOpen] = useState(false);
  const [logAccOpen, setLogAccOpen] = useState(false);
  const [chatAccOpen, setChatAccOpen] = useState(true);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const animatedResolutionIdRef = useRef<string | null>(null);
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

    setTurnActionsState([
      ...turnActionsRef.current.filter(existing => !(
        existing.participant_id === optimisticAction.participant_id
        && existing.turn_phase === optimisticAction.turn_phase
        && String(existing.id).startsWith('optimistic-')
      )),
      optimisticAction,
    ]);
  }, [setTurnActionsState]);

  const appendEventLog = useCallback((event: EventLog) => {
    // Track resolution-relevant events so animation can incorporate actual results
    const resolutionEventTypes = ['blocked', 'intercepted', 'saved', 'tackle', 'possession_change', 'goal'];
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

      setTurnActionsState(enrichedActions);
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
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', matchData.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', matchData.away_club_id).single(),
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
        ? supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds)
        : Promise.resolve({ data: [] as PlayerProfileSummary[] }),
      slotIds.length > 0
        ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds)
        : Promise.resolve({ data: [] as LineupSlotSummary[] }),
    ]);

    playerProfileCacheRef.current = new Map((playersRes.data || []).map(player => [player.id, player as PlayerProfileSummary]));
    lineupSlotCacheRef.current = new Map((slotsRes.data || []).map(slot => [slot.id, slot as LineupSlotSummary]));

    const homePlayers = nextParticipantRows.filter(participant => participant.club_id === matchData.home_club_id && participant.role_type === 'player');
    const awayPlayers = nextParticipantRows.filter(participant => participant.club_id === matchData.away_club_id && participant.role_type === 'player');
    const isTestMatch = !matchData.home_lineup_id && !matchData.away_lineup_id;
    const isKickoffStart = (matchData.current_turn_number ?? 0) <= 1;

    const buildMissingBots = (list: Participant[], formation: string, isHome: boolean, clubId: string) => {
      if (isTestMatch || list.length >= 11) return [] as Array<Record<string, unknown>>;
      const positions = getFormationPositions(formation, isHome, isKickoffStart);
      const sorted = [...list].sort((a, b) => {
        const aSortOrder = a.lineup_slot_id ? lineupSlotCacheRef.current.get(a.lineup_slot_id)?.sort_order ?? null : null;
        const bSortOrder = b.lineup_slot_id ? lineupSlotCacheRef.current.get(b.lineup_slot_id)?.sort_order ?? null : null;
        if (aSortOrder != null && bSortOrder != null && aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
        if (aSortOrder != null && bSortOrder == null) return -1;
        if (aSortOrder == null && bSortOrder != null) return 1;
        const aPosition = a.lineup_slot_id ? lineupSlotCacheRef.current.get(a.lineup_slot_id)?.slot_position : null;
        const bPosition = b.lineup_slot_id ? lineupSlotCacheRef.current.get(b.lineup_slot_id)?.slot_position : null;
        const aIsGK = aPosition === 'GK' || (a.player_profile_id && playerProfileCacheRef.current.get(a.player_profile_id)?.primary_position === 'GK');
        const bIsGK = bPosition === 'GK' || (b.player_profile_id && playerProfileCacheRef.current.get(b.player_profile_id)?.primary_position === 'GK');
        if (aIsGK && !bIsGK) return -1;
        if (!aIsGK && bIsGK) return 1;
        return a.id.localeCompare(b.id);
      });

      const botsToInsert: Array<Record<string, unknown>> = [];
      for (let index = sorted.length; index < 11; index++) {
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

    const botsToInsert = [
      ...buildMissingBots(homePlayers, nextHomeClub.formation || DEFAULT_FORMATION, true, matchData.home_club_id),
      ...buildMissingBots(awayPlayers, nextAwayClub.formation || DEFAULT_FORMATION, false, matchData.away_club_id),
    ];

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
      const [matchRes, turnRes, eventsRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).single(),
        supabase.from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('match_event_logs').select('*').eq('match_id', matchId)
          .order('created_at', { ascending: false }).limit(LIVE_EVENT_LIMIT),
      ]);

      if (matchRes.data) {
        const matchData = matchRes.data as MatchData;
        matchRef.current = matchData;
        setMatch(matchData);
        if (participantRowsRef.current.length > 0) applyParticipantRows(participantRowsRef.current, matchData);
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

  // ── Determine user role ─────────────────────────────────────
  useEffect(() => {
    if (!user || !match) return;

    // 1. Check by connected_user_id (primary)
    let playerPart = participants.find(p => p.connected_user_id === user.id && p.role_type === 'player');

    // 2. Fallback: check by player_profile_id matching current active player profile
    if (!playerPart && playerProfile?.id) {
      playerPart = participants.find(p => p.player_profile_id === playerProfile.id && p.role_type === 'player');
      // Claim this participant: update connected_user_id in DB so future checks work
      if (playerPart && !playerPart.connected_user_id) {
        supabase.from('match_participants')
          .update({ connected_user_id: user.id, is_bot: false })
          .eq('id', playerPart.id)
          .then(() => {
            // Update local state too
            setParticipants(prev => prev.map(p =>
              p.id === playerPart!.id ? { ...p, connected_user_id: user.id, is_bot: false } : p
            ));
          });
      }
    }

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
      // Check if user is a bench player
      const benchPart = playerProfile?.id
        ? participants.find(p => p.player_profile_id === playerProfile.id && p.role_type === 'bench')
        : null;
      if (benchPart) {
        setMyRole('spectator');
        setMyParticipant(benchPart);
        setMyClubId(benchPart.club_id);
      } else {
        setMyRole('spectator'); setMyParticipant(null); setMyClubId(null);
      }
    }
  }, [user, participants, match, club, playerProfile]);

  const computeMaxMoveRange = useCallback((participantId: string, _targetDirection?: { x: number; y: number }, overrideMultiplier?: number): number => {
    const attrs = playerAttrsMap[participantId];
    const turnNum = match?.current_turn_number ?? 1;
    const vel = Number(attrs?.velocidade ?? 40);
    const accel = Number(attrs?.aceleracao ?? 40);
    const stam = Number(attrs?.stamina ?? 40);
    const accelFactor = 0.3 + normalizeAttr(accel) * 0.5;
    const maxSpeed = 8 + normalizeAttr(vel) * 11; // ~12% of field per turn for avg player
    const staminaDecay = 1.0 - (Math.max(0, turnNum - 20) / 40) * (1 - normalizeAttr(stam)) * 0.2;
    let range = 0;
    let speed = 0;

    for (let i = 0; i < 10; i += 1) {
      speed = speed * (1 - accelFactor) + (maxSpeed / 10) * staminaDecay * accelFactor;
      range += Math.min(speed, maxSpeed / 10);
    }

    const isBallHolder = activeTurn?.ball_holder_participant_id === participantId;
    if (isBallHolder) {
      if (activeTurn?.phase === 'attacking_support') {
        range *= 0.35; // BH move while passing/shooting
      } else if (activeTurn?.phase === 'ball_holder') {
        range *= 0.85; // BH conducting ball — 15% penalty
      }
    }

    if (overrideMultiplier != null) range *= overrideMultiplier;

    // One-touch turn: movement scaled by ball speed (faster ball = less reaction time)
    const oneTouchAct = turnActions.find(a =>
      a.payload && typeof a.payload === 'object' &&
      ((a.payload as any).one_touch_executed === true || (a.payload as any).one_touch === true)
    );
    if (oneTouchAct) {
      const originType = (oneTouchAct.payload as any).origin_action_type || 'pass_low';
      const otSpeedFactor =
        (originType === 'shoot_power' || originType === 'header_power') ? 0.25 :
        (originType === 'shoot_controlled' || originType === 'header_controlled') ? 0.35 :
        originType === 'pass_launch' ? 0.5 :
        (originType === 'pass_high' || originType === 'header_high') ? 0.65 :
        1.0;
      range *= otSpeedFactor * 0.5;
    }

    return range;
  }, [playerAttrsMap, match?.current_turn_number, activeTurn?.ball_holder_participant_id, activeTurn?.phase, turnActions]);

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

  // Reset local submission cache only when a brand-new turn starts
  useEffect(() => {
    setSubmittedActions(new Set());
    setResolutionStartPositions({});
    setFinalPositions({});
    resolutionEventsRef.current = [];

    if (activeTurn?.ball_holder_participant_id == null) {
      if (carriedLooseBallPos) {
        // Ball was ALREADY loose — check if inertia was consumed
        if (inertiaConsumedRef.current) {
          // Inertia already applied last turn — clear it, ball stays put
          setBallInertiaDir(null);
        }
        // If not consumed yet, keep ballInertiaDir alive for arrow/animation
      } else {
        // Ball JUST became loose — use ref for position (avoids race condition with state)
        const pos = finalBallPosRef.current || finalBallPos;
        if (pos) {
          setCarriedLooseBallPos(pos);
          inertiaConsumedRef.current = false;
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
      inertiaConsumedRef.current = false;
    }

    setFinalBallPos(null);
    finalBallPosRef.current = null;
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
      animProgressRef.current = 0;
    }
    // Track if this turn follows a positioning turn (dead ball)
    if (activeTurn?.phase === 'ball_holder') {
      // prevTurnWasPositioningRef is already set from the previous phase
    } else if (activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense') {
      prevTurnWasPositioningRef.current = true;
    } else {
      prevTurnWasPositioningRef.current = false;
    }
  }, [activeTurn?.id, activeTurn?.phase]);

  // Positioning turn detection
  const isPositioningTurn = activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense';
  const isPositioningAttack = activeTurn?.phase === 'positioning_attack';
  const isPositioningDefense = activeTurn?.phase === 'positioning_defense';
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

    // Only trigger visual during/near resolution
    const isContest = ['tackle', 'dribble', 'blocked', 'saved', 'intercepted', 'possession_change'].includes(last.event_type);
    if (!isContest) return;

    // Check recent events for contradictions (batched events arrive together)
    const recentTypes = new Set(events.slice(-8).map(e => e.event_type));
    // Don't show block/save effect if the shot actually missed
    if ((last.event_type === 'blocked' || last.event_type === 'saved') &&
        (recentTypes.has('shot_missed') || recentTypes.has('shot_over'))) return;
    // Don't show tackle effect if a dribble followed (tackle failed)
    if (last.event_type === 'tackle' && recentTypes.has('dribble')) return;
    
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
  // IMPORTANT: If there's already a one_touch_executed action for this turn, DON'T auto-open
  useEffect(() => {
    if (!activeTurn || match?.status !== 'live' || isPhaseProcessing) return;
    
    // Positioning turn: no auto-open action menu, players click manually
    if (isPositioningTurn) return;
    
    if (activeTurn.phase === 'ball_holder' && activeTurn.ball_holder_participant_id) {
      // Check if a one-touch action was already injected for this ball holder
      const hasOneTouchAction = turnActions.some(a =>
        a.participant_id === activeTurn.ball_holder_participant_id &&
        a.payload && typeof a.payload === 'object' &&
        ((a.payload as any).one_touch_executed === true || (a.payload as any).one_touch === true)
      );
      if (hasOneTouchAction) return;

      // Don't open if one-touch pending for this ball holder (set when user submitted one-touch last turn)
      if (oneTouchPendingForRef.current === activeTurn.ball_holder_participant_id) {
        oneTouchPendingForRef.current = null;
        // Also block with a delayed recheck in case realtime hasn't delivered the action yet
        return;
      }

      // Don't reopen if ball holder already submitted
      const bhAlreadySubmitted = submittedActions.has(activeTurn.ball_holder_participant_id);
      if (bhAlreadySubmitted) return;

      const bhHasAction = turnActions.some(a =>
        a.participant_id === activeTurn.ball_holder_participant_id &&
        a.action_type !== 'receive'
      );
      if (bhHasAction) return;

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
  }, [activeTurn?.phase, activeTurn?.id, match?.status, participants, myRole, myParticipant?.id, myClubId, isPhaseProcessing, isPositioningTurn, turnActions, submittedActions]);

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
              // Animation still running — wait for it to finish (max 2s safety)
              const waitForAnim = () => {
                if (!animFrameRef.current) { applyNewTurn(); return; }
                setTimeout(waitForAnim, 200);
              };
              setTimeout(waitForAnim, 200);
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
    const STALE_THRESHOLD_MS = 500; // fire quickly after phase expires
    const RETRY_INTERVAL = 2000;

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
        throw new Error('Erro ao enviar ação');
      }
      if (result.error) {
        if (result.recoverable || result.error === 'No active turn') {
          console.warn('[SUBMIT] No active turn - phase transition in progress, retrying...');
          await loadLiveSnapshot();
          toast.info('Turno em transicao, tente novamente');
        } else {
          toast.error(String(result.error));
        }
      }
      else {
        const currentTurn = activeTurnRef.current;
        if (currentTurn) {
          pushOptimisticTurnAction({
            match_id: matchId,
            match_turn_id: currentTurn.id,
            participant_id: pid,
            controlled_by_type: myRole === 'manager' ? 'manager' : 'player',
            controlled_by_user_id: user?.id ?? null,
            action_type: actionType,
            target_x: targetX ?? null,
            target_y: targetY ?? null,
            target_participant_id: targetParticipantId ?? null,
            status: 'pending',
            created_at: new Date().toISOString(),
            turn_phase: currentTurn.phase,
            turn_number: currentTurn.turn_number,
            payload: payload ?? null,
          });
        }
        setSubmittedActions(prev => new Set([...prev, pid]));
        scheduleTurnActionsReconcile(true);
        toast.success(`✅ ${ACTION_LABELS[actionType] || actionType}`);
        // Sound effects
        if (isAnyShootAction(actionType)) sounds.kick();
        else if (isAnyPassAction(actionType)) sounds.pass();
        else sounds.phaseChange();
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
      submitAction('move', participantId, p?.field_x, p?.field_y);
      setShowActionMenu(null);
      setPendingInterceptChoice(null);
      return;
    }
    if (actionType === 'receive' || actionType === 'block') {
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
          ? clamp(pctY, 38, 62)
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
      submitAction(drawingAction.type, drawingAction.fromParticipantId, goalTarget.x, clamp(pctY, 38, 62));
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
      if (
        drawingParticipant &&
        ballPathAction &&
        ballHolderNow?.field_x != null &&
        ballHolderNow.field_y != null &&
        ballPathAction.target_x != null &&
        ballPathAction.target_y != null &&
        (canContestBallPath || canContestCarrierMove)
      ) {
        const _bhIsBH = ballPathAction.participant_id === activeTurn?.ball_holder_participant_id;
        const _bhOriginX = _bhIsBH ? (ballHolderNow.field_x + 1.2) : ballHolderNow.field_x;
        const _bhOriginY = _bhIsBH ? (ballHolderNow.field_y - 1.2) : ballHolderNow.field_y;
        const _tdx = ballPathAction.target_x - _bhOriginX;
        const _tdy = ballPathAction.target_y - _bhOriginY;
        const _tlen2 = _tdx * _tdx + _tdy * _tdy;
        const _t = _tlen2 > 0 ? clamp(((pctX - _bhOriginX) * _tdx + (pctY - _bhOriginY) * _tdy) / _tlen2, 0, 1) : 0;
        const isRedZone = (ballPathAction.action_type === 'pass_high' && _t > 0.2 && _t < 0.8) ||
                          (ballPathAction.action_type === 'pass_launch' && _t > 0.35 && _t < 0.65);
        
        // Check reachability: can the player's action circle reach the ball BEFORE or AT the same time?
        let canReach = false;
        let interceptTargetX = pctX;
        let interceptTargetY = pctY;
        if (drawingParticipant.field_x != null && drawingParticipant.field_y != null) {
          const mdx = pctX - drawingParticipant.field_x;
          const mdy = pctY - drawingParticipant.field_y;
          const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
          let maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);

          // Apply ball speed factor for outfield players (GK uses full range on shots)
          const clickIsGK = drawingParticipant.field_pos === 'GK' || drawingParticipant.slot_position === 'GK';
          const clickActionType = ballPathAction.action_type;
          const clickIsShot = clickActionType === 'shoot_controlled' || clickActionType === 'shoot_power' || clickActionType === 'header_controlled' || clickActionType === 'header_power';
          if (!(clickIsGK && clickIsShot)) {
            const clickBallSpeedFactor =
              (clickActionType === 'shoot_power' || clickActionType === 'header_power') ? 0.25 :
              (clickActionType === 'shoot_controlled' || clickActionType === 'header_controlled') ? 0.35 :
              clickActionType === 'pass_launch' ? 0.5 :
              (clickActionType === 'pass_high' || clickActionType === 'header_high') ? 0.65 :
              1.0;
            maxRange *= clickBallSpeedFactor;
          }

          const movePct = maxRange > 0 ? Math.min(1, moveDist / maxRange) : 0;

          const bfx = _bhOriginX;
          const bfy = _bhOriginY;
          const btx = ballPathAction.target_x;
          const bty = ballPathAction.target_y;

          const circleRadiusField = 9 / INNER_W * 100;
          
          const tCursor = _tlen2 > 0 ? clamp(((pctX - bfx) * _tdx + (pctY - bfy) * _tdy) / _tlen2, 0, 1) : 0;
          const distToTraj = pointToSegmentDistance(pctX, pctY, bfx, bfy, btx, bty);
          
          // Proximity override: if the player is already on the trajectory, always allow
          const playerDistToTraj = pointToSegmentDistance(drawingParticipant.field_x, drawingParticipant.field_y!, bfx, bfy, btx, bty);
          const actionCircleR = 9 / INNER_W * 100;
          const isPlayerOnTrajectory = playerDistToTraj <= (actionCircleR + INTERCEPT_RADIUS + 1);

          // Direct click on trajectory line
          const directHit = distToTraj <= INTERCEPT_RADIUS && (movePct <= tCursor || isPlayerOnTrajectory);

          // Circle overlap: click must be near the trajectory OR the player's action circle
          // visually overlaps the ball path.
          let circleOverlap = false;
          if (!directHit && moveDist <= maxRange) {
            const timingCheck = tCursor >= 0.05 ? (movePct <= tCursor || isPlayerOnTrajectory) : moveDist <= 2.5;
            if (distToTraj <= (actionCircleR + INTERCEPT_RADIUS) && timingCheck) {
              circleOverlap = true;
            }
          }

          canReach = directHit || circleOverlap;
        }
        
        if (!isRedZone && canReach) {
          setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: interceptTargetX, targetY: interceptTargetY, trajectoryActionType: ballPathAction.action_type, trajectoryProgress: _t });
          setShowActionMenu(drawingAction.fromParticipantId);
          setDrawingAction(null);
          setMouseFieldPct(null);
          return;
        }
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
              // Allow intercept if player can reach the trajectory point OR is very close to the ball
              const distToBallDirect = Math.sqrt((pctX - looseBallPos.x) ** 2 + (pctY - looseBallPos.y) ** 2);
              if (movePct <= tCursor || distToBallDirect <= 3) {
                setPendingInterceptChoice({ participantId: drawingAction.fromParticipantId, targetX: pctX, targetY: pctY, trajectoryActionType: ballTrajectoryAction.action_type, trajectoryProgress: tCursor });
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
        // Circle overlap: player's movement circle from current position reaches the ball
        const dp = participants.find(p => p.id === drawingAction.fromParticipantId);
        if (dp && dp.field_x != null && dp.field_y != null) {
          const distPlayerToBall = Math.sqrt((dp.field_x - looseBallPos.x) ** 2 + (dp.field_y - looseBallPos.y) ** 2);
          const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId);
          if (distPlayerToBall <= maxRange + INTERCEPT_RADIUS) {
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
      if (p && isAnyPassAction(drawingAction.type)) {
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
          setShowActionMenu(participantId);
        }
      }
    }
  };

  // ─── Filter bot arrows when human already acted ───────────────
  const visibleActions = useMemo(() => {
    const humanActionedIds = new Set<string>();
    for (const pid of submittedActions) {
      humanActionedIds.add(pid);
    }
    return filterEffectiveTurnActions(turnActions, humanActionedIds);
  }, [turnActions, submittedActions]);

  // ─── Animation for phase 4 ─────────────────────────────────
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

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
    const maxRange = computeMaxMoveRange(action.participant_id, undefined, hasDeferredBallAction ? 0.35 : undefined);
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
      animProgressRef.current = 0;

      // Helper: compute eased position for a participant during animation
      const computeAnimPos = (pId: string, raw: number, actionsSnap: MatchAction[]) => {
        const startPos = snapshot[pId];
        if (!startPos) return null;
        const moveAction = actionsSnap.find(
          a => a.participant_id === pId && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null
        );
        if (!moveAction || moveAction.target_x == null || moveAction.target_y == null) {
          return startPos;
        }
        let t: number;
        if (raw < 0.3) {
          const seg = raw / 0.3;
          t = seg * seg * 0.3;
        } else if (raw < 0.8) {
          const seg = (raw - 0.3) / 0.5;
          t = 0.3 + seg * 0.55;
        } else {
          const seg = (raw - 0.8) / 0.2;
          t = 0.85 + (1 - Math.pow(1 - seg, 2)) * 0.15;
        }
        const effectiveTarget = getEffectiveActionTarget(moveAction, startPos, actionsSnap);
        return {
          x: startPos.x + ((effectiveTarget?.x ?? moveAction.target_x) - startPos.x) * t,
          y: startPos.y + ((effectiveTarget?.y ?? moveAction.target_y) - startPos.y) * t,
        };
      };

      // Helper: compute ball position during animation using refs
      const computeAnimBallPos = (raw: number, actionsSnap: MatchAction[]) => {
        const bhId = activeTurn?.ball_holder_participant_id ?? null;
        const bhPart = bhId ? participantsRef.current.find(p => p.id === bhId) : null;

        if (!bhPart) {
          // Loose ball with inertia
          if (ballInertiaDir && carriedLooseBallPos) {
            const INERTIA_DISPLAY = 0.15;
            const endX = clamp(carriedLooseBallPos.x + ballInertiaDir.dx * INERTIA_DISPLAY, 2, 98);
            const endY = clamp(carriedLooseBallPos.y + ballInertiaDir.dy * INERTIA_DISPLAY, 2, 98);
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

        const ballEaseK = (isAnyShootAction(ballAction.action_type) && ballAction.action_type !== 'shoot_controlled' && ballAction.action_type !== 'header_controlled') ? 5 : (ballAction.action_type === 'shoot_controlled' || ballAction.action_type === 'header_controlled') ? 3 : (ballAction.action_type === 'pass_high' || ballAction.action_type === 'header_high') ? 2.5 : ballAction.action_type === 'pass_launch' ? 3.5 : 3;
        const expDecay = 1 - Math.exp(-ballEaseK * raw);
        const normFactor = 1 - Math.exp(-ballEaseK);
        const t = expDecay / normFactor;

        const interceptAction = actionsSnap.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null) || null;

        if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
          const effectiveTarget = getEffectiveActionTarget(ballAction, startPos, actionsSnap);
          const endX = effectiveTarget?.x ?? ballAction.target_x;
          const endY = effectiveTarget?.y ?? ballAction.target_y;
          const dx = endX - startPos.x;
          const dy = endY - startPos.y;
          if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
            const len2 = dx * dx + dy * dy;
            const interceptT = len2 > 0 ? clamp(((interceptAction.target_x - startPos.x) * dx + (interceptAction.target_y - startPos.y) * dy) / len2, 0, 1) : 1;
            const effectiveT = Math.min(t, interceptT);
            return { x: startPos.x + dx * effectiveT + 1.2, y: startPos.y + dy * effectiveT - 1.2 };
          }
          return holderPos ? { x: holderPos.x + 1.2, y: holderPos.y - 1.2 } : defaultBallPos;
        }

        const isBallPass = isPassAction(ballAction.action_type) || (isHeaderAction(ballAction.action_type) && !isAnyShootAction(ballAction.action_type));
        const isBallShoot = isShootAction(ballAction.action_type) || isAnyShootAction(ballAction.action_type);
        if ((isBallPass || isBallShoot) && ballAction.target_x != null && ballAction.target_y != null) {
          if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
            const dx = ballAction.target_x - ballStartX;
            const dy = ballAction.target_y - ballStartY;
            const len2 = dx * dx + dy * dy;
            let interceptT = 1;
            if (len2 > 0) interceptT = clamp(((interceptAction.target_x - ballStartX) * dx + (interceptAction.target_y - ballStartY) * dy) / len2, 0, 1);
            const effectiveT = Math.min(t, interceptT);
            return { x: ballStartX + dx * effectiveT, y: ballStartY + dy * effectiveT };
          }
          if (isBallShoot) {
            const isHome = bhPart.club_id === matchRef.current?.home_club_id;
            const goalX = isHome ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT;
            return { x: ballStartX + (goalX - ballStartX) * t, y: ballStartY + (ballAction.target_y - ballStartY) * t };
          }
          return { x: ballStartX + (ballAction.target_x - ballStartX) * t, y: ballStartY + (ballAction.target_y - ballStartY) * t };
        }
        return defaultBallPos;
      };

      // Helper: compute ball arc lift
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
        let arcHeight = 0;
        if (actionType === 'pass_high' || actionType === 'header_high') arcHeight = 30;
        else if (actionType === 'pass_launch') arcHeight = 45;
        else if (actionType === 'shoot_controlled') arcHeight = 14;
        else if (actionType === 'shoot_power') arcHeight = 9;
        else return 0;
        return Math.sin(raw * Math.PI) * arcHeight;
      };

      const duration = 1800;
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
            // Both 'move' and 'receive' actions cause player to end at target
            const action = latestActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
            if (action && action.target_x != null && action.target_y != null) {
              const effectiveTarget = getEffectiveActionTarget(action, snapshot[p.id], latestActions);
              if (effectiveTarget) {
                finals[p.id] = effectiveTarget;
              }
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
                const effectiveTarget = getEffectiveActionTarget(moveAct, sp, latestActions);
                const ddx = (effectiveTarget?.x ?? sp.x) - sp.x;
                const ddy = (effectiveTarget?.y ?? sp.y) - sp.y;
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
          
           // Compute final ball position (bhId already declared above)
           const interceptAction = latestActions.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null);
           
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
                  const effectiveTarget = getEffectiveActionTarget(ballAction, snapshot[bhId], latestActions);
                  if (interceptAction && interceptAction.target_x != null && interceptAction.target_y != null) {
                    fbp = { x: interceptAction.target_x, y: interceptAction.target_y };
                  } else {
                    fbp = effectiveTarget ?? { x: ballAction.target_x, y: ballAction.target_y };
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
                  if (isNextTurnReady && nextTurn.ball_holder_participant_id && !wasIntercepted) {
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
                    const hasBlock = resEvents.some(e => e.event_type === 'blocked' || e.event_type === 'saved');
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
                    }
                  }

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
              // Mark inertia as consumed — ball will stop next turn
              inertiaConsumedRef.current = true;
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
  const getAnimatedPos = useCallback((p: Participant): { x: number; y: number } => {
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

    const effectiveTarget = getEffectiveActionTarget(moveAction, { x: startX, y: startY }, turnActions);
    const targetX = effectiveTarget?.x ?? moveAction.target_x;
    const targetY = effectiveTarget?.y ?? moveAction.target_y;

    // Calculate move distance as fraction of max range (~12% of field)
    const moveDist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
    const MAX_RANGE_APPROX = 12; // approximate max move range in field %
    const moveFraction = Math.min(1, moveDist / MAX_RANGE_APPROX);

    // Scale animation: player arrives at (moveFraction * 100%) of the animation timeline
    // e.g., if player moves 50% of max range, they arrive at 50% of the animation
    const raw = animProgressRef.current;
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
    () => participants.filter(p => p.club_id === match?.home_club_id && p.role_type === 'player'),
    [participants, match?.home_club_id]
  );
  const awayPlayersMemo = useMemo(
    () => participants.filter(p => p.club_id === match?.away_club_id && p.role_type === 'player'),
    [participants, match?.away_club_id]
  );
  const homeBenchMemo = useMemo(
    () => participants.filter(p => p.club_id === match?.home_club_id && p.role_type === 'bench'),
    [participants, match?.home_club_id]
  );
  const awayBenchMemo = useMemo(
    () => participants.filter(p => p.club_id === match?.away_club_id && p.role_type === 'bench'),
    [participants, match?.away_club_id]
  );

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
    const inBox = isGK && (isHome ? (gkX <= 18) : (gkX >= 82));

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

    // Tackle (move trajectory) or block-only = no one-touch options
    const isTackle = pendingInterceptChoice?.participantId === participantId && pendingInterceptChoice?.trajectoryActionType === 'move';
    const canOneTouch = receiveActions.includes('receive') && !isTackle;

    // One-touch actions: in yellow zone, offer BOTH header and foot actions
    const footOneTouchActions = ['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power'];
    const headerOneTouchActions = ['header_low', 'header_high', 'header_controlled', 'header_power'];
    const oneTouchActions = interceptZone === 'yellow'
      ? [...headerOneTouchActions, ...footOneTouchActions]
      : footOneTouchActions;

    // GK-specific: check if BH is GK
    const isGK = p?.field_pos === 'GK' || p?.slot_position === 'GK';

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
    // Ball holder can also mini-move in phase 2 (after passing/shooting in phase 1)
    if (phase === 'attacking_support' && isBH) return ['move', 'no_action'];
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
          const maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, direction);
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

  // Find if anyone intercepted the ball this turn (has a 'receive' action)
  const interceptorAction = turnActions.find(a => a.action_type === 'receive' && a.target_x != null && a.target_y != null) || null;

  // Loose ball position: persist across turns until someone regains possession
  const looseBallPos = (() => {
    if (!isLooseBall) return null;
    if (finalBallPos) return finalBallPos;
    if (carriedLooseBallPos) return carriedLooseBallPos;
    // Check event logs for ball position (ball_inertia, block, etc.)
    for (let i = events.length - 1; i >= Math.max(0, events.length - 5); i--) {
      const evt = events[i];
      const payload = evt.payload as any;
      if (payload?.x != null && payload?.y != null) return { x: Number(payload.x), y: Number(payload.y) };
      if (payload?.ball_x != null && payload?.ball_y != null) return { x: Number(payload.ball_x), y: Number(payload.ball_y) };
    }
    const lastBallAction = turnActions.find(a =>
      (isAnyPassAction(a.action_type) || isAnyShootAction(a.action_type) || a.action_type === 'move') &&
      a.target_x != null && a.target_y != null
    );
    if (lastBallAction) return { x: lastBallAction.target_x!, y: lastBallAction.target_y! };
    return null;
  })();



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

      // If BH has a move action, ball is IN FRONT of movement direction
      const moveAction = turnActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move' && a.target_x != null);
      if (moveAction?.target_x != null && moveAction?.target_y != null) {
        const dx = moveAction.target_x - startPos.x;
        const dy = moveAction.target_y - startPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.5) {
          return { x: playerPos.x + (dx / len) * BALL_DIST, y: playerPos.y + (dy / len) * BALL_DIST };
        }
      }

      // If BH has a pass/shoot action, ball is between player and target
      const ballAction = turnActions.find(a => a.participant_id === ballHolder.id && (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type)));
      if (ballAction?.target_x != null && ballAction?.target_y != null) {
        const dx = ballAction.target_x - startPos.x;
        const dy = ballAction.target_y - startPos.y;
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

    // Physics-based ball easing: exponential decay (fast launch, decelerating)
    const ballEaseK = (ballAction.action_type === 'shoot' || ballAction.action_type === 'shoot_power') ? 5 : ballAction.action_type === 'shoot_controlled' ? 3 : ballAction.action_type === 'pass_high' ? 2.5 : ballAction.action_type === 'pass_launch' ? 3.5 : 3;
    const rawT = animProgressRef.current;
    const expDecay = 1 - Math.exp(-ballEaseK * rawT);
    const normFactor = 1 - Math.exp(-ballEaseK);
    const t = expDecay / normFactor; // normalized to [0, 1]

    if (ballAction.action_type === 'move' && ballAction.target_x != null && ballAction.target_y != null) {
      const effectiveTarget = getEffectiveActionTarget(ballAction, startPos, turnActions);
      const endX = effectiveTarget?.x ?? ballAction.target_x;
      const endY = effectiveTarget?.y ?? ballAction.target_y;
      const dx = endX - startPos.x;
      const dy = endY - startPos.y;

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

  // ── Ball arc lift (visual only) for high passes, launches, and shots ──
  const ballArcLift = (() => {
    if (!animating || activeTurn?.phase !== 'resolution' || !ballHolder) return 0;
    const bhAllActions = turnActions
      .filter(a => a.participant_id === ballHolder.id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const ballAction = bhAllActions.find(a => isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type));
    if (!ballAction) return 0;

    const actionType = ballAction.action_type;
    let arcHeight = 0;
    if (actionType === 'pass_high' || actionType === 'header_high') arcHeight = 30;
    else if (actionType === 'pass_launch') arcHeight = 45;
    else if (actionType === 'shoot_controlled') arcHeight = 14;
    else if (actionType === 'shoot_power') arcHeight = 9;
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
      (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type) || a.action_type === 'move') &&
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
        myRole={myRole} isBenchPlayer={myRole === 'spectator' && myParticipant?.role_type === 'bench'} isManager={isManager} isPlayer={isPlayer}
        onFinishMatch={finishMatch} onExit={exitToDashboard}
        homeUniformNum={match.home_uniform ?? 1} awayUniformNum={match.away_uniform ?? 2}
        homeActiveUniform={homeActiveUniform} awayActiveUniform={awayActiveUniform}
        onToggleUniform={handleToggleUniform}
        myClubId={myClubId}
      />

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Field area (dominant) ── */}
        <div className="flex-1 flex items-center justify-center p-1 sm:p-2 relative" style={{ background: 'linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)' }}>
          <div className="relative w-full h-full flex items-center justify-center" style={{ maxWidth: 1200 }}>
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
              </defs>

              {/* ── Kickoff half-field overlay during positioning ── */}
              {isPositioningTurn && (() => {
                const bh = activeTurn?.ball_holder_participant_id ? participants.find(p => p.id === activeTurn.ball_holder_participant_id) : null;
                const isKickoff = bh && Math.abs((bh.field_x ?? bh.pos_x ?? 50) - 50) < 5 && Math.abs((bh.field_y ?? bh.pos_y ?? 50) - 50) < 5;
                if (!isKickoff) return null;
                const centerSvg = toSVG(50, 50);
                const CENTER_CIRCLE_RADIUS_PCT = 10; // matches engine constraint
                const circleRadiusSvgX = (CENTER_CIRCLE_RADIUS_PCT / 100) * INNER_W;
                const circleRadiusSvgY = (CENTER_CIRCLE_RADIUS_PCT / 100) * INNER_H;
                const possClubId = activeTurn?.possession_club_id;
                const drawingPlayer = drawingAction ? participants.find(p => p.id === drawingAction.fromParticipantId) : null;
                const isDrawingDefender = drawingPlayer && drawingPlayer.club_id !== possClubId;
                return (
                  <>
                    <ellipse cx={centerSvg.x} cy={centerSvg.y} rx={circleRadiusSvgX} ry={circleRadiusSvgY}
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

              {/* ── Intercept zone visualization ── */}
              {ballTrajectoryAction && ballTrajectoryHolder && ballTrajectoryHolder.field_x != null && ballTrajectoryHolder.field_y != null &&
                ballTrajectoryAction.target_x != null && ballTrajectoryAction.target_y != null &&
                (activeTurn?.phase === 'attacking_support' || activeTurn?.phase === 'defending_response') && (
                (() => {
                  const holderIsBH = ballTrajectoryAction?.participant_id === activeTurn?.ball_holder_participant_id;
                  const originX = holderIsBH ? (ballTrajectoryHolder.field_x! + 1.2) : ballTrajectoryHolder.field_x!;
                  const originY = holderIsBH ? (ballTrajectoryHolder.field_y! - 1.2) : ballTrajectoryHolder.field_y!;
                  const fromSvg = toSVG(originX, originY);
                  const toSvgPt = toSVG(ballTrajectoryAction.target_x!, ballTrajectoryAction.target_y!);
                  const dx = toSvgPt.x - fromSvg.x;
                  const dy = toSvgPt.y - fromSvg.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len < 1) return null;
                  // Perpendicular offset for the zone width
                  const px = (-dy / len) * (INTERCEPT_RADIUS / 100) * INNER_W;
                  const py = (dx / len) * (INTERCEPT_RADIUS / 100) * INNER_H;

                  // Determine which segments of the trajectory are interceptable (not red zone)
                  const actionType = ballTrajectoryAction.action_type;
                  let segments: [number, number][] = [[0, 1]]; // default: full trajectory
                  if (actionType === 'pass_high' || actionType === 'header_high') {
                    segments = [[0, 0.2], [0.8, 1]]; // red zone: 0.2-0.8
                  } else if (actionType === 'pass_launch') {
                    segments = [[0, 0.35], [0.65, 1]]; // red zone: 0.35-0.65
                  } else if (actionType === 'shoot_power' || actionType === 'header_power') {
                    segments = [[0, 0.3]]; // only early part
                  }

                  return (
                    <g>
                      {segments.map(([t0, t1], si) => {
                        const s0x = fromSvg.x + dx * t0;
                        const s0y = fromSvg.y + dy * t0;
                        const s1x = fromSvg.x + dx * t1;
                        const s1y = fromSvg.y + dy * t1;
                        const pts = [
                          `${s0x + px},${s0y + py}`,
                          `${s1x + px},${s1y + py}`,
                          `${s1x - px},${s1y - py}`,
                          `${s0x - px},${s0y - py}`,
                        ].join(' ');
                        return (
                          <polygon key={si}
                            points={pts}
                            fill="rgba(59, 130, 246, 0.08)"
                            stroke="rgba(59, 130, 246, 0.25)"
                            strokeWidth="1"
                            strokeDasharray="6,4"
                          />
                        );
                      })}
                    </g>
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

                // Hide bot arrows during positioning phases (they just clutter the field)
                if (action.controlled_by_type === 'bot' && isPositioningTurn) return null;

                // Hide BH deferred move arrow when they have a ball action (pass/shoot/header)
                if (action.action_type === 'move' && action.participant_id === activeTurn?.ball_holder_participant_id) {
                  const hasBallAction = visibleActions.some(a =>
                    a.participant_id === action.participant_id &&
                    (isPassAction(a.action_type) || isShootAction(a.action_type) || isHeaderAction(a.action_type))
                  );
                  if (hasBallAction) return null;
                }

                // Hide bot receive/block arrows that are clearly impossible
                if (action.controlled_by_type === 'bot' && (action.action_type === 'receive' || action.action_type === 'block')) {
                  const moveDist = Math.sqrt((fromPart.field_x - action.target_x!) ** 2 + (fromPart.field_y - action.target_y!) ** 2);
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
                // Pass/shoot arrows start from ball position
                const fromX = isBHAction ? (baseFromX + 1.2) : baseFromX;
                const fromY = isBHAction ? (baseFromY - 1.2) : baseFromY;
                const from = toSVG(fromX, fromY);
                const to = toSVG(action.target_x, action.target_y);
                const { color, markerId, strokeW } = getActionArrowColor(action, fromPart, { x: fromX, y: fromY });
                const controlLabel = action.controlled_by_type === 'bot' ? 'BOT' : action.controlled_by_type === 'manager' ? 'MGR' : 'PLR';
                const opacity = animating && activeTurn?.phase === 'resolution' ? 0.45 : 0.8;
                const dashArray = action.controlled_by_type === 'bot' ? '4,3' : 'none';

                // Multi-segment arrow rendering for height-based actions
                const renderMultiSegmentArrow = () => {
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;

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
                      stroke={visualType === 'pass_low' || visualType === 'shoot_controlled' ? '#22c55e' : color}
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
                    targetFieldY = Math.max(38, Math.min(62, mouseFieldPct.y));
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
                  toFieldY = Math.max(38, Math.min(62, mouseFieldPct.y));
                  to = toSVG(toFieldX, toFieldY);
                } else {
                  toFieldX = mouseFieldPct.x;
                  toFieldY = mouseFieldPct.y;
                  to = toSVG(toFieldX, toFieldY);
                }
                const isMove = drawingAction.type === 'move';
                const isShoot = isAnyShootAction(drawingAction.type);
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
                  let maxRange = computeMaxMoveRange(drawingAction.fromParticipantId, moveDist > 0.1 ? { x: mdx, y: mdy } : undefined);

                  // Apply ball speed factor for outfield players (GK uses full range on shots)
                  const actionType = effectiveBallTrajectoryAction.action_type;
                  const drawingIsGK = drawingFrom.field_pos === 'GK' || drawingFrom.slot_position === 'GK';
                  const isShot = actionType === 'shoot_controlled' || actionType === 'shoot_power' || actionType === 'header_controlled' || actionType === 'header_power';
                  if (!(drawingIsGK && isShot)) {
                    const ballSpeedFactor =
                      (actionType === 'shoot_power' || actionType === 'header_power') ? 0.25 :
                      (actionType === 'shoot_controlled' || actionType === 'header_controlled') ? 0.35 :
                      actionType === 'pass_launch' ? 0.5 :
                      (actionType === 'pass_high' || actionType === 'header_high') ? 0.65 :
                      1.0;
                    maxRange *= ballSpeedFactor;
                  }

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

                    // Red zone check: ball is too high to intercept
                    const actionType = effectiveBallTrajectoryAction.action_type;
                    const isRedZone = (actionType === 'pass_high' && tCursor > 0.2 && tCursor < 0.8) ||
                                      (actionType === 'pass_launch' && tCursor > 0.35 && tCursor < 0.65);

                    // Proximity override: if the player is already on the trajectory (barely needs to move), always allow
                    const playerDistToTraj = drawingFrom.field_x != null ? pointToSegmentDistance(drawingFrom.field_x, drawingFrom.field_y!, bfx, bfy, btx, bty) : Infinity;
                    const isPlayerOnTrajectory = playerDistToTraj <= (circleRadiusField + INTERCEPT_RADIUS + 1);

                    // Core reachability: player arrives at this trajectory point (tCursor) before ball does
                    // OR player is already standing on the ball's path
                    canReachBall = !isRedZone && distToTraj <= (circleRadiusField + INTERCEPT_RADIUS) && (movePct <= tCursor || isPlayerOnTrajectory);
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
                        Bola {Math.round(movePct * 100)}%
                      </text>
                    </g>
                  );
              })()}

              {/* Players */}
              {[...homePlayers, ...awayPlayers].map((p, idx) => {
                if (p.field_x == null || p.field_y == null) return null;
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

            {/* Energy bar: shown for player (own energy) or manager (selected player) */}
            {(() => {
              // Player sees own energy; manager sees selected player energy
              const energyParticipant = isPlayer && myParticipant
                ? myParticipant
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
          matchId={matchId!}
          userId={user?.id ?? null}
          username={profile?.username ?? null}
        />
      </div>
    </div>
  );
}



