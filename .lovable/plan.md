
# Plano: Sistema de Zonas Táticas por Formação e Momento de Jogo

## Status: ✅ Implementado

## Resumo
Substituído o sistema de âncora fixa + `ballShift` + `ROLE_ADVANCE_LIMIT`/`ROLE_RETREAT_LIMIT` por zonas retangulares definidas para cada slot de cada formação, em 3 momentos de jogo (defensivo, transição, ofensivo).

## Formações implementadas
- 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-1-4-1

## Mudanças
- `FORMATION_ZONES`: zonas por formação × momento × slot (minX, maxX, minY, maxY, idealX, idealY)
- `detectGameMoment()`: detecta defensivo/transição/ofensivo baseado em posse e posição da bola
- `mirrorZone()`: espelha zonas para time Away
- `getFormationAnchor()`: agora retorna `slotIndex` além de x,y
- `computeTacticalTarget()`: usa zonas em vez de âncoras fixas, com atração moderada pela bola e clamp ao retângulo da zona
- Removidos: `ROLE_ADVANCE_LIMIT`, `ROLE_RETREAT_LIMIT`, `ballShiftX/Y`, `pushAmount/pullAmount`
