// Round Recap narrative system (Deno).
// Triggered when a league_round transitions to status='finished' (i.e. all
// matches of that round are complete). 3-paragraph format:
//   §1 — round overview (score lines + tone)
//   §2 — round highlight (hat-trick, comeback, gk hero, top scorer, generic)
//   §3 — table implication (new leader, leader pulls away, relegation
//        movement, generic)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Par2Type =
  | 'hat_trick_round'
  | 'best_comeback'
  | 'gk_of_round'
  | 'top_scorer_round'
  | 'generic_round';

type Par3Type =
  | 'new_leader'
  | 'leader_pulls_away'
  | 'relegation_movement'
  | 'top_scorer_race'
  | 'generic_table';

export interface RoundRecapFacts {
  roundNumber: number;
  seasonId: string;
  numMatches: number;
  totalGoals: number;
  averageGoals: number;

  // Match-level: list of all matches with their scores, plus a featured
  // match (highest combined goals or comeback) for §1.
  matchSummaries: Array<{
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    matchId: string;
  }>;
  featuredMatch: {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
  } | null;

  // §2 highlights
  hatTrickPlayer: string | null;
  hatTrickGoals: number;
  hatTrickClub: string | null;
  topScorerName: string | null;
  topScorerGoals: number;
  topScorerClub: string | null;
  gkHeroName: string | null;
  gkHeroSaves: number;
  bestComeback: {
    winner: string;
    loser: string;
    score: string;
  } | null;

  // §3 table state (after round)
  leaderClubName: string | null;
  leaderPoints: number;
  secondClubName: string | null;
  secondPoints: number;
  pointGap: number;
  newLeaderThisRound: boolean;
  oldLeaderClubName: string | null;
  numClubsInLeague: number;
  enteredRelegation: string[];
  exitedRelegation: string[];
  seasonTopScorerName: string | null;
  seasonTopScorerGoals: number;
}

// ── PT §1: round overview (5 templates) ──
const PAR1_PT: string[] = [
  "A {round}ª rodada da Liga chegou ao fim com {num_matches} partidas e {total_goals} gols marcados — média de {avg_goals} gols por jogo. {featured_clause} Foi uma rodada de altos e baixos, com vencedores claros, empates apertados e algumas surpresas pelo caminho. A torcida saiu satisfeita com o volume de futebol oferecido, e a tabela viveu mais movimentações importantes no decorrer dos resultados.",
  "Encerrou a {round}ª rodada da competição: {num_matches} jogos, {total_goals} gols, e o equilíbrio que caracteriza um campeonato disputado. {featured_clause} Times brigaram pontos a pontos, técnicos testaram esquemas, e a tabela voltou a se mexer com novidades importantes em cima e embaixo. Próxima rodada já promete mais emoção pra quem acompanha de perto.",
  "Rodada {round} concluída com saldo de {total_goals} gols em {num_matches} partidas, média de {avg_goals} por jogo. {featured_clause} Foram dias de definições importantes — cada vitória vale mais nesse momento da temporada, cada empate pode pesar lá na frente, e cada derrota mexe com o ambiente do clube envolvido. Confira os destaques que ficaram da rodada.",
  "Mais uma rodada da Liga ficou pra trás, e a {round}ª foi recheada de futebol: {num_matches} confrontos, {total_goals} gols no total, média próxima de {avg_goals} por partida. {featured_clause} Times consolidaram momentos positivos, outros tiveram que rever postura, e a tabela continua sendo redesenhada a cada nova rodada que se completa. A briga segue intensa em todas as zonas da classificação.",
  "{num_matches} partidas, {total_goals} gols, média de {avg_goals} por jogo: a {round}ª rodada da Liga produziu números expressivos pros torcedores que acompanharam. {featured_clause} Foi mais um capítulo de uma temporada que vem ganhando contornos definitivos a cada semana — quem tá em cima reforça, quem tá embaixo precisa correr, e os do meio seguem buscando estabilidade.",
];

