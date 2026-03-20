

# Plano: Precisão de Passes/Chutes, Toque de Primeira, UI e Efeitos Sonoros

## 1. Aumentar dificuldade de passes e chutes (Engine)

**Problema**: A curva de desvio atual (`computeDeviation`) é muito branda. Jogadores com skill alto raramente erram, mesmo em distâncias extremas. Passes rasteiros longos são quase perfeitos.

**Solução**: Reescrever `computeDeviation` na `match-engine-lab` com:
- **Fator de distância exponencial**: `(dist/100)^1.4` em vez de linear
- **Desvio mínimo proporcional à distância**: Mesmo skill 99 tem 15-25% de chance de desvio significativo em distâncias longas
- **Multiplicadores mais agressivos por tipo**:
  - `pass_low`: curto (≤20) = fácil, longo (>35) = desvio crescente exponencialmente
  - `pass_high`: multiplicador de dificuldade de 7→10, skill^2.5 em vez de skill^3.5
  - `pass_launch`: multiplicador 6→9
  - `shoot_controlled`: multiplicador 4→7, penalidade por distância ao gol (>25 units = exponencial)
  - `shoot_power`: mantém agressivo
- **Random floor**: Adicionar desvio mínimo aleatório (`0.3 + random * 0.5`) para TODOS os tipos, representando imprevisibilidade real — até jogadores perfeitos variam
- **Fórmula proposta**: `deviationRadius = (distFactor * diffMultiplier * (1 - skill^2.5) + minRandomDeviation) * (0.5 + random * 0.5)`

**Arquivo**: `supabase/functions/match-engine-lab/index.ts` — função `computeDeviation`

---

## 2. Toque de primeira não funciona (Engine)

**Problema**: O cliente envia `receive` com payload `{one_touch: true, next_action_type, next_target_x, next_target_y}`, mas a engine ignora completamente esse payload durante a resolução. A ação é processada como um `receive` normal.

**Solução**: Na resolução da engine, após um `receive` bem-sucedido que tem payload `one_touch`:
1. Detectar se a ação de `receive` vencedora tem payload com `one_touch: true`
2. Se sim, automaticamente criar e inserir uma ação de follow-up (o `next_action_type`) no banco para o próximo turno como fase `ball_holder` — sem precisar de input
3. Marcar o jogador como ball holder E já ter a ação de bola submetida
4. Alternativamente (mais simples): no mesmo turno de resolução, executar a ação de follow-up inline logo após resolver o receive

**Abordagem escolhida**: Na resolução, quando um jogador que submeteu `receive` com payload `one_touch` ganha a disputa pela bola, a engine:
- Seta esse jogador como `nextBallHolderParticipantId`
- Insere automaticamente uma ação pendente com `next_action_type`, `next_target_x/y` para o próximo turno
- O turno seguinte já tem a ação do portador e pula direto pro `attacking_support`

**Arquivo**: `supabase/functions/match-engine-lab/index.ts` — após `findLooseBallClaimer` e após resolução de passes bem-sucedidos

---

## 3. Reset de posições após gol (Engine)

**Problema**: Após um gol, o turno de posicionamento começa mas os jogadores ficam onde estavam (espalhados no ataque/defesa). 

**Solução**: Quando `nextSetPieceType === 'kickoff'` (gol marcado), a engine realoca TODOS os participantes para suas posições de formação inicial:
- Buscar formação de cada time (`club_settings.default_formation`)
- Para cada participante, calcular posição da formação base
- Home: posições normais, clamped a x≤48
- Away: posições espelhadas, clamped a x≥52
- Atualizar `match_participants.pos_x/pos_y` em batch

**Arquivo**: `supabase/functions/match-engine-lab/index.ts` — no bloco de gol (tanto chute quanto passe/condução), antes de criar o turno de posicionamento

---

## 4. Círculo de distância para faltas e pênaltis (Engine + UI)

**Problema**: Não há barreira visual em faltas e faltas na área não viram pênalti.

**Solução**:
- **Engine**: Ao detectar falta, verificar se a posição está dentro da grande área adversária (x≤18 ou x≥82, y entre 20-80). Se sim, converter em pênalti:
  - Posicionar bola na marca do pênalti (x=12/88, y=50)
  - `set_piece_type = 'penalty'`
  - O batedor é o jogador que sofreu a falta
- **UI**: Para `set_piece_type === 'free_kick'`, desenhar um círculo SVG de raio ~9 unidades ao redor da bola. Adversários no posicionamento não podem entrar nesse raio (enforçar na engine durante posicionamento)
- **UI para pênalti**: Sem posicionamento, o batedor chuta direto

**Arquivos**: `match-engine-lab/index.ts` + `MatchRoomPage.tsx`

---

## 5. Esconder ação de bot quando humano já agiu (UI)

