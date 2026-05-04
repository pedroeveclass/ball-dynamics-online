// ─── Match Constants ──────────────────────────────────────────

import i18n from '@/i18n';

const PHASE_FALLBACK_PT: Record<string, string> = {
  ball_holder: 'Portador', attacking_support: 'Ataque',
  defending_response: 'Defesa', resolution: 'Motion', pre_match: 'Pré-jogo',
  processing: 'Pausa',
  positioning_attack: 'Posicionar ⚽', positioning_defense: 'Posicionar 🛡️',
  positioning: 'Posicionar', open_play: 'Movimentação Geral',
};

// PHASE_LABELS resolves through i18next at access time so PT/EN follow the
// active language. Existing callers using `PHASE_LABELS[key]` continue to
// work transparently.
export const PHASE_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    if (typeof prop !== 'string') return undefined;
    const v = i18n.t(`match_room:phases.${prop}`, { defaultValue: '' });
    return v || PHASE_FALLBACK_PT[prop] || prop;
  },
});

export function phaseShortLabel(phase: string): string {
  const v = i18n.t(`match_room:phase_short.${phase}`, { defaultValue: '' });
  return v || phase;
}

// ─── Phase helpers (handle both legacy lab phases and merged engine phases) ──
// The lab engine still emits positioning_attack/positioning_defense/attacking_support/defending_response.
// The new match-engine emits positioning/open_play (merged simultaneous phases).
// All client logic must use these helpers so both engines render correctly.
export const POSITIONING_PHASES = ['positioning_attack', 'positioning_defense', 'positioning'] as const;
export const OPEN_PLAY_PHASES = ['attacking_support', 'defending_response', 'open_play'] as const;
export const isPositioningPhase = (p?: string | null) => !!p && (POSITIONING_PHASES as readonly string[]).includes(p);
export const isOpenPlayPhase = (p?: string | null) => !!p && (OPEN_PLAY_PHASES as readonly string[]).includes(p);
// In legacy phases the team-acting is encoded in the phase name; in merged phases
// both teams act so we derive from isAttacker. Helper unifies both worlds.
export const phaseAllowsAttackerAction = (p?: string | null, isAttacker?: boolean) => {
  if (p === 'positioning_attack' || p === 'attacking_support') return true;
  if (p === 'positioning_defense' || p === 'defending_response') return false;
  if (p === 'positioning' || p === 'open_play') return !!isAttacker;
  return false;
};
export const phaseAllowsDefenderAction = (p?: string | null, isAttacker?: boolean) => {
  if (p === 'positioning_defense' || p === 'defending_response') return true;
  if (p === 'positioning_attack' || p === 'attacking_support') return false;
  if (p === 'positioning' || p === 'open_play') return !isAttacker;
  return false;
};
// Phase-only flags: do attackers act in this phase? do defenders act in this phase?
// For merged phases both are true (simultaneous); for legacy phases only one side acts.
export const attackersActInPhase = (p?: string | null) =>
  p === 'positioning_attack' || p === 'attacking_support' || p === 'positioning' || p === 'open_play';
export const defendersActInPhase = (p?: string | null) =>
  p === 'positioning_defense' || p === 'defending_response' || p === 'positioning' || p === 'open_play';

const ACTION_FALLBACK_PT: Record<string, string> = {
  move: 'MOVER', pass_low: 'PASSE RASTEIRO', pass_high: 'PASSE ALTO',
  pass_launch: 'LANÇAMENTO', shoot: 'CHUTAR',
  shoot_controlled: 'CHUTE CONTROLADO', shoot_power: 'CHUTE FORTE',
  header_low: 'CABECEIO BAIXO', header_high: 'CABECEIO ALTO',
  header_controlled: 'CABECEIO CONTROLADO', header_power: 'CABECEIO FORTE',
  press: 'PRESSIONAR', intercept: 'INTERCEPTAR',
  block_lane: 'BLOQUEAR ROTA', block: 'BLOQUEAR', no_action: 'SEM AÇÃO', receive: 'DOMINAR BOLA',
  receive_hard: 'CARRINHO',
};

export const ACTION_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    if (typeof prop !== 'string') return undefined;
    const v = i18n.t(`match_room:actions.${prop}`, { defaultValue: '' });
    return v || ACTION_FALLBACK_PT[prop] || prop;
  },
});

export const PHASE_DURATION = 10;          // ball_holder
export const OPEN_PLAY_DURATION = 12;       // open_play (Movimentação Geral) — must match engine OPEN_PLAY_DURATION_MS / 1000
export const POSITIONING_PHASE_DURATION = 10;
export const RESOLUTION_PHASE_DURATION = 2; // must match engine RESOLUTION_PHASE_DURATION_MS / 1000
export const PRE_MATCH_COUNTDOWN_SECONDS = 10;
export const PRE_MATCH_COUNTDOWN_MS = PRE_MATCH_COUNTDOWN_SECONDS * 1000;
export const LIVE_EVENT_LIMIT = 60;
// Short debounce on turn-actions reconciliation. Lower = faster rollback when an
// optimistic action is rejected by the server (no visible "phantom" action lingering).
export const TURN_ACTION_RECONCILE_DELAY_MS = 100;
export const CLIENT_MATCH_PROCESSOR_RETRY_MS = 500;
export const ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK =
  import.meta.env.VITE_ENABLE_CLIENT_MATCH_PROCESSOR_FALLBACK !== 'false';
export const INTERCEPT_RADIUS = 0.6; // visual zone shown to player (more restrictive than engine's 1.0)
export const GOAL_LINE_OVERFLOW_PCT = 0.12; // makes the shot arrow/ball slightly cross the goal line

