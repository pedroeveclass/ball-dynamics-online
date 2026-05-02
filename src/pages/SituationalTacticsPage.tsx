import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useAnimationControls } from 'framer-motion';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { ManagerSituationalIntroTour } from '@/components/tour/ManagerSituationalIntroTour';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Save, RotateCcw, Copy, Eye, EyeOff, Users, X, FlipHorizontal, MoreHorizontal, Plus, Pencil, Trash2, Share2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { FORMATIONS } from './ManagerLineupPage';
import { positionLabel } from '@/lib/positions';

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
const PHASE_LABEL_KEY: Record<Phase, string> = {
  with_ball: 'phases.with_ball',
  without_ball: 'phases.without_ball',
};

// ── Tactical knobs ────────────────────────────────────────────
// These multiply/shift positions on top of the dynamic/custom layout.
// Same values are used in the match engine so the editor preview matches
// what actually happens on the pitch.
// Intelligence (with_ball: "Ataque" / without_ball: "Defesa") — central / balanced / wide.
// As of 2026-05-01 this knob no longer moves chips; it biases bot AI decisions
// (passes/dribbles toward middle vs flanks). Same value set as before.
type AttackType = 'central' | 'balanced' | 'wide';

// Positioning expanded 3 → 5 levels. Scales reproduce the legacy
// (positioning × attack_type) composition so users don't need to relearn:
//   very_narrow ≈ short × central (0.82 × 0.78 = 0.64)
//   narrow      = old "short"
//   normal      = old "normal"
//   spread      = old "spread"
//   very_spread ≈ spread × wide (1.18 × 1.22 = 1.44)
type Positioning = 'very_narrow' | 'narrow' | 'normal' | 'spread' | 'very_spread';
type Inclination = 'ultra_def' | 'def' | 'normal' | 'off' | 'ultra_off';
interface TacticKnobs {
  attack_type: AttackType;
  positioning: Positioning;
  inclination: Inclination;
}
const DEFAULT_KNOBS: TacticKnobs = { attack_type: 'balanced', positioning: 'normal', inclination: 'normal' };

// Per-phase knob bundle: with_ball and without_ball each carry their own values.
type KnobsByPhase = Record<Phase, TacticKnobs>;
const DEFAULT_KNOBS_BY_PHASE: KnobsByPhase = { with_ball: DEFAULT_KNOBS, without_ball: DEFAULT_KNOBS };

const POSITIONING_SCALE: Record<Positioning, number> = {
  very_narrow: 0.64,
  narrow: 0.82,
  normal: 1.0,
  spread: 1.18,
  very_spread: 1.44,
};
const INCLINATION_CELLS: Record<Inclination, number> = { ultra_def: 2, def: 1, normal: 0, off: -1, ultra_off: -2 };

// Migrate legacy 'short' value silently when reading.
const normalizePositioning = (v: any): Positioning => {
  if (v === 'short') return 'narrow';
  if (v === 'very_narrow' || v === 'narrow' || v === 'normal' || v === 'spread' || v === 'very_spread') return v;
  return 'normal';
};

// Label keys differ by phase: with_ball → "Ataque", without_ball → "Defesa".
const ATTACK_TYPE_KEY = (phase: Phase): Record<AttackType, string> => phase === 'with_ball'
  ? { central: 'knobs.attack.central', balanced: 'knobs.attack.balanced', wide: 'knobs.attack.wide' }
  : { central: 'knobs.defense.central', balanced: 'knobs.defense.balanced', wide: 'knobs.defense.wide' };
const POSITIONING_KEY: Record<Positioning, string> = {
  very_narrow: 'knobs.positioning.very_narrow',
  narrow: 'knobs.positioning.narrow',
  normal: 'knobs.positioning.normal',
  spread: 'knobs.positioning.spread',
  very_spread: 'knobs.positioning.very_spread',
};
const INCLINATION_KEY: Record<Inclination, string> = {
  ultra_def: 'knobs.inclination.ultra_def', def: 'knobs.inclination.def', normal: 'knobs.inclination.normal', off: 'knobs.inclination.off', ultra_off: 'knobs.inclination.ultra_off',
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

/** Apply the 2 positional knobs (positioning + inclination) on top of a set
 *  of positions. attack_type stops affecting layout — it now only hints the
 *  bot AI. Keeper is left untouched so the GK stays in the goal. */
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

/** Bilinear interpolation of player positions based on a continuous ball
 *  position. Used during the ball drag so chips animate live between the
 *  4 nearest quadrants, instead of jumping at quadrant boundaries. The user
 *  releases the ball → snap returns to the discrete quadrant layout. */
function resolveInterpolatedPositions(
  phaseMap: PhaseMap,
  phase: Phase,
  ballPos: Pos,
  formation: string,
  knobs: TacticKnobs,
): QuadrantPositions {
  const slots = FORMATIONS[formation] || [];
  // Continuous grid coordinate where (col+0.5, row+0.5) is the quadrant center.
  // ballX/QW gives a coordinate in [0..COLS]; subtracting 0.5 centers it on
  // the quadrant centers so floor() + (1 - frac) / frac give the bilinear weights.
  const gridX = clamp(ballPos.x / QUADRANT_W - 0.5, 0, COLS - 1);
  const gridY = clamp(ballPos.y / QUADRANT_H - 0.5, 0, ROWS - 1);
  const col0 = Math.floor(gridX);
  const row0 = Math.floor(gridY);
  const col1 = Math.min(col0 + 1, COLS - 1);
  const row1 = Math.min(row0 + 1, ROWS - 1);
  const tx = gridX - col0;
  const ty = gridY - row0;

  const sample = (col: number, row: number) =>
    resolveRenderedPositions(phaseMap, phase, row * COLS + col, formation, knobs);
  const tl = sample(col0, row0);
  const tr = sample(col1, row0);
  const bl = sample(col0, row1);
  const br = sample(col1, row1);

  const out: QuadrantPositions = {};
  for (const s of slots) {
    const a = tl[s.position]; const b = tr[s.position];
    const c = bl[s.position]; const d = br[s.position];
    if (!a || !b || !c || !d) continue;
    const top = { x: a.x * (1 - tx) + b.x * tx, y: a.y * (1 - tx) + b.y * tx };
    const bot = { x: c.x * (1 - tx) + d.x * tx, y: c.y * (1 - tx) + d.y * tx };
    out[s.position] = { x: top.x * (1 - ty) + bot.x * ty, y: top.y * (1 - ty) + bot.y * ty };
  }
  return out;
}

const oppositePhase = (p: Phase): Phase => (p === 'with_ball' ? 'without_ball' : 'with_ball');

// ── Set-piece tactics ─────────────────────────────────────────
// Bola Parada: one positional layout per (set_piece_type, phase). The engine
// picks the layout when a dead-ball restart fires (corner/throw-in/free-kick/
// goal-kick) and mirrors X by which side of the field the ball is on. No
// quadrants, no knobs — just one fixed shape per situation.
type SetPieceType = 'corner' | 'throw_in' | 'free_kick' | 'goal_kick';
const SET_PIECE_TYPES: SetPieceType[] = ['corner', 'throw_in', 'free_kick', 'goal_kick'];
const SET_PIECE_LABEL_KEY: Record<SetPieceType, string> = {
  corner: 'set_piece.type.corner',
  throw_in: 'set_piece.type.throw_in',
  free_kick: 'set_piece.type.free_kick',
  goal_kick: 'set_piece.type.goal_kick',
};
const SET_PIECE_HELP_KEY: Record<SetPieceType, string> = {
  corner: 'set_piece.help.corner',
  throw_in: 'set_piece.help.throw_in',
  free_kick: 'set_piece.help.free_kick',
  goal_kick: 'set_piece.help.goal_kick',
};

type SetPiecePhase = Phase;
type SetPieceLayout = QuadrantPositions; // slot_position → {x,y}
type SetPieceMap = Record<SetPieceType, Record<SetPiecePhase, SetPieceLayout | null>>;

function buildEmptySetPieceMap(): SetPieceMap {
  const out = {} as SetPieceMap;
  for (const t of SET_PIECE_TYPES) {
    out[t] = { with_ball: null, without_ball: null };
  }
  return out;
}

/** Sensible defaults per set-piece type. Used when no custom layout is saved. */
function defaultSetPiecePositions(
  formation: string,
  type: SetPieceType,
  phase: SetPiecePhase,
): SetPieceLayout {
  const slots = FORMATIONS[formation] || [];
  const out: SetPieceLayout = {};
  for (const s of slots) {
    if (s.position === 'GK') {
      // GK always near own goal area in editor space.
      out[s.position] = { x: SITU_GK_CENTER.x, y: SITU_GK_CENTER.y };
      continue;
    }
    // Start every outfield player at their formation default. The user drags
    // from there. We could be cleverer (push attackers up for a corner, etc.)
    // but the formation default is a known shape the user already understands.
    out[s.position] = { x: s.x, y: s.y };
  }
  return out;
}

/** GK center in editor space — same constant as the engine. */
const SITU_GK_CENTER = { x: 50, y: 92 };

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
  onDragLive?: (livePos: Pos | null) => void;
}

