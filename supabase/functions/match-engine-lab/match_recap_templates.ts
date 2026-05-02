// Match Recap narrative system (Deno).
// Templates + classifier + fact extractor + persister, all callable from
// the engine's final_whistle handler. Deno can't read src/i18n JSONs, so
// the PT/EN strings live inline here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Bucket types ──
export type MatchRecapBucket =
  | 'red_card_decided'
  | 'penalty_decided'
  | 'comeback'
  | 'late_winner'
  | 'rout'
  | 'jogao'
  | 'comfortable_win'
  | 'narrow_win'
  | 'draw_goalfest'
  | 'draw_low';

export interface MatchRecapFacts {
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  stadium: string | null;
  round: number | null;
  topScorerName: string | null;
  topScorerGoals: number;
  lateScorerName: string | null;
  lateMinute: number | null;
  redCardPlayerName: string | null;
  redCardLoserSide: boolean; // true = the red went to the losing side (decisive)
  hasComeback: boolean;
  decisivePenaltyScorer: string | null;
}

// ── PT templates: 20 per bucket ──
const TEMPLATES_PT: Record<MatchRecapBucket, string[]> = {
  red_card_decided: [
    "{loser} ficou com um a menos cedo após expulsão de {red_card_player} e perdeu para {winner} por {winner_goals} a {loser_goals}. Os mandantes administraram a vantagem numérica e levaram os três pontos sem grandes sustos.",
    "Com {red_card_player} expulso ainda no primeiro tempo, {loser} viu {winner} controlar o jogo e fechar em {winner_goals}-{loser_goals}. A diferença numérica fez o estrago.",
    "{winner} aproveitou a expulsão de {red_card_player} e bateu {loser} por {winner_goals} a {loser_goals}. Foi um daqueles jogos em que o cartão vermelho mudou o roteiro.",
    "Vermelho de {red_card_player} mudou o jogo: {winner} venceu {loser} por {winner_goals}-{loser_goals} explorando o espaço deixado pelo adversário.",
    "Após a expulsão de {red_card_player}, {loser} não conseguiu reagir e {winner} confirmou {winner_goals} a {loser_goals} sem dificuldade.",
    "Jogo decidido cedo no cartão: {red_card_player} foi pra rua, {winner} cresceu e venceu {loser} por {winner_goals}-{loser_goals}.",
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo marcado pela expulsão de {red_card_player}, que deixou o time desfalcado pelo restante da partida.",
    "Os 11 contra 10 fizeram diferença: {winner} bateu {loser} por {winner_goals}-{loser_goals} depois que {red_card_player} foi expulso e os mandantes pegaram o ritmo.",
    "Com um a mais desde a expulsão de {red_card_player}, {winner} cuidou do jogo e venceu {loser} por {winner_goals} a {loser_goals}.",
    "{winner} {winner_goals} x {loser_goals} {loser}: a noite ficou marcada pelo cartão vermelho de {red_card_player}, virada definitiva no roteiro do jogo.",
    "{loser} reclamou, mas a expulsão de {red_card_player} foi decisiva. {winner} venceu por {winner_goals}-{loser_goals} e levou os pontos pra casa.",
    "Vermelho de {red_card_player} desorganizou {loser}, e {winner} aproveitou pra fechar em {winner_goals} a {loser_goals}. Vitória sem mistério depois disso.",
    "Cartão vermelho cedo, decisão tarde: {winner} venceu {loser} por {winner_goals}-{loser_goals} explorando o homem a mais que veio com a expulsão de {red_card_player}.",
    "{winner} {winner_goals}-{loser_goals} {loser}, com {red_card_player} expulso ainda na primeira etapa. A inferioridade numérica custou caro pros visitantes.",
    "A expulsão de {red_card_player} foi o ponto de virada: {winner} cresceu na partida e venceu {loser} por {winner_goals} a {loser_goals}.",
    "Não tem o que discutir: o vermelho de {red_card_player} mudou o jogo. {winner} venceu {loser} por {winner_goals}-{loser_goals} aproveitando o desfalque.",
    "{winner} bateu {loser} por {winner_goals} a {loser_goals} numa partida que o cartão vermelho de {red_card_player} desequilibrou cedo.",
    "Com a saída forçada de {red_card_player}, {loser} encolheu, e {winner} fez {winner_goals}-{loser_goals} sem cerimônia.",
    "Mais um daqueles em que o cartão fala mais que o futebol: {red_card_player} foi expulso, {winner} cresceu e fechou em {winner_goals} a {loser_goals} sobre {loser}.",
    "Vitória de {winner} sobre {loser} por {winner_goals}-{loser_goals} carrega um asterisco — a expulsão de {red_card_player} antes do intervalo facilitou demais o trabalho dos mandantes.",
  ],
  penalty_decided: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} com gol de pênalti decisivo de {decisive_penalty_scorer}. Não foi bonito, mas foi vitória.",
    "{decisive_penalty_scorer} bateu firme da marca da cal e garantiu {winner_goals}-{loser_goals} pra {winner} contra {loser}. Pênalti que valeu três pontos.",
    "Pênalti convertido por {decisive_penalty_scorer} decidiu: {winner} {winner_goals} x {loser_goals} {loser} num jogo equilibrado decidido na bola parada.",
    "Foi na cal: {decisive_penalty_scorer} bateu, {winner} venceu {loser} por {winner_goals}-{loser_goals}, e os pontos voaram pra quem encarou a pressão melhor.",
    "{winner} {winner_goals} x {loser_goals} {loser}: a partida foi decidida em pênalti convertido por {decisive_penalty_scorer}, e o herói da noite virou ele.",
    "Pênalti decisivo, frieza no apito: {decisive_penalty_scorer} bateu pra valer e {winner} fechou em {winner_goals}-{loser_goals} sobre {loser}.",
    "Faltou pouco pra {loser} resistir, mas {decisive_penalty_scorer} cobrou o pênalti com classe e {winner} venceu por {winner_goals}-{loser_goals}.",
    "Bola na cal, jogo decidido: {decisive_penalty_scorer} converteu o pênalti que valeu {winner_goals}-{loser_goals} pra {winner} sobre {loser}.",
    "{decisive_penalty_scorer} pegou a bola, encarou o goleiro e bateu firme. Resultado: {winner} {winner_goals} x {loser_goals} {loser}.",
    "Pênalti que mudou o roteiro: {decisive_penalty_scorer} converteu, e {winner} bateu {loser} por {winner_goals}-{loser_goals} numa noite tensa.",
    "Sem espaço pra erro, {decisive_penalty_scorer} bateu o pênalti com a frieza necessária. {winner} venceu {loser} por {winner_goals}-{loser_goals}.",
    "{winner} confirmou vitória sobre {loser} por {winner_goals}-{loser_goals} num pênalti convertido por {decisive_penalty_scorer} que vai entrar pra história da partida.",
    "Bola parada, pulso firme: {decisive_penalty_scorer} bateu o pênalti que valeu três pontos pra {winner} sobre {loser} ({winner_goals}-{loser_goals}).",
    "Não tinha como zerar o jogo sem antes passar pela bola da cal: {decisive_penalty_scorer} converteu o pênalti que decidiu {winner_goals}-{loser_goals} pra {winner}.",
    "Pênalti, gol, festa: {decisive_penalty_scorer} bateu, {winner} venceu {loser} por {winner_goals}-{loser_goals} num jogo que parecia indefinido até a bola parada.",
    "{winner} {winner_goals} x {loser_goals} {loser} num jogo que precisou da bola da cal pra desempatar — {decisive_penalty_scorer} bateu, e o resto foi comemoração.",
    "Pelo apito o jogo seguiria zerado por mais alguns minutos, mas {decisive_penalty_scorer} cobrou o pênalti, balançou as redes e fechou {winner} {winner_goals} x {loser_goals} {loser}.",
    "{decisive_penalty_scorer} carregou a responsabilidade da cobrança e devolveu em forma de gol. {winner} venceu {loser} por {winner_goals}-{loser_goals}.",
    "Pênalti decisivo: {decisive_penalty_scorer} bateu, {winner} cresceu, {loser} pagou. Resultado final {winner_goals}-{loser_goals}.",
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo decidido na cal — {decisive_penalty_scorer} converteu o pênalti que valeu o resultado.",
  ],
  comeback: [
    "Virada épica {stadium_clause}: {winner} estava perdendo, mas reagiu e bateu {loser} por {winner_goals} a {loser_goals}. Time que não desistiu.",
    "{loser} chegou a abrir vantagem, mas {winner} virou o jogo e fechou em {winner_goals}-{loser_goals}. Reação que vale mais do que vitória normal.",
    "Estava difícil, virou rotina: {winner} reverteu o placar contra {loser} e venceu por {winner_goals}-{loser_goals} numa partida pra entrar pra galeria das viradas.",
    "{winner} {winner_goals} x {loser_goals} {loser}: virada de jogo construída no segundo tempo, com {top_scorer} no comando da reação.",
    "Estava pegando, mas {winner} ressuscitou no segundo tempo e virou pra {winner_goals}-{loser_goals} contra {loser}. {top_scorer} foi o nome da virada.",
    "{loser} comemorou cedo demais. {winner} achou o caminho de volta e fechou em {winner_goals} a {loser_goals} numa virada que valeu mais que três pontos.",
    "Tinha tudo pra {loser} sair com a vitória, mas {winner} virou no segundo tempo e bateu por {winner_goals}-{loser_goals}. Caráter no estilo bruto.",
    "Virada por mérito: {winner} buscou o resultado contra {loser} e fechou em {winner_goals}-{loser_goals} depois de sair atrás do placar.",
    "Não foi fácil pra {winner}, que viu {loser} abrir o placar. Mas a reação veio, {top_scorer} apareceu, e fechou {winner_goals}-{loser_goals}.",
    "{winner} foi pra cima, virou o jogo, e venceu {loser} por {winner_goals} a {loser_goals}. Atuação de quem entendeu que não dava pra perder mais essa.",
    "Saiu atrás, virou na raça: {winner} reverteu o placar contra {loser} e venceu {winner_goals}-{loser_goals} numa partida que ganhou cores no segundo tempo.",
    "Quando parecia que {loser} ia administrar a vantagem, {winner} entrou em estado de jogo e virou pra {winner_goals}-{loser_goals}. Vitória de orgulho.",
    "{winner} {winner_goals} x {loser_goals} {loser}, vitória construída no avesso — saiu atrás, deu trabalho, e fechou com mais um do que o adversário.",
    "Virada nervosa: {winner} sofreu pra reverter o placar, mas conseguiu, e bateu {loser} por {winner_goals}-{loser_goals} no apagar das luzes.",
    "{loser} jogou bem por um tempo, mas {winner} cresceu, virou e fechou em {winner_goals} a {loser_goals} numa daquelas viradas que ficam pra história.",
    "Estava perdendo, virou {winner_goals}-{loser_goals}: {winner} mostrou que tem coração e bateu {loser} numa noite memorável.",
    "Reação de orgulho: {winner} virou contra {loser} e venceu por {winner_goals}-{loser_goals} num jogo que parecia perdido aos 30 do primeiro tempo.",
    "Virada com sabor especial: {winner} achou um jeito, jogou pra valer no segundo tempo, e fechou em {winner_goals}-{loser_goals} contra {loser}.",
    "Quem viu o primeiro tempo achou que {loser} ia ganhar fácil. Quem viu o segundo viu {winner} virar o roteiro e fechar em {winner_goals}-{loser_goals}.",
    "Saiu atrás e ainda virou: {winner} bateu {loser} por {winner_goals}-{loser_goals} numa virada construída no fôlego dos minutos finais.",
  ],
  late_winner: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} com gol salvador de {late_scorer} aos {late_minute}'. Faltavam minutos pro fim, e veio o gol que decidiu.",
    "Aos {late_minute}', {late_scorer} balançou as redes e definiu {winner_goals}-{loser_goals} pra {winner} sobre {loser}. Sufoco até o último lance.",
    "{late_scorer} marcou o gol da vitória aos {late_minute}', e {winner} venceu {loser} por {winner_goals} a {loser_goals} num final de partida tenso.",
    "No apagar das luzes: {late_scorer} fez o gol decisivo aos {late_minute}', e {winner} bateu {loser} por {winner_goals}-{loser_goals}.",
    "{winner} {winner_goals} x {loser_goals} {loser} no fôlego final — {late_scorer} apareceu aos {late_minute}' pra resolver.",
    "Empate parecia certo até {late_scorer} balançar as redes aos {late_minute}'. {winner} venceu {loser} por {winner_goals}-{loser_goals} no susto.",
    "Final dramático: {late_scorer} fez o gol da vitória aos {late_minute}', {winner} bateu {loser} por {winner_goals}-{loser_goals} e o estádio quase veio abaixo.",
    "Quando todo mundo já contava com empate, {late_scorer} balançou as redes aos {late_minute}'. {winner} {winner_goals} x {loser_goals} {loser} no apagar das luzes.",
    "{late_scorer} brilhou nos minutos finais: gol aos {late_minute}', vitória de {winner} sobre {loser} por {winner_goals}-{loser_goals}, e três pontos preciosos.",
    "Faltava muito pouco pro apito final quando {late_scorer} balançou as redes aos {late_minute}'. {winner} venceu {loser} por {winner_goals}-{loser_goals}.",
    "Tudo indicava empate, mas {late_scorer} apareceu aos {late_minute}' pra fazer o gol da vitória. {winner} {winner_goals} x {loser_goals} {loser} no susto.",
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} com gol de {late_scorer} aos {late_minute}'. Vitória de quem insistiu até o fim.",
    "Aos {late_minute}' o jogo ainda estava aberto, mas {late_scorer} resolveu. {winner} {winner_goals} x {loser_goals} {loser} no último suspiro.",
    "Coração na mão: {late_scorer} fez aos {late_minute}', {winner} venceu {loser} por {winner_goals}-{loser_goals}, e o time saiu de campo aos pulos.",
    "Gol nos acréscimos da vida: {late_scorer} marcou aos {late_minute}', {winner} bateu {loser} por {winner_goals}-{loser_goals}, e três pontos vieram no susto.",
    "Não tinha mais tempo, mas tinha {late_scorer}: gol aos {late_minute}', vitória de {winner} sobre {loser} por {winner_goals}-{loser_goals}.",
    "Vitória nos minutos finais: {late_scorer} balançou as redes aos {late_minute}', e {winner} bateu {loser} por {winner_goals} a {loser_goals}.",
    "{late_scorer} foi o herói da noite — gol aos {late_minute}', {winner} venceu {loser} por {winner_goals}-{loser_goals} num final de jogo eletrizante.",
    "Faltava pouco, mas chegou: {late_scorer} marcou aos {late_minute}', {winner} fechou em {winner_goals}-{loser_goals} contra {loser}.",
    "{winner} {winner_goals} x {loser_goals} {loser}: gol salvador de {late_scorer} aos {late_minute}' fez a torcida explodir nos minutos finais.",
  ],
  rout: [
    "Goleada sem mistério: {winner} atropelou {loser} por {winner_goals} a {loser_goals}. {top_scorer} foi o destaque.",
    "{winner} {winner_goals} x {loser_goals} {loser}: time mandante deu show e fechou em ritmo de treino.",
    "Show de bola e baile completo: {winner} bateu {loser} por {winner_goals}-{loser_goals} numa atuação de gala.",
    "{winner} não deu chance: {winner_goals}-{loser_goals} sobre {loser}, com {top_scorer} carregando o ataque.",
    "Goleada categórica: {winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo decidido ainda no primeiro tempo.",
    "Atropelamento {stadium_clause}: {winner} {winner_goals} x {loser_goals} {loser}, num daqueles jogos em que a torcida pode comemorar tranquila.",
    "{loser} não teve resposta: {winner} venceu por {winner_goals}-{loser_goals}, com {top_scorer} se destacando.",
    "Sem freio: {winner} bateu {loser} por {winner_goals} a {loser_goals}. Foi goleada construída com paciência e finalização.",
    "{winner} fez 'show' contra {loser} e fechou em {winner_goals}-{loser_goals}. Resultado elástico que reflete a superioridade dentro de campo.",
    "Goleada que entra pra história: {winner} bateu {loser} por {winner_goals} a {loser_goals} numa atuação coletiva acima da média.",
    "Não teve jogo: {winner} controlou tudo e venceu {loser} por {winner_goals}-{loser_goals}. {top_scorer} brilhou.",
    "{winner} {winner_goals} x {loser_goals} {loser}: o placar elástico mostra como o jogo foi de mão única do começo ao fim.",
    "Tinha tudo pra ser duro, mas {winner} resolveu cedo: {winner_goals}-{loser_goals} sobre {loser}, jogo decidido antes do intervalo.",
    "Baile em campo: {winner} venceu {loser} por {winner_goals} a {loser_goals} jogando bonito e finalizando com eficiência.",
    "{winner} cresceu, {loser} caiu: goleada de {winner_goals}-{loser_goals} num jogo unilateral do começo ao fim.",
    "Show, baile, festa: {winner} bateu {loser} por {winner_goals} a {loser_goals} numa noite especial pros mandantes.",
    "{winner} jogou no estilo, {loser} sofreu — placar de {winner_goals}-{loser_goals} reflete o domínio em campo.",
    "Goleada de marca maior: {winner} venceu {loser} por {winner_goals} a {loser_goals}. {top_scorer} ficou marcado pelos gols.",
    "Não dava pra {loser} resistir: {winner} controlou, marcou várias vezes e fechou {winner_goals}-{loser_goals}.",
    "{winner} {winner_goals} x {loser_goals} {loser}: a goleada saiu por mérito — domínio total, gol em todas as situações, e adversário sem resposta.",
  ],
  jogao: [
    "Que jogão! {home} {home_goals} x {away_goals} {away} numa partida pra entrar pra história, com gols rolando dos dois lados.",
    "{home} e {away} fizeram um jogaço {stadium_clause}: {home_goals}-{away_goals}, vitória de {winner} numa noite de muitos gols.",
    "Jogo bonito de assistir: {winner} venceu {loser} por {winner_goals} a {loser_goals} num roteiro que prendeu a torcida do início ao fim.",
    "Que partida! {home} {home_goals} x {away_goals} {away}, com {winner} levando os pontos no que pareceu mais espetáculo do que jogo.",
    "Jogaço {stadium_clause}: {winner_goals}-{loser_goals} pra {winner}, num confronto recheado de gols e emoção.",
    "Jogo de fogo: {home} e {away} se enfrentaram com tudo, e o placar de {home_goals}-{away_goals} pra {winner} mostra o que foi dentro de campo.",
    "Quem viu não esquece: {winner} bateu {loser} por {winner_goals} a {loser_goals} numa partida frenética com gols dos dois lados.",
    "Que partidão! {winner} venceu {loser} por {winner_goals}-{loser_goals} num jogo de muitos gols e pouca defesa.",
    "{home} {home_goals} x {away_goals} {away}: jogão de respeito, com gols, polêmicas e final tenso até o apito.",
    "Espetáculo em campo: {winner} levou {winner_goals}-{loser_goals} sobre {loser} numa partida pra entrar pra galeria das melhores.",
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogaço de domingo: gols, emoção e torcida em pé do início ao fim.",
    "Não dava pra piscar: {home} {home_goals} x {away_goals} {away} num jogo que teve de tudo — gols, viradas, polêmicas, festa.",
    "Partida pra ficar marcada: {winner} bateu {loser} por {winner_goals}-{loser_goals} num confronto que mereceu cada minuto da torcida.",
    "Jogão de bola: {winner_goals}-{loser_goals} pra {winner} sobre {loser}, com {top_scorer} se destacando entre os gols marcados.",
    "Que noite! {home} e {away} botaram tudo em campo, e o resultado foi {home_goals}-{away_goals} pra {winner}, num jogo digno de mata-mata.",
    "Festa do gol: {winner} venceu {loser} por {winner_goals} a {loser_goals} num daqueles jogos que rendem horas de comentário depois.",
    "Pra quem gosta de gol, foi prato cheio: {home} {home_goals} x {away_goals} {away}, com {winner} saindo de campo na vitória.",
    "Jogão sem freio: {winner} bateu {loser} por {winner_goals}-{loser_goals} num confronto onde o ataque mandou e a defesa só observou.",
    "Que partida o {home} e o {away} fizeram {stadium_clause}! {home_goals}-{away_goals}, com {winner} confirmando vitória num jogo de muitos gols.",
    "{home} {home_goals} x {away_goals} {away}: jogão de muitos gols, emoção até o último minuto, e {winner} se segurando pra sair com os três pontos.",
  ],
  comfortable_win: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo controlado {stadium_clause}. Vantagem construída cedo, fim sem sustos.",
    "Vitória sem maiores problemas: {winner} bateu {loser} por {winner_goals}-{loser_goals}, jogando dentro do que se esperava.",
    "{winner} {winner_goals} x {loser_goals} {loser}: triunfo confortável, com a vantagem encaminhada antes do segundo tempo começar.",
    "Triunfo tranquilo de {winner} sobre {loser}: {winner_goals}-{loser_goals}, com {top_scorer} no comando do ataque.",
    "{winner} cuidou do jogo e venceu {loser} por {winner_goals}-{loser_goals} sem grandes percalços.",
    "Vitória sólida: {winner} bateu {loser} por {winner_goals} a {loser_goals} num jogo bem controlado dos mandantes.",
    "Sem sufoco: {winner} venceu {loser} por {winner_goals}-{loser_goals}, com domínio claro do começo ao fim.",
    "{winner} mostrou o porquê de ser favorito: {winner_goals}-{loser_goals} sobre {loser}, e jogo encaminhado cedo.",
    "Triunfo merecido: {winner} bateu {loser} por {winner_goals} a {loser_goals} num jogo que ficou de mão única depois do segundo gol.",
    "{winner} venceu {loser} por {winner_goals}-{loser_goals} numa partida sem grandes emoções, mas com superioridade clara dos mandantes.",
    "Vantagem construída e mantida: {winner} {winner_goals} x {loser_goals} {loser}, vitória sem mistério {stadium_clause}.",
    "{winner} fez o trabalho: bateu {loser} por {winner_goals}-{loser_goals} e segurou a vantagem do jeito que se espera de quem joga em casa.",
    "Sem espaço pra surpresas: {winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo encaminhado já no primeiro tempo.",
    "{winner} jogou no ritmo necessário e venceu {loser} por {winner_goals}-{loser_goals}. Triunfo competente, sem brilho excessivo.",
    "Triunfo confortável: {winner} bateu {loser} por {winner_goals} a {loser_goals}, com {top_scorer} botando o time na frente cedo.",
    "{winner} mostrou superioridade e fechou em {winner_goals}-{loser_goals} sobre {loser}. Vitória dentro do esperado.",
    "Vitória de quem é favorito: {winner} {winner_goals} x {loser_goals} {loser}, com domínio claro e poucos sustos.",
    "{winner} venceu {loser} por {winner_goals}-{loser_goals} cuidando do jogo do início ao fim. Sem brilho excepcional, mas com eficiência.",
    "Triunfo eficiente: {winner} bateu {loser} por {winner_goals} a {loser_goals} num jogo onde os mandantes administraram o resultado.",
    "{winner} confirmou favoritismo: {winner_goals}-{loser_goals} sobre {loser}, partida encaminhada cedo e fim sem grandes ameaças.",
  ],
  narrow_win: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo apertado decidido nos detalhes. {top_scorer} marcou o gol que valeu três pontos.",
    "Vitória magra mas vitória: {winner} bateu {loser} por {winner_goals}-{loser_goals} num jogo de poucas chances claras.",
    "{winner} {winner_goals} x {loser_goals} {loser}: jogo apertado, decidido por um detalhe, mas três pontos contam igual.",
    "Não foi bonito, mas foi vitória: {winner} venceu {loser} por {winner_goals}-{loser_goals}, com {top_scorer} sendo o nome do gol decisivo.",
    "Triunfo curto: {winner} bateu {loser} por {winner_goals} a {loser_goals} num jogo equilibrado decidido na bola parada.",
    "{winner} sofreu, mas venceu: {winner_goals}-{loser_goals} sobre {loser} num confronto que ficou aberto até o último minuto.",
    "Jogo pra ataque de nervos: {winner} venceu {loser} por {winner_goals}-{loser_goals} num final de partida tenso.",
    "Vitória sofrida: {winner} bateu {loser} por {winner_goals} a {loser_goals}, e o placar magro mostra como o jogo foi disputado.",
    "{winner} {winner_goals} x {loser_goals} {loser}: vitória de quem aproveitou a chance que teve, num jogo pegado em todos os setores.",
    "{winner} venceu {loser} por {winner_goals}-{loser_goals} num jogo decidido por detalhes — bola na trave, gol salvador e nervos de aço.",
    "Apertado mas favorável: {winner} bateu {loser} por {winner_goals} a {loser_goals} num confronto equilibrado decidido no detalhe.",
    "Não foi fácil: {winner} venceu {loser} por {winner_goals}-{loser_goals} num jogo que pediu paciência até o último apito.",
    "Vitória magra que vale ouro: {winner} {winner_goals} x {loser_goals} {loser}, com {top_scorer} fazendo o gol decisivo.",
    "{winner} bateu {loser} por {winner_goals} a {loser_goals} num jogo equilibrado em que cada bola dividida valia ouro.",
    "Triunfo curto, conquistado na raça: {winner} venceu {loser} por {winner_goals}-{loser_goals} num jogo decidido nos detalhes.",
    "{winner} venceu {loser} por {winner_goals} a {loser_goals} num jogo pegado, decidido pela qualidade do gol marcado por {top_scorer}.",
    "Sem espaço pra erro: {winner} bateu {loser} por {winner_goals}-{loser_goals} num jogo apertado em que o gol veio cedo e foi cuidado até o fim.",
    "Triunfo no detalhe: {winner} venceu {loser} por {winner_goals} a {loser_goals}, e o resultado pequeno mostra o equilíbrio em campo.",
    "{winner} segurou {loser} no que pôde e venceu por {winner_goals}-{loser_goals}. Vitória magra, mas três pontos importantes.",
    "Vitória apertada: {winner} {winner_goals} x {loser_goals} {loser}, com final de jogo eletrizante e gol salvador de {top_scorer}.",
  ],
  draw_goalfest: [
    "Empate de muitos gols: {home} {home_goals} x {away_goals} {away}, num jogão recheado de emoção do início ao fim.",
    "Que partida! {home} e {away} ficaram no {home_goals}-{away_goals} num jogo de muitos gols e pouca defesa.",
    "{home} {home_goals} x {away_goals} {away}: empate festivo, com gols dos dois lados e torcida nervosa o tempo todo.",
    "Empate de jogo aberto: {home} e {away} dividiram os pontos no {home_goals}-{away_goals} numa partida frenética.",
    "Pra quem gosta de gol, deu pra todo mundo: {home} {home_goals} x {away_goals} {away} num confronto recheado de emoções.",
    "Empate movimentado {stadium_clause}: {home} e {away} ficaram no {home_goals}-{away_goals} num jogo cheio de altos e baixos.",
    "Não teve vencedor, mas teve futebol: {home} {home_goals} x {away_goals} {away} num jogo de gols, emoção e final aberto.",
    "Empate festivo: {home} e {away} fizeram {home_goals}-{away_goals} num jogo digno de capítulo de novela.",
    "Jogão sem vencedor: {home} {home_goals} x {away_goals} {away}, com chances dos dois lados e finalização pra ninguém botar defeito.",
    "Empate em jogo aberto: {home} {home_goals} x {away_goals} {away}, num confronto que poderia ter ido pra qualquer lado.",
    "{home} e {away} dividiram pontos num {home_goals}-{away_goals} de jogo aberto. Quem assistiu não viu falta de emoção.",
    "Empate dramático: {home} {home_goals} x {away_goals} {away}, com gols na reta final que mantiveram o jogo aberto até o apito.",
    "Cada um pra um lado: {home} e {away} fizeram {home_goals}-{away_goals} num jogo recheado de chances pra ambas as equipes.",
    "Empate digno de espetáculo: {home} {home_goals} x {away_goals} {away}, com momentos pros dois ataques brilharem.",
    "Quem viu o jogo viu de tudo: {home} {home_goals} x {away_goals} {away}, empate justo num confronto disputado de igual pra igual.",
    "Empate de muitos gols {stadium_clause}: {home} {home_goals} x {away_goals} {away} numa partida pra entrar nas conversas da semana.",
    "{home} e {away} se igualaram em {home_goals}-{away_goals} num jogo aberto que pediu mais minutos de prorrogação.",
    "Empate quente: {home} {home_goals} x {away_goals} {away} num confronto que teve de tudo, menos vencedor.",
    "Festa de gols, divisão de pontos: {home} e {away} fizeram {home_goals}-{away_goals} numa partida que valeu pelo espetáculo.",
    "{home} {home_goals} x {away_goals} {away}: empate generoso em gols, restritivo em pontos.",
  ],
  draw_low: [
    "Empate sem gols: {home} 0-0 {away} num jogo travado {stadium_clause}, com defesas se sobressaindo aos ataques.",
    "{home} {home_goals} x {away_goals} {away}: empate magro, jogo de poucos lances claros e muita marcação.",
    "Igualdade no placar e nas dificuldades: {home} e {away} ficaram no {home_goals}-{away_goals} num jogo travado do começo ao fim.",
    "{home} {home_goals} x {away_goals} {away}: empate de jogo emperrado, decidido nos erros mais que nos acertos.",
    "Sem grandes emoções: {home} e {away} fizeram {home_goals}-{away_goals} num confronto preso ao meio-campo.",
    "Empate magro entre {home} e {away}: {home_goals}-{away_goals}, com poucos minutos de futebol propriamente dito.",
    "Jogo amarrado, empate pequeno: {home} {home_goals} x {away_goals} {away} numa partida de poucas oportunidades.",
    "{home} e {away} dividiram pontos num {home_goals}-{away_goals} de jogo lento, mais tático que emocional.",
    "Empate burocrático: {home} {home_goals} x {away_goals} {away}, num confronto de pouca produção ofensiva pelos dois lados.",
    "{home} {home_goals} x {away_goals} {away}: empate sem espetáculo, jogo decidido pelas marcações.",
    "Empate magro: {home} e {away} fizeram {home_goals}-{away_goals} num jogo travado em todos os setores.",
    "{home} e {away} não saíram do {home_goals}-{away_goals} num jogo de poucas finalizações reais.",
    "Empate sem brilho: {home} {home_goals} x {away_goals} {away} num confronto controlado pelas defesas.",
    "{home} e {away} ficaram no {home_goals}-{away_goals} num jogo decidido mais pelo cansaço que pelo talento.",
    "Empate apertado: {home} {home_goals} x {away_goals} {away}, partida pegada e poucas chances reais de gol.",
    "Sem gol, sem grandes emoções: {home} {home_goals} x {away_goals} {away} num jogo equilibrado mas pouco produtivo.",
    "{home} {home_goals} x {away_goals} {away}: empate decidido na marcação, com defesas atentas e ataques frustrados.",
    "Empate sob a chuva — não literal, mas figurativa: {home} {home_goals} x {away_goals} {away} num jogo de pouca alegria.",
    "{home} e {away} fizeram {home_goals}-{away_goals} num jogo travado, sem grandes momentos pra qualquer um dos lados.",
    "Empate sem brilho: {home} {home_goals} x {away_goals} {away}, com defesas se destacando mais que os ataques.",
  ],
};