// ── PT §2: highlights ──
const PAR2_PT: Record<Par2Type, string[]> = {
  hat_trick_round: [
    "O nome incontestável da rodada foi {hat_trick_player}, do {hat_trick_club}, com {hat_trick_goals} gols numa só partida. Hat-trick que coloca o jogador na conversa pelo prêmio de jogador da semana e que reforça por que ele tem chamado atenção dos olheiros das principais equipes do continente. Atuação rara, daquelas que justificam o ingresso e que entram pra história pessoal do jogador. A torcida já espera repetição na próxima rodada.",
    "Noite mágica de {hat_trick_player} marcou a rodada — {hat_trick_goals} gols pelo {hat_trick_club} numa só partida, números de jogador em estado de graça absoluto. O jogador carregou o time sozinho nos momentos decisivos, encontrou os caminhos do gol em situações distintas e provou seu valor pra quem ainda duvidava. Hat-trick que ressoa muito além dos três pontos somados pelo clube na campanha.",
    "Quando a rodada produziu seu maior brilho individual, foi {hat_trick_player} quem assinou: {hat_trick_goals} gols num jogo só, vestindo a camisa do {hat_trick_club}. Hat-trick construído com qualidade técnica, posicionamento certo na hora certa e aquela faísca de talento que separa os jogadores comuns dos artilheiros consagrados. Dias depois, ainda é o lance que mais gera conversa entre os comentaristas e torcedores.",
  ],
  best_comeback: [
    "A virada do {bc_winner} sobre o {bc_loser} ({bc_score}) foi o lance mais marcante da rodada. Time que estava perdendo, cresceu no segundo tempo, encontrou força no fôlego dos minutos finais e construiu um resultado que parecia improvável até a metade da partida. Tipo de virada que vale mais do que três pontos — vale a moral pro time inteiro pelas próximas rodadas e mostra caráter coletivo digno de elogios da imprensa.",
    "Reação histórica na rodada: {bc_winner} virou o jogo contra {bc_loser} e venceu por {bc_score}. Atrás no placar por boa parte da partida, o time vencedor cresceu no momento certo, foi pra cima com pressão alta e definiu nos minutos finais com qualidade técnica e personalidade. Virada que entra pra galeria das memoráveis e que coloca o {bc_winner} como protagonista da semana.",
    "{bc_winner} fez o que poucos times conseguiram nesta temporada: virou um jogo difícil contra {bc_loser} e fechou em {bc_score}. Determinação, qualidade ofensiva e cabeça fria nos momentos de pressão definiram o resultado, e a torcida saiu de campo levantando hipótese de campanha de título pra equipe vencedora. Virada que terá lugar de destaque entre as atuações da rodada.",
  ],
  gk_of_round: [
    "{gk_hero} foi o goleiro da rodada — {gk_hero_saves} defesas importantes em uma só partida, segurando o time numa atuação digna de admiração. Em momentos cruciais, o arqueiro apareceu pra evitar gols certeiros, vestiu a capa de herói e impediu que o placar tomasse rumo diferente. Performance que mostra por que ele é considerado peça fundamental do elenco do clube que defende.",
    "Noite de gala pra {gk_hero}: {gk_hero_saves} defesas espetaculares em uma única partida, atuação que entrou direto pra galeria dos melhores momentos da rodada. Bola na trave, finalização cara a cara, chute de fora da área — em todas as situações o goleiro respondeu com reflexo e posicionamento perfeitos. Tipo de exibição que separa goleiros comuns de verdadeiros guardiões.",
    "{gk_hero} foi a referência defensiva da rodada com {gk_hero_saves} defesas decisivas. Goleiro que cresce nas partidas mais difíceis, com sangue frio nos momentos de pressão, mostrou novamente por que é considerado um dos melhores no campeonato. Atuação que merece destaque na análise pós-rodada e que reforça a importância do trabalho silencioso entre as traves pro sucesso de uma temporada.",
  ],
  top_scorer_round: [
    "{top_scorer}, do {top_scorer_club}, foi o artilheiro isolado da rodada com {top_scorer_goals} gols. O jogador esteve em todos os lances importantes do seu time, finalizou com qualidade técnica visível e se firma como referência ofensiva do elenco. Performance que confirma seu lugar entre os melhores goleadores da temporada e mantém a expectativa em alta pra próxima rodada que se aproxima.",
    "Artilharia da rodada teve nome certo: {top_scorer}, do {top_scorer_club}, com {top_scorer_goals} gols. O jogador segue numa fase produtiva impressionante, marcando em sequência e carregando o time sempre que aparece na frente da meta adversária. Tipo de regularidade que coloca jogadores entre os candidatos a chuteira de ouro do campeonato — e ele claramente está nessa briga.",
    "{top_scorer} foi o destaque ofensivo da rodada com {top_scorer_goals} gols pelo {top_scorer_club}. Mais um capítulo de uma temporada que vem ganhando contornos memoráveis pro jogador, que segue mostrando por que é peça fundamental no esquema do treinador. Quem acompanha o campeonato sabe que o jogador vinha empurrando essa cifra rodada após rodada — e agora consolidou a vaga entre os artilheiros.",
  ],
  generic_round: [
    "Foi uma rodada sem grandes individualidades brilhando, mas com várias atuações coletivas competentes. Times mostraram organização tática, comissões técnicas testaram esquemas, e os resultados saíram dentro do padrão esperado pela tabela. Tipo de rodada que constrói temporada — sem flashes individuais, mas com peso coletivo na soma final da campanha.",
    "Sem destaque individual gritante, a rodada foi mais sobre coletivos bem ajustados do que sobre nomes específicos. Cada equipe trabalhou seu plano de jogo, alguns conseguiram impor melhor, outros tiveram que reagir, e a tabela seguiu seu curso natural. Rodadas assim mostram a importância da consistência tática e da gestão de elenco no decorrer da temporada.",
    "Rodada de futebol bem disputado, sem grandes stars individuais, mas com várias decisões importantes. Times somaram pontos onde precisavam, técnicos fizeram ajustes pontuais, e a tabela manteve o ritmo de redesenho a cada nova jornada. Próximas rodadas devem trazer mais emoção, mas a presente cumpriu seu papel de manter o campeonato vivo e disputado.",
  ],
};

