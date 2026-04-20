import React from 'react';

// ─── Field constants (shared with MatchRoomPage) ─────────────────────
export const FIELD_W = 900;
export const FIELD_H = 580;
export const PAD = 20;
export const INNER_W = FIELD_W - PAD * 2;
export const INNER_H = FIELD_H - PAD * 2;

// ─── Goal mouth (fraction of INNER_H) ────────────────────────────────
// Goal was 0.38..0.62 (height 0.24); shrunk 25% → 0.41..0.59 (height 0.18).
// MUST match GOAL_Y_MIN/GOAL_Y_MAX in src/pages/match/constants.ts and the engine.
export const GOAL_MOUTH_FRACTION_TOP = 0.41;
export const GOAL_MOUTH_FRACTION_HEIGHT = 0.18;

// ─── Penalty spot distance (fraction of INNER_W from each goal line) ─
// Standard 11m on a 100-unit-long field ≈ 13%.
export const PENALTY_SPOT_FRACTION = 0.13;

// ─── Types ───────────────────────────────────────────────────────────
export interface StadiumStyle {
  pitch_pattern: string;
  border_color: string;
  lighting: string;
  net_pattern: string;
  net_style: string;
  ad_board_color: string;
  bench_color: string;
}

export const DEFAULT_STADIUM_STYLE: StadiumStyle = {
  pitch_pattern: 'stripes_vertical_thick',
  border_color: 'hsl(140,10%,15%)',
  lighting: 'neutral',
  net_pattern: 'checkered',
  net_style: 'classic',
  ad_board_color: 'hsl(220,15%,25%)',
  bench_color: 'hsl(30,10%,30%)',
};

export interface PitchSVGProps {
  width?: number;
  height?: number;
  style?: StadiumStyle;
  children?: React.ReactNode;
  svgRef?: React.RefObject<SVGSVGElement>;
  onMouseMove?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  cursor?: string;
  className?: string;
}

// ─── Grass colors ────────────────────────────────────────────────────
const GRASS_LIGHT = 'hsl(100,45%,28%)';
const GRASS_DARK = 'hsl(100,42%,25%)';

// ─── Pattern builder ─────────────────────────────────────────────────
function renderGrassPattern(patternType: string): React.ReactNode {
  const pid = 'grass';

  switch (patternType) {
    case 'stripes_vertical_thin':
      return (
        <pattern id={pid} x="0" y="0" width="40" height={INNER_H} patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="20" height={INNER_H} fill={GRASS_LIGHT} />
          <rect x="20" y="0" width="20" height={INNER_H} fill={GRASS_DARK} />
        </pattern>
      );

    case 'stripes_vertical_thick':
      return (
        <pattern id={pid} x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="40" height={INNER_H} fill={GRASS_LIGHT} />
          <rect x="40" y="0" width="40" height={INNER_H} fill={GRASS_DARK} />
        </pattern>
      );

    case 'stripes_horizontal_thin':
      return (
        <pattern id={pid} x="0" y="0" width={INNER_W} height="40" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width={INNER_W} height="20" fill={GRASS_LIGHT} />
          <rect x="0" y="20" width={INNER_W} height="20" fill={GRASS_DARK} />
        </pattern>
      );

    case 'stripes_horizontal_thick':
      return (
        <pattern id={pid} x="0" y="0" width={INNER_W} height="80" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width={INNER_W} height="40" fill={GRASS_LIGHT} />
          <rect x="0" y="40" width={INNER_W} height="40" fill={GRASS_DARK} />
        </pattern>
      );

    case 'checkered_small':
      return (
        <pattern id={pid} x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="80" height="80" fill={GRASS_LIGHT} />
          <rect x="0" y="0" width="40" height="40" fill={GRASS_DARK} />
          <rect x="40" y="40" width="40" height="40" fill={GRASS_DARK} />
        </pattern>
      );

    case 'checkered_large':
      return (
        <pattern id={pid} x="0" y="0" width="160" height="160" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="160" height="160" fill={GRASS_LIGHT} />
          <rect x="0" y="0" width="80" height="80" fill={GRASS_DARK} />
          <rect x="80" y="80" width="80" height="80" fill={GRASS_DARK} />
        </pattern>
      );

    case 'concentric_circles':
      return (
        <radialGradient id={pid} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          {Array.from({ length: 12 }, (_, i) => {
            const pct = (i / 12) * 100;
            const nextPct = ((i + 1) / 12) * 100;
            const color = i % 2 === 0 ? GRASS_LIGHT : GRASS_DARK;
            return (
              <React.Fragment key={i}>
                <stop offset={`${pct}%`} stopColor={color} />
                <stop offset={`${nextPct}%`} stopColor={color} />
              </React.Fragment>
            );
          })}
        </radialGradient>
      );

    case 'diagonal':
      return (
        <pattern id={pid} x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect x="0" y="0" width="56" height="56" fill={GRASS_LIGHT} />
          <rect x="0" y="0" width="28" height="56" fill={GRASS_DARK} />
        </pattern>
      );

    case 'uniform':
      // No pattern needed; we return null and use a solid rect fill instead
      return null;

    default:
      // Fallback: thick vertical stripes (the original)
      return (
        <pattern id={pid} x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="40" height={INNER_H} fill={GRASS_LIGHT} />
          <rect x="40" y="0" width="40" height={INNER_H} fill={GRASS_DARK} />
        </pattern>
      );
  }
}

