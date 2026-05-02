// Match Recap narrative system v2 (Deno).
// 3-paragraph structure: §1 (match overview by bucket) + §2 (individual
// highlight: hat-trick, gk hero, dribble play, etc.) + §3 (table
// implication: leader, top4, relegation, top scorer change). Picks one
// template from each bucket and joins with a blank line.

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

type Par2Type =
  | 'hat_trick'
  | 'red_card_drama'
  | 'gk_hero'
  | 'dribble_play'
  | 'top_scorer_brace'
  | 'shot_machine'
  | 'tackle_master'
  | 'generic';

type Par3Type =
  | 'leader'
  | 'top4'
  | 'relegation'
  | 'midtable'
  | 'new_top_scorer'
  | 'draw_neutral';

export interface MatchRecapFacts {
  // Basic
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  homeClubId: string;
  awayClubId: string;
  stadium: string | null;
  round: number | null;

  // Special bucket triggers
  hasComeback: boolean;
  decisivePenaltyScorer: string | null;
  lateScorerName: string | null;
  lateMinute: number | null;
  redCardPlayerName: string | null;
  redCardLoserSide: boolean;

  // Individual highlights
  hatTrickPlayer: string | null;
  hatTrickGoals: number;
  matchTopScorerName: string | null;
  matchTopScorerGoals: number;
  gkHeroName: string | null;
  gkHeroSaves: number;
  dribblePlayPlayer: string | null;
  dribblePlayCount: number;
  shotMachineName: string | null;
  shotMachineCount: number;
  tackleMasterName: string | null;
  tackleMasterCount: number;
  yellowCardCount: number;

  // Standings (after match)
  numClubsInLeague: number;
  leaderClubName: string | null;
  isWinnerLeader: boolean;
  winnerStandingPos: number | null;
  winnerPoints: number;
  loserStandingPos: number | null;
  loserPoints: number;
  homeStandingPos: number | null;
  homePoints: number;
  awayStandingPos: number | null;
  awayPoints: number;

  // Season top scorer
  seasonTopScorerName: string | null;
  seasonTopScorerGoals: number;
}

// ── PT §1 templates (one per bucket × 3) ──
const PAR1_PT: Record<MatchRecapBucket, string[]> = {
  red_card_decided: [
    "{loser} ficou com um a menos cedo após expulsão de {red_card_player} e perdeu para {winner} por {winner_goals} a {loser_goals}{round_clause}. Os mandantes administraram a vantagem numérica com inteligência, controlaram a posse de bola e exploraram os espaços deixados pela equipe desfalcada. A diferença numérica fez o estrago: {loser} não conseguiu organizar saída de bola, foi pressionado constantemente e viu o jogo escorrer entre os dedos enquanto {winner} ditava o ritmo da partida {stadium_clause}.",
    "Vermelho de {red_card_player} mudou tudo {stadium_clause}: {winner} venceu {loser} por {winner_goals}-{loser_goals}{round_clause} explorando com competência o homem a mais. A partir da expulsão, o time foi totalmente dominado, viu o adversário tomar conta do meio-campo e tentar acelerar as transições ofensivas a cada bola recuperada. Foi um daqueles jogos em que o cartão escreveu o roteiro, e a torcida adversária aproveitou cada minuto da inferioridade numérica.",
    "{winner} {winner_goals} x {loser_goals} {loser}{round_clause}: a noite ficou marcada pela expulsão de {red_card_player}, que abriu as portas pra vitória dos mandantes. Antes do cartão, o jogo era estudado e equilibrado, mas a saída forçada do jogador desorganizou completamente a estrutura defensiva do time perdedor. {winner} aproveitou a vantagem numérica pra impor seu jogo, marcar gols decisivos e administrar o resultado até o apito final {stadium_clause}.",
  ],
  penalty_decided: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals}{round_clause} num jogo decidido na bola parada — {decisive_penalty_scorer} bateu firme da marca da cal e converteu o pênalti que valeu três pontos. A partida foi equilibrada do começo ao fim, com defesas atentas e ataques travados {stadium_clause}, e a única bola que entrou veio em uma cobrança preparada e executada com a frieza necessária no momento mais tenso. Não foi bonita, mas foi vitória.",
    "Pênalti convertido por {decisive_penalty_scorer} fez a diferença: {winner} bateu {loser} por {winner_goals}-{loser_goals}{round_clause} numa partida que estava aberta até a chance da bola da cal. Os times trocavam golpes no meio-campo sem grandes finalizações claras, e quando finalmente surgiu a oportunidade, o batedor cumpriu seu papel com classe. Vitória apertada mas extremamente importante pra equipe vencedora, que sai {stadium_clause} com um resultado precioso.",
    "Decisão na cal: {winner} venceu {loser} por {winner_goals} a {loser_goals}{round_clause} com gol de pênalti convertido por {decisive_penalty_scorer}. Era um jogo de poucas chances, com defesas se sobressaindo aos ataques e cada finalização sendo motivo de comemoração antecipada. Quando o pênalti foi marcado, todo mundo no estádio segurou a respiração — e o batedor não decepcionou. Três pontos importantíssimos pra {winner} numa noite tensa {stadium_clause}.",
  ],
  comeback: [
    "Virada épica {stadium_clause}: {winner} estava perdendo, mas reagiu e bateu {loser} por {winner_goals} a {loser_goals}{round_clause} numa partida pra entrar na galeria das viradas memoráveis. {loser} chegou a abrir vantagem ainda no primeiro tempo e parecia caminhar tranquilamente pra vitória, até que {winner} resolveu mudar o roteiro com pressão alta, troca de passes mais rápida e finalizações precisas. Time que não desistiu, jogo que não acabou até o último apito.",
    "{winner} {winner_goals} x {loser_goals} {loser}{round_clause}: virada construída na raça depois de sair atrás do placar. {loser} comemorou cedo demais a vantagem inicial e viu o adversário crescer minuto a minuto, recuperar bolas no meio-campo e impor um ritmo que não conseguiu acompanhar. Foi um segundo tempo dominado pelos vencedores, com torcida em estado de delírio a cada gol marcado {stadium_clause}. Reação que vale ainda mais do que três pontos.",
    "Caráter no estilo bruto: {winner} virou o placar contra {loser} e venceu por {winner_goals}-{loser_goals}{round_clause}. O time vencedor, que viu o adversário abrir o placar e administrar a vantagem por boa parte do jogo, encontrou forças no fôlego dos minutos finais pra reverter o roteiro. Cada bola disputada virava uma trincheira de orgulho, e a torcida {stadium_clause} respondeu à altura. Vitória de quem entendeu que não dava pra perder mais essa.",
  ],
  late_winner: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals}{round_clause} num final dramático {stadium_clause} — {late_scorer} balançou as redes aos {late_minute}' e fez a torcida explodir nos minutos finais. Até aquele momento, tudo indicava empate, com defesas vencendo a maioria dos lances e ataques travados pelos sistemas defensivos bem organizados. Mas, quando todos já contavam com a divisão de pontos, surgiu o gol salvador que decidiu a partida no último suspiro.",
    "Aos {late_minute}', {late_scorer} marcou o gol da vitória que valeu três pontos pra {winner}. {winner} {winner_goals} x {loser_goals} {loser}{round_clause}, num jogo que foi se arrastando até a explosão final {stadium_clause}. As duas equipes pareciam aceitar o empate, com poucas chances reais de gol durante todo o segundo tempo, até que numa última jogada o atacante apareceu pra fazer a diferença. Vitória de quem insistiu até o último lance.",
    "Final eletrizante {stadium_clause}: {late_scorer} fez aos {late_minute}' o gol que decidiu a partida, e {winner} venceu {loser} por {winner_goals}-{loser_goals}{round_clause} no apagar das luzes. O jogo estava aberto, com momentos de pressão pros dois lados, mas sem aquela jogada definitiva que mudasse o placar. Coube ao herói da noite resolver com uma finalização salvadora nos minutos finais, num daqueles gols que ficam guardados na memória da torcida vencedora por muito tempo.",
  ],
  rout: [
    "Não teve história {stadium_clause}: {winner} atropelou {loser} por {winner_goals} a {loser_goals}{round_clause} num jogo de mão única do começo ao fim. Os mandantes abriram o placar cedo, controlaram totalmente o ritmo da partida e mantiveram a pressão até o apito final, sem dar chances reais ao adversário. O domínio absoluto se traduziu em finalizações em sequência e numa exibição de futebol que justifica plenamente o resultado elástico.",
    "{winner} {winner_goals} x {loser_goals} {loser}{round_clause}: goleada construída com paciência, qualidade técnica e finalização clínica {stadium_clause}. {loser} não conseguiu sair do próprio campo nos primeiros 30 minutos, e quando finalmente cruzou o meio-campo, já estava com o placar sangrando. Foi um jogo que mostrou claramente quem estava mais bem preparado, e os números na placa só reforçam essa diferença gritante na noite.",
    "Atropelamento total {stadium_clause}: {winner} bateu {loser} por {winner_goals} a {loser_goals}{round_clause} numa noite em que o time mandante simplesmente não deu chance pro adversário respirar. Pressão alta, transições rápidas, finalização precisa — um coquetel ofensivo que a defesa visitante não conseguiu desarmar em momento algum. Quando soou o apito final, a sensação era de que o placar poderia ter sido ainda maior, e a torcida saiu de campo aplaudindo de pé.",
  ],
  jogao: [
    "Que partida {stadium_clause}! {home} {home_goals} x {away_goals} {away}{round_clause} num jogão pra entrar pra história, com gols rolando dos dois lados e emoção até o último minuto. As defesas pareciam inexistentes, os ataques entraram em estado de graça, e cada vez que a bola cruzava o meio-campo era ameaça concreta de gol. Vitória de {winner} num confronto que mereceu cada minuto de atenção da torcida e que vai render conversa por dias.",
    "{home} e {away} fizeram um jogaço {stadium_clause}: {home_goals}-{away_goals}{round_clause}, vitória de {winner} numa noite recheada de gols e emoção. As duas equipes entraram em campo dispostas a atacar, e o resultado foi um espetáculo aberto, com chances claras pros dois lados, finalizações em sequência e um clima de mata-mata mesmo numa partida de pontos corridos. Quem viu não esquece — o tipo de jogo que aproxima a torcida do espetáculo.",
    "Espetáculo {stadium_clause}: {winner} venceu {loser} por {winner_goals}-{loser_goals}{round_clause} num jogão recheado de emoção do início ao fim. Os times entraram com tudo, abriram o jogo desde os primeiros minutos, e o resultado foi uma partida de muitos gols, polêmicas e final tenso até o apito. Vitória de {winner} que terá lugar de destaque entre as melhores partidas da rodada — daquelas que rendem horas de comentário e ficam marcadas no calendário.",
  ],
  comfortable_win: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals}{round_clause} num jogo controlado de ponta a ponta {stadium_clause}. A vantagem foi construída ainda no primeiro tempo, e a partir daí os mandantes administraram o resultado com competência, valorizando a posse de bola e fechando os espaços defensivos. Sem grandes sustos no segundo tempo, foi um triunfo dentro do esperado pra equipe que entrou em campo como favorita, cumprindo seu papel sem brilho excepcional mas com eficiência.",
    "Vitória sólida e tranquila: {winner} bateu {loser} por {winner_goals}-{loser_goals}{round_clause} num jogo bem controlado pelos mandantes {stadium_clause}. Não foi a partida mais espetacular do calendário, mas foi competente — domínio claro do começo ao fim, finalização eficiente nas chances criadas e defesa atenta nos contra-ataques adversários. Triunfo merecido que reforça o momento positivo da equipe vencedora e a coloca entre as protagonistas da temporada.",
    "{winner} {winner_goals} x {loser_goals} {loser}{round_clause}: triunfo confortável {stadium_clause}, com a vantagem encaminhada antes mesmo do segundo tempo começar. Não havia mistério na partida — diferença técnica clara, organização tática melhor estruturada, e jogadores entrosados explorando os pontos fracos do adversário. Vitória sem brilho excepcional mas com eficiência, daquelas que constroem temporada e mostram regularidade num campeonato em que cada ponto pesa muito.",
  ],
  narrow_win: [
    "{winner} venceu {loser} por {winner_goals} a {loser_goals}{round_clause} num jogo apertado decidido nos detalhes {stadium_clause}. Foram poucas as chances claras pros dois lados, com defesas atentas e meios-campos disputados em cada bola dividida. O gol que valeu três pontos veio numa jogada bem trabalhada, e a partir dali a equipe vencedora soube administrar o resultado com inteligência, fechando os espaços e segurando a pressão final do adversário.",
    "Triunfo curto mas valioso: {winner} bateu {loser} por {winner_goals}-{loser_goals}{round_clause} num confronto equilibrado decidido pela qualidade do gol marcado. Os times se anularam taticamente por boa parte da partida {stadium_clause}, com posse de bola dividida e finalizações escassas, e foi preciso uma jogada individual de qualidade pra desempatar. Vitória magra que soma três pontos importantes na campanha e mantém a confiança em alta pra próxima rodada.",
    "{winner} {winner_goals} x {loser_goals} {loser}{round_clause}: vitória apertada num jogo pegado em todos os setores. Bola dividida, marcação dura, finalização escassa — uma típica partida de campeonato em que cada ponto pesa demais e os times entram preocupados em primeiro lugar não tomar gol. {winner} aproveitou a única chance que teve com clareza de finalização e garantiu o triunfo no detalhe, saindo {stadium_clause} com três pontos preciosos no bolso.",
  ],
  draw_goalfest: [
    "Empate movimentado {stadium_clause}: {home} {home_goals} x {away_goals} {away}{round_clause} num jogo recheado de emoção do início ao fim. As duas equipes entraram com mentalidade ofensiva, abriram o jogo desde os primeiros minutos, e o resultado foi uma partida com gols dos dois lados, viradas no placar e clima de festa nas arquibancadas. Não teve vencedor mas teve futebol — e a torcida saiu de campo com a sensação de ter assistido a uma partida especial.",
    "{home} e {away} fizeram um espetáculo {stadium_clause}: {home_goals}-{away_goals}{round_clause}, empate festivo digno de capítulo de novela. Os times trocaram golpes no meio-campo, criaram chances claras nos dois lados, e cada bola que entrava parecia abrir o caminho pra mais. No fim, ficou tudo igual — mas pra quem assistiu foi um jogo pra guardar na memória, com momentos de qualidade técnica que valorizam o espetáculo do futebol.",
    "Empate generoso em gols: {home} {home_goals} x {away_goals} {away}{round_clause} num jogo aberto que poderia ter ido pra qualquer lado. Defesas instáveis, ataques inspirados, e um ritmo frenético do começo ao fim {stadium_clause}. Cada equipe abriu vantagens em momentos diferentes da partida, mas nenhuma conseguiu manter — e o resultado é um placar generoso em gols, restritivo em pontos, mas certamente generoso em emoção pra quem comprou o ingresso.",
  ],
  draw_low: [
    "Empate sem brilho {stadium_clause}: {home} {home_goals} x {away_goals} {away}{round_clause} num jogo travado em todos os setores. Os meios-campos cancelaram-se mutuamente, as defesas se sobressaíram aos ataques, e as poucas finalizações que aconteceram esbarraram em goleiros bem postados. Foi mais uma partida tática do que técnica, com os dois times preocupados em primeiro lugar não tomar gol — e o resultado, embora justo, deixa a sensação de oportunidade desperdiçada pra quem queria os três pontos.",
    "{home} e {away} dividiram pontos no {home_goals}-{away_goals}{round_clause} num confronto preso ao meio-campo {stadium_clause}. Foram raras as chances claras de gol, com defesas atentas, marcações bem feitas e ataques sem inspiração. Empate burocrático, decidido mais pelo cansaço e pela falta de ousadia do que pelo talento individual ou coletivo das duas equipes. Pontinho que serve, mas não empolga ninguém.",
    "{home} {home_goals} x {away_goals} {away}{round_clause}: empate de jogo emperrado, decidido nos erros mais que nos acertos. {stadium_clause}, o que se viu foi um confronto tático, com poucos minutos de futebol propriamente dito e muitas paralisações pra reorganização defensiva. Quando soou o apito final, a sensação geral era de que ambos saíram satisfeitos com o ponto, mas a torcida ficou querendo mais ousadia — daquelas partidas que se assistem por obrigação e se esquecem rapidamente.",
  ],
};

