import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useAnimationControls } from 'framer-motion';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save, RotateCcw, Copy, Eye, EyeOff, Users, X, FlipHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { FORMATIONS } from './ManagerLineupPage';

// ── Grid geometry ─────────────────────────────────────────────
// Field is 5 cols × 7 rows = 35 quadrants. Coordinates in % (0-100),
// same as ManagerLineupPage (y=90 = own goal, y=15 = opponent goal).
const COLS = 5;
const ROWS = 7;
const QUADRANT_W = 100 / COLS; // 20
const QUADRANT_H = 100 / ROWS; // ~14.286

type Phase = 'with_ball' | 'without_ball';
type Pos = { x: number; y: number };
type QuadrantPositions = Record<string, Pos>;
/** Quadrant index (0-34) → positions, OR null = use dynamic default (team shifts with ball). */
type QuadrantMap = Record<number, QuadrantPositions | null>;
type PhaseMap = Record<Phase, QuadrantMap>;

// How strongly the team drifts toward the ball when a quadrant isn't customized.
// Vertical pull > lateral pull — attack/defense swings should feel bigger than sideways slides.
const DYNAMIC_SHIFT_X = 0.25;
const DYNAMIC_SHIFT_Y = 0.45;

const PHASES: Phase[] = ['with_ball', 'without_ball'];
const PHASE_LABEL: Record<Phase, string> = {
  with_ball: 'Com bola',
  without_ball: 'Sem bola',
};

// ── Tactical knobs ────────────────────────────────────────────
// These multiply/shift positions on top of the dynamic/custom layout.
// Same values are used in the match engine so the editor preview matches
// what actually happens on the pitch.
type AttackType = 'central' | 'balanced' | 'wide';
type Positioning = 'short' | 'normal' | 'spread';
type Inclination = 'ultra_def' | 'def' | 'normal' | 'off' | 'ultra_off';
interface TacticKnobs {
  attack_type: AttackType;
  positioning: Positioning;
  inclination: Inclination;
}
const DEFAULT_KNOBS: TacticKnobs = { attack_type: 'balanced', positioning: 'normal', inclination: 'normal' };

const ATTACK_TYPE_X_SCALE: Record<AttackType, number> = { central: 0.78, balanced: 1.0, wide: 1.22 };
const POSITIONING_SCALE: Record<Positioning, number> = { short: 0.82, normal: 1.0, spread: 1.18 };
const INCLINATION_CELLS: Record<Inclination, number> = { ultra_def: 2, def: 1, normal: 0, off: -1, ultra_off: -2 };

