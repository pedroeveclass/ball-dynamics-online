// Season Recap narrative system (Deno).
//
// Triggered when a league_season transitions to status='finished'.
// Builds a 4-paragraph chronicle of the entire season: overview,
// champion's path, individual highlights (top scorer, MVP, golden glove,
// hat-tricks), and relegation + outlook. Pulls data from standings,
// player_awards, narratives (match recaps), and player_match_stats.
//
// Persisted as a single narrative row keyed on
// (entity_type='league_season', entity_id=season_id, scope='season_recap').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any>>;

export interface TopMoment {
  roundNumber: number;
  type: 'rout' | 'comeback' | 'late_winner' | 'jogao' | 'red_card_decided' | 'penalty_decided';
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  matchId: string;
  body_pt: string;
  body_en: string;
}

export interface TeamOfSeasonSlot {
  position: string;
  playerName: string;
  clubName: string;
  rating: number;
  matches: number;
}

export interface SeasonRecapFacts {
  seasonNumber: number;
  numClubs: number;
  totalMatches: number;
  totalRounds: number;
  totalGoals: number;
  averageGoals: number;

  // Champion + rivals
  championClubName: string | null;
  championPoints: number;
  championWins: number;
  championDraws: number;
  championLosses: number;
  championGoalsFor: number;
  championGoalsAgainst: number;
  championLeadOverSecond: number;

  runnerUpClubName: string | null;
  runnerUpPoints: number;
  thirdClubName: string | null;
  thirdPoints: number;

  relegatedClubs: string[];

  // Standings (full)
  standings: {
    clubId: string;
    name: string;
    points: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
  }[];

  // Awards
  topScorerName: string | null;
  topScorerGoals: number;
  topScorerClub: string | null;

  topAssistsName: string | null;
  topAssistsValue: number;
  topAssistsClub: string | null;

  goldenGloveName: string | null;
  goldenGloveCleanSheets: number;
  goldenGloveClub: string | null;

  topTacklesName: string | null;
  topTacklesValue: number;
  topTacklesClub: string | null;

  fairPlayClubName: string | null;
  mvpName: string | null;
  mvpClub: string | null;

  // Hat-trick scorers (across the season)
  hatTrickPlayers: { name: string; club: string; goals: number; round: number }[];

  // Curiosities
  biggestWin: { home: string; away: string; homeGoals: number; awayGoals: number; round: number } | null;
  highestScoringMatch: { home: string; away: string; homeGoals: number; awayGoals: number; round: number } | null;
  bestAttackClub: { name: string; goals: number } | null;
  bestDefenseClub: { name: string; conceded: number } | null;
  totalRedCards: number;
  totalYellowCards: number;

  // Top 5 moments (curated from match recaps)
  topMoments: TopMoment[];

  // Team of the Season
  teamOfTheSeason: TeamOfSeasonSlot[];
}

// ── PT §1: Visão Geral ──
const PAR1_PT: string[] = [
  "A Temporada {n} da Liga chegou ao fim com {total_matches} partidas em {total_rounds} rodadas, totalizando {total_goals} gols marcados (média de {avg_goals} por jogo). Foi uma temporada de ritmo intenso, com clubes brigando ponto a ponto em todas as zonas da tabela e definições importantes acontecendo já nas rodadas finais. Os números refletem o equilíbrio competitivo de uma liga que não deu trégua a quem ousou se distrair por uma rodada que fosse.",
  "Encerrou a Temporada {n}: {total_matches} jogos, {total_rounds} rodadas, {total_goals} gols. Média de {avg_goals} por partida — número que conta a história de uma liga ofensiva, com ataques produtivos e defesas que precisaram trabalhar dobrado. Foram meses de regularidade exigida, jogos decisivos e reviravoltas em cima e embaixo da tabela, e poucos clubes terminaram a temporada com a sensação de tranquilidade.",
  "{total_matches} partidas disputadas em {total_rounds} rodadas, {total_goals} gols anotados, média de {avg_goals} por jogo: assim termina a Temporada {n} da Liga, depositando no histórico mais um capítulo de futebol disputado a cada minuto. Cada zona da tabela teve sua própria batalha — título, vagas continentais, meio da tabela, rebaixamento — e o resultado final espelha quem soube manter consistência ao longo da campanha inteira.",
  "Temporada {n} da Liga concluída: {total_rounds} rodadas, {total_matches} confrontos, {total_goals} gols (média de {avg_goals} por partida). Foi um campeonato que cobrou regularidade dos times grandes, deu oportunidade aos médios de subirem de patamar e foi cruel com quem deixou de pontuar nos momentos decisivos. O que se viu em campo cobre todo o espectro do futebol: brilhos individuais, atuações coletivas memoráveis, gestão de elenco testada ao limite.",
  "{total_rounds} rodadas, {total_matches} jogos, {total_goals} gols na conta: a Temporada {n} fechou com saldo expressivo, média de {avg_goals} gols por partida, e protagonismos definidos em todas as zonas da tabela. Foi uma campanha que misturou favoritismo com surpresas, com clubes consolidando momentos positivos e outros vendo planejamentos inteiros desabarem em sequências negativas. Liga aberta, disputada, que deixa muita conversa pro pré-temporada que vem por aí.",
  "Ao fim da Temporada {n}, os números falam por si: {total_matches} partidas, {total_rounds} rodadas, {total_goals} gols, média de {avg_goals} por jogo. Mas os números não contam tudo — contam acima, embaixo, no meio da tabela uma série de histórias individuais e coletivas que vão render conversa por meses no pré-temporada. Foi uma liga que valorizou regularidade, puniu inconsistência e deu poucos espaços pra erros estratégicos importantes.",
  "Encerra-se a Temporada {n} da Liga após {total_rounds} rodadas e {total_matches} jogos disputados. {total_goals} gols marcados ao longo da campanha, média de {avg_goals} por partida — números expressivos que justificam a popularidade do campeonato e o engajamento da torcida ao longo dos meses. Cada zona da tabela teve seu enredo próprio, e o conjunto final reflete fielmente o que aconteceu dentro de campo.",
  "Temporada {n} fica pra história com saldo de {total_goals} gols em {total_matches} jogos, média de {avg_goals} por partida — números que confirmam a vitalidade ofensiva de uma liga jovem e disputada. As {total_rounds} rodadas contaram com momentos de tudo: goleadas, viradas, jogos truncados, decisões na bola parada, polêmicas de arbitragem. Tudo o que faz parte do futebol de campeonato regular, em doses generosas pra todos os perfis de torcedor.",
  "Acabou a Temporada {n} da Liga: {total_matches} confrontos, {total_rounds} rodadas, {total_goals} gols. Média de {avg_goals} por jogo. Foi uma campanha de altos contrastes — clubes que dominaram do começo ao fim, outros que viveram subidas e descidas dramáticas, e alguns que ficaram pra trás cedo e nunca conseguiram reagir. O que une todos é a sensação de que cada ponto pesou, e que a tabela final reflete fielmente a regularidade ao longo dos meses.",
  "Temporada {n} chegou ao apito final: {total_matches} partidas em {total_rounds} rodadas, {total_goals} gols (média {avg_goals}/jogo), e um leque inteiro de histórias pra contar. Foi um campeonato que terminou com personagens claros em cada zona da tabela — campeão consolidado, vice-líder confirmado, brigas de top 4 esticadas até as últimas rodadas, decisões dramáticas na zona de rebaixamento. Toda a temporada cabe nesta crônica e nas estatísticas que vêm a seguir.",
];

