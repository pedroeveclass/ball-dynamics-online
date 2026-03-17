

# Plan: Positioning Turn for Set Pieces (Kickoff, Throw-in, Corner, Goal Kick)

## Summary
Add a special "positioning" turn before every dead-ball restart. This turn has only 2 active phases: Phase 2 (attacking team positions players) and Phase 3 (defending team positions players). Phase 1 is skipped, Phase 4 shows final positions instantly. Players can only drag-and-drop their players to valid zones — no passes, shots, or ball actions. The ball holder (kicker) cannot be repositioned.

---

## Engine Changes (`supabase/functions/match-engine-lab/index.ts`)

### 1. New turn type: `positioning`
After every dead-ball event (kickoff, goal kick, corner, throw-in), instead of creating a normal `ball_holder` turn, create a turn with a new metadata marker. Add a `is_positioning` boolean column or use a convention in the phase name like `positioning_attack` and `positioning_defense`.

**Approach:** Use two new phase values: `positioning_attack` and `positioning_defense`. This avoids DB migrations — just string values in the existing `phase` column.

### 2. Turn creation changes
In all places where dead-ball restarts create the next turn:

- **Kickoff** (auto_start + after goal): Instead of `phase: 'ball_holder'`, create turn with `phase: 'positioning_attack'`.
- **Set pieces** (throw-in, corner, goal kick in resolution block): Same — first phase is `positioning_attack`.

### 3. Phase advancement for positioning turns
In the tick handler, add logic for the two positioning phases:

```
if (activeTurn.phase === 'positioning_attack') {
  // Apply all 'move' actions from possession team players
  // Skip ball holder — they can't move
  // Advance to 'positioning_defense'
}

if (activeTurn.phase === 'positioning_defense') {
  // Apply all 'move' actions from non-possession team players
  // Advance to 'ball_holder' (normal turn starts)
  // The ball_holder is the restart player set during the set piece
}
```

Movement application is the same as normal moves — update `pos_x`, `pos_y` in `match_participants`.

### 4. Kickoff positioning constraint (engine-side validation)
For kickoff specifically, validate that players stay in their half:
- Home team: `pos_x <= 50`
- Away team: `pos_x >= 50`
- Clamp if out of bounds.

For other set pieces (lateral, corner, goal kick): no spatial restriction — players can go anywhere on the field.

---

## Client Changes (`src/pages/MatchRoomPage.tsx`)

### 1. Detect positioning turn
Add a derived boolean:
```typescript
const isPositioningTurn = activeTurn?.phase === 'positioning_attack' || activeTurn?.phase === 'positioning_defense';
const isPositioningAttack = activeTurn?.phase === 'positioning_attack';
const isPositioningDefense = activeTurn?.phase === 'positioning_defense';
```

### 2. Player interaction during positioning
When `isPositioningTurn`:
- Clicking a player opens **only the "Move" action** (no pass, shoot, receive, no_action options).
- The ball holder participant **cannot be selected or moved** — skip them in the action menu.
- Only the correct team can act:
  - `positioning_attack`: only possession team players can be repositioned.
  - `positioning_defense`: only non-possession team players can be repositioned.
- Each player can submit one move action (their new position).

### 3. Move range override
During positioning, remove the normal physics-based range limit. Players can move anywhere on the field (or their half for kickoff). Replace `computeMaxMoveRange` with a large value (e.g., 100) during positioning turns.

### 4. Kickoff half-field constraint (client-side)
If the current event is a kickoff and we're in positioning:
- Home team: clamp `target_x` to `[0, 50]`
- Away team: clamp `target_x` to `[50, 100]`
- Visual: render a semi-transparent overlay on the opponent's half to show the restricted zone.

### 5. Phase wheel / UI updates
Update `PhaseWheel` and phase labels:
- `positioning_attack` → "Posicionamento ⚽" (show as phase 2 slot)
- `positioning_defense` → "Posicionamento 🛡️" (show as phase 3 slot)
- Phase 1 and 4 show as skipped/dimmed.

Add to `PHASE_LABELS`:
```typescript
positioning_attack: 'Posicionar',
positioning_defense: 'Posicionar',
```

### 6. Resolution animation
When transitioning from `positioning_defense` to the actual `ball_holder` turn, the engine just applies positions — no animation needed. On the client, when entering a turn after a positioning phase, players should already be at their new positions (the DB has been updated).

---

## Files Modified
1. **`supabase/functions/match-engine-lab/index.ts`** — Add `positioning_attack` / `positioning_defense` phase handling, create positioning turns after dead-ball events, validate kickoff half-field constraint.
2. **`src/pages/MatchRoomPage.tsx`** — Detect positioning phases, restrict UI to move-only, unlimited range, kickoff half-field clamping, phase wheel labels, skip ball holder from repositioning.