// ─── Lighting overlay ────────────────────────────────────────────────
function renderLightingOverlay(lighting: string): React.ReactNode {
  const totalW = FIELD_W;
  const totalH = FIELD_H;

  switch (lighting) {
    case 'warm':
      return (
        <rect x="0" y="0" width={totalW} height={totalH} fill="rgba(255,200,50,0.07)" rx="8" pointerEvents="none" />
      );
    case 'cold':
      return (
        <rect x="0" y="0" width={totalW} height={totalH} fill="rgba(100,150,255,0.07)" rx="8" pointerEvents="none" />
      );
    case 'night':
      return (
        <>
          <rect x="0" y="0" width={totalW} height={totalH} fill="rgba(0,0,0,0.25)" rx="8" pointerEvents="none" />
          {/* Spotlight ellipse in center */}
          <ellipse
            cx={totalW / 2} cy={totalH / 2}
            rx={totalW * 0.4} ry={totalH * 0.4}
            fill="rgba(255,255,200,0.06)"
            pointerEvents="none"
          />
        </>
      );
    default: // 'neutral'
      return null;
  }
}

// ─── Net patterns ────────────────────────────────────────────────────
function renderNetPattern(netPattern: string): React.ReactNode {
  if (netPattern === 'diamond') {
    return (
      <pattern id="net-fill" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="rgba(255,255,255,0.05)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <line x1="0" y1="0" x2="6" y2="0" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      </pattern>
    );
  }
  // 'checkered' (default)
  return (
    <pattern id="net-fill" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="rgba(255,255,255,0.05)" />
      <rect width="3" height="3" fill="rgba(255,255,255,0.12)" />
      <rect x="3" y="3" width="3" height="3" fill="rgba(255,255,255,0.12)" />
    </pattern>
  );
}

// ─── Penalty spots ───────────────────────────────────────────────────
// Mirrors the center-spot treatment on the field lines group (filled white circle,
// same radius). Drawn as a small solid circle at 11m from each goal line.
function renderPenaltySpots(): React.ReactNode {
  const leftX = PAD + INNER_W * PENALTY_SPOT_FRACTION;
  const rightX = PAD + INNER_W - INNER_W * PENALTY_SPOT_FRACTION;
  const y = PAD + INNER_H / 2;
  return (
    <g>
      <circle cx={leftX} cy={y} r={3} fill="rgba(255,255,255,0.6)" />
      <circle cx={rightX} cy={y} r={3} fill="rgba(255,255,255,0.6)" />
    </g>
  );
}