// ── PT §2: Caminho do Campeão ──
const PAR2_PT: string[] = [
  "{champion} ergueu a taça com {champion_points} pontos em {total_rounds} rodadas — {champion_wins} vitórias, {champion_draws} empates e apenas {champion_losses} derrotas. Saldo de gols positivo expressivo ({champion_goals_for} marcados, {champion_goals_against} sofridos), aproveitamento que justifica plenamente a posição na ponta. Vantagem de {champion_lead} ponto(s) sobre {runner_up} confirma que não foi acaso — foi temporada de superioridade técnica e mental do começo ao fim.",
  "Campeão da Liga, {champion} fechou a temporada com {champion_points} pontos, {champion_wins} vitórias e {champion_losses} derrotas em {total_rounds} jogos. {champion_goals_for} gols pró, {champion_goals_against} contra: ataque produtivo, defesa sólida, gestão de elenco invejável. Título conquistado com {champion_lead} ponto(s) de vantagem sobre o vice-campeão {runner_up} — diferença que reflete a regularidade da campanha do começo ao fim.",
  "Não teve dúvida no topo da tabela: {champion} terminou a temporada com {champion_points} pontos somados, {champion_wins} vitórias, {champion_draws} empates e {champion_losses} derrotas. {champion_goals_for} gols marcados, {champion_goals_against} sofridos. Vantagem de {champion_lead} ponto(s) sobre {runner_up} mostra o domínio claro do campeão sobre os perseguidores. Liga conquistada por mérito, com qualidade técnica e organização tática acima da concorrência.",
  "{champion} foi o time que mais soube usar o calendário a seu favor: {champion_points} pontos somados, {champion_wins} vitórias contra apenas {champion_losses} derrotas em {total_rounds} jogos. {champion_goals_for}-{champion_goals_against} no saldo de gols, {champion_lead} ponto(s) à frente de {runner_up} no fim. Título conquistado com regularidade exemplar — poucos times no histórico recente da Liga conseguiram aproveitamento tão consistente em uma única temporada.",
  "Trajetória sólida do campeão {champion}: {champion_wins} vitórias, {champion_draws} empates, {champion_losses} derrotas em {total_rounds} rodadas, totalizando {champion_points} pontos. Ataque com {champion_goals_for} gols, defesa cedendo apenas {champion_goals_against}. {champion_lead} ponto(s) de folga sobre {runner_up} — diferença que se construiu com pontuação em jogos contra os pequenos e resultados em confrontos diretos contra os perseguidores. Título legitimado em todas as frentes.",
  "{champion} abre a galeria de campeões da Liga {n} com números expressivos: {champion_points} pontos, {champion_wins} vitórias, saldo {champion_goals_for}-{champion_goals_against}. Foram {champion_losses} derrotas no total — número baixíssimo pra uma temporada de {total_rounds} rodadas. Vantagem de {champion_lead} ponto(s) sobre {runner_up} ratifica o título como conquista por mérito, fruto de elenco entrosado, técnica refinada e gestão competente do calendário.",
  "Reinado claro: {champion} terminou a Liga {n} com {champion_points} pontos, {champion_wins} vitórias e {champion_losses} derrotas em {total_rounds} jogos. {champion_goals_for} gols marcados, {champion_goals_against} sofridos. Saldo positivo de {goal_diff} gols. {champion_lead} ponto(s) à frente de {runner_up} confirma a campanha sólida do começo ao fim. Liga é do {champion}, e o resultado dificilmente surpreendeu quem acompanhou de perto a temporada.",
  "Sem espaço pra dúvida: {champion} é o campeão da Temporada {n}. {champion_points} pontos, {champion_wins} vitórias e apenas {champion_losses} derrotas em {total_rounds} rodadas. Ataque com {champion_goals_for} gols pró, defesa cedendo apenas {champion_goals_against}. Vantagem de {champion_lead} ponto(s) sobre {runner_up}. Não foi temporada fácil — todo título exige luta a cada rodada — mas a regularidade do campeão fez a diferença lá no fim.",
  "Liga conquistada com classe pelo {champion}: {champion_points} pontos somados, {champion_wins} vitórias, {champion_draws} empates, {champion_losses} derrotas em {total_rounds} rodadas. Saldo de gols expressivo ({champion_goals_for}-{champion_goals_against}). Vantagem de {champion_lead} ponto(s) sobre {runner_up} no fim da campanha. Título justíssimo, fruto de uma temporada inteira de regularidade técnica e tática que poucos clubes conseguiram acompanhar.",
  "{champion} levantou a taça da Liga {n} com a autoridade de quem não deu chance pros perseguidores. {champion_points} pontos, {champion_wins} vitórias, {champion_losses} derrotas. Saldo de gols {champion_goals_for}-{champion_goals_against}. {champion_lead} ponto(s) à frente de {runner_up} no apito final da temporada. Título que coroa uma campanha exemplar e abre caminho pra conversa do bicampeonato no início da próxima temporada.",
];

