

# Plan: 3 Pass Types, 2 Shot Types, Accuracy Deviation & Smaller Arrowheads

## Overview

Replace the current single pass (`pass_low`) and single shot (`shoot`) with 5 distinct action types:
- **Passe Rasteiro** (ground pass) — green arrow, always interceptable
- **Passe Alto** (high pass) — yellow→red→yellow gradient arrow, red zone = uninterceptable
- **Lançamento Rápido** (quick launch) — green→yellow→green gradient, more green than red, faster/flatter trajectory
- **Chute Controlado** (controlled shot) — green arrow, accurate, ground level
- **Chute Forte** (power shot) — yellow/red arrow, can go over the goal depending on attributes

Add accuracy deviation: after action is submitted, the engine calculates a deviation from the intended target based on distance and player attributes.

## Changes

### 1. Action Types & Menu (`MatchRoomPage.tsx`)

**Update `DrawingState` type** to include new types: `'pass_low' | 'pass_high' | 'pass_launch' | 'shoot_controlled' | 'shoot_power'`.

**Update `ACTION_LABELS`** — add `pass_launch: 'LANÇAMENTO'`, rename `pass_low: 'PASSE RASTEIRO'`, `pass_high: 'PASSE ALTO'`, split shoot into `shoot_controlled: 'CHUTE CONTROLADO'` and `shoot_power: 'CHUTE FORTE'`.

**Update `getActionsForParticipant`** — ball holder phase 1 returns `['move', 'pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power']`.

**Update action menu icons** — add appropriate icons for each new action.

### 2. Arrow Visualization — Multi-Segment Colored Arrows

**Smaller arrowheads** — Reduce marker size from `markerWidth="8" markerHeight="6"` to `markerWidth="5" markerHeight="4"` (roughly ball-sized). Arrow tip is always green.

**Ground pass (`pass_low`)** — Single green line, same as current but labeled "PASSE RASTEIRO".

**High pass (`pass_high`)** — Rendered as 3 SVG line segments instead of 1:
- First ~20%: yellow stroke (ball rising)
- Middle ~60%: red stroke (ball very high, uninterceptable)
- Last ~20%: yellow stroke (ball descending)
- Arrowhead: always green

**Quick launch (`pass_launch`)** — Similar multi-segment:
- First ~35%: green stroke (low, interceptable)
- Middle ~30%: yellow stroke (medium height)
- Last ~35%: green stroke (low again, interceptable)
- Arrowhead: always green

**Controlled shot (`shoot_controlled`)** — Green line all the way, like a ground shot.

**Power shot (`shoot_power`)** — Yellow line by default. If player attributes are low (low `acuracia_chute` + long distance), turns red indicating the shot will likely go over the goal.

Replace the single `<line>` rendering for pass/shoot arrows with a helper function `renderMultiSegmentArrow(from, to, actionType, attrs)` that draws 2-3 `<line>` segments with different colors.

### 3. Arrow Quality (`getArrowQuality`)

Refactor to handle all 5 types:
- `pass_low`: based on `passe_baixo` attr, short range = green, long = yellow/red
- `pass_high`: based on `passe_alto` attr, more forgiving on distance
- `pass_launch`: blend of `passe_baixo` and `passe_alto`, medium forgiveness
- `shoot_controlled`: based on `acuracia_chute`, more forgiving (stays green longer)
- `shoot_power`: based on `forca_chute` and `acuracia_chute`, less forgiving (goes red = over goal)

### 4. Engine Resolution — Accuracy Deviation (`match-engine/index.ts`)

**New function `computeDeviation`** — After resolving which action the ball holder took, apply a random deviation to `target_x` and `target_y` before determining outcome:

```
deviationRadius = baseDifficulty * (1 - skillFactor)
angle = random * 2π
actual_x = target_x + cos(angle) * deviationRadius
actual_y = target_y + sin(angle) * deviationRadius
```

Where:
- `baseDifficulty` = distance / 100 * difficultyMultiplier (varies per action type)
- `skillFactor` = normalized attribute (0-1)
- `pass_low`: difficulty multiplier = 3, skill = `passe_baixo`
- `pass_high`: difficulty multiplier = 4, skill = `passe_alto`
- `pass_launch`: difficulty multiplier = 3.5, skill = avg(`passe_baixo`, `passe_alto`)
- `shoot_controlled`: difficulty multiplier = 2, skill = `acuracia_chute`
- `shoot_power`: difficulty multiplier = 5, skill = avg(`acuracia_chute`, `forca_chute`). Additionally, if deviation is large, shift `target_y` outside goal range (38-62) = "over the goal"

**Log deviation** — `[ENGINE] Deviation: intended=(x,y) actual=(x,y) deviation=N skill=N`

Update `resolveAction` to handle `pass_launch`, `shoot_controlled`, `shoot_power` as variants of the existing pass/shoot logic.

### 5. Interception Rules by Arrow Height

In the engine's `findInterceptor`:
- `pass_low` and `pass_launch` (green zones): interceptable along the entire path
- `pass_high`: only interceptable in the first 20% and last 20% of the path (yellow zones). The middle 60% (red zone) is uninterceptable
- `pass_launch`: interceptable in the first 35% and last 35%, middle 30% (yellow) is harder but possible
- `shoot_controlled`: interceptable (ground ball)
- `shoot_power`: interceptable but harder (only near start)

Update `findInterceptor` to check the `action_type` and restrict the valid `t` range for interception based on height zones.

### 6. `handleActionMenuSelect` and `handleFieldClick`

Update to handle `pass_launch`, `shoot_controlled`, `shoot_power`:
- `pass_launch` behaves like `pass_high` for submission (free target)
- `shoot_controlled` and `shoot_power` behave like `shoot` (target locked to goal line, Y clamped)

### 7. Ball Animation

Update `getAnimatedBallPos` decay constants:
- `pass_low`: k=3 (same)
- `pass_high`: k=2.5 (same)
- `pass_launch`: k=3.5 (faster than high pass)
- `shoot_controlled`: k=3 (moderate)
- `shoot_power`: k=5 (very fast initial burst)

### 8. Quality Indicator

Update the bottom-left quality indicator to show the action name in Portuguese and adjust quality bars per type.

---

## Files Modified

1. `src/pages/MatchRoomPage.tsx` — New action types, multi-segment arrows, smaller arrowheads, updated menus/quality
2. `supabase/functions/match-engine/index.ts` — Handle new action types in resolution, add accuracy deviation, update interception zones

No schema changes needed — `action_type` is a text field.

