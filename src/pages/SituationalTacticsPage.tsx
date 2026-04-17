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
import { ArrowLeft, Save, RotateCcw, Copy } from 'lucide-react';
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

/** Snap player to one of 9 points (3×3 grid) within whatever quadrant they land in. */
function snapPlayerPosition(x: number, y: number): Pos {
  const cx = clamp(x, 0, 100);
  const cy = clamp(y, 0, 100);
  const col = clamp(Math.floor(cx / QUADRANT_W), 0, COLS - 1);
  const row = clamp(Math.floor(cy / QUADRANT_H), 0, ROWS - 1);
  const relX = (cx - col * QUADRANT_W) / QUADRANT_W; // 0..1
  const relY = (cy - row * QUADRANT_H) / QUADRANT_H;
  const subCol = clamp(Math.floor(relX * 3), 0, 2);
  const subRow = clamp(Math.floor(relY * 3), 0, 2);
  return {
    x: col * QUADRANT_W + (subCol + 0.5) * (QUADRANT_W / 3),
    y: row * QUADRANT_H + (subRow + 0.5) * (QUADRANT_H / 3),
  };
}

/** Dynamic default for a quadrant — shift the whole formation proportionally to ball position. */
function computeDynamicPositions(quadrantIdx: number, formation: string): QuadrantPositions {
  const slots = FORMATIONS[formation] || [];
  const center = quadrantCenter(quadrantIdx);
  const dx = (center.x - 50) * DYNAMIC_SHIFT_X;
  const dy = (center.y - 50) * DYNAMIC_SHIFT_Y;
  const result: QuadrantPositions = {};
  for (const s of slots) {
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

// ── Draggable player piece ────────────────────────────────────
interface PlayerChipProps {
  jersey: number;
  label: string;
  pos: Pos;
  fieldRef: React.RefObject<HTMLDivElement>;
  onDragEndSnapped: (newPos: Pos) => void;
}

function PlayerChip({ jersey, label, pos, fieldRef, onDragEndSnapped }: PlayerChipProps) {
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
        const snapped = snapPlayerPosition(newX, newY);
        controls.set({ x: 0, y: 0 });
        onDragEndSnapped(snapped);
      }}
      className="absolute z-20 cursor-grab active:cursor-grabbing touch-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        marginLeft: -16,
        marginTop: -16,
      }}
    >
      <div className="flex flex-col items-center gap-0.5 select-none">
        <div
          className="h-8 w-8 rounded-full bg-red-600 border-2 border-black text-white flex items-center justify-center font-bold text-sm shadow-md"
        >
          {jersey}
        </div>
        <span className="text-[9px] font-semibold text-white bg-black/60 px-1 rounded">
          {label}
        </span>
      </div>
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
      className="absolute z-30 cursor-grab active:cursor-grabbing touch-none"
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

  const fieldRef = useRef<HTMLDivElement>(null);
  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];

  // ── Load / init from DB when club or formation changes ────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!club) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('situational_tactics' as any)
        .select('phase, positions')
        .eq('club_id', club.id)
        .eq('formation', formation);
      if (cancelled) return;
      if (error) {
        console.error(error);
        toast.error('Erro ao carregar táticas');
        setPhaseMap(buildEmptyBothPhases());
        setLoading(false);
        return;
      }
      // DB now stores ONLY customized quadrants. Missing keys = use dynamic default.
      const fresh: PhaseMap = buildEmptyBothPhases();
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
  const currentQuadrantPositions = resolvePositions(phaseMap, phase, ballQuadrant, formation);

  const updatePlayerPos = (slotPosition: string, newPos: Pos) => {
    setPhaseMap(prev => {
      // Promote to customized: take whatever we're currently showing (custom or dynamic) as the baseline.
      const baseline = prev[phase][ballQuadrant] ?? computeDynamicPositions(ballQuadrant, formation);
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

              {/* Players */}
              {!loading && slots.map((slot, i) => {
                const p = currentQuadrantPositions[slot.position] || { x: slot.x, y: slot.y };
                return (
                  <PlayerChip
                    key={`${formation}-${slot.position}`}
                    jersey={i + 1}
                    label={slot.label}
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