// ── PT §2 templates (individual highlights) ──
const PAR2_PT: Record<Par2Type, string[]> = {
  hat_trick: [
    "{hat_trick_player} foi o nome inquestionável da partida — {hat_trick_goals} gols solitários, cada um construído de uma maneira diferente, cada um decisivo pro desenrolar do jogo. O atacante mostrou faro de gol em todas as situações que apareceram, finalizou com precisão dentro e fora da área, e provou por que tem chamado atenção dos olheiros das principais equipes. Hat-trick que entra direto pra galeria das melhores atuações individuais da temporada.",
    "Noite mágica de {hat_trick_player}: {hat_trick_goals} gols num só jogo, números de jogador em estado de graça absoluto. Não tem como elaborar sobre uma atuação dessas — o atacante esteve em todos os lances importantes, encontrou os caminhos do gol em situações distintas e carregou o time sozinho nos momentos em que precisou. Hat-trick que coloca o nome dele entre os destaques da rodada e prova mais uma vez seu valor pro elenco.",
    "Quando o time precisou, {hat_trick_player} respondeu com {hat_trick_goals} gols. Hat-trick construído com qualidade técnica, posicionamento certo na hora certa e aquela faísca de talento que separa os jogadores comuns dos artilheiros consagrados. Atuação que vai render conversa por semanas e que reforça por que ele é, hoje, uma das principais armas ofensivas da equipe — daquelas exibições que entram pra história pessoal e merecem destaque nos jornais.",
  ],
  red_card_drama: [
    "A expulsão de {red_card_player} foi o lance que mais marcou o roteiro do jogo. Cartão dado em momento decisivo, decisão polêmica que dividiu opiniões na arquibancada e nos comentários — alguns defendendo o rigor da arbitragem, outros achando exagero pelo que viram em campo. Independentemente da análise técnica, o fato é que o jogador deixou os companheiros em desvantagem numérica e mudou completamente o equilíbrio de forças que vinha sendo estabelecido até ali.",
    "{red_card_player} foi pra rua e mudou o rumo da partida. Expulsão controversa, com torcida vibrando ou reclamando dependendo do lado da arquibancada, mas que teve impacto enorme no que veio depois. O time que ficou com um a menos perdeu organização, pressão ofensiva e capacidade de reagir, e viu o adversário ditar o ritmo final com tranquilidade. Cartão vermelho que vai render discussão e análise nos próximos dias entre torcedores e comentaristas.",
    "Cartão vermelho de {red_card_player} ficou marcado como o ponto de inflexão do jogo. Antes da expulsão, o equilíbrio entre os times era visível e as duas equipes mantinham a chance de vencer. Depois, o cenário virou completamente — quem ficou com o homem a mais aproveitou bem a vantagem, e quem perdeu o jogador desabou dentro do próprio sistema. Foi a jogada que escreveu o desfecho da partida, gostando ou não da análise da arbitragem.",
  ],
  gk_hero: [
    "{gk_hero} foi o nome menos esperado da noite — o goleiro fez {gk_hero_saves} defesas importantes e segurou o time numa atuação digna de admiração. Em momentos cruciais, ele apareceu pra evitar gols certeiros, vestiu a capa de herói e impediu que o placar tomasse rumo diferente. Pra quem assistiu, ficou claro: sem o trabalho dele entre as traves, o resultado teria sido outro, e o time saiu da partida devendo muito pra esse desempenho.",
    "Noite de gala pra {gk_hero}: o goleiro fez {gk_hero_saves} defesas dificílimas e foi o herói anônimo da partida. Bola na trave, finalização cara a cara, chute de fora da área — em todas as situações o arqueiro respondeu com reflexo e posicionamento perfeitos. Atuações como essa são as que separam goleiros comuns dos verdadeiros guardiões, e dificilmente vai passar despercebida pelos analistas da rodada nem pela torcida do clube.",
    "{gk_hero} salvou o time. {gk_hero_saves} defesas providenciais, em momentos em que a partida já parecia perdida, garantiram um resultado que não teria sido possível sem o trabalho dele. Goleiro que cresce nas partidas decisivas, que tem sangue frio nos momentos de pressão e que mostra por que é considerado peça fundamental do elenco — pra ser justo na avaliação geral, ele provavelmente foi o jogador mais importante do confronto.",
  ],
  dribble_play: [
    "O lance que decidiu a partida começou com {dribble_play_player} carregando a bola e passando por {dribble_play_count} marcadores em sequência. Foi uma jogada individual pra entrar em qualquer compilação de melhores momentos da rodada — drible curto, finta de corpo, mudança de direção repentina — e culminou no gol que ficou marcado como ponto alto da partida. Tipo de jogada que separa atletas medianos dos verdadeiramente diferenciados em campo.",
    "{dribble_play_player} fez sozinho o que muitos times tentam fazer com ataque organizado: passou por {dribble_play_count} adversários, criou seu próprio espaço e gerou a finalização mais perigosa do jogo. Foi uma exibição de talento individual que justifica plenamente seu papel de protagonista no esquema técnico do treinador. Lance que vai render replay em todos os programas esportivos da semana e que entra pra galeria pessoal do jogador.",
    "Jogada de craque: {dribble_play_player} pegou a bola, encarou {dribble_play_count} marcadores, driblou com classe e definiu o lance que ficou marcado como ponto alto da partida. Esse tipo de exibição, que mistura técnica refinada com leitura rápida do jogo, é exatamente o que torna o futebol um espetáculo. Atuação que merece destaque na coluna dos melhores momentos da rodada e que confirma o status do jogador entre os principais nomes do elenco.",
  ],
  top_scorer_brace: [
    "{top_scorer} fez os {top_scorer_goals} gols que decidiram o jogo numa atuação de protagonista absoluto. O atacante esteve nos lugares certos nos momentos certos, finalizou com precisão técnica clara e mostrou por que tem chamado atenção dos analistas da rodada. Brace pessoal que reforça seu papel de referência ofensiva do time e o coloca entre os destaques da partida — exatamente o tipo de exibição esperada de um camisa importante do elenco.",
    "Dois gols decisivos de {top_scorer} colocaram o nome do atacante na lista dos protagonistas da rodada. Em situações distintas, ele encontrou o caminho da rede com qualidade técnica, posicionamento adequado e aquela faísca de talento que separa os bons artilheiros dos meramente regulares. Atuação que vai render boa repercussão e que confirma sua importância pro esquema do treinador na temporada — exibição daquelas que entram direto pro radar dos olheiros.",
    "{top_scorer_goals} gols na conta pra {top_scorer}, que foi o nome ofensivo do jogo. Em todas as suas finalizações, o atacante mostrou a frieza necessária, e os dois gols marcados foram fundamentais pro desfecho. Pergunta a quem joga ao lado: o cara faz o que precisa ser feito, no momento que precisa ser feito. Atuação que reforça por que ele é peça-chave no elenco — daquelas exibições que valem o ingresso pra ver o atacante em ação.",
  ],
  shot_machine: [
    "{shot_machine} foi a furadeira da noite: {shot_machine_count} chutes ao longo da partida, alguns no alvo, outros no susto, mas sempre criando perigo na área adversária. O jogador insistiu de longe, tentou dentro da área, finalizou de cabeça — e mesmo sem balançar as redes, foi o atleta mais perigoso do ataque do seu time. Atuação que merece destaque pelo volume de finalizações e pela capacidade de criar perigo constante no setor ofensivo do jogo.",
    "Foi a noite mais frustrante pra {shot_machine} — {shot_machine_count} finalizações tentadas, e nenhuma virou gol. O atacante teve oportunidades pra resolver, mas a precisão não veio na hora certa. Mesmo sem marcar, sua presença incomodou a defesa adversária do começo ao fim, e o desempenho mostra que ele continuou tentando até o último minuto. Tipo de exibição que merece reconhecimento mesmo sem o gol esperado pelos torcedores.",
    "{shot_machine} insistiu durante todo o jogo: {shot_machine_count} chutes, várias situações criadas, mas a finalização não rendeu o que a estatística prometia. O atacante carregou o ataque do time, criou jogadas individuais de qualidade e gerou as principais ameaças da partida. Resta esperar que o número de finalizações vire mais gols nas próximas rodadas — quando isso acontecer, o jogador vai estar entre os candidatos a artilheiro do campeonato.",
  ],
  tackle_master: [
    "{tackle_master} foi o muro defensivo da noite: {tackle_master_count} desarmes ao longo da partida, em momentos em que o time precisava resistir e em momentos em que precisava recuperar bola. Posicionamento perfeito, leitura de jogo exemplar e timing certo na hora de entrar dura na bola — o jogador foi a peça que sustentou a defesa numa noite em que o adversário tentou pressionar. Atuação que vai entrar pros relatórios de estatística da rodada.",
    "Trabalho de bastidor de {tackle_master} merece destaque na crônica desse jogo. {tackle_master_count} desarmes, todos no momento certo, todos sem falta — uma exibição de técnica defensiva que serve de aula pra qualquer zagueiro que queira evoluir. Esses números mostram por que o jogador é considerado peça fundamental do sistema, mesmo que o reconhecimento da torcida costume ir mais pros atacantes que pros pilares defensivos do esquema.",
    "{tackle_master} pegou pra ele a função de proteger a defesa: {tackle_master_count} desarmes na conta, vários deles em situações de perigo iminente. O jogador foi o tampão que faltava em vários momentos da partida, fechando passes nas costas dos zagueiros e neutralizando jogadas que pareciam perigosas. Atuação fundamental que merece reconhecimento na análise pós-jogo — daquelas exibições silenciosas mas absolutamente decisivas pro resultado final.",
  ],
  generic: [
    "{top_scorer} fez o gol que decidiu a partida numa jogada de oportunismo dentro da área. O atacante esteve no lugar certo na hora certa, finalizou sem hesitar e garantiu três pontos preciosos pro time. Não foi a atuação mais espetacular da temporada, mas teve a importância que precisava ter — pra times que disputam objetivos importantes, gols como esse fazem toda a diferença na soma final dos pontos.",
    "Jogo coletivo decidiu a partida — não houve um destaque individual gritante, mas um time que jogou em conjunto. {top_scorer} marcou o gol importante, mas a vitória teve dedo de todo mundo: meio-campo organizado, defesa bem postada, transições rápidas. Tipo de exibição que mostra que treinador e jogadores estão alinhados na proposta tática — daquelas que fazem confiança crescer no elenco.",
    "Sem grandes individualidades brilhando, foi o coletivo quem decidiu o jogo. {top_scorer} fez o gol relevante, mas a história da partida vai pra muitos outros nomes que fizeram seu trabalho silenciosamente. Vitória de equipe, daquelas que reforçam a estrutura do time e mostram que, mesmo sem o ataque inspirado, é possível vencer fazendo o feijão com arroz tático bem feito.",
  ],
};