// ── PT §3: Destaques Individuais ──
const PAR3_PT: string[] = [
  "Nos destaques individuais, {top_scorer} foi o artilheiro com {top_scorer_goals} gols pelo {top_scorer_club}{mvp_clause}{golden_glove_clause}{hat_trick_clause}. Premiações que reconhecem trajetórias individuais consistentes ao longo dos {total_rounds} rodadas e que merecem destaque no calendário de prêmios da Liga.",
  "Premiações individuais da Temporada {n}: {top_scorer} levou a chuteira de ouro com {top_scorer_goals} gols pelo {top_scorer_club}{mvp_clause}{golden_glove_clause}{top_assists_clause}. Reconhecimentos justos pra atletas que estiveram em alto nível durante toda a campanha e que se destacaram em quesitos específicos da liga.",
  "{top_scorer} terminou a temporada como artilheiro da Liga, com {top_scorer_goals} gols marcados pelo {top_scorer_club}{mvp_clause}{hat_trick_clause}. Cada premiação individual carrega o peso de meses de regularidade — números que se constroem rodada após rodada e que justificam o reconhecimento dos olheiros, da imprensa e dos torcedores que acompanharam de perto.",
  "Os melhores da Temporada {n} têm nome próprio: {top_scorer} foi o artilheiro com {top_scorer_goals} gols pelo {top_scorer_club}{mvp_clause}{golden_glove_clause}{top_assists_clause}{top_tackles_clause}. Premiações distribuídas por mérito, refletindo desempenho coletado ao longo das {total_rounds} rodadas — não há espaço pra acaso quando se fala de números acumulados de uma temporada inteira.",
  "Capítulo de brilhos individuais: {top_scorer} foi o artilheiro com {top_scorer_goals} gols ({top_scorer_club}){mvp_clause}{hat_trick_clause}{golden_glove_clause}. São números que viraram conversas, debates, peças centrais nas matérias de fim de temporada — e que guardam a memória dos atletas que protagonizaram a Liga {n} no eixo individual.",
  "Reconhecimentos da Temporada {n}: {top_scorer} pelo {top_scorer_club} foi o maior goleador com {top_scorer_goals} gols{mvp_clause}{golden_glove_clause}{top_assists_clause}. Cada um desses prêmios coroa uma temporada inteira de dedicação, qualidade e regularidade — atributos que separam os atletas memoráveis dos meramente regulares no decorrer de uma campanha longa e disputada.",
  "Nos prêmios individuais, {top_scorer} liderou a artilharia com {top_scorer_goals} gols pelo {top_scorer_club}{mvp_clause}{hat_trick_clause}{top_assists_clause}. Atletas que estiveram em forma máxima durante a temporada e que viram seus números traduzirem-se em premiações ao final — reconhecimento merecido pelo trabalho consistente entregue todas as rodadas.",
  "Brilho individual: {top_scorer}, do {top_scorer_club}, fechou como artilheiro com {top_scorer_goals} gols{mvp_clause}{golden_glove_clause}{hat_trick_clause}. Cada premiação tem seu peso próprio — artilheiro mostra finalização, MVP mostra impacto coletivo, golden glove mostra solidez defensiva, top assists mostra criação. Conjunto de prêmios que retrata fielmente quem esteve em alto nível por toda a temporada.",
  "Atletas que fizeram a Temporada {n} valer: {top_scorer} foi a referência ofensiva com {top_scorer_goals} gols pelo {top_scorer_club}{mvp_clause}{top_assists_clause}{golden_glove_clause}. Nomes que saem da temporada com a credencial de quem entregou em alto nível a cada rodada, sustentando seus times e marcando presença nas pautas dos comentaristas semana após semana.",
  "Premiados individuais: {top_scorer} ficou com a chuteira de ouro pelos {top_scorer_goals} gols vestindo a camisa do {top_scorer_club}{mvp_clause}{hat_trick_clause}{golden_glove_clause}{top_tackles_clause}. Cada um construiu sua premiação com regularidade ao longo das {total_rounds} rodadas — não há atalho pra figurar entre os melhores de uma temporada longa e disputada como esta foi.",
];

// ── PT §4: Rebaixados / Futuro ──
const PAR4_PT: string[] = [
  "Por outro lado, {relegated_clubs} caíram pra próxima temporada e enfrentam reconstrução nos próximos meses. Reta de chegada que abre a temporada seguinte com perguntas em aberto: bicampeonato consolidado pelo {champion} ou viragem do enredo? Reação dos rebaixados ou caminho aberto pra novos protagonistas? A próxima Liga começa em breve com narrativa pronta pra ser escrita.",
  "Na zona de rebaixamento, {relegated_clubs} encerraram a temporada na parte de baixo e vão precisar repensar projeto, elenco e direção pra próxima Liga. Pra os outros clubes, a temporada que vem traz desafios próprios — quem ficar com o tabu do título de bicampeão? Quem vai competir pelas vagas continentais? Quem entra com chance real de surpreender depois de meses de pré-temporada bem trabalhada?",
  "{relegated_clubs} foram rebaixados ao fim da Temporada {n} e abrem a próxima Liga vivendo reconstrução. Pra os demais, fica a expectativa em torno de um campeonato que promete intensidade desde a primeira rodada — defender título, brigar por vaga, escapar do rebaixamento, surgir como novo protagonista. Cada clube tem suas perguntas, e a próxima Liga começa em breve com tudo isso em jogo.",
  "Rebaixamento confirmado pra {relegated_clubs}, que terminam a temporada na zona perigosa e enfrentam reconstrução pesada. Pra a Liga {n_next}, expectativas em torno de quem vai enfrentar o {champion} no próximo ciclo — bicampeonato à vista ou nova era de incerteza? Caminhos possíveis, narrativas em aberto, e calendário curto até a primeira rodada da temporada que vem.",
  "{relegated_clubs} caíram ao fim da Temporada {n} e enfrentam o desafio de reerguer os elencos e projetos pra disputar a divisão inferior na próxima rodada. No alto da tabela, fica a pergunta: o {champion} consegue repetir? Vice-campeão {runner_up} reage forte? Algum clube de meio surge como novo protagonista? Liga {n_next} já se desenha com narrativas próprias.",
  "Cenário pra próxima temporada: {relegated_clubs} se despedem da elite após uma campanha difícil, e os 16 que ficam abrem ciclo novo. {champion} entra como favorito a defender o título, {runner_up} como principal ameaça, e os clubes de meio vêm com discussões sobre evolução, planejamento, ambição. Próxima Liga começa em breve, com todas as histórias inacabadas da Temporada {n} pedindo continuação.",
  "Final amargo pra {relegated_clubs}, que descem pra próxima temporada após campanha difícil em todas as frentes. Acima, no meio e em cima da tabela, todos os clubes saem com suas próprias perguntas pra responder no início do próximo ciclo. Bicampeonato pro {champion}? Uma nova surpresa? Reta de chegada da Temporada {n} já abre os olhares pro que vem por aí.",
  "Rebaixados em {n}: {relegated_clubs}. Pra próxima Liga, todos os clubes recomeçam o trabalho — defender título, escalar de patamar, evitar nova queda. Cenários abertos, calendário curto, e todas as histórias da Temporada {n} ficando pra trás conforme nova campanha se aproxima. Continua-se a contar a saga da Liga rodada após rodada.",
  "{relegated_clubs} foram os clubes que terminaram em zona de rebaixamento e descem pra próxima temporada. Pra os 16 que permanecem, fica o desafio do próximo capítulo — repetir conquistas pra alguns, melhorar posição pra muitos, escapar da degola pra outros. A próxima Liga já se desenha com a tradição da Temporada {n} pesando como bagagem e referência.",
  "{relegated_clubs} fecham a Temporada {n} na zona de rebaixamento e abrem a próxima campanha em divisão diferente. Pros que ficam, há narrativa pronta pra continuar — bicampeonato em jogo pro {champion}, revanche em jogo pro {runner_up}, brigas internas pelas vagas continentais e contra a degola. A Liga continua viva, em construção rumo ao próximo capítulo.",
];

