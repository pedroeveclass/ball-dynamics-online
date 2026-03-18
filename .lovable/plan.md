

# Plan: Multiple Gameplay Systems Overhaul

This is a large multi-feature request spanning onboarding, training, match mechanics, and bot AI. I'll break it into 5 distinct implementation phases.

---

## Phase 1: GK-Specific Body Types + Player Height Attribute

### GK Body Types
Replace the 6 field body types with 3 GK-specific ones when position is GK:

| Body Type | Description | Boosts |
|-----------|-------------|--------|
| **Goleiro Completo** | Equilibrado em todos os atributos de goleiro | Balanced GK attrs +3-4 |
| **Goleiro Felino** | Ágil, reflexos rápidos, bom 1v1, saídas | reflexo +7, um_contra_um +6, saida_gol +5, agilidade +5, tempo_reacao +4 |
| **Goleiro Muralha** | Alto, dominante na área, forte em cruzamentos | defesa_aerea +7, comando_area +6, pegada +5, pulo +5, forca +4 |

**Files changed:**
- `src/lib/attributes.ts` — Add `GK_BODY_TYPES` array + boosts, update `generateBaseAttributes` to use them
- `src/pages/OnboardingPlayerPage.tsx` — Show `GK_BODY_TYPES` when `isGK`, show `BODY_TYPES` otherwise

### Player Height (Tamanho)
Add a "Tamanho" selection step (or within Identity step) with ~5 options mapped to height ranges:

| Height | Label | Impact |
|--------|-------|--------|
| Muito Baixo (≤168cm) | +6 velocidade, +5 agilidade, +4 aceleracao, -5 cabeceio, -4 pulo, -3 forca |
| Baixo (169-174cm) | +3 velocidade, +3 agilidade, -2 cabeceio, -2 pulo |
| Médio (175-180cm) | Balanced, no modifiers |
| Alto (181-187cm) | +3 cabeceio, +3 pulo, +2 forca, -2 velocidade, -2 agilidade |
| Muito Alto (≥188cm) | +6 cabeceio, +5 pulo, +4 forca, -5 velocidade, -4 agilidade, -3 aceleracao |

**Files changed:**
- `src/lib/attributes.ts` — Add `HEIGHT_OPTIONS` array + `heightBoosts` map, integrate into `generateBaseAttributes`
- `src/pages/OnboardingPlayerPage.tsx` — Add height selection in step 0 or new step, store in state
- **DB migration** — Add `height` column (text) to `player_profiles` table

---

## Phase 2: Attribute Quality Tiers + Training Scaling

### Quality Tiers
Define attribute quality categories in `src/lib/attributes.ts`:

| Range | Tier | Label (PT) |
|-------|------|------------|
| 95-99 | Star Quality | Qualidade Estrela ⭐ |
| 90-94.99 | Supremo | Supremo |
| 85-89.99 | Excepcional | Excepcional |
| 80-84.99 | Excelente | Excelente |
| 70-79.99 | Bom | Bom |
| 60-69.99 | Razoável | Razoável |
| 50-59.99 | Mediano | Mediano |
| 40-49.99 | Fraco | Fraco |
| 30-39.99 | Ruim | Ruim |
| 10-29.99 | Péssimo | Péssimo |

### Training Growth Scaling by Tier
The core idea: higher attribute value → harder to grow, combined multiplicatively with the existing age-based `growthRate`.

| Tier | Training Multiplier |
|------|-------------------|
| Péssimo (10-30) | 2.0x |
| Ruim (30-40) | 1.6x |
| Fraco (40-50) | 1.3x |
| Mediano (50-60) | 1.0x |
| Razoável (60-70) | 0.75x |
| Bom (70-80) | 0.5x |
| Excelente (80-85) | 0.35x |
| Excepcional (85-90) | 0.22x |
| Supremo (90-95) | 0.12x |
| Star Quality (95-99) | 0.06x |

So: `finalGrowth = baseRoll * ageMultiplier * tierMultiplier`

A player with a "Péssimo" attribute and 150% age bonus: `roll * 1.5 * 2.0 = very high growth`
A player with a "Star Quality" attribute and 80% age bonus: `roll * 0.8 * 0.06 = tiny growth`

**Files changed:**
- `src/lib/attributes.ts` — Add `getAttributeTier()`, `getTierLabel()`, `getTrainingTierMultiplier()` functions
- `src/pages/PlayerAttributesPage.tsx` — Show tier label + color next to each attribute, integrate tier multiplier into `handleTrain`
- `src/components/AttributeBar.tsx` — Optionally show tier label
- `src/components/PlayerCardDialog.tsx` — Show tier labels