// ─── Corner flags ────────────────────────────────────────────────────
function renderCornerFlags(): React.ReactNode {
  const corners = [
    { x: PAD + 2, y: PAD + 2, dx: 1, dy: 1 },       // top-left
    { x: PAD + INNER_W - 2, y: PAD + 2, dx: -1, dy: 1 },   // top-right
    { x: PAD + 2, y: PAD + INNER_H - 2, dx: 1, dy: -1 },   // bottom-left
    { x: PAD + INNER_W - 2, y: PAD + INNER_H - 2, dx: -1, dy: -1 }, // bottom-right
  ];
  return (
    <g>
      {corners.map((c, i) => (
        <g key={i}>
          {/* Pole */}
          <line x1={c.x} y1={c.y} x2={c.x} y2={c.y - 8 * c.dy} stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          {/* Flag triangle */}
          <polygon
            points={`${c.x},${c.y - 8 * c.dy} ${c.x + 5 * c.dx},${c.y - 5 * c.dy} ${c.x},${c.y - 3 * c.dy}`}
            fill="rgba(255,60,60,0.75)"
            stroke="rgba(255,60,60,0.9)"
            strokeWidth="0.5"
          />
          {/* Quarter circle arc */}
          <path
            d={`M ${c.x} ${c.y + 6 * c.dy * -1} A 6 6 0 0 ${c.dx === c.dy ? 1 : 0} ${c.x + 6 * c.dx} ${c.y}`}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
            fill="none"
          />
        </g>
      ))}
    </g>
  );
}