// ── EN §1 ──
const PAR1_EN: string[] = [
  "League Season {n} ended with {total_matches} matches across {total_rounds} rounds, {total_goals} goals scored (avg of {avg_goals} per game). It was an intense-paced season, with clubs fighting point by point in every zone of the table and important decisions coming down to the final rounds. The numbers reflect the competitive balance of a league that gave no quarter to anyone who dared lose focus for even a single round.",
  "Season {n} wrapped up: {total_matches} games, {total_rounds} rounds, {total_goals} goals. Average of {avg_goals} per match — a number that tells the story of an offensive league with productive attacks and defenses that had to work double. Months of demanded consistency, decisive matches, and reversals up and down the table, with few clubs ending the season feeling at ease.",
  "{total_matches} matches played in {total_rounds} rounds, {total_goals} goals scored, average of {avg_goals} per game: that's how Season {n} of the League ends, depositing one more chapter of football contested every minute into history. Each zone of the table had its own battle — title, continental slots, midtable, relegation — and the final result mirrors who managed consistency throughout the entire campaign.",
  "League Season {n} concluded: {total_rounds} rounds, {total_matches} confrontations, {total_goals} goals (avg {avg_goals} per match). It was a championship that demanded consistency from the big teams, gave mid-table sides chances to climb, and was cruel to those who failed to score in decisive moments. What was seen on the pitch covers the full football spectrum: individual brilliance, memorable collective performances, squad management tested to the limit.",
  "{total_rounds} rounds, {total_matches} games, {total_goals} goals on the count: Season {n} closed with an expressive total, average of {avg_goals} goals per match, and clear protagonists in every zone of the table. A campaign mixing favoritism with surprises — clubs consolidating positive moments and others watching entire game plans collapse in negative streaks. Open league, contested, leaving plenty of conversation for the upcoming preseason.",
  "At the end of Season {n}, the numbers speak for themselves: {total_matches} matches, {total_rounds} rounds, {total_goals} goals, average {avg_goals} per game. But numbers don't tell everything — above, below, and in the middle of the table there's a series of individual and collective stories that will produce months of preseason talk. A league that valued consistency, punished inconsistency, and gave little room for important strategic mistakes.",
  "League Season {n} closes after {total_rounds} rounds and {total_matches} games. {total_goals} goals scored throughout the campaign, average of {avg_goals} per match — expressive numbers justifying the championship's popularity and the fans' engagement throughout the months. Each zone of the table had its own narrative, and the overall set faithfully reflects what happened on the pitch.",
  "Season {n} goes into the books with a tally of {total_goals} goals across {total_matches} games, average of {avg_goals} per match — numbers confirming the offensive vitality of a young, contested league. The {total_rounds} rounds had moments of everything: routs, comebacks, locked-up matches, set-piece deciders, refereeing controversies. Everything that makes regular-championship football, in generous doses for every kind of fan.",
  "Season {n} is over: {total_matches} confrontations, {total_rounds} rounds, {total_goals} goals. Average of {avg_goals} per game. A campaign of high contrasts — clubs that dominated start to finish, others living dramatic ups and downs, and some that fell behind early and never recovered. What unites them all is the feeling that every point mattered, and that the final table faithfully reflects consistency over the months.",
  "Season {n} reached the final whistle: {total_matches} matches in {total_rounds} rounds, {total_goals} goals (avg {avg_goals}/game), and an entire range of stories to tell. A championship that ended with clear protagonists in every table zone — established champion, confirmed runner-up, top-4 fights stretched to the final rounds, dramatic decisions in the relegation zone. The whole season fits in this chronicle and the stats that follow.",
];

// ── EN §2 ──
const PAR2_EN: string[] = [
  "{champion} lifted the trophy with {champion_points} points across {total_rounds} rounds — {champion_wins} wins, {champion_draws} draws, and only {champion_losses} losses. Expressive positive goal difference ({champion_goals_for} for, {champion_goals_against} against), a ratio that fully justifies the top-of-table position. A {champion_lead}-point lead over {runner_up} confirms it wasn't luck — it was a season of technical and mental superiority from start to finish.",
  "League Champion, {champion} closed the season with {champion_points} points, {champion_wins} wins and {champion_losses} losses in {total_rounds} games. {champion_goals_for} goals for, {champion_goals_against} against: productive attack, solid defense, enviable squad management. Title won with a {champion_lead}-point lead over runner-up {runner_up} — a difference reflecting the consistency of the campaign from start to finish.",
  "No doubt at the top of the table: {champion} ended the season with {champion_points} points, {champion_wins} wins, {champion_draws} draws and {champion_losses} losses. {champion_goals_for} goals scored, {champion_goals_against} conceded. A {champion_lead}-point lead over {runner_up} shows the champion's clear dominance over the chasers. League won on merit, with technical quality and tactical organization above the competition.",
  "{champion} was the team that best used the calendar to its favor: {champion_points} points, {champion_wins} wins against just {champion_losses} losses in {total_rounds} games. {champion_goals_for}-{champion_goals_against} goal balance, {champion_lead} points ahead of {runner_up} at the end. Title won with exemplary consistency — few teams in recent League history have managed such consistent performance in a single season.",
  "Solid trajectory from champion {champion}: {champion_wins} wins, {champion_draws} draws, {champion_losses} losses in {total_rounds} rounds, totaling {champion_points} points. Attack with {champion_goals_for} goals, defense conceding only {champion_goals_against}. {champion_lead} points clear of {runner_up} — a margin built through scoring against smaller sides and results in direct showdowns against the chasers. Title legitimized on every front.",
  "{champion} opens the gallery of League {n} champions with expressive numbers: {champion_points} points, {champion_wins} wins, {champion_goals_for}-{champion_goals_against} balance. {champion_losses} total losses — a tiny number for a {total_rounds}-round season. A {champion_lead}-point lead over {runner_up} ratifies the title as a merit-based achievement, fruit of a coordinated squad, refined technique, and competent calendar management.",
  "Clear reign: {champion} ended League {n} with {champion_points} points, {champion_wins} wins and {champion_losses} losses in {total_rounds} games. {champion_goals_for} goals scored, {champion_goals_against} conceded. Positive balance of {goal_diff} goals. {champion_lead} points ahead of {runner_up} confirms a solid start-to-finish campaign. The League belongs to {champion}, and the result hardly surprised anyone who followed the season closely.",
  "No room for doubt: {champion} is the Season {n} champion. {champion_points} points, {champion_wins} wins and only {champion_losses} losses in {total_rounds} rounds. Attack with {champion_goals_for} goals for, defense conceding only {champion_goals_against}. {champion_lead}-point lead over {runner_up}. It wasn't an easy season — every title demands fight every round — but the champion's consistency made the difference in the end.",
  "League won with class by {champion}: {champion_points} points, {champion_wins} wins, {champion_draws} draws, {champion_losses} losses in {total_rounds} rounds. Expressive goal balance ({champion_goals_for}-{champion_goals_against}). {champion_lead}-point lead over {runner_up} at the end of the campaign. Most-deserved title, fruit of an entire season of technical and tactical consistency that few clubs could match.",
  "{champion} lifted the League {n} trophy with the authority of someone who gave the chasers no chance. {champion_points} points, {champion_wins} wins, {champion_losses} losses. Goal balance {champion_goals_for}-{champion_goals_against}. {champion_lead} points ahead of {runner_up} at the season's final whistle. A title crowning an exemplary campaign and opening the conversation about back-to-back titles for the start of next season.",
];