// ── PT §3: table implication ──
const PAR3_PT: Record<Par3Type, string[]> = {
  new_leader: [
    "Mudança no topo da tabela: {leader_club} ultrapassou {old_leader_club} e assume isolada a liderança da Liga com {leader_points} pontos. Foi uma virada importante na briga pelo título, com o novo líder mostrando regularidade nas últimas rodadas e aproveitando o tropeço do ex-líder pra cravar a primeira posição. Briga pela ponta vai esquentar nas próximas rodadas, e o {leader_club} entra como favorito momentâneo.",
    "{leader_club} é o novo líder isolado da Liga: {leader_points} pontos depois desta rodada, posição arrancada das mãos do {old_leader_club}, que vinha mantendo a primeira colocação. A virada na ponta da tabela escreve um capítulo importante na disputa pelo título, e o time que assumiu agora tem a missão de manter o ritmo e administrar a vantagem nas rodadas que vêm pela frente.",
    "Liderança troca de mãos: {leader_club} chega aos {leader_points} pontos e ultrapassa {old_leader_club} no topo da Liga. Era um movimento que vinha sendo desenhado nas últimas rodadas — regularidade do novo líder vs. inconsistência do antigo — e nesta rodada se concretizou. Próximas semanas serão decisivas pra confirmar quem ficará na ponta até o fim, ou se ainda haverá novas reviravoltas no topo.",
  ],
  leader_pulls_away: [
    "{leader_club} segue na ponta isolada da Liga com {leader_points} pontos e abre vantagem de {point_gap} ponto(s) pro {second_club} (segundo colocado, {second_points} pontos). A regularidade nas últimas rodadas começa a ganhar contornos de favoritismo claro pelo título — quanto mais o líder mantém o ritmo, mais difícil fica pros perseguidores reagirem. Briga pela ponta segue, mas com vantagem psicológica do líder.",
    "Líder isolado e cada vez mais sólido: {leader_club} tem {leader_points} pontos e vê a vantagem pro {second_club} ({second_points}) crescer pra {point_gap} ponto(s) após esta rodada. Equipe que tem mostrado regularidade, gestão de elenco e qualidade técnica cresce na disputa — e os perseguidores precisam de uma sequência pra encostar de verdade. Por enquanto, ambiente positivo no clube líder.",
    "Vantagem do {leader_club} aumenta: {leader_points} pontos contra {second_points} do {second_club}, diferença de {point_gap} ponto(s) na ponta da tabela. Regularidade que começa a se transformar em vantagem psicológica importante na briga pelo título. Rodadas que faltam serão decisivas, mas o líder entra cada vez mais firme como favorito pelo simples fato de não estar dando muitas brechas pros adversários direto.",
  ],
  relegation_movement: [
    "Mexida na zona de rebaixamento: {entered_relegation} entrou na zona após esta rodada{exited_relegation_clause}. A reta final do campeonato vai ser dramática pra os times envolvidos na briga contra o descenso, e cada partida agora vale ouro. Pressão sobre comissões técnicas e elencos tende a aumentar nos próximos dias, e a torcida vai cobrar reação imediata se quiser ver os times longe da degola.",
    "Zona de rebaixamento muda de inquilinos: {entered_relegation} caiu pra zona perigosa{exited_relegation_clause}. É a pressão típica das rodadas decisivas — cada deslize pesa, cada vitória de adversário direto puxa o time pra baixo, e a tensão no ambiente do clube vai aumentando rodada após rodada. Próximos compromissos serão fundamentais pra definir quem realmente vai brigar até o fim contra o descenso.",
    "Movimentação importante na parte de baixo da tabela: {entered_relegation} agora ocupa posição de rebaixamento{exited_relegation_clause}. Reta final vai ser tensa, e os clubes ameaçados precisam reagir rápido — em desempenho, postura, resultados. Pra evitar o descenso, qualquer ponto perdido nesse momento pode pesar demais na conta final que define quem fica e quem cai pra próxima temporada.",
  ],
  top_scorer_race: [
    "Outro destaque que se desenrola na competição: {season_top_scorer} agora lidera a artilharia da temporada com {season_top_scorer_goals} gols. Os números desta rodada o colocaram em posição privilegiada na briga pela chuteira de ouro, e o jogador segue numa fase produtiva impressionante. Promete render conversa nas próximas rodadas, com possíveis perseguidores tentando descontar a vantagem antes do fim do campeonato.",
    "Liderança da artilharia segue com {season_top_scorer}: {season_top_scorer_goals} gols na temporada, posição de protagonista no ranking dos goleadores. Atacante em estado de graça, marcando em sequência e mantendo regularidade que justifica plenamente a primeira posição. Briga pela chuteira de ouro vai ser uma das narrativas paralelas mais interessantes até o fim do campeonato — quem chega ali no final?",
  "{season_top_scorer} continua liderando a corrida pela artilharia da Liga: {season_top_scorer_goals} gols na temporada após esta rodada. O jogador vinha empurrando essa cifra rodada após rodada, e nesta semana confirmou de novo o status entre os melhores finalizadores. Ainda há rodadas pela frente pra brigarem pela chuteira de ouro, mas hoje ele claramente é o favorito e segue mostrando regularidade que assusta os perseguidores.",
  ],
  generic_table: [
    "Tabela segue se desenhando rodada após rodada: {leader_club} mantém a liderança com {leader_points} pontos, e os perseguidores fazem fila buscando os pontos que faltam. As próximas rodadas seguem decisivas em todas as zonas da classificação — quem disputa título, quem briga por vagas continentais, quem corre contra o rebaixamento. A Liga continua viva e disputada, com cenários que mudam a cada nova jornada.",
    "Após mais uma rodada, {leader_club} segue na ponta com {leader_points} pontos. Os times que perseguem precisam manter regularidade pra encostar, os do meio trabalham pra subir, e os de baixo correm pra escapar do descenso. Tabela que continua como retrato fiel das forças da temporada, e que ainda promete reviravoltas até o último jogo da competição.",
    "{leader_club} consolida liderança com {leader_points} pontos após esta rodada, e a tabela mantém o desenho típico de campeonato em pleno andamento. Cada zona tem suas próprias batalhas, cada time conhece seus objetivos, e a próxima rodada já se aproxima com a missão de definir um pouco mais quem fica com o que. Liga viva, disputada, em construção rumo ao desfecho da temporada.",
  ],
};