// ─── Goal nets rendering (top-down 3D perspective) ───────────────────
function renderGoals(netStyle: string): React.ReactNode {
  // Goal mouth position on the field line (25% smaller than original)
  const goalMouthTop = PAD + INNER_H * GOAL_MOUTH_FRACTION_TOP;
  const goalMouthH = INNER_H * GOAL_MOUTH_FRACTION_HEIGHT;
  const netDepth = 22; // how far the net extends behind the goal line
  const postWidth = 2.5;

  // Left goal (extends to the left of the field)
  const lLineX = PAD + 2;  // goal line x
  const lNetX = lLineX - netDepth; // back of net

  // Right goal (extends to the right of the field)
  const rLineX = PAD + INNER_W - 2;
  const rNetX = rLineX + netDepth;

  if (netStyle === 'veil') {
    // Véu de noiva: net drapes backward with a curved/wider shape
    const spread = 8; // net widens at the back
    const curveSag = 10; // sag of the curve
    return (
      <g>
        {/* ── Left goal ── */}
        {/* Net area (véu de noiva shape: wider at back, curved) */}
        <path
          d={`M ${lLineX} ${goalMouthTop}
              C ${lLineX - netDepth * 0.3} ${goalMouthTop - spread * 0.5},
                ${lNetX + curveSag} ${goalMouthTop - spread},
                ${lNetX} ${goalMouthTop - spread}
              L ${lNetX} ${goalMouthTop + goalMouthH + spread}
              C ${lNetX + curveSag} ${goalMouthTop + goalMouthH + spread},
                ${lLineX - netDepth * 0.3} ${goalMouthTop + goalMouthH + spread * 0.5},
                ${lLineX} ${goalMouthTop + goalMouthH}`}
          fill="url(#net-fill)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5"
        />
        {/* Side net lines (strings from posts to back) */}
        <line x1={lLineX} y1={goalMouthTop} x2={lNetX} y2={goalMouthTop - spread} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1={lLineX} y1={goalMouthTop + goalMouthH} x2={lNetX} y2={goalMouthTop + goalMouthH + spread} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        {/* Back net line (curved) */}
        <path
          d={`M ${lNetX} ${goalMouthTop - spread}
              Q ${lNetX - 3} ${goalMouthTop + goalMouthH / 2}, ${lNetX} ${goalMouthTop + goalMouthH + spread}`}
          stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" fill="none"
        />
        {/* Posts (white circles for top-down view) */}
        <circle cx={lLineX} cy={goalMouthTop} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
        <circle cx={lLineX} cy={goalMouthTop + goalMouthH} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
        {/* Crossbar (on the goal line) */}
        <line x1={lLineX} y1={goalMouthTop} x2={lLineX} y2={goalMouthTop + goalMouthH} stroke="white" strokeWidth="2.5" />

        {/* ── Right goal ── */}
        <path
          d={`M ${rLineX} ${goalMouthTop}
              C ${rLineX + netDepth * 0.3} ${goalMouthTop - spread * 0.5},
                ${rNetX - curveSag} ${goalMouthTop - spread},
                ${rNetX} ${goalMouthTop - spread}
              L ${rNetX} ${goalMouthTop + goalMouthH + spread}
              C ${rNetX - curveSag} ${goalMouthTop + goalMouthH + spread},
                ${rLineX + netDepth * 0.3} ${goalMouthTop + goalMouthH + spread * 0.5},
                ${rLineX} ${goalMouthTop + goalMouthH}`}
          fill="url(#net-fill)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5"
        />
        <line x1={rLineX} y1={goalMouthTop} x2={rNetX} y2={goalMouthTop - spread} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1={rLineX} y1={goalMouthTop + goalMouthH} x2={rNetX} y2={goalMouthTop + goalMouthH + spread} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <path
          d={`M ${rNetX} ${goalMouthTop - spread}
              Q ${rNetX + 3} ${goalMouthTop + goalMouthH / 2}, ${rNetX} ${goalMouthTop + goalMouthH + spread}`}
          stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" fill="none"
        />
        <circle cx={rLineX} cy={goalMouthTop} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
        <circle cx={rLineX} cy={goalMouthTop + goalMouthH} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
        <line x1={rLineX} y1={goalMouthTop} x2={rLineX} y2={goalMouthTop + goalMouthH} stroke="white" strokeWidth="2.5" />
      </g>
    );
  }

  // 'classic' (default): Rede quadrada — straight rectangular box net
  return (
    <g>
      {/* ── Left goal ── */}
      {/* Net area (rectangle extending behind goal line) */}
      <rect x={lNetX} y={goalMouthTop} width={netDepth} height={goalMouthH}
        fill="url(#net-fill)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      {/* Side net lines */}
      <line x1={lLineX} y1={goalMouthTop} x2={lNetX} y2={goalMouthTop} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      <line x1={lLineX} y1={goalMouthTop + goalMouthH} x2={lNetX} y2={goalMouthTop + goalMouthH} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      {/* Back net line */}
      <line x1={lNetX} y1={goalMouthTop} x2={lNetX} y2={goalMouthTop + goalMouthH} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      {/* Posts */}
      <circle cx={lLineX} cy={goalMouthTop} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
      <circle cx={lLineX} cy={goalMouthTop + goalMouthH} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
      {/* Crossbar */}
      <line x1={lLineX} y1={goalMouthTop} x2={lLineX} y2={goalMouthTop + goalMouthH} stroke="white" strokeWidth="2.5" />

      {/* ── Right goal ── */}
      <rect x={rLineX} y={goalMouthTop} width={netDepth} height={goalMouthH}
        fill="url(#net-fill)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <line x1={rLineX} y1={goalMouthTop} x2={rNetX} y2={goalMouthTop} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      <line x1={rLineX} y1={goalMouthTop + goalMouthH} x2={rNetX} y2={goalMouthTop + goalMouthH} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
      <line x1={rNetX} y1={goalMouthTop} x2={rNetX} y2={goalMouthTop + goalMouthH} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <circle cx={rLineX} cy={goalMouthTop} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
      <circle cx={rLineX} cy={goalMouthTop + goalMouthH} r={postWidth} fill="white" stroke="rgba(200,200,200,0.8)" strokeWidth="0.5" />
      <line x1={rLineX} y1={goalMouthTop} x2={rLineX} y2={goalMouthTop + goalMouthH} stroke="white" strokeWidth="2.5" />
    </g>
  );
}

