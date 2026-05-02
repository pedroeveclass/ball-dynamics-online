import type { PassDatum, ShotDatum } from './PlayerActionMap';

// Field is 0..100 in both axes. The defending goal sits at x=0, the attacking
// goal at x=100, both centered around y=50 (between GOAL_Y_MIN=41 and 59).
const GOAL_X = 100;
const GOAL_Y_CENTER = 50;

export function shotXg(shot: { from: { x: number; y: number }; outcome: ShotDatum['outcome'] }): number {
  // Compute distance from origin to the centre of the goal mouth, then
  // exponentially decay. Tuned so penalty range ≈ 0.7, midfield ≈ 0.05.
  const dx = GOAL_X - shot.from.x;
  const dy = GOAL_Y_CENTER - shot.from.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  // Slight penalty for very wide shots (high |dy|) — angle matters too.
  const angleFactor = Math.max(0.55, 1 - Math.abs(dy) / 60);
  const base = Math.exp(-(Math.max(0, d - 4)) / 18);
  const xg = base * angleFactor;
  return Math.max(0.01, Math.min(0.95, xg));
}

export function passXa(pass: PassDatum): number {
  // Only completed passes generate threat; failed passes are 0.
  if (!pass.completed) return 0;
  const dx = GOAL_X - pass.to.x;
  const dy = GOAL_Y_CENTER - pass.to.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  // Threat is the xG you'd expect from a shot taken at the destination,
  // scaled down because not every assist-zone reception turns into a shot.
  const angleFactor = Math.max(0.5, 1 - Math.abs(dy) / 50);
  const xg = Math.exp(-(Math.max(0, d - 6)) / 18) * angleFactor;
  return Math.max(0, Math.min(0.6, xg * 0.55));
}

export function totalXg(shots: ShotDatum[]): number {
  let s = 0;
  for (const sh of shots) s += shotXg(sh);
  return s;
}

export function totalXa(passes: PassDatum[]): number {
  let s = 0;
  for (const p of passes) s += passXa(p);
  return s;
}

// Long passes: from→to euclidean ≥ 30 units (≈ a third of the field).
export function isLongPass(pass: PassDatum): boolean {
  const dx = pass.to.x - pass.from.x;
  const dy = pass.to.y - pass.from.y;
  return Math.sqrt(dx * dx + dy * dy) >= 30;
}

// Key passes (heuristic): completed pass whose destination has xA ≥ 0.18
// (ie the receiver landed in a high-threat area).
export function isKeyPass(pass: PassDatum): boolean {
  if (!pass.completed) return false;
  return passXa(pass) >= 0.18;
}

// Total distance covered (km). 1 unit ≈ 1.05 m on a 100×60 m pitch.
// We sum euclidean delta between consecutive position samples and apply a
// small Y-axis correction because the pitch is wider than tall.
export function totalDistanceKm(samples: Array<{ x: number; y: number }>): number {
  if (samples.length < 2) return 0;
  const Y_SCALE = 60 / 100; // pitch is 100m × 60m → y axis is shorter
  let m = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = (samples[i].y - samples[i - 1].y) * Y_SCALE;
    m += Math.sqrt(dx * dx + dy * dy);
  }
  return m / 1000; // km
}