// ── EN templates: 20 per bucket ──
const TEMPLATES_EN: Record<MatchRecapBucket, string[]> = {
  red_card_decided: [
    "{loser} dropped to ten early after {red_card_player}'s red and lost {winner_goals}-{loser_goals} to {winner}. The hosts managed the man advantage and walked away with the points.",
    "With {red_card_player} sent off in the first half, {loser} watched {winner} take charge and close it out at {winner_goals}-{loser_goals}. The numbers told the story.",
    "{winner} capitalized on {red_card_player}'s red and beat {loser} {winner_goals}-{loser_goals}. One of those nights when the card rewrote the script.",
    "{red_card_player}'s red changed the game: {winner} beat {loser} {winner_goals}-{loser_goals} by exploiting the space the opponent left.",
    "After {red_card_player} was sent off, {loser} couldn't react and {winner} secured {winner_goals}-{loser_goals} without much trouble.",
    "Match decided by the card: {red_card_player} walked, {winner} grew into it and beat {loser} {winner_goals}-{loser_goals}.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a match marked by {red_card_player}'s sending-off, which left the team a man down for the rest of the night.",
    "Eleven against ten made the difference: {winner} beat {loser} {winner_goals}-{loser_goals} after {red_card_player}'s red and the hosts found their rhythm.",
    "Up a man since {red_card_player}'s expulsion, {winner} took care of the game and beat {loser} {winner_goals}-{loser_goals}.",
    "{winner} {winner_goals}-{loser_goals} {loser}: the night will be remembered for {red_card_player}'s red, the moment that turned the script.",
    "{loser} protested, but {red_card_player}'s red was decisive. {winner} took the win {winner_goals}-{loser_goals} and the points home.",
    "{red_card_player}'s red broke {loser}'s rhythm, and {winner} closed it at {winner_goals}-{loser_goals}. No mystery from there.",
    "Early red, late decision: {winner} beat {loser} {winner_goals}-{loser_goals} by exploiting the man advantage gained when {red_card_player} was sent off.",
    "{winner} {winner_goals}-{loser_goals} {loser}, with {red_card_player} dismissed before the break. The numerical disadvantage cost the visitors dearly.",
    "{red_card_player}'s expulsion was the turning point: {winner} grew into the match and beat {loser} {winner_goals}-{loser_goals}.",
    "Nothing to argue: {red_card_player}'s red changed the game. {winner} beat {loser} {winner_goals}-{loser_goals} by exploiting the absence.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a match where {red_card_player}'s red unbalanced things early.",
    "With {red_card_player}'s forced exit, {loser} shrank, and {winner} made it {winner_goals}-{loser_goals} without ceremony.",
    "Another one where the card spoke louder than football: {red_card_player} was sent off, {winner} grew into it, and closed it at {winner_goals}-{loser_goals} over {loser}.",
    "{winner}'s {winner_goals}-{loser_goals} win over {loser} carries an asterisk — {red_card_player}'s expulsion before halftime made the hosts' job too easy.",
  ],
  penalty_decided: [
    "{winner} beat {loser} {winner_goals}-{loser_goals} thanks to a decisive penalty from {decisive_penalty_scorer}. Not pretty, but it was a win.",
    "{decisive_penalty_scorer} struck firmly from the spot and secured {winner_goals}-{loser_goals} for {winner} over {loser}. A penalty worth three points.",
    "Penalty converted by {decisive_penalty_scorer} settled it: {winner} {winner_goals}-{loser_goals} {loser} in a balanced match decided on the dead ball.",
    "From the spot: {decisive_penalty_scorer} struck, {winner} beat {loser} {winner_goals}-{loser_goals}, and the points flew to whoever handled the pressure better.",
    "{winner} {winner_goals}-{loser_goals} {loser}: the match was decided by a penalty converted by {decisive_penalty_scorer}, who became the hero of the night.",
    "Decisive penalty, ice in his veins: {decisive_penalty_scorer} struck for real and {winner} closed it {winner_goals}-{loser_goals} over {loser}.",
    "{loser} nearly held on, but {decisive_penalty_scorer} converted the penalty with class and {winner} won {winner_goals}-{loser_goals}.",
    "Ball on the spot, match decided: {decisive_penalty_scorer} converted the penalty that was worth {winner_goals}-{loser_goals} for {winner} over {loser}.",
    "{decisive_penalty_scorer} took the ball, faced the keeper and struck firmly. Result: {winner} {winner_goals}-{loser_goals} {loser}.",
    "Penalty that changed the script: {decisive_penalty_scorer} converted, and {winner} beat {loser} {winner_goals}-{loser_goals} on a tense night.",
    "No room for error, {decisive_penalty_scorer} took the penalty with the necessary cool. {winner} beat {loser} {winner_goals}-{loser_goals}.",
    "{winner} confirmed victory over {loser} {winner_goals}-{loser_goals} with a penalty converted by {decisive_penalty_scorer} that will go down in this match's history.",
    "Dead ball, steady hand: {decisive_penalty_scorer} converted the penalty worth three points for {winner} over {loser} ({winner_goals}-{loser_goals}).",
    "There was no closing this match without going through the spot first: {decisive_penalty_scorer} converted the penalty that decided {winner_goals}-{loser_goals} for {winner}.",
    "Penalty, goal, party: {decisive_penalty_scorer} struck, {winner} beat {loser} {winner_goals}-{loser_goals} in a match that seemed undecided until the dead ball.",
    "{winner} {winner_goals}-{loser_goals} {loser} in a match that needed a penalty to break the deadlock — {decisive_penalty_scorer} struck, and the rest was celebration.",
    "By the run of play the match would've stayed level a few more minutes, but {decisive_penalty_scorer} converted the spot kick, found the net, and closed it {winner} {winner_goals}-{loser_goals} {loser}.",
    "{decisive_penalty_scorer} carried the responsibility of the spot kick and gave back a goal. {winner} beat {loser} {winner_goals}-{loser_goals}.",
    "Decisive penalty: {decisive_penalty_scorer} struck, {winner} grew into it, {loser} paid. Final score {winner_goals}-{loser_goals}.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a match decided from the spot — {decisive_penalty_scorer} converted the penalty that was worth the result.",
  ],
  comeback: [
    "Epic comeback {stadium_clause}: {winner} were trailing but reacted and beat {loser} {winner_goals}-{loser_goals}. A team that didn't quit.",
    "{loser} took the lead, but {winner} turned the game around and closed it at {winner_goals}-{loser_goals}. A reaction worth more than a normal win.",
    "It was tough, then it became routine: {winner} reversed the score against {loser} and won {winner_goals}-{loser_goals} in a match for the comeback hall of fame.",
    "{winner} {winner_goals}-{loser_goals} {loser}: comeback built in the second half, with {top_scorer} leading the charge.",
    "It was getting away, but {winner} came back to life in the second half and turned it into {winner_goals}-{loser_goals} over {loser}. {top_scorer} was the name of the comeback.",
    "{loser} celebrated too early. {winner} found the way back and closed it {winner_goals}-{loser_goals} in a comeback worth more than three points.",
    "Everything pointed to a {loser} win, but {winner} flipped it in the second half and won {winner_goals}-{loser_goals}. Character in raw form.",
    "Comeback by merit: {winner} chased the result against {loser} and closed it {winner_goals}-{loser_goals} after going behind.",
    "It wasn't easy for {winner}, who saw {loser} open the scoring. But the reaction came, {top_scorer} appeared, and the score read {winner_goals}-{loser_goals}.",
    "{winner} pushed forward, turned it around, and beat {loser} {winner_goals}-{loser_goals}. Performance from a team that knew it couldn't drop another.",
    "Behind on the scoreboard, ahead in spirit: {winner} reversed the result against {loser} and won {winner_goals}-{loser_goals} in a match that found color in the second half.",
    "When it looked like {loser} would manage the lead, {winner} clicked into game mode and turned it into {winner_goals}-{loser_goals}. Pride win.",
    "{winner} {winner_goals}-{loser_goals} {loser}, win built in reverse — went behind, fought hard, came out one goal ahead.",
    "Tense comeback: {winner} struggled to reverse the score but did, beating {loser} {winner_goals}-{loser_goals} as the lights dimmed.",
    "{loser} played well for a stretch, but {winner} grew into it, turned around and closed at {winner_goals}-{loser_goals} in one of those comebacks for the books.",
    "Trailing, then turning it to {winner_goals}-{loser_goals}: {winner} showed they have heart and beat {loser} on a memorable night.",
    "Pride reaction: {winner} flipped the script against {loser} and won {winner_goals}-{loser_goals} in a match that looked lost at the 30-minute mark.",
    "Comeback with a special flavor: {winner} found a way, played hard in the second half, and closed it {winner_goals}-{loser_goals} over {loser}.",
    "Whoever saw the first half thought {loser} would win easy. Whoever saw the second saw {winner} flip the script and close it {winner_goals}-{loser_goals}.",
    "Trailed, then turned: {winner} beat {loser} {winner_goals}-{loser_goals} in a comeback built on stamina in the closing minutes.",
  ],
  late_winner: [
    "{winner} beat {loser} {winner_goals}-{loser_goals} with a savior strike from {late_scorer} at {late_minute}'. With minutes to go, the decisive goal arrived.",
    "At {late_minute}', {late_scorer} found the net and made it {winner_goals}-{loser_goals} for {winner} over {loser}. Tense to the very last.",
    "{late_scorer} scored the winner at {late_minute}', and {winner} beat {loser} {winner_goals}-{loser_goals} in a tense closing stretch.",
    "As the lights dimmed: {late_scorer} scored the decider at {late_minute}', and {winner} beat {loser} {winner_goals}-{loser_goals}.",
    "{winner} {winner_goals}-{loser_goals} {loser} in the dying breath — {late_scorer} appeared at {late_minute}' to settle it.",
    "A draw seemed certain until {late_scorer} found the net at {late_minute}'. {winner} beat {loser} {winner_goals}-{loser_goals} on the late drama.",
    "Dramatic finale: {late_scorer} scored the winner at {late_minute}', {winner} beat {loser} {winner_goals}-{loser_goals} and the stadium nearly came down.",
    "When everyone counted on a draw, {late_scorer} found the net at {late_minute}'. {winner} {winner_goals}-{loser_goals} {loser} on the scare.",
    "{late_scorer} shone in the final minutes: goal at {late_minute}', win for {winner} over {loser} {winner_goals}-{loser_goals}, and three precious points.",
    "Very little time left when {late_scorer} found the net at {late_minute}'. {winner} beat {loser} {winner_goals}-{loser_goals}.",
    "Everything pointed to a draw, but {late_scorer} appeared at {late_minute}' to score the winner. {winner} {winner_goals}-{loser_goals} {loser} on the late scare.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} with {late_scorer}'s strike at {late_minute}'. A win for the team that never stopped pressing.",
    "At {late_minute}' the match was still open, but {late_scorer} settled it. {winner} {winner_goals}-{loser_goals} {loser} on the last gasp.",
    "Heart in mouth: {late_scorer} struck at {late_minute}', {winner} beat {loser} {winner_goals}-{loser_goals}, and the team left the pitch jumping.",
    "Goal in life's stoppage time: {late_scorer} scored at {late_minute}', {winner} beat {loser} {winner_goals}-{loser_goals}, and three points came in the scare.",
    "Time was out, but {late_scorer} wasn't: goal at {late_minute}', win for {winner} over {loser} {winner_goals}-{loser_goals}.",
    "Win in the closing minutes: {late_scorer} found the net at {late_minute}', and {winner} beat {loser} {winner_goals}-{loser_goals}.",
    "{late_scorer} was the hero of the night — goal at {late_minute}', {winner} beat {loser} {winner_goals}-{loser_goals} in an electrifying close.",
    "Time was short, but it arrived: {late_scorer} scored at {late_minute}', {winner} closed at {winner_goals}-{loser_goals} over {loser}.",
    "{winner} {winner_goals}-{loser_goals} {loser}: savior goal from {late_scorer} at {late_minute}' made the crowd erupt in the closing minutes.",
  ],
  rout: [
    "Rout with no mystery: {winner} crushed {loser} {winner_goals}-{loser_goals}. {top_scorer} was the standout.",
    "{winner} {winner_goals}-{loser_goals} {loser}: the hosts put on a show and closed it at training pace.",
    "Show of football and full clinic: {winner} beat {loser} {winner_goals}-{loser_goals} in a top-class performance.",
    "{winner} gave no chance: {winner_goals}-{loser_goals} over {loser}, with {top_scorer} carrying the attack.",
    "Categorical thrashing: {winner} beat {loser} {winner_goals}-{loser_goals} in a match decided in the first half.",
    "Steamrolling {stadium_clause}: {winner} {winner_goals}-{loser_goals} {loser}, one of those matches where the crowd can celebrate easy.",
    "{loser} had no answer: {winner} won {winner_goals}-{loser_goals}, with {top_scorer} standing out.",
    "No brakes: {winner} beat {loser} {winner_goals}-{loser_goals}. A rout built on patience and finishing.",
    "{winner} put on a 'show' against {loser} and closed it at {winner_goals}-{loser_goals}. An elastic score that mirrors the on-pitch superiority.",
    "Rout for the history: {winner} beat {loser} {winner_goals}-{loser_goals} in an above-average collective performance.",
    "There was no game: {winner} controlled everything and beat {loser} {winner_goals}-{loser_goals}. {top_scorer} shone.",
    "{winner} {winner_goals}-{loser_goals} {loser}: the elastic scoreline shows how one-way the match was from start to finish.",
    "Looked like it'd be tough, but {winner} settled it early: {winner_goals}-{loser_goals} over {loser}, decided before halftime.",
    "Clinic on the pitch: {winner} beat {loser} {winner_goals}-{loser_goals} playing pretty and finishing efficiently.",
    "{winner} grew, {loser} fell: a {winner_goals}-{loser_goals} rout in a one-sided match from start to finish.",
    "Show, clinic, party: {winner} beat {loser} {winner_goals}-{loser_goals} in a special night for the hosts.",
    "{winner} played in style, {loser} suffered — the {winner_goals}-{loser_goals} score reflects the on-pitch dominance.",
    "Headline rout: {winner} beat {loser} {winner_goals}-{loser_goals}. {top_scorer} stood out with the goals.",
    "{loser} couldn't resist: {winner} controlled, scored several times, and closed it {winner_goals}-{loser_goals}.",
    "{winner} {winner_goals}-{loser_goals} {loser}: the rout was earned — total dominance, goals from every situation, and an opponent without an answer.",
  ],
  jogao: [
    "What a match! {home} {home_goals}-{away_goals} {away} in a contest for the history books, with goals flying both ways.",
    "{home} and {away} put on a thriller {stadium_clause}: {home_goals}-{away_goals}, win for {winner} on a high-scoring night.",
    "Pretty match to watch: {winner} beat {loser} {winner_goals}-{loser_goals} in a script that gripped the crowd from start to finish.",
    "What a game! {home} {home_goals}-{away_goals} {away}, with {winner} taking the points in what felt more like spectacle than match.",
    "Thriller {stadium_clause}: {winner_goals}-{loser_goals} for {winner} in a confrontation packed with goals and emotion.",
    "Fire match: {home} and {away} traded blows, and the {home_goals}-{away_goals} score for {winner} shows what it was on the pitch.",
    "Whoever watched won't forget: {winner} beat {loser} {winner_goals}-{loser_goals} in a frenetic match with goals on both sides.",
    "What a contest! {winner} beat {loser} {winner_goals}-{loser_goals} in a high-scoring match where defenses watched.",
    "{home} {home_goals}-{away_goals} {away}: serious thriller, with goals, controversy and a tense final until the whistle.",
    "Spectacle on the pitch: {winner} took {winner_goals}-{loser_goals} over {loser} in a match for the gallery of the best.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a Sunday thriller — goals, emotion and a crowd standing from start to finish.",
    "Couldn't blink: {home} {home_goals}-{away_goals} {away} in a match that had everything — goals, comebacks, controversy, party.",
    "Match to be remembered: {winner} beat {loser} {winner_goals}-{loser_goals} in a confrontation that earned every minute of the crowd's attention.",
    "Quality match: {winner_goals}-{loser_goals} for {winner} over {loser}, with {top_scorer} standing out among the goals scored.",
    "What a night! {home} and {away} laid it all on the pitch, and the result was {home_goals}-{away_goals} for {winner}, in a match worthy of knockout football.",
    "Goal festival: {winner} beat {loser} {winner_goals}-{loser_goals} in one of those matches that produces hours of post-game commentary.",
    "For those who like goals, plenty to chew on: {home} {home_goals}-{away_goals} {away}, with {winner} leaving the pitch a winner.",
    "Thriller without brakes: {winner} beat {loser} {winner_goals}-{loser_goals} in a confrontation where the attack ruled and defense only watched.",
    "What a match {home} and {away} put on {stadium_clause}! {home_goals}-{away_goals}, with {winner} confirming the win in a high-scoring affair.",
    "{home} {home_goals}-{away_goals} {away}: many-goal thriller, emotion to the last minute, and {winner} hanging on for the three points.",
  ],
  comfortable_win: [
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a controlled match {stadium_clause}. Lead built early, no scares at the close.",
    "Win without major issues: {winner} beat {loser} {winner_goals}-{loser_goals}, playing within expectations.",
    "{winner} {winner_goals}-{loser_goals} {loser}: comfortable triumph, with the lead settled before the second half began.",
    "Calm victory for {winner} over {loser}: {winner_goals}-{loser_goals}, with {top_scorer} leading the attack.",
    "{winner} took care of the match and beat {loser} {winner_goals}-{loser_goals} without major hitches.",
    "Solid win: {winner} beat {loser} {winner_goals}-{loser_goals} in a well-controlled match by the hosts.",
    "No suffocation: {winner} beat {loser} {winner_goals}-{loser_goals}, with clear dominance from start to finish.",
    "{winner} showed why they're the favorite: {winner_goals}-{loser_goals} over {loser}, match settled early.",
    "Deserved triumph: {winner} beat {loser} {winner_goals}-{loser_goals} in a match that became one-way after the second goal.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a match without major emotions, but with clear superiority from the hosts.",
    "Lead built and held: {winner} {winner_goals}-{loser_goals} {loser}, no-mystery win {stadium_clause}.",
    "{winner} did the job: beat {loser} {winner_goals}-{loser_goals} and held the lead the way you'd expect from a team playing at home.",
    "No room for surprises: {winner} beat {loser} {winner_goals}-{loser_goals} in a match settled in the first half.",
    "{winner} played at the necessary pace and beat {loser} {winner_goals}-{loser_goals}. Competent triumph, no excessive shine.",
    "Comfortable triumph: {winner} beat {loser} {winner_goals}-{loser_goals}, with {top_scorer} putting the team ahead early.",
    "{winner} showed superiority and closed it at {winner_goals}-{loser_goals} over {loser}. Win within expectations.",
    "Favorite's win: {winner} {winner_goals}-{loser_goals} {loser}, with clear dominance and few scares.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} taking care of the match from start to finish. No exceptional shine, but with efficiency.",
    "Efficient triumph: {winner} beat {loser} {winner_goals}-{loser_goals} in a match where the hosts managed the result.",
    "{winner} confirmed favoritism: {winner_goals}-{loser_goals} over {loser}, match settled early and finished without major threats.",
  ],
  narrow_win: [
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a tight match decided on the details. {top_scorer} scored the goal worth three points.",
    "Narrow win but a win: {winner} beat {loser} {winner_goals}-{loser_goals} in a match of few clear chances.",
    "{winner} {winner_goals}-{loser_goals} {loser}: tight match, decided on a detail, but three points count the same.",
    "Wasn't pretty, but it was a win: {winner} beat {loser} {winner_goals}-{loser_goals}, with {top_scorer} the name behind the decisive goal.",
    "Slim triumph: {winner} beat {loser} {winner_goals}-{loser_goals} in a balanced match decided on a set piece.",
    "{winner} suffered, but won: {winner_goals}-{loser_goals} over {loser} in a confrontation that stayed open until the last minute.",
    "Match for stretched nerves: {winner} beat {loser} {winner_goals}-{loser_goals} in a tense closing stretch.",
    "Hard-earned win: {winner} beat {loser} {winner_goals}-{loser_goals}, and the slim score shows how disputed the match was.",
    "{winner} {winner_goals}-{loser_goals} {loser}: a win for those who took the chance they had, in a match contested in every sector.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a match decided on details — ball off the post, savior goal, and steel nerves.",
    "Narrow but in their favor: {winner} beat {loser} {winner_goals}-{loser_goals} in a balanced confrontation decided on a detail.",
    "It wasn't easy: {winner} beat {loser} {winner_goals}-{loser_goals} in a match that demanded patience until the final whistle.",
    "Slim win worth gold: {winner} {winner_goals}-{loser_goals} {loser}, with {top_scorer} scoring the decider.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a balanced match where every loose ball was worth gold.",
    "Slim triumph, earned by grit: {winner} beat {loser} {winner_goals}-{loser_goals} in a match decided on the details.",
    "{winner} beat {loser} {winner_goals}-{loser_goals} in a tight match, decided by the quality of the goal scored by {top_scorer}.",
    "No room for error: {winner} beat {loser} {winner_goals}-{loser_goals} in a tight match where the goal came early and was protected to the end.",
    "Triumph by detail: {winner} beat {loser} {winner_goals}-{loser_goals}, and the small score shows the on-pitch balance.",
    "{winner} held off {loser} as best they could and won {winner_goals}-{loser_goals}. Slim win, but three important points.",
    "Slim win: {winner} {winner_goals}-{loser_goals} {loser}, with electrifying close and a savior goal from {top_scorer}.",
  ],
  draw_goalfest: [
    "Goal-filled draw: {home} {home_goals}-{away_goals} {away}, in a thriller packed with emotion from start to finish.",
    "What a match! {home} and {away} ended at {home_goals}-{away_goals} in a high-scoring contest with little defense.",
    "{home} {home_goals}-{away_goals} {away}: festive draw, with goals on both sides and nervous fans throughout.",
    "Open-game draw: {home} and {away} split points at {home_goals}-{away_goals} in a frenetic match.",
    "For those who like goals, there was something for everyone: {home} {home_goals}-{away_goals} {away} in a confrontation packed with emotion.",
    "Lively draw {stadium_clause}: {home} and {away} ended at {home_goals}-{away_goals} in a match full of ups and downs.",
    "No winner, but football aplenty: {home} {home_goals}-{away_goals} {away} in a match of goals, emotion, and an open finish.",
    "Festive draw: {home} and {away} made it {home_goals}-{away_goals} in a match worthy of a soap opera chapter.",
    "Winnerless thriller: {home} {home_goals}-{away_goals} {away}, with chances on both sides and finishing nothing to fault.",
    "Open-match draw: {home} {home_goals}-{away_goals} {away}, in a contest that could have gone either way.",
    "{home} and {away} split points at {home_goals}-{away_goals} in an open contest. Whoever watched didn't lack emotion.",
    "Dramatic draw: {home} {home_goals}-{away_goals} {away}, with late goals that kept the match open until the whistle.",
    "Each going their way: {home} and {away} ended {home_goals}-{away_goals} in a match packed with chances for both teams.",
    "Draw worthy of spectacle: {home} {home_goals}-{away_goals} {away}, with moments for both attacks to shine.",
    "Whoever watched the match saw it all: {home} {home_goals}-{away_goals} {away}, fair draw in a contest played on equal terms.",
    "Goal-filled draw {stadium_clause}: {home} {home_goals}-{away_goals} {away} in a match for the conversations of the week.",
    "{home} and {away} leveled at {home_goals}-{away_goals} in an open match that asked for more minutes of overtime.",
    "Heated draw: {home} {home_goals}-{away_goals} {away} in a confrontation that had everything except a winner.",
    "Goal party, point-sharing: {home} and {away} made it {home_goals}-{away_goals} in a match that earned its keep through spectacle.",
    "{home} {home_goals}-{away_goals} {away}: generous draw in goals, restrictive in points.",
  ],
  draw_low: [
    "Goalless draw: {home} {home_goals}-{away_goals} {away} in a stuck match {stadium_clause}, with defenses outshining attacks.",
    "{home} {home_goals}-{away_goals} {away}: slim draw, match of few clear plays and lots of marking.",
    "Equality on the scoreboard and in the difficulties: {home} and {away} ended at {home_goals}-{away_goals} in a stuck match from start to finish.",
    "{home} {home_goals}-{away_goals} {away}: stuck-match draw, decided more on errors than on quality plays.",
    "Without major emotions: {home} and {away} made it {home_goals}-{away_goals} in a confrontation locked at midfield.",
    "Slim draw between {home} and {away}: {home_goals}-{away_goals}, with few minutes of actual football.",
    "Tied-up match, slim draw: {home} {home_goals}-{away_goals} {away} in a match of few opportunities.",
    "{home} and {away} split points at {home_goals}-{away_goals} in a slow match, more tactical than emotional.",
    "Bureaucratic draw: {home} {home_goals}-{away_goals} {away}, in a confrontation of little offensive output from either side.",
    "{home} {home_goals}-{away_goals} {away}: draw without spectacle, match decided by the marking.",
    "Slim draw: {home} and {away} made it {home_goals}-{away_goals} in a tied-up match in every sector.",
    "{home} and {away} didn't escape {home_goals}-{away_goals} in a match of few real shots.",
    "Lackluster draw: {home} {home_goals}-{away_goals} {away} in a confrontation controlled by the defenses.",
    "{home} and {away} ended at {home_goals}-{away_goals} in a match decided more by fatigue than by talent.",
    "Tight draw: {home} {home_goals}-{away_goals} {away}, hard-fought match with few real chances of a goal.",
    "No goals, no major emotions: {home} {home_goals}-{away_goals} {away} in a balanced but unproductive match.",
    "{home} {home_goals}-{away_goals} {away}: draw decided in the marking, with attentive defenses and frustrated attacks.",
    "Draw under figurative rain: {home} {home_goals}-{away_goals} {away} in a match of little joy.",
    "{home} and {away} made it {home_goals}-{away_goals} in a stuck match, with no big moments for either side.",
    "Lackluster draw: {home} {home_goals}-{away_goals} {away}, with defenses standing out more than attacks.",
  ],
};

