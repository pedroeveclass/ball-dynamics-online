import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, User, Eye, Clock } from 'lucide-react';

// ─── Formation layouts ─────────────────────────────────────────
// Returns [{x, y, pos}] for 11 players, left side (home). Away mirrors.
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
  '3-5-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 25, pos: 'CB' }, { x: 22, y: 50, pos: 'CB' }, { x: 22, y: 75, pos: 'CB' },
    { x: 38, y: 10, pos: 'LWB' }, { x: 38, y: 32, pos: 'CM' }, { x: 38, y: 50, pos: 'CM' }, { x: 38, y: 68, pos: 'CM' }, { x: 38, y: 90, pos: 'RWB' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '5-3-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 20, y: 10, pos: 'LWB' }, { x: 20, y: 30, pos: 'CB' }, { x: 20, y: 50, pos: 'CB' }, { x: 20, y: 70, pos: 'CB' }, { x: 20, y: 90, pos: 'RWB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
};

const DEFAULT_FORMATION = '4-4-2';

function getFormationPositions(formation: string, isHome: boolean) {
  const base = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  if (isHome) return base;
  // Mirror for away: flip x (100 - x), keep y same
  return base.map(p => ({ ...p, x: 100 - p.x }));
}

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
  formation?: string;
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
  // Computed for display
  field_x?: number;
  field_y?: number;
  field_pos?: string;
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

interface ArrowAction {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'pass_low' | 'pass_high' | 'shoot' | 'move' | 'press' | 'intercept' | 'block_lane';
  quality: 'good' | 'ok' | 'bad';
  participantId: string;
}

// ─── Constants ────────────────────────────────────────────────
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

const PHASE_LABELS: Record<string, string> = {
  ball_holder: 'Portador',
  attacking_support: 'Ataque',
  defending_response: 'Defesa',
  resolution: 'Motion',
  pre_match: 'Pré-jogo',
};

const PHASE_NUMBERS: Record<string, number> = {
  ball_holder: 1,
  attacking_support: 2,
  defending_response: 3,
  resolution: 4,
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  live: 'Ao Vivo',
  finished: 'Encerrada',
};

const PHASE_ACTIONS: Record<string, string[]> = {
  ball_holder: ['pass_low', 'pass_high', 'shoot', 'move'],
  attacking_support: ['move', 'pass_low'],
  defending_response: ['press', 'intercept', 'block_lane', 'move'],
  resolution: [],
};

const ACTION_LABELS: Record<string, string> = {
  move: 'Mover',
  pass_low: 'Passe Curto',
  pass_high: 'Passe Longo',
  shoot: 'Chutar',
  press: 'Pressionar',
  intercept: 'Interceptar',
  block_lane: 'Bloquear Linha',
};

const ACTION_COLORS: Record<string, { stroke: string; quality: 'good' | 'ok' | 'bad' }> = {
  pass_low: { stroke: '#3b82f6', quality: 'good' },
  pass_high: { stroke: '#f59e0b', quality: 'ok' },
  shoot: { stroke: '#ef4444', quality: 'bad' },
  move: { stroke: '#1a1a2e', quality: 'good' },
  press: { stroke: '#f59e0b', quality: 'ok' },
  intercept: { stroke: '#22c55e', quality: 'good' },
  block_lane: { stroke: '#6b7280', quality: 'ok' },
};

