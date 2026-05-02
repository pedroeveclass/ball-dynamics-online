import { useEffect, useRef } from 'react';
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

// Sofascore-like palette: cool yellow at low density → red at high density.
function paintHeatmap(ctx: CanvasRenderingContext2D, samples: Sample[], attackingDirection: 'ltr' | 'rtl') {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (samples.length === 0) return;

  // Step 1: draw radial gradients additively into an off-screen alpha buffer.
  const buffer = document.createElement('canvas');
  buffer.width = CANVAS_W;
  buffer.height = CANVAS_H;
  const bctx = buffer.getContext('2d')!;
  bctx.globalCompositeOperation = 'lighter';

  const radius = 55;
  for (const s of samples) {
    const ex = attackingDirection === 'rtl' ? 100 - s.x : s.x;
    const px = PAD + (ex / 100) * INNER_W;
    const py = PAD + (s.y / 100) * INNER_H;
    const grad = bctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    bctx.fillStyle = grad;
    bctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }

  // Step 2: read alpha and remap to colored pixels.
  const img = bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i]; // r-channel == alpha proxy after additive white draws
    if (a === 0) continue;
    // Density 0..1
    const t = Math.min(1, a / 255);
    let r: number, g: number, b: number;
    if (t < 0.4) {
      // yellow
      const k = t / 0.4;
      r = 255; g = 230 - k * 50; b = 80 - k * 80;
    } else if (t < 0.75) {
      // orange
      const k = (t - 0.4) / 0.35;
      r = 255; g = 180 - k * 100; b = 0;
    } else {
      // red
      const k = (t - 0.75) / 0.25;
      r = 255 - k * 30; g = 80 - k * 60; b = 0;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.min(255, a * 1.6); // boost visibility
  }
  ctx.putImageData(img, 0, 0);
}

export function PitchHeatmap({ samples, attackingDirection = 'ltr', className }: PitchHeatmapProps) {
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
        style={{ mixBlendMode: 'screen' }}
      />
      {samples.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/60 bg-black/60 px-2 py-1 rounded">Sem dados de posição</span>
        </div>
      )}
    </div>
  );
}