// ── Classifier ──
// Order matters — first match wins. Special-case buckets (red card,
// penalty, comeback, late winner) take priority over score-based ones
// so a 2-1 win decided by penalty doesn't get flattened into narrow_win.
export function classifyMatch(f: MatchRecapFacts): MatchRecapBucket {
  const winner: 'home' | 'away' | 'draw' =
    f.homeGoals > f.awayGoals ? 'home' : f.homeGoals < f.awayGoals ? 'away' : 'draw';
  const diff = Math.abs(f.homeGoals - f.awayGoals);
  const sum = f.homeGoals + f.awayGoals;

  if (winner !== 'draw' && f.redCardPlayerName && f.redCardLoserSide) return 'red_card_decided';
  if (winner !== 'draw' && f.decisivePenaltyScorer && diff === 1) return 'penalty_decided';
  if (winner !== 'draw' && f.hasComeback) return 'comeback';
  if (winner !== 'draw' && f.lateScorerName && f.lateMinute && f.lateMinute >= 80 && diff === 1) return 'late_winner';
  if (diff >= 3) return 'rout';
  if (sum >= 5 && (diff === 1 || diff === 2)) return 'jogao';
  if (diff === 2) return 'comfortable_win';
  if (diff === 1) return 'narrow_win';
  if (winner === 'draw' && f.homeGoals >= 2) return 'draw_goalfest';
  return 'draw_low';
}