// Quality color scale: green=good, amber=ok, red=bad
function getQualityColor(quality: number): string {
  if (quality >= 0.65) return '#22c55e';
  if (quality >= 0.35) return '#f59e0b';
  return '#ef4444';
}

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
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(6);
  const [submittingAction, setSubmittingAction] = useState(false);
  // Arrows shown on field
  const [fieldArrows, setFieldArrows] = useState<ArrowAction[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<string | null>(null);

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

    // Load clubs with formation from club_settings
    const [hcRes, acRes] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.home_club_id).single(),
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').eq('id', m.away_club_id).single(),
    ]);

    // Load formations from club_settings
    const [hSettings, aSettings] = await Promise.all([
      supabase.from('club_settings').select('default_formation').eq('club_id', m.home_club_id).maybeSingle(),
      supabase.from('club_settings').select('default_formation').eq('club_id', m.away_club_id).maybeSingle(),
    ]);

    const homeClubData: ClubInfo = {
      ...(hcRes.data as ClubInfo),
      formation: hSettings.data?.default_formation || DEFAULT_FORMATION,
    };
    const awayClubData: ClubInfo = {
      ...(acRes.data as ClubInfo),
      formation: aSettings.data?.default_formation || DEFAULT_FORMATION,
    };
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

      // Assign field positions based on formation
      const homeParts = enriched.filter(p => p.club_id === m.home_club_id && p.role_type === 'player');
      const awayParts = enriched.filter(p => p.club_id === m.away_club_id && p.role_type === 'player');

      const homeFmt = homeClubData.formation || DEFAULT_FORMATION;
      const awayFmt = awayClubData.formation || DEFAULT_FORMATION;
      const homePos = getFormationPositions(homeFmt, true);
      const awayPos = getFormationPositions(awayFmt, false);

      // Ensure always 11 for each side by filling with virtual slots
      const ensureEleven = (list: Participant[], positions: typeof homePos, isHome: boolean): Participant[] => {
        const result: Participant[] = list.slice(0, 11).map((p, i) => ({
          ...p,
          field_x: positions[i]?.x ?? (isHome ? 30 : 70),
          field_y: positions[i]?.y ?? 50,
          field_pos: p.slot_position || positions[i]?.pos || '?',
        }));
        // Fill remaining slots with virtual bots
        for (let i = result.length; i < 11; i++) {
          result.push({
            id: `virtual-${isHome ? 'home' : 'away'}-${i}`,
            match_id: matchId!,
            player_profile_id: null,
            club_id: isHome ? m.home_club_id : m.away_club_id,
            lineup_slot_id: null,
            role_type: 'player',
            is_bot: true,
            connected_user_id: null,
            pos_x: null,
            pos_y: null,
            field_x: positions[i]?.x ?? (isHome ? 30 : 70),
            field_y: positions[i]?.y ?? 50,
            field_pos: positions[i]?.pos ?? '?',
          });
        }
        return result;
      };

      const homeWithPos = ensureEleven(homeParts, homePos, true);
      const awayWithPos = ensureEleven(awayParts, awayPos, false);
      const managersAndSpecs = enriched.filter(p => p.role_type !== 'player');

      setParticipants([...homeWithPos, ...awayWithPos, ...managersAndSpecs]);
    } else {
      // No participants yet — create virtual 11v11
      const homePos = getFormationPositions(homeClubData.formation || DEFAULT_FORMATION, true);
      const awayPos = getFormationPositions(awayClubData.formation || DEFAULT_FORMATION, false);
      const virtual: Participant[] = [
        ...homePos.map((pos, i) => ({
          id: `virtual-home-${i}`,
          match_id: matchId!,
          player_profile_id: null,
          club_id: m.home_club_id,
          lineup_slot_id: null,
          role_type: 'player',
          is_bot: true,
          connected_user_id: null,
          pos_x: null,
          pos_y: null,
          field_x: pos.x,
          field_y: pos.y,
          field_pos: pos.pos,
        })),
        ...awayPos.map((pos, i) => ({
          id: `virtual-away-${i}`,
          match_id: matchId!,
          player_profile_id: null,
          club_id: m.away_club_id,
          lineup_slot_id: null,
          role_type: 'player',
          is_bot: true,
          connected_user_id: null,
          pos_x: null,
          pos_y: null,
          field_x: pos.x,
          field_y: pos.y,
          field_pos: pos.pos,
        })),
      ];
      setParticipants(virtual);
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
      .limit(60);
    setEvents(evts || []);

    setLoading(false);
  }, [matchId]);

  // ── Determine user role ─────────────────────────────────────
  useEffect(() => {
    if (!user || !match) return;

    const playerPart = participants.find(
      p => p.connected_user_id === user.id && p.role_type === 'player'
    );

    // Check if manager of home or away club
    const managerPart = participants.find(
      p => p.connected_user_id === user.id && p.role_type === 'manager'
    );

    // Also check via club from auth context (for manager who may not have participant entry yet)
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
      const clubId = managerPart?.club_id || (isManagerOfHome ? match.home_club_id : match.away_club_id);
      setMyClubId(clubId);
    } else {
      setMyRole('spectator');
      setMyParticipant(null);
      setMyClubId(null);
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
    }, 200);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeTurn, match?.status]);

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
    };

    engineRef.current = setInterval(tick, 2000);
    return () => { if (engineRef.current) clearInterval(engineRef.current); };
  }, [match?.status, matchId]);

  // ── Generate arrows when phase changes ──────────────────────
  useEffect(() => {
    if (!activeTurn || !match || match.status !== 'live') return;
    if (prevPhaseRef.current === activeTurn.phase) return;
    prevPhaseRef.current = activeTurn.phase;

    if (activeTurn.phase === 'resolution') {
      setFieldArrows([]);
      return;
    }

    const homeParts = participants.filter(p => p.club_id === match.home_club_id && p.role_type === 'player');
    const awayParts = participants.filter(p => p.club_id === match.away_club_id && p.role_type === 'player');
    const possPlayers = activeTurn.possession_club_id === match.home_club_id ? homeParts : awayParts;
    const defPlayers = activeTurn.possession_club_id === match.home_club_id ? awayParts : homeParts;
    const ballHolder = participants.find(p => p.id === activeTurn.ball_holder_participant_id);

    const arrows: ArrowAction[] = [];

    if (activeTurn.phase === 'ball_holder' && ballHolder) {
      // Ball holder arrow: shoot or pass
      const target = possPlayers.find(p => p.id !== ballHolder.id);
      const toX = target?.field_x ?? (ballHolder.club_id === match.home_club_id ? ballHolder.field_x! + 20 : ballHolder.field_x! - 20);
      const toY = target?.field_y ?? ballHolder.field_y!;
      const q = 0.5 + Math.random() * 0.4;
      arrows.push({
        fromX: ballHolder.field_x!,
        fromY: ballHolder.field_y!,
        toX: Math.max(2, Math.min(98, toX)),
        toY: Math.max(2, Math.min(98, toY)),
        type: Math.random() > 0.3 ? 'pass_low' : 'shoot',
        quality: q >= 0.65 ? 'good' : q >= 0.35 ? 'ok' : 'bad',
        participantId: ballHolder.id,
      });
    }

    if (activeTurn.phase === 'attacking_support') {
      // 2-3 supporters moving
      const supporters = possPlayers.filter(p => p.id !== ballHolder?.id).slice(0, 3);
      supporters.forEach(p => {
        const bh = ballHolder;
        const dx = bh ? (bh.field_x! - p.field_x!) * 0.3 : (Math.random() - 0.5) * 10;
        const dy = (Math.random() - 0.5) * 15;
        arrows.push({
          fromX: p.field_x!,
          fromY: p.field_y!,
          toX: Math.max(2, Math.min(98, p.field_x! + dx)),
          toY: Math.max(2, Math.min(98, p.field_y! + dy)),
          type: 'move',
          quality: 'good',
          participantId: p.id,
        });
      });
    }

    if (activeTurn.phase === 'defending_response') {
      // 2-3 defenders pressing/blocking
      const defenders = defPlayers.slice(0, 3);
      defenders.forEach((p, i) => {
        const target = ballHolder;
        const dx = target ? (target.field_x! - p.field_x!) * 0.25 : (Math.random() - 0.5) * 8;
        const dy = target ? (target.field_y! - p.field_y!) * 0.2 : (Math.random() - 0.5) * 8;
        arrows.push({
          fromX: p.field_x!,
          fromY: p.field_y!,
          toX: Math.max(2, Math.min(98, p.field_x! + dx)),
          toY: Math.max(2, Math.min(98, p.field_y! + dy)),
          type: i === 0 ? 'press' : 'block_lane',
          quality: 'ok',
          participantId: p.id,
        });
      });
    }

    setFieldArrows(arrows);
  }, [activeTurn?.phase, activeTurn?.id, participants, match]);

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

  const submitAction = async (actionType: string) => {
    if (!matchId || !selectedParticipantId) return;
    setSubmittingAction(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/match-engine`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.access_token}` : '' },
          body: JSON.stringify({
            action: 'submit_action',
            match_id: matchId,
            participant_id: selectedParticipantId,
            action_type: actionType,
          }),
        }
      );
      const result = await resp.json();
      if (result.error) toast.error(result.error);
      else toast.success(`✅ ${ACTION_LABELS[actionType] || actionType}`);
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
  const myClubPlayers = isManager && myClubId ? participants.filter(p => p.club_id === myClubId && p.role_type === 'player') : [];

  const availableActions = activeTurn ? (PHASE_ACTIONS[activeTurn.phase] || []) : [];
  const isBallHolder = activeTurn?.ball_holder_participant_id === selectedParticipantId;
  const possClubId = match.possession_club_id;
  const hasPossession = possClubId === myClubId;

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

  const currentPhaseNum = activeTurn ? (PHASE_NUMBERS[activeTurn.phase] ?? 0) : 0;
  const phaseProgress = phaseTimeLeft > 0 ? (phaseTimeLeft / 6) : 0;

  return (
    <div className="min-h-screen bg-[hsl(220,20%,10%)] text-foreground flex flex-col">
      {/* ── Top scoreboard bar ── */}
      <div className="bg-[hsl(220,25%,8%)] border-b border-border/30 px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`font-display text-xs ${isLive ? 'border-pitch/60 text-pitch animate-pulse' : 'border-border text-muted-foreground'}`}
          >
            {isLive && <span className="mr-1 h-2 w-2 rounded-full bg-pitch inline-block" />}
            {STATUS_LABELS[match.status] || match.status}
          </Badge>
          {isLive && match.current_turn_number > 0 && (
            <span className="font-display text-xs text-muted-foreground">
              Turno {match.current_turn_number}
            </span>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center gap-4">
          <ClubBadgeInline club={homeClub} />
          <div className="text-center">
            <div className="font-display text-3xl font-extrabold tracking-widest text-foreground">
              {match.home_score}
              <span className="text-muted-foreground mx-2 text-xl">–</span>
              {match.away_score}
            </div>
          </div>
          <ClubBadgeInline club={awayClub} right />
        </div>

        <div className="flex items-center gap-2">
          {myRole === 'spectator' && <Badge variant="secondary" className="text-xs font-display"><Eye className="h-3 w-3 mr-1" />Espectador</Badge>}
          {isPlayer && <Badge className="bg-pitch/20 text-pitch text-xs border border-pitch/40 font-display"><User className="h-3 w-3 mr-1" />Jogador</Badge>}
          {isManager && (
            <Badge className="bg-tactical/20 text-tactical text-xs border border-tactical/40 font-display">
              <User className="h-3 w-3 mr-1" />Manager — {myClubId === match.home_club_id ? homeClub?.short_name : awayClub?.short_name}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* ── Left panel: Turn Wheel + Controls ── */}
        <div className="w-56 shrink-0 bg-[hsl(220,22%,9%)] border-r border-border/20 flex flex-col p-3 gap-3">

          {/* Turn Wheel */}
          <TurnWheel currentPhase={activeTurn?.phase ?? null} timeLeft={phaseTimeLeft} />

          {/* Phase timer bar */}
          {isLive && activeTurn && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-display text-muted-foreground uppercase tracking-wide">
                <span>{PHASE_LABELS[activeTurn.phase] || activeTurn.phase}</span>
                <span className={phaseTimeLeft <= 2 ? 'text-destructive animate-pulse' : ''}>{phaseTimeLeft}s</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${phaseProgress * 100}%`,
                    background: phaseTimeLeft > 3
                      ? 'hsl(var(--pitch-green))'
                      : phaseTimeLeft > 1
                        ? 'hsl(var(--warning-amber))'
                        : 'hsl(var(--destructive))',
                  }}
                />
              </div>
            </div>
          )}

          {/* Possession */}
          {isLive && possClubId && (
            <div className="bg-muted/10 rounded px-2 py-1.5 text-center">
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wide mb-0.5">Posse</p>
              <p className="font-display font-bold text-xs">
                ⚽ {possClubId === match.home_club_id ? homeClub?.short_name : awayClub?.short_name}
              </p>
            </div>
          )}

          {/* Action buttons */}
          {isLive && canAct && filteredActions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">Ações</p>
              {filteredActions.map(a => {
                const actionColor = ACTION_COLORS[a];
                return (
                  <button
                    key={a}
                    disabled={submittingAction}
                    onClick={() => submitAction(a)}
                    className="w-full text-left px-2.5 py-1.5 rounded text-xs font-display font-semibold transition-all border border-border/30
                      hover:border-tactical/50 hover:bg-tactical/10 disabled:opacity-50"
                    style={{ borderLeftColor: actionColor?.stroke, borderLeftWidth: 3 }}
                  >
                    {ACTION_LABELS[a] || a}
                  </button>
                );
              })}
              <p className="text-[9px] text-muted-foreground leading-tight">
                {isBallHolder ? '🟡 Com a bola' : hasPossession ? '🔵 Apoio ofensivo' : '🔴 Fase defensiva'}
              </p>
            </div>
          )}

          {/* Manager player selector */}
          {isLive && isManager && myClubPlayers.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wide">Controlar</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {myClubPlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedParticipantId(p.id)}
                    className={`w-full flex items-center gap-1.5 text-[10px] font-display px-2 py-1 rounded transition-colors
                      ${selectedParticipantId === p.id
                        ? 'bg-tactical/20 text-tactical border border-tactical/40'
                        : 'hover:bg-muted/20 text-muted-foreground border border-transparent'}`}
                  >
                    {p.is_bot
                      ? <Bot className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                      : <User className="h-2.5 w-2.5 text-pitch shrink-0" />}
                    <span className="truncate">{p.field_pos || p.slot_position}</span>
                    <span className="truncate flex-1">{p.player_name?.split(' ')[0] || 'Bot'}</span>
                    {activeTurn?.ball_holder_participant_id === p.id && <span className="text-amber-400">⚽</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pass/Shot quality legend */}
          {isLive && (
            <div className="mt-auto space-y-1">
              <p className="text-[9px] font-display text-muted-foreground uppercase tracking-wide">Qualidade</p>
              <div className="space-y-0.5">
                {[{ label: 'Boa', color: '#22c55e' }, { label: 'Média', color: '#f59e0b' }, { label: 'Ruim', color: '#ef4444' }].map(q => (
                  <div key={q.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded" style={{ backgroundColor: q.color }} />
                    <span className="text-[9px] font-display text-muted-foreground">{q.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Center: Football Field ── */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 bg-[hsl(220,18%,11%)]">
          <FootballField
            match={match}
            homeClub={homeClub}
            awayClub={awayClub}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            activeTurn={activeTurn}
            myParticipantId={myParticipant?.id || null}
            selectedParticipantId={selectedParticipantId}
            myClubId={myClubId}
            isManager={isManager}
            fieldArrows={fieldArrows}
            onSelectParticipant={(id) => {
              if (isManager && myClubId) {
                const p = participants.find(x => x.id === id);
                if (p?.club_id === myClubId) setSelectedParticipantId(id);
              }
            }}
          />

          {/* Status overlay for non-live */}
          {!isLive && (
            <div className="mt-3 text-center">
              {isFinished ? (
                <p className="font-display font-extrabold text-xl text-foreground">
                  ⏱ Partida Encerrada — {match.home_score} × {match.away_score}
                </p>
              ) : (
                <p className="font-display text-muted-foreground">
                  {new Date(match.scheduled_at) <= new Date() ? 'Iniciando engine...' : `Começa: ${new Date(match.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: Log ── */}
        <div className="w-56 shrink-0 bg-[hsl(220,22%,9%)] border-l border-border/20 flex flex-col p-3 gap-3">
          {/* Teams summary */}
          <div>
            <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wide mb-2">Times</p>
            <TeamSummary club={homeClub} players={homePlayers} ballHolderId={activeTurn?.ball_holder_participant_id ?? null} myId={myParticipant?.id ?? null} isHome />
            <div className="border-t border-border/20 my-2" />
            <TeamSummary club={awayClub} players={awayPlayers} ballHolderId={activeTurn?.ball_holder_participant_id ?? null} myId={myParticipant?.id ?? null} />
          </div>

          {/* Event log */}
          <div className="flex flex-col flex-1 min-h-0">
            <p className="text-[10px] font-display text-muted-foreground uppercase tracking-wide mb-2">
              <Clock className="h-3 w-3 inline mr-1" />Log
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              {events.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Aguardando eventos...</p>
              )}
              {events.slice(-40).map(e => (
                <div key={e.id} className={`text-[10px] border-l-2 pl-1.5 leading-tight ${
                  e.event_type === 'goal' ? 'border-pitch text-pitch font-bold' :
                  e.event_type === 'kickoff' ? 'border-tactical text-foreground' :
                  e.event_type === 'possession_change' ? 'border-warning/60 text-muted-foreground' :
                  e.event_type === 'final_whistle' ? 'border-destructive text-destructive font-bold' :
                  'border-border/40 text-muted-foreground'
                }`}>
                  <p className="font-display font-semibold">{e.title}</p>
                  {e.body && <p className="opacity-70">{e.body}</p>}
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

// ─── TurnWheel ────────────────────────────────────────────────
function TurnWheel({ currentPhase, timeLeft }: { currentPhase: string | null; timeLeft: number }) {
  const phases = [
    { key: 'ball_holder', label: '1', desc: 'Portador' },
    { key: 'attacking_support', label: '2', desc: 'Ataque' },
    { key: 'defending_response', label: '3', desc: 'Defesa' },
    { key: 'resolution', label: '4', desc: 'Motion' },
  ];
  const currentIdx = phases.findIndex(p => p.key === currentPhase);
  const current = phases[currentIdx] || null;

  // SVG wheel: 4 quadrants
  const SIZE = 120;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 52;
  const R_INNER = 22;

  // Quadrant paths (top-right=1, bottom-right=2, bottom-left=3, top-left=4)
  const quadrants = [
    { startAngle: -90, endAngle: 0, idx: 0 },   // Phase 1: top-right
    { startAngle: 0, endAngle: 90, idx: 1 },     // Phase 2: bottom-right
    { startAngle: 90, endAngle: 180, idx: 2 },   // Phase 3: bottom-left
    { startAngle: 180, endAngle: 270, idx: 3 },  // Phase 4: top-left
  ];

  function polarToCart(angleDeg: number, r: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function arcPath(startAngle: number, endAngle: number, rInner: number, rOuter: number) {
    const p1 = polarToCart(startAngle + 3, rOuter);
    const p2 = polarToCart(endAngle - 3, rOuter);
    const p3 = polarToCart(endAngle - 3, rInner);
    const p4 = polarToCart(startAngle + 3, rInner);
    return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 0 0 ${p4.x} ${p4.y} Z`;
  }

  // Label positions (midpoint of arc)
  function labelPos(startAngle: number, endAngle: number, r: number) {
    const mid = (startAngle + endAngle) / 2;
    return polarToCart(mid, r);
  }

  const colors = {
    active: '#22c55e',
    inactive: '#334155',
    text: '#94a3b8',
    activeText: '#fff',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[9px] font-display text-muted-foreground uppercase tracking-widest">Turno</p>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {quadrants.map((q, i) => {
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          return (
            <g key={i}>
              <path
                d={arcPath(q.startAngle, q.endAngle, R_INNER, R_OUTER)}
                fill={isActive ? colors.active : isPast ? '#1e3a2f' : colors.inactive}
                opacity={isActive ? 1 : isPast ? 0.8 : 0.5}
                stroke={isActive ? '#16a34a' : '#1e293b'}
                strokeWidth="1"
              />
              {/* Phase number label */}
              {(() => {
                const lp = labelPos(q.startAngle, q.endAngle, (R_INNER + R_OUTER) / 2);
                return (
                  <text
                    x={lp.x} y={lp.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="'Barlow Condensed', sans-serif"
                    fill={isActive ? colors.activeText : colors.text}
                  >
                    {phases[i].label}
                  </text>
                );
              })()}
            </g>
          );
        })}
        {/* Center circle */}
        <circle cx={CX} cy={CY} r={R_INNER - 2} fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
        {/* Center text */}
        <text
          x={CX} y={CY - 4}
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fontFamily="'Barlow Condensed', sans-serif"
          fill={currentPhase ? colors.active : colors.text}
        >
          {current?.desc || (currentPhase ? 'LIVE' : '—')}
        </text>
        {currentPhase && timeLeft > 0 && (
          <text
            x={CX} y={CY + 7}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fontFamily="'Barlow Condensed', sans-serif"
            fill={timeLeft <= 2 ? '#ef4444' : '#94a3b8'}
          >
            {timeLeft}s
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── FootballField ────────────────────────────────────────────
interface FootballFieldProps {
  match: MatchData;
  homeClub: ClubInfo | null;
  awayClub: ClubInfo | null;
  homePlayers: Participant[];
  awayPlayers: Participant[];
  activeTurn: MatchTurn | null;
  myParticipantId: string | null;
  selectedParticipantId: string | null;
  myClubId: string | null;
  isManager: boolean;
  fieldArrows: ArrowAction[];
  onSelectParticipant: (id: string) => void;
}

function FootballField({
  match, homeClub, awayClub, homePlayers, awayPlayers,
  activeTurn, myParticipantId, selectedParticipantId, myClubId, isManager,
  fieldArrows, onSelectParticipant,
}: FootballFieldProps) {
  const FIELD_W = 680;
  const FIELD_H = 440;
  const PAD = 16;

  // Convert percentage to SVG coords
  function toSVG(pctX: number, pctY: number) {
    return {
      x: PAD + (pctX / 100) * (FIELD_W - PAD * 2),
      y: PAD + (pctY / 100) * (FIELD_H - PAD * 2),
    };
  }

  const ballPos = (() => {
    const bh = [...homePlayers, ...awayPlayers].find(p => p.id === activeTurn?.ball_holder_participant_id);
    if (bh && bh.field_x != null && bh.field_y != null) {
      const sv = toSVG(bh.field_x, bh.field_y);
      return sv;
    }
    return null;
  })();

  // Arrow quality to color
  function arrowColor(type: string, quality: 'good' | 'ok' | 'bad'): string {
    if (type === 'move') return '#1e293b';
    if (type === 'press' || type === 'intercept' || type === 'block_lane') {
      return quality === 'good' ? '#22c55e' : quality === 'ok' ? '#f59e0b' : '#ef4444';
    }
    // pass/shoot
    return quality === 'good' ? '#22c55e' : quality === 'ok' ? '#f59e0b' : '#ef4444';
  }

  return (
    <div className="w-full" style={{ maxWidth: FIELD_W + PAD * 2 }}>
      <svg
        viewBox={`0 0 ${FIELD_W + PAD * 2} ${FIELD_H + PAD * 2}`}
        className="w-full rounded-lg shadow-2xl"
        style={{ background: 'transparent' }}
      >
        {/* Field background with stripes */}
        <defs>
          <pattern id="stripes" x="0" y="0" width="60" height={FIELD_H} patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="30" height={FIELD_H} fill="hsl(140,60%,20%)" />
            <rect x="30" y="0" width="30" height={FIELD_H} fill="hsl(140,55%,18%)" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="inherit" />
          </marker>
          {['good','ok','bad','move','press'].map(k => {
            const c = k === 'move' ? '#334155' : k === 'good' ? '#22c55e' : k === 'ok' ? '#f59e0b' : k === 'press' ? '#f59e0b' : '#ef4444';
            return (
              <marker key={k} id={`ah-${k}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill={c} />
              </marker>
            );
          })}
        </defs>

        {/* Field surface */}
        <rect x={PAD} y={PAD} width={FIELD_W - PAD * 2} height={FIELD_H - PAD * 2} fill="url(#stripes)" rx="4" />

        {/* Field lines */}
        <g stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none">
          {/* Border */}
          <rect x={PAD + 4} y={PAD + 4} width={FIELD_W - PAD * 2 - 8} height={FIELD_H - PAD * 2 - 8} />
          {/* Halfway line */}
          <line x1={PAD + FIELD_W / 2 - PAD} y1={PAD + 4} x2={PAD + FIELD_W / 2 - PAD} y2={PAD + FIELD_H - PAD * 2 - 4} />
          {/* Center circle */}
          <circle cx={PAD + (FIELD_W - PAD * 2) / 2} cy={PAD + (FIELD_H - PAD * 2) / 2} r={48} />
          {/* Center dot */}
          <circle cx={PAD + (FIELD_W - PAD * 2) / 2} cy={PAD + (FIELD_H - PAD * 2) / 2} r={3} fill="rgba(255,255,255,0.7)" />
          {/* Home penalty area */}
          <rect x={PAD + 4} y={PAD + (FIELD_H - PAD * 2) * 0.22} width={(FIELD_W - PAD * 2) * 0.16} height={(FIELD_H - PAD * 2) * 0.56} />
          {/* Home 6-yard box */}
          <rect x={PAD + 4} y={PAD + (FIELD_H - PAD * 2) * 0.35} width={(FIELD_W - PAD * 2) * 0.055} height={(FIELD_H - PAD * 2) * 0.30} />
          {/* Away penalty area */}
          <rect x={PAD + 4 + (FIELD_W - PAD * 2) * 0.84} y={PAD + (FIELD_H - PAD * 2) * 0.22} width={(FIELD_W - PAD * 2) * 0.16} height={(FIELD_H - PAD * 2) * 0.56} />
          {/* Away 6-yard box */}
          <rect x={PAD + 4 + (FIELD_W - PAD * 2) * 0.945} y={PAD + (FIELD_H - PAD * 2) * 0.35} width={(FIELD_W - PAD * 2) * 0.055} height={(FIELD_H - PAD * 2) * 0.30} />
        </g>

        {/* Goals */}
        <g fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
          {/* Home goal */}
          <rect x={PAD - 6} y={PAD + (FIELD_H - PAD * 2) * 0.385} width={10} height={(FIELD_H - PAD * 2) * 0.23} />
          {/* Away goal */}
          <rect x={PAD + FIELD_W - PAD * 2 - 4} y={PAD + (FIELD_H - PAD * 2) * 0.385} width={10} height={(FIELD_H - PAD * 2) * 0.23} />
        </g>

        {/* Club name labels on field */}
        {homeClub && (
          <text x={PAD + (FIELD_W - PAD * 2) * 0.15} y={PAD + 18} textAnchor="middle" fontSize="10" fontWeight="700"
            fontFamily="'Barlow Condensed', sans-serif" fill="rgba(255,255,255,0.35)" letterSpacing="1">
            {homeClub.short_name}
          </text>
        )}
        {awayClub && (
          <text x={PAD + (FIELD_W - PAD * 2) * 0.85} y={PAD + 18} textAnchor="middle" fontSize="10" fontWeight="700"
            fontFamily="'Barlow Condensed', sans-serif" fill="rgba(255,255,255,0.35)" letterSpacing="1">
            {awayClub.short_name}
          </text>
        )}

        {/* Action arrows */}
        {fieldArrows.map((arrow, i) => {
          const from = toSVG(arrow.fromX, arrow.fromY);
          const to = toSVG(arrow.toX, arrow.toY);
          const isMove = arrow.type === 'move';
          const markerId = isMove ? 'ah-move' : `ah-${arrow.quality}`;
          const color = arrowColor(arrow.type, arrow.quality);
          const dash = isMove ? '4,3' : arrow.type === 'shoot' ? '1,0' : '6,2';
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={color}
              strokeWidth={isMove ? 1.2 : 2}
              strokeDasharray={dash}
              markerEnd={`url(#${markerId})`}
              opacity={isMove ? 0.5 : 0.85}
            />
          );
        })}

        {/* Players */}
        {[...homePlayers, ...awayPlayers].map((p) => {
          if (p.field_x == null || p.field_y == null) return null;
          const { x, y } = toSVG(p.field_x, p.field_y);
          const isHome = p.club_id === match.home_club_id;
          const club = isHome ? homeClub : awayClub;
          const isBH = activeTurn?.ball_holder_participant_id === p.id;
          const isMe = p.id === myParticipantId;
          const isSelected = p.id === selectedParticipantId;
          const isSelectable = isManager && p.club_id === myClubId;
          const R = 14;

          return (
            <g key={p.id} onClick={() => onSelectParticipant(p.id)} style={{ cursor: isSelectable ? 'pointer' : 'default' }}>
              {/* Selection ring */}
              {(isSelected || isMe) && (
                <circle cx={x} cy={y} r={R + 4}
                  fill="none"
                  stroke={isSelected ? '#3b82f6' : '#22c55e'}
                  strokeWidth="2"
                  strokeDasharray={isSelected ? '3,2' : '0'}
                  opacity={0.9}
                />
              )}
              {/* Ball holder glow */}
              {isBH && (
                <circle cx={x} cy={y} r={R + 6}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  opacity={0.7}
                  filter="url(#glow)"
                />
              )}
              {/* Player circle */}
              <circle
                cx={x} cy={y} r={R}
                fill={club?.primary_color || (isHome ? '#1d4ed8' : '#dc2626')}
                stroke={p.is_bot ? '#f59e0b' : (isMe ? '#22c55e' : 'rgba(255,255,255,0.4)')}
                strokeWidth={p.is_bot ? 1.5 : isMe ? 2 : 1}
              />
              {/* Position label */}
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
                fontSize="8" fontWeight="700"
                fontFamily="'Barlow Condensed', sans-serif"
                fill={club?.secondary_color || '#fff'}
              >
                {p.field_pos || p.slot_position || '?'}
              </text>
              {/* Bot indicator */}
              {p.is_bot && (
                <circle cx={x + R - 3} cy={y - R + 3} r={4} fill="#f59e0b" />
              )}
              {/* Ball emoji above ball holder */}
              {isBH && (
                <text x={x} y={y - R - 6} textAnchor="middle" fontSize="10">⚽</text>
              )}
              {/* Name label below */}
              <text x={x} y={y + R + 9} textAnchor="middle"
                fontSize="7.5" fontFamily="'Barlow Condensed', sans-serif"
                fill="rgba(255,255,255,0.7)"
              >
                {p.player_name ? p.player_name.split(' ')[0].substring(0, 8) : (p.field_pos || 'Bot')}
              </text>
            </g>
          );
        })}

        {/* Ball (floating near ball holder) */}
        {ballPos && (
          <circle cx={ballPos.x + 18} cy={ballPos.y - 18} r={5} fill="white" opacity={0.9} filter="url(#glow)" />
        )}
      </svg>

      {/* Pass/Shot quality bar */}
      {fieldArrows.some(a => a.type !== 'move') && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[9px] font-display text-muted-foreground uppercase tracking-wide shrink-0">Pass/Shot Quality</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
            {fieldArrows.filter(a => a.type !== 'move').map((a, i) => (
              <div
                key={i}
                className="flex-1 h-full"
                style={{
                  backgroundColor: a.quality === 'good' ? '#22c55e' : a.quality === 'ok' ? '#f59e0b' : '#ef4444',
                }}
              />
            ))}
          </div>
          <span className="text-[9px] font-display text-muted-foreground shrink-0">
            {fieldArrows.filter(a => a.type !== 'move').length > 0
              ? ['Ruim', 'Média', 'Boa'][Math.min(2, Math.round(
                  fieldArrows.filter(a => a.type !== 'move').reduce(
                    (acc, a) => acc + (a.quality === 'good' ? 1 : a.quality === 'ok' ? 0.5 : 0), 0
                  ) / fieldArrows.filter(a => a.type !== 'move').length * 2
                ))]
              : '—'}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── ClubBadgeInline ──────────────────────────────────────────
function ClubBadgeInline({ club, right }: { club: ClubInfo | null; right?: boolean }) {
  if (!club) return <div className="w-8 h-8 rounded bg-muted animate-pulse" />;
  return (
    <div className={`flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-8 h-8 rounded flex items-center justify-center font-display text-[10px] font-extrabold shadow"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
      >
        {club.short_name.substring(0, 3)}
      </div>
      <span className="font-display font-bold text-xs text-muted-foreground hidden sm:block max-w-20 truncate">{club.name}</span>
    </div>
  );
}

// ─── TeamSummary ──────────────────────────────────────────────
function TeamSummary({
  club, players, ballHolderId, myId, isHome,
}: { club: ClubInfo | null; players: Participant[]; ballHolderId: string | null; myId: string | null; isHome?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: club?.primary_color || '#888' }} />
        <span className="font-display text-[10px] font-bold text-foreground">{club?.short_name || '—'}</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{players.filter(p => !p.id.startsWith('virtual')).length}/11</span>
      </div>
      <div className="space-y-0.5">
        {players.map(p => (
          <div key={p.id} className={`flex items-center gap-1 text-[9px] px-0.5 rounded ${myId === p.id ? 'bg-pitch/10' : ''}`}>
            {p.is_bot
              ? <Bot className="h-2.5 w-2.5 text-amber-400 shrink-0" />
              : <User className="h-2.5 w-2.5 text-pitch shrink-0" />}
            <span className="font-display text-[9px] w-6 text-muted-foreground shrink-0">{p.field_pos || p.slot_position || '?'}</span>
            <span className="truncate flex-1 text-foreground/70">{p.player_name?.split(' ')[0] || 'Bot'}</span>
            {ballHolderId === p.id && <span className="text-[8px]">⚽</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
