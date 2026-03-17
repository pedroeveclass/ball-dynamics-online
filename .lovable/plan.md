

# Plan: Arrow Fixes, Ball-Player Sync, Stronger Deviation, Movement Inertia

## Correction from Previous Plan

**Lançamento Rápido (`pass_launch`)** arrow colors: **Yellow → Red → Yellow** (not green→yellow→green). This means the lançamento has a high-altitude middle section (red = uninterceptable) similar to passe alto, but with larger interceptable zones at start/end (35% yellow vs 20% for passe alto).

Updated color summary:
- `pass_low` (Passe Rasteiro): fully **green**
- `pass_high` (Passe Alto): **yellow(20%) → red(60%) → yellow(20%)**
- `pass_launch` (Lançamento): **yellow(35%) → red(30%) → yellow(35%)**
- `shoot_controlled`: fully **green**
- `shoot_power`: **yellow** or **yellow→red** or fully **red** (based on attributes)

## All Changes

### `src/pages/MatchRoomPage.tsx`

1. **Fix `pass_launch` segments** — change from green→yellow→green to yellow(`#f59e0b`)→red(`#ef4444`)→yellow(`#f59e0b`) in both `renderMultiSegmentArrow` and the preview/drawing arrow.

2. **Preview arrows show multi-segment colors for passes** — replace the single `<line>` drawing preview with multi-segment rendering for `pass_high` and `pass_launch`. Shots keep green/yellow only in preview (no red — surprise element).

3. **`shoot_power` arrow rendering** — render as: full yellow (decent skill), yellow→red at end (mediocre), or full red (terrible skill). Preview only shows green/yellow.

4. **Ball sticks to player on move** — in `getAnimatedBallPos` for `move` actions, set ball position = player's animated position (tiny offset only). No ball leading ahead.

5. **Arrows start from ball position** — pass/shoot arrow origin = ball holder's position + ball offset, not player center.

6. **Movement range increase + inertia** — base range from `5+norm*13` to `8+norm*17`. Store previous move direction in ref. Same direction = 1.15x bonus, opposite = 0.6x penalty.

### `supabase/functions/match-engine/index.ts`

7. **Exponential accuracy deviation** — replace `(1 - skillFactor)` with `Math.pow(1 - skillFactor, 2.5)`. At skill 99 → 0 deviation; skill 80 → tiny; skill 50 → noticeable; below 40 → always large.

8. **`shoot_power` overGoal threshold** — lower from `deviationRadius > 3` to `> 1.5`.

9. **Move = dribble** — ball final position matches player's final position in engine resolution.

10. **Interception zones for `pass_launch`** — interceptable in first 35% and last 35% (yellow zones), uninterceptable in middle 30% (red zone).

---

**Files:** `src/pages/MatchRoomPage.tsx`, `supabase/functions/match-engine/index.ts`