// ── Picker + filler ──
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string, vars: Record<string, string | number | null>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const replacement = v == null ? '' : String(v);
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), replacement);
  }
  // Cleanup: collapse multiple spaces and stray whitespace before punctuation
  return out.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

export function assembleMatchRecap(facts: MatchRecapFacts, lang: 'pt' | 'en'): { bucket: MatchRecapBucket; body: string } {
  const bucket = classifyMatch(facts);
  const templates = (lang === 'en' ? TEMPLATES_EN : TEMPLATES_PT)[bucket];
  const template = pickRandom(templates);

  const winnerName = facts.homeGoals > facts.awayGoals ? facts.homeName : facts.awayName;
  const loserName = facts.homeGoals > facts.awayGoals ? facts.awayName : facts.homeName;
  const winnerGoals = Math.max(facts.homeGoals, facts.awayGoals);
  const loserGoals = Math.min(facts.homeGoals, facts.awayGoals);

  const stadiumClause = facts.stadium
    ? (lang === 'en' ? `at ${facts.stadium}` : `em ${facts.stadium}`)
    : (lang === 'en' ? 'at home' : 'em casa');

  const body = fillTemplate(template, {
    home: facts.homeName,
    away: facts.awayName,
    home_goals: facts.homeGoals,
    away_goals: facts.awayGoals,
    winner: winnerName,
    loser: loserName,
    winner_goals: winnerGoals,
    loser_goals: loserGoals,
    stadium: facts.stadium ?? '',
    stadium_clause: stadiumClause,
    round: facts.round ?? '',
    top_scorer: facts.topScorerName ?? '',
    top_scorer_goals: facts.topScorerGoals,
    late_scorer: facts.lateScorerName ?? '',
    late_minute: facts.lateMinute ?? '',
    red_card_player: facts.redCardPlayerName ?? '',
    decisive_penalty_scorer: facts.decisivePenaltyScorer ?? '',
  });

  return { bucket, body };
}