// ── EN §3 ──
const PAR3_EN: string[] = [
  "In individual highlights, {top_scorer} was the top scorer with {top_scorer_goals} goals for {top_scorer_club}{mvp_clause}{golden_glove_clause}{hat_trick_clause}. Awards recognizing consistent individual trajectories across the {total_rounds} rounds, deserving highlight in the League's awards calendar.",
  "Season {n} individual awards: {top_scorer} took the golden boot with {top_scorer_goals} goals for {top_scorer_club}{mvp_clause}{golden_glove_clause}{top_assists_clause}. Fair recognitions for athletes who were at top level throughout the entire campaign and stood out in specific league categories.",
  "{top_scorer} ended the season as League top scorer, with {top_scorer_goals} goals scored for {top_scorer_club}{mvp_clause}{hat_trick_clause}. Each individual award carries the weight of months of consistency — numbers built round after round, justifying the recognition of scouts, press, and fans who followed closely.",
  "Season {n}'s best have proper names: {top_scorer} was the top scorer with {top_scorer_goals} goals for {top_scorer_club}{mvp_clause}{golden_glove_clause}{top_assists_clause}{top_tackles_clause}. Awards distributed on merit, reflecting performance collected across the {total_rounds} rounds — there's no room for chance when talking about accumulated numbers across an entire season.",
  "Chapter of individual brilliance: {top_scorer} was the top scorer with {top_scorer_goals} goals ({top_scorer_club}){mvp_clause}{hat_trick_clause}{golden_glove_clause}. These are numbers that became conversations, debates, central pieces in end-of-season pieces — keeping the memory of athletes who starred in League {n} on the individual axis.",
  "Season {n} recognitions: {top_scorer} from {top_scorer_club} was the top goalscorer with {top_scorer_goals} goals{mvp_clause}{golden_glove_clause}{top_assists_clause}. Each of these awards crowns an entire season of dedication, quality, and consistency — attributes separating memorable athletes from the merely regular over a long, contested campaign.",
  "In individual prizes, {top_scorer} led the goalscoring with {top_scorer_goals} goals for {top_scorer_club}{mvp_clause}{hat_trick_clause}{top_assists_clause}. Athletes at peak form during the season seeing their numbers translate into awards at the end — deserved recognition for consistent work delivered every round.",
  "Individual brilliance: {top_scorer}, from {top_scorer_club}, finished as top scorer with {top_scorer_goals} goals{mvp_clause}{golden_glove_clause}{hat_trick_clause}. Each award has its own weight — top scorer shows finishing, MVP shows collective impact, golden glove shows defensive solidity, top assists shows creation. A set of prizes that faithfully portrays who was at top level throughout the season.",
  "Athletes who made Season {n} count: {top_scorer} was the offensive reference with {top_scorer_goals} goals for {top_scorer_club}{mvp_clause}{top_assists_clause}{golden_glove_clause}. Names leaving the season with the credentials of those who delivered at top level every round, sustaining their teams and showing up in pundit headlines week after week.",
  "Individual award winners: {top_scorer} took the golden boot for the {top_scorer_goals} goals wearing the {top_scorer_club} shirt{mvp_clause}{hat_trick_clause}{golden_glove_clause}{top_tackles_clause}. Each built their award through consistency across the {total_rounds} rounds — there's no shortcut to make the cut in a long, contested season like this one was.",
];

