

# Plan: Minimal Physics/Inertia Layer for Match Engine

## Overview

Add a lightweight physics simulation layer to the resolution phase (Phase 4) — both server-side (edge function) and client-side (animation). No schema changes, no new tables, no changes outside the match system.

---

## Architecture

The current engine resolves actions instantaneously: player teleports from A to B, ball teleports from A to B. The change introduces **substeps** during resolution that simulate gradual movement with velocity, acceleration, and friction.

```text
Current:  Action → Instant teleport to target
Proposed: Action → N substeps → position updates with velocity/friction
```

The physics runs in two places:
1. **Edge Function** (server): computes final positions using substeps, applies attribute modifiers to movement distance/ball speed
2. **MatchRoomPage** (client): animates using the same physics model during Phase 4 for visual smoothness

---

## Changes

### 1. Edge Function (`supabase/functions/match-engine/index.ts`)

**Load player attributes** — When resolution phase fires, fetch `player_attributes` for all participants that have a `player_profile_id`. Build a lookup map `participantId → attrs`.

**Player movement with inertia** — Replace the current "teleport to target" with a substep simulation:
- `NUM_SUBSTEPS = 10`
- Each substep: compute `desiredVelocity` toward target, then `velocity = lerp(velocity, desiredVelocity, accelerationFactor)`
- `accelerationFactor` derived from player's `aceleracao` attribute (range 10-99 → factor 0.3-0.8)
- **Direction change penalty**: compute angle between current velocity and desired velocity. Apply a multiplier based on `agilidade`:
  - ~0° change: no penalty
  - ~90° change: velocity reduced by 20-40% (less with high agility)
  - ~180° change: velocity reduced by 40-70%
- `maxSpeed` derived from `velocidade` attribute
- `stamina` applies a small decay: players with low stamina in later turns (turn > 20) lose ~5-15% speed
- `forca` adds stability: higher force = less speed loss on direction changes
- Final position = result after all substeps (will be close to target but not exact for sharp turns or long distances)

**Ball physics** — Replace instant ball teleport:
- `pass_low`: initial impulse = `8 + (passe_baixo / 100) * 4`, friction = `0.92`
- `pass_high`: initial impulse = `12 + (passe_alto / 100) * 5`, friction = `0.90`
- `shoot`: initial impulse = `15 + (forca_chute / 100) * 8`, friction = `0.95`
- Each substep: `ball.velocity *= friction`, `ball.position += ball.velocity`
- Ball stops when `|velocity| < 0.1`
- Final ball position may differ slightly from exact target (especially for long passes)

**Ball control difficulty** — When determining if a player successfully receives/dominates the ball:
- Compute `ballSpeed` at the point of interception
- Control chance = `0.7 + (controle_bola * 0.002) + (agilidade * 0.001) + (um_toque * 0.001)`
- Fast ball (speed > 5): penalty of `-0.1 to -0.3`
- This is a soft check — for now, always succeed but log the difficulty for future use. The goal is to have the infrastructure ready without adding failures yet.

**Position persistence** — Final positions after substeps are saved to `match_participants.pos_x/pos_y` as before. No schema changes needed.

### 2. Client Animation (`src/pages/MatchRoomPage.tsx`)

**Player animation with easing** — Replace the current cubic ease `t = 1 - (1 - progress)^3` with a physics-based interpolation:
- Track a simulated velocity per player during animation
- On each frame: compute direction to target, apply acceleration factor (derived from stored attributes or a default)
- Direction changes cause visible slowdown: player decelerates, turns, then re-accelerates
- This makes the animation feel "weighted" — players with momentum don't snap directions

**Ball animation with deceleration** — Replace linear interpolation:
- Ball starts fast and decelerates
- Use exponential decay: `t_effective = 1 - e^(-k * progress)` where `k` varies by action type:
  - `pass_low`: k = 3 (moderate deceleration)
  - `pass_high`: k = 2.5 (slightly slower deceleration, more hang time)
  - `shoot`: k = 4 (fast initial burst, still decelerates)
- This makes balls "launch" and then slow down visually

**Attribute loading** — Fetch `player_attributes` once when match loads (alongside participants). Store in a ref/state map. Use default values (50) for bots/virtual players.

### 3. What stays the same

- Turn/phase system (4 phases, timers, phase transitions)
- Action types (move, pass_low, pass_high, shoot, receive)
- Interception/domination logic (unchanged, just uses new final positions)
- All UI outside the field animation
- Database schema
- Auth, contracts, lineups, clubs, challenges, market
- Bot logic
- Match creation/scheduling

---

## Technical Details

**Substep model (server)**:
```
for each substep (1..10):
  for each player with move/receive action:
    desired = normalize(target - pos) * maxSpeed
    angle = angleBetween(velocity, desired)
    turnPenalty = 1 - (angle/PI) * (1 - agilityFactor)
    velocity = lerp(velocity * turnPenalty, desired, accelFactor)
    pos += velocity / NUM_SUBSTEPS
  for ball:
    pos += velocity / NUM_SUBSTEPS
    velocity *= friction
```

**Attribute normalization** (all attrs are 10-99 in DB):
- `normalize(attr) = (attr - 10) / 89` → 0.0 to 1.0
- `accelFactor = 0.3 + normalize(aceleracao) * 0.5`
- `agilityFactor = 0.4 + normalize(agilidade) * 0.5`
- `maxSpeed` per substep = `3 + normalize(velocidade) * 4` (in field %)
- `staminaDecay` = `1.0 - (turn / 40) * (1 - normalize(stamina)) * 0.15`

**Client easing replacement**:
- Current: `t = 1 - (1-p)^3`
- New for ball: `t = 1 - e^(-k*p)` normalized to [0,1]
- New for players: multi-segment ease — slower at start (acceleration), faster mid, slower if direction changed

---

## Files Modified

1. `supabase/functions/match-engine/index.ts` — Add physics substep logic in resolution, load player_attributes, apply to movement/ball
2. `src/pages/MatchRoomPage.tsx` — Load attributes, update `getAnimatedPos` and `getAnimatedBallPos` with physics-based easing

No other files touched.