// ── Fact extraction from DB ──
// Supabase client is passed in (created with service_role inside the
// engine), so we don't bypass anything here — just read.

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any>>;

async function extractFacts(supabase: SupabaseClient, matchId: string): Promise<MatchRecapFacts | null> {
  // Match + clubs
  const { data: match } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score, started_at')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return null;

  const [{ data: homeClub }, { data: awayClub }] = await Promise.all([
    supabase.from('clubs').select('id, name').eq('id', match.home_club_id).maybeSingle(),
    supabase.from('clubs').select('id, name').eq('id', match.away_club_id).maybeSingle(),
  ]);

  // Stadium of the home club
  const { data: stadium } = await supabase
    .from('stadiums')
    .select('name')
    .eq('club_id', match.home_club_id)
    .maybeSingle();

  // League round (if league match)
  let round: number | null = null;
  const { data: leagueMatch } = await supabase
    .from('league_matches')
    .select('round_id')
    .eq('match_id', matchId)
    .maybeSingle();
  if (leagueMatch?.round_id) {
    const { data: roundRow } = await supabase
      .from('league_rounds')
      .select('round_number')
      .eq('id', leagueMatch.round_id)
      .maybeSingle();
    round = roundRow?.round_number ?? null;
  }

  // Events: goals, red cards
  const { data: events } = await supabase
    .from('match_event_logs')
    .select('event_type, title, body, payload, created_at')
    .eq('match_id', matchId)
    .in('event_type', ['goal', 'red_card'])
    .order('created_at', { ascending: true });

  const goals = (events ?? []).filter((e: any) => e.event_type === 'goal');
  const reds = (events ?? []).filter((e: any) => e.event_type === 'red_card');

  // Top scorer: the name with the most goals overall (any side)
  const goalCount = new Map<string, { name: string; club: string | null; count: number }>();
  for (const g of goals) {
    const name = (g.payload as any)?.scorer_name ?? null;
    const club = (g.payload as any)?.scorer_club_id ?? null;
    if (!name) continue;
    const prev = goalCount.get(name);
    if (prev) prev.count += 1;
    else goalCount.set(name, { name, club, count: 1 });
  }
  let topScorerName: string | null = null;
  let topScorerGoals = 0;
  for (const v of goalCount.values()) {
    if (v.count > topScorerGoals) {
      topScorerGoals = v.count;
      topScorerName = v.name;
    }
  }

  // Compute approximate minute for each goal from created_at vs started_at.
  // Engine ticks ≈ minutes; this is a coarse heuristic but good enough for
  // distinguishing "late winner" (>=80') from earlier strikes.
  const startedAt = match.started_at ? new Date(match.started_at).getTime() : 0;
  const minuteOf = (createdAt: string): number => {
    if (!startedAt) return 0;
    const t = new Date(createdAt).getTime();
    return Math.max(0, Math.round((t - startedAt) / 60000));
  };

  // Comeback detection: track running score, see if the eventual winner was ever behind.
  let runningHome = 0;
  let runningAway = 0;
  let homeEverBehind = false;
  let awayEverBehind = false;
  for (const g of goals) {
    const clubId = (g.payload as any)?.scorer_club_id;
    if (clubId === match.home_club_id) runningHome += 1;
    else if (clubId === match.away_club_id) runningAway += 1;
    if (runningHome < runningAway) homeEverBehind = true;
    if (runningAway < runningHome) awayEverBehind = true;
  }
  const winnerSide: 'home' | 'away' | 'draw' =
    match.home_score > match.away_score ? 'home' : match.home_score < match.away_score ? 'away' : 'draw';
  const hasComeback =
    (winnerSide === 'home' && homeEverBehind) ||
    (winnerSide === 'away' && awayEverBehind);

  // Late winner: the last goal scored by the winning side, if minute >= 80
  let lateScorerName: string | null = null;
  let lateMinute: number | null = null;
  if (winnerSide !== 'draw') {
    const winnerClubId = winnerSide === 'home' ? match.home_club_id : match.away_club_id;
    const winnerGoalsList = goals.filter((g: any) => g.payload?.scorer_club_id === winnerClubId);
    const lastWinnerGoal = winnerGoalsList[winnerGoalsList.length - 1];
    if (lastWinnerGoal) {
      const m = minuteOf(lastWinnerGoal.created_at);
      if (m >= 80) {
        lateScorerName = (lastWinnerGoal.payload as any)?.scorer_name ?? null;
        lateMinute = m;
      }
    }
  }

  // Red card from the losing side (decisive)
  let redCardPlayerName: string | null = null;
  let redCardLoserSide = false;
  if (winnerSide !== 'draw' && reds.length > 0) {
    const loserClubId = winnerSide === 'home' ? match.away_club_id : match.home_club_id;
    const loserRed = reds.find((r: any) => r.payload?.club_id === loserClubId || r.payload?.scorer_club_id === loserClubId);
    if (loserRed) {
      redCardPlayerName = (loserRed.payload as any)?.player_name ?? (loserRed.payload as any)?.scorer_name ?? null;
      redCardLoserSide = !!redCardPlayerName;
    }
  }

  // Penalty heuristic: look for "pênalti"/"penalty" mentions in the
  // last winner goal's title or body (engine writes Portuguese titles).
  let decisivePenaltyScorer: string | null = null;
  if (winnerSide !== 'draw') {
    const winnerClubId = winnerSide === 'home' ? match.home_club_id : match.away_club_id;
    const winnerGoalsList = goals.filter((g: any) => g.payload?.scorer_club_id === winnerClubId);
    const lastWinnerGoal = winnerGoalsList[winnerGoalsList.length - 1];
    if (lastWinnerGoal) {
      const text = `${lastWinnerGoal.title ?? ''} ${lastWinnerGoal.body ?? ''}`.toLowerCase();
      if (/p[êe]nal/.test(text) || (lastWinnerGoal.payload as any)?.kind === 'penalty') {
        decisivePenaltyScorer = (lastWinnerGoal.payload as any)?.scorer_name ?? null;
      }
    }
  }

  return {
    homeName: homeClub?.name ?? 'Time da casa',
    awayName: awayClub?.name ?? 'Visitante',
    homeGoals: match.home_score,
    awayGoals: match.away_score,
    stadium: stadium?.name ?? null,
    round,
    topScorerName,
    topScorerGoals,
    lateScorerName,
    lateMinute,
    redCardPlayerName,
    redCardLoserSide,
    hasComeback,
    decisivePenaltyScorer,
  };
}

// ── Top-level entry point: extract facts, assemble bilingual recap, persist. ──
// Idempotent — narratives table has UNIQUE (entity_type, entity_id, scope),
// so a second call after final_whistle won't overwrite the first recap.
export async function generateAndPersistMatchRecap(supabase: SupabaseClient, matchId: string): Promise<void> {
  try {
    const facts = await extractFacts(supabase, matchId);
    if (!facts) return;

    const pt = assembleMatchRecap(facts, 'pt');
    const en = assembleMatchRecap(facts, 'en');

    await supabase.from('narratives').insert({
      entity_type: 'match',
      entity_id: matchId,
      scope: 'match_recap',
      body_pt: pt.body,
      body_en: en.body,
      facts_json: { ...facts, bucket: pt.bucket },
    });
  } catch (err) {
    // Recap generation is best-effort — never block the engine.
    console.error('[match_recap] generation failed:', err);
  }
}