// ── EN §1 ──
const PAR1_EN: string[] = [
  "League round {round} ended with {num_matches} matches and {total_goals} goals scored — an average of {avg_goals} goals per game. {featured_clause} It was a round of ups and downs, with clear winners, tight draws, and a few surprises along the way. The fans left satisfied with the volume of football on offer, and the table saw more important shifts as results came in.",
  "Round {round} of the competition wrapped up: {num_matches} games, {total_goals} goals, and the balance that defines a hard-fought championship. {featured_clause} Teams fought point by point, coaches tested setups, and the table moved again with important news at the top and bottom. Next round already promises more emotion for those following closely.",
  "Round {round} concluded with {total_goals} goals across {num_matches} matches, an average of {avg_goals} per game. {featured_clause} These were days of important decisions — every win matters more at this stage, every draw can weigh heavy down the line, and every loss shifts the mood at the club involved. Check the round's standout moments below.",
  "Another league round in the books, and round {round} was packed with football: {num_matches} matches, {total_goals} goals total, average close to {avg_goals} per game. {featured_clause} Teams consolidated positive moments, others had to reset their approach, and the table keeps being redrawn each new round that finishes. The fight continues fiercely across all zones of the standings.",
  "{num_matches} matches, {total_goals} goals, an average of {avg_goals} per game: round {round} of the league produced expressive numbers for the fans who tuned in. {featured_clause} It was another chapter of a season taking definitive shape week by week — those at the top reinforce, those at the bottom need to run, and those in the middle keep seeking stability.",
];

// ── EN §2 ──
const PAR2_EN: Record<Par2Type, string[]> = {
  hat_trick_round: [
    "The undeniable name of the round was {hat_trick_player}, of {hat_trick_club}, with {hat_trick_goals} goals in a single match. A hat-trick that puts the player in the conversation for player of the week and reinforces why he's been catching the eye of scouts from the continent's main teams. A rare display, the kind that justifies the ticket and goes into the player's personal history. The fans now expect a repeat next round.",
    "A magical night for {hat_trick_player} marked the round — {hat_trick_goals} goals for {hat_trick_club} in one match, numbers of a player in absolute state of grace. The player carried the team alone in decisive moments, found paths to goal in distinct situations, and proved his worth to anyone still doubting. A hat-trick that resonates far beyond the three points added to the campaign.",
    "When the round produced its biggest individual brilliance, it was {hat_trick_player} who signed it: {hat_trick_goals} goals in a single game, wearing the {hat_trick_club} shirt. A hat-trick built on technical quality, the right positioning at the right time, and that spark of talent that separates ordinary players from established goalscorers. Days later, it's still the play that produces most talk among pundits and fans.",
  ],
  best_comeback: [
    "The {bc_winner} comeback over {bc_loser} ({bc_score}) was the round's most striking play. A team that was trailing grew in the second half, found strength in the closing minutes' stamina, and built a result that seemed unlikely until halfway through. The kind of comeback worth more than three points — it gives morale to the entire team for the coming rounds and shows collective character worthy of press praise.",
    "Historic reaction in the round: {bc_winner} flipped the game against {bc_loser} and won {bc_score}. Behind on the scoreboard for much of the match, the winning team grew at the right moment, pushed forward with high pressing, and settled it in the closing minutes with technical quality and personality. A comeback for the gallery of memorable ones, placing {bc_winner} as the week's protagonist.",
    "{bc_winner} did what few teams have managed this season: flipped a tough match against {bc_loser} and closed it {bc_score}. Determination, offensive quality, and cool head under pressure defined the result, and the fans left raising title-campaign hypotheses for the winning team. A comeback that will have a place of honor among the round's performances.",
  ],
  gk_of_round: [
    "{gk_hero} was the goalkeeper of the round — {gk_hero_saves} important saves in a single match, holding the team in a performance worthy of admiration. In crucial moments, the keeper appeared to prevent certain goals, donned the hero's cape, and stopped the score from heading in a different direction. A performance that shows why he's considered a fundamental piece of the squad he defends.",
    "A gala night for {gk_hero}: {gk_hero_saves} spectacular saves in a single match, a performance that went straight into the gallery of the round's best moments. Ball off the crossbar, one-on-one finishing, long-range shot — in every situation the goalkeeper responded with perfect reflex and positioning. The kind of display that separates ordinary keepers from true guardians.",
    "{gk_hero} was the round's defensive reference with {gk_hero_saves} decisive saves. A keeper who grows in the toughest matches, with cool blood under pressure, again showed why he's considered one of the best in the championship. A performance that deserves highlight in post-round analysis and reinforces the importance of silent work between the posts for a successful season.",
  ],
  top_scorer_round: [
    "{top_scorer}, of {top_scorer_club}, was the round's top scorer with {top_scorer_goals} goals. The player was in every important play for his team, finished with visible technical quality, and cemented his position as offensive reference of the squad. A performance that confirms his place among the season's best goalscorers and keeps expectations high for the next round.",
    "The round's golden boot had a clear name: {top_scorer}, of {top_scorer_club}, with {top_scorer_goals} goals. The player continues in an impressive productive phase, scoring in sequence and carrying the team whenever he appears in front of goal. The kind of consistency that places players among golden-boot candidates — and he's clearly in that race.",
    "{top_scorer} was the round's offensive standout with {top_scorer_goals} goals for {top_scorer_club}. Another chapter of a season taking memorable shape for the player, who keeps showing why he's a fundamental piece in the coach's setup. Whoever follows the championship knows he was pushing this number round after round — and now consolidates a slot among the top scorers.",
  ],
  generic_round: [
    "It was a round without major individuals shining, but with several competent collective performances. Teams showed tactical organization, technical staffs tested setups, and results came within the table's expected pattern. The kind of round that builds a season — without individual flashes, but with collective weight in the final campaign tally.",
    "Without a screaming individual standout, the round was more about well-tuned collectives than about specific names. Each team worked its game plan, some imposed it better, others had to react, and the table continued its natural course. Rounds like this show the importance of tactical consistency and squad management over the season.",
    "A round of well-disputed football, without major individual stars, but with several important decisions. Teams added points where they needed, coaches made specific adjustments, and the table maintained its rhythm of redrawing each new gameweek. Coming rounds should bring more emotion, but this one fulfilled its role of keeping the championship alive and contested.",
  ],
};