**Problema**: Após o humano fazer uma ação na fase 1, a seta do bot para o mesmo participante continua aparecendo visualmente.

**Solução**: No `MatchRoomPage.tsx`, ao renderizar setas de ações (`turnActions`), filtrar ações de bot para participantes que o jogador humano controla quando já existe uma ação humana para esse participante na mesma fase.

**Arquivo**: `MatchRoomPage.tsx` — na renderização de setas de ações

---

## 6. Efeitos sonoros simples

**Solução**: Criar um módulo `src/lib/sounds.ts` com Web Audio API ou `<audio>` pré-carregados para:
- Chute: som curto de impacto
- Passe: som de toque na bola
- Gol: celebração curta
- Apito (falta, impedimento, início)
- Transição de fase: som sutil de tick

Usar sons gerados proceduralmente via Web Audio API (osciladores + envelopes) para não depender de arquivos externos. Chamar a função de som nos pontos relevantes do `MatchRoomPage.tsx` (ao receber eventos via realtime, ao submeter ação, etc).

**Arquivos**: Novo `src/lib/sounds.ts` + `MatchRoomPage.tsx`

---

## 7. Redesign do TurnWheel (UI)

**Problema**: O circle wheel atual é funcional mas pouco moderno.

**Solução**: Redesenhar como uma **barra horizontal segmentada** (4 segmentos inline) com:
- Cada fase como um bloco/pill
- Fase ativa com cor vibrante + animação de progresso (barra interna)
- Fases passadas com checkmark
- Fases futuras em cinza sutil
- Timer em destaque ao lado
- Mais compacto que o circle, melhor legibilidade

**Arquivo**: `MatchRoomPage.tsx` — componente `TurnWheel`

---

## 8. Mover relógio de jogo para perto do placar + Contraste (UI)

**Problema**: Relógio no campo é desconectado do placar. Nomes dos times no sidebar são ilegíveis com certas cores. Log difícil de ler.

**Solução**:
- Mover `matchMinute` e `half` para o scoreboard bar (top bar), ao lado do placar
- Remover overlay do relógio no campo
- Melhorar contraste: usar `text-foreground` em vez de `text-muted-foreground` para nomes de times
- Log: usar `text-foreground/80` em vez de `text-muted-foreground`
- TurnWheel: usar contraste alto para nome do time com posse

**Arquivo**: `MatchRoomPage.tsx`

---

## 9. Ajustar turnos por tempo para durar 1 hora (Engine + UI)

**Problema**: Com fases de 10s (posicionamento) + 6s (ação) + 3s (resolução), cada turno dura ~25-27s. 124 turnos = ~54min sem contar posicionamentos extras (faltas, gols, etc). 

**Cálculo**: Tempo médio por turno com fases de 10s: ~(10+10+6+6+6+3) = 41s por turno (worst case com posicionamento). Sem posicionamento: 6+6+6+3 = 21s. Mistura realista: ~25s médio. Para 1h (3600s): 3600/25 = 144 turnos → ~72 por tempo.

Mas a fase de ação NÃO é 10s, revisando: as fases ball_holder, attacking_support, defending_response são 6s cada (no engine é `PHASE_DURATION_MS = 6000`), e no client `PHASE_DURATION = 6`. Posicionamento é 10s. Resolução é 3s.

**Solução**: Recalcular:
- Turno normal: 6+6+6+3 = 21s
- Turno com posicionamento: 10+10+6+6+6+3 = 41s  
- Assumindo ~20% turnos com posicionamento: média = 21*0.8 + 41*0.2 = 25s
- Para 3600s total (incluindo 300s intervalo): 3300/25 = 132 turnos → 66 por tempo
- Manter 62 turnos por tempo (124 total), que dá ~51-55min, está adequado
- Se quer exatamente 1h, ajustar para 72 turnos por tempo (144 total)

Atualizar `TURNS_PER_HALF` e `MAX_TURNS` em ambos engine e client para 72/144.

**Arquivos**: `match-engine-lab/index.ts` + `MatchRoomPage.tsx`

---

## Detalhes Técnicos

### Arquivos a modificar
1. **`supabase/functions/match-engine-lab/index.ts`**: Items 1-4, 9
2. **`src/pages/MatchRoomPage.tsx`**: Items 4-5, 6-9
3. **Novo `src/lib/sounds.ts`**: Item 6

### Ordem de implementação
1. Precisão de passes/chutes (impacto imediato na gameplay)
2. Toque de primeira (fix de funcionalidade quebrada)
3. Reset de posições após gol
4. Faltas → pênalti + círculo de barreira
5. Esconder bot actions duplicadas no UI
6. Contraste + relógio no placar + turnos
7. Redesign TurnWheel
8. Efeitos sonoros

