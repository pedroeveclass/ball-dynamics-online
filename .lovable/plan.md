

# Plan: Action Circle Reachability Fix, Penalties, Ball Carrier Phase 2 Move, Idle Inertia Reset

## Summary
7 changes across 2 files to fix the action circle logic, add movement penalties, allow ball carrier mini-move in phase 2, allow tackling stationary carriers, and reset inertia on idle turns.

---

## 1. Fix Purple/Green Action Circle Logic (MatchRoomPage.tsx)

**Current problem:** The circle turns purple only at one specific point. Per the user's images:
- Once the circle turns purple (player reaches ball trajectory before/at ball), it should stay purple for the **entire remainder** of the trajectory from that point forward
- If the ball has already passed (player's movePct < tCursor at that segment), the circle stays green and no action is allowed

**Fix in the `canReachBall` calculation (~line 2066-2097) and the `handleFieldClick` reachability check (~line 1006-1029):**

Replace the reachability logic with:
```
// For every point along the trajectory, check: does the player arrive there 
// before or at the same time as the ball?
// Player movement % = movePct (0-1 based on cursor distance / maxRange)
// Ball progress at trajectory point t = t (0-1)
// Player can act if: there exists a point on trajectory where tCursor <= movePct
// AND once found, everything FROM that point to the END is also reachable

// Compute t along trajectory for closest point to cursor
tCursor = projection of cursor onto trajectory (0-1)
// The ball arrives at tCursor when ball progress = tCursor
// Player arrives when movePct >= some threshold

// Simple rule: if movePct >= tCursor (player is "ahead" of ball at cursor point),
// then purple. If movePct < tCursor (ball passed), green.
// Additionally: once the player's reach touches a point where they're ahead,
// everything from that point to the END of the trajectory is reachable.

canReachBall = (movePct >= tCursor) || (distToTraj <= circleRadius + INTERCEPT_RADIUS && movePct >= tCursor)
```

And critically: once `canReachBall` is true at a position, the entire segment from that position to the trajectory end should be considered reachable. So the check is: **is there ANY point on the trajectory where the player arrives before the ball?** If movePct >= tCursor at the closest-to-cursor point on trajectory, then yes.

## 2. Ball Carrier Speed Penalty (MatchRoomPage.tsx + match-engine)

**Client-side (computeMaxMoveRange):** When the participant IS the ball holder, apply a 0.85x multiplier to range (carrying ball slows them down).

**Engine-side:** In `simulatePlayerMovement` or during move resolution, when processing the ball holder's `move` action, reduce effective speed by 15%.

## 3. Failed Contest Penalty (match-engine/index.ts)

When a player attempts a tackle/block/save and **fails**, store a penalty flag. In the next turn's resolution, reduce their movement range by ~25%. 

Implementation: After a failed intercept, update the participant's record with a metadata column or use a simple approach — insert a special event log that the engine checks next turn. Simpler: use `match_participants` to store a `penalty_next_turn` boolean or use the existing `payload` on actions.

Actually simplest: In the resolution phase, when processing failed intercepts, immediately apply a position penalty — move them slightly backward from their target (reduce their effective movement by 25%). This is instant and doesn't need cross-turn state.

## 4. Ball Carrier Phase 2 Mini-Move (MatchRoomPage.tsx + match-engine)

After the ball carrier makes a pass/shoot in phase 1, allow them to also MOVE in phase 2, but with only ~20% of normal range.

**Client (getActionsForParticipant):** Add `'move'` to the ball holder's options during `attacking_support` phase.

**Client (computeMaxMoveRange):** When the participant is the ball holder AND the phase is `attacking_support`, multiply range by 0.2.

**Engine:** The ball holder's phase 2 move is just a regular `move` action. The client limits the range; the engine already processes `move` actions from any participant.

## 5. Allow Tackling Stationary Ball Carrier (MatchRoomPage.tsx)

Currently, defenders can only tackle if the ball carrier chose `move`. If the ball carrier chose `no_action` (stays still), defenders should still be able to attempt a DESARME by clicking near the ball carrier's position.

**Fix in `handleFieldClick`:** When checking for interception opportunities, also detect if the click is near the stationary ball carrier's position (not just along a trajectory). If ball carrier has no action or chose to stay, treat it like a `move` with target = current position.

**Fix in `getActionsForParticipant`:** Already allows `receive` when `hasReceivePrompt` is set, so this should work if we trigger the prompt correctly.

## 6. Inertia Reset When Player Stays Still (MatchRoomPage.tsx)

**Current:** `prevDirectionsRef` persists across all turns. If a player moved in turn 1, skipped turn 2, then in turn 3 the old inertia from turn 1 still applies.

**Fix:** In the resolution animation completion (line ~1179-1194), for players who did NOT move (no `move`/`receive` action with target), **delete** their entry from `prevDirectionsRef.current` instead of keeping the old one. This zeroes their inertia for the next turn.

```typescript
// After processing moved players:
for (const p of participantsRef.current) {
  const moveAct = latestActions.find(...);
  if (!moveAct) {
    delete newDirections[p.id]; // Remove inertia for stationary players
    delete prevDirectionsRef.current[p.id]; // Zero out
  }
}
```

## 7. Event Log Probabilities for Contests (match-engine/index.ts)

Already partially implemented — the `resolveAction` function logs `(${chancePct})` in descriptions. But failed attempts only show in `console.log`, not in event logs.

**Fix:** In `resolveAction`, when a contest FAILS (except for tackle which returns immediately), also insert an event log for the failure, not just console.log. Add the percentage to all event descriptions.

---

## Files Modified
1. **`src/pages/MatchRoomPage.tsx`** — Fix purple/green logic, carrier speed penalty, phase 2 mini-move for carrier, stationary carrier tackle, inertia reset on idle
2. **`supabase/functions/match-engine/index.ts`** — Carrier speed penalty, failed contest position penalty, failed contest event logs

