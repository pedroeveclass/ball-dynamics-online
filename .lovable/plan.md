

# Plan: Fix Dual Action, Ball on Trajectory, Inertia Visual/Motion, Single-Turn Inertia, Set Pieces

## Summary
6 changes across 2 files to fix ball carrier dual action priority, align ball to trajectory center, make inertia function as a real pass_low with motion, limit inertia to one turn, and add throw-in/corner/goal kick logic.

---

## 1. Fix Ball Carrier Dual Action — Ball Always Goes to Pass/Shoot First (match-engine)

**Bug:** In the dedup logic (lines 665-691), both pass/shoot and move are kept, but during resolution (line 773-777) the engine finds the ball action first via `find()` which is correct. However, the issue is that the **movement is applied before resolution** (lines 755-770 loop processes ALL move actions including the ball holder's move). This means the ball holder's position updates to the move target, and then when resolving the ball action, `ballHolder.pos_x` is already the moved position — shifting the ball trajectory origin.

**Fix:** In the movement application loop (line 757), **skip the ball holder's move action** if they also have a ball action (pass/shoot). Process the ball holder's move AFTER the ball resolution, so the ball trajectory starts from their original position. Add:
```
const bhHasBallAction = ballHolder && allActions.some(a => 
  a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));

// In the move loop:
if (a.participant_id === ballHolder?.id && a.action_type === 'move' && bhHasBallAction) continue; // defer

// After resolution block, apply the ball holder's deferred move:
if (bhHasBallAction) {
  const bhMoveAction = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
  if (bhMoveAction?.target_x != null && bhMoveAction?.target_y != null) {
    await supabase.from('match_participants').update({ 
      pos_x: Number(bhMoveAction.target_x), pos_y: Number(bhMoveAction.target_y) 
    }).eq('id', ballHolder.id);
  }
}
```

## 2. Ball Follows Trajectory Center Line Exactly (MatchRoomPage.tsx)

**Bug:** Ball offset `+1.2, -1.2` causes it to render slightly off the trajectory line.

**Fix:** During animated pass/shoot trajectories in `getAnimatedBallPos()`, remove the `+1.2/-1.2` offset while the ball is in flight (animation progress < 1). Only add the offset at final rest position. Same fix for the live preview ghost ball.

## 3. Inertia as Real pass_low — Green Arrow + Preview + Motion (MatchRoomPage.tsx + match-engine)

### Client side:
- The virtual `__inertia__` trajectory already creates a `pass_low` action. But it needs a **visible green arrow** rendered like a submitted action. Currently only the blue intercept zone and "Inércia" label show — need to render the green pass_low arrow line (solid green `#22c55e`) from `looseBallPos` to the inertia endpoint.
- The **ghost ball preview** already works for `ballTrajectoryAction` when it's `pass_low`, so it should appear automatically once the arrow renders correctly.

### Engine side — motion animation:
- During resolution when `nextBallHolderParticipantId === null` and there's an inertia direction, the engine should compute the inertia endpoint and store it. The client needs this to animate the ball moving during phase 4.
- Store the inertia endpoint in `match_event_logs` payload: `{ inertia_end_x, inertia_end_y }` so the client can animate the ball sliding to the new position during the resolution animation.
- In `getAnimatedBallPos()`, when the ball is loose and there's a finalBallPos from inertia, animate the ball from `looseBallPos` to the inertia endpoint during phase 4.

## 4. Ball Inertia Lasts Only ONE Turn (MatchRoomPage.tsx + match-engine)

**Current bug:** Inertia cascades — each turn the ball continues to roll 15% further. Per user: inertia should only last for the single turn immediately following the unclaimed pass.

**Fix (engine):** Add a flag to distinguish "first loose ball turn" from subsequent ones. In the match_event_logs, use `event_type: 'ball_inertia'` only on the first loose turn. On subsequent loose turns (ball was already loose last turn), log `'ball_stopped'` and set the ball as stationary.

**Fix (client):** In the turn-start effect (line 586-627), only set `ballInertiaDir` if the ball just became loose (transition from having a holder to not having one). If `carriedLooseBallPos` already exists (ball was already loose), set `ballInertiaDir = null` — ball stops.

```
// Simplified logic:
if (activeTurn?.ball_holder_participant_id == null) {
  if (!carriedLooseBallPos && finalBallPos) {
    // JUST became loose — set inertia for this one turn
    // compute direction from last ball action
    setBallInertiaDir({ dx, dy });
    setCarriedLooseBallPos(finalBallPos);
  } else if (carriedLooseBallPos) {
    // Was already loose — stop inertia, ball stays put
    setBallInertiaDir(null);
    // Don't update carriedLooseBallPos — keep where it is
  }
}
```

## 5. Set Pieces: Throw-in, Corner Kick, Goal Kick (match-engine)

Add boundary detection after resolution determines the final ball position.

### Detection logic (after ball resolution, before creating next turn):
```
function detectOutOfBounds(ballEndX, ballEndY, possClubId, match):
  // Field boundaries: x=[0,100], y=[0,100]
  // Sidelines: y <= 0 or y >= 100 → THROW-IN
  // End lines: x <= 0 or x >= 100 → CORNER or GOAL KICK
  
  if (ballEndY <= 0 || ballEndY >= 100):
    return { type: 'throw_in', team: oppositeOf(lastTouchClub) }
  
  if (ballEndX <= 0):  // left end line
    if (lastTouchClub == homeClub):
      return { type: 'corner', team: awayClub, side: ballEndY < 50 ? 'top' : 'bottom' }
    else:
      return { type: 'goal_kick', team: homeClub, side: ballEndY < 50 ? 'top' : 'bottom' }
  
  if (ballEndX >= 100): // right end line
    if (lastTouchClub == awayClub):
      return { type: 'corner', team: homeClub, side: ballEndY < 50 ? 'top' : 'bottom' }
    else:
      return { type: 'goal_kick', team: awayClub, side: ballEndY < 50 ? 'top' : 'bottom' }
```

### Restart positioning (semi-fixed by sector):

**Throw-in:** Find the outfield player of the awarded team closest to the ball exit point. Place them at the sideline (`y=1` or `y=99`) at the x-coordinate where the ball went out. They start with possession.

**Corner kick:** Find a forward/winger of the awarded team. Place them at the corner (`x=1,y=1` / `x=1,y=99` / `x=99,y=1` / `x=99,y=99`). They start with possession.

**Goal kick:** Place the GK of the awarded team at the small area line on the side closest to where the ball exited (`x=6,y=clamp(ballEndY,40,60)` for home or `x=94,y=...` for away). GK starts with possession.

### Implementation in resolution block:
After computing `nextBallHolderParticipantId` and final ball position, check if the ball went out of bounds. If so:
- Override `nextBallHolderParticipantId` with the restart player
- Override `newPossessionClubId`
- Update the restart player's position via `match_participants` update
- Insert event log: `🏳️ Lateral!` / `🚩 Escanteio!` / `🥅 Tiro de Meta!`

## 6. Ball Position Tracking for Out-of-Bounds Detection

Need to compute where the ball actually ends up. Currently the engine doesn't explicitly track ball final position — it's implicit. Add explicit ball end position calculation:
- For passes: `deviation.actualX, deviation.actualY`
- For shoots that miss: the goal line position
- For moves: the ball holder's new position
- For loose ball inertia: the inertia endpoint

Check this position against boundaries before creating the next turn.

---

## Files Modified
1. **`src/pages/MatchRoomPage.tsx`** — Ball on trajectory center, inertia green arrow + preview, single-turn inertia, motion animation for inertia
2. **`supabase/functions/match-engine/index.ts`** — Fix dual action priority, ball end position tracking, single-turn inertia flag, out-of-bounds detection, throw-in/corner/goal kick restart logic