// ── EN §3 ──
const PAR3_EN: Record<Par3Type, string[]> = {
  new_leader: [
    "Change at the top: {leader_club} overtook {old_leader_club} and takes alone the league leadership with {leader_points} points. It was an important shift in the title race, with the new leader showing consistency in recent rounds and capitalizing on the former leader's stumble to claim first place. The fight at the top will heat up in coming rounds, and {leader_club} enters as momentary favorite.",
    "{leader_club} is the new isolated league leader: {leader_points} points after this round, position taken from {old_leader_club}, who had been holding first place. The shift at the top writes an important chapter in the title fight, and the team that took over now has the mission to maintain rhythm and manage the lead in the rounds ahead.",
    "Leadership changes hands: {leader_club} reaches {leader_points} points and overtakes {old_leader_club} at the top of the league. It was a movement being drawn over recent rounds — new leader's consistency vs. old one's inconsistency — and this round it materialized. Coming weeks will be decisive in confirming who'll stay at the top until the end, or if there will be more reversals at the summit.",
  ],
  leader_pulls_away: [
    "{leader_club} continues alone at the top with {leader_points} points and opens a {point_gap}-point lead over {second_club} (second place, {second_points} points). The consistency in recent rounds is taking shape as clear title favoritism — the more the leader maintains rhythm, the harder it gets for chasers to react. The fight for the top continues, but with psychological advantage for the leader.",
    "Isolated leader, increasingly solid: {leader_club} has {leader_points} points and watches the lead over {second_club} ({second_points}) grow to {point_gap} points after this round. A team that's shown consistency, squad management, and technical quality grows in the dispute — and the chasers need a streak to truly close in. For now, positive atmosphere at the leading club.",
    "{leader_club}'s lead increases: {leader_points} points to {second_club}'s {second_points}, a {point_gap}-point gap at the top of the table. Consistency that's starting to translate into important psychological advantage in the title fight. Remaining rounds will be decisive, but the leader enters increasingly firm as favorite by the simple fact of not giving many openings to direct rivals.",
  ],
  relegation_movement: [
    "Movement in the relegation zone: {entered_relegation} entered the zone after this round{exited_relegation_clause}. The championship's final stretch will be dramatic for the teams in the drop fight, and every match now is worth gold. Pressure on technical staffs and squads tends to grow in the coming days, and fans will demand immediate reaction if they want to see their teams away from the relegation zone.",
    "Relegation zone changes tenants: {entered_relegation} fell into the danger zone{exited_relegation_clause}. It's the typical pressure of decisive rounds — every slip weighs, every direct rival's win pulls the team down, and tension at the club builds round by round. Coming fixtures will be fundamental in defining who really fights to the end against the drop.",
    "Important movement at the bottom of the table: {entered_relegation} now occupies a relegation spot{exited_relegation_clause}. The final stretch will be tense, and the threatened clubs need to react fast — in performance, attitude, results. To avoid the drop, any point lost at this moment can weigh too much on the final tally that defines who stays and who falls to the next season.",
  ],
  top_scorer_race: [
    "Another storyline unfolding in the competition: {season_top_scorer} now leads the season's top scorer race with {season_top_scorer_goals} goals. The numbers from this round placed him in privileged position in the golden-boot fight, and the player continues in an impressive productive phase. He promises to produce talk in coming rounds, with possible chasers trying to close the gap before the championship ends.",
    "Top scorer leadership stays with {season_top_scorer}: {season_top_scorer_goals} goals on the season, protagonist position in the goalscorers' ranking. A scorer in state of grace, scoring in sequence and maintaining consistency that fully justifies first place. The golden-boot fight will be one of the most interesting parallel narratives until the season's end — who arrives there at the finish?",
    "{season_top_scorer} continues leading the league's golden-boot race: {season_top_scorer_goals} goals on the season after this round. The player had been pushing this number round after round, and this week confirmed his status among the best finishers again. Rounds remain to fight for the golden boot, but today he's clearly the favorite and shows consistency that scares the chasers.",
  ],
  generic_table: [
    "The table continues taking shape round after round: {leader_club} maintains the lead with {leader_points} points, and the chasers line up seeking the points missing. Coming rounds remain decisive across all zones of the standings — those disputing the title, those fighting for continental slots, those running against relegation. The league continues alive and contested, with scenarios changing each new gameweek.",
    "After another round, {leader_club} stays at the top with {leader_points} points. The chasing teams need to maintain consistency to close in, those in the middle work to climb, and those at the bottom run to escape the drop. A table that continues as a faithful portrait of the season's forces, and still promises reversals until the competition's last match.",
    "{leader_club} consolidates the lead with {leader_points} points after this round, and the table maintains the typical layout of a championship in full swing. Each zone has its own battles, each team knows its objectives, and the next round already approaches with the mission to define a little more who gets what. League alive, contested, building toward the season's denouement.",
  ],
};

