

# Plano: Inteligência Tática dos Bots

## Problema Atual
Os bots têm decisões genéricas: portador chuta se perto do gol, passa para frente, ou dribla. Defensores se movem vagamente em direção à bola. Não há consciência de posição tática (zagueiro vs lateral vs volante vs meia vs atacante), formação, marcação individual ou comportamento de equipe.

## Solução: Sistema de IA Tática por Função

### Classificação de Função por Posição

Mapear `_slot_position` para uma **função tática** que determina o comportamento:

```text
GK           → goalkeeper
CB           → centerBack
LB, RB, LWB, RWB → fullBack
CDM          → defensiveMid
CM           → centralMid
CAM          → attackingMid
LM, RM       → wideMid
LW, RW       → winger
ST, CF       → striker
```

### Âncoras de Formação

Cada bot terá uma "posição âncora" baseada na formação do time (já temos `FORMATION_POSITIONS`). Em vez de usar `pos_x/pos_y` atual como referência, o bot calcula seu alvo relativo à **posição de formação base**, deslocada pelo contexto da bola.

```text
Posição Alvo = Posição Base Formação + Deslocamento pela Bola + Variação por Contexto
```

- **Deslocamento pela bola**: Time inteiro desloca 30% em X e 15% em Y em direção à bola
- **Compactação**: Em defesa, linhas se comprimem; em ataque, se expandem
- **Limite de afastamento**: Cada jogador não pode se afastar mais que ~15-20 unidades da âncora (varia por função)

### Comportamentos por Função

**Goleiro (GK)**:
- Sempre fica entre a bola e o centro do gol, dentro da área
- Posiciona-se lateralmente proporcional à posição Y da bola (30% de deslocamento)
- Com bola nos pés: passa para zagueiro mais livre ou volante próximo; lançamento longo apenas se atacante estiver muito isolado (>20u de distância do defensor mais próximo)
- Nunca dribla, nunca chuta (exceto tiro de meta)

**Zagueiros (CB)**:
- Mantêm linha defensiva coordenada entre si (mesmo X aprox.)
- Limite de avanço: máximo até meio-campo (x≤50 home / x≥50 away)
- Prioridade defensiva: marcação, desarme, bloqueio
- Com bola: passe curto para volante/lateral; nunca dribla, raramente lança
- Sem bola + ataque adversário: recuam para formar linha, marcam atacante mais próximo
- Nunca abandonam a defesa mesmo com time atacando

**Laterais (LB/RB/LWB/RWB)**:
- Podem avançar pela lateral (até x~65 home / x~35 away) durante ataques
- Em defesa, voltam à linha dos zagueiros
- Com bola: passes curtos/cruzamentos; podem driblar na lateral
- Prioridade defensiva: marcam pontas adversários

**Volantes (CDM)**:
- Suporte defensivo + iniciam jogadas
- Limite de avanço: x≤55 home / x≥45 away
- Com bola: distribuem passes curtos e lançamentos
- Sem bola: marcam meias adversários, cobrem espaços entre zaga e meio
- Podem desarmar

**Meias Centrais (CM)**:
- Híbridos: avançam no ataque, voltam na defesa
- Limite: até x~65 home / x~35 away
- Com bola: passes para atacantes, chutes de meia distância ocasionais
- Sem bola (defesa): marcam CM/CAM adversários

**Meias Ofensivos (CAM/LM/RM)**:
- Focados em criar jogadas
- Avançam mais (até x~75 home / x~25 away)
- Com bola: dribles, passes decisivos, chutes de fora da área
- Defesa: marcam volantes adversários, voltam pouco

**Pontas (LW/RW)**:
- Posicionam-se nas laterais avançadas
- Cortam para dentro quando perto do gol
- Devem ficar atentos ao impedimento: não ultrapassar penúltimo defensor

**Atacantes (ST/CF)**:
- Mais avançados, entre os zagueiros adversários
- Com bola: chutam, dribam, finalizam
- Sem bola: se posicionam para receber passes, cuidam do impedimento
- Marcação mínima: apenas pressionam zagueiros quando saem com bola
- Limite de recuo: não voltam além do meio-campo

### Bola Solta

- No máximo **2 jogadores por time** disputam bola solta (os 2 mais próximos)
- Restante mantém posição de formação
- Zagueiros: preocupados em marcar atacantes adversários
- Atacantes: se posicionam para contra-ataque

### Marcação Individual

Em defesa, cada bot (exceto GK) busca o adversário mais próximo da sua zona para marcar:
- Zagueiros marcam atacantes
- Laterais marcam pontas
- Volantes marcam meias

A marcação não é 1:1 rígida, é por zona: o defensor se posiciona entre o adversário e o próprio gol.

### Decisão do Portador (aprimorada)

O portador agora decide baseado na função:
1. **GK**: passe curto para defensor mais livre (sempre)
2. **CB**: passe curto/lançamento para volante/lateral (nunca dribla)
3. **Lateral**: passe curto ou cruzamento se avançado; recua se pressionado
4. **Volante**: distribui; passe longo se atacante livre
5. **Meia**: dribla se tem espaço; passa se pressionado; chuta se <30u do gol
6. **Atacante**: chuta se <25u; dribla se tem 1v1; passa se bloqueado

---

## Detalhes Técnicos

### Arquivos a modificar
1. **`supabase/functions/match-engine-lab/index.ts`** — Reescrever `generateBotActions` completamente (~300 linhas)
2. **`supabase/functions/match-engine/index.ts`** — Mesma reescrita para consistência

### Funções auxiliares novas
- `getPositionRole(slotPos: string): TacticalRole` — mapeia posição para função
- `getFormationAnchor(participant, formation, isHome): {x, y}` — posição âncora da formação
- `computeTacticalTarget(bot, role, context): {x, y, actionType}` — calcula alvo tático
- `pickBestPassTarget(bot, teammates, role, context): Participant | null` — escolhe alvo de passe por função
- `shouldChaseLooseBall(bot, ballPos, teammates): boolean` — limita a 2 jogadores por time

### Ordem de implementação
1. Criar mapa de funções táticas e âncoras de formação
2. Reescrever decisão do portador por função
3. Reescrever movimento de ataque (formação + avanço por função)
4. Reescrever defesa (marcação por zona + linha defensiva)
5. Bola solta (limitar a 2 por time)
6. Aplicar mesma lógica na engine 11x11