// ─── Component ───────────────────────────────────────────────────────
export function PitchSVG({
  style: stadiumStyle,
  children,
  svgRef,
  onMouseMove,
  onClick,
  cursor,
  className,
}: PitchSVGProps) {
  const s = stadiumStyle ?? DEFAULT_STADIUM_STYLE;
  const totalW = FIELD_W;
  const totalH = FIELD_H;

  const grassPatternEl = renderGrassPattern(s.pitch_pattern);
  const isGradient = s.pitch_pattern === 'concentric_circles';
  const grassFill = s.pitch_pattern === 'uniform'
    ? GRASS_LIGHT
    : 'url(#grass)';

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${totalW} ${totalH}`}
      className={className ?? 'w-full rounded-lg'}
      style={{ cursor: cursor ?? 'default' }}
      onMouseMove={onMouseMove}
      onClick={onClick}
    >
      {/* Defs */}
      <defs>
        {grassPatternEl && (isGradient ? grassPatternEl : grassPatternEl)}
        {renderNetPattern(s.net_pattern)}
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Border frame */}
      <rect x="0" y="0" width={totalW} height={totalH} fill={s.border_color} rx="8" />

      {/* Ad boards - top (taller with stripe detail) */}
      <rect x={PAD - 1} y={PAD - 10} width={INNER_W + 2} height={10} rx="1" fill={s.ad_board_color} />
      <rect x={PAD - 1} y={PAD - 10} width={INNER_W + 2} height={2.5} rx="1" fill="rgba(255,255,255,0.08)" />
      {/* Ad board segments (simulated ads) */}
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={`ad-t-${i}`} x={PAD + i * (INNER_W / 12) + 1} y={PAD - 8.5} width={INNER_W / 12 - 2} height={6} rx="0.5"
          fill={i % 3 === 0 ? 'rgba(200,50,50,0.25)' : i % 3 === 1 ? 'rgba(50,100,200,0.2)' : 'rgba(50,180,80,0.2)'}
        />
      ))}

      {/* Ad boards - bottom */}
      <rect x={PAD - 1} y={PAD + INNER_H} width={INNER_W + 2} height={10} rx="1" fill={s.ad_board_color} />
      <rect x={PAD - 1} y={PAD + INNER_H + 7.5} width={INNER_W + 2} height={2.5} rx="1" fill="rgba(255,255,255,0.08)" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={`ad-b-${i}`} x={PAD + i * (INNER_W / 12) + 1} y={PAD + INNER_H + 1.5} width={INNER_W / 12 - 2} height={6} rx="0.5"
          fill={i % 3 === 0 ? 'rgba(200,180,30,0.25)' : i % 3 === 1 ? 'rgba(200,50,50,0.2)' : 'rgba(50,100,200,0.2)'}
        />
      ))}

      {/* Bench areas - two benches on bottom side */}
      <g>
        <rect x={totalW / 2 - 100} y={PAD + INNER_H + 13} width={80} height={5} rx={1.5} fill={s.bench_color} />
        <rect x={totalW / 2 + 20} y={PAD + INNER_H + 13} width={80} height={5} rx={1.5} fill={s.bench_color} />
        {/* Bench seat marks */}
        {Array.from({ length: 6 }, (_, i) => (
          <React.Fragment key={`bench-${i}`}>
            <rect x={totalW / 2 - 98 + i * 13} y={PAD + INNER_H + 13.5} width={10} height={3.5} rx={0.5} fill="rgba(255,255,255,0.06)" />
            <rect x={totalW / 2 + 22 + i * 13} y={PAD + INNER_H + 13.5} width={10} height={3.5} rx={0.5} fill="rgba(255,255,255,0.06)" />
          </React.Fragment>
        ))}
      </g>

      {/* Grass surface */}
      <rect x={PAD} y={PAD} width={INNER_W} height={INNER_H} fill={grassFill} />

      {/* Field lines (exact copy from MatchRoomPage) */}
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

      {/* Penalty spots (11m from each goal line) */}
      {renderPenaltySpots()}

      {/* Goals with net pattern */}
      {renderGoals(s.net_style)}

      {/* Corner flags */}
      {renderCornerFlags()}

      {/* Lighting overlay */}
      {renderLightingOverlay(s.lighting)}

      {/* Children (player circles, arrows, etc.) */}
      {children}
    </svg>
  );
}
