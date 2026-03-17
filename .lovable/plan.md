

# Plan: Inertia System, Ball Trajectory Preview for Phase 2/3, and Stricter Accuracy Deviation

## Overview

Three changes:
1. **Inertia between turns**: Track each player's last movement direction. Same direction = up to 1.2x range bonus, opposite = down to 0.8x penalty, scaled by angle.
2. **Ball trajectory preview in Phase 2/3**: After Phase 1 ends, the engine computes the **actual** pass destination (with deviation applied) and stores it. During Phases 2/3, players see a "ghost" trajectory line showing where the ball will actually go, so they can position accordingly — if their max movement at 100% reaches only the middle of the trajectory, they know the ball will have already passed them.
3. **Much stricter accuracy deviation**: Increase the exponent from 2.5 to 3.5 and raise difficulty multipliers. Players with overall <50 should almost never hit their exact target.

## Changes

### File 1: `supabase/functions/match-engine/index.ts`

**A. Compute deviation at Phase 1→2 transition (not at resolution)**
Currently, deviation is computed during resolution. Instead, compute it when Phase 1 (`ball_holder`) ends and the engine transitions to `attacking_support`. Store the deviated target in a new field on the ball holder's action: update the action's `target_x` and `target_y` in the DB at this point, and set `status` to `'deviated'` (or add metadata). This way, when the client loads actions during Phase 2/3, it sees the **actual** destination.

Actually, simpler approach: When the engine ticks and transitions from `ball_holder` → `attacking_support`, find the ball holder's action, compute deviation, and **update** the action's `target_x`/`target_y` in the database. Then during Phases 2/3, the client already loads these actions via `loadTurnActions` and renders the trajectory — the trajectory shown will already reflect the deviated position.

Keep a copy of the original intended target in a log for debugging.

**B. Stricter deviation formula**
- Change exponent from `2.5` to `3.5`
- Increase difficulty multipliers: `pass_low: 5` (was 3), `pass_high: 7` (was 4), `pass_launch: 6` (was 3.5), `shoot_controlled: 4` (was 2), `shoot_power: 8` (was 5)
- Add a minimum deviation floor for low-skill players: if skill < 0.45 (raw attr < ~50), add a guaranteed base deviation of `1 + (0.45 - skillFactor) * 3`
- Lower `shoot_power` overGoal threshold from `1.5` to `1.0`

**C. Inertia in engine movement resolution**
Track previous turn direction per participant. When resolving movement:
- Query the previous turn's move/receive action for that participant to get their last direction vector
- Compute angle between last direction and current direction
- Apply multiplier: `1.2` for same direction (angle < 30°), linearly down to `0.8` for opposite (angle > 150°), `1.0` at 90°
- Clamp the actual movement target based on this adjusted range

### File 2: `src/pages/MatchRoomPage.tsx`

**D. Inertia in client-side range computation**
- Add a `prevDirectionsRef = useRef<Record<string, {x: number, y: number}>>({})` to track each player's last movement direction
- After resolution animation completes, update `prevDirectionsRef` with each player's movement vector from that turn
- In `computeMaxMoveRange`, accept an optional target direction. Compute angle vs previous direction, apply multiplier (1.2 same, 0.8 opposite, lerp between)
- Update `handleSvgMouseMove` to pass mouse direction into range computation for real-time clamping feedback
- The range circle becomes directional — for simplicity, still show a circle but at the average-case range, and clamp the actual arrow dynamically based on direction

**E. Ball trajectory preview during Phase 2/3**
The trajectory is already shown as `ballTrajectoryAction` with the intercept zone visualization (lines 1671-1701). Since we now update the action's `target_x/y` with deviation at Phase 1→2 transition, the existing visualization will automatically show the **deviated** trajectory. 

Add a visual indicator: render small tick marks or dots along the trajectory at 25%, 50%, 75% progress points, showing where the ball will be at those time fractions. This helps players estimate if they can reach the ball in time — if their max range circle doesn't reach the 50% mark, the ball will have passed them by the time they arrive.

**F. Directional range visualization**
Instead of a simple circle, show the range ellipse slightly elongated in the direction of previous movement (1.2x) and compressed in the opposite direction (0.8x). Use a rotated ellipse or just dynamically clamp the arrow.

---

## Technical Details

### Inertia angle calculation
```
angleDiff = angle between prevDirection and currentDirection (0 to π)
normalizedAngle = angleDiff / π  (0 = same direction, 1 = opposite)
multiplier = 1.2 - 0.4 * normalizedAngle  (1.2 at 0°, 1.0 at 90°, 0.8 at 180°)
```
If no previous direction (first turn or was stationary), multiplier = 1.0.

### Deviation at phase transition
In the engine tick handler, when `activeTurn.phase === 'ball_holder'` and time has expired:
1. Find ball holder's pending action
2. If it's a pass or shoot, compute deviation using the stricter formula
3. Update the action's `target_x`/`target_y` in DB
4. Proceed to create `attacking_support` turn

### Stricter deviation curve
```
skillCurve = Math.pow(1 - skillFactor, 3.5)
minimumDeviation = skillFactor < 0.45 ? (1 + (0.45 - skillFactor) * 3) : 0
deviationRadius = (baseDifficulty * skillCurve + minimumDeviation) * (0.6 + Math.random() * 0.4)
```

At skill 99 (factor≈1.0): deviation ≈ 0
At skill 80 (factor≈0.79): deviation ≈ tiny (only distance-scaled)
At skill 50 (factor≈0.45): deviation ≈ moderate + guaranteed floor
At skill 35 (factor≈0.25): deviation ≈ large + guaranteed floor of ~1.6

---

## Files Modified
1. `supabase/functions/match-engine/index.ts` — Deviation at phase transition, stricter formula, inertia in movement
2. `src/pages/MatchRoomPage.tsx` — Inertia tracking, directional range, trajectory progress markers

