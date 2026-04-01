// ─── Match Constants ──────────────────────────────────────────

export const PHASE_LABELS: Record<string, string> = {
  ball_holder: 'Portador', attacking_support: 'Ataque',
  defending_response: 'Defesa', resolution: 'Motion', pre_match: 'Pré-jogo',
  processing: 'Pausa',
  positioning_attack: 'Posicionar ⚽', positioning_defense: 'Posicionar 🛡️',
};

export const ACTION_LABELS: Record<string, string> = {
  move: 'MOVER', pass_low: 'PASSE RASTEIRO', pass_high: 'PASSE ALTO',
  pass_launch: 'LANÇAMENTO', shoot: 'CHUTAR',
  shoot_controlled: 'CHUTE CONTROLADO', shoot_power: 'CHUTE FORTE',
  header_low: 'CABECEIO BAIXO', header_high: 'CABECEIO ALTO',
  header_controlled: 'CABECEIO CONTROLADO', header_power: 'CABECEIO FORTE',
  press: 'PRESSIONAR', intercept: 'INTERCEPTAR',
  block_lane: 'BLOQUEAR ROTA', block: 'BLOQUEAR', no_action: 'SEM AÇÃO', receive: 'DOMINAR BOLA',
};

export const PHASE_DURATION = 10;
export const POSITIONING_PHASE_DURATION = 10;
export const RESOLUTION_PHASE_DURATION = 4; // must match engine RESOLUTION_PHASE_DURATION_MS / 1000
export const PRE_MATCH_COUNTDOWN_SECONDS = 10;
export const PRE_MATCH_COUNTDOWN_MS = PRE_MATCH_COUNTDOWN_SECONDS * 1000;
export const LIVE_EVENT_LIMIT = 60;
export const TURN_ACTION_RECONCILE_DELAY_MS = 300;
export const CLIENT_MATCH_PROCESSOR_RETRY_MS = 500;
export const ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK =
  import.meta.env.VITE_ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK !== 'false';
export const INTERCEPT_RADIUS = 0.6; // very small domination window, close to the ball path
export const GOAL_LINE_OVERFLOW_PCT = 0.12; // makes the shot arrow/ball slightly cross the goal line

export const ACTION_PHASE_ORDER: Record<string, number> = {
  positioning_attack: -2,
  positioning_defense: -1,
  ball_holder: 0,
  attacking_support: 1,
  defending_response: 2,
  resolution: 3,
};

// ─── Field constants (module-level for use in hooks and render) ──
export const FIELD_W = 900;
export const FIELD_H = 580;
export const PAD = 20;
export const INNER_W = FIELD_W - PAD * 2;
export const INNER_H = FIELD_H - PAD * 2;

export const HALF_DURATION_MS_CLIENT = 25 * 60 * 1000; // 25 real minutes per half

// ─── Utility functions (small, pure) ─────────────────────────
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const normalizeAttr = (val: number) => Math.max(0, Math.min(1, (val - 10) / 89));

export const pointToSegmentDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp((((px - ax) * dx) + ((py - ay) * dy)) / ((dx * dx) + (dy * dy)), 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
};

export const isShootAction = (t: string) => t === 'shoot' || t === 'shoot_controlled' || t === 'shoot_power';
export const isPassAction = (t: string) => t === 'pass_low' || t === 'pass_high' || t === 'pass_launch';
export const isHeaderAction = (t: string) => t === 'header_low' || t === 'header_high' || t === 'header_controlled' || t === 'header_power';
export const isAnyShootAction = (t: string) => isShootAction(t) || t === 'header_controlled' || t === 'header_power';
export const isAnyPassAction = (t: string) => isPassAction(t) || t === 'header_low' || t === 'header_high';

// Safe date formatter
export function formatScheduledDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Data inválida';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return 'Data inválida';
  }
}

export function computeMatchMinute(match: { half_started_at?: string | null; current_half?: number } | null): number {
  if (!match?.half_started_at) return 0;
  const elapsed = Date.now() - new Date(match.half_started_at).getTime();
  // During halftime, elapsed may be negative (half_started_at set in the future)
  if (elapsed < 0) return match.current_half === 1 ? 45 : 90;
  const halfMinutes = Math.min(45, Math.floor((elapsed / HALF_DURATION_MS_CLIENT) * 45));
  const half = match.current_half || 1;
  return half === 1 ? halfMinutes : 45 + halfMinutes;
}
