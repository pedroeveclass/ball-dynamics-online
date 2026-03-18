

# Plan: Fix Ball Inertia (Restore Working Version + One-Time Constraint)

## Problem
The inertia system broke when the "one turn only" logic was added. The turn-start effect (line 605-610) clears `ballInertiaDir` immediately when `carriedLooseBallPos` already exists, which prevents the arrow, ghost ball, and animation from working on the very turn inertia should apply.

The core issue: the state reset happens at turn start, but inertia needs to persist through the entire turn cycle (arrow display during phases 2-3 + animation during phase 4) before being consumed.

## Approach

### Client (`MatchRoomPage.tsx`)

**1. Fix turn-start inertia lifecycle:**
- When ball JUST becomes loose (no `carriedLooseBallPos` yet): set `carriedLooseBallPos` + `ballInertiaDir` from `lastBallDirRef` — this is the inertia turn.
- When ball is STILL loose AND `carriedLooseBallPos` already exists: check if inertia was already consumed (use a ref `inertiaConsumedRef`). If not consumed yet, keep `ballInertiaDir` alive for this turn. Mark as consumed after resolution animation completes.
- If consumed: clear `ballInertiaDir`, ball stays put.

**2. Add `inertiaConsumedRef` flag:**
- `useRef<boolean>(false)` — set to `true` after the resolution animation applies the inertia drift (line ~1357-1368).
- Reset to `false` when ball is no longer loose (someone gets possession) or a new loose ball event starts.

**3. Ensure arrow + ghost ball + animation all work:**
- The green arrow rendering (line 2069-2092) already checks `ballInertiaDir` — will work once the dir isn't prematurely cleared.
- The `getAnimatedBallPos` inertia animation (line 1608-1621) already works — same fix.
- The resolution end handler (line 1357-1368) already moves ball and clears inertia — just add `inertiaConsumedRef.current = true`.

### Engine (`match-engine-lab/index.ts`)

No changes needed — the engine already:
- Logs `ball_inertia` event with `{ ball_x, ball_y }` on first loose turn
- Logs `ball_stopped` on second consecutive loose turn
- This naturally enforces the "once per loose ball event" rule server-side

### Summary of Changes
- **`MatchRoomPage.tsx`**: Add `inertiaConsumedRef`, fix turn-start effect to not clear `ballInertiaDir` prematurely, mark consumed after resolution animation applies drift.

