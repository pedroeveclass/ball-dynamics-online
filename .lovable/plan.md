

# Plan: Ball Preview on Move, Remove Fixed Markers, Green Cursor Only on Move, Failure System for Ball Actions

## Summary

Six changes across two files:

1. **Ball preview on MOVE action too** — currently only shows for pass/shoot trajectories
2. **Remove fixed 25/50/75% progress markers** — live preview replaces them
3. **Green cursor circle only on MOVE** — not on pass/shoot/other actions
4. **Failure system for "Dominar Bola"** — skill-based success/failure with context-aware naming

---

## Changes

### File: `src/pages/MatchRoomPage.tsx`

**A. Ball preview also shows during MOVE (line ~2055-2088)**
Currently the condition `ballTrajectoryAction.action_type !== 'move'` excludes move actions from the live ball preview. Remove this condition so the live preview also renders when the ball holder chose `move` — the ghost ball slides along the dribble path synchronized with the defender's movement percentage.

**B. Remove fixed 25/50/75% progress markers (lines ~1768-1801)**
Delete the entire trajectory progress markers block (the `[0.25, 0.5, 0.75]` markers with text labels).

**C. Green cursor circle only on MOVE (lines ~2039-2052)**
Keep the outer glow around the active player for ALL action types, but only render the green translucent destination circle at cursor when `drawingAction.type === 'move'`. For pass/shoot, keep only the player glow, not the cursor shadow.

**D. Context-aware action labels in menu**
When the action menu shows `receive` option, dynamically rename it based on context:
- If ball holder's action is `move` and the player clicking is on the **opposing team** → show "DESARME" instead of "DOMINAR BOLA"
- If ball holder's action is a **shoot** type → show "BLOQUEAR" for field players, "DEFENDER" for GK
- Otherwise (passes, loose ball) → keep "DOMINAR BOLA"

Update `ACTION_LABELS` usage in the menu rendering (line ~2191-2208) to be dynamic based on context, and pass the renamed action type metadata (the actual `action_type` sent to engine remains `receive`, but the label changes).

### File: `supabase/functions/match-engine/index.ts`

**E. Failure system for interception/receive actions**

Replace the deterministic `findInterceptor` with a probabilistic `tryIntercept` that returns success/failure based on player attributes.

**Core logic in `resolveAction` / `findInterceptor`:**

For each candidate interceptor (sorted by progress along trajectory):

1. **Determine context** from ball holder's action type:
   - `move` → **Tackle contest**: attacker uses `drible + controle_bola + forca + agilidade`, defender uses `desarme + marcacao + controle_bola + forca`
   - `pass_low/pass_high/pass_launch` → **Ball control contest**: passer's `passe_baixo/alto + visao_jogo` influence base difficulty, receiver uses `controle_bola + tomada_decisao + agilidade + um_toque`. Pass difficulty varies: `pass_low` = easy (base 85% success), `pass_high` = harder (base 60%), `pass_launch` = medium (base 70%)
   - `shoot_controlled/shoot_power` → **Block/Save contest**: for field players: `antecipacao + agilidade + coragem + forca`. For GK: `reflexo + posicionamento_gol + um_contra_um + tempo_reacao`. If blocked, ball becomes loose (random deflection 3-8 units from block point)

2. **Calculate success probability:**
   ```
   attackerSkill = weighted average of attacker's relevant attrs (normalized 0-1)
   defenderSkill = weighted average of defender's relevant attrs (normalized 0-1)
   baseChance = contextBaseChance (e.g., 0.85 for pass_low, 0.60 for pass_high)
   successChance = baseChance * (0.5 + defenderSkill * 0.5) * (1 - attackerSkill * 0.3)
   // Clamp to [0.05, 0.95] — never 0% or 100%
   ```

3. **On failure:**
   - `move` tackle fails → ball stays with dribbler, dribble continues normally
   - Pass receive fails → ball continues trajectory, next interceptor gets a chance. If all fail, ball continues to end of trajectory (becomes loose if nobody is there)
   - Shot block fails → shot continues normally
   - GK save fails → shot continues (goal if it reaches the net)

4. **On success:**
   - `move` tackle succeeds → defender gets possession
   - Pass receive succeeds → interceptor gets ball
   - Shot block succeeds → ball deflects randomly and becomes **loose ball**
   - GK save succeeds → GK gets possession

**F. Shot block deflection**
When a field player successfully blocks a shot, compute a random deflection:
```
deflectAngle = random * 2π
deflectDist = 3 + random * 5
looseBallX = blockPoint.x + cos(deflectAngle) * deflectDist
looseBallY = blockPoint.y + sin(deflectAngle) * deflectDist
```
Set `nextBallHolderParticipantId = null` to create a loose ball situation.

**G. Sequential interception attempts**
When multiple players try to intercept the same ball path, process them in order of progress along the trajectory (existing sort). If the first one fails, the second gets a chance, and so on. This preserves the existing "first along the path" priority while adding failure probability.

**H. Event logs for failures**
Add descriptive event logs:
- "🦵 Desarme falhou!" / "🦵 Desarme bem-sucedido!"
- "❌ Falhou o domínio!" / "🤲 Bola dominada!"
- "🛡️ Bloqueio!" (+ loose ball) / "💨 Bloqueio falhou!"
- "🧤 Defesa do goleiro!" / "🧤 Goleiro não segurou!"

---

## Files Modified
1. `src/pages/MatchRoomPage.tsx` — Live ball preview on move, remove fixed markers, green cursor only on move, dynamic action labels
2. `supabase/functions/match-engine/index.ts` — Probabilistic interception system with attribute-based success/failure