// ── PT §3 templates (table implication) ──
const PAR3_PT: Record<Par3Type, string[]> = {
  leader: [
    "Com a vitória, {winner} chega aos {winner_points} pontos e segue na ponta da tabela isolado. Posição {winner_pos} ocupada com folga, jogo a jogo, e a sensação de que a equipe está em momento dominante na temporada. Vai precisar manter essa regularidade pra confirmar a expectativa do título no fim do campeonato, mas o fato é que hoje {winner} é o time mais consistente da competição — ninguém aparenta querer arrancar a liderança a curto prazo.",
    "{winner} reforça liderança da competição com mais três pontos: {winner_points} no total, posição {winner_pos} mantida com tranquilidade. A vitória consolida a equipe como favorita ao título, com regularidade de atuações e elenco em sintonia. Próximas rodadas vão definir se a vantagem aberta vira realidade matemática ou se algum perseguidor vai conseguir se aproximar — mas no momento, o ambiente é de confiança total e foco em manter o ritmo.",
    "Liderança confirmada: {winner} ocupa o primeiro lugar com {winner_points} pontos depois desta vitória. {leader_club} segue como referência da temporada, jogando em alto nível e mostrando estrutura compatível com a expectativa de título. Quem acompanha o campeonato sabe que ainda há muito chão pela frente, mas o time entra na próxima rodada com a confiança de quem conhece o caminho — e isso faz uma diferença psicológica enorme no decorrer da competição.",
  ],
  top4: [
    "{winner} chega aos {winner_points} pontos com a vitória e ocupa a {winner_pos}ª posição na tabela, dentro da zona de classificação pras competições importantes da próxima temporada. Momento bom da equipe, que vem somando pontos com regularidade e mostrando estrutura tática compatível com os objetivos traçados antes do início do campeonato. Próximas rodadas vão confirmar se a vaga vai virar realidade no fim da competição.",
    "Mais três pontos pra {winner}, que sobe pra {winner_pos}ª posição com {winner_points} pontos. Equipe entra firme na briga pelas vagas em competições continentais, com elenco em sintonia e treinador imprimindo identidade de jogo cada vez mais clara. Vai ser uma reta final de campeonato apertada na luta pelas vagas, mas o time vencedor mostra hoje que tem condições de se manter no pelotão da frente até o final.",
    "{winner} {winner_points} pontos, {winner_pos}ª posição: vitória consolida o time entre os principais candidatos a vagas em torneios continentais. Não é mais surpresa quando aparece em zona de classificação — vem se mostrando regular há várias rodadas, com defesa estável e ataque produtivo. Reta final do campeonato vai ser decisiva pra confirmar o objetivo, mas o ambiente é positivo e o elenco tem demonstrado a maturidade necessária.",
  ],
  relegation: [
    "Do lado perdedor, situação preocupante: {loser} permanece na {loser_pos}ª posição com {loser_points} pontos, dentro da zona de rebaixamento. Reta final do campeonato vai ser dramática, e cada partida agora vale ouro pra equipe escapar do descenso. Pressão na comissão técnica e nos jogadores tende a aumentar nos próximos dias, e a torcida vai cobrar reação imediata se quiser ver o time longe da degola na próxima rodada.",
    "{loser} acumula nova derrota e segue afundando na tabela: {loser_pos}ª colocação com {loser_points} pontos, em situação delicada na luta contra o rebaixamento. O quadro tático precisa de revisão, o desempenho dentro de campo precisa de reação, e o tempo pra correção vai diminuindo a cada rodada que passa. Cobranças virão de todos os lados — torcida, imprensa, diretoria — e a próxima partida vira praticamente uma final pra equipe.",
    "Mais um tropeço pra {loser}, que segue na zona de rebaixamento: posição {loser_pos}, {loser_points} pontos, ambiente de tensão crescente. A reta final do campeonato será fundamental pra definir se a equipe consegue reagir a tempo de evitar o descenso ou se vai cair à temporada seguinte na divisão inferior. Vai precisar de uma virada de chave imediata — em desempenho, em postura, em resultados — pra manter a chance da permanência.",
  ],
  midtable: [
    "{winner} chega aos {winner_points} pontos com esta vitória, ocupando a {winner_pos}ª posição na tabela. Posição mediana que mantém o time longe da zona de rebaixamento mas sem realmente brigar pelas vagas em competições importantes. Reta final pode definir um lado ou outro — depende do nível de regularidade que conseguirem manter nas próximas rodadas. Sem urgência mas sem conforto excessivo é como vai a campanha do time.",
    "Vitória deixa {winner} com {winner_points} pontos, na {winner_pos}ª colocação — posição neutra na tabela, longe da degola e da zona de classificação europeia. Time fica observando o que acontece nas duas pontas e busca encerrar o campeonato com a melhor colocação possível dentro das circunstâncias. Sem grandes pressões, mas também sem grandes ambições no curto prazo, segue trabalhando rodada a rodada na construção da temporada seguinte.",
    "{winner} soma três pontos importantes mas mantém posição mediana: {winner_pos}º lugar com {winner_points} pontos. A equipe segue distante das pontas — não brigando pelo título nem ameaçada pelo rebaixamento — em uma temporada de manutenção e de planejamento pro futuro. Cada vitória conta, mas não muda muito o quadro geral; é momento de jogar com tranquilidade e construir base sólida pra próxima temporada.",
  ],
  new_top_scorer: [
    "Outro destaque da partida: {season_top_scorer} agora lidera a artilharia da competição com {season_top_scorer_goals} gols na temporada. Os gols deste jogo o colocaram à frente dos antigos perseguidores, e o atacante segue numa fase produtiva impressionante, em ritmo de melhor goleador da história recente do clube. Bota-fé pra concorrer ao título de artilheiro do campeonato, especialmente se mantiver esse nível pelas próximas rodadas que faltam.",
    "Liderança da artilharia muda de mãos: {season_top_scorer} chega aos {season_top_scorer_goals} gols na temporada e assume isolado a primeira posição entre os goleadores. Atacante em estado de graça, marcando em sequência e carregando o time sempre que aparece na frente da meta. Quem acompanha o campeonato sabe que ele vinha empurrando essa cifra rodada após rodada — e agora é, oficialmente, o melhor finalizador da competição.",
    "{season_top_scorer} é o novo líder isolado da artilharia: {season_top_scorer_goals} gols na temporada, lugar de protagonista no ranking dos goleadores. Mais um capítulo brilhante de uma campanha individual que já não estava sendo escondida — o atacante vinha mostrando a forma boa há semanas, e os gols deste jogo só confirmaram o status. Promete render conversa e atenção dos olheiros nas próximas rodadas, que serão decisivas pra fechar a temporada com a chuteira de ouro.",
  ],
  draw_neutral: [
    "Com o empate, {home} fica com {home_points} pontos na {home_pos}ª colocação, e {away} soma {away_points} pontos na {away_pos}ª posição. Pra ambos, é resultado que mantém o ritmo mas não muda significativamente o quadro geral da tabela. Próximas rodadas seguem decisivas pra cada lado: pra cima ou pra baixo, ainda há muito a se definir, e o ponto somado hoje pode valer mais ou menos dependendo do que acontecer nos confrontos diretos vindouros.",
    "Empate distribui pontos de forma equilibrada: {home} {home_points} pontos ({home_pos}º), {away} {away_points} pontos ({away_pos}º). Resultado que não desequilibra ninguém na tabela, mas que serve pra manter o ritmo dos dois lados. Cada equipe segue trabalhando na sua campanha — buscando subir ou consolidar posição — e o calendário denso pelo próximo mês vai pesar pra definir se esse ponto somado hoje terá peso definitivo na conta final.",
    "Pontuação dividida com o empate: {home} fica com {home_points} pontos ({home_pos}ª colocação) e {away} com {away_points} pontos ({away_pos}ª colocação). Pra os dois lados, o resultado tem leitura mista — pode ser visto como ponto somado em jogo difícil ou como ponto perdido em oportunidade real de vitória. Cada equipe segue sua trajetória nos próximos compromissos, com a mesma necessidade de pontuar pra atingir os objetivos da temporada que projetaram desde o começo.",
  ],
};