function BallChip({ pos, fieldRef, onDragEndSnapped, onDragLive }: BallChipProps) {
  const controls = useAnimationControls();
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      animate={controls}
      onDragStart={() => {
        onDragLive?.(pos);
      }}
      onDrag={(_, info) => {
        const rect = fieldRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dxPct = (info.offset.x / rect.width) * 100;
        const dyPct = (info.offset.y / rect.height) * 100;
        const newX = clamp(pos.x + dxPct, 0, 100);
        const newY = clamp(pos.y + dyPct, 0, 100);
        onDragLive?.({ x: newX, y: newY });
      }}
      onDragEnd={(_, info) => {
        const rect = fieldRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dxPct = (info.offset.x / rect.width) * 100;
        const dyPct = (info.offset.y / rect.height) * 100;
        const newX = clamp(pos.x + dxPct, 0, 100);
        const newY = clamp(pos.y + dyPct, 0, 100);
        const idx = snapBallToQuadrantIdx(newX, newY);
        controls.set({ x: 0, y: 0 });
        onDragLive?.(null);
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

// ── Tactic presets ────────────────────────────────────────────
// A preset bundles situational positions + knobs + set-pieces + role overrides
// under a custom name on top of a base formation. When `selectedPresetId` is
// null the page edits the club's "Padrão" (legacy situational_tactics +
// set_piece_tactics rows). Otherwise everything reads/writes from the preset.
const PRESET_LIMIT = 10;

interface TacticPreset {
  id: string;
  club_id: string;
  name: string;
  base_formation: string;
  positions: { with_ball: Record<string, QuadrantPositions>; without_ball: Record<string, QuadrantPositions> };
  knobs: TacticKnobs;
  set_pieces: Partial<Record<SetPieceType, Partial<Record<SetPiecePhase, SetPieceLayout>>>>;
  role_overrides: Record<string, string>;
}

// ── Page ──────────────────────────────────────────────────────
export default function SituationalTacticsPage() {
  const { t } = useTranslation('situational_tactics');
  const { club: ownClub, assistantClub, profile } = useAuth();
  const Layout = profile?.role_selected === 'manager' ? ManagerLayout : AppLayout;
  const club = ownClub || assistantClub;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [formation, setFormation] = useState('4-4-2');
  const [phase, setPhase] = useState<Phase>('with_ball');
  const [ballQuadrant, setBallQuadrant] = useState(17); // middle-ish (row 3, col 2)
  // While the user drags the ball, this holds the continuous (non-snapped)
  // ball position so the chips can animate live across quadrant boundaries.
  // Cleared on drag end (snap takes over).
  const [dragBallPos, setDragBallPos] = useState<Pos | null>(null);
  const [phaseMap, setPhaseMap] = useState<PhaseMap>(() => buildEmptyBothPhases());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState<string>('');

  // Visualization toggles (all local, non-persisted).
  const [showGhost, setShowGhost] = useState(false);
  const [showDistance, setShowDistance] = useState(false);
  const [showQuadrantNumbers, setShowQuadrantNumbers] = useState(false);
  const [opponentFormation, setOpponentFormation] = useState<string | null>(null);
  // Opponent overrides are per (formation, quadrant) but kept only in memory.
  const [opponentOverrides, setOpponentOverrides] = useState<Record<number, QuadrantPositions>>({});

  // Tactical knobs are now per-phase: with_ball and without_ball each carry
  // their own attack_type / positioning / inclination. The active triple
  // (`knobs`) reflects the currently-viewed phase and writes flow back into
  // the per-phase bundle.
  const [knobsByPhase, setKnobsByPhase] = useState<KnobsByPhase>(DEFAULT_KNOBS_BY_PHASE);
  const knobs = knobsByPhase[phase];
  const setKnobs = (updater: TacticKnobs | ((prev: TacticKnobs) => TacticKnobs)) => {
    setKnobsByPhase(prev => ({
      ...prev,
      [phase]: typeof updater === 'function' ? (updater as any)(prev[phase]) : updater,
    }));
  };

  // Compare-with-quadrant feature: when set, ghost shows this quadrant
  // (optionally of a different phase) instead of the opposite phase.
  const [compareQuadrant, setCompareQuadrant] = useState<number | null>(null);
  const [comparePhase, setComparePhase] = useState<Phase>('with_ball');

  // ── Mode toggle: regular tactics vs set-piece (Bola Parada) ──
  const [mode, setMode] = useState<'general' | 'set_piece'>('general');
  const [setPieceType, setSetPieceType] = useState<SetPieceType>('corner');
  const [setPiecePhase, setSetPiecePhase] = useState<SetPiecePhase>('with_ball');
  const [setPieceMap, setSetPieceMap] = useState<SetPieceMap>(() => buildEmptySetPieceMap());
  const [setPieceLoading, setSetPieceLoading] = useState(true);
  const [setPieceSaving, setSetPieceSaving] = useState(false);

  // ── Tactic presets (named variations) ──
  const [presets, setPresets] = useState<TacticPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [createPresetName, setCreatePresetName] = useState('');
  const [renamePresetOpen, setRenamePresetOpen] = useState(false);
  const [renamePresetValue, setRenamePresetValue] = useState('');
  const [deletePresetOpen, setDeletePresetOpen] = useState(false);
  const [duplicatePresetOpen, setDuplicatePresetOpen] = useState(false);
  const [duplicatePresetName, setDuplicatePresetName] = useState('');
  const [sharePresetOpen, setSharePresetOpen] = useState(false);
  const [shareTargetClubId, setShareTargetClubId] = useState<string>('');
  const [shareCandidates, setShareCandidates] = useState<Array<{ id: string; name: string }>>([]);
  const [shareSearch, setShareSearch] = useState('');
  const [presetActionBusy, setPresetActionBusy] = useState(false);
  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId) || null,
    [presets, selectedPresetId],
  );

  // ── Undo stack (Ctrl+Z / Cmd+Z) ──
  // Captures phaseMap + knobsByPhase + setPieceMap before each editing action
  // (drag, knob change, mirror, reset). Bounded at 10 entries. Cleared when
  // the editing context changes (preset / formation / club).
  type HistoryEntry = {
    phaseMap: PhaseMap;
    knobsByPhase: KnobsByPhase;
    setPieceMap: SetPieceMap;
  };
  const HISTORY_MAX = 10;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const captureSnapshot = (): HistoryEntry => ({
    phaseMap: JSON.parse(JSON.stringify(phaseMap)),
    knobsByPhase: JSON.parse(JSON.stringify(knobsByPhase)),
    setPieceMap: JSON.parse(JSON.stringify(setPieceMap)),
  });
  const pushHistorySnapshot = () => {
    setHistory(prev => {
      const snap = captureSnapshot();
      const next = [...prev, snap];
      if (next.length > HISTORY_MAX) next.shift();
      return next;
    });
  };
  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const snap = prev[prev.length - 1];
      setPhaseMap(snap.phaseMap);
      setKnobsByPhase(snap.knobsByPhase);
      setSetPieceMap(snap.setPieceMap);
      return next;
    });
  };
  // Clear stack on context shifts.
  useEffect(() => {
    setHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, formation, selectedPresetId]);

  // Ctrl+Z / Cmd+Z keyboard shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const setPieceFieldRef = useRef<HTMLDivElement>(null);
  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];

  // Seed the formation from the club's active lineup on mount, so the tactics page
  // defaults to whatever the manager already set on the lineup screen.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('lineups')
        .select('formation, tactic_preset_id')
        .eq('club_id', club.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      // If a preset is open via ?preset=ID we let that take over below.
      if (searchParams.get('preset')) return;
      if ((data as any)?.tactic_preset_id) {
        setSelectedPresetId((data as any).tactic_preset_id);
      } else if (data?.formation && FORMATIONS[data.formation]) {
        setFormation(data.formation);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  // Load all presets for the club so the selector can list them.
  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tactic_presets' as any)
        .select('*')
        .eq('club_id', club.id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[presets] load error', error);
        setPresets([]);
        return;
      }
      setPresets(((data as any) || []) as TacticPreset[]);
    })();
    return () => { cancelled = true; };
  }, [club?.id]);

  // Honor ?preset=ID deeplink (notification → "Compartilhei um preset com você").
  useEffect(() => {
    const id = searchParams.get('preset');
    if (!id) return;
    if (presets.find(p => p.id === id)) {
      setSelectedPresetId(id);
      // Clear the param so navigation in-page doesn't keep re-opening it.
      const next = new URLSearchParams(searchParams);
      next.delete('preset');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, presets, setSearchParams]);

  // When a preset is selected, sync the formation dropdown to the preset's base.
  useEffect(() => {
    if (!selectedPreset) return;
    if (FORMATIONS[selectedPreset.base_formation] && selectedPreset.base_formation !== formation) {
      setFormation(selectedPreset.base_formation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPresetId]);

  // ── Load / init from DB when club, formation, or selected preset changes ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!club) return;
      setLoading(true);

      // When a preset is selected, the situational layout comes from the preset
      // bundle (positions JSONB) rather than from the per-club default rows.
      if (selectedPreset) {
        const fresh: PhaseMap = buildEmptyBothPhases();
        const validSlots = new Set(slots.map(s => s.position));
        for (const phaseKey of PHASES) {
          const stored = (selectedPreset.positions?.[phaseKey] || {}) as Record<string, QuadrantPositions>;
          for (const [q, slotMap] of Object.entries(stored)) {
            const qi = Number(q);
            if (!Number.isFinite(qi) || qi < 0 || qi >= COLS * ROWS) continue;
            const relevant = Object.keys(slotMap).some(k => validSlots.has(k));
            if (!relevant) continue;
            const base = computeDynamicPositions(qi, formation);
            const merged: QuadrantPositions = { ...base };
            for (const s of slots) {
              if (slotMap[s.position]) merged[s.position] = slotMap[s.position];
            }
            fresh[phaseKey][qi] = merged;
          }
        }
        setPhaseMap(fresh);
        // Preset knobs are stored as { with_ball, without_ball } since v2; older
        // presets carry the flat shape and were migrated server-side, but read
        // defensively here too in case a preset slipped through.
        const rawKnobs = (selectedPreset.knobs || {}) as any;
        const isPerPhase = rawKnobs && (rawKnobs.with_ball || rawKnobs.without_ball);
        const buildPhase = (k: any): TacticKnobs => ({
          attack_type: (k?.attack_type as AttackType) || 'balanced',
          positioning: normalizePositioning(k?.positioning),
          inclination: (k?.inclination as Inclination) || 'normal',
        });
        setKnobsByPhase(isPerPhase
          ? { with_ball: buildPhase(rawKnobs.with_ball), without_ball: buildPhase(rawKnobs.without_ball) }
          : { with_ball: buildPhase(rawKnobs), without_ball: buildPhase(rawKnobs) });
        setLoading(false);
        return;
      }

      // Default ("Padrão"): read from the per-club situational_tactics rows.
      const { data, error } = await supabase
        .from('situational_tactics' as any)
        .select('phase, positions, attack_type, positioning, inclination')
        .eq('club_id', club.id)
        .eq('formation', formation);
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error(t('toast.load_error'));
        setPhaseMap(buildEmptyBothPhases());
        setKnobs(DEFAULT_KNOBS);
        setLoading(false);
        return;
      }
      const fresh: PhaseMap = buildEmptyBothPhases();
      // Knobs are stored per-row (per-phase); load each phase's knobs from its
      // own row instead of forcing them equal.
      const freshKnobs: KnobsByPhase = { with_ball: { ...DEFAULT_KNOBS }, without_ball: { ...DEFAULT_KNOBS } };
      for (const row of (data || []) as any[]) {
        const ph = row.phase as Phase;
        if (ph !== 'with_ball' && ph !== 'without_ball') continue;
        freshKnobs[ph] = {
          attack_type: (row.attack_type as AttackType) || 'balanced',
          positioning: normalizePositioning(row.positioning),
          inclination: (row.inclination as Inclination) || 'normal',
        };
      }
      setKnobsByPhase(freshKnobs);
      const validSlots = new Set(slots.map(s => s.position));
      for (const row of (data || []) as any[]) {
        const p = row.phase as Phase;
        const stored = (row.positions || {}) as Record<string, QuadrantPositions>;
        for (const [q, slotMap] of Object.entries(stored)) {
          const qi = Number(q);
          if (!Number.isFinite(qi) || qi < 0 || qi >= COLS * ROWS) continue;
          const relevant = Object.keys(slotMap).some(k => validSlots.has(k));
          if (!relevant) continue;
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
  }, [club?.id, formation, selectedPresetId]);

  // ── Set-piece (Bola Parada): load from DB or preset ────────
  useEffect(() => {
    let cancelled = false;
    async function loadSetPiece() {
      if (!club) return;
      setSetPieceLoading(true);

      if (selectedPreset) {
        const fresh = buildEmptySetPieceMap();
        const validSlots = new Set(slots.map(s => s.position));
        const sp = (selectedPreset.set_pieces || {}) as Partial<Record<SetPieceType, Partial<Record<SetPiecePhase, SetPieceLayout>>>>;
        for (const spt of SET_PIECE_TYPES) {
          for (const ph of PHASES) {
            const stored = sp[spt]?.[ph];
            if (!stored) continue;
            const merged: SetPieceLayout = defaultSetPiecePositions(formation, spt, ph);
            for (const k of Object.keys(stored)) {
              if (validSlots.has(k)) merged[k] = stored[k];
            }
            fresh[spt][ph] = merged;
          }
        }
        setSetPieceMap(fresh);
        setSetPieceLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('set_piece_tactics' as any)
        .select('set_piece_type, phase, positions')
        .eq('club_id', club.id)
        .eq('formation', formation);
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error(t('toast.load_set_piece_error'));
        setSetPieceMap(buildEmptySetPieceMap());
        setSetPieceLoading(false);
        return;
      }
      const fresh = buildEmptySetPieceMap();
      const validSlots = new Set(slots.map(s => s.position));
      for (const row of (data || []) as any[]) {
        const t = row.set_piece_type as SetPieceType;
        const p = row.phase as SetPiecePhase;
        if (!SET_PIECE_TYPES.includes(t)) continue;
        const stored = (row.positions || {}) as SetPieceLayout;
        const merged: SetPieceLayout = defaultSetPiecePositions(formation, t, p);
        for (const k of Object.keys(stored)) {
          if (validSlots.has(k)) merged[k] = stored[k];
        }
        fresh[t][p] = merged;
      }
      setSetPieceMap(fresh);
      setSetPieceLoading(false);
    }
    loadSetPiece();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, formation, selectedPresetId]);

  // ── Mutators ───────────────────────────────────────────────
  const isQuadrantCustomized = phaseMap[phase][ballQuadrant] != null;
  // Positions we render = knob-transformed when the quadrant is dynamic,
  // raw stored layout otherwise. Drag starts from whatever we render so
  // the user snaps off the visible position.
  // During a ball drag, interpolate across the 4 nearest quadrants so chips
  // glide instead of jumping at boundaries. After release, falls back to the
  // discrete quadrant layout.
  const currentQuadrantPositions = dragBallPos
    ? resolveInterpolatedPositions(phaseMap, phase, dragBallPos, formation, knobs)
    : resolveRenderedPositions(phaseMap, phase, ballQuadrant, formation, knobs);

  const updatePlayerPos = (slotPosition: string, newPos: Pos) => {
    pushHistorySnapshot();
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
    pushHistorySnapshot();
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

  // Mirror across the field: take customized quadrants from one side (cols 0+1
  // for L→R or cols 3+4 for R→L) and replicate them on the opposite side
  // (col 0 ↔ col 4, col 1 ↔ col 3) with x flipped, slot-by-slot via the
  // formation's left/right mirror mapping. Then fill the central column (col 2)
  // by averaging col 1 and col 3 per slot — but only when at least one of them
  // is customized in the new state. Applies only to the active phase.
  const applyMirror = (direction: 'leftToRight' | 'rightToLeft') => {
    pushHistorySnapshot();
    const mirrorMap = computeMirrorMapping(formation);
    const isLeftToRight = direction === 'leftToRight';
    const sourceCols = isLeftToRight ? [0, 1] : [4, 3];
    const destCols   = isLeftToRight ? [4, 3] : [0, 1];

    const flipQuadrant = (src: QuadrantPositions): QuadrantPositions => {
      const out: QuadrantPositions = {};
      for (const s of slots) {
        const srcSlot = mirrorMap[s.position] || s.position;
        const p = src[srcSlot];
        if (!p) continue;
        // Slots with x≈50 (e.g. lone striker) mirror to themselves; keep as-is.
        out[s.position] = srcSlot === s.position ? { x: p.x, y: p.y } : { x: 100 - p.x, y: p.y };
      }
      return out;
    };

    setPhaseMap(prev => {
      const nextPhase: QuadrantMap = { ...prev[phase] };
      for (let row = 0; row < ROWS; row++) {
        for (let i = 0; i < sourceCols.length; i++) {
          const srcIdx = row * COLS + sourceCols[i];
          const destIdx = row * COLS + destCols[i];
          const srcQuadrant = nextPhase[srcIdx];
          if (!srcQuadrant) continue; // Only mirror customized cells; leave dynamic destinations alone.
          nextPhase[destIdx] = flipQuadrant(srcQuadrant);
        }
        // Center column: average col 1 and col 3 per slot when at least one is
        // now customized. If both are dynamic, leave center as dynamic.
        const leftIdx = row * COLS + 1;
        const rightIdx = row * COLS + 3;
        const centerIdx = row * COLS + 2;
        const leftQ = nextPhase[leftIdx];
        const rightQ = nextPhase[rightIdx];
        if (leftQ || rightQ) {
          // Resolve each side: customized → use; dynamic → use dynamic+knobs at that quadrant.
          const knobsForPhase = knobsByPhase[phase];
          const leftResolved = leftQ ?? applyKnobs(computeDynamicPositions(leftIdx, formation), knobsForPhase, formation);
          const rightResolved = rightQ ?? applyKnobs(computeDynamicPositions(rightIdx, formation), knobsForPhase, formation);
          const merged: QuadrantPositions = {};
          for (const s of slots) {
            const a = leftResolved[s.position];
            const b = rightResolved[s.position];
            if (!a || !b) continue;
            merged[s.position] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          }
          nextPhase[centerIdx] = merged;
        }
      }
      return { ...prev, [phase]: nextPhase };
    });
    toast.success(direction === 'leftToRight' ? t('toast.mirror_left_to_right') : t('toast.mirror_right_to_left'));
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

  const serializeAllPhases = (): { with_ball: Record<string, QuadrantPositions>; without_ball: Record<string, QuadrantPositions> } => ({
    with_ball: serializePhase('with_ball'),
    without_ball: serializePhase('without_ball'),
  });

  const serializeSetPieces = (): Partial<Record<SetPieceType, Partial<Record<SetPiecePhase, SetPieceLayout>>>> => {
    const out: Partial<Record<SetPieceType, Partial<Record<SetPiecePhase, SetPieceLayout>>>> = {};
    for (const spt of SET_PIECE_TYPES) {
      for (const ph of PHASES) {
        const layout = setPieceMap[spt][ph];
        if (!layout) continue;
        if (!out[spt]) out[spt] = {};
        out[spt]![ph] = layout;
      }
    }
    return out;
  };

  const handleSave = async () => {
    if (!club) return;
    setSaving(true);

    // When a preset is selected, "Salvar" updates the preset's positions+knobs
    // (set_pieces and role_overrides are preserved untouched here — set_pieces
    // are saved by the dedicated set-piece save button; role_overrides are
    // managed via the lineup screen).
    if (selectedPreset) {
      const { error } = await (supabase as any).rpc('update_tactic_preset', {
        p_preset_id: selectedPreset.id,
        p_name: null,
        p_positions: serializeAllPhases(),
        p_knobs: knobsByPhase,
        p_set_pieces: null,
        p_role_overrides: null,
      });
      setSaving(false);
      if (error) {
        console.error(error);
        toast.error(t('toast.save_error'));
        return;
      }
      // Refresh local preset cache so subsequent reloads reflect saved state.
      setPresets(prev => prev.map(p => p.id === selectedPreset.id ? {
        ...p,
        positions: serializeAllPhases(),
        knobs: knobsByPhase as any,
      } : p));
      toast.success(t('toast.saved'));
      return;
    }

    const rows = PHASES.map(p => ({
      club_id: club.id,
      formation,
      phase: p,
      positions: serializePhase(p) as any,
      attack_type: knobsByPhase[p].attack_type,
      positioning: knobsByPhase[p].positioning,
      inclination: knobsByPhase[p].inclination,
    }));
    const { error } = await supabase
      .from('situational_tactics' as any)
      .upsert(rows, { onConflict: 'club_id,formation,phase' });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error(t('toast.save_error'));
      return;
    }
    toast.success(t('toast.saved'));
  };

  // ── Set-piece mutators / save ──────────────────────────────
  const currentSetPiecePositions: SetPieceLayout =
    setPieceMap[setPieceType][setPiecePhase]
    ?? defaultSetPiecePositions(formation, setPieceType, setPiecePhase);

  const updateSetPiecePos = (slotPosition: string, newPos: Pos) => {
    pushHistorySnapshot();
    setSetPieceMap(prev => {
      const baseline = prev[setPieceType][setPiecePhase]
        ?? defaultSetPiecePositions(formation, setPieceType, setPiecePhase);
      const next: SetPieceLayout = { ...baseline, [slotPosition]: newPos };
      return {
        ...prev,
        [setPieceType]: { ...prev[setPieceType], [setPiecePhase]: next },
      };
    });
  };

  const resetCurrentSetPiece = () => {
    pushHistorySnapshot();
    setSetPieceMap(prev => ({
      ...prev,
      [setPieceType]: { ...prev[setPieceType], [setPiecePhase]: null },
    }));
    toast.success(t('toast.set_piece_reset'));
  };

  const handleSaveSetPiece = async () => {
    if (!club) return;
    setSetPieceSaving(true);

    if (selectedPreset) {
      const sp = serializeSetPieces();
      const { error } = await (supabase as any).rpc('update_tactic_preset', {
        p_preset_id: selectedPreset.id,
        p_name: null,
        p_positions: null,
        p_knobs: null,
        p_set_pieces: sp,
        p_role_overrides: null,
      });
      setSetPieceSaving(false);
      if (error) {
        console.error(error);
        toast.error(t('toast.save_set_piece_error'));
        return;
      }
      setPresets(prev => prev.map(p => p.id === selectedPreset.id ? { ...p, set_pieces: sp } : p));
      toast.success(t('toast.saved_set_piece'));
      return;
    }

    const rows: any[] = [];
    for (const t of SET_PIECE_TYPES) {
      for (const p of PHASES) {
        const layout = setPieceMap[t][p];
        if (!layout) continue;
        rows.push({
          club_id: club.id,
          formation,
          set_piece_type: t,
          phase: p,
          positions: layout as any,
        });
      }
    }
    if (rows.length === 0) {
      setSetPieceSaving(false);
      toast.info(t('toast.no_layout_to_save'));
      return;
    }
    const { error } = await supabase
      .from('set_piece_tactics' as any)
      .upsert(rows, { onConflict: 'club_id,formation,set_piece_type,phase' });
    setSetPieceSaving(false);
    if (error) {
      console.error(error);
      toast.error(t('toast.save_set_piece_error'));
      return;
    }
    toast.success(t('toast.saved_set_piece'));
  };

  const customizedSetPieceCount = useMemo(() => {
    let n = 0;
    for (const t of SET_PIECE_TYPES) {
      for (const p of PHASES) {
        if (setPieceMap[t][p]) n++;
      }
    }
    return n;
  }, [setPieceMap]);

  const handleReset = () => {
    pushHistorySnapshot();
    setPhaseMap(buildEmptyBothPhases());
    toast.success(t('toast.all_cleared'));
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
      toast.error(t('toast.duplicate_error'));
      return;
    }
    toast.success(t('toast.duplicated', { target: dupTarget }));
    setDupOpen(false);
  };

  // ── Preset handlers ────────────────────────────────────────
  const presetErrorMessage = (err: any): string => {
    const msg = String(err?.message || '');
    if (msg.includes('limit_reached')) return t('preset.error.limit_reached');
    if (msg.includes('target_limit_reached')) return t('preset.error.target_limit_reached');
    if (msg.includes('name_taken')) return t('preset.error.name_taken');
    if (msg.includes('invalid_name')) return t('preset.error.invalid_name');
    if (msg.includes('forbidden')) return t('preset.error.forbidden');
    if (msg.includes('not_found')) return t('preset.error.not_found');
    if (msg.includes('same_club')) return t('preset.error.same_club');
    return t('preset.error.generic');
  };

  // Snapshot the active lineup's role_overrides if it matches the formation
  // we're about to capture into a new preset. Captures DM→AM-style choices.
  const snapshotActiveLineupRoleOverrides = async (baseFormation: string): Promise<Record<string, string>> => {
    if (!club) return {};
    const { data: lineup } = await supabase
      .from('lineups')
      .select('id, formation')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lineup || lineup.formation !== baseFormation) return {};
    const { data: slotRows } = await supabase
      .from('lineup_slots')
      .select('slot_position, role_override')
      .eq('lineup_id', lineup.id);
    const map: Record<string, string> = {};
    for (const r of (slotRows || []) as any[]) {
      if (r.role_override) map[r.slot_position] = r.role_override as string;
    }
    return map;
  };

  const handleCreatePreset = async () => {
    if (!club) return;
    const name = createPresetName.trim();
    if (!name) { toast.error(t('preset.error.invalid_name')); return; }
    setPresetActionBusy(true);
    try {
      const role_overrides = await snapshotActiveLineupRoleOverrides(formation);
      const { data, error } = await (supabase as any).rpc('create_tactic_preset', {
        p_club_id: club.id,
        p_name: name,
        p_base_formation: formation,
        p_positions: serializeAllPhases(),
        p_knobs: knobsByPhase,
        p_set_pieces: serializeSetPieces(),
        p_role_overrides: role_overrides,
      });
      if (error) throw error;
      const newId = data as string;
      // Refetch to get the canonical row.
      const { data: row } = await supabase
        .from('tactic_presets' as any)
        .select('*')
        .eq('id', newId)
        .maybeSingle();
      if (row) setPresets(prev => [...prev, row as any]);
      setSelectedPresetId(newId);
      setCreatePresetOpen(false);
      setCreatePresetName('');
      toast.success(t('preset.toast.created', { name }));
    } catch (err: any) {
      toast.error(presetErrorMessage(err));
    } finally {
      setPresetActionBusy(false);
    }
  };

  const handleDuplicatePreset = async () => {
    if (!selectedPreset) return;
    const name = duplicatePresetName.trim();
    if (!name) { toast.error(t('preset.error.invalid_name')); return; }
    setPresetActionBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('duplicate_tactic_preset', {
        p_preset_id: selectedPreset.id,
        p_new_name: name,
      });
      if (error) throw error;
      const newId = data as string;
      const { data: row } = await supabase
        .from('tactic_presets' as any)
        .select('*')
        .eq('id', newId)
        .maybeSingle();
      if (row) setPresets(prev => [...prev, row as any]);
      setSelectedPresetId(newId);
      setDuplicatePresetOpen(false);
      setDuplicatePresetName('');
      toast.success(t('preset.toast.duplicated', { name }));
    } catch (err: any) {
      toast.error(presetErrorMessage(err));
    } finally {
      setPresetActionBusy(false);
    }
  };

  const handleRenamePreset = async () => {
    if (!selectedPreset) return;
    const name = renamePresetValue.trim();
    if (!name || name === selectedPreset.name) { setRenamePresetOpen(false); return; }
    setPresetActionBusy(true);
    try {
      const { error } = await (supabase as any).rpc('update_tactic_preset', {
        p_preset_id: selectedPreset.id,
        p_name: name,
        p_positions: null,
        p_knobs: null,
        p_set_pieces: null,
        p_role_overrides: null,
      });
      if (error) throw error;
      setPresets(prev => prev.map(p => p.id === selectedPreset.id ? { ...p, name } : p));
      setRenamePresetOpen(false);
      toast.success(t('preset.toast.renamed', { name }));
    } catch (err: any) {
      toast.error(presetErrorMessage(err));
    } finally {
      setPresetActionBusy(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset) return;
    setPresetActionBusy(true);
    try {
      const { error } = await (supabase as any).rpc('delete_tactic_preset', {
        p_preset_id: selectedPreset.id,
      });
      if (error) throw error;
      const removedName = selectedPreset.name;
      setPresets(prev => prev.filter(p => p.id !== selectedPreset.id));
      setSelectedPresetId(null);
      setDeletePresetOpen(false);
      toast.success(t('preset.toast.deleted', { name: removedName }));
    } catch (err: any) {
      toast.error(presetErrorMessage(err));
    } finally {
      setPresetActionBusy(false);
    }
  };

  // Open share dialog → fetch the candidate clubs the user can share with.
  // We pull every club except the source — RLS lets all authenticated users
  // read the public clubs table.
  const openShareDialog = async () => {
    if (!selectedPreset || !club) return;
    setShareTargetClubId('');
    setShareSearch('');
    setSharePresetOpen(true);
    const { data } = await supabase
      .from('clubs')
      .select('id, name')
      .neq('id', club.id)
      .order('name', { ascending: true })
      .limit(500);
    setShareCandidates(((data as any) || []) as Array<{ id: string; name: string }>);
  };

  const handleSharePreset = async () => {
    if (!selectedPreset || !shareTargetClubId) return;
    setPresetActionBusy(true);
    try {
      const { error } = await (supabase as any).rpc('share_tactic_preset', {
        p_preset_id: selectedPreset.id,
        p_target_club_id: shareTargetClubId,
      });
      if (error) throw error;
      const targetName = shareCandidates.find(c => c.id === shareTargetClubId)?.name || '';
      setSharePresetOpen(false);
      toast.success(t('preset.toast.shared', { target: targetName }));
    } catch (err: any) {
      toast.error(presetErrorMessage(err));
    } finally {
      setPresetActionBusy(false);
    }
  };

  // Changing the formation dropdown drops the selected preset (presets are
  // pinned to a base formation; switching means leaving that preset).
  const handleFormationChange = (newFormation: string) => {
    if (selectedPresetId) setSelectedPresetId(null);
    setFormation(newFormation);
  };

  const handlePresetSelectChange = (value: string) => {
    if (value === '__default__') setSelectedPresetId(null);
    else setSelectedPresetId(value);
  };

  const filteredShareCandidates = useMemo(() => {
    const q = shareSearch.trim().toLowerCase();
    if (!q) return shareCandidates.slice(0, 50);
    return shareCandidates.filter(c => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [shareSearch, shareCandidates]);

  // ── Render ─────────────────────────────────────────────────
  const quadrantLabel = useMemo(() => {
    const col = ballQuadrant % COLS;
    const row = Math.floor(ballQuadrant / COLS);
    const zoneY = t(row <= 1 ? 'zone_y.attack' : row <= 4 ? 'zone_y.midfield' : 'zone_y.defense');
    const zoneX = t(
      col === 0 ? 'zone_x.left'
        : col === 4 ? 'zone_x.right'
          : col === 2 ? 'zone_x.center'
            : col === 1 ? 'zone_x.center_left'
              : 'zone_x.center_right',
    );
    const state = t(isQuadrantCustomized ? 'state.custom' : 'state.dynamic');
    return t('quadrant_label', { n: ballQuadrant + 1, zoneY, zoneX, state });
  }, [ballQuadrant, isQuadrantCustomized, t]);

  const customizedIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < COLS * ROWS; i++) if (phaseMap[phase][i]) out.push(i);
    return out;
  }, [phaseMap, phase]);

  if (!club) {
    return <Layout><div className="p-6">{t('club_not_found')}</div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-4">
        <ManagerSituationalIntroTour enabled={!loading} />
        {/* Header */}
        <div data-tour="situational-header" className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/manager/lineup"><ArrowLeft className="h-4 w-4" /> {t('header.back')}</Link>
            </Button>
            <div>
              <h1 className="font-display text-2xl font-bold">{t('header.title')}</h1>
              <p className="text-xs text-muted-foreground">
                {t('header.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={formation} onValueChange={handleFormationChange} disabled={!!selectedPresetId}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedPresetId ?? '__default__'} onValueChange={handlePresetSelectChange}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">{t('preset.default')}</SelectItem>
                {presets.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t('preset.my_presets')}</SelectLabel>
                    {presets.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.base_formation} — {p.name}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={undo}
              disabled={history.length === 0}
              title={t('actions.undo_hint')}
            >
              <Undo2 className="h-4 w-4" /> {t('actions.undo')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (presets.length >= PRESET_LIMIT) {
                      toast.error(t('preset.error.limit_reached'));
                      return;
                    }
                    setCreatePresetName('');
                    setCreatePresetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> {t('preset.actions.save_as_new')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!selectedPreset}
                  onClick={() => {
                    if (!selectedPreset) return;
                    if (presets.length >= PRESET_LIMIT) {
                      toast.error(t('preset.error.limit_reached'));
                      return;
                    }
                    setDuplicatePresetName(`${selectedPreset.name} (cópia)`);
                    setDuplicatePresetOpen(true);
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> {t('preset.actions.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!selectedPreset}
                  onClick={() => {
                    if (!selectedPreset) return;
                    setRenamePresetValue(selectedPreset.name);
                    setRenamePresetOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" /> {t('preset.actions.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!selectedPreset} onClick={openShareDialog}>
                  <Share2 className="h-4 w-4 mr-2" /> {t('preset.actions.share')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!selectedPreset}
                  onClick={() => setDeletePresetOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> {t('preset.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {mode === 'general' ? (
              <Button onClick={handleSave} disabled={saving || loading} className="gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? t('saving') : t('save')}
              </Button>
            ) : (
              <Button onClick={handleSaveSetPiece} disabled={setPieceSaving || setPieceLoading} className="gap-1.5">
                <Save className="h-4 w-4" />
                {setPieceSaving ? t('saving_set_piece') : t('save_set_piece')}
              </Button>
            )}
          </div>
        </div>

        {selectedPreset && (
          <div className="bg-tactical/10 border border-tactical/30 rounded-md px-3 py-2 text-xs text-foreground/80">
            {t('preset.editing_banner', { name: selectedPreset.name, base: selectedPreset.base_formation })}
          </div>
        )}

        {/* Top-level mode toggle: Geral (35-quadrant) vs Bola Parada */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'general' | 'set_piece')}>
          <TabsList data-tour="situational-setpieces">
            <TabsTrigger value="general">{t('modes.general')}</TabsTrigger>
            <TabsTrigger value="set_piece">{t('modes.set_piece')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'set_piece' && (
          <div className="space-y-4">
            {/* Set-piece type tabs + phase toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Tabs value={setPieceType} onValueChange={(v) => setSetPieceType(v as SetPieceType)}>
                <TabsList>
                  {SET_PIECE_TYPES.map(spt => (
                    <TabsTrigger key={spt} value={spt}>{t(SET_PIECE_LABEL_KEY[spt])}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Tabs value={setPiecePhase} onValueChange={(v) => setSetPiecePhase(v as SetPiecePhase)}>
                <TabsList>
                  <TabsTrigger value="with_ball">{t('set_piece.phase.with_ball')}</TabsTrigger>
                  <TabsTrigger value="without_ball">{t('set_piece.phase.without_ball')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <p className="text-xs text-muted-foreground">{t(SET_PIECE_HELP_KEY[setPieceType])}</p>

            {/* Set-piece field */}
            <Card>
              <CardContent className="p-3">
                <div
                  ref={setPieceFieldRef}
                  className="relative w-full mx-auto rounded-lg overflow-hidden border-2 border-white/30 bg-gradient-to-b from-green-700 to-green-800 touch-none"
                  style={{ aspectRatio: '3/4', maxWidth: 480 }}
                >
                  {/* Field markings */}
                  <div className="absolute left-0 right-0 border-t-2 border-white/60" style={{ top: '50%' }} />
                  <div
                    className="absolute rounded-full border-2 border-white/60"
                    style={{
                      left: '50%', top: '50%',
                      width: '22%', aspectRatio: '1 / 1',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-0 border-2 border-t-0 border-white/60"
                    style={{ width: '38%', height: '14%' }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 bottom-0 border-2 border-b-0 border-white/60"
                    style={{ width: '38%', height: '14%' }}
                  />

                  {/* Players */}
                  {!setPieceLoading && slots.map((slot, i) => {
                    const p = currentSetPiecePositions[slot.position] || { x: slot.x, y: slot.y };
                    return (
                      <PlayerChip
                        key={`sp-${formation}-${setPieceType}-${setPiecePhase}-${slot.position}`}
                        jersey={i + 1}
                        label={positionLabel(slot.position)}
                        slotPosition={slot.position}
                        pos={p}
                        fieldRef={setPieceFieldRef}
                        onDragEndSnapped={(np) => updateSetPiecePos(slot.position, np)}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Set-piece secondary actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {setPieceMap[setPieceType][setPiecePhase] && (
                <Button variant="outline" size="sm" onClick={resetCurrentSetPiece} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> {t('set_piece.reset_layout')}
                </Button>
              )}
              <div className="ml-auto text-xs text-muted-foreground">
                {t('set_piece.customized_count', { count: customizedSetPieceCount })}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <Trans t={t} i18nKey="set_piece.explanation" components={[<strong key="0" />]} />
            </div>
          </div>
        )}

        {mode === 'general' && (<>
        {/* Phase tabs + quadrant info */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Tabs value={phase} onValueChange={(v) => setPhase(v as Phase)}>
            <TabsList>
              {PHASES.map(p => (
                <TabsTrigger key={p} value={p}>{t(PHASE_LABEL_KEY[p])}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="text-xs text-muted-foreground font-semibold">{quadrantLabel}</div>
        </div>

        {/* Visualization toolbar: ghost overlay, distance, opponent, mirror */}
        <div data-tour="situational-viz" className="flex items-center gap-2 flex-wrap text-xs">
          <Button
            variant={showGhost ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowGhost(v => !v)}
            className="gap-1.5"
          >
            {showGhost ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {t('viz.opposite_phase', { phase: t(PHASE_LABEL_KEY[oppositePhase(phase)]) })}
          </Button>
          <label className={`flex items-center gap-1.5 px-2 py-1 rounded border ${showGhost ? '' : 'opacity-50 pointer-events-none'}`}>
            <Checkbox
              checked={showDistance}
              onCheckedChange={(v) => setShowDistance(!!v)}
            />
            <span>{t('viz.distance')}</span>
          </label>
          <label className="flex items-center gap-1.5 px-2 py-1 rounded border">
            <Checkbox
              checked={showQuadrantNumbers}
              onCheckedChange={(v) => setShowQuadrantNumbers(!!v)}
            />
            <span>{t('viz.show_numbers')}</span>
          </label>

          <div className="flex items-center gap-1.5 pl-2 border-l ml-1">
            <span className="text-muted-foreground">{t('viz.opponent_label')}</span>
            <Select
              value={opponentFormation ?? 'none'}
              onValueChange={(v) => setOpponentFormationAndReset(v === 'none' ? null : v)}
            >
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('viz.no_opponent')}</SelectItem>
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
            <span className="text-muted-foreground">{t('viz.mirror_label')}</span>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => applyMirror('leftToRight')}>
              <FlipHorizontal className="h-3.5 w-3.5" /> {t('viz.mirror_left_to_right')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => applyMirror('rightToLeft')}>
              <FlipHorizontal className="h-3.5 w-3.5" /> {t('viz.mirror_right_to_left')}
            </Button>
          </div>
        </div>

        {/* Tactical knobs + quadrant comparison */}
        <div data-tour="situational-knobs" className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t(phase === 'with_ball' ? 'knobs.attack_label' : 'knobs.defense_label')}</span>
            <Select value={knobs.attack_type} onValueChange={(v) => { pushHistorySnapshot(); setKnobs(k => ({ ...k, attack_type: v as AttackType })); }}>
              <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['central','balanced','wide'] as AttackType[]).map(k => (
                  <SelectItem key={k} value={k}>{t(ATTACK_TYPE_KEY(phase)[k])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('knobs.positioning_label')}</span>
            <Select value={knobs.positioning} onValueChange={(v) => { pushHistorySnapshot(); setKnobs(k => ({ ...k, positioning: v as Positioning })); }}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['very_narrow','narrow','normal','spread','very_spread'] as Positioning[]).map(k => (
                  <SelectItem key={k} value={k}>{t(POSITIONING_KEY[k])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('knobs.inclination_label')}</span>
            <Select value={knobs.inclination} onValueChange={(v) => { pushHistorySnapshot(); setKnobs(k => ({ ...k, inclination: v as Inclination })); }}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INCLINATION_KEY) as Inclination[]).map(k => (
                  <SelectItem key={k} value={k}>{t(INCLINATION_KEY[k])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l ml-1">
            <span className="text-muted-foreground">{t('viz.compare_quadrant')}</span>
            <Select
              value={compareQuadrant == null ? 'none' : String(compareQuadrant)}
              onValueChange={(v) => setCompareQuadrant(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="none">{t('viz.none')}</SelectItem>
                {Array.from({ length: COLS * ROWS }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {compareQuadrant != null && (
              <Select value={comparePhase} onValueChange={(v) => setComparePhase(v as Phase)}>
                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => <SelectItem key={p} value={p}>{t(PHASE_LABEL_KEY[p])}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {compareQuadrant != null && !showGhost && (
              <span className="text-[10px] text-amber-600">{t('viz.ghost_hint')}</span>
            )}
          </div>
        </div>

        {/* Field */}
        <Card data-tour="situational-grid">
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

              {/* Quadrant numbers (toggle) */}
              {showQuadrantNumbers && Array.from({ length: COLS * ROWS }, (_, qi) => {
                const col = qi % COLS;
                const row = Math.floor(qi / COLS);
                return (
                  <div
                    key={`qnum-${qi}`}
                    className="absolute pointer-events-none text-white/55 font-mono font-semibold leading-none"
                    style={{
                      left: `${col * QUADRANT_W}%`,
                      top: `${row * QUADRANT_H}%`,
                      paddingLeft: 3,
                      paddingTop: 3,
                      fontSize: 9,
                      textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                    }}
                  >
                    {qi + 1}
                  </div>
                );
              })}

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
                          label={positionLabel(slot.position)}
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
                      label={positionLabel(slot.position)}
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
                    label={positionLabel(slot.position)}
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
                onDragLive={setDragBallPos}
              />
            </div>
          </CardContent>
        </Card>

        {/* Secondary actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {isQuadrantCustomized && (
            <Button variant="outline" size="sm" onClick={resetCurrentQuadrant} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> {t('actions.reset_quadrant')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> {t('actions.reset_all')}
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
            <Copy className="h-4 w-4" /> {t('actions.duplicate')}
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {t('customized_status', { count: customizedIndices.length })}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <Trans t={t} i18nKey="explanation" components={[<strong key="0" />, <strong key="1" />]} />
        </div>
        </>)}
      </div>

      {/* Create preset dialog */}
      <Dialog open={createPresetOpen} onOpenChange={setCreatePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preset.dialog.create_title')}</DialogTitle>
            <DialogDescription>{t('preset.dialog.create_description', { count: presets.length, limit: PRESET_LIMIT, formation })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">{t('preset.dialog.name_label')}</label>
            <Input
              value={createPresetName}
              onChange={e => setCreatePresetName(e.target.value)}
              placeholder={t('preset.dialog.name_placeholder')}
              maxLength={40}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePresetOpen(false)} disabled={presetActionBusy}>{t('preset.dialog.cancel')}</Button>
            <Button onClick={handleCreatePreset} disabled={presetActionBusy || !createPresetName.trim()}>
              {presetActionBusy ? t('preset.dialog.saving') : t('preset.dialog.create_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename preset dialog */}
      <Dialog open={renamePresetOpen} onOpenChange={setRenamePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preset.dialog.rename_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">{t('preset.dialog.name_label')}</label>
            <Input
              value={renamePresetValue}
              onChange={e => setRenamePresetValue(e.target.value)}
              maxLength={40}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamePresetOpen(false)} disabled={presetActionBusy}>{t('preset.dialog.cancel')}</Button>
            <Button onClick={handleRenamePreset} disabled={presetActionBusy || !renamePresetValue.trim()}>
              {presetActionBusy ? t('preset.dialog.saving') : t('preset.dialog.rename_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate preset dialog */}
      <Dialog open={duplicatePresetOpen} onOpenChange={setDuplicatePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preset.dialog.duplicate_title')}</DialogTitle>
            <DialogDescription>{t('preset.dialog.duplicate_description', { name: selectedPreset?.name || '' })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">{t('preset.dialog.name_label')}</label>
            <Input
              value={duplicatePresetName}
              onChange={e => setDuplicatePresetName(e.target.value)}
              maxLength={40}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicatePresetOpen(false)} disabled={presetActionBusy}>{t('preset.dialog.cancel')}</Button>
            <Button onClick={handleDuplicatePreset} disabled={presetActionBusy || !duplicatePresetName.trim()}>
              {presetActionBusy ? t('preset.dialog.saving') : t('preset.dialog.duplicate_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete preset dialog */}
      <Dialog open={deletePresetOpen} onOpenChange={setDeletePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preset.dialog.delete_title')}</DialogTitle>
            <DialogDescription>{t('preset.dialog.delete_description', { name: selectedPreset?.name || '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePresetOpen(false)} disabled={presetActionBusy}>{t('preset.dialog.cancel')}</Button>
            <Button variant="destructive" onClick={handleDeletePreset} disabled={presetActionBusy}>
              {presetActionBusy ? t('preset.dialog.saving') : t('preset.dialog.delete_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share preset dialog */}
      <Dialog open={sharePresetOpen} onOpenChange={setSharePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preset.dialog.share_title')}</DialogTitle>
            <DialogDescription>{t('preset.dialog.share_description', { name: selectedPreset?.name || '' })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder={t('preset.dialog.share_search_placeholder')}
              value={shareSearch}
              onChange={e => setShareSearch(e.target.value)}
            />
            <div className="max-h-[260px] overflow-y-auto border rounded-md divide-y">
              {filteredShareCandidates.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">{t('preset.dialog.share_no_clubs')}</div>
              ) : filteredShareCandidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => setShareTargetClubId(c.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 ${shareTargetClubId === c.id ? 'bg-tactical/15' : ''}`}
                  type="button"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSharePresetOpen(false)} disabled={presetActionBusy}>{t('preset.dialog.cancel')}</Button>
            <Button onClick={handleSharePreset} disabled={presetActionBusy || !shareTargetClubId}>
              {presetActionBusy ? t('preset.dialog.saving') : t('preset.dialog.share_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('duplicate_dialog.title')}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="duplicate_dialog.description"
                values={{ formation }}
                components={[<strong key="0" />, <strong key="1" />]}
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">{t('duplicate_dialog.target_label')}</label>
            <Select value={dupTarget} onValueChange={setDupTarget}>
              <SelectTrigger><SelectValue placeholder={t('duplicate_dialog.target_placeholder')} /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).filter(f => f !== formation).map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(false)}>{t('duplicate_dialog.cancel')}</Button>
            <Button onClick={handleDuplicate} disabled={!dupTarget || dupTarget === formation}>{t('duplicate_dialog.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