// ── Pickers ──
function pickPar2(f: RoundRecapFacts): Par2Type {
  if (f.hatTrickPlayer && f.hatTrickGoals >= 3) return 'hat_trick_round';
  if (f.bestComeback) return 'best_comeback';
  if (f.gkHeroName && f.gkHeroSaves >= 3) return 'gk_of_round';
  if (f.topScorerName && f.topScorerGoals >= 2) return 'top_scorer_round';
  return 'generic_round';
}

function pickPar3(f: RoundRecapFacts): Par3Type {
  if (f.newLeaderThisRound && f.oldLeaderClubName) return 'new_leader';
  if (f.leaderClubName && f.pointGap >= 4) return 'leader_pulls_away';
  if (f.enteredRelegation.length > 0) return 'relegation_movement';
  if (f.seasonTopScorerName && f.seasonTopScorerGoals >= 5) return 'top_scorer_race';
  return 'generic_table';
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

function buildVars(f: RoundRecapFacts, lang: 'pt' | 'en'): Record<string, string | number | null> {
  const featuredClause = f.featuredMatch
    ? (lang === 'en'
        ? `${f.featuredMatch.home} ${f.featuredMatch.homeGoals}-${f.featuredMatch.awayGoals} ${f.featuredMatch.away} stood out as the round's most-scoring match.`
        : `${f.featuredMatch.home} ${f.featuredMatch.homeGoals} x ${f.featuredMatch.awayGoals} ${f.featuredMatch.away} se destacou como a partida com mais gols da rodada.`)
    : '';

  const exitedRelegationClause = f.exitedRelegation.length > 0
    ? (lang === 'en'
        ? `, while ${f.exitedRelegation.join(', ')} climbed out`
        : `, enquanto ${f.exitedRelegation.join(', ')} saiu da zona`)
    : '';

  return {
    round: f.roundNumber,
    num_matches: f.numMatches,
    total_goals: f.totalGoals,
    avg_goals: f.averageGoals.toFixed(1).replace('.', lang === 'en' ? '.' : ','),
    featured_clause: featuredClause,
    hat_trick_player: f.hatTrickPlayer ?? '',
    hat_trick_goals: f.hatTrickGoals,
    hat_trick_club: f.hatTrickClub ?? '',
    top_scorer: f.topScorerName ?? '',
    top_scorer_goals: f.topScorerGoals,
    top_scorer_club: f.topScorerClub ?? '',
    gk_hero: f.gkHeroName ?? '',
    gk_hero_saves: f.gkHeroSaves,
    bc_winner: f.bestComeback?.winner ?? '',
    bc_loser: f.bestComeback?.loser ?? '',
    bc_score: f.bestComeback?.score ?? '',
    leader_club: f.leaderClubName ?? '',
    leader_points: f.leaderPoints,
    second_club: f.secondClubName ?? '',
    second_points: f.secondPoints,
    point_gap: f.pointGap,
    old_leader_club: f.oldLeaderClubName ?? '',
    entered_relegation: f.enteredRelegation.join(', '),
    exited_relegation_clause: exitedRelegationClause,
    season_top_scorer: f.seasonTopScorerName ?? '',
    season_top_scorer_goals: f.seasonTopScorerGoals,
  };
}

export function assembleRoundRecap(facts: RoundRecapFacts, lang: 'pt' | 'en'): string {
  const par1Set = lang === 'en' ? PAR1_EN : PAR1_PT;
  const par2Type = pickPar2(facts);
  const par3Type = pickPar3(facts);
  const par2Set = (lang === 'en' ? PAR2_EN : PAR2_PT)[par2Type];
  const par3Set = (lang === 'en' ? PAR3_EN : PAR3_PT)[par3Type];

  const par1 = pickRandom(par1Set);
  const par2 = pickRandom(par2Set);
  const par3 = pickRandom(par3Set);

  const vars = buildVars(facts, lang);
  return [
    fillTemplate(par1, vars),
    fillTemplate(par2, vars),
    fillTemplate(par3, vars),
  ].join('\n\n');
}

// ── Fact extraction ──
// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any>>;

async function extractFacts(supabase: SupabaseClient, roundId: string): Promise<RoundRecapFacts | null> {
  const { data: round } = await supabase
    .from('league_rounds')
    .select('id, round_number, season_id, status')
    .eq('id', roundId)
    .maybeSingle();
  if (!round || round.status !== 'finished') return null;

  // All league_matches in this round
  const { data: leagueMatches } = await supabase
    .from('league_matches')
    .select('match_id, home_club_id, away_club_id')
    .eq('round_id', roundId);
  if (!leagueMatches || leagueMatches.length === 0) return null;

  const matchIds = leagueMatches.map((lm: any) => lm.match_id).filter(Boolean);
  const { data: matches } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score')
    .in('id', matchIds);

  // Collect club names
  const allClubIds = new Set<string>();
  for (const lm of leagueMatches) {
    allClubIds.add(lm.home_club_id);
    allClubIds.add(lm.away_club_id);
  }
  const { data: clubsList } = await supabase
    .from('clubs')
    .select('id, name')
    .in('id', Array.from(allClubIds));
  const clubName = new Map<string, string>();
  for (const c of clubsList ?? []) clubName.set(c.id, c.name);

  // Match summaries
  const matchSummaries: RoundRecapFacts['matchSummaries'] = [];
  let totalGoals = 0;
  let featuredMatch: RoundRecapFacts['featuredMatch'] = null;
  let featuredScore = -1;
  for (const m of matches ?? []) {
    const home = clubName.get(m.home_club_id) ?? '';
    const away = clubName.get(m.away_club_id) ?? '';
    matchSummaries.push({
      home,
      away,
      homeGoals: m.home_score ?? 0,
      awayGoals: m.away_score ?? 0,
      matchId: m.id,
    });
    const sum = (m.home_score ?? 0) + (m.away_score ?? 0);
    totalGoals += sum;
    if (sum > featuredScore) {
      featuredScore = sum;
      featuredMatch = {
        home,
        away,
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
      };
    }
  }
  const numMatches = matchSummaries.length;
  const averageGoals = numMatches > 0 ? totalGoals / numMatches : 0;

  // Hat-trick: read narratives from each match's facts_json (already
  // computed by match recap), faster than re-scanning event logs.
  let hatTrickPlayer: string | null = null;
  let hatTrickGoals = 0;
  let hatTrickClub: string | null = null;
  let topScorerName: string | null = null;
  let topScorerGoals = 0;
  let topScorerClub: string | null = null;
  let gkHeroName: string | null = null;
  let gkHeroSaves = 0;
  let bestComeback: RoundRecapFacts['bestComeback'] = null;

  // Aggregate goals across all matches by player_profile_id from player_match_stats
  const { data: roundStats } = await supabase
    .from('player_match_stats')
    .select('match_id, player_profile_id, club_id, goals, gk_saves')
    .in('match_id', matchIds);

  const goalsByPlayer = new Map<string, { goals: number; club_id: string }>();
  for (const s of roundStats ?? []) {
    if (!s.player_profile_id) continue;
    const prev = goalsByPlayer.get(s.player_profile_id);
    if (prev) prev.goals += s.goals ?? 0;
    else goalsByPlayer.set(s.player_profile_id, { goals: s.goals ?? 0, club_id: s.club_id });
    if ((s.gk_saves ?? 0) > gkHeroSaves) {
      gkHeroSaves = s.gk_saves ?? 0;
      gkHeroName = s.player_profile_id; // resolve to name below
    }
  }

  // Resolve names
  const profileIds = new Set<string>();
  for (const [pid] of goalsByPlayer) profileIds.add(pid);
  if (gkHeroName) profileIds.add(gkHeroName);
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from('player_profiles')
      .select('id, full_name, club_id')
      .in('id', Array.from(profileIds));
    const nameById = new Map<string, string>();
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);

    if (gkHeroName) gkHeroName = nameById.get(gkHeroName) ?? null;

    // Top scorer + hat-trick
    for (const [pid, info] of goalsByPlayer) {
      if (info.goals >= 3 && info.goals > hatTrickGoals) {
        hatTrickGoals = info.goals;
        hatTrickPlayer = nameById.get(pid) ?? null;
        hatTrickClub = clubName.get(info.club_id) ?? null;
      }
      if (info.goals > topScorerGoals) {
        topScorerGoals = info.goals;
        topScorerName = nameById.get(pid) ?? null;
        topScorerClub = clubName.get(info.club_id) ?? null;
      }
    }
  }

  // Best comeback: scan match recaps for bucket='comeback'
  const { data: comebackRecaps } = await supabase
    .from('narratives')
    .select('entity_id, facts_json')
    .eq('entity_type', 'match')
    .eq('scope', 'match_recap')
    .in('entity_id', matchIds);
  for (const r of comebackRecaps ?? []) {
    const fj = r.facts_json as any;
    if (fj?.bucket === 'comeback') {
      const winnerName = (fj.homeGoals > fj.awayGoals) ? fj.homeName : fj.awayName;
      const loserName = (fj.homeGoals > fj.awayGoals) ? fj.awayName : fj.homeName;
      const winnerGoals = Math.max(fj.homeGoals, fj.awayGoals);
      const loserGoals = Math.min(fj.homeGoals, fj.awayGoals);
      bestComeback = {
        winner: winnerName,
        loser: loserName,
        score: `${winnerGoals}-${loserGoals}`,
      };
      break; // first comeback is enough
    }
  }

  // Standings (after this round)
  let leaderClubName: string | null = null;
  let leaderPoints = 0;
  let secondClubName: string | null = null;
  let secondPoints = 0;
  let pointGap = 0;
  let numClubsInLeague = 0;

  const { data: standings } = await supabase
    .from('league_standings')
    .select('club_id, points, goals_for, goals_against, played')
    .eq('season_id', round.season_id);

  if (standings && standings.length > 0) {
    const sorted = [...standings].sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goals_for - a.goals_against;
      const gdB = b.goals_for - b.goals_against;
      if (gdB !== gdA) return gdB - gdA;
      return b.goals_for - a.goals_for;
    });
    numClubsInLeague = sorted.length;
    if (sorted[0]) {
      leaderClubName = clubName.get(sorted[0].club_id) ?? null;
      leaderPoints = sorted[0].points;
    }
    if (sorted[1]) {
      secondClubName = clubName.get(sorted[1].club_id) ?? null;
      secondPoints = sorted[1].points;
    }
    pointGap = leaderPoints - secondPoints;
  }

  // Detect leader change: was the previous-round leader different?
  // Look at the previous round's recap facts_json if present.
  let newLeaderThisRound = false;
  let oldLeaderClubName: string | null = null;
  if (round.round_number > 1) {
    const { data: prevRound } = await supabase
      .from('league_rounds')
      .select('id')
      .eq('season_id', round.season_id)
      .eq('round_number', round.round_number - 1)
      .maybeSingle();
    if (prevRound) {
      const { data: prevRecap } = await supabase
        .from('narratives')
        .select('facts_json')
        .eq('entity_type', 'league_round')
        .eq('entity_id', prevRound.id)
        .eq('scope', 'round_recap')
        .maybeSingle();
      const prevLeader = (prevRecap?.facts_json as any)?.leaderClubName ?? null;
      if (prevLeader && prevLeader !== leaderClubName) {
        newLeaderThisRound = true;
        oldLeaderClubName = prevLeader;
      }
    }
  }

  // Relegation movement: same idea — compare with previous round's facts
  const enteredRelegation: string[] = [];
  const exitedRelegation: string[] = [];
  // For v1 we keep this simple — only fill these when we have prev recap
  // available with relegationZoneClubs cached.
  // (Not fatal if missing; templates handle empty array.)

  // Season top scorer
  let seasonTopScorerName: string | null = null;
  let seasonTopScorerGoals = 0;
  const { data: seasonStats } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, goals')
    .eq('season_id', round.season_id);
  if (seasonStats && seasonStats.length > 0) {
    const total = new Map<string, number>();
    for (const s of seasonStats) {
      if (!s.player_profile_id) continue;
      total.set(s.player_profile_id, (total.get(s.player_profile_id) ?? 0) + (s.goals ?? 0));
    }
    let topId: string | null = null;
    for (const [pid, g] of total) {
      if (g > seasonTopScorerGoals) {
        seasonTopScorerGoals = g;
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

  return {
    roundNumber: round.round_number,
    seasonId: round.season_id,
    numMatches,
    totalGoals,
    averageGoals,
    matchSummaries,
    featuredMatch,
    hatTrickPlayer,
    hatTrickGoals,
    hatTrickClub,
    topScorerName,
    topScorerGoals,
    topScorerClub,
    gkHeroName,
    gkHeroSaves,
    bestComeback,
    leaderClubName,
    leaderPoints,
    secondClubName,
    secondPoints,
    pointGap,
    newLeaderThisRound,
    oldLeaderClubName,
    numClubsInLeague,
    enteredRelegation,
    exitedRelegation,
    seasonTopScorerName,
    seasonTopScorerGoals,
  };
}

export async function generateAndPersistRoundRecap(supabase: SupabaseClient, roundId: string): Promise<void> {
  try {
    const facts = await extractFacts(supabase, roundId);
    if (!facts) return;

    const body_pt = assembleRoundRecap(facts, 'pt');
    const body_en = assembleRoundRecap(facts, 'en');

    await supabase.from('narratives').insert({
      entity_type: 'league_round',
      entity_id: roundId,
      scope: 'round_recap',
      season: null,
      round: facts.roundNumber,
      body_pt,
      body_en,
      facts_json: facts,
    });
  } catch (err) {
    console.error('[round_recap] generation failed:', err);
  }
}