// ── EN §1 templates ──
const PAR1_EN: Record<MatchRecapBucket, string[]> = {
  red_card_decided: [
    "{loser} dropped to ten early after {red_card_player}'s red card and lost {winner_goals}-{loser_goals} to {winner}{round_clause}. The hosts smartly managed the man advantage, controlled possession, and exploited the spaces left by the depleted side. The numerical disadvantage did the damage: {loser} couldn't organize their build-up play, were pressed constantly, and watched the match slip away as {winner} dictated the rhythm {stadium_clause}.",
    "{red_card_player}'s red changed everything {stadium_clause}: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} by exploiting the man advantage with skill. From the expulsion onward, the team was completely dominated, watched the opponent take over midfield and accelerate offensive transitions on every recovered ball. One of those matches where the card wrote the script, and the visiting fans took advantage of every minute of numerical inferiority.",
    "{winner} {winner_goals}-{loser_goals} {loser}{round_clause}: the night was marked by {red_card_player}'s expulsion, which opened the door for the hosts' victory. Before the card, the match was studied and balanced, but the forced exit completely disorganized the losing side's defensive structure. {winner} took advantage of the numerical superiority to impose their game, score decisive goals, and manage the result until the final whistle {stadium_clause}.",
  ],
  penalty_decided: [
    "{winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a match decided on the dead ball — {decisive_penalty_scorer} struck firmly from the spot and converted the penalty worth three points. The match was balanced from start to finish, with attentive defenses and stalled attacks {stadium_clause}, and the only ball that went in came from a set piece prepared and executed with the necessary cool in the tensest moment. Not pretty, but it was a win.",
    "Penalty converted by {decisive_penalty_scorer} made the difference: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a match that stayed open until the spot kick. The teams traded blows in midfield without major clear chances, and when the opportunity finally arose, the taker did his job with class. A narrow but extremely important win for the winning side, who leaves {stadium_clause} with a precious result.",
    "Decision from the spot: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} with a penalty converted by {decisive_penalty_scorer}. It was a match of few chances, with defenses outshining attacks and every attempt being a reason for early celebration. When the penalty was awarded, the entire stadium held its breath — and the taker didn't disappoint. Crucial three points for {winner} on a tense night {stadium_clause}.",
  ],
  comeback: [
    "Epic comeback {stadium_clause}: {winner} were trailing but reacted and beat {loser} {winner_goals}-{loser_goals}{round_clause} in a match for the gallery of memorable comebacks. {loser} took an early first-half lead and seemed to be cruising, until {winner} decided to change the script with high pressing, faster ball circulation, and precise finishing. A team that didn't quit, a match that didn't end until the final whistle.",
    "{winner} {winner_goals}-{loser_goals} {loser}{round_clause}: comeback built on grit after going behind. {loser} celebrated the early lead too soon and watched the opponent grow minute by minute, recover balls in midfield, and impose a rhythm they couldn't match. It was a second half dominated by the winners, with the {stadium_clause} crowd erupting at every goal. A reaction worth more than three points.",
    "Character in raw form: {winner} flipped the score against {loser} and won {winner_goals}-{loser_goals}{round_clause}. The winning team, which saw the opponent open the score and manage the lead for much of the match, found strength in the closing minutes' stamina to reverse the script. Every contested ball became a trench of pride, and the {stadium_clause} crowd responded in kind. A win for those who knew they couldn't drop another.",
  ],
  late_winner: [
    "{winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a dramatic finish {stadium_clause} — {late_scorer} found the net at {late_minute}' and made the crowd erupt in the final minutes. Until then, everything pointed to a draw, with defenses winning most of the duels and attacks stalled by well-organized defensive systems. But when everyone counted on a point shared, the savior goal arrived to settle the match in the dying breath.",
    "At {late_minute}', {late_scorer} scored the winning goal worth three points for {winner}. {winner} {winner_goals}-{loser_goals} {loser}{round_clause}, in a match that dragged on until the final eruption {stadium_clause}. Both teams seemed to accept the draw, with few real chances throughout the second half, until on a last play the striker appeared to make the difference. A win for those who pressed until the last play.",
    "Electrifying finish {stadium_clause}: {late_scorer} scored at {late_minute}' the goal that settled the match, and {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} on the last gasp. The match was open, with moments of pressure for both sides, but without that defining play to change the score. The hero of the night settled it with a savior strike in the closing minutes — the kind of goal that stays in the winning crowd's memory for a long time.",
  ],
  rout: [
    "There was no contest {stadium_clause}: {winner} steamrolled {loser} {winner_goals}-{loser_goals}{round_clause} in a one-way match from start to finish. The hosts opened the scoring early, completely controlled the rhythm, and maintained pressure until the final whistle, giving no real chances to the opponent. Total dominance translated into finishing chances in sequence and a display of football that fully justifies the elastic scoreline.",
    "{winner} {winner_goals}-{loser_goals} {loser}{round_clause}: rout built on patience, technical quality, and clinical finishing {stadium_clause}. {loser} couldn't get out of their own half in the first 30 minutes, and when they finally crossed midfield, the score was already bleeding. It was a match that clearly showed who was better prepared, and the numbers on the board only reinforce the glaring difference on the night.",
    "Total steamrolling {stadium_clause}: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} on a night when the hosts simply gave no chance for the opponent to breathe. High pressing, fast transitions, precise finishing — an offensive cocktail the visiting defense couldn't disarm at any moment. When the final whistle blew, the feeling was that the score could've been even bigger, and the crowd left applauding.",
  ],
  jogao: [
    "What a match {stadium_clause}! {home} {home_goals}-{away_goals} {away}{round_clause} in a thriller for the history books, with goals on both sides and emotion until the last minute. The defenses seemed nonexistent, the attacks entered a state of grace, and every time the ball crossed midfield it was a real goal threat. {winner}'s win in a confrontation that earned every minute of the crowd's attention and will keep people talking for days.",
    "{home} and {away} put on a show {stadium_clause}: {home_goals}-{away_goals}{round_clause}, a {winner} win on a goal-filled, emotion-packed night. Both teams entered the pitch ready to attack, and the result was an open spectacle, with clear chances on both sides, finishing in sequence, and a knockout-football feel even in a regular round-robin match. Whoever watched won't forget — the kind of game that brings fans closer to the spectacle.",
    "Spectacle {stadium_clause}: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a thriller packed with emotion from start to finish. The teams came out swinging, opened the game from the first minutes, and the result was a match of many goals, controversy, and a tense final until the whistle. {winner}'s win will have a place of honor among the round's best games — the kind that produces hours of commentary and stays marked on the calendar.",
  ],
  comfortable_win: [
    "{winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in an end-to-end controlled match {stadium_clause}. The lead was built in the first half, and from there the hosts managed the result with skill, valuing possession and closing defensive spaces. No major scares in the second half — it was a triumph within expectations for the team that entered as favorite, fulfilling its role without exceptional brilliance but with efficiency.",
    "Solid and calm win: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a well-controlled match by the hosts {stadium_clause}. It wasn't the most spectacular match of the calendar, but it was competent — clear dominance from start to finish, efficient finishing on the chances created, and an alert defense on the opponent's counter-attacks. Deserved triumph that reinforces the winning team's positive momentum and places them among the season's protagonists.",
    "{winner} {winner_goals}-{loser_goals} {loser}{round_clause}: comfortable triumph {stadium_clause}, with the lead settled before the second half even began. There was no mystery in the match — clear technical difference, better tactical organization, and well-coordinated players exploiting the opponent's weak points. A win without exceptional brilliance but with efficiency, the kind that builds a season and shows consistency in a championship where every point weighs heavily.",
  ],
  narrow_win: [
    "{winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a tight match decided on the details {stadium_clause}. There were few clear chances on either side, with attentive defenses and contested midfields on every loose ball. The goal worth three points came from a well-worked play, and from there the winning team smartly managed the result, closing spaces and holding the opponent's late pressure.",
    "Slim but valuable triumph: {winner} beat {loser} {winner_goals}-{loser_goals}{round_clause} in a balanced match decided by the quality of the goal scored. The teams cancelled each other out tactically for much of the match {stadium_clause}, with split possession and scarce shots, and it took an individual quality play to break the tie. A slim win that adds three important points to the campaign and keeps confidence high for the next round.",
    "{winner} {winner_goals}-{loser_goals} {loser}{round_clause}: tight win in a match contested in every sector. Loose balls disputed, hard marking, scarce shots — a typical league match where every point weighs hugely and teams come in worried about not conceding first. {winner} took the only chance with finishing clarity and secured the triumph on a detail, leaving {stadium_clause} with three precious points in the bag.",
  ],
  draw_goalfest: [
    "Lively draw {stadium_clause}: {home} {home_goals}-{away_goals} {away}{round_clause} in a match packed with emotion from start to finish. Both teams came in with offensive mindset, opened the game from the first minutes, and the result was a match with goals on both sides, score reversals, and a festive atmosphere in the stands. No winner but plenty of football — and the crowd left with the feeling of having watched a special match.",
    "{home} and {away} put on a spectacle {stadium_clause}: {home_goals}-{away_goals}{round_clause}, a festive draw worthy of a soap opera chapter. The teams traded blows in midfield, created clear chances on both sides, and every ball that went in seemed to open the way for more. In the end, everything was even — but for whoever watched, it was a match to keep in memory, with moments of technical quality that elevate the spectacle of football.",
    "Goal-filled draw: {home} {home_goals}-{away_goals} {away}{round_clause} in an open match that could have gone either way. Unstable defenses, inspired attacks, and a frenetic rhythm from start to finish {stadium_clause}. Each team opened leads at different moments, but neither managed to keep them — and the result is a generous score in goals, restrictive in points, but certainly generous in emotion for whoever bought the ticket.",
  ],
  draw_low: [
    "Lackluster draw {stadium_clause}: {home} {home_goals}-{away_goals} {away}{round_clause} in a match locked up in every sector. The midfields cancelled each other out, the defenses outshone the attacks, and the few shots that happened ran into well-positioned goalkeepers. It was more a tactical match than a technical one, with both teams worried first and foremost about not conceding — and the result, though fair, leaves a feeling of wasted opportunity for whoever wanted three points.",
    "{home} and {away} split points at {home_goals}-{away_goals}{round_clause} in a confrontation locked at midfield {stadium_clause}. Clear chances were rare, with attentive defenses, well-executed marking, and uninspired attacks. Bureaucratic draw, decided more by fatigue and lack of boldness than by individual or collective talent on either side. A point that serves but excites no one.",
    "{home} {home_goals}-{away_goals} {away}{round_clause}: stuck-match draw, decided more by errors than by quality plays. {stadium_clause}, what was seen was a tactical confrontation, with few minutes of actual football and many stoppages for defensive reorganization. When the final whistle blew, the general feeling was that both sides left satisfied with the point, but the crowd was wanting more boldness — the kind of match you watch out of obligation and quickly forget.",
  ],
};

