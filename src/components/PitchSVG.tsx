import React from 'react';

// ─── Field constants (shared with MatchRoomPage) ─────────────────────
export const FIELD_W = 900;
export const FIELD_H = 580;
export const PAD = 20;
export const INNER_W = FIELD_W - PAD * 2;
export const INNER_H = FIELD_H - PAD * 2;

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
  const totalW = FIELD_W + PAD * 2;
  const totalH = FIELD_H + PAD * 2;

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

// ─── Goal nets rendering ─────────────────────────────────────────────
function renderGoals(netStyle: string): React.ReactNode {
  const goalTop = PAD + INNER_H * 0.38;
  const goalH = INNER_H * 0.24;
  const goalW = 10;
  const leftX = PAD - 8;
  const rightX = PAD + INNER_W - 2;

  if (netStyle === 'veil') {
    // Veil / droopy net: curved bottom (net hangs down)
    const sag = 6;
    const leftPath = `M ${leftX} ${goalTop} L ${leftX + goalW} ${goalTop} L ${leftX + goalW} ${goalTop + goalH} Q ${leftX + goalW / 2} ${goalTop + goalH + sag} ${leftX} ${goalTop + goalH} Z`;
    const rightPath = `M ${rightX} ${goalTop} L ${rightX + goalW} ${goalTop} L ${rightX + goalW} ${goalTop + goalH} Q ${rightX + goalW / 2} ${goalTop + goalH + sag} ${rightX} ${goalTop + goalH} Z`;

    return (
      <g>
        <path d={leftPath} fill="url(#net-fill)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
        <path d={rightPath} fill="url(#net-fill)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      </g>
    );
  }

  // 'classic' (default): flat rectangular net
  return (
    <g>
      <rect x={leftX} y={goalTop} width={goalW} height={goalH} rx="1"
        fill="url(#net-fill)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <rect x={rightX} y={goalTop} width={goalW} height={goalH} rx="1"
        fill="url(#net-fill)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
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
  const totalW = FIELD_W + PAD * 2;
  const totalH = FIELD_H + PAD * 2;

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

      {/* Ad boards - top */}
      <rect x={PAD} y={PAD - 4} width={INNER_W} height={4} fill={s.ad_board_color} />
      {/* Ad boards - bottom */}
      <rect x={PAD} y={PAD + INNER_H} width={INNER_W} height={4} fill={s.ad_board_color} />

      {/* Bench areas - centered in border zone, bottom side */}
      <rect
        x={totalW / 2 - 60}
        y={PAD + INNER_H + 8}
        width={120}
        height={6}
        rx={2}
        fill={s.bench_color}
      />

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

      {/* Goals with net pattern */}
      {renderGoals(s.net_style)}

      {/* Lighting overlay */}
      {renderLightingOverlay(s.lighting)}

      {/* Children (player circles, arrows, etc.) */}
      {children}
    </svg>
  );
}
