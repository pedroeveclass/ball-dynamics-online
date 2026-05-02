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

export function PlayerPassMap({ passes, attackingDirection = 'ltr', filter = 'all', className }: PassMapProps) {
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
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">Sem passes</span>
        </div>
      )}
    </div>
  );
}

export function PlayerShotMap({ shots, attackingDirection = 'ltr', className }: ShotMapProps) {
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
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">Sem finalizações</span>
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
          <span className="text-xs text-white/70 bg-black/60 px-2 py-1 rounded">Sem desarmes/interceptações</span>
        </div>
      )}
    </div>
  );
}

export function DefensiveMapLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Desarme</div>
      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Interceptação</div>
    </div>
  );
}

// Legend component for shot outcomes — small inline chips.
export function ShotMapLegend() {
  const items = [
    { color: '#22c55e', label: 'Gol' },
    { color: '#f59e0b', label: 'Trave' },
    { color: '#3b82f6', label: 'Defendido' },
    { color: '#94a3b8', label: 'Fora' },
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
