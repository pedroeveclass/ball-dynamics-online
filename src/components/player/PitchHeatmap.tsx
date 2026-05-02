import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PitchSVG } from '@/components/PitchSVG';

interface Sample {
  x: number; // 0-100 (engine coords, percent of pitch)
  y: number;
}

interface PitchHeatmapProps {
  samples: Sample[];
  // Direction the player attacked. Engine writes canonical LTR coords now,
  // so 'ltr' is the default and 'rtl' only exists for legacy callers.
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

const CANVAS_W = 900;
const CANVAS_H = 580;
const PAD = 20;
const INNER_W = CANVAS_W - PAD * 2;
const INNER_H = CANVAS_H - PAD * 2;

// Continuous green → yellow → orange → red gradient driven by `t` ∈ [0,1].
// Hue 130 (green) → 0 (red), saturation rises with intensity, light dips a
// little at the top end so red doesn't look pink.
function colorForIntensity(t: number): string {
  const tt = Math.max(0, Math.min(1, t));
  const hue = 130 - tt * 130;
  const sat = 70 + tt * 25;
  const light = 50 - tt * 6;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export function PitchHeatmap({ samples, attackingDirection = 'ltr', className }: PitchHeatmapProps) {
  const { t } = useTranslation('public_player');

  const { dots, cellRadius } = useMemo(() => {
    if (samples.length === 0) return { dots: [], cellRadius: 20 };
    // Coarser grid → fewer, more meaningful zones. Each cell ≈ 31×27 px.
    const gridW = 28;
    const gridH = 18;
    const counts = new Map<string, number>();
    for (const s of samples) {
      const ex = attackingDirection === 'rtl' ? 100 - s.x : s.x;
      const gx = Math.max(0, Math.min(gridW - 1, Math.floor((ex / 100) * gridW)));
      const gy = Math.max(0, Math.min(gridH - 1, Math.floor((s.y / 100) * gridH)));
      const key = `${gx},${gy}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = samples.length;
    const cellW = INNER_W / gridW;
    const cellH = INNER_H / gridH;
    // Radius about ⅔ of a cell so dots barely overlap with neighbours —
    // the Gaussian blur further down does the smooth blending.
    const cellRadius = Math.max(cellW, cellH) * 0.62;
    // Map "fraction of game time spent in this cell" to a 0..1 intensity.
    // 15 % of total turns in one cell = full red. Below 1 % = invisible.
    const SCALE = 0.15;
    const MIN_PCT = 0.01;
    const dots: Array<{ cx: number; cy: number; intensity: number; pct: number }> = [];
    for (const [key, count] of counts) {
      const pct = count / total;
      if (pct < MIN_PCT) continue;
      const intensity = Math.min(1, pct / SCALE);
      const [gx, gy] = key.split(',').map(Number);
      const cx = PAD + (gx + 0.5) * cellW;
      const cy = PAD + (gy + 0.5) * cellH;
      dots.push({ cx, cy, intensity, pct });
    }
    return { dots, cellRadius };
  }, [samples, attackingDirection]);

  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <filter id="heatmapBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g filter="url(#heatmapBlur)">
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.cx}
              cy={d.cy}
              r={cellRadius}
              fill={colorForIntensity(d.intensity)}
              fillOpacity={0.4 + d.intensity * 0.4}
            />
          ))}
        </g>
      </svg>
      {samples.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/60 bg-black/60 px-2 py-1 rounded">
            {t('stats.empty.no_position_data', { defaultValue: 'Sem dados de posição' })}
          </span>
        </div>
      )}
    </div>
  );
}
