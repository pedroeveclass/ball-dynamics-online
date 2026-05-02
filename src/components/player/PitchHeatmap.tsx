import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PitchSVG } from '@/components/PitchSVG';

interface Sample {
  x: number; // 0-100 (engine coords, percent of pitch)
  y: number;
}

interface PitchHeatmapProps {
  samples: Sample[];
  // Direction the player attacked (LTR or RTL). When 'rtl' we mirror x so the
  // heatmap is read left-to-right consistently across home/away matches.
  attackingDirection?: 'ltr' | 'rtl';
  className?: string;
}

const CANVAS_W = 900;
const CANVAS_H = 580;
const PAD = 20;
const INNER_W = CANVAS_W - PAD * 2;
const INNER_H = CANVAS_H - PAD * 2;

// Density-based heatmap:
//   1. Bin samples into a coarse grid so a single random sample doesn't paint
//      a giant blob.
//   2. Draw a soft radial gradient for each non-empty cell whose alpha is
//      proportional to the cell's density (relative to the busiest cell).
//   3. Color-remap the additive alpha buffer:
//      transparent < 25 → green → yellow → red.
//      Below the threshold, areas where the player barely went stay clear.
function paintHeatmap(ctx: CanvasRenderingContext2D, samples: Sample[], attackingDirection: 'ltr' | 'rtl') {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (samples.length === 0) return;

  const gridW = 36;
  const gridH = 22;
  const counts = new Float32Array(gridW * gridH);
  let maxCount = 0;
  for (const s of samples) {
    const ex = attackingDirection === 'rtl' ? 100 - s.x : s.x;
    const gx = Math.max(0, Math.min(gridW - 1, Math.floor((ex / 100) * gridW)));
    const gy = Math.max(0, Math.min(gridH - 1, Math.floor((s.y / 100) * gridH)));
    const idx = gy * gridW + gx;
    counts[idx] += 1;
    if (counts[idx] > maxCount) maxCount = counts[idx];
  }
  if (maxCount === 0) return;

  // Off-screen additive buffer.
  const buffer = document.createElement('canvas');
  buffer.width = CANVAS_W;
  buffer.height = CANVAS_H;
  const bctx = buffer.getContext('2d')!;
  bctx.globalCompositeOperation = 'lighter';

  const cellW = INNER_W / gridW;
  const cellH = INNER_H / gridH;
  // Radius slightly bigger than the cell so neighbouring busy cells blend.
  const radius = Math.max(cellW, cellH) * 1.6;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const c = counts[gy * gridW + gx];
      if (c === 0) continue;
      // sqrt for gentler falloff so a few extra ticks don't look identical to
      // many ticks; we still want red for the truly busy spots.
      const intensity = Math.sqrt(c / maxCount);
      const px = PAD + (gx + 0.5) * cellW;
      const py = PAD + (gy + 0.5) * cellH;
      const grad = bctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(255,255,255,${intensity * 0.55})`);
      grad.addColorStop(0.55, `rgba(255,255,255,${intensity * 0.18})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      bctx.fillStyle = grad;
      bctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
  }

  // Color remap.
  const img = bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i]; // proxy for cumulative density
    if (a < 22) { data[i + 3] = 0; continue; }
    const t = Math.min(1, a / 190);
    let r: number, g: number, b: number;
    if (t < 0.30) {
      // Green band — areas with light presence
      const k = t / 0.30;
      r = 60 + k * 90;
      g = 200 - k * 10;
      b = 60;
    } else if (t < 0.65) {
      // Yellow / orange band
      const k = (t - 0.30) / 0.35;
      r = 240;
      g = 200 - k * 130;
      b = 50 - k * 30;
    } else {
      // Red band — busiest spots
      const k = Math.min(1, (t - 0.65) / 0.35);
      r = 235 - k * 10;
      g = 60 - k * 20;
      b = 30;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.min(220, 80 + t * 160);
  }
  ctx.putImageData(img, 0, 0);
}

export function PitchHeatmap({ samples, attackingDirection = 'ltr', className }: PitchHeatmapProps) {
  const { t } = useTranslation('public_player');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintHeatmap(ctx, samples, attackingDirection);
  }, [samples, attackingDirection]);

  return (
    <div className={`relative ${className ?? ''}`} style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
      <PitchSVG className="absolute inset-0 w-full h-full" />
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
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