// ── EN §4 ──
const PAR4_EN: string[] = [
  "On the other hand, {relegated_clubs} dropped to next season and face reconstruction in the coming months. The finish line opens the next season with open questions: back-to-back titles for {champion}, or plot twist? Reaction from the relegated, or path open for new protagonists? The next League starts soon with narrative ready to be written.",
  "In the relegation zone, {relegated_clubs} ended the season at the bottom and will need to rethink project, squad, and direction for the next League. For the other clubs, the upcoming season brings its own challenges — who'll wrestle the back-to-back trophy? Who'll compete for continental slots? Who comes in with a real chance to surprise after a well-worked preseason?",
  "{relegated_clubs} were relegated at the end of Season {n} and open the next League living a reconstruction. For the rest, expectation around a championship promising intensity from the first round — defending the title, fighting for slots, escaping relegation, emerging as new protagonist. Every club has its own questions, and the next League starts soon with all of it in play.",
  "Relegation confirmed for {relegated_clubs}, who end the season in the danger zone and face heavy reconstruction. For League {n_next}, expectations around who'll face {champion} in the next cycle — back-to-back in sight, or new era of uncertainty? Possible paths, open narratives, and a short calendar to the first round of the upcoming season.",
  "{relegated_clubs} fell at the end of Season {n} and face the challenge of rebuilding squads and projects to dispute the lower division next round. At the top of the table, the question remains: can {champion} repeat? Will runner-up {runner_up} react strongly? Will some midtable club emerge as new protagonist? League {n_next} is already taking shape with its own narratives.",
  "Scenario for next season: {relegated_clubs} say goodbye to the elite after a difficult campaign, and the 16 who stay open a new cycle. {champion} enters as favorite to defend the title, {runner_up} as the main threat, and the midtable clubs come in with discussions about evolution, planning, ambition. Next League starts soon, with all the unfinished stories from Season {n} asking for continuation.",
  "Bitter end for {relegated_clubs}, who drop to the next season after a difficult campaign on every front. Above, in the middle, and at the top of the table, all clubs leave with their own questions to answer at the start of the next cycle. Back-to-back for {champion}? A new surprise? The finish line of Season {n} already opens looks toward what comes next.",
  "Relegated in Season {n}: {relegated_clubs}. For the next League, all clubs restart work — defending title, climbing tier, avoiding another fall. Open scenarios, short calendar, and all the stories of Season {n} fading into the past as a new campaign approaches. The League's saga continues, round after round.",
  "{relegated_clubs} were the clubs ending in the relegation zone and dropping for next season. For the 16 who remain, the challenge of the next chapter — repeating achievements for some, climbing position for many, escaping relegation for others. The next League is already taking shape with the tradition of Season {n} weighing as baggage and reference.",
  "{relegated_clubs} close Season {n} in the relegation zone and open the next campaign in a different division. For those who stay, narrative ready to continue — back-to-back at stake for {champion}, revenge in play for {runner_up}, internal fights for continental slots and against relegation. The League continues alive, building toward the next chapter.",
];

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function fillTemplate(template: string, vars: Record<string, string | number | null>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v == null ? '' : String(v));
  }
  return out.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function buildVars(f: SeasonRecapFacts, lang: 'pt' | 'en'): Record<string, string | number | null> {
  const goalDiff = f.championGoalsFor - f.championGoalsAgainst;
  const mvpClause = f.mvpName
    ? (lang === 'en' ? `, MVP for ${f.mvpName} (${f.mvpClub ?? ''})` : `, MVP pra ${f.mvpName} (${f.mvpClub ?? ''})`)
    : '';
  const goldenGloveClause = f.goldenGloveName
    ? (lang === 'en'
        ? `, Golden Glove to ${f.goldenGloveName} (${f.goldenGloveClub ?? ''}, ${f.goldenGloveCleanSheets} clean sheets)`
        : `, Golden Glove pra ${f.goldenGloveName} (${f.goldenGloveClub ?? ''}, ${f.goldenGloveCleanSheets} clean sheets)`)
    : '';
  const topAssistsClause = f.topAssistsName
    ? (lang === 'en'
        ? `, top assists ${f.topAssistsName} with ${f.topAssistsValue} (${f.topAssistsClub ?? ''})`
        : `, líder de assistências ${f.topAssistsName} com ${f.topAssistsValue} pelo ${f.topAssistsClub ?? ''}`)
    : '';
  const topTacklesClause = f.topTacklesName
    ? (lang === 'en'
        ? `, top tackles ${f.topTacklesName} with ${f.topTacklesValue}`
        : `, líder de desarmes ${f.topTacklesName} com ${f.topTacklesValue}`)
    : '';
  const hatTrickClause = f.hatTrickPlayers.length > 0
    ? (lang === 'en'
        ? `, with ${f.hatTrickPlayers.length} hat-trick(s) recorded across the season`
        : `, com ${f.hatTrickPlayers.length} hat-trick(s) registrados na temporada`)
    : '';
  const relegated = f.relegatedClubs.join(', ') || (lang === 'en' ? 'no clubs' : 'nenhum clube');

  return {
    n: f.seasonNumber,
    n_next: f.seasonNumber + 1,
    total_matches: f.totalMatches,
    total_rounds: f.totalRounds,
    total_goals: f.totalGoals,
    avg_goals: f.averageGoals.toFixed(1).replace('.', lang === 'en' ? '.' : ','),
    champion: f.championClubName ?? '',
    champion_points: f.championPoints,
    champion_wins: f.championWins,
    champion_draws: f.championDraws,
    champion_losses: f.championLosses,
    champion_goals_for: f.championGoalsFor,
    champion_goals_against: f.championGoalsAgainst,
    champion_lead: f.championLeadOverSecond,
    goal_diff: goalDiff,
    runner_up: f.runnerUpClubName ?? '',
    runner_up_points: f.runnerUpPoints,
    third: f.thirdClubName ?? '',
    relegated_clubs: relegated,
    top_scorer: f.topScorerName ?? '',
    top_scorer_goals: f.topScorerGoals,
    top_scorer_club: f.topScorerClub ?? '',
    mvp_clause: mvpClause,
    golden_glove_clause: goldenGloveClause,
    top_assists_clause: topAssistsClause,
    top_tackles_clause: topTacklesClause,
    hat_trick_clause: hatTrickClause,
  };
}

export function assembleSeasonRecap(facts: SeasonRecapFacts, lang: 'pt' | 'en'): string {
  const par1 = pickRandom(lang === 'en' ? PAR1_EN : PAR1_PT);
  const par2 = pickRandom(lang === 'en' ? PAR2_EN : PAR2_PT);
  const par3 = pickRandom(lang === 'en' ? PAR3_EN : PAR3_PT);
  const par4 = pickRandom(lang === 'en' ? PAR4_EN : PAR4_PT);

  const vars = buildVars(facts, lang);
  return [
    fillTemplate(par1, vars),
    fillTemplate(par2, vars),
    fillTemplate(par3, vars),
    fillTemplate(par4, vars),
  ].join('\n\n');
}