const ATTACK_TYPE_LABEL: Record<AttackType, string> = { central: 'Ataque central', balanced: 'Balanceado', wide: 'Pelos lados' };
const POSITIONING_LABEL: Record<Positioning, string> = { short: 'Jogo curto', normal: 'Normal', spread: 'Espalhado' };
const INCLINATION_LABEL: Record<Inclination, string> = {
  ultra_def: 'Ultra defensivo', def: 'Defensivo', normal: 'Normal', off: 'Ofensivo', ultra_off: 'Ultra ofensivo',
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function quadrantCenter(idx: number): Pos {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  return { x: (col + 0.5) * QUADRANT_W, y: (row + 0.5) * QUADRANT_H };
}

function snapBallToQuadrantIdx(x: number, y: number): number {
  const col = clamp(Math.floor(x / QUADRANT_W), 0, COLS - 1);
  const row = clamp(Math.floor(y / QUADRANT_H), 0, ROWS - 1);
  return row * COLS + col;
}

/** Snap player to one of 9 points (3×3 grid) within whatever quadrant they land in.
 *  When `lockToQuadrant` is provided, the snap is forced to land inside that quadrant
 *  regardless of where the drag ended — used to keep the GK anchored to the goal-area
 *  quadrant (row 6, col 2 = idx 32) so it never drifts into midfield / opponent side. */
function snapPlayerPosition(x: number, y: number, lockToQuadrant?: number): Pos {
  const cx = clamp(x, 0, 100);
  const cy = clamp(y, 0, 100);
  let col = clamp(Math.floor(cx / QUADRANT_W), 0, COLS - 1);
  let row = clamp(Math.floor(cy / QUADRANT_H), 0, ROWS - 1);
  if (lockToQuadrant != null) {
    col = lockToQuadrant % COLS;
    row = Math.floor(lockToQuadrant / COLS);
  }
  const qLeft = col * QUADRANT_W;
  const qTop = row * QUADRANT_H;
  const relX = clamp((cx - qLeft) / QUADRANT_W, 0, 1);
  const relY = clamp((cy - qTop) / QUADRANT_H, 0, 1);
  const subCol = clamp(Math.floor(relX * 3), 0, 2);
  const subRow = clamp(Math.floor(relY * 3), 0, 2);
  return {
    x: qLeft + (subCol + 0.5) * (QUADRANT_W / 3),
    y: qTop + (subRow + 0.5) * (QUADRANT_H / 3),
  };
}

/** Goal-area quadrant the GK is locked to: row 6 (y=85..100) × col 2 (x=40..60). */
const GK_QUADRANT_IDX = 6 * COLS + 2;

/** Dynamic default for a quadrant — shift the whole formation proportionally to ball position.
 *  GK is anchored to the goal area and never participates in the dynamic shift so it
 *  can't drift into midfield when the ball is in the attacking third. */
function computeDynamicPositions(quadrantIdx: number, formation: string): QuadrantPositions {
  const slots = FORMATIONS[formation] || [];
  const center = quadrantCenter(quadrantIdx);
  const dx = (center.x - 50) * DYNAMIC_SHIFT_X;
  const dy = (center.y - 50) * DYNAMIC_SHIFT_Y;
  const result: QuadrantPositions = {};
  for (const s of slots) {
    if (s.position === 'GK') {
      result[s.position] = { x: s.x, y: s.y };
      continue;
    }
    result[s.position] = {
      x: clamp(s.x + dx, 0, 100),
      y: clamp(s.y + dy, 0, 100),
    };
  }
  return result;
}

/** All quadrants start as null = dynamic default. Customization only exists when the user drags. */
function buildEmptyPhaseMap(): QuadrantMap {
  const m: QuadrantMap = {};
  for (let i = 0; i < COLS * ROWS; i++) m[i] = null;
  return m;
}

function buildEmptyBothPhases(): PhaseMap {
  return { with_ball: buildEmptyPhaseMap(), without_ball: buildEmptyPhaseMap() };
}

function resolvePositions(
  phaseMap: PhaseMap,
  phase: Phase,
  qIdx: number,
  formation: string,
): QuadrantPositions {
  return phaseMap[phase][qIdx] ?? computeDynamicPositions(qIdx, formation);
}

/** Apply the 3 tactical knobs on top of a set of positions.
 *  Keeper is left untouched so the GK stays in the goal. */
function applyKnobs(
  positions: QuadrantPositions,
  knobs: TacticKnobs,
  formation: string,
): QuadrantPositions {
  const slots = FORMATIONS[formation] || [];
  const outfield = slots.filter(s => s.position !== 'GK');
  if (outfield.length === 0) return positions;
  const centroidX = outfield.reduce((sum, s) => sum + (positions[s.position]?.x ?? s.x), 0) / outfield.length;
  const centroidY = outfield.reduce((sum, s) => sum + (positions[s.position]?.y ?? s.y), 0) / outfield.length;

  const xScale = ATTACK_TYPE_X_SCALE[knobs.attack_type];
  const posScale = POSITIONING_SCALE[knobs.positioning];
  const yShift = INCLINATION_CELLS[knobs.inclination] * (QUADRANT_H / 3);

  const result: QuadrantPositions = {};
  for (const slot of slots) {
    const p = positions[slot.position];
    if (!p) continue;
    if (slot.position === 'GK') {
      result[slot.position] = p;
      continue;
    }
    let x = centroidX + (p.x - centroidX) * posScale;
    let y = centroidY + (p.y - centroidY) * posScale;
    x = 50 + (x - 50) * xScale;
    y += yShift;
    result[slot.position] = { x: clamp(x, 2, 98), y: clamp(y, 2, 98) };
  }
  return result;
}

/** Final positions shown on the field.
 *  Knobs only act on dynamic (non-customized) quadrants — once the user
 *  drags a chip in a quadrant, that layout is frozen and knobs are skipped. */
function resolveRenderedPositions(
  phaseMap: PhaseMap,
  phase: Phase,
  qIdx: number,
  formation: string,
  knobs: TacticKnobs,
): QuadrantPositions {
  const custom = phaseMap[phase][qIdx];
  if (custom) return custom;
  return applyKnobs(computeDynamicPositions(qIdx, formation), knobs, formation);
}

const oppositePhase = (p: Phase): Phase => (p === 'with_ball' ? 'without_ball' : 'with_ball');

/** Pair each slot with its left/right mirror by grouping slots into rows (by y±5) and reversing x order. */
function computeMirrorMapping(formation: string): Record<string, string> {
  const slots = FORMATIONS[formation] || [];
  const rows: (typeof slots)[] = [];
  for (const s of slots) {
    const row = rows.find(r => Math.abs(r[0].y - s.y) <= 5);
    if (row) row.push(s);
    else rows.push([s]);
  }
  const mapping: Record<string, string> = {};
  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      mapping[sorted[i].position] = sorted[sorted.length - 1 - i].position;
    }
  }
  return mapping;
}

