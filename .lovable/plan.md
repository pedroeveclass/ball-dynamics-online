
Plano de implementação

1. Travar corretamente o “toque de primeira” no turno seguinte
- Ajustar a MatchRoom para não abrir o menu da Fase 1 quando o portador da bola já tiver uma ação automática injetada pelo toque de primeira no turno atual.
- Bloquear isso em dois lugares: auto-abertura do menu e clique manual no jogador.
- Fazer a tela reconhecer explicitamente ações com `payload.one_touch_executed` como “ação já consumida”.

2. Centralizar tudo em uma engine única
- Tornar `match-engine-lab` a única engine real de jogo para 3x3, 11x11, amistoso e oficial.
- Atualizar o seletor cliente (`src/lib/matchEngine.ts`) para usar lab como padrão real e remover dependência prática da engine antiga.
- Preservar a engine antiga apenas como referência legada/desativada no código, sem continuar como fonte ativa de lógica divergente.

3. Reescrever a lógica defensiva dos bots
- Hoje os bots defensivos estão quase sempre só andando; por isso não roubam bola e o goleiro não entra nas disputas corretamente.
- Vou fazer defensores e goleiros gerarem ações reais de disputa (`receive` nos pontos de interceptação/roubo/defesa) quando a bola estiver fisicamente alcançável.
- Manter movimento tático apenas como fallback quando não houver disputa possível.

4. Corrigir de vez o posicionamento absurdo para cima
- Refazer o cálculo de alvo tático dos bots para reduzir drasticamente o arrasto vertical.
- Fortalecer âncoras de formação, limitar deslocamento em Y por faixa/posição, remover aleatoriedade excessiva e usar separação entre companheiros para evitar amontoamento.
- Corrigir também o fallback de âncora quando slot/posição não vier bem preenchido, para não empurrar vários atletas para a mesma faixa.

5. Aumentar novamente a distância de movimento
- Subir quase ao dobro o alcance atual de movimento.
- Aplicar a mesma regra no backend e na UI para a seta/preview bater com a resolução real.
- Manter a penalidade de aproximadamente 15% para quem está com a bola, além da restrição já existente de movimento pós-ação de bola.

6. Eliminar divergência entre seta mostrada e posição final
- Parar de depender só do alvo bruto da ação para animação/finalização.
- Fazer a resolução expor ou reutilizar a coordenada final realmente aplicada ao jogador, para a UI desenhar exatamente o destino resolvido e não uma aproximação.

Arquivos principais
- `src/pages/MatchRoomPage.tsx`
- `src/lib/matchEngine.ts`
- `supabase/functions/match-engine-lab/index.ts`
- `supabase/functions/match-engine/index.ts` (apenas para desativação/legado, não como engine viva)

Detalhes técnicos
- O problema do toque de primeira está na UI: a Fase 1 ainda autoabre menu só porque o jogador virou portador, sem checar se já existe ação automática pendente para ele.
- O problema de roubo/defesa dos bots está na engine: a resolução considera interceptadores via `receive`, mas a IA defensiva atual em `defending_response` quase sempre envia só `move`.
- O arrasto para o topo ainda não está resolvido apenas com `ballShiftY = 0.05`; o cálculo de alvo/âncora precisa ser refeito, com clamp por corredor e menos jitter aleatório.
- A unificação para lab já está parcialmente encaminhada no projeto atual, porque o cliente já aponta para `match-engine-lab`; falta remover a dependência residual da engine original e parar de manter duas lógicas vivas.
- Na implementação, vou aplicar tudo primeiro na lab e deixar a antiga somente como legado desativado, para evitar voltar a ter correções em duplicidade.
