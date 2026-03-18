

# Plan: Multiple Feature Batch

This is a large set of changes spanning match engine mechanics, UI improvements, and new pages. I'll organize them by priority and area.

---

## 1. Match Engine Fixes (match-engine-lab + MatchRoomPage)

### 1A. Remove auto-domination by proximity
Currently in the engine resolution (`match-engine-lab/index.ts` ~line 1116-1151), when a pass lands and no interceptor succeeds, the engine finds the closest player within 8 units and gives them the ball automatically. **Fix:** Remove this proximity-based auto-domination. A pass to empty space should always result in a loose ball unless a player explicitly submitted a `receive` action on the trajectory.

### 1B. Fix loose ball inertia persistence
The engine already logs `ball_inertia` vs `ball_stopped` events, but the ball position after inertia isn't being persisted to the next turn's state. **Fix:** In the engine's resolution for loose ball turns, when inertia applies (first turn loose), compute the 15% drift position and store it as the ball's new coordinates. Add a `ball_x`/`ball_y` field to `match_turns` or use event log payload to persist the inertia drift position so the client can read it.

**Approach:** Use the `match_event_logs` payload to store `{ ball_x, ball_y }` for `ball_inertia` events. The client reads this on turn start to set `carriedLooseBallPos`.

### 1C. Positioning phase duration: 15s → 10s
Change `POSITIONING_PHASE_DURATION_MS` from 15000 to 10000 in both engine and client.

---

## 2. Bot Auto-fill for 11v11 (match-engine-lab)

When a match starts (`auto_start`), after creating participants from lineup slots, count players per side. If either side has < 11 players, insert bot `match_participants` to fill remaining slots using the club's formation positions. Each bot gets `is_bot: true`, no `connected_user_id`, and positioned per formation.

**Bot AI (no-action fallback):** At the end of each phase timer, before the engine processes the tick, any participant who hasn't submitted an action gets a bot-generated action:
- Ball holder with no action: pass to nearest teammate
- Attacking players with no action: move toward ball or hold position
- Defending players with no action: move toward ball carrier or hold formation

This logic goes in the engine's tick handler, right before resolution.

---

## 3. User Profile Page (new: `AccountProfilePage`)

Create `src/pages/AccountProfilePage.tsx` accessible at `/account/profile` (or reachable from both player/manager sidebars). Shows:
- Username (from `profiles` table)
- Email (from `supabase.auth.getUser()`)
- Password change form (uses `supabase.auth.updateUser({ password })`)

Add a "Perfil da Conta" link to both `AppSidebar` and `ManagerSidebar`. Add route in `App.tsx`.

---

## 4. Player Card Popup (Squad + Club pages)

### 4A. Manager Squad Page
Add click handler on each player row → opens a Dialog with player card showing: name, age, position, archetype, overall, dominant foot, reputation, energy (`energy_current`/`energy_max`), and attribute categories (physical, technical, mental, shooting). Fetch `player_attributes` on click.

### 4B. Player Club Page
The teammate click dialog already exists in `PlayerClubPage.tsx`. Add energy bar (`energy_current`/`energy_max`) to it by fetching from `player_profiles`.

---

## 5. Lineup Page Improvements

### 5A. Smaller field preview
Reduce the field preview container height (currently likely large). Set `max-h-[400px]` or similar constraint.

### 5B. Add 5 more formations
Add these to the `FORMATIONS` object: `3-5-2`, `3-4-3`, `5-3-2`, `5-4-1`, `4-1-4-1` (total 8 formations).

---

## 6. Merge Match Create into Challenges Page

Move the "create challenge" form from `ManagerMatchCreatePage` into `ManagerChallengesPage` as a collapsible section or dialog triggered by a "+" button. Remove the separate `/manager/match/create` route and sidebar entry.

---

## 7. Energy Regeneration (Midnight Cron)

Create an edge function `supabase/functions/energy-regen/index.ts` that:
- Queries all `player_profiles` where `energy_current < energy_max`
- For each, adds a random 15-35% of `energy_max` to `energy_current`, capped at `energy_max`
- Updates `player_profiles`

Schedule via `pg_cron` to run at midnight UTC daily.

---

## 8. Player Profile Page Fixes

### 8A. Show club name instead of ID
Fetch club name from `clubs` table using `club_id` and display it.

### 8B. Add "+" button placeholder
Add a disabled "+" button near the player name area with tooltip "Em breve: criar mais jogadores".

---

## 9. Matches Page (Player + Manager) - Past/Live/Upcoming sections

Restructure both `PlayerMatchesPage` and manager matches view:
- **Live/Starting Soon** (within 1h): highlighted cards at the top
- **Upcoming**: scheduled matches after the live section
- **Past matches**: collapsible accordion (closed by default) showing finished matches

---

## 10. Notifications Page

Currently the bell icon links to `/player` (dashboard). Create a dedicated `NotificationsPage` at `/player/notifications` (and `/manager/notifications`) that lists all notifications with read/unread state. Update bell icon links in `AppLayout` and `ManagerLayout`.

---

## 11. Match Duration & Time System

Configure official matches (non-lab, non-2v2) to fit within 1 hour real time:
- Each half = ~25 min real time (to fit in 1h with halftime)
- Halftime break = 5 min pause
- Display "match minute" (0-45 first half, 45-90 second half) mapped from turn number
- `MAX_TURNS` calculated to fit: ~4 phases × ~6s = ~24s per turn → ~62 turns per half → 124 total turns
- At turn 62 (halftime), pause the match for 5 min, log halftime event, then resume
- At turn 124, final whistle

Formula: `matchMinute = Math.floor((turnNumber / turnsPerHalf) * 45)` + offset for second half.

---

## Files Modified

1. `supabase/functions/match-engine-lab/index.ts` — Remove auto-domination, fix inertia persistence, bot fill, bot AI, positioning 10s, match time system
2. `src/pages/MatchRoomPage.tsx` — Positioning 10s, read inertia from event payload, match minute display
3. `src/pages/AccountProfilePage.tsx` — New file
4. `src/pages/ManagerSquadPage.tsx` — Player card dialog
5. `src/pages/PlayerClubPage.tsx` — Energy bar in teammate card
6. `src/pages/ManagerLineupPage.tsx` — Smaller field, 5 new formations
7. `src/pages/ManagerChallengesPage.tsx` — Inline challenge creation
8. `src/pages/PlayerProfilePage.tsx` — Club name, "+" button
9. `src/pages/PlayerMatchesPage.tsx` — Live/upcoming/past sections
10. `src/pages/NotificationsPage.tsx` — New file
11. `src/components/AppSidebar.tsx` — Add Account Profile + Notifications links
12. `src/components/ManagerSidebar.tsx` — Remove "Novo Convite", add Account Profile + Notifications
13. `src/components/AppLayout.tsx` — Bell icon → notifications page
14. `src/components/ManagerLayout.tsx` — Bell icon → notifications page
15. `src/App.tsx` — New routes
16. `supabase/functions/energy-regen/index.ts` — New edge function
17. DB migration — Add `ball_x`/`ball_y` to `match_turns` (or use event payload)