/** Opponent attacks the opposite way, so mirror the ball's quadrant vertically
 *  (as if they were looking at the field from their side), compute their dynamic
 *  default there, then flip Y to bring it back into our field coords. */
function computeOpponentPositions(quadrantIdx: number, oppFormation: string): QuadrantPositions {
  const row = Math.floor(quadrantIdx / COLS);
  const col = quadrantIdx % COLS;
  const mirroredIdx = (ROWS - 1 - row) * COLS + col;
  const base = computeDynamicPositions(mirroredIdx, oppFormation);
  const flipped: QuadrantPositions = {};
  for (const [k, p] of Object.entries(base)) {
    flipped[k] = { x: p.x, y: 100 - p.y };
  }
  return flipped;
}

// ── Draggable player piece ────────────────────────────────────
type ChipVariant = 'own' | 'ghost' | 'opponent';

interface PlayerChipProps {
  jersey: number;
  label: string;
  slotPosition: string;
  pos: Pos;
  fieldRef: React.RefObject<HTMLDivElement>;
  onDragEndSnapped?: (newPos: Pos) => void;
  variant?: ChipVariant;
}

function PlayerChip({ jersey, label, slotPosition, pos, fieldRef, onDragEndSnapped, variant = 'own' }: PlayerChipProps) {
  const controls = useAnimationControls();
  const isGhost = variant === 'ghost';
  const isOpponent = variant === 'opponent';
  const draggable = !!onDragEndSnapped && !isGhost;

  const bgClass = isOpponent ? 'bg-blue-600' : 'bg-red-600';
  const zClass = isGhost ? 'z-10' : isOpponent ? 'z-20' : 'z-30';
  const opacityClass = isGhost ? 'opacity-50' : '';

  const body = (
    <div className={`flex flex-col items-center gap-0.5 select-none ${opacityClass}`}>
      <div
        className={`h-8 w-8 rounded-full ${bgClass} border-2 border-black text-white flex items-center justify-center font-bold text-sm shadow-md`}
      >
        {jersey}
      </div>
      <span className="text-[9px] font-semibold text-white bg-black/60 px-1 rounded">
        {label}
      </span>
    </div>
  );

  const positionStyle = {
    left: `${pos.x}%`,
    top: `${pos.y}%`,
    marginLeft: -16,
    marginTop: -16,
  } as const;

  if (!draggable) {
    return (
      <div className={`absolute ${zClass} pointer-events-none`} style={positionStyle}>
        {body}
      </div>
    );
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      animate={controls}
      onDragEnd={(_, info) => {
        const rect = fieldRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dxPct = (info.offset.x / rect.width) * 100;
        const dyPct = (info.offset.y / rect.height) * 100;
        const newX = clamp(pos.x + dxPct, 0, 100);
        const newY = clamp(pos.y + dyPct, 0, 100);
        // GK is anchored to the goal-area quadrant — drag lands inside quadrant 32
        // regardless of where the user released, so it never moves into midfield.
        const lockToQuadrant = slotPosition === 'GK' ? GK_QUADRANT_IDX : undefined;
        const snapped = snapPlayerPosition(newX, newY, lockToQuadrant);
        controls.set({ x: 0, y: 0 });
        onDragEndSnapped!(snapped);
      }}
      className={`absolute ${zClass} cursor-grab active:cursor-grabbing touch-none`}
      style={positionStyle}
    >
      {body}
    </motion.div>
  );
}

// ── Draggable ball ────────────────────────────────────────────
interface BallChipProps {
  pos: Pos;
  fieldRef: React.RefObject<HTMLDivElement>;
  onDragEndSnapped: (newIdx: number) => void;
}

