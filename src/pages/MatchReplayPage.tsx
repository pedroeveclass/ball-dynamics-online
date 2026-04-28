import React, { useEffect, useState, useRef, useCallback, ReactNode, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('match_replay');
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
          <span className="font-display text-lg font-bold">{t('title')}</span>
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
  set_piece_type: string | null;
  ball_x: number | null;
  ball_y: number | null;
  resolution_script: any;
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

// Scene = one motion clip built from a resolution_script row.
// Pauses (halftime / set-piece preview) are applied AFTER the motion finishes,
// before the next scene begins.
interface MotionScene {
  turnNumber: number;
  turnId: string;
  durationMs: number;
  initialPositions: Record<string, { x: number; y: number }>;
  finalPositions: Record<string, { x: number; y: number }>;
  ballStart: { x: number; y: number };
  ballEnd: { x: number; y: number };
  ballHolderParticipantId: string | null;
  events: EventRow[];
  actions: ActionRow[];        // arrows to draw during the motion
  scoresAfter: { home: number; away: number };
  endsHalf: boolean;            // pause 2s with halftime overlay after this motion
  endsInGoal: boolean;          // pause ~1.5s with GOAL! overlay after this motion
  nextSetPieceType: string | null; // pause ~800ms with set-piece overlay before next motion
  matchMinute: number;          // approximate clock value to display
  currentHalf: 1 | 2;
}

// Legacy snapshot (used as fallback when no scene has a resolution_script).
interface LegacySnapshot {
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

// ─── Speed options (multiplier on the script's natural duration) ─
const SPEED_OPTIONS = [
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];

const HALFTIME_PAUSE_MS = 2000;
const SET_PIECE_PAUSE_MS = 800;
const GOAL_PAUSE_MS = 1500;
const INTER_SCENE_PAUSE_MS = 100;
const LEGACY_TURN_DURATION_MS = 1000; // used only when falling back to per-turn snapshots
// Replay plays each motion slower than the live engine so the action reads
// naturally on screen. The engine's duration_ms ranges 400–2500ms depending
// on the ball action / distance; multiplying by SLOWDOWN and clamping to a
// floor + ceiling keeps every play in a comfortable ~2.5s window.
// Applied at 1× speed; the 2×/4× speed buttons still divide on top.
const REPLAY_MOTION_SLOWDOWN = 2.0;
const REPLAY_MOTION_MIN_MS = 2000;
const REPLAY_MOTION_MAX_MS = 3000;

type Phase = 'motion' | 'halftime_pause' | 'set_piece_pause' | 'goal_pause' | 'idle_pause' | 'finished';

// ─── Main page component ────────────────────────────────────────
export default function MatchReplayPage() {
  const { id: matchId } = useParams<{ id: string }>();
  const { t } = useTranslation('match_replay');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [homeClub, setHomeClub] = useState<ClubInfo | null>(null);
  const [awayClub, setAwayClub] = useState<ClubInfo | null>(null);
  const [homeUniforms, setHomeUniforms] = useState<ClubUniform[]>([]);
  const [awayUniforms, setAwayUniforms] = useState<ClubUniform[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [scenes, setScenes] = useState<MotionScene[]>([]);
  const [legacySnapshots, setLegacySnapshots] = useState<LegacySnapshot[]>([]);
  const [usingLegacy, setUsingLegacy] = useState(false);
  const [slotPositions, setSlotPositions] = useState<Record<string, string>>({});

  // Playback state
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle_pause');
  const [animProgress, setAnimProgress] = useState(0); // 0..1 within current motion
  const [pauseProgress, setPauseProgress] = useState(0); // 0..1 within pause
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);

  // Live, accumulating event log + running score (mirrors live match feel)
  const [eventLog, setEventLog] = useState<EventRow[]>([]);
  const [scoreNow, setScoreNow] = useState<{ home: number; away: number }>({ home: 0, away: 0 });
  const flushedSceneIdxRef = useRef(-1); // last scene whose events/score have been pushed

  const animFrameRef = useRef<number>(0);

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
      const { data: matchRow, error: matchErr } = await supabase
        .from('matches')
        .select('id, status, home_score, away_score, home_club_id, away_club_id, home_uniform, away_uniform, current_turn_number')
        .eq('id', matchId!)
        .single();
      if (matchErr || !matchRow) { setError(t('errors.match_not_found')); setLoading(false); return; }
      const matchData = matchRow as MatchData;
      setMatch(matchData);

      const [homeClubRes, awayClubRes, homeUniformsRes, awayUniformsRes] = await Promise.all([
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.home_club_id).single(),
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.away_club_id).single(),
        supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color').eq('club_id', matchData.home_club_id),
        supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color').eq('club_id', matchData.away_club_id),
      ]);
      if (homeClubRes.data) setHomeClub(homeClubRes.data as ClubInfo);
      if (awayClubRes.data) setAwayClub(awayClubRes.data as ClubInfo);
      if (homeUniformsRes.data) setHomeUniforms(homeUniformsRes.data as ClubUniform[]);
      if (awayUniformsRes.data) setAwayUniforms(awayUniformsRes.data as ClubUniform[]);

      const [participantsRes, turnsRes, actionsRes, eventsRes] = await Promise.all([
        supabase.from('match_participants').select('id, club_id, role_type, pos_x, pos_y, player_profile_id, lineup_slot_id').eq('match_id', matchId!),
        supabase.from('match_turns').select('id, turn_number, phase, possession_club_id, ball_holder_participant_id, status, set_piece_type, ball_x, ball_y, resolution_script').eq('match_id', matchId!).order('turn_number', { ascending: true }),
        supabase.from('match_actions').select('id, match_turn_id, participant_id, action_type, target_x, target_y, status').eq('match_id', matchId!),
        supabase.from('match_event_logs').select('id, event_type, title, body, created_at, payload').eq('match_id', matchId!).order('created_at', { ascending: true }),
      ]);

      const parts = (participantsRes.data || []) as ParticipantRow[];
      const turns = (turnsRes.data || []) as TurnRow[];
      const actions = (actionsRes.data || []) as ActionRow[];
      const events = (eventsRes.data || []) as EventRow[];
      setParticipants(parts);

      const playerIds = [...new Set(parts.filter(p => p.player_profile_id).map(p => p.player_profile_id!))];
      const slotIds = [...new Set(parts.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id!))];

      const [, slotsRes] = await Promise.all([
        playerIds.length > 0
          ? supabase.from('player_profiles').select('id, full_name, primary_position').in('id', playerIds)
          : Promise.resolve({ data: [] as any[] }),
        slotIds.length > 0
          ? supabase.from('lineup_slots').select('id, slot_position, sort_order').in('id', slotIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const posMap: Record<string, string> = {};
      for (const sl of (slotsRes.data || [])) posMap[sl.id] = sl.slot_position;
      setSlotPositions(posMap);

      // ── Try to build motion-script scenes ──
      const actionsByTurn = new Map<string, ActionRow[]>();
      for (const a of actions) {
        const list = actionsByTurn.get(a.match_turn_id) || [];
        list.push(a);
        actionsByTurn.set(a.match_turn_id, list);
      }

      const fieldParts = parts.filter(p => p.role_type === 'player');
      const initialMap: Record<string, { x: number; y: number }> = {};
      for (const p of fieldParts) initialMap[p.id] = { x: p.pos_x ?? 50, y: p.pos_y ?? 50 };

      const resolutionTurns = turns.filter(t => t.phase === 'resolution' && t.resolution_script);
      const builtScenes: MotionScene[] = [];

      if (resolutionTurns.length > 0) {
        // Group all match_actions for a scene by ROUND, not by resolution turn:
        // shots/passes are submitted during positioning/attack/ball_holder turns,
        // each of which has its own match_turn_id. The resolution turn itself
        // usually has only computed/derived actions. We need every action whose
        // match_turn_id belongs to a turn between (prevResolutionTurnNumber, this]
        // so the goal-target lookup and the on-screen arrows show the full play.
        const scenesActions = new Map<string, ActionRow[]>();
        let prevResTurnNum = 0;
        for (const tRow of resolutionTurns) {
          const roundTurnIds = turns
            .filter(tt => tt.turn_number > prevResTurnNum && tt.turn_number <= tRow.turn_number)
            .map(tt => tt.id);
          const acts: ActionRow[] = [];
          for (const tid of roundTurnIds) {
            for (const a of (actionsByTurn.get(tid) || [])) acts.push(a);
          }
          scenesActions.set(tRow.id, acts);
          prevResTurnNum = tRow.turn_number;
        }

        // Index events to scenes by event creation order: events emitted between
        // resolution N-1 and resolution N belong to scene N. We don't have a
        // reliable per-event timestamp tied to ticks, so we partition events by
        // resolved_at ordering: each scene grabs all events whose created_at <=
        // its resolved_at and > previous scene's resolved_at.
        const scenesByTurnId = new Map<string, EventRow[]>();
        let eventCursor = 0;
        for (let i = 0; i < resolutionTurns.length; i++) {
          const tRow = resolutionTurns[i];
          const cutoffMs = tRow.resolution_script?.resolved_at
            ? new Date(tRow.resolution_script.resolved_at).getTime()
            : Number.POSITIVE_INFINITY;
          const list: EventRow[] = [];
          while (eventCursor < events.length) {
            const ev = events[eventCursor];
            const evMs = new Date(ev.created_at).getTime();
            // Use turn_number from payload if available; otherwise rely on time ordering.
            const evTurn = ev.payload?.turn_number;
            if (typeof evTurn === 'number') {
              if (evTurn <= tRow.turn_number) {
                list.push(ev);
                eventCursor++;
                continue;
              }
              break;
            }
            if (evMs <= cutoffMs) {
              list.push(ev);
              eventCursor++;
              continue;
            }
            break;
          }
          scenesByTurnId.set(tRow.id, list);
        }
        // Drain any leftovers into the last scene.
        if (eventCursor < events.length && resolutionTurns.length > 0) {
          const last = scenesByTurnId.get(resolutionTurns[resolutionTurns.length - 1].id)!;
          while (eventCursor < events.length) last.push(events[eventCursor++]);
        }

        // Detect halftime: any non-resolution turn between this resolution and
        // the next that has phase='halftime' marks endsHalf on the current scene.
        const halftimeTurnNumbers = new Set<number>();
        for (const tRow of turns) if (tRow.phase === 'halftime') halftimeTurnNumbers.add(tRow.turn_number);

        let runningHome = 0;
        let runningAway = 0;
        let currentHalf: 1 | 2 = 1;
        let lastBallEnd: { x: number; y: number } = { x: 50, y: 50 };

        for (let i = 0; i < resolutionTurns.length; i++) {
          const tRow = resolutionTurns[i];
          const script = tRow.resolution_script;
          const initialPositions: Record<string, { x: number; y: number }> = {
            ...initialMap,
            ...(script?.initial_positions || {}),
          };
          const finalPositions: Record<string, { x: number; y: number }> = {
            ...initialPositions,
            ...(script?.final_positions || {}),
          };

          // Ball start: holder pos in initial_positions, or last frame's ball end.
          const holderId = tRow.ball_holder_participant_id;
          const ballStart = (holderId && initialPositions[holderId])
            ? { ...initialPositions[holderId] }
            : lastBallEnd;
          let ballEnd = script?.ball_end_pos
            ? { x: script.ball_end_pos.x, y: script.ball_end_pos.y }
            : (tRow.ball_x != null && tRow.ball_y != null
                ? { x: tRow.ball_x, y: tRow.ball_y }
                : ballStart);

          const sceneEvents = scenesByTurnId.get(tRow.id) || [];

          // Goal override: when a goal happens, script.ball_end_pos is already
          // the centre kickoff spot. Pull the shot's actual target so the ball
          // visibly travels into the net during the motion.
          const sceneActionsForRound = scenesActions.get(tRow.id) || [];
          const goalEvent = sceneEvents.find(e => e.event_type === 'goal');
          const endsInGoal = !!goalEvent;
          if (endsInGoal) {
            const SHOT_TYPES = new Set(['shoot_controlled', 'shoot_power', 'header_controlled', 'header_power']);
            // Prefer an explicit shot/header; fall back to any ball action with
            // a target near the goal line (covers dribble-into-the-net goals).
            let shotTarget: { x: number; y: number } | null = null;
            const shot = sceneActionsForRound.find(a =>
              SHOT_TYPES.has(a.action_type) && a.target_x != null && a.target_y != null
            );
            if (shot && shot.target_x != null && shot.target_y != null) {
              shotTarget = { x: shot.target_x, y: shot.target_y };
            } else {
              // Find any action targeting the goal area
              const ballActionTypes = new Set(['pass_low', 'pass_high', 'pass_launch', 'header_low', 'header_high', 'move']);
              const near = sceneActionsForRound
                .filter(a => ballActionTypes.has(a.action_type) && a.target_x != null && a.target_y != null
                  && (a.target_x <= 5 || a.target_x >= 95)
                  && (a.target_y as number) >= 35 && (a.target_y as number) <= 65)
                .sort((a, b) => Math.abs((b.target_x as number) - 50) - Math.abs((a.target_x as number) - 50));
              if (near[0]) shotTarget = { x: near[0].target_x as number, y: near[0].target_y as number };
            }
            if (shotTarget) {
              const ty = Math.min(58, Math.max(42, shotTarget.y));
              const tx = shotTarget.x > 50 ? Math.max(98, shotTarget.x) : Math.min(2, shotTarget.x);
              ballEnd = { x: tx, y: ty };
            } else {
              // Last-resort fallback: aim at the centre of whichever goal the
              // attacking holder is closest to, so the ball at least crosses
              // a goal line visually.
              const targetGoalX = ballStart.x > 50 ? 99 : 1;
              ballEnd = { x: targetGoalX, y: 50 };
            }
          }
          // Running score = scriptScore if provided, else accumulate goals.
          if (script?.scores) {
            runningHome = script.scores.home ?? runningHome;
            runningAway = script.scores.away ?? runningAway;
          } else {
            for (const e of sceneEvents) {
              if (e.event_type === 'goal') {
                if (e.payload?.scoring_club_id === matchData.home_club_id) runningHome++;
                else if (e.payload?.scoring_club_id === matchData.away_club_id) runningAway++;
              }
            }
          }

          // Halftime detection: is there a halftime turn between this and next resolution?
          const nextResTurnNumber = i + 1 < resolutionTurns.length ? resolutionTurns[i + 1].turn_number : Infinity;
          let endsHalf = false;
          for (const ht of halftimeTurnNumbers) {
            if (ht > tRow.turn_number && ht < nextResTurnNumber) { endsHalf = true; break; }
          }

          // Set-piece detection: script.next_turn.set_piece_type, fallback to next resolution's turn flag
          let nextSetPiece: string | null = script?.next_turn?.set_piece_type ?? null;
          if (!nextSetPiece && i + 1 < resolutionTurns.length) {
            // Look at any positioning turn between this and next resolution; if any has set_piece_type, use it.
            for (const tt of turns) {
              if (tt.turn_number > tRow.turn_number && tt.turn_number < nextResTurnNumber && tt.set_piece_type) {
                nextSetPiece = tt.set_piece_type;
                break;
              }
            }
          }

          // Approximate clock minute by linear distribution of motion index across the half.
          // First half = scenes 0..halftimeIdx; second half = rest.
          const matchMinute = currentHalf === 1
            ? Math.min(45, Math.max(1, Math.round((i + 1) * 45 / Math.max(1, resolutionTurns.length / 2))))
            : 45 + Math.min(45, Math.max(1, Math.round((i + 1) * 45 / Math.max(1, resolutionTurns.length))));

          builtScenes.push({
            turnNumber: tRow.turn_number,
            turnId: tRow.id,
            durationMs: typeof script?.duration_ms === 'number' && script.duration_ms > 0
              ? script.duration_ms
              : 2000,
            initialPositions,
            finalPositions,
            ballStart,
            ballEnd,
            ballHolderParticipantId: tRow.ball_holder_participant_id,
            events: sceneEvents,
            actions: sceneActionsForRound,
            scoresAfter: { home: runningHome, away: runningAway },
            endsHalf,
            endsInGoal,
            nextSetPieceType: nextSetPiece,
            matchMinute,
            currentHalf,
          });

          // Hand-off positions for next scene: final_positions become next initial source
          for (const pid of Object.keys(finalPositions)) initialMap[pid] = finalPositions[pid];
          lastBallEnd = ballEnd;
          if (endsHalf) currentHalf = 2;
        }
      }

      if (builtScenes.length > 0) {
        setScenes(builtScenes);
        setUsingLegacy(false);
      } else {
        // Fallback: rebuild legacy per-turn snapshots (old behavior)
        const ballMovingTypes = new Set(['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power', 'header_low', 'header_high', 'header_controlled', 'header_power']);
        const cur: Record<string, { x: number; y: number }> = { ...initialMap };
        const turnEventMap = new Map<number, EventRow[]>();
        for (const tRow of turns) turnEventMap.set(tRow.turn_number, []);
        if (turns.length > 0 && events.length > 0) {
          const eventsPerTurn = Math.max(1, Math.ceil(events.length / turns.length));
          let ei = 0;
          for (const tRow of turns) {
            const list = turnEventMap.get(tRow.turn_number)!;
            for (let j = 0; j < eventsPerTurn && ei < events.length; j++, ei++) list.push(events[ei]);
          }
          // Drain leftovers into the last turn
          if (ei < events.length) {
            const last = turnEventMap.get(turns[turns.length - 1].turn_number)!;
            while (ei < events.length) last.push(events[ei++]);
          }
        }
        const built: LegacySnapshot[] = [];
        for (const tRow of turns) {
          const tActions = actionsByTurn.get(tRow.id) || [];
          for (const action of tActions) {
            if (action.target_x != null && action.target_y != null && cur[action.participant_id]) {
              if (!ballMovingTypes.has(action.action_type)) {
                cur[action.participant_id] = { x: action.target_x, y: action.target_y };
              }
            }
          }
          let ballPosition = { x: 50, y: 50 };
          if (tRow.ball_holder_participant_id && cur[tRow.ball_holder_participant_id]) {
            ballPosition = { ...cur[tRow.ball_holder_participant_id] };
          }
          built.push({
            turnNumber: tRow.turn_number,
            turnId: tRow.id,
            phase: tRow.phase,
            possessionClubId: tRow.possession_club_id,
            ballHolderParticipantId: tRow.ball_holder_participant_id,
            positions: { ...cur },
            ballPosition,
            events: turnEventMap.get(tRow.turn_number) || [],
            actions: tActions,
          });
        }
        setLegacySnapshots(built);
        setUsingLegacy(true);
      }

      setCurrentSceneIdx(0);
      setAnimProgress(0);
      setPauseProgress(0);
      setPhase('motion');
      setEventLog([]);
      setScoreNow({ home: 0, away: 0 });
      flushedSceneIdxRef.current = -1;
    } catch (err) {
      console.error('Replay load error:', err);
      setError(t('errors.load_failed'));
    } finally {
      setLoading(false);
    }
  }

  // ─── Playback driver ─────────────────────────────────────────
  const speedMul = SPEED_OPTIONS[speedIndex].value;
  const totalScenes = usingLegacy ? legacySnapshots.length : scenes.length;

  // Flush a scene's events + score into the live log when the motion completes.
  const flushScene = useCallback((idx: number) => {
    if (usingLegacy) {
      const snap = legacySnapshots[idx];
      if (!snap) return;
      if (flushedSceneIdxRef.current >= idx) return;
      setEventLog(prev => mergeEvents(prev, snap.events));
      flushedSceneIdxRef.current = idx;
      return;
    }
    const scene = scenes[idx];
    if (!scene) return;
    if (flushedSceneIdxRef.current >= idx) return;
    setEventLog(prev => mergeEvents(prev, scene.events));
    setScoreNow(scene.scoresAfter);
    flushedSceneIdxRef.current = idx;
  }, [usingLegacy, scenes, legacySnapshots]);

  // When user seeks backwards via slider, rebuild the cumulative log up to that point.
  const rebuildLogUpTo = useCallback((idx: number) => {
    if (usingLegacy) {
      const merged: EventRow[] = [];
      for (let i = 0; i <= idx && i < legacySnapshots.length; i++) {
        for (const e of legacySnapshots[i].events) merged.push(e);
      }
      setEventLog(dedupe(merged));
      return;
    }
    const merged: EventRow[] = [];
    let h = 0, a = 0;
    for (let i = 0; i <= idx && i < scenes.length; i++) {
      for (const e of scenes[i].events) merged.push(e);
      h = scenes[i].scoresAfter.home;
      a = scenes[i].scoresAfter.away;
    }
    setEventLog(dedupe(merged));
    setScoreNow({ home: h, away: a });
    flushedSceneIdxRef.current = idx;
  }, [usingLegacy, scenes, legacySnapshots]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (prev) return false;
      // Restart from the top once playback has finished.
      if (phase === 'finished') {
        setCurrentSceneIdx(0);
        setAnimProgress(0);
        setPauseProgress(0);
        setPhase('motion');
        setEventLog([]);
        setScoreNow({ home: 0, away: 0 });
        flushedSceneIdxRef.current = -1;
        return true;
      }
      // Resuming after a manual scrub: the user is sitting at the end of a
      // scene (animProgress=1, idle_pause). Promote the pause to halftime /
      // set-piece if the current scene transitions into one, so the overlay
      // shows before the next motion plays.
      if (phase === 'idle_pause' && animProgress >= 1) {
        const sceneNow = usingLegacy ? null : scenes[currentSceneIdx];
        if (sceneNow?.endsInGoal) { setPhase('goal_pause'); setPauseProgress(0); }
        else if (sceneNow?.endsHalf) { setPhase('halftime_pause'); setPauseProgress(0); }
        else if (sceneNow?.nextSetPieceType) { setPhase('set_piece_pause'); setPauseProgress(0); }
      }
      return true;
    });
  }, [phase, animProgress, currentSceneIdx, scenes, usingLegacy]);

  // For step / seek operations, jump to the END state of the selected scene:
  // events + score reflect "after this play", positions show finalPositions.
  // From there, pressing Play advances naturally to the next scene's motion.
  const prevTurn = useCallback(() => {
    setIsPlaying(false);
    setCurrentSceneIdx(prev => {
      const next = Math.max(0, prev - 1);
      rebuildLogUpTo(next);
      setAnimProgress(1);
      setPauseProgress(0);
      setPhase('idle_pause');
      return next;
    });
  }, [rebuildLogUpTo]);

  const nextTurn = useCallback(() => {
    setIsPlaying(false);
    setCurrentSceneIdx(prev => {
      const next = Math.min(totalScenes - 1, prev + 1);
      rebuildLogUpTo(next);
      setAnimProgress(1);
      setPauseProgress(0);
      setPhase('idle_pause');
      return next;
    });
  }, [totalScenes, rebuildLogUpTo]);

  const seekToTurn = useCallback((turn: number) => {
    setIsPlaying(false);
    const next = Math.min(Math.max(0, turn), totalScenes - 1);
    setCurrentSceneIdx(next);
    rebuildLogUpTo(next);
    setAnimProgress(1);
    setPauseProgress(0);
    setPhase('idle_pause');
  }, [totalScenes, rebuildLogUpTo]);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex(prev => (prev + 1) % SPEED_OPTIONS.length);
  }, []);

  // ─── Single RAF loop driving motion + pauses ─────────────────
  useEffect(() => {
    if (!isPlaying) return;
    if (phase === 'finished') { setIsPlaying(false); return; }

    let last = performance.now();
    let stopped = false; // local latch: stop scheduling more RAF after a phase transition

    const tick = (now: number) => {
      if (stopped) return;
      const dt = now - last;
      last = now;

      if (phase === 'motion') {
        const scene = usingLegacy ? null : scenes[currentSceneIdx];
        const rawDur = (scene ? scene.durationMs : LEGACY_TURN_DURATION_MS) * REPLAY_MOTION_SLOWDOWN;
        const baseDur = Math.min(REPLAY_MOTION_MAX_MS, Math.max(REPLAY_MOTION_MIN_MS, rawDur));
        const dur = baseDur / Math.max(1, speedMul);
        let transitioned = false;
        setAnimProgress(prev => {
          const np = Math.min(1, prev + dt / Math.max(1, dur));
          if (np >= 1) {
            // Motion complete: flush this scene's events/score, then decide next phase.
            // Mark transitioned so we stop scheduling — the effect will re-mount on the
            // new phase and pick up from there.
            transitioned = true;
            flushScene(currentSceneIdx);
            const isLast = currentSceneIdx >= totalScenes - 1;
            if (isLast) {
              setPhase('finished');
              setIsPlaying(false);
              return 1;
            }
            const sceneNow = usingLegacy ? null : scenes[currentSceneIdx];
            if (sceneNow?.endsInGoal) setPhase('goal_pause');
            else if (sceneNow?.endsHalf) setPhase('halftime_pause');
            else if (sceneNow?.nextSetPieceType) setPhase('set_piece_pause');
            else setPhase('idle_pause');
            setPauseProgress(0);
          }
          return np;
        });
        if (transitioned) { stopped = true; return; }
      } else if (phase === 'halftime_pause' || phase === 'set_piece_pause' || phase === 'goal_pause' || phase === 'idle_pause') {
        const dur = phase === 'halftime_pause' ? HALFTIME_PAUSE_MS
                  : phase === 'goal_pause' ? GOAL_PAUSE_MS
                  : phase === 'set_piece_pause' ? SET_PIECE_PAUSE_MS
                  : INTER_SCENE_PAUSE_MS;
        let transitioned = false;
        setPauseProgress(prev => {
          const np = Math.min(1, prev + dt / Math.max(1, dur / Math.max(1, speedMul)));
          if (np >= 1) {
            transitioned = true;
            setCurrentSceneIdx(idx => {
              const next = idx + 1;
              if (next >= totalScenes) {
                setPhase('finished');
                setIsPlaying(false);
                return idx;
              }
              setAnimProgress(0);
              setPauseProgress(0);
              setPhase('motion');
              return next;
            });
          }
          return np;
        });
        if (transitioned) { stopped = true; return; }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, phase, currentSceneIdx, totalScenes, scenes, usingLegacy, speedMul, flushScene]);

  // Cleanup on unmount
  useEffect(() => () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }, []);

  // ─── Derived participants/jersey lookup ───────────────────────
  const fieldParts = useMemo(() => participants.filter(p => p.role_type === 'player'), [participants]);
  const homeParts = useMemo(() => fieldParts.filter(p => match && p.club_id === match.home_club_id), [fieldParts, match]);
  const awayParts = useMemo(() => fieldParts.filter(p => match && p.club_id === match.away_club_id), [fieldParts, match]);

  const jerseyMap = useMemo(() => {
    const m = new Map<string, number>();
    homeParts.forEach((p, i) => m.set(p.id, i + 1));
    awayParts.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [homeParts, awayParts]);

  const getFieldPos = useCallback((partId: string): string => {
    const part = participants.find(p => p.id === partId);
    if (!part) return '?';
    if (part.lineup_slot_id && slotPositions[part.lineup_slot_id]) return slotPositions[part.lineup_slot_id];
    return '?';
  }, [participants, slotPositions]);

  // ─── Compute on-screen positions for current frame ───────────
  const currentScene = !usingLegacy ? scenes[currentSceneIdx] : null;
  const currentLegacy = usingLegacy ? legacySnapshots[currentSceneIdx] : null;
  const prevLegacy = usingLegacy && currentSceneIdx > 0 ? legacySnapshots[currentSceneIdx - 1] : null;

  const easedProgress = useMemo(() => {
    // Same easing as the live match (ease-in then ease-out) to match feel
    const r = animProgress;
    if (r < 0.4) return (r / 0.4) ** 2 * 0.4;
    return 0.4 + (1 - Math.pow(1 - (r - 0.4) / 0.6, 2)) * 0.6;
  }, [animProgress]);

  const getInterpolatedPos = useCallback((participantId: string): { x: number; y: number } | null => {
    if (usingLegacy) {
      if (!currentLegacy) return null;
      const curr = currentLegacy.positions[participantId];
      if (!curr) return null;
      if (animProgress >= 1 || !prevLegacy) return curr;
      const prev = prevLegacy.positions[participantId] ?? curr;
      return {
        x: prev.x + (curr.x - prev.x) * easedProgress,
        y: prev.y + (curr.y - prev.y) * easedProgress,
      };
    }
    if (!currentScene) return null;
    // During halftime / set-piece pauses we render the scene's FINAL positions
    // (or the NEXT scene's INITIAL positions if there is one) so the field
    // already shows the snap-back for the upcoming kick.
    if (phase === 'set_piece_pause' || phase === 'halftime_pause') {
      const nextScene = scenes[currentSceneIdx + 1];
      if (nextScene && nextScene.initialPositions[participantId]) {
        return nextScene.initialPositions[participantId];
      }
      return currentScene.finalPositions[participantId] ?? currentScene.initialPositions[participantId] ?? null;
    }
    // Goal pause: keep players where they ended (the moment of the goal),
    // do NOT snap to the next scene yet — that would jump them to the
    // kickoff formation while we still want to celebrate.
    if (phase === 'goal_pause' || phase === 'idle_pause' || phase === 'finished') {
      return currentScene.finalPositions[participantId] ?? currentScene.initialPositions[participantId] ?? null;
    }
    const start = currentScene.initialPositions[participantId];
    const end = currentScene.finalPositions[participantId] ?? start;
    if (!start) return end ?? null;

    // Per-player arrival timing (mirrors MatchRoomPage.getAnimatedPos):
    // each player reaches their target at (moveFraction × 100%) of the clip,
    // where moveFraction = displacement / MAX_RANGE_APPROX. Players who barely
    // moved arrive in the first 10% and then stand still; players who covered
    // the full range take the entire clip. This conveys per-player speed
    // instead of everyone gliding at the same pace.
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const Y_SCALE = INNER_H / INNER_W; // physical Y axis is shorter than X
    const moveDist = Math.sqrt(dx * dx + (dy * Y_SCALE) * (dy * Y_SCALE));
    const MAX_RANGE_APPROX = 6;
    const moveFraction = Math.min(1, moveDist / MAX_RANGE_APPROX);
    const arrivalTime = Math.max(0.1, moveFraction);
    const t = Math.min(1, animProgress / arrivalTime);

    return {
      x: start.x + dx * t,
      y: start.y + dy * t,
    };
  }, [usingLegacy, currentLegacy, prevLegacy, currentScene, scenes, currentSceneIdx, animProgress, easedProgress, phase]);

  const getInterpolatedBall = useCallback((): { x: number; y: number } => {
    if (usingLegacy) {
      if (!currentLegacy) return { x: 50, y: 50 };
      if (animProgress >= 1 || !prevLegacy) return currentLegacy.ballPosition;
      const prev = prevLegacy.ballPosition;
      const curr = currentLegacy.ballPosition;
      return {
        x: prev.x + (curr.x - prev.x) * easedProgress,
        y: prev.y + (curr.y - prev.y) * easedProgress,
      };
    }
    if (!currentScene) return { x: 50, y: 50 };
    if (phase === 'set_piece_pause' || phase === 'halftime_pause' || phase === 'goal_pause' || phase === 'idle_pause' || phase === 'finished') {
      return currentScene.ballEnd;
    }
    return {
      x: currentScene.ballStart.x + (currentScene.ballEnd.x - currentScene.ballStart.x) * easedProgress,
      y: currentScene.ballStart.y + (currentScene.ballEnd.y - currentScene.ballStart.y) * easedProgress,
    };
  }, [usingLegacy, currentLegacy, prevLegacy, currentScene, animProgress, easedProgress, phase]);

  // ─── Uniform colors ────────────────────────────────────────────
  const homeActiveUniform = homeUniforms.find(u => u.uniform_number === (match?.home_uniform ?? 1))
    || { shirt_color: homeClub?.primary_color ?? '#dc2626', number_color: homeClub?.secondary_color ?? '#fff' };
  const awayActiveUniform = awayUniforms.find(u => u.uniform_number === (match?.away_uniform ?? 2))
    || { shirt_color: awayClub?.primary_color ?? '#16a34a', number_color: awayClub?.secondary_color ?? '#fff' };

  // ─── Render guards ────────────────────────────────────────────
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
          <p className="text-muted-foreground">{error || t('errors.match_not_found')}</p>
          <Link to="/league"><Button variant="outline">{t('back')}</Button></Link>
        </div>
      </ReplayLayout>
    );
  }

  if (totalScenes === 0) {
    return (
      <ReplayLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Film className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground text-lg">{t('errors.no_replay')}</p>
          <Link to="/league"><Button variant="outline">{t('back')}</Button></Link>
        </div>
      </ReplayLayout>
    );
  }

  const ballPos = getInterpolatedBall();
  const ballSvg = toSVG(ballPos.x, ballPos.y);

  // Overlay text for halftime / goal / set-piece pauses
  const overlayText: string | null = (() => {
    if (phase === 'halftime_pause') return t('overlay.halftime');
    if (phase === 'goal_pause') return t('overlay.goal');
    if (phase === 'set_piece_pause' && currentScene?.nextSetPieceType) {
      const key = `overlay.set_piece.${currentScene.nextSetPieceType}`;
      const fallbackKey = 'overlay.set_piece.default';
      const v = t(key, { defaultValue: '' });
      return v || t(fallbackKey);
    }
    return null;
  })();

  const minuteLabel = !usingLegacy && currentScene
    ? t('clock.minute', { minute: currentScene.matchMinute, half: currentScene.currentHalf })
    : null;

  return (
    <ReplayLayout>
      <div className="flex flex-col gap-3">
        {/* ── Top bar: clubs + score + clock ── */}
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
            <span className="font-display font-bold text-2xl tabular-nums">
              {scoreNow.home} - {scoreNow.away}
            </span>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="secondary" className="text-[10px]">
                <Film className="h-3 w-3 mr-1" />
                {t('badge')}
              </Badge>
              {minuteLabel && (
                <Badge variant="outline" className="text-[10px] font-mono">{minuteLabel}</Badge>
              )}
            </div>
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

        {/* ── Scene indicator ── */}
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {t('scene_label', { current: currentSceneIdx + 1, total: totalScenes })}
          </Badge>
        </div>

        {/* ── Field + events area ── */}
        <div className="flex gap-3">
          {/* Field */}
          <div className="flex-1 relative" style={{ background: 'linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)', borderRadius: 8, padding: 4 }}>
            <svg
              viewBox={`0 0 ${FIELD_W + PAD * 2} ${FIELD_H + PAD * 2}`}
              className="w-full rounded-lg"
            >
              <defs>
                <pattern id="rp-grass" x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="40" height={INNER_H} fill="hsl(100,45%,28%)" />
                  <rect x="40" y="0" width="40" height={INNER_H} fill="hsl(100,42%,25%)" />
                </pattern>
                <filter id="rp-shadow"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.5" /></filter>
                <marker id="rp-ah-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#22c55e" /></marker>
                <marker id="rp-ah-yellow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#f59e0b" /></marker>
                <marker id="rp-ah-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#ef4444" /></marker>
                <marker id="rp-ah-black" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#1a1a2e" /></marker>
                <marker id="rp-ah-cyan" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#06b6d4" /></marker>
              </defs>

              <rect x="0" y="0" width={FIELD_W + PAD * 2} height={FIELD_H + PAD * 2} fill="hsl(140,10%,15%)" rx="8" />
              <rect x={PAD} y={PAD} width={INNER_W} height={INNER_H} fill="url(#rp-grass)" />

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

              <g fill="rgba(255,255,255,0.6)">
                <circle cx={PAD + INNER_W * 0.13} cy={PAD + INNER_H / 2} r={3} />
                <circle cx={PAD + INNER_W - INNER_W * 0.13} cy={PAD + INNER_H / 2} r={3} />
              </g>

              <g stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="rgba(255,255,255,0.08)">
                <rect x={PAD - 8} y={PAD + INNER_H * 0.41} width={10} height={INNER_H * 0.18} rx="1" />
                <rect x={PAD + INNER_W - 2} y={PAD + INNER_H * 0.41} width={10} height={INNER_H * 0.18} rx="1" />
              </g>

              <g stroke="rgba(255,255,255,0.15)" strokeWidth="0.5">
                {[0, 1, 2, 3].map(i => (
                  <g key={`net-${i}`}>
                    <line x1={PAD - 8 + i * 3} y1={PAD + INNER_H * 0.41} x2={PAD - 8 + i * 3} y2={PAD + INNER_H * 0.59} />
                    <line x1={PAD + INNER_W - 2 + i * 3} y1={PAD + INNER_H * 0.41} x2={PAD + INNER_W - 2 + i * 3} y2={PAD + INNER_H * 0.59} />
                  </g>
                ))}
              </g>

              {/* Action arrows (only during motion) */}
              {phase === 'motion' && (() => {
                const acts = usingLegacy ? (currentLegacy?.actions ?? []) : (currentScene?.actions ?? []);
                const startMap = usingLegacy
                  ? (prevLegacy?.positions ?? currentLegacy?.positions ?? {})
                  : (currentScene?.initialPositions ?? {});
                return acts.map((action) => {
                  if (action.target_x == null || action.target_y == null) return null;
                  const startPos = startMap[action.participant_id];
                  if (!startPos) return null;
                  const from = toSVG(startPos.x, startPos.y);
                  const to = toSVG(action.target_x, action.target_y);
                  const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
                  if (dist < 3) return null;

                  const isPass = ['pass_low', 'pass_high', 'pass_launch', 'header_low', 'header_high'].includes(action.action_type);
                  const isShoot = ['shoot_controlled', 'shoot_power', 'header_controlled', 'header_power'].includes(action.action_type);
                  const isReceive = action.action_type === 'receive';
                  const isBlock = action.action_type === 'block';
                  const isMove = action.action_type === 'move';

                  let stroke = '#1a1a2e';
                  let marker = 'rp-ah-black';
                  let strokeW = 1.5;
                  let dashArray = 'none';

                  if (isPass) {
                    stroke = '#22c55e'; marker = 'rp-ah-green'; strokeW = 2.5;
                    if (action.action_type === 'pass_high' || action.action_type === 'header_high' || action.action_type === 'pass_launch') {
                      stroke = '#f59e0b';
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
                });
              })()}

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
                const bhId = usingLegacy ? currentLegacy?.ballHolderParticipantId : currentScene?.ballHolderParticipantId;
                const isBH = bhId === p.id && phase === 'motion';

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

            {/* Pause overlay (halftime / set-piece) */}
            {overlayText && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`px-6 py-3 rounded-lg font-display font-bold tracking-wider border-2 backdrop-blur-sm ${
                    phase === 'goal_pause'
                      ? 'bg-green-500/35 border-green-300 text-green-50 text-4xl'
                      : phase === 'halftime_pause'
                        ? 'bg-amber-500/30 border-amber-400 text-amber-100 text-2xl'
                        : 'bg-blue-500/25 border-blue-400 text-blue-100 text-2xl'
                  }`}
                  style={{ animation: 'pulse 1.4s ease-in-out infinite' }}
                >
                  {overlayText}
                </div>
              </div>
            )}
          </div>

          {/* MatchFlow events sidebar (accumulating, like the live match) */}
          <div className="w-56 shrink-0 bg-card border rounded-lg p-3 flex-col gap-1 max-h-[480px] overflow-y-auto hidden md:flex">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{t('events.title')}</span>
            {eventLog.length === 0 && (
              <span className="text-xs text-muted-foreground">{t('events.empty_total')}</span>
            )}
            {eventLog.slice().reverse().map((ev) => (
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
          <Slider
            value={[currentSceneIdx]}
            min={0}
            max={Math.max(0, totalScenes - 1)}
            step={1}
            onValueChange={([val]) => seekToTurn(val)}
            className="w-full"
          />

          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon" onClick={prevTurn} disabled={currentSceneIdx <= 0}>
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
            <Button variant="ghost" size="icon" onClick={nextTurn} disabled={currentSceneIdx >= totalScenes - 1}>
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={cycleSpeed} className="ml-4 font-mono text-xs min-w-[40px]">
              {SPEED_OPTIONS[speedIndex].label}
            </Button>
            <span className="text-xs text-muted-foreground ml-2 font-mono">
              {currentSceneIdx + 1} / {totalScenes}
            </span>
          </div>
        </div>

        {/* Mobile events */}
        <div className="md:hidden bg-card border rounded-lg p-3">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{t('events.title')}</span>
          {eventLog.length === 0 && (
            <span className="text-xs text-muted-foreground">{t('events.empty_total')}</span>
          )}
          {eventLog.slice().reverse().map((ev) => (
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

// ─── Helpers ─────────────────────────────────────────────────────
function mergeEvents(prev: EventRow[], incoming: EventRow[]): EventRow[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map(e => e.id));
  const out = prev.slice();
  for (const e of incoming) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  return out;
}

function dedupe(list: EventRow[]): EventRow[] {
  const seen = new Set<string>();
  const out: EventRow[] = [];
  for (const e of list) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  return out;
}
