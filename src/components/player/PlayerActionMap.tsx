import { useTranslation } from 'react-i18next';
import { PitchSVG, FIELD_W, FIELD_H, PAD, INNER_W, INNER_H } from '@/components/PitchSVG';

export interface PassDatum {
  from: { x: number; y: number };
  to: { x: number; y: number };
  completed: boolean;
}

export interface ShotDatum {
  from: { x: number; y: number };
  outcome: 'goal' | 'over' | 'wide' | 'post' | 'saved';
}

interface PassMapProps {
  passes: PassDatum[];
  attackingDirection?: 'ltr' | 'rtl';
  filter?: 'all' | 'completed' | 'failed';
  className?: string;
}

interface ShotMapProps {
  shots: ShotDatum[];
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

function pctToSvg(x: number, y: number, mirror: boolean): { sx: number; sy: number } {
  const ex = mirror ? 100 - x : x;
  return {
    sx: PAD + (ex / 100) * INNER_W,
    sy: PAD + (y / 100) * INNER_H,
  };
}

// ── Synthetic fallback positions ────────────────────────────────────────
// When old matches have stats counts but no per-event coordinates, we still
// want to surface counts on the field. Each synthetic dot is placed in a
// canonical zone for its kind, with lateral Y spread so multiples don't
// stack on top of each other.
function spreadY(idx: number, count: number, min = 22, max = 78): number {
  if (count <= 1) return (min + max) / 2;
  return min + (idx / (count - 1)) * (max - min);
}

export function syntheticShots(goals: number, others: number): ShotDatum[] {
  const list: ShotDatum[] = [];
  for (let i = 0; i < goals; i++) {
    list.push({ from: { x: 96, y: spreadY(i, goals, 44, 56) }, outcome: 'goal' });
  }
  // Alternate misses between top-post and bottom-post zones for visual variety.
  const halfTop = Math.ceil(others / 2);
  const halfBot = others - halfTop;
  for (let i = 0; i < halfTop; i++) {
    list.push({ from: { x: 90, y: spreadY(i, halfTop, 30, 40) }, outcome: 'wide' });
  }
  for (let i = 0; i < halfBot; i++) {
    list.push({ from: { x: 90, y: spreadY(i, halfBot, 60, 70) }, outcome: 'wide' });
  }
  return list;
}

export function syntheticPasses(completed: number, failed: number): PassDatum[] {
  const list: PassDatum[] = [];
  // Zero-length arrows → renderer detects and draws a single dot.
  for (let i = 0; i < completed; i++) {
    const y = spreadY(i, completed, 28, 72);
    list.push({ from: { x: 48, y }, to: { x: 48, y }, completed: true });
  }
  for (let i = 0; i < failed; i++) {
    const y = spreadY(i, failed, 28, 72);
    list.push({ from: { x: 52, y }, to: { x: 52, y }, completed: false });
  }
  return list;
}

export function syntheticDefensive(tackles: number, interceptions: number): DefensiveDatum[] {
  const list: DefensiveDatum[] = [];
  for (let i = 0; i < tackles; i++) {
    list.push({ pos: { x: 16, y: spreadY(i, tackles, 28, 72) }, kind: 'tackle' });
  }
  for (let i = 0; i < interceptions; i++) {
    list.push({ pos: { x: 20, y: spreadY(i, interceptions, 28, 72) }, kind: 'interception' });
  }
  return list;
}

export function syntheticDribbles(count: number): DribbleDatum[] {
  const list: DribbleDatum[] = [];
  for (let i = 0; i < count; i++) {
    list.push({ pos: { x: 60, y: spreadY(i, count, 30, 70) } });
  }
  return list;
}

export function PlayerPassMap({ passes, attackingDirection = 'ltr', filter = 'all', className }: PassMapProps) {
  const { t } = useTranslation('public_player');
  const mirror = attackingDirection === 'rtl';
  const filtered = filter === 'all'
    ? passes
    : filter === 'completed' ? passes.filter(p => p.completed) : passes.filter(p => !p.completed);

  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <marker id="passArrowOk" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#22c55e" />
          </marker>
          <marker id="passArrowBad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
          </marker>
        </defs>
        {filtered.map((p, idx) => {
          const a = pctToSvg(p.from.x, p.from.y, mirror);
          const b = pctToSvg(p.to.x, p.to.y, mirror);
          const stroke = p.completed ? '#22c55e' : '#ef4444';
          const marker = p.completed ? 'url(#passArrowOk)' : 'url(#passArrowBad)';
          // Zero-length passes are synthetic fallbacks for old matches
          // without coords — render as a single dot so multiples don't
          // collapse into invisible arrowheads on top of each other.
          const isDot = Math.abs(p.from.x - p.to.x) < 0.5 && Math.abs(p.from.y - p.to.y) < 0.5;
          if (isDot) {
            return (
              <circle key={idx} cx={a.sx} cy={a.sy} r={6}
                fill={stroke} fillOpacity={0.85}
                stroke="#0f172a" strokeWidth={1.5} />
            );
          }
          return (
            <line
              key={idx}
              x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
              stroke={stroke}
              strokeWidth={2.5}
              strokeOpacity={0.85}
              markerEnd={marker}
            />
          );
        })}
      </svg>
      {filtered.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">{t('stats.empty.no_passes')}</span>
        </div>
      )}
    </div>
  );
}