// ── EN §2 templates ──
const PAR2_EN: Record<Par2Type, string[]> = {
  hat_trick: [
    "{hat_trick_player} was the unquestionable name of the match — {hat_trick_goals} solo goals, each constructed differently, each decisive to the unfolding of the game. The striker showed a nose for goal in every situation that appeared, finished with precision inside and outside the area, and proved why he's been catching the eye of scouts from major teams. A hat-trick that goes straight into the gallery of the season's best individual performances.",
    "Magical night for {hat_trick_player}: {hat_trick_goals} goals in a single match, numbers from a player in absolute state of grace. There's no need to elaborate on a performance like this — the striker was in every important play, found the paths to goal in distinct situations, and carried the team alone in the moments needed. A hat-trick that places his name among the round's standouts and proves once again his worth to the squad.",
    "When the team needed it, {hat_trick_player} answered with {hat_trick_goals} goals. A hat-trick built on technical quality, the right positioning at the right time, and that spark of talent that separates ordinary players from established goalscorers. A performance that will produce talk for weeks and reinforces why he is, today, one of the team's main offensive weapons — the kind of display that goes down in personal history and deserves headlines.",
  ],
  red_card_drama: [
    "{red_card_player}'s expulsion was the play that most marked the match's script. A card given at a decisive moment, a controversial decision that divided opinions in the stands and the commentary — some defending the referee's strictness, others finding it excessive given what they saw on the pitch. Regardless of the technical analysis, the fact is that the player left teammates at numerical disadvantage and completely changed the balance of forces being established until then.",
    "{red_card_player} was sent off and changed the course of the match. A controversial expulsion, with fans cheering or protesting depending on which side of the stands they were on, but with massive impact on what came next. The team that ended up a man down lost organization, offensive pressure, and ability to react, and watched the opponent dictate the final rhythm calmly. A red card that will produce discussion and analysis among fans and pundits in the coming days.",
    "{red_card_player}'s red card was marked as the inflection point of the match. Before the expulsion, the balance between teams was visible and both sides retained chances of winning. After, the scenario flipped completely — the team with the man advantage exploited it well, and the team that lost the player collapsed within their own system. It was the play that wrote the match's outcome, like it or not the analysis of the refereeing.",
  ],
  gk_hero: [
    "{gk_hero} was the most unexpected name of the night — the goalkeeper made {gk_hero_saves} important saves and held the team in a performance worthy of admiration. In crucial moments, he appeared to prevent certain goals, donned the hero's cape, and stopped the score from heading in a different direction. For whoever watched, it became clear: without his work between the posts, the result would've been different, and the team owes much to that performance.",
    "A gala night for {gk_hero}: the keeper made {gk_hero_saves} difficult saves and was the silent hero of the match. Ball off the crossbar, one-on-one finishing, long-range shot — in every situation the goalkeeper responded with perfect reflex and positioning. Performances like this are what separate ordinary keepers from true guardians, and it'll hardly go unnoticed by the round's analysts or the club's fans.",
    "{gk_hero} saved the team. {gk_hero_saves} providential saves, in moments when the match seemed lost, secured a result that wouldn't have been possible without his work. A goalkeeper who grows in decisive matches, has cool blood under pressure, and shows why he's considered a fundamental piece of the squad — to be fair in the overall assessment, he was probably the most important player of the confrontation.",
  ],
  dribble_play: [
    "The play that decided the match started with {dribble_play_player} carrying the ball and beating {dribble_play_count} markers in sequence. It was an individual play to enter any compilation of the round's best moments — short dribble, body feint, sudden change of direction — and culminated in the goal marked as the high point of the match. The kind of play that separates average athletes from truly differentiated ones on the pitch.",
    "{dribble_play_player} did alone what many teams try to do with organized attack: beat {dribble_play_count} opponents, created his own space, and generated the most dangerous finish of the match. It was a display of individual talent that fully justifies his role as protagonist in the coach's tactical setup. A play that will produce replay on every sports show this week and goes into the player's personal gallery.",
    "Star play: {dribble_play_player} took the ball, faced {dribble_play_count} markers, dribbled with class, and defined the play marked as the high point of the match. This kind of display, mixing refined technique with quick game reading, is exactly what makes football a spectacle. A performance that deserves highlight in the round's best moments column and confirms the player's status among the squad's main names.",
  ],
  top_scorer_brace: [
    "{top_scorer} scored the {top_scorer_goals} goals that decided the match in a performance of absolute protagonism. The striker was in the right places at the right times, finished with clear technical precision, and showed why he's been catching the eye of the round's analysts. A personal brace that reinforces his role as offensive reference of the team and places him among the match's standouts — exactly the kind of display expected from a key squad number.",
    "Two decisive goals from {top_scorer} placed the striker's name on the round's protagonists list. In distinct situations, he found the way to the net with technical quality, adequate positioning, and that spark of talent that separates good goalscorers from the merely regular. A performance that will produce good repercussion and confirms his importance to the coach's setup for the season — the kind of display that goes straight onto scouts' radars.",
    "{top_scorer_goals} goals on the count for {top_scorer}, who was the offensive name of the match. In all his finishes, the striker showed the necessary cool, and the two goals scored were fundamental to the outcome. Ask anyone who plays alongside: the guy does what needs to be done, when it needs to be done. A performance that reinforces why he's a key piece in the squad — the kind of display that's worth the ticket to see the striker in action.",
  ],
  shot_machine: [
    "{shot_machine} was the night's drilling machine: {shot_machine_count} shots throughout the match, some on target, others scaring the keeper, but always creating danger in the opposing area. The player insisted from distance, tried inside the area, finished with the head — and even without finding the net, was the most dangerous attacker of his team's offense. A performance that deserves recognition for the volume of finishes and the ability to create constant danger in the offensive sector.",
    "It was the most frustrating night for {shot_machine} — {shot_machine_count} attempts tried, and none became a goal. The striker had opportunities to settle it, but precision didn't come at the right time. Even without scoring, his presence troubled the opposing defense from start to finish, and the performance shows he kept trying until the last minute. The kind of display that deserves recognition even without the goal expected by the fans.",
    "{shot_machine} insisted throughout the match: {shot_machine_count} shots, several situations created, but the finishing didn't yield what the statistic promised. The striker carried his team's attack, created individual quality plays, and generated the match's main threats. Time will tell if the volume of finishes turns into more goals in the coming rounds — when that happens, the player will be among the championship's top scorer candidates.",
  ],
  tackle_master: [
    "{tackle_master} was the night's defensive wall: {tackle_master_count} tackles throughout the match, in moments when the team needed to resist and in moments when it needed to recover the ball. Perfect positioning, exemplary game reading, and the right timing to enter hard on the ball — the player was the piece that sustained the defense on a night when the opponent tried to press. A performance that will go into the round's statistical reports.",
    "{tackle_master}'s background work deserves highlight in this match's chronicle. {tackle_master_count} tackles, all at the right moment, all without a foul — a display of defensive technique that serves as a lesson for any defender wanting to evolve. These numbers show why the player is considered a fundamental piece of the system, even if fan recognition usually goes more to the strikers than to the defensive pillars of the setup.",
    "{tackle_master} took on the function of protecting the defense: {tackle_master_count} tackles on the count, several of them in situations of imminent danger. The player was the buffer that was missing in several moments of the match, closing passes behind the centerbacks and neutralizing plays that seemed dangerous. A fundamental performance that deserves recognition in the post-match analysis — the kind of silent but absolutely decisive display for the final result.",
  ],
  generic: [
    "{top_scorer} scored the goal that decided the match in a play of opportunism inside the area. The striker was in the right place at the right time, finished without hesitation, and secured precious three points for the team. It wasn't the season's most spectacular performance, but it had the importance it needed to have — for teams disputing important objectives, goals like that make all the difference in the final point sum.",
    "Collective play decided the match — there wasn't a screaming individual standout, but a team that played together. {top_scorer} scored the important goal, but the win had everyone's fingerprint: organized midfield, well-positioned defense, fast transitions. The kind of display that shows coach and players are aligned on the tactical proposal — the kind that builds confidence in the squad.",
    "Without major individuals shining, it was the collective that decided the match. {top_scorer} scored the relevant goal, but the match's story goes to many other names that did their work silently. A team win, the kind that reinforces the team's structure and shows that, even without an inspired attack, it's possible to win by doing the basic tactical work well.",
  ],
};