// ─── Goal mouth (vertical/Y-axis span in field percent, 0..100) ─────
// Goal was originally 24 units (38..62); shrunk 25% to 18 units (41..59).
// MUST match the engine constants in supabase/functions/match-engine-lab/index.ts.
export const GOAL_Y_CENTER = 50;
export const GOAL_HALF_WIDTH = 9;
export const GOAL_Y_MIN = GOAL_Y_CENTER - GOAL_HALF_WIDTH; // 41
export const GOAL_Y_MAX = GOAL_Y_CENTER + GOAL_HALF_WIDTH; // 59

// ─── Goal rendering fractions for PitchSVG (fraction of INNER_H) ────
// Top of goal = GOAL_Y_MIN/100 = 0.41. Height = (GOAL_Y_MAX - GOAL_Y_MIN)/100 = 0.18.
export const GOAL_MOUTH_FRACTION_TOP = GOAL_Y_MIN / 100;    // 0.41
export const GOAL_MOUTH_FRACTION_HEIGHT = (GOAL_Y_MAX - GOAL_Y_MIN) / 100; // 0.18

// ─── Set-piece exclusion zone radius (field percent) ─────────────────
// Engine uses 10 units for throw-in, corner, and free-kick exclusion.
export const SET_PIECE_EXCLUSION_RADIUS = 10;

// ─── Penalty spot (distance from each goal line, in field percent) ──
// Standard 11m from goal line on a 100-unit-long field ≈ 13%.
export const PENALTY_SPOT_DIST_PCT = 13;

export const ACTION_PHASE_ORDER: Record<string, number> = {
  positioning_attack: -2,
  positioning_defense: -1,
  positioning: -1,
  ball_holder: 0,
  attacking_support: 1,
  defending_response: 2,
  open_play: 2,
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

// Ball height zone at a given trajectory progress
export function getBallZoneAtProgress(actionType: string, progress: number): 'green' | 'yellow' | 'red' {
  switch (actionType) {
    case 'pass_low': case 'header_low':
      // First 10% is block-only (yellow) — no dominate allowed; then fully receivable.
      if (progress < 0.1) return 'yellow';
      return 'green';

    case 'move':
    case 'shoot_controlled': case 'header_controlled':
      return 'green';

    case 'pass_high': case 'header_high':
      if (progress < 0.12) return 'green';
      if (progress < 0.2) return 'yellow';
      if (progress < 0.8) return 'red';
      if (progress < 0.9) return 'yellow';
      return 'green';

    case 'pass_launch':
      if (progress < 0.08) return 'green';
      if (progress < 0.35) return 'yellow';
      if (progress < 0.65) return 'red';
      if (progress < 0.88) return 'yellow';
      return 'green';

    case 'shoot_power': case 'header_power':
      if (progress < 0.1) return 'green';
      if (progress < 0.3) return 'yellow';
      return 'red';

    default:
      return 'green';
  }
}

// Ball speed factor per action type — how fast the ball moves, which shrinks the
// defender's effective range (fast balls leave less time to reach the intercept point).
// Client and engine MUST use the same numbers so "canReach" decisions agree.
export function getBallSpeedFactor(actionType: string): number {
  switch (actionType) {
    case 'shoot_power':
    case 'header_power':
      return 0.25;
    case 'shoot_controlled':
    case 'header_controlled':
      return 0.35;
    case 'pass_launch':
    case 'pass_high':
    case 'header_high':
      return 0.65;
    case 'pass_low':
    case 'header_low':
    case 'move':
    default:
      return 1.0;
  }
}

// ─── Trajectory reachability (source of truth for both client and engine) ──────
// A defender can interact with the ball at a point P on the trajectory only if
//   d(defender → P) ≤ t(P) × range × ballSpeedFactor(actionType)
// where:
//   - t(P) is the 0-1 progress of P along the trajectory
//   - range is the defender's max move distance in one turn (from physical attrs)
//   - ballSpeedFactor shrinks the window for faster ball types
// At t=0 the ball hasn't left the passer, so only a defender literally on top of the
// passer can block. At t=1 the defender can use the full range. This is what "the
// preview of the ball" communicates visually — if the defender's move circle can touch
// where the ball will be at that moment, they can interact.
export function canReachTrajectoryPoint(
  defenderPos: { x: number; y: number },
  trajStart: { x: number; y: number },
  trajTarget: { x: number; y: number },
  t: number,
  range: number,
  actionType: string,
  tolerance: number = 0.5,
): boolean {
  if (t < 0 || t > 1 || range <= 0) return false;
  const px = trajStart.x + (trajTarget.x - trajStart.x) * t;
  const py = trajStart.y + (trajTarget.y - trajStart.y) * t;
  // Field Y axis is physically ~63% of the X axis — match the engine's
  // getMovementDistance (FIELD_Y_MOVEMENT_SCALE = INNER_H/INNER_W) so a vertical
  // move doesn't get counted as farther than it physically is. Without this, the
  // client was rejecting intercepts on predominantly-vertical passes that the
  // engine would have accepted.
  const Y_SCALE = INNER_H / INNER_W;
  const dx = defenderPos.x - px;
  const dy = (defenderPos.y - py) * Y_SCALE;
  const d = Math.sqrt(dx * dx + dy * dy);
  const effectiveRange = range * getBallSpeedFactor(actionType);
  // `tolerance` absorbs floating-point / render-grid rounding (default 0.5 field %).
  return d <= t * effectiveRange + tolerance;
}

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
