

# Plano: Melhorias no Match Engine (5 itens)

## Resumo dos Problemas e Soluções

### 1. Bola morta: portador não pode se mover, apenas passar/chutar (lateral = só passe)

**Problema**: Na bola morta, o portador tem opções de passe e chute, mas não diferencia lateral (só passe) de outros tipos. Além disso, o portador pode se mover no turno de posicionamento quando não deveria.

**Solução**:
- Adicionar campo `set_piece_type` ao `match_turns` (ou no payload/match_event_logs) para identificar se é `kickoff`, `throw_in`, `corner`, ou `goal_kick`
- Na engine (`match-engine/index.ts`), ao criar o turno após set piece, registrar o tipo de bola parada
- No cliente (`MatchRoomPage.tsx`), ler esse tipo e ajustar `getActionsForParticipant`:
  - **Lateral**: apenas `pass_low`, `pass_high`, `pass_launch` (sem chute)
  - **Kickoff/Corner/Tiro de meta**: `pass_low`, `pass_high`, `pass_launch`, `shoot_controlled`, `shoot_power`
  - Em TODOS os casos: sem `move`

**Mudanças**:
- Migration: `ALTER TABLE match_turns ADD COLUMN set_piece_type text DEFAULT NULL;`
- `match-engine/index.ts`: Ao criar turnos após set pieces, setar `set_piece_type`
- `MatchRoomPage.tsx`: Ler `set_piece_type` do turno ativo e filtrar ações

---

### 2. Ações dos bots não são visíveis antes da fase 4

**Problema**: Bots geram ações na engine (server-side) apenas quando a fase expira, mas o cliente não vê essas ações até a resolução. O humano precisa ver as setas dos bots nas fases 2 e 3 para tomar decisões.

**Solução**:
- Mover a geração de bot actions para **o momento da transição de fase**, não ao final. Quando a fase 1 termina e a fase 2 começa, as ações do bot na fase 1 já devem estar persistidas no banco (já estão — o problema é timing).
- O verdadeiro problema: a engine gera bot actions para a fase **corrente** antes de transicionar, mas essas ações são para a fase que está acabando. O cliente precisa fazer um reconcile após a transição.
- Verificar se `scheduleTurnActionsReconcile` é chamado quando a fase muda. Se o realtime listener não está capturando as inserções de bot actions corretamente, adicionar um reconcile forçado ao detectar mudança de fase.
- Garantir que bot actions são inseridas com status `pending` e aparecem no query do reconcile.

**Mudanças**:
- `match-engine/index.ts`: Garantir que bot actions são inseridas ANTES da transição de fase (já acontece, mas verificar timing)
- `MatchRoomPage.tsx`: Ao detectar mudança de fase via realtime, forçar `scheduleTurnActionsReconcile(true)` imediatamente

---

### 3. Passe e movimentação que acabam dentro do gol = gol

**Problema**: Um passe direcionado ao gol que ninguém intercepta é tratado como "bola solta" → OOB → tiro de meta, mas deveria ser gol. Da mesma forma, conduzir a bola para dentro do gol deveria ser gol.

**Solução**:
Na resolução da engine, após resolver passes e moves:
- Se o passe não foi interceptado e `nextBallHolderParticipantId === null`, verificar se `ballEndPos` está dentro da baliza (x ≤ 1 ou x ≥ 99, y entre 38 e 62)
- Se for passe alto, verificar se a parte vermelha (20-80%) coincide com a zona do gol; se sim, passou por cima
- Se for `move` e a posição final do portador está dentro da baliza, é gol (driblar o goleiro)
- Adicionar essa verificação **antes** do check de OOB

**Mudanças**:
- `match-engine/index.ts`: Adicionar lógica `checkPassOrMoveGoal()` antes do OOB detection na resolução
  - Para passes: se `ballEndPos` é gol e não houve interceptação → gol
  - Para moves: se posição final do portador entra na baliza → gol
  - Para passe alto: calcular se a zona vermelha coincide com o gol (se sim, passou por cima)

---

### 4. Linha de impedimento (Offside)

**Solução**:
- No início de cada turno de resolução, calcular a linha de impedimento para cada time: posição do penúltimo defensor
- Ao resolver passes, verificar se o recebedor estava em posição de impedimento no momento do passe
- Se impedimento: anular a jogada, bola parada para o time adversário

**Mudanças**:
- `match-engine/index.ts`: 
  - Função `isOffside(receiver, participants, possClubId, match)` que verifica se o recebedor está além do penúltimo defensor
  - Na resolução de passes, antes de atribuir posse ao recebedor, verificar impedimento
  - Se impedimento: criar turno de posicionamento + tiro de meta livre indireto
- `MatchRoomPage.tsx`: Exibir eventos de impedimento no log

---

### 5. Sistema de faltas no desarme

**Problema**: Atualmente o desarme tem dois resultados: sucesso ou falha. Precisa de um terceiro: falta.

**Solução**:
- No `computeInterceptSuccess` (tackle), adicionar chance de falta:
  - Se o desarme **falha**, há chance de ser falta baseada em atributos (coragem, desarme)
  - Fórmula: `foulChance = (1 - defenderSkill) * 0.35` — defensores ruins fazem mais faltas
  - Se falta: bola parada para o time atacante, na posição onde ocorreu

**Mudanças**:
- `match-engine/index.ts`:
  - Retornar `foul: boolean` do `computeInterceptSuccess`
  - Em `resolveAction`, tratar `foul=true`: parar jogada, criar evento de falta, atribuir tiro livre ao atacante
  - Futuramente: cartões amarelos/vermelhos baseados na severidade
- Migration: considerar tabela `match_cards` para registro de cartões (pode ser fase 2)
- `MatchRoomPage.tsx`: Exibir evento de falta no log, com ícone 🟡

---

## Detalhes Técnicos

### Migration necessária
```sql
ALTER TABLE match_turns ADD COLUMN set_piece_type text DEFAULT NULL;
```

### Arquivos a modificar
1. **`supabase/functions/match-engine/index.ts`** — Todas as 5 features (set_piece_type, bot visibility timing, pass/move goal, offside, fouls)
2. **`src/pages/MatchRoomPage.tsx`** — Features 1 (dead ball actions), 2 (bot action reconcile), e display de novos eventos
3. **Migration SQL** — Adicionar `set_piece_type` à tabela `match_turns`

### Ordem de implementação sugerida
1. Dead ball restrictions (mais simples, correção direta)
2. Bot action visibility (fix de timing crítico para jogabilidade)
3. Passe/move → gol (correção de regra de jogo)
4. Faltas (nova mecânica, mais impactante)
5. Impedimento (mais complexo, requer cálculo geométrico)