// ── EN §3 templates ──
const PAR3_EN: Record<Par3Type, string[]> = {
  leader: [
    "With this win, {winner} reaches {winner_points} points and remains alone at the top of the table. {winner_pos}st position held with comfort, game by game, and the feeling that the team is in a dominant moment of the season. They'll need to maintain this consistency to confirm title expectations at the end of the championship, but the fact is that today {winner} is the most consistent team in the competition — no one seems eager to wrestle the lead away in the short term.",
    "{winner} reinforces competition leadership with three more points: {winner_points} in total, {winner_pos}st position maintained calmly. The win consolidates the team as title favorite, with consistent performances and a squad in sync. Coming rounds will determine if the open advantage becomes mathematical reality or if some chaser manages to close the gap — but for now, the atmosphere is one of total confidence and focus on maintaining rhythm.",
    "Leadership confirmed: {winner} occupies first place with {winner_points} points after this win. {leader_club} remains the season's reference, playing at high level and showing structure compatible with title expectations. Whoever follows the championship knows there's still a lot of road ahead, but the team enters the next round with the confidence of those who know the way — and that makes a huge psychological difference over the course of the competition.",
  ],
  top4: [
    "{winner} reaches {winner_points} points with this win and occupies {winner_pos}th place on the table, within the qualification zone for next season's important competitions. A good moment for the team, which has been adding points consistently and showing tactical structure compatible with the objectives drawn before the championship started. Coming rounds will confirm if the spot turns into reality at the end of the competition.",
    "Three more points for {winner}, who climb to {winner_pos}th position with {winner_points} points. The team enters firmly into the fight for slots in continental competitions, with the squad in sync and the coach increasingly imprinting a clear playing identity. The championship's final stretch will be tight in the slot fight, but the winning team shows today that they have conditions to remain in the lead pack until the end.",
    "{winner} {winner_points} points, {winner_pos}th position: the win consolidates the team among the main candidates for slots in continental tournaments. It's no longer a surprise when they appear in the qualification zone — they've been showing consistency for several rounds, with stable defense and productive attack. The championship's final stretch will be decisive in confirming the objective, but the atmosphere is positive and the squad has shown the necessary maturity.",
  ],
  relegation: [
    "On the losing side, a worrying situation: {loser} remains in {loser_pos}th place with {loser_points} points, inside the relegation zone. The championship's final stretch will be dramatic, and every match now is worth gold for the team to escape the drop. Pressure on the technical staff and players tends to increase in the coming days, and the fans will demand immediate reaction if they want to see the team away from the relegation zone in the next round.",
    "{loser} accumulates another defeat and continues sinking on the table: {loser_pos}th position with {loser_points} points, in a delicate situation in the relegation fight. The tactical setup needs review, the on-pitch performance needs reaction, and the time for correction shrinks with each round that passes. Demands will come from all sides — fans, press, board — and the next match becomes practically a final for the team.",
    "Another stumble for {loser}, who remain in the relegation zone: {loser_pos}th position, {loser_points} points, growing tension atmosphere. The championship's final stretch will be fundamental in defining if the team can react in time to avoid the drop or if it'll fall to the next season in the lower division. They'll need an immediate switch — in performance, in attitude, in results — to maintain a chance of staying up.",
  ],
  midtable: [
    "{winner} reaches {winner_points} points with this win, occupying {winner_pos}th position on the table. A mid-table position that keeps the team away from the relegation zone but without really fighting for spots in important competitions. The final stretch can define one side or the other — depends on the level of consistency they manage to maintain in the coming rounds. Without urgency but without excessive comfort is how the team's campaign goes.",
    "The win leaves {winner} with {winner_points} points, in {winner_pos}th place — neutral position on the table, away from the drop and the qualification zone. The team watches what happens at both ends and seeks to close the championship in the best possible position within the circumstances. Without major pressures, but also without major short-term ambitions, they keep working round by round on building the next season.",
    "{winner} adds three important points but maintains a mid-table position: {winner_pos}th place with {winner_points} points. The team remains distant from the ends — neither fighting for the title nor threatened by relegation — in a season of maintenance and planning for the future. Every win counts, but doesn't change the overall picture much; it's a moment to play with tranquility and build a solid base for next season.",
  ],
  new_top_scorer: [
    "Another match standout: {season_top_scorer} now leads the competition's top scorer race with {season_top_scorer_goals} goals on the season. The goals from this match placed him ahead of his former chasers, and the striker continues in an impressive productive phase, in the rhythm of the club's best goalscorer in recent history. A serious bid to compete for the championship's golden boot, especially if he maintains this level for the remaining rounds.",
    "Top scorer leadership changes hands: {season_top_scorer} reaches {season_top_scorer_goals} goals on the season and takes alone the first position among scorers. A striker in state of grace, scoring in sequence and carrying the team whenever he appears in front of goal. Whoever follows the championship knows he was pushing this number round after round — and now he is, officially, the competition's best finisher.",
    "{season_top_scorer} is the new isolated top scorer leader: {season_top_scorer_goals} goals on the season, protagonist place in the goalscorers' ranking. Another brilliant chapter in an individual campaign that was no longer being hidden — the striker had been showing good form for weeks, and the goals in this match only confirmed the status. He promises to produce talk and scout attention in the coming rounds, which will be decisive in closing the season with the golden boot.",
  ],
  draw_neutral: [
    "With the draw, {home} ends with {home_points} points in {home_pos}th place, and {away} adds {away_points} points in {away_pos}th position. For both, it's a result that maintains the rhythm but doesn't significantly change the overall picture of the table. Coming rounds remain decisive for each side: up or down, there's still much to be defined, and the point added today may be worth more or less depending on what happens in the upcoming direct encounters.",
    "The draw distributes points in balanced fashion: {home} {home_points} points ({home_pos}th), {away} {away_points} points ({away_pos}th). A result that doesn't unbalance anyone on the table, but serves to maintain the rhythm of both sides. Each team continues working on its campaign — seeking to climb or consolidate position — and the dense calendar over the coming month will weigh in defining if this point added today will have definitive weight in the final count.",
    "Points split with the draw: {home} ends with {home_points} points ({home_pos}th place) and {away} with {away_points} points ({away_pos}th place). For both sides, the result has mixed reading — it can be seen as a point added in a difficult match or as a point lost in a real win opportunity. Each team continues its trajectory in the next commitments, with the same need to score points to reach the season objectives projected from the start.",
  ],
};

