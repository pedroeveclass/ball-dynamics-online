

# Plano: Validar distância física para desarmes, interceptações e recepções

## Problema
Bots conseguem realizar desarmes e interceptações "impossíveis" porque a engine nunca valida se o jogador consegue fisicamente chegar ao ponto de interceptação. Isso afeta desarmes, bloqueios, defesas de goleiro e potencialmente domínio de passes.

Três falhas específicas:

1. **`findInterceptorCandidates`** — verifica apenas se o alvo do `receive` está perto da trajetória da bola (threshold 2 unidades), mas nunca calcula se o interceptador consegue se mover até aquele ponto com base no seu `maxMoveRange`.

2. **Clamp de ações** — só aplica limitação de distância para ações `move`, ignorando completamente ações `receive`. Um bot pode submeter um `receive` a 50 unidades de distância e a engine aceita.

3. **Decisão defensiva dos bots** — usa `bhDist < 12` como limite arbitrário que não corresponde ao alcance real do jogador.

## Correções (arquivo único: `supabase/functions/match-engine-lab/index.ts`)

### 1. Validar alcance físico em `findInterceptorCandidates`
Para cada candidato a interceptação, calcular a distância entre a posição atual do jogador e o ponto de interceptação (`interceptX`, `interceptY`). Buscar os atributos do jogador e calcular seu `computeMaxMoveRange`. Rejeitar candidatos cuja distância exceda o alcance.

Isso corrige desarmes, bloqueios, defesas E domínio de passes de uma vez — todas essas ações passam por `findInterceptorCandidates`.

### 2. Estender clamp para ações `receive`
Na linha 932, mudar o filtro de `action.action_type === 'move'` para `action.action_type === 'move<lov-plan>

# Plano: Validar distância física para desarmes, interceptações e recepções

## Problema
Bots conseguem realizar desarmes e interceptações "impossíveis" porque a engine nunca valida se o jogador consegue fisicamente chegar ao ponto de interceptação. Isso afeta desarmes, bloqueios, defesas de goleiro e potencialmente domínio de passes.

Três falhas específicas:

1. **`findInterceptorCandidates`** — verifica apenas se o alvo do `receive` está perto da trajetória da bola (threshold 2 unidades), mas nunca calcula se o interceptador consegue se mover até aquele ponto com base no seu `maxMoveRange`.

2. **Clamp de ações** — só aplica limitação de distância para ações `move`, ignorando completamente ações `receive`. Um bot pode submeter um `receive` a 50 unidades de distância e a engine aceita.

3. **Decisão defensiva dos bots** — usa `bhDist < 12` como limite arbitrário que não corresponde ao alcance real do jogador.

## Correções (arquivo único: `supabase/functions/match-engine-lab/index.ts`)

### 1. Validar alcance físico em `findInterceptorCandidates`
Para cada candidato a interceptação, calcular a distância entre a posição atual do jogador e o ponto de interceptação (`interceptX`, `interceptY`). Buscar os atributos do jogador e calcular seu `computeMaxMoveRange`. Rejeitar candidatos cuja distância exceda o alcance.

Isso corrige desarmes, bloqueios, defesas E domínio de passes de uma vez — todas essas ações passam por `findInterceptorCandidates`. A função precisa receber o `turnNumber` e o mapa de atributos como parâmetros adicionais.

### 2. Estender clamp para ações `receive`
Na linha 932, mudar o filtro de `action.action_type === 'move'` para incluir `'receive'` também. Assim, mesmo ações de `receive` submetidas por humanos ou bots são limitadas ao alcance real do jogador.

### 3. Corrigir limites de decisão dos bots defensivos
Substituir `bhDist < 12` (linha 802) e qualquer outro threshold arbitrário por comparação direta com `maxMoveRange` do bot. O bot só tenta desarme se `bhDist <= maxMoveRange`.

## Impacto em outras mecânicas
- **Dominar passes**: Passa por `findInterceptorCandidates`, então a mesma validação de alcance se aplica automaticamente — jogadores longe demais não conseguirão "dominar" um passe que não alcançam.
- **Defesa do goleiro**: A lógica do GK na linha 776 já usa `distToIntercept <= maxMoveRange`, então está correta. A validação adicional em `findInterceptorCandidates` serve como segunda camada de segurança.
- **One-touch / toque de primeira**: Não é afetado, pois usa injeção direta de ação, não passa por interceptação.
- **Bola solta**: Ações de `receive` para bola solta também serão corretamente limitadas pelo clamp.

## Detalhes técnicos
- `computeMaxMoveRange` já existe e calcula o alcance real com base em velocidade, aceleração, agilidade, stamina e turno.
- `findInterceptorCandidates` precisará receber parâmetros extras: `turnNumber` e referência aos atributos dos participantes para calcular o range de cada candidato.
- Todas as chamadas a `findInterceptorCandidates` (linhas 1209 e 1310) precisarão ser atualizadas para passar esses novos parâmetros.