function BallChip({ pos, fieldRef, onDragEndSnapped }: BallChipProps) {
  const controls = useAnimationControls();
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      animate={controls}
      onDragEnd={(_, info) => {
        const rect = fieldRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dxPct = (info.offset.x / rect.width) * 100;
        const dyPct = (info.offset.y / rect.height) * 100;
        const newX = clamp(pos.x + dxPct, 0, 100);
        const newY = clamp(pos.y + dyPct, 0, 100);
        const idx = snapBallToQuadrantIdx(newX, newY);
        controls.set({ x: 0, y: 0 });
        onDragEndSnapped(idx);
      }}
      className="absolute z-40 cursor-grab active:cursor-grabbing touch-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        marginLeft: -10,
        marginTop: -10,
      }}
    >
      <div className="h-5 w-5 rounded-full bg-white border-2 border-black shadow-lg" />
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function SituationalTacticsPage() {
  const { club: ownClub, assistantClub } = useAuth();
  const club = ownClub || assistantClub;
  const navigate = useNavigate();

  const [formation, setFormation] = useState('4-4-2');
  const [phase, setPhase] = useState<Phase>('with_ball');
  const [ballQuadrant, setBallQuadrant] = useState(17); // middle-ish (row 3, col 2)
  const [phaseMap, setPhaseMap] = useState<PhaseMap>(() => buildEmptyBothPhases());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState<string>('');

  // Visualization toggles (all local, non-persisted).
  const [showGhost, setShowGhost] = useState(false);
  const [showDistance, setShowDistance] = useState(false);
  const [opponentFormation, setOpponentFormation] = useState<string | null>(null);
  // Opponent overrides are per (formation, quadrant) but kept only in memory.
  const [opponentOverrides, setOpponentOverrides] = useState<Record<number, QuadrantPositions>>({});

  // Tactical knobs (persisted per formation — saved to both phase rows).
  const [knobs, setKnobs] = useState<TacticKnobs>(DEFAULT_KNOBS);

  // Compare-with-quadrant feature: when set, ghost shows this quadrant
  // (optionally of a different phase) instead of the opposite phase.
  const [compareQuadrant, setCompareQuadrant] = useState<number | null>(null);
  const [comparePhase, setComparePhase] = useState<Phase>('with_ball');

  const fieldRef = useRef<HTMLDivElement>(null);
  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];

  // Seed the formation from the club's active lineup on mount, so the tactics page
  // defaults to whatever the manager already set on the lineup screen.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('lineups')
        .select('formation')
        .eq('club_id', club.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.formation && FORMATIONS[data.formation]) {
        setFormation(data.formation);
      }
    })();
    return () => { cancelled = true; };
  }, [club?.id]);

  // ── Load / init from DB when club or formation changes ────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!club) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('situational_tactics' as any)
        .select('phase, positions, attack_type, positioning, inclination')
        .eq('club_id', club.id)
        .eq('formation', formation);
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error('Erro ao carregar táticas');
        setPhaseMap(buildEmptyBothPhases());
        setKnobs(DEFAULT_KNOBS);
        setLoading(false);
        return;
      }
      // DB now stores ONLY customized quadrants. Missing keys = use dynamic default.
      const fresh: PhaseMap = buildEmptyBothPhases();
      // Pull knobs from whichever phase row has them (we save same values on both).
      const knobRow = (data || [])[0] as any;
      if (knobRow) {
        setKnobs({
          attack_type: (knobRow.attack_type as AttackType) || 'balanced',
          positioning: (knobRow.positioning as Positioning) || 'normal',
          inclination: (knobRow.inclination as Inclination) || 'normal',
        });
      } else {
        setKnobs(DEFAULT_KNOBS);
      }
      const validSlots = new Set(slots.map(s => s.position));
      for (const row of (data || []) as any[]) {
        const p = row.phase as Phase;
        const stored = (row.positions || {}) as Record<string, QuadrantPositions>;
        for (const [q, slotMap] of Object.entries(stored)) {
          const qi = Number(q);
          if (!Number.isFinite(qi) || qi < 0 || qi >= COLS * ROWS) continue;
          // Ignore quadrants whose stored slots don't match current formation at all (stale data).
          const relevant = Object.keys(slotMap).some(k => validSlots.has(k));
          if (!relevant) continue;
          // Start from dynamic, overlay stored slots. Missing slots (e.g., formation change) fall back to dynamic.
          const base = computeDynamicPositions(qi, formation);
          const merged: QuadrantPositions = { ...base };
          for (const s of slots) {
            if (slotMap[s.position]) merged[s.position] = slotMap[s.position];
          }
          fresh[p][qi] = merged;
        }
      }
      setPhaseMap(fresh);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, formation]);

  // ── Mutators ───────────────────────────────────────────────
  const isQuadrantCustomized = phaseMap[phase][ballQuadrant] != null;
  // Positions we render = knob-transformed when the quadrant is dynamic,
  // raw stored layout otherwise. Drag starts from whatever we render so
  // the user snaps off the visible position.
  const currentQuadrantPositions = resolveRenderedPositions(phaseMap, phase, ballQuadrant, formation, knobs);

  const updatePlayerPos = (slotPosition: string, newPos: Pos) => {
    setPhaseMap(prev => {
      // Promote to customized: take whatever we're currently showing (custom or dynamic+knobs) as the baseline.
      const baseline = prev[phase][ballQuadrant]
        ?? applyKnobs(computeDynamicPositions(ballQuadrant, formation), knobs, formation);
      const nextQuadrant: QuadrantPositions = { ...baseline, [slotPosition]: newPos };
      return {
        ...prev,
        [phase]: { ...prev[phase], [ballQuadrant]: nextQuadrant },
      };
    });
  };

  const resetCurrentQuadrant = () => {
    setPhaseMap(prev => ({
      ...prev,
      [phase]: { ...prev[phase], [ballQuadrant]: null },
    }));
  };

  // Opponent positions: start from dynamic mirror, let user drag to override (mem-only).
  const opponentPositions = useMemo(() => {
    if (!opponentFormation) return null;
    return opponentOverrides[ballQuadrant] ?? computeOpponentPositions(ballQuadrant, opponentFormation);
  }, [opponentFormation, opponentOverrides, ballQuadrant]);

  const updateOpponentPos = (slotPosition: string, newPos: Pos) => {
    if (!opponentFormation) return;
    setOpponentOverrides(prev => {
      const baseline = prev[ballQuadrant] ?? computeOpponentPositions(ballQuadrant, opponentFormation);
      return { ...prev, [ballQuadrant]: { ...baseline, [slotPosition]: newPos } };
    });
  };

  // Clear opponent overrides whenever opp formation changes or is removed.
  const setOpponentFormationAndReset = (f: string | null) => {
    setOpponentFormation(f);
    setOpponentOverrides({});
  };

  // Mirror: copy one side (left or right) of the current quadrant onto the other.
  const applyMirror = (direction: 'leftToRight' | 'rightToLeft') => {
    const mirrorMap = computeMirrorMapping(formation);
    const baseline = resolvePositions(phaseMap, phase, ballQuadrant, formation);
    const next: QuadrantPositions = { ...baseline };
    for (const s of slots) {
      const isSource = direction === 'leftToRight' ? s.x < 50 : s.x > 50;
      if (!isSource) continue;
      const target = mirrorMap[s.position];
      if (!target || target === s.position) continue;
      const src = baseline[s.position];
      if (!src) continue;
      next[target] = { x: 100 - src.x, y: src.y };
    }
    setPhaseMap(prev => ({
      ...prev,
      [phase]: { ...prev[phase], [ballQuadrant]: next },
    }));
    toast.success(direction === 'leftToRight' ? 'Espelhado: esquerda → direita' : 'Espelhado: direita → esquerda');
  };

  const ballPos = quadrantCenter(ballQuadrant);

  const serializePhase = (p: Phase): Record<string, QuadrantPositions> => {
    const out: Record<string, QuadrantPositions> = {};
    for (let i = 0; i < COLS * ROWS; i++) {
      const entry = phaseMap[p][i];
      if (entry) out[String(i)] = entry;
    }
    return out;
  };

  const handleSave = async () => {
    if (!club) return;
    setSaving(true);
    const rows = PHASES.map(p => ({
      club_id: club.id,
      formation,
      phase: p,
      positions: serializePhase(p) as any,
      attack_type: knobs.attack_type,
      positioning: knobs.positioning,
      inclination: knobs.inclination,
    }));
    const { error } = await supabase
      .from('situational_tactics' as any)
      .upsert(rows, { onConflict: 'club_id,formation,phase' });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error('Erro ao salvar');
      return;
    }
    toast.success('Táticas salvas');
  };

  const handleReset = () => {
    setPhaseMap(buildEmptyBothPhases());
    toast.success('Todas as personalizações removidas — não esquece de salvar');
  };

  const handleDuplicate = async () => {
    if (!club || !dupTarget || dupTarget === formation) return;
    const targetSlots = FORMATIONS[dupTarget] || [];
    const targetSlotPositions = targetSlots.map(s => s.position);
    // Slot-by-slot copy, preserving the "customized or not" flag.
    const translated: PhaseMap = buildEmptyBothPhases();
    for (const p of PHASES) {
      for (let i = 0; i < COLS * ROWS; i++) {
        const sourceQuad = phaseMap[p][i];
        if (!sourceQuad) continue; // Leave null → dynamic default on target.
        const sourceValues = slots.map(s => sourceQuad[s.position]).filter(Boolean);
        const out: QuadrantPositions = {};
        for (let j = 0; j < targetSlotPositions.length; j++) {
          const key = targetSlotPositions[j];
          const targetDefault = targetSlots[j];
          out[key] = sourceValues[j] || { x: targetDefault.x, y: targetDefault.y };
        }
        translated[p][i] = out;
      }
    }
    const rows = PHASES.map(p => {
      const payload: Record<string, QuadrantPositions> = {};
      for (let i = 0; i < COLS * ROWS; i++) {
        const entry = translated[p][i];
        if (entry) payload[String(i)] = entry;
      }
      return {
        club_id: club.id,
        formation: dupTarget,
        phase: p,
        positions: payload as any,
      };
    });
    const { error } = await supabase
      .from('situational_tactics' as any)
      .upsert(rows, { onConflict: 'club_id,formation,phase' });
    if (error) {
      toast.error('Erro ao duplicar');
      return;
    }
    toast.success(`Ajustes duplicados para ${dupTarget}`);
    setDupOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────
  const quadrantLabel = useMemo(() => {
    const col = ballQuadrant % COLS;
    const row = Math.floor(ballQuadrant / COLS);
    const zoneY =
      row <= 1 ? 'ataque' : row <= 4 ? 'meio-campo' : 'defesa';
    const zoneX =
      col === 0 ? 'esquerda' : col === 4 ? 'direita' : col === 2 ? 'centro' : col === 1 ? 'centro-esquerda' : 'centro-direita';
    const state = isQuadrantCustomized ? 'personalizado' : 'dinâmico';
    return `Quadrante ${ballQuadrant + 1}/35 — ${zoneY} ${zoneX} · ${state}`;
  }, [ballQuadrant, isQuadrantCustomized]);

  const customizedIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < COLS * ROWS; i++) if (phaseMap[phase][i]) out.push(i);
    return out;
  }, [phaseMap, phase]);

  if (!club) {
    return <ManagerLayout><div className="p-6">Clube não encontrado.</div></ManagerLayout>;
  }

  return (
    <ManagerLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/manager/lineup"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
            </Button>
            <div>
              <h1 className="font-display text-2xl font-bold">Táticas — Jogo Situacional</h1>
              <p className="text-xs text-muted-foreground">
                Posicione cada jogador conforme a bola em cada um dos 35 quadrantes do campo. Salve por formação.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={formation} onValueChange={setFormation}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Phase tabs + quadrant info */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Tabs value={phase} onValueChange={(v) => setPhase(v as Phase)}>
            <TabsList>
              {PHASES.map(p => (
                <TabsTrigger key={p} value={p}>{PHASE_LABEL[p]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="text-xs text-muted-foreground font-semibold">{quadrantLabel}</div>
        </div>

        {/* Visualization toolbar: ghost overlay, distance, opponent, mirror */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Button
            variant={showGhost ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowGhost(v => !v)}
            className="gap-1.5"
          >
            {showGhost ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Fase oposta ({PHASE_LABEL[oppositePhase(phase)]})
          </Button>
          <label className={`flex items-center gap-1.5 px-2 py-1 rounded border ${showGhost ? '' : 'opacity-50 pointer-events-none'}`}>
            <Checkbox
              checked={showDistance}
              onCheckedChange={(v) => setShowDistance(!!v)}
            />
            <span>Distância</span>
          </label>

          <div className="flex items-center gap-1.5 pl-2 border-l ml-1">
            <span className="text-muted-foreground">Adversário:</span>
            <Select
              value={opponentFormation ?? 'none'}
              onValueChange={(v) => setOpponentFormationAndReset(v === 'none' ? null : v)}
            >
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem adversário</SelectItem>
                {Object.keys(FORMATIONS).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            {opponentFormation && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpponentFormationAndReset(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 pl-2 border-l ml-1">
            <span className="text-muted-foreground">Espelhar:</span>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => applyMirror('leftToRight')}>
              <FlipHorizontal className="h-3.5 w-3.5" /> E → D
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => applyMirror('rightToLeft')}>
              <FlipHorizontal className="h-3.5 w-3.5" /> D → E
            </Button>
          </div>
        </div>

        {/* Tactical knobs + quadrant comparison */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Ataque:</span>
            <Select value={knobs.attack_type} onValueChange={(v) => setKnobs(k => ({ ...k, attack_type: v as AttackType }))}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ATTACK_TYPE_LABEL) as AttackType[]).map(k => (
                  <SelectItem key={k} value={k}>{ATTACK_TYPE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Posicionamento:</span>
            <Select value={knobs.positioning} onValueChange={(v) => setKnobs(k => ({ ...k, positioning: v as Positioning }))}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(POSITIONING_LABEL) as Positioning[]).map(k => (
                  <SelectItem key={k} value={k}>{POSITIONING_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Inclinação:</span>
            <Select value={knobs.inclination} onValueChange={(v) => setKnobs(k => ({ ...k, inclination: v as Inclination }))}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INCLINATION_LABEL) as Inclination[]).map(k => (
                  <SelectItem key={k} value={k}>{INCLINATION_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l ml-1">
            <span className="text-muted-foreground">Comparar quadrante:</span>
            <Select
              value={compareQuadrant == null ? 'none' : String(compareQuadrant)}
              onValueChange={(v) => setCompareQuadrant(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="none">Nenhum</SelectItem>
                {Array.from({ length: COLS * ROWS }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {compareQuadrant != null && (
              <Select value={comparePhase} onValueChange={(v) => setComparePhase(v as Phase)}>
                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => <SelectItem key={p} value={p}>{PHASE_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {compareQuadrant != null && !showGhost && (
              <span className="text-[10px] text-amber-600">Ative "Fase oposta" pra ver o ghost</span>
            )}
          </div>
        </div>

        {/* Field */}
        <Card>
          <CardContent className="p-3">
            <div
              ref={fieldRef}
              className="relative w-full mx-auto rounded-lg overflow-hidden border-2 border-white/30 bg-gradient-to-b from-green-700 to-green-800 touch-none"
              style={{ aspectRatio: '3/4', maxWidth: 480 }}
            >
              {/* Grid overlay: 5 columns × 7 rows */}
              {Array.from({ length: COLS - 1 }).map((_, i) => (
                <div
                  key={`vline-${i}`}
                  className="absolute top-0 bottom-0 border-l border-white/25"
                  style={{ left: `${(i + 1) * QUADRANT_W}%` }}
                />
              ))}
              {Array.from({ length: ROWS - 1 }).map((_, i) => (
                <div
                  key={`hline-${i}`}
                  className="absolute left-0 right-0 border-t border-white/25"
                  style={{ top: `${(i + 1) * QUADRANT_H}%` }}
                />
              ))}

              {/* Field markings (halfway line, center circle) */}
              <div className="absolute left-0 right-0 border-t-2 border-white/60" style={{ top: '50%' }} />
              <div
                className="absolute rounded-full border-2 border-white/60"
                style={{
                  left: '50%', top: '50%',
                  width: '22%', aspectRatio: '1 / 1',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              {/* Opponent goal area (top) */}
              <div
                className="absolute left-1/2 -translate-x-1/2 top-0 border-2 border-t-0 border-white/60"
                style={{ width: '38%', height: '14%' }}
              />
              {/* Own goal area (bottom) */}
              <div
                className="absolute left-1/2 -translate-x-1/2 bottom-0 border-2 border-b-0 border-white/60"
                style={{ width: '38%', height: '14%' }}
              />

              {/* Customized quadrants: yellow dot in the top-right corner of each */}
              {customizedIndices.map(qi => {
                const col = qi % COLS;
                const row = Math.floor(qi / COLS);
                return (
                  <div
                    key={`cust-${qi}`}
                    className="absolute pointer-events-none h-1.5 w-1.5 rounded-full bg-yellow-300 shadow"
                    style={{
                      left: `${(col + 1) * QUADRANT_W}%`,
                      top: `${row * QUADRANT_H}%`,
                      marginLeft: -8,
                      marginTop: 4,
                    }}
                  />
                );
              })}

              {/* Highlight active quadrant (stronger when customized) */}
              <div
                className={`absolute pointer-events-none ${isQuadrantCustomized ? 'bg-yellow-400/25 border-2 border-yellow-300/70' : 'bg-yellow-400/15'}`}
                style={{
                  left: `${(ballQuadrant % COLS) * QUADRANT_W}%`,
                  top: `${Math.floor(ballQuadrant / COLS) * QUADRANT_H}%`,
                  width: `${QUADRANT_W}%`,
                  height: `${QUADRANT_H}%`,
                }}
              />

              {/* Ghost (opposite phase OR compare quadrant) + colored distance lines */}
              {!loading && showGhost && (() => {
                const useCompare = compareQuadrant != null && compareQuadrant !== ballQuadrant;
                const ghostPhase = useCompare ? comparePhase : oppositePhase(phase);
                const ghostQ = useCompare ? compareQuadrant! : ballQuadrant;
                const ghostPositions = resolveRenderedPositions(phaseMap, ghostPhase, ghostQ, formation, knobs);
                // Color lines by how far the player has to travel. Black = short, yellow/orange = medium, red = far.
                const colorFor = (d: number) => {
                  if (d < 15) return 'rgba(0, 0, 0, 0.85)';
                  if (d < 30) return 'rgba(251, 146, 60, 0.9)'; // orange-400
                  return 'rgba(239, 68, 68, 0.95)'; // red-500
                };
                return (
                  <>
                    {showDistance && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        {slots.map(slot => {
                          const a = currentQuadrantPositions[slot.position];
                          const b = ghostPositions[slot.position];
                          if (!a || !b) return null;
                          const d = Math.hypot(a.x - b.x, a.y - b.y);
                          return (
                            <line
                              key={`dist-${slot.position}`}
                              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                              stroke={colorFor(d)}
                              strokeWidth="0.5"
                              strokeDasharray="1.2 0.8"
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                      </svg>
                    )}
                    {slots.map((slot, i) => {
                      const p = ghostPositions[slot.position] || { x: slot.x, y: slot.y };
                      return (
                        <PlayerChip
                          key={`ghost-${formation}-${slot.position}`}
                          jersey={i + 1}
                          label={slot.label}
                          slotPosition={slot.position}
                          pos={p}
                          fieldRef={fieldRef}
                          variant="ghost"
                        />
                      );
                    })}
                  </>
                );
              })()}

              {/* Opponent (visualization only, not persisted) */}
              {!loading && opponentFormation && opponentPositions && (() => {
                const oppSlots = FORMATIONS[opponentFormation] || [];
                return oppSlots.map((slot, i) => {
                  const p = opponentPositions[slot.position] || { x: slot.x, y: 100 - slot.y };
                  return (
                    <PlayerChip
                      key={`opp-${opponentFormation}-${slot.position}`}
                      jersey={i + 1}
                      label={slot.label}
                      slotPosition={slot.position}
                      pos={p}
                      fieldRef={fieldRef}
                      variant="opponent"
                      onDragEndSnapped={(np) => updateOpponentPos(slot.position, np)}
                    />
                  );
                });
              })()}

              {/* Players */}
              {!loading && slots.map((slot, i) => {
                const p = currentQuadrantPositions[slot.position] || { x: slot.x, y: slot.y };
                return (
                  <PlayerChip
                    key={`${formation}-${slot.position}`}
                    jersey={i + 1}
                    label={slot.label}
                    slotPosition={slot.position}
                    pos={p}
                    fieldRef={fieldRef}
                    onDragEndSnapped={(np) => updatePlayerPos(slot.position, np)}
                  />
                );
              })}

              {/* Ball */}
              <BallChip
                pos={ballPos}
                fieldRef={fieldRef}
                onDragEndSnapped={(idx) => setBallQuadrant(idx)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Secondary actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {isQuadrantCustomized && (
            <Button variant="outline" size="sm" onClick={resetCurrentQuadrant} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Resetar este quadrante
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Limpar todas as personalizações
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const other = Object.keys(FORMATIONS).find(f => f !== formation) || '';
              setDupTarget(other);
              setDupOpen(true);
            }}
            className="gap-1.5"
          >
            <Copy className="h-4 w-4" /> Duplicar para outra formação
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {customizedIndices.length}/35 quadrante(s) personalizado(s) nesta fase
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>Dinâmico (padrão):</strong> o time inteiro acompanha a bola — verticalmente mais, lateralmente menos.
          Quando você arrasta um jogador, o quadrante vira <strong>personalizado</strong> (pontinho amarelo no canto) e trava naquela configuração.
        </div>
      </div>

      {/* Duplicate dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar ajustes</DialogTitle>
            <DialogDescription>
              Copia só os quadrantes <strong>personalizados</strong> de <strong>{formation}</strong> para a formação escolhida, slot por slot
              (os não-personalizados continuam usando o dinâmico na nova formação). Salva direto no banco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Formação de destino</label>
            <Select value={dupTarget} onValueChange={setDupTarget}>
              <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).filter(f => f !== formation).map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(false)}>Cancelar</Button>
            <Button onClick={handleDuplicate} disabled={!dupTarget || dupTarget === formation}>Duplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