// ── Classifier ──
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

// ── §2 selector: priority hat-trick > red_card > gk_hero > dribble > brace > shot_machine > tackle_master > generic ──
function pickPar2Type(f: MatchRecapFacts): Par2Type {
  if (f.hatTrickPlayer && f.hatTrickGoals >= 3) return 'hat_trick';
  if (f.redCardPlayerName) return 'red_card_drama';
  if (f.gkHeroName && f.gkHeroSaves >= 2) return 'gk_hero';
  if (f.dribblePlayPlayer && f.dribblePlayCount >= 2) return 'dribble_play';
  if (f.matchTopScorerName && f.matchTopScorerGoals >= 2) return 'top_scorer_brace';
  if (f.shotMachineName && f.shotMachineCount >= 5) return 'shot_machine';
  if (f.tackleMasterName && f.tackleMasterCount >= 4) return 'tackle_master';
  return 'generic';
}

// ── §3 selector: depends on whether match has a winner + standings ──
function pickPar3Type(f: MatchRecapFacts): Par3Type {
  // Drawn match → neutral or new top scorer
  const isDraw = f.homeGoals === f.awayGoals;
  if (isDraw) {
    // Even on a draw, mention if a player from the match is the season top scorer
    if (f.seasonTopScorerName && f.seasonTopScorerGoals >= 5) return 'new_top_scorer';
    return 'draw_neutral';
  }
  // Otherwise focus on the winner's table position
  if (f.isWinnerLeader) return 'leader';
  // Loser in relegation zone (last 4) → mention it
  if (f.loserStandingPos && f.numClubsInLeague && f.loserStandingPos > f.numClubsInLeague - 4) return 'relegation';
  if (f.winnerStandingPos && f.winnerStandingPos <= 4) return 'top4';
  // New top scorer angle wins over midtable when applicable
  if (f.seasonTopScorerName && f.seasonTopScorerGoals >= 5) return 'new_top_scorer';
  return 'midtable';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string, vars: Record<string, string | number | null>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const replacement = v == null ? '' : String(v);
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), replacement);
  }
  return out.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function buildVars(f: MatchRecapFacts, lang: 'pt' | 'en'): Record<string, string | number | null> {
  const winnerName = f.homeGoals > f.awayGoals ? f.homeName : f.awayName;
  const loserName = f.homeGoals > f.awayGoals ? f.awayName : f.homeName;
  const winnerGoals = Math.max(f.homeGoals, f.awayGoals);
  const loserGoals = Math.min(f.homeGoals, f.awayGoals);

  const stadiumClause = f.stadium
    ? (lang === 'en' ? `at ${f.stadium}` : `em ${f.stadium}`)
    : (lang === 'en' ? 'at home' : 'em casa');

  const roundClause = f.round
    ? (lang === 'en' ? ` in round ${f.round}` : ` pela rodada ${f.round}`)
    : '';

  return {
    home: f.homeName,
    away: f.awayName,
    home_goals: f.homeGoals,
    away_goals: f.awayGoals,
    winner: winnerName,
    loser: loserName,
    winner_goals: winnerGoals,
    loser_goals: loserGoals,
    stadium: f.stadium ?? '',
    stadium_clause: stadiumClause,
    round: f.round ?? '',
    round_clause: roundClause,
    top_scorer: f.matchTopScorerName ?? '',
    top_scorer_goals: f.matchTopScorerGoals,
    late_scorer: f.lateScorerName ?? '',
    late_minute: f.lateMinute ?? '',
    red_card_player: f.redCardPlayerName ?? '',
    decisive_penalty_scorer: f.decisivePenaltyScorer ?? '',
    hat_trick_player: f.hatTrickPlayer ?? '',
    hat_trick_goals: f.hatTrickGoals,
    gk_hero: f.gkHeroName ?? '',
    gk_hero_saves: f.gkHeroSaves,
    dribble_play_player: f.dribblePlayPlayer ?? '',
    dribble_play_count: f.dribblePlayCount,
    shot_machine: f.shotMachineName ?? '',
    shot_machine_count: f.shotMachineCount,
    tackle_master: f.tackleMasterName ?? '',
    tackle_master_count: f.tackleMasterCount,
    leader_club: f.leaderClubName ?? '',
    winner_pos: f.winnerStandingPos ?? '',
    winner_points: f.winnerPoints,
    loser_pos: f.loserStandingPos ?? '',
    loser_points: f.loserPoints,
    home_pos: f.homeStandingPos ?? '',
    home_points: f.homePoints,
    away_pos: f.awayStandingPos ?? '',
    away_points: f.awayPoints,
    season_top_scorer: f.seasonTopScorerName ?? '',
    season_top_scorer_goals: f.seasonTopScorerGoals,
    num_clubs: f.numClubsInLeague,
  };
}

export function assembleMatchRecap(facts: MatchRecapFacts, lang: 'pt' | 'en'): { bucket: MatchRecapBucket; body: string } {
  const bucket = classifyMatch(facts);
  const par2Type = pickPar2Type(facts);
  const par3Type = pickPar3Type(facts);

  const par1Set = (lang === 'en' ? PAR1_EN : PAR1_PT)[bucket];
  const par2Set = (lang === 'en' ? PAR2_EN : PAR2_PT)[par2Type];
  const par3Set = (lang === 'en' ? PAR3_EN : PAR3_PT)[par3Type];

  const par1 = pickRandom(par1Set);
  const par2 = pickRandom(par2Set);
  const par3 = pickRandom(par3Set);

  const vars = buildVars(facts, lang);
  const body = [
    fillTemplate(par1, vars),
    fillTemplate(par2, vars),
    fillTemplate(par3, vars),
  ].join('\n\n');

  return { bucket, body };
}

