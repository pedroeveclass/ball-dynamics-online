import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, User, Eye, ChevronDown, ChevronRight, Square } from 'lucide-react';

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

// ─── Constants ────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  ball_holder: 'Portador', attacking_support: 'Ataque',
  defending_response: 'Defesa', resolution: 'Motion', pre_match: 'Pré-jogo',
};

const ACTION_LABELS: Record<string, string> = {
  move: 'MOVER', pass_low: 'PASSAR', pass_high: 'PASSE ALTO',
  shoot: 'CHUTAR', press: 'PRESSIONAR', intercept: 'INTERCEPTAR',
  block_lane: 'BLOQUEAR', no_action: 'SEM AÇÃO', receive: 'DOMINAR BOLA',
};

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PHASE_DURATION = 6;

// ─── Drawing state ────────────────────────────────────────────
interface DrawingState {
  type: 'move' | 'pass_low' | 'pass_high' | 'shoot';
  fromParticipantId: string;
}

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
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(PHASE_DURATION);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Interactive drawing
  const [drawingAction, setDrawingAction] = useState<DrawingState | null>(null);
  const [mouseFieldPct, setMouseFieldPct] = useState<{ x: number; y: number } | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [submittedActions, setSubmittedActions] = useState<Set<string>>(new Set());

  // Persisted actions for current turn (loaded from DB)
  const [turnActions, setTurnActions] = useState<MatchAction[]>([]);

  // Animation state for phase 4
  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const [resolutionStartPositions, setResolutionStartPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Accordion states
  const [homeAccOpen, setHomeAccOpen] = useState(false);
  const [awayAccOpen, setAwayAccOpen] = useState(false);
  const [logAccOpen, setLogAccOpen] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const animatedResolutionIdRef = useRef<string | null>(null);

  // ── Load match data ──────────────────────────────────────────
  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!m) return;

    if (m.status === 'scheduled' && new Date(m.scheduled_at) <= new Date()) {
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
    setActiveTurn(turn as MatchTurn | null);

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

  // ── Phase countdown timer ────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!activeTurn || match?.status !== 'live') return;
    tickRef.current = setInterval(() => {
      const remaining = Math.max(0, new Date(activeTurn.ends_at).getTime() - Date.now());
      setPhaseTimeLeft(Math.ceil(remaining / 1000));
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeTurn, match?.status]);

  // Reset local submission cache only when a brand-new turn starts
  useEffect(() => {
    setSubmittedActions(new Set());
    setResolutionStartPositions({});
    animatedResolutionIdRef.current = null;
  }, [activeTurn?.turn_number]);

  useEffect(() => {
    setDrawingAction(null);
    setShowActionMenu(null);
    setAnimating(false);
    setAnimProgress(0);
  }, [activeTurn?.id, activeTurn?.phase]);

  // Auto-show action menu for ball holder in phase 1
  useEffect(() => {
    if (!activeTurn || match?.status !== 'live') return;
    if (activeTurn.phase === 'ball_holder' && activeTurn.ball_holder_participant_id) {
      const bh = participants.find(p => p.id === activeTurn.ball_holder_participant_id);
      if (bh && !allSubmittedIds.has(bh.id) && (
        (myRole === 'player' && myParticipant?.id === bh.id) ||
        (myRole === 'manager' && bh.club_id === myClubId)
      )) {
        setShowActionMenu(bh.id);
        setSelectedParticipantId(bh.id);
      }
    }
  }, [activeTurn?.phase, activeTurn?.id, match?.status, participants, myRole, myParticipant?.id, myClubId, allSubmittedIds]);

  // ── Engine tick ─────────────────────────────────────────────
  useEffect(() => {
    if (engineRef.current) clearInterval(engineRef.current);
    if (match?.status !== 'live' || !matchId) return;
    const tick = async () => {
      await callEngine({ action: 'tick', match_id: matchId });
      const [matchRes, turnRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).single(),
        supabase.from('match_turns').select('*').eq('match_id', matchId).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (matchRes.data) setMatch(matchRes.data as MatchData);
      if (turnRes.data !== undefined) setActiveTurn(turnRes.data as MatchTurn | null);
      // Reload actions after tick
      loadTurnActions();
      // Reload participants to get updated positions
      const { data: parts } = await supabase.from('match_participants').select('*').eq('match_id', matchId);
      if (parts) {
        // Re-enrich participants with updated pos_x/pos_y
        reEnrichParticipants(parts, matchRes.data as MatchData);
      }
    };
    engineRef.current = setInterval(tick, 2500);
    return () => { if (engineRef.current) clearInterval(engineRef.current); };
  }, [match?.status, matchId]);

  // Helper to re-enrich participants after position updates
  const reEnrichParticipants = useCallback(async (parts: any[], matchData: MatchData) => {
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
  }, [matchId, homeClub, awayClub]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_actions', filter: `match_id=eq.${matchId}` }, () => {
        loadTurnActions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants', filter: `match_id=eq.${matchId}` }, () => {
        // Reload participants when positions update
        supabase.from('match_participants').select('*').eq('match_id', matchId).then(({ data }) => {
          if (data && match) reEnrichParticipants(data, match);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, match, reEnrichParticipants, loadTurnActions]);

  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  // ── Helpers ──────────────────────────────────────────────────
  const callEngine = async (body: Record<string, unknown>) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify(body),
        }
      );
    } catch (e) { console.error('Engine call failed:', e); }
  };

  const submitAction = async (actionType: string, participantId?: string, targetX?: number, targetY?: number, targetParticipantId?: string) => {
    const pid = participantId || selectedParticipantId;
    if (!matchId || !pid) return;
    setSubmittingAction(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify({
            action: 'submit_action', match_id: matchId,
            participant_id: pid, action_type: actionType,
            target_x: targetX, target_y: targetY,
            target_participant_id: targetParticipantId,
          }),
        }
      );
      const result = await resp.json();
      if (result.error) toast.error(result.error);
      else {
        setSubmittedActions(prev => new Set([...prev, pid]));
        toast.success(`✅ ${ACTION_LABELS[actionType] || actionType}`);
        // Reload actions immediately
        loadTurnActions();
      }
    } catch { toast.error('Erro ao enviar ação'); }
    finally { setSubmittingAction(false); }
  };

  const finishMatch = async () => {
    if (!matchId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify({ action: 'finish_match', match_id: matchId }),
        }
      );
      toast.success('Partida finalizada!');
      loadMatch();
    } catch { toast.error('Erro ao finalizar'); }
  };

  const handleActionMenuSelect = (actionType: string, participantId: string) => {
    if (actionType === 'no_action') {
      // No action = stay in place, submit move to current pos
      const p = participants.find(x => x.id === participantId);
      submitAction('move', participantId, p?.field_x, p?.field_y);
      setShowActionMenu(null);
      return;
    }
    if (actionType === 'receive') {
      submitAction('move', participantId);
      setShowActionMenu(null);
      return;
    }
    setDrawingAction({ type: actionType as DrawingState['type'], fromParticipantId: participantId });
    setShowActionMenu(null);
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

    if (drawingAction.type === 'shoot') {
      submitAction('shoot', drawingAction.fromParticipantId, pctX, pctY);
    } else if (drawingAction.type === 'pass_low' || drawingAction.type === 'pass_high') {
      submitAction(drawingAction.type, drawingAction.fromParticipantId, pctX, pctY, nearPlayer?.id);
    } else {
      submitAction('move', drawingAction.fromParticipantId, pctX, pctY);
    }
    setDrawingAction(null);
    setMouseFieldPct(null);
  };

  const handlePlayerClick = (participantId: string) => {
    if (drawingAction) {
      const p = participants.find(x => x.id === participantId);
      if (p && (drawingAction.type === 'pass_low' || drawingAction.type === 'pass_high')) {
        submitAction(drawingAction.type, drawingAction.fromParticipantId, p.field_x, p.field_y, participantId);
        setDrawingAction(null);
        setMouseFieldPct(null);
        return;
      }
    }

    const isManager = myRole === 'manager';
    const p = participants.find(x => x.id === participantId);
    if (!p) return;

    if (isManager && p.club_id === myClubId && p.role_type === 'player') {
      setSelectedParticipantId(participantId);
      if (match?.status === 'live' && activeTurn && !allSubmittedIds.has(participantId)) {
        const phase = activeTurn.phase;
        const isBH = activeTurn.ball_holder_participant_id === participantId;
        const isAttacking = p.club_id === match.possession_club_id;
        if (
          (phase === 'ball_holder' && isBH) ||
          (phase === 'attacking_support' && isAttacking && !isBH) ||
          (phase === 'defending_response' && !isAttacking)
        ) {
          setShowActionMenu(participantId);
        }
      }
    } else if (myRole === 'player' && myParticipant?.id === participantId) {
      setSelectedParticipantId(participantId);
      if (match?.status === 'live' && activeTurn && !allSubmittedIds.has(participantId)) {
        setShowActionMenu(participantId);
      }
    }
  };

  // ─── Determine which actions are visible in current phase ───
  const visibleActions = useMemo(() => {
    if (!activeTurn || !match) return [];
    const phase = activeTurn.phase;
    const possClub = match.possession_club_id;

    return turnActions.filter(a => {
      const p = participants.find(x => x.id === a.participant_id);
      if (!p) return false;
      const isAttacking = p.club_id === possClub;
      const isBH = a.participant_id === activeTurn.ball_holder_participant_id;

      // Phase 1 (ball_holder): only show ball holder's own action if already submitted
      if (phase === 'ball_holder') {
        return isBH; // show ball holder action as it's submitted
      }
      // Phase 2 (attacking_support): show ball holder + attacking actions
      if (phase === 'attacking_support') {
        return isBH || (isAttacking && !isBH);
      }
      // Phase 3 (defending_response): show all actions (ball holder + attacking + defending)
      if (phase === 'defending_response') {
        return true; // defending team can see everything
      }
      // Phase 4 (resolution): show everything
      if (phase === 'resolution') {
        return true;
      }
      return false;
    });
  }, [turnActions, activeTurn, match, participants]);

  // ─── Animation for phase 4 ─────────────────────────────────
  useEffect(() => {
    if (!activeTurn || activeTurn.phase !== 'resolution') return;
    if (turnActions.length === 0) return;

    // Start animation
    setAnimating(true);
    const startTime = Date.now();
    const duration = 2000; // 2 seconds animation

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      setAnimProgress(progress);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setAnimating(false);
        // After animation, update participant positions locally from their actions
        setParticipants(prev => prev.map(p => {
          const action = turnActions.find(a => a.participant_id === p.id && a.action_type === 'move' && a.target_x != null);
          if (action && action.target_x != null && action.target_y != null) {
            return { ...p, field_x: action.target_x, field_y: action.target_y };
          }
          return p;
        }));
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeTurn?.phase, activeTurn?.id, turnActions]);

  // ── Compute animated positions ─────────────────────────────
  const getAnimatedPos = (p: Participant): { x: number; y: number } => {
    if (!animating || activeTurn?.phase !== 'resolution') {
      return { x: p.field_x ?? 50, y: p.field_y ?? 50 };
    }
    const action = turnActions.find(a => a.participant_id === p.id && a.target_x != null);
    if (!action || action.target_x == null || action.target_y == null) {
      return { x: p.field_x ?? 50, y: p.field_y ?? 50 };
    }
    const startX = p.field_x ?? 50;
    const startY = p.field_y ?? 50;
    // Ease out cubic
    const t = 1 - Math.pow(1 - animProgress, 3);
    return {
      x: startX + (action.target_x - startX) * t,
      y: startY + (action.target_y - startY) * t,
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

  const possClubId = match.possession_club_id;
  const isTestMatch = homePlayers.length <= 4 && awayPlayers.length <= 4;

  // Get actions for current phase
  const getActionsForParticipant = (participantId: string): string[] => {
    if (!activeTurn) return [];
    const p = participants.find(x => x.id === participantId);
    if (!p) return [];
    const phase = activeTurn.phase;
    const isBH = activeTurn.ball_holder_participant_id === participantId;
    const isAttacking = p.club_id === match.possession_club_id;

    if (phase === 'ball_holder' && isBH) return ['move', 'pass_low', 'shoot'];
    if (phase === 'attacking_support' && isAttacking && !isBH) return ['no_action', 'move'];
    if (phase === 'defending_response' && !isAttacking) return ['no_action', 'move'];
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

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingAction || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    setMouseFieldPct({ x: Math.max(0, Math.min(100, fp.x)), y: Math.max(0, Math.min(100, fp.y)) });
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingAction || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    handleFieldClick(Math.max(0, Math.min(100, fp.x)), Math.max(0, Math.min(100, fp.y)));
  };

  // Ball holder position
  const ballHolder = [...homePlayers, ...awayPlayers].find(p => p.id === activeTurn?.ball_holder_participant_id);

  // Arrow from drawing action
  const drawingFrom = drawingAction ? participants.find(p => p.id === drawingAction.fromParticipantId) : null;

  // Shot target: for shoot, arrow goes toward the goal
  const getShootTarget = (fromPart: Participant): { x: number; y: number } => {
    const isHome = fromPart.club_id === match.home_club_id;
    return isHome ? { x: 98, y: 50 } : { x: 2, y: 50 };
  };

  // Arrow quality based on distance
  const getArrowQuality = (fromX: number, fromY: number, toX: number, toY: number, type: string): string => {
    const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    if (type === 'shoot') {
      if (dist < 30) return '#22c55e';
      if (dist < 50) return '#f59e0b';
      return '#ef4444';
    }
    if (dist < 20) return '#22c55e';
    if (dist < 40) return '#f59e0b';
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

  const phaseProgress = phaseTimeLeft > 0 ? phaseTimeLeft / PHASE_DURATION : 0;

  // Get arrow color for action type
  const getActionArrowColor = (action: MatchAction, fromPart: Participant): { color: string; markerId: string; strokeW: number } => {
    if (action.action_type === 'move') {
      return { color: '#1a1a2e', markerId: 'ah-black', strokeW: 2 };
    }
    if (action.action_type === 'shoot') {
      const color = action.target_x != null && fromPart.field_x != null
        ? getArrowQuality(fromPart.field_x, fromPart.field_y!, action.target_x, action.target_y!, 'shoot')
        : '#f59e0b';
      const markerId = color === '#22c55e' ? 'ah-green' : color === '#f59e0b' ? 'ah-yellow' : 'ah-red';
      return { color, markerId, strokeW: 3.5 };
    }
    // pass
    const color = action.target_x != null && fromPart.field_x != null
      ? getArrowQuality(fromPart.field_x, fromPart.field_y!, action.target_x, action.target_y!, 'pass')
      : '#06b6d4';
    const markerId = color === '#22c55e' ? 'ah-green' : color === '#f59e0b' ? 'ah-yellow' : 'ah-red';
    return { color, markerId, strokeW: 3 };
  };

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
        </div>

        {/* Score */}
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
                {/* Arrow markers */}
                <marker id="ah-black" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#1a1a2e" /></marker>
                <marker id="ah-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#22c55e" /></marker>
                <marker id="ah-yellow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#f59e0b" /></marker>
                <marker id="ah-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#ef4444" /></marker>
                <marker id="ah-cyan" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#06b6d4" /></marker>
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

              {/* ── Persisted action arrows (visible based on phase) ── */}
              {!animating && visibleActions.map(action => {
                if (action.target_x == null || action.target_y == null) return null;
                const fromPart = participants.find(p => p.id === action.participant_id);
                if (!fromPart || fromPart.field_x == null || fromPart.field_y == null) return null;

                const from = toSVG(fromPart.field_x, fromPart.field_y);
                const to = toSVG(action.target_x, action.target_y);
                const { color, markerId, strokeW } = getActionArrowColor(action, fromPart);

                // Show controller badge
                const controlLabel = action.controlled_by_type === 'bot' ? '🤖' : action.controlled_by_type === 'manager' ? '📋' : '👤';

                return (
                  <g key={action.id}>
                    <line
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={color} strokeWidth={strokeW}
                      strokeLinecap="round" opacity={0.7}
                      markerEnd={`url(#${markerId})`}
                      strokeDasharray={action.controlled_by_type === 'bot' ? '4,3' : 'none'}
                    />
                    {/* Small label at midpoint */}
                    <text
                      x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.6)"
                      fontFamily="'Barlow Condensed', sans-serif"
                    >
                      {controlLabel} {ACTION_LABELS[action.action_type] || action.action_type}
                    </text>
                  </g>
                );
              })}

              {/* Drawing arrow (follows mouse) */}
              {drawingAction && drawingFrom && mouseFieldPct && (() => {
                const from = toSVG(drawingFrom.field_x!, drawingFrom.field_y!);
                let to: { x: number; y: number };
                if (drawingAction.type === 'shoot') {
                  const goalTarget = getShootTarget(drawingFrom);
                  to = toSVG(goalTarget.x, Math.max(38, Math.min(62, mouseFieldPct.y)));
                } else {
                  to = toSVG(mouseFieldPct.x, mouseFieldPct.y);
                }
                const isMove = drawingAction.type === 'move';
                const color = isMove ? '#1a1a2e' : getArrowQuality(drawingFrom.field_x!, drawingFrom.field_y!, mouseFieldPct.x, mouseFieldPct.y, drawingAction.type);
                const markerId = isMove ? 'ah-black' : color === '#22c55e' ? 'ah-green' : color === '#f59e0b' ? 'ah-yellow' : 'ah-red';
                const strokeW = isMove ? 2 : drawingAction.type === 'shoot' ? 3.5 : 3;

                return (
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={color} strokeWidth={strokeW}
                    strokeLinecap="round" opacity={0.85}
                    markerEnd={`url(#${markerId})`}
                  />
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
                const hasSubmitted = submittedActions.has(p.id);
                const R = 9;

                return (
                  <g key={p.id}
                    onClick={(e) => { e.stopPropagation(); handlePlayerClick(p.id); }}
                    style={{ cursor: isControllable ? 'pointer' : 'default' }}
                  >
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
                    {isBH && (
                      <g>
                        <circle cx={x + R} cy={y - R} r={4.5} fill="white" stroke="#333" strokeWidth="0.5" />
                        <text x={x + R} y={y - R + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="5">⚽</text>
                      </g>
                    )}
                  </g>
                );
              })}
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
                  {actions.map(a => (
                    <button
                      key={a}
                      disabled={submittingAction}
                      onClick={() => handleActionMenuSelect(a, showActionMenu)}
                      className="w-full text-left px-3 py-1 text-xs font-display font-bold text-[hsl(220,20%,20%)] hover:bg-[hsl(45,30%,80%)] transition-colors flex items-center gap-2"
                    >
                      {a === 'move' && <span className="text-[10px]">↗</span>}
                      {a === 'pass_low' && <span className="text-[10px]">⚡</span>}
                      {a === 'shoot' && <span className="text-[10px]">🎯</span>}
                      {a === 'no_action' && <span className="text-[10px]">⊘</span>}
                      {a === 'receive' && <span className="text-[10px]">🤲</span>}
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Pass/Shot quality indicator */}
            {drawingAction && drawingFrom && mouseFieldPct && drawingAction.type !== 'move' && (() => {
              const color = getArrowQuality(drawingFrom.field_x!, drawingFrom.field_y!, mouseFieldPct.x, mouseFieldPct.y, drawingAction.type);
              const label = color === '#22c55e' ? 'Boa' : color === '#f59e0b' ? 'Média' : 'Ruim';
              return (
                <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-[hsl(140,10%,8%)] rounded px-3 py-1.5 border border-[hsl(140,10%,20%)]">
                  <span className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                    {drawingAction.type === 'shoot' ? 'Shot' : 'Pass'} Quality:
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

            {/* Phase 4 animation overlay */}
            {animating && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[hsl(220,20%,10%)]/90 border border-tactical/40 rounded px-4 py-1.5 z-40">
                <span className="text-[11px] font-display font-bold text-tactical animate-pulse">⚡ MOTION — Resolvendo jogada...</span>
              </div>
            )}

            {/* Status overlay for non-live */}
            {!isLive && !isFinished && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <p className="font-display text-lg text-white/80">
                  {new Date(match.scheduled_at) <= new Date() ? 'Iniciando engine...' : `Começa: ${new Date(match.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
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
              submittedIds={submittedActions}
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
              submittedIds={submittedActions}
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
function TurnWheel({ currentPhase, timeLeft, turnNumber, possessionClub }: {
  currentPhase: string | null; timeLeft: number; turnNumber: number;
  possessionClub: ClubInfo | null;
}) {
  const phases = [
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

  const sweepProgress = currentIdx >= 0 ? (1 - timeLeft / PHASE_DURATION) : 0;

  const phaseColors: Record<string, string> = {
    ball_holder: '#22c55e',
    attacking_support: '#eab308',
    defending_response: '#f59e0b',
    resolution: '#6b7280',
  };

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
          const fillColor = isActive
            ? (phaseColors[phases[i].key] || '#22c55e')
            : isPast ? 'hsl(140,20%,18%)' : 'hsl(220,15%,20%)';

          return (
            <g key={i}>
              <path
                d={arcPath(q.startAngle, q.endAngle, R_INNER, R_OUTER)}
                fill={fillColor}
                opacity={isActive ? 1 : isPast ? 0.6 : 0.35}
                stroke={isActive ? '#fff' : 'hsl(220,10%,15%)'}
                strokeWidth={isActive ? 1.5 : 0.5}
              />
              {(() => {
                const lp = labelPos(q.startAngle, q.endAngle, (R_INNER + R_OUTER) / 2);
                return (
                  <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central"
                    fontSize="14" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
                    fill={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                  >
                    {phases[i].label}
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
              fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="4" strokeLinecap="round"
            />
          );
        })()}

        <circle cx={CX} cy={CY} r={R_INNER - 2} fill="hsl(220,20%,8%)" stroke="hsl(220,10%,15%)" strokeWidth="1" />
        <line x1={CX - 6} y1={CY} x2={CX + 6} y2={CY} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1={CX} y1={CY - 6} x2={CX} y2={CY + 6} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />

        <text x={CX} y={CY - 2} textAnchor="middle" dominantBaseline="central"
          fontSize="12" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
          fill={currentPhase ? '#fff' : 'rgba(255,255,255,0.3)'}
        >
          {currentPhase ? (PHASE_LABELS[currentPhase] || 'Wait') : 'Wait'}
        </text>
        {currentPhase && timeLeft > 0 && (
          <text x={CX} y={CY + 10} textAnchor="middle"
            fontSize="9" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif"
            fill={timeLeft <= 2 ? '#ef4444' : 'rgba(255,255,255,0.5)'}
          >
            {timeLeft}s
          </text>
        )}
      </svg>

      {currentPhase && (
        <div className="w-full px-3">
          <div className="flex justify-between text-[9px] font-display text-muted-foreground mb-0.5">
            <span>{PHASE_LABELS[currentPhase]}</span>
            <span className={timeLeft <= 2 ? 'text-destructive' : ''}>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="h-1 rounded-full bg-[hsl(220,10%,20%)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${(timeLeft / PHASE_DURATION) * 100}%`,
                background: timeLeft > 3 ? 'hsl(var(--pitch-green))' : timeLeft > 1 ? 'hsl(var(--warning-amber))' : 'hsl(var(--destructive))',
              }}
            />
          </div>
        </div>
      )}

      {possessionClub && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: possessionClub.primary_color }} />
          <span className="text-[9px] font-display text-muted-foreground">⚽ {possessionClub.short_name}</span>
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