export function PlayerShotMap({ shots, attackingDirection = 'ltr', className }: ShotMapProps) {
  const { t } = useTranslation('public_player');
  const mirror = attackingDirection === 'rtl';
  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {shots.map((s, idx) => {
          const a = pctToSvg(s.from.x, s.from.y, mirror);
          // Always shoot toward right goal in normalized direction
          const goalSx = PAD + INNER_W;
          const goalSy = PAD + INNER_H * 0.5;
          const fill =
            s.outcome === 'goal' ? '#22c55e' :
            s.outcome === 'post' ? '#f59e0b' :
            s.outcome === 'saved' ? '#3b82f6' :
            '#94a3b8';
          const stroke = s.outcome === 'goal' ? '#16a34a' : '#475569';
          return (
            <g key={idx}>
              <line x1={a.sx} y1={a.sy} x2={goalSx} y2={goalSy}
                stroke={fill} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="4 3" />
              <circle cx={a.sx} cy={a.sy} r={s.outcome === 'goal' ? 8 : 5}
                fill={fill} stroke={stroke} strokeWidth={1.5} fillOpacity={0.9} />
            </g>
          );
        })}
      </svg>
      {shots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">{t('stats.empty.no_shots')}</span>
        </div>
      )}
    </div>
  );
}

export interface DefensiveDatum {
  pos: { x: number; y: number };
  kind: 'tackle' | 'interception';
}

interface DefensiveMapProps {
  events: DefensiveDatum[];
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

export function PlayerDefensiveMap({ events, attackingDirection = 'ltr', className }: DefensiveMapProps) {
  const { t } = useTranslation('public_player');
  const mirror = attackingDirection === 'rtl';
  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {events.map((e, idx) => {
          const a = pctToSvg(e.pos.x, e.pos.y, mirror);
          const fill = e.kind === 'tackle' ? '#ef4444' : '#3b82f6';
          return (
            <g key={idx}>
              <circle cx={a.sx} cy={a.sy} r={6} fill={fill} fillOpacity={0.85} stroke="#0f172a" strokeWidth={1.5} />
              {e.kind === 'tackle' && (
                <path d={`M${a.sx-3},${a.sy} L${a.sx+3},${a.sy} M${a.sx},${a.sy-3} L${a.sx},${a.sy+3}`}
                  stroke="white" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
      </svg>
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">{t('stats.empty.no_defensive')}</span>
        </div>
      )}
    </div>
  );
}

export function DefensiveMapLegend() {
  const { t } = useTranslation('public_player');
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />{t('stats.defensive_legend.tackle')}</div>
      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />{t('stats.defensive_legend.interception')}</div>
    </div>
  );
}

// Legend component for shot outcomes — small inline chips.
export function ShotMapLegend() {
  const { t } = useTranslation('public_player');
  const items = [
    { color: '#22c55e', label: t('stats.shot_legend.goal') },
    { color: '#f59e0b', label: t('stats.shot_legend.post') },
    { color: '#3b82f6', label: t('stats.shot_legend.saved') },
    { color: '#94a3b8', label: t('stats.shot_legend.wide') },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ── Dribble map ──────────────────────────────────────────────────────────
export interface DribbleDatum {
  pos: { x: number; y: number };
}

interface DribbleMapProps {
  dribbles: DribbleDatum[];
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

export function PlayerDribbleMap({ dribbles, attackingDirection = 'ltr', className }: DribbleMapProps) {
  const { t } = useTranslation('public_player');
  const mirror = attackingDirection === 'rtl';
  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {dribbles.map((d, idx) => {
          const a = pctToSvg(d.pos.x, d.pos.y, mirror);
          return (
            <g key={idx}>
              <circle cx={a.sx} cy={a.sy} r={5} fill="#22c55e" fillOpacity={0.75} stroke="#0f172a" strokeWidth={1.2} />
            </g>
          );
        })}
      </svg>
      {dribbles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">{t('stats.empty.no_dribbles')}</span>
        </div>
      )}
    </div>
  );
}

// ── Run map ──────────────────────────────────────────────────────────────
// Renders the position-sample trail as a single low-opacity line connecting
// every turn-end position in chronological order.
interface RunMapProps {
  samples: Array<{ x: number; y: number }>;
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

export function PlayerRunMap({ samples, attackingDirection = 'ltr', className }: RunMapProps) {
  const { t } = useTranslation('public_player');
  const mirror = attackingDirection === 'rtl';

  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {/* Trail of all moves */}
        <g stroke="rgba(251,191,36,0.45)" strokeWidth={1.5} fill="none">
          {samples.length > 1 && (() => {
            const points = samples.map(s => pctToSvg(s.x, s.y, mirror));
            const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.sx} ${p.sy}`).join(' ');
            return <path d={path} />;
          })()}
        </g>
      </svg>
      {samples.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">{t('stats.empty.no_running')}</span>
        </div>
      )}
    </div>
  );
}