// ── Fact extraction from DB ──
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

  // Stadium
  const { data: stadium } = await supabase
    .from('stadiums')
    .select('name')
    .eq('club_id', match.home_club_id)
    .maybeSingle();

  // League round + season (if league match)
  let round: number | null = null;
  let seasonId: string | null = null;
  const { data: leagueMatch } = await supabase
    .from('league_matches')
    .select('round_id')
    .eq('match_id', matchId)
    .maybeSingle();
  if (leagueMatch?.round_id) {
    const { data: roundRow } = await supabase
      .from('league_rounds')
      .select('round_number, season_id')
      .eq('id', leagueMatch.round_id)
      .maybeSingle();
    round = roundRow?.round_number ?? null;
    seasonId = roundRow?.season_id ?? null;
  }

  // Events
  const { data: events } = await supabase
    .from('match_event_logs')
    .select('id, event_type, title, body, payload, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  const allEvents = events ?? [];
  const goals = allEvents.filter((e: any) => e.event_type === 'goal');
  const reds = allEvents.filter((e: any) => e.event_type === 'red_card');
  const yellows = allEvents.filter((e: any) => e.event_type === 'yellow_card');
  const dribbles = allEvents.filter((e: any) => e.event_type === 'dribble');

  // Goal counts per scorer name
  const goalsByName = new Map<string, { name: string; club: string | null; count: number; goals: any[] }>();
  for (const g of goals) {
    const name = (g.payload as any)?.scorer_name ?? null;
    const club = (g.payload as any)?.scorer_club_id ?? null;
    if (!name) continue;
    const prev = goalsByName.get(name);
    if (prev) {
      prev.count += 1;
      prev.goals.push(g);
    } else {
      goalsByName.set(name, { name, club, count: 1, goals: [g] });
    }
  }

  // Match top scorer + hat-trick
  let matchTopScorerName: string | null = null;
  let matchTopScorerGoals = 0;
  let hatTrickPlayer: string | null = null;
  let hatTrickGoals = 0;
  for (const v of goalsByName.values()) {
    if (v.count > matchTopScorerGoals) {
      matchTopScorerGoals = v.count;
      matchTopScorerName = v.name;
    }
    if (v.count >= 3 && v.count > hatTrickGoals) {
      hatTrickPlayer = v.name;
      hatTrickGoals = v.count;
    }
  }

  // Approximate minute from created_at vs started_at
  const startedAt = match.started_at ? new Date(match.started_at).getTime() : 0;
  const minuteOf = (createdAt: string): number => {
    if (!startedAt) return 0;
    const t = new Date(createdAt).getTime();
    return Math.max(0, Math.round((t - startedAt) / 60000));
  };

  // Comeback detection
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

  // Late winner
  let lateScorerName: string | null = null;
  let lateMinute: number | null = null;
  let lastWinnerGoal: any = null;
  if (winnerSide !== 'draw') {
    const winnerClubId = winnerSide === 'home' ? match.home_club_id : match.away_club_id;
    const winnerGoalsList = goals.filter((g: any) => g.payload?.scorer_club_id === winnerClubId);
    lastWinnerGoal = winnerGoalsList[winnerGoalsList.length - 1];
    if (lastWinnerGoal) {
      const m = minuteOf(lastWinnerGoal.created_at);
      if (m >= 80) {
        lateScorerName = (lastWinnerGoal.payload as any)?.scorer_name ?? null;
        lateMinute = m;
      }
    }
  }

  // Red card on losing side
  let redCardPlayerName: string | null = null;
  let redCardLoserSide = false;
  if (winnerSide !== 'draw' && reds.length > 0) {
    const loserClubId = winnerSide === 'home' ? match.away_club_id : match.home_club_id;
    const loserRed = reds.find((r: any) =>
      r.payload?.club_id === loserClubId
      || r.payload?.player_club_id === loserClubId
      || r.payload?.scorer_club_id === loserClubId
    );
    if (loserRed) {
      redCardPlayerName =
        (loserRed.payload as any)?.player_name
        ?? (loserRed.payload as any)?.scorer_name
        ?? null;
      redCardLoserSide = !!redCardPlayerName;
    }
  }

  // Decisive penalty heuristic
  let decisivePenaltyScorer: string | null = null;
  if (winnerSide !== 'draw' && lastWinnerGoal) {
    const text = `${lastWinnerGoal.title ?? ''} ${lastWinnerGoal.body ?? ''}`.toLowerCase();
    if (/p[êe]nal/.test(text) || (lastWinnerGoal.payload as any)?.kind === 'penalty') {
      decisivePenaltyScorer = (lastWinnerGoal.payload as any)?.scorer_name ?? null;
    }
  }

  // Dribble play before decisive goal: count dribbles by the scorer in the
  // 8 events immediately preceding the last winner goal.
  let dribblePlayPlayer: string | null = null;
  let dribblePlayCount = 0;
  if (lastWinnerGoal) {
    const scorerPid = (lastWinnerGoal.payload as any)?.scorer_participant_id;
    const scorerName = (lastWinnerGoal.payload as any)?.scorer_name;
    if (scorerPid && scorerName) {
      const goalIdx = allEvents.findIndex((e: any) => e.id === lastWinnerGoal.id);
      const window = allEvents.slice(Math.max(0, goalIdx - 8), goalIdx);
      const count = window.filter((e: any) =>
        e.event_type === 'dribble'
        && (e.payload as any)?.dribbler_participant_id === scorerPid
      ).length;
      if (count >= 2) {
        dribblePlayPlayer = scorerName;
        dribblePlayCount = count;
      }
    }
  }

  // GK hero, shot machine, tackle master from player_match_stats
  let gkHeroName: string | null = null;
  let gkHeroSaves = 0;
  let shotMachineName: string | null = null;
  let shotMachineCount = 0;
  let tackleMasterName: string | null = null;
  let tackleMasterCount = 0;
  const { data: pms } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, gk_saves, shots, tackles, goals')
    .eq('match_id', matchId);

  if (pms && pms.length > 0) {
    const profileIds = pms
      .map((p: any) => p.player_profile_id)
      .filter(Boolean);
    const { data: profiles } = profileIds.length > 0
      ? await supabase
          .from('player_profiles')
          .select('id, full_name')
          .in('id', profileIds)
      : { data: [] as any[] };
    const nameById = new Map<string, string>();
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);

    for (const row of pms) {
      const name = nameById.get(row.player_profile_id);
      if (!name) continue;
      if (row.gk_saves > gkHeroSaves) {
        gkHeroSaves = row.gk_saves;
        gkHeroName = name;
      }
      // Shot machine: many shots without scoring much
      if (row.shots > shotMachineCount && row.goals < 2) {
        shotMachineCount = row.shots;
        shotMachineName = name;
      }
      if (row.tackles > tackleMasterCount) {
        tackleMasterCount = row.tackles;
        tackleMasterName = name;
      }
    }
  }

  // Standings (after match) — only meaningful for league matches
  let leaderClubName: string | null = null;
  let isWinnerLeader = false;
  let winnerStandingPos: number | null = null;
  let winnerPoints = 0;
  let loserStandingPos: number | null = null;
  let loserPoints = 0;
  let homeStandingPos: number | null = null;
  let homePoints = 0;
  let awayStandingPos: number | null = null;
  let awayPoints = 0;
  let numClubsInLeague = 0;

  if (seasonId) {
    const { data: standings } = await supabase
      .from('league_standings')
      .select('club_id, points, goals_for, goals_against, won, drawn, lost')
      .eq('season_id', seasonId);
    if (standings && standings.length > 0) {
      // Sort: points DESC, goal_diff DESC, goals_for DESC
      const sorted = [...standings].sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goals_for - a.goals_against;
        const gdB = b.goals_for - b.goals_against;
        if (gdB !== gdA) return gdB - gdA;
        return b.goals_for - a.goals_for;
      });
      numClubsInLeague = sorted.length;
      const posByClub = new Map<string, number>();
      sorted.forEach((s: any, i: number) => posByClub.set(s.club_id, i + 1));
      const ptsByClub = new Map<string, number>();
      for (const s of sorted) ptsByClub.set(s.club_id, s.points);

      const leaderClubId = sorted[0]?.club_id;
      if (leaderClubId) {
        const { data: leaderClub } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', leaderClubId)
          .maybeSingle();
        leaderClubName = leaderClub?.name ?? null;
      }

      const winnerClubId = winnerSide === 'home' ? match.home_club_id : winnerSide === 'away' ? match.away_club_id : null;
      const loserClubId = winnerSide === 'home' ? match.away_club_id : winnerSide === 'away' ? match.home_club_id : null;

      if (winnerClubId) {
        winnerStandingPos = posByClub.get(winnerClubId) ?? null;
        winnerPoints = ptsByClub.get(winnerClubId) ?? 0;
        isWinnerLeader = winnerClubId === leaderClubId;
      }
      if (loserClubId) {
        loserStandingPos = posByClub.get(loserClubId) ?? null;
        loserPoints = ptsByClub.get(loserClubId) ?? 0;
      }
      homeStandingPos = posByClub.get(match.home_club_id) ?? null;
      homePoints = ptsByClub.get(match.home_club_id) ?? 0;
      awayStandingPos = posByClub.get(match.away_club_id) ?? null;
      awayPoints = ptsByClub.get(match.away_club_id) ?? 0;
    }
  }

  // Season top scorer
  let seasonTopScorerName: string | null = null;
  let seasonTopScorerGoals = 0;
  if (seasonId) {
    const { data: seasonStats } = await supabase
      .from('player_match_stats')
      .select('player_profile_id, goals')
      .eq('season_id', seasonId);
    if (seasonStats && seasonStats.length > 0) {
      const totalByPlayer = new Map<string, number>();
      for (const s of seasonStats) {
        const cur = totalByPlayer.get(s.player_profile_id) ?? 0;
        totalByPlayer.set(s.player_profile_id, cur + (s.goals ?? 0));
      }
      let topId: string | null = null;
      for (const [pid, total] of totalByPlayer.entries()) {
        if (total > seasonTopScorerGoals) {
          seasonTopScorerGoals = total;
          topId = pid;
        }
      }
      if (topId) {
        const { data: topPlayer } = await supabase
          .from('player_profiles')
          .select('full_name')
          .eq('id', topId)
          .maybeSingle();
        seasonTopScorerName = topPlayer?.full_name ?? null;
      }
    }
  }

  return {
    homeName: homeClub?.name ?? 'Time da casa',
    awayName: awayClub?.name ?? 'Visitante',
    homeGoals: match.home_score,
    awayGoals: match.away_score,
    homeClubId: match.home_club_id,
    awayClubId: match.away_club_id,
    stadium: stadium?.name ?? null,
    round,
    hasComeback,
    decisivePenaltyScorer,
    lateScorerName,
    lateMinute,
    redCardPlayerName,
    redCardLoserSide,
    hatTrickPlayer,
    hatTrickGoals,
    matchTopScorerName,
    matchTopScorerGoals,
    gkHeroName,
    gkHeroSaves,
    dribblePlayPlayer,
    dribblePlayCount,
    shotMachineName,
    shotMachineCount,
    tackleMasterName,
    tackleMasterCount,
    yellowCardCount: yellows.length,
    numClubsInLeague,
    leaderClubName,
    isWinnerLeader,
    winnerStandingPos,
    winnerPoints,
    loserStandingPos,
    loserPoints,
    homeStandingPos,
    homePoints,
    awayStandingPos,
    awayPoints,
    seasonTopScorerName,
    seasonTopScorerGoals,
  };
}

// ── Public entry point ──
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
    console.error('[match_recap] generation failed:', err);
  }
}
