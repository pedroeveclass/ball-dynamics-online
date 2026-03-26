

# Plano: Sistema de Zonas Táticas por Formação e Momento de Jogo

## Resumo
Substituir o sistema atual de âncora fixa + `ballShift` + `ROLE_ADVANCE_LIMIT`/`ROLE_RETREAT_LIMIT` por zonas retangulares definidas para cada slot de cada formação, em 3 momentos de jogo. Os bots ficam confinados dentro da sua zona e se posicionam em relação ao ponto ideal dentro dela.

## Arquivo alterado
`supabase/functions/match-engine-lab/index.ts`

## Estrutura de dados

Uma constante `FORMATION_ZONES` com a seguinte estrutura:

```text
FORMATION_ZONES[formação][momento][slotIndex] = {
  minX, maxX, minY, maxY,  // limites da zona
  idealX, idealY            // ponto ideal dentro da zona
}
```

Momentos: `defensive`, `transition`, `offensive`

### Zonas por formação (Home team, campo 0-100)

Baseado nas 8 imagens enviadas, cada slot terá zonas para os 3 momentos. Abaixo os slots por formação (GK sempre fixo: zona 2-18, 20-80):

**4-4-2** (11 slots: GK, LB, CB1, CB2, RB, LM, CM1, CM2, RM, ST1, ST2)
**4-3-3** (11 slots: GK, LB, CB1, CB2, RB, CM1, CM2, CM3, LW, ST, RW)
**4-2-3-1** (11 slots: GK, LB, CB1, CB2, RB, CDM1, CDM2, LW, CAM, RW, ST)
**3-5-2** (11 slots: GK, CB1, CB2, CB3, LWB, CM1, CM2, CM3, RWB, ST1, ST2)
**3-4-3** (11 slots: GK, CB1, CB2, CB3, LM, CM1, CM2, RM, LW, ST, RW)
**5-3-2** (11 slots: GK, LWB, CB1, CB2, CB3, RWB, CM1, CM2, CM3, ST1, ST2)
**5-4-1** (11 slots: GK, LWB, CB1, CB2, CB3, RWB, LM, CM1, CM2, RM, ST)
**4-1-4-1** (11 slots: GK, LB, CB1, CB2, RB, CDM, LM, CM1, CM2, RM, ST)

As coordenadas de cada zona serão extraídas visualmente das imagens fornecidas, mapeando as elipses coloridas (amarelo=defesa, azul=meio, vermelho/rosa=ataque, laranja=GK) para retângulos (minX, maxX, minY, maxY).

Para o time Away, espelhamento automático: `X → 100 - X`.

## Detecção de momento

```text
function detectGameMoment(isAttacking, ballX, isHome):
  SE não tem posse → 'defensive'
  SE tem posse E bola no terço defensivo → 'transition'
  SE tem posse E bola no meio-campo → 'transition'  
  SE tem posse E bola no terço ofensivo → 'offensive'
```

Terço defensivo (Home): ballX < 35. Terço ofensivo (Home): ballX > 65. Away invertido.

## Refatoração de `computeTacticalTarget`

1. Recebe `formation` e `slotIndex` como parâmetros adicionais
2. Usa `detectGameMoment` para determinar o momento
3. Busca a zona do slot naquele momento via `FORMATION_ZONES[formation][moment][slotIndex]`
4. Calcula alvo = ponto ideal da zona, com leve atração da bola (max 20% da largura da zona em X, 10% em Y)
5. Clampa ao retângulo da zona
6. Clampa ao `maxMoveRange` do jogador
7. Jitter mínimo (1 unidade) para evitar sobreposição exata

## O que é removido
- `ROLE_ADVANCE_LIMIT` e `ROLE_RETREAT_LIMIT` (substituídos pelos limites das zonas)
- `ballShiftX`/`ballShiftY` hardcoded (substituídos por atração proporcional ao tamanho da zona)
- `pushAmount`/`pullAmount` fixos por role (substituídos pela zona do momento correto)

## O que é mantido
- `computeMaxMoveRange` e clamp final de alcance
- Lógica específica do GK (posicionamento reativo ao chute)
- `getFormationAnchor` continua existindo para o fallback de bot fill e posicionamento inicial
- `FORMATION_POSITIONS` para preenchimento de bots

## Refatoração das chamadas
- `getFormationAnchor` passa a retornar também o `slotIndex` para que `computeTacticalTarget` saiba qual zona usar
- Todas as ~15 chamadas a `computeTacticalTarget` passam a incluir `formation` e `slotIndex`
- Formações não mapeadas fazem fallback para `4-4-2`

## Impacto
- Bots respeitam zonas táticas reais baseadas na formação escolhida pelo manager
- Posicionamento muda dinamicamente conforme o time ataca ou defende
- Elimina o problema de clustering/drift vertical
- Funciona para todas as 8 formações suportadas