// ── Fact extraction ──
async function extractFacts(supabase: SupabaseClient, seasonId: string): Promise<SeasonRecapFacts | null> {
  const { data: season } = await supabase
    .from('league_seasons')
    .select('id, season_number, status')
    .eq('id', seasonId)
    .maybeSingle();
  if (!season) return null;

  // Standings (already populated)
  const { data: standingsRaw } = await supabase
    .from('league_standings')
    .select('club_id, points, played, won, drawn, lost, goals_for, goals_against')
    .eq('season_id', seasonId);

  // All league_matches in this season
  const { data: rounds } = await supabase
    .from('league_rounds')
    .select('id, round_number')
    .eq('season_id', seasonId);
  const roundIds = (rounds ?? []).map((r: any) => r.id);
  const roundNumberById = new Map<string, number>();
  for (const r of rounds ?? []) roundNumberById.set(r.id, r.round_number);

  const { data: leagueMatches } = roundIds.length > 0
    ? await supabase.from('league_matches').select('match_id, round_id, home_club_id, away_club_id').in('round_id', roundIds)
    : { data: [] as any[] };

  const matchIds = (leagueMatches ?? []).map((lm: any) => lm.match_id).filter(Boolean);
  const { data: matches } = matchIds.length > 0
    ? await supabase.from('matches').select('id, home_score, away_score, home_club_id, away_club_id').in('id', matchIds)
    : { data: [] as any[] };

  // Resolve all club names (standings + matches)
  const clubIds = new Set<string>();
  for (const s of standingsRaw ?? []) clubIds.add(s.club_id);
  for (const lm of leagueMatches ?? []) { clubIds.add(lm.home_club_id); clubIds.add(lm.away_club_id); }
  const { data: clubs } = clubIds.size > 0
    ? await supabase.from('clubs').select('id, name').in('id', Array.from(clubIds))
    : { data: [] as any[] };
  const clubName = new Map<string, string>();
  for (const c of clubs ?? []) clubName.set(c.id, c.name);

  // Sorted standings
  const sorted = [...(standingsRaw ?? [])].sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goals_for - a.goals_against;
    const gdB = b.goals_for - b.goals_against;
    if (gdB !== gdA) return gdB - gdA;
    return b.goals_for - a.goals_for;
  });

  const numClubs = sorted.length;
  const standings = sorted.map((s: any) => ({
    clubId: s.club_id,
    name: clubName.get(s.club_id) ?? '',
    points: s.points,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    goalsFor: s.goals_for,
    goalsAgainst: s.goals_against,
  }));

  const champion = standings[0] ?? null;
  const runnerUp = standings[1] ?? null;
  const third = standings[2] ?? null;
  const relegatedSlice = numClubs >= 8 ? standings.slice(numClubs - 4) : [];

  // Match aggregates
  let totalGoals = 0;
  let biggestWin: SeasonRecapFacts['biggestWin'] = null;
  let biggestWinDiff = -1;
  let highestScoring: SeasonRecapFacts['highestScoringMatch'] = null;
  let highestSum = -1;
  for (const m of matches ?? []) {
    const sum = (m.home_score ?? 0) + (m.away_score ?? 0);
    const diff = Math.abs((m.home_score ?? 0) - (m.away_score ?? 0));
    totalGoals += sum;
    if (diff > biggestWinDiff) {
      biggestWinDiff = diff;
      const lm = (leagueMatches ?? []).find((x: any) => x.match_id === m.id);
      biggestWin = {
        home: clubName.get(m.home_club_id) ?? '',
        away: clubName.get(m.away_club_id) ?? '',
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
        round: lm ? (roundNumberById.get(lm.round_id) ?? 0) : 0,
      };
    }
    if (sum > highestSum) {
      highestSum = sum;
      const lm = (leagueMatches ?? []).find((x: any) => x.match_id === m.id);
      highestScoring = {
        home: clubName.get(m.home_club_id) ?? '',
        away: clubName.get(m.away_club_id) ?? '',
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
        round: lm ? (roundNumberById.get(lm.round_id) ?? 0) : 0,
      };
    }
  }
  const totalMatches = (matches ?? []).length;
  const averageGoals = totalMatches > 0 ? totalGoals / totalMatches : 0;

  // Awards table
  const { data: awards } = await supabase
    .from('player_awards')
    .select('award_type, player_profile_id, club_id, vote_count, metric_value')
    .eq('scope_entity_id', seasonId);

  const awardByType = new Map<string, any>();
  for (const a of awards ?? []) awardByType.set(a.award_type, a);

  const awardPlayerIds = (awards ?? []).map((a: any) => a.player_profile_id).filter(Boolean);
  const { data: awardProfiles } = awardPlayerIds.length > 0
    ? await supabase.from('player_profiles').select('id, full_name').in('id', awardPlayerIds)
    : { data: [] as any[] };
  const profileName = new Map<string, string>();
  for (const p of awardProfiles ?? []) profileName.set(p.id, p.full_name);

  const getAward = (type: string) => {
    const a = awardByType.get(type);
    if (!a) return { name: null, club: null, value: 0 };
    return {
      name: profileName.get(a.player_profile_id) ?? null,
      club: clubName.get(a.club_id) ?? null,
      value: Number(a.metric_value ?? a.vote_count ?? 0),
    };
  };

  const ts = getAward('season_top_scorer');
  const ta = getAward('season_top_assists');
  const gg = getAward('season_golden_glove');
  const tt = getAward('season_top_tackles');
  const fp = getAward('season_fair_play');
  const mvp = getAward('season_mvp');

  // Hat-trick scorers (from per-player season stats: any player with a match where goals >= 3)
  const { data: hatStats } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, club_id, goals, match_id')
    .eq('season_id', seasonId)
    .gte('goals', 3);
  const hatTrickPlayers: SeasonRecapFacts['hatTrickPlayers'] = [];
  if (hatStats && hatStats.length > 0) {
    const hatPlayerIds = Array.from(new Set(hatStats.map((s: any) => s.player_profile_id)));
    const { data: hatProfiles } = await supabase
      .from('player_profiles')
      .select('id, full_name')
      .in('id', hatPlayerIds);
    const hatNameById = new Map<string, string>();
    for (const p of hatProfiles ?? []) hatNameById.set(p.id, p.full_name);
    for (const s of hatStats) {
      const lm = (leagueMatches ?? []).find((x: any) => x.match_id === s.match_id);
      hatTrickPlayers.push({
        name: hatNameById.get(s.player_profile_id) ?? '',
        club: clubName.get(s.club_id) ?? '',
        goals: s.goals,
        round: lm ? (roundNumberById.get(lm.round_id) ?? 0) : 0,
      });
    }
  }

  // Best attack / best defense
  let bestAttack: SeasonRecapFacts['bestAttackClub'] = null;
  let bestDefense: SeasonRecapFacts['bestDefenseClub'] = null;
  let mostGoals = -1;
  let leastConceded = Infinity;
  for (const s of standings) {
    if (s.goalsFor > mostGoals) { mostGoals = s.goalsFor; bestAttack = { name: s.name, goals: s.goalsFor }; }
    if (s.goalsAgainst < leastConceded) { leastConceded = s.goalsAgainst; bestDefense = { name: s.name, conceded: s.goalsAgainst }; }
  }

  // Cards: aggregate from player_match_stats
  const { data: cardStats } = await supabase
    .from('player_match_stats')
    .select('yellow_cards, red_cards')
    .eq('season_id', seasonId);
  let totalYellow = 0;
  let totalRed = 0;
  for (const s of cardStats ?? []) {
    totalYellow += s.yellow_cards ?? 0;
    totalRed += s.red_cards ?? 0;
  }

  // Top moments — pull match recap rows for matches in this season
  const { data: matchRecaps } = matchIds.length > 0
    ? await supabase
        .from('narratives')
        .select('entity_id, body_pt, body_en, facts_json')
        .eq('entity_type', 'match')
        .eq('scope', 'match_recap')
        .in('entity_id', matchIds)
    : { data: [] as any[] };

  // Pick one representative per dramatic bucket (priority order)
  const moments: TopMoment[] = [];
  const wantedBuckets: TopMoment['type'][] = ['rout', 'comeback', 'late_winner', 'jogao', 'red_card_decided', 'penalty_decided'];
  const usedMatches = new Set<string>();
  for (const bucket of wantedBuckets) {
    if (moments.length >= 5) break;
    const candidate = (matchRecaps ?? []).find((r: any) => {
      if (usedMatches.has(r.entity_id)) return false;
      const fj = r.facts_json as any;
      return fj?.bucket === bucket;
    });
    if (candidate) {
      const fj = candidate.facts_json as any;
      const lm = (leagueMatches ?? []).find((x: any) => x.match_id === candidate.entity_id);
      moments.push({
        roundNumber: lm ? (roundNumberById.get(lm.round_id) ?? 0) : 0,
        type: bucket,
        homeName: fj.homeName ?? '',
        awayName: fj.awayName ?? '',
        homeGoals: fj.homeGoals ?? 0,
        awayGoals: fj.awayGoals ?? 0,
        matchId: candidate.entity_id,
        body_pt: candidate.body_pt,
        body_en: candidate.body_en,
      });
      usedMatches.add(candidate.entity_id);
    }
  }

  // Team of the Season — top rating per position, min 3 matches
  const { data: tosStats } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, club_id, position, rating')
    .eq('season_id', seasonId);
  const byPlayer = new Map<string, { ratings: number[]; matches: number; club_id: string; position: string }>();
  for (const s of tosStats ?? []) {
    if (!s.player_profile_id || s.rating == null) continue;
    const cur = byPlayer.get(s.player_profile_id) ?? { ratings: [], matches: 0, club_id: s.club_id, position: s.position ?? '' };
    cur.ratings.push(Number(s.rating));
    cur.matches += 1;
    byPlayer.set(s.player_profile_id, cur);
  }
  const playerAverages: { id: string; avg: number; matches: number; clubId: string; position: string }[] = [];
  for (const [id, info] of byPlayer) {
    if (info.matches < 3) continue;
    const avg = info.ratings.reduce((a, b) => a + b, 0) / info.ratings.length;
    playerAverages.push({ id, avg, matches: info.matches, clubId: info.club_id, position: info.position });
  }
  // Resolve names
  const tosIds = playerAverages.map(p => p.id);
  const { data: tosProfiles } = tosIds.length > 0
    ? await supabase.from('player_profiles').select('id, full_name, primary_position').in('id', tosIds)
    : { data: [] as any[] };
  const tosNameById = new Map<string, string>();
  const tosPosById = new Map<string, string>();
  for (const p of tosProfiles ?? []) {
    tosNameById.set(p.id, p.full_name);
    tosPosById.set(p.id, p.primary_position);
  }

  // Build XI: 1 GK + 4 defenders + 3 midfielders + 3 attackers
  const groupOf = (pos: string): 'GK' | 'DEF' | 'MID' | 'ATT' | 'OTHER' => {
    const p = (pos ?? '').toUpperCase();
    if (p === 'GK') return 'GK';
    if (['CB', 'LB', 'RB'].includes(p)) return 'DEF';
    if (['CDM', 'DM', 'CM', 'CAM', 'LM', 'RM'].includes(p)) return 'MID';
    if (['LW', 'RW', 'ST', 'CF'].includes(p)) return 'ATT';
    return 'OTHER';
  };
  const slots = { GK: 1, DEF: 4, MID: 3, ATT: 3 };
  const taken = new Set<string>();
  const xi: TeamOfSeasonSlot[] = [];
  // Greedy: highest avg goes first, slot fits if group still has room
  playerAverages.sort((a, b) => b.avg - a.avg);
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of playerAverages) {
    const profilePos = tosPosById.get(p.id) ?? p.position;
    const grp = groupOf(profilePos);
    if (grp === 'OTHER') continue;
    if (counts[grp] >= (slots as any)[grp]) continue;
    if (taken.has(p.id)) continue;
    xi.push({
      position: profilePos,
      playerName: tosNameById.get(p.id) ?? '',
      clubName: clubName.get(p.clubId) ?? '',
      rating: Number(p.avg.toFixed(2)),
      matches: p.matches,
    });
    taken.add(p.id);
    counts[grp] += 1;
    if (xi.length >= 11) break;
  }

  return {
    seasonNumber: season.season_number ?? 1,
    numClubs,
    totalMatches,
    totalRounds: (rounds ?? []).length,
    totalGoals,
    averageGoals,
    championClubName: champion?.name ?? null,
    championPoints: champion?.points ?? 0,
    championWins: champion?.won ?? 0,
    championDraws: champion?.drawn ?? 0,
    championLosses: champion?.lost ?? 0,
    championGoalsFor: champion?.goalsFor ?? 0,
    championGoalsAgainst: champion?.goalsAgainst ?? 0,
    championLeadOverSecond: (champion?.points ?? 0) - (runnerUp?.points ?? 0),
    runnerUpClubName: runnerUp?.name ?? null,
    runnerUpPoints: runnerUp?.points ?? 0,
    thirdClubName: third?.name ?? null,
    thirdPoints: third?.points ?? 0,
    relegatedClubs: relegatedSlice.map(s => s.name),
    standings,
    topScorerName: ts.name,
    topScorerGoals: ts.value,
    topScorerClub: ts.club,
    topAssistsName: ta.name,
    topAssistsValue: ta.value,
    topAssistsClub: ta.club,
    goldenGloveName: gg.name,
    goldenGloveCleanSheets: gg.value,
    goldenGloveClub: gg.club,
    topTacklesName: tt.name,
    topTacklesValue: tt.value,
    topTacklesClub: tt.club,
    fairPlayClubName: fp.name ? clubName.get(fp.club ?? '') ?? fp.club : null,
    mvpName: mvp.name,
    mvpClub: mvp.club,
    hatTrickPlayers,
    biggestWin,
    highestScoringMatch: highestScoring,
    bestAttackClub: bestAttack,
    bestDefenseClub: bestDefense,
    totalRedCards: totalRed,
    totalYellowCards: totalYellow,
    topMoments: moments,
    teamOfTheSeason: xi,
  };
}

export async function generateAndPersistSeasonRecap(supabase: SupabaseClient, seasonId: string): Promise<void> {
  try {
    const facts = await extractFacts(supabase, seasonId);
    if (!facts) return;

    const body_pt = assembleSeasonRecap(facts, 'pt');
    const body_en = assembleSeasonRecap(facts, 'en');

    await supabase.from('narratives').insert({
      entity_type: 'league_season',
      entity_id: seasonId,
      scope: 'season_recap',
      season: facts.seasonNumber,
      body_pt,
      body_en,
      facts_json: facts,
    });
  } catch (err) {
    console.error('[season_recap] generation failed:', err);
  }
}