---

## Phase 3: One-Touch Actions (Toque Único)

### Concept
During Phase 2 (attacking_support), a teammate receiving a pass can choose to **pass or shoot directly** instead of just "dominar". This is a "first-touch play" with higher failure chance but creates tempo advantage.

### Client Changes (`MatchRoomPage.tsx`)
- In the intercept/domination menu, when a teammate clicks on an incoming pass trajectory, add options: `PASSE RASTEIRO (1ª)`, `PASSE ALTO (1ª)`, `LANÇAMENTO (1ª)`, `CHUTE CONTROLADO (1ª)`, `CHUTE FORTE (1ª)` alongside `DOMINAR BOLA`
- These submit a special action type like `one_touch_pass_low`, `one_touch_shoot_controlled`, etc. (or the same type with a payload flag `{ one_touch: true }`)
- Visual: same arrow drawing flow but with a distinct badge/indicator

### Engine Changes (`match-engine-lab/index.ts`)
- Detect one-touch actions during resolution
- Apply higher failure penalty (~30-40% accuracy reduction based on `um_toque` attribute)
- If one-touch succeeds:
  - The action (pass/shot) is resolved immediately as the ball action for the **next turn's Phase 1** — Phase 1 is skipped (already has an action)
  - All players in Phase 2 and Phase 3 of the next turn get only **50% movement range**
- If one-touch fails:
  - Ball becomes loose at the player's position
- Store `one_touch: true` in action payload for the engine to process

### DB Changes
- Add `payload` usage for one-touch flag (already exists as jsonb column)

---

## Phase 4: Ball Height Impact on Contests

### Concept
When contesting a ball at different trajectory heights (green/yellow/red zones), height-related attributes should factor in.

### Engine Changes (`match-engine-lab/index.ts`)
In `computeInterceptSuccess`, detect the trajectory segment height based on `t` parameter along the ball path:

- **Green zone (pass_low, or low portions of pass_high/launch):** Normal contest as today
- **Yellow zone (mid-height portions):** Add height-related attribute bonuses:
  - `cabeceio`, `pulo`, `forca`, `defesa_aerea` give defenders a bonus/penalty
  - Shorter players get a penalty (~-10-15% success), taller players get a bonus (~+10-15%)
  - Need to look up player height from `player_profiles.height`
- **Red zone:** Already blocked — no interception possible (keep as-is)

**Files changed:**
- `supabase/functions/match-engine-lab/index.ts` — Modify `computeInterceptSuccess` to accept ball height context, adjust probabilities based on `cabeceio`/`pulo` + player height

---

## Phase 5: Bot AI Improvements

### Current State
Bots are very basic: ball holder passes to nearest teammate, others drift slightly toward ball. No tactical awareness.

### Improved Bot Logic (`match-engine-lab/index.ts` → `generateBotActions`)

**Ball Holder Bot (Phase 1):**
- If near opponent goal (x > 70 for home, x < 30 for away): attempt `shoot_controlled` or `shoot_power` based on distance
- If in midfield: pass to most forward open teammate (prefer `pass_low`)
- If in own half (defense): safe `pass_low` to nearest teammate, prioritize moving ball forward
- Add dribble attempts when 1v1 near goal

**Attacking Support Bots (Phase 2):**
- Move toward formation-adjusted positions that shift with ball position (block movement)
- If close to ball trajectory: attempt `receive` (dominar) if teammate's pass

**Defending Bots (Phase 3):**
- If ball carrier is dribbling nearby: attempt `receive` (tackle/desarme)
- GK bot: if shot incoming, attempt `receive` (defend) at trajectory intersection
- Others: move to cover passing lanes or press ball carrier
- Maintain formation shape relative to ball position (compact defense)

**Formation-Aware Movement:**
- Calculate "shifted formation" based on ball position: when ball is on left, entire formation shifts left
- Each bot targets its shifted formation position + small adjustment toward ball
- Apply block movement: defense line stays together, midfield stays together

**Files changed:**
- `supabase/functions/match-engine-lab/index.ts` — Major rewrite of `generateBotActions` function

---

## Implementation Order

1. **Phase 1** (GK body types + height) — Independent, affects onboarding only
2. **Phase 2** (Quality tiers + training) — Independent, affects attributes display + training
3. **Phase 5** (Bot AI) — Independent, engine-only changes
4. **Phase 4** (Ball height contests) — Requires height in DB from Phase 1
5. **Phase 3** (One-touch) — Most complex, touches client + engine + action flow

### DB Migrations Needed
- Add `height` text column to `player_profiles` (default `'Médio'`)

