// Player Milestones narrative system (Deno).
//
// Detects threshold-crossings on player career stats (first goal, 50 goals,
// first hat-trick, etc.) at the end of each match, and end-of-season
// awards (top scorer, champion, runner-up, relegation) when a league
// season closes. Each milestone is persisted as one row in the
// narratives table with entity_type='player', scope='milestone', and
// milestone_type set to the canonical bucket key — partial UNIQUE index
// (entity_type, entity_id, milestone_type) prevents duplicates.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any>>;

export type MilestoneType =
  // Goals
  | 'first_goal' | 'goals_10' | 'goals_25' | 'goals_50' | 'goals_100' | 'goals_200'
  | 'first_hat_trick' | 'first_poker' | 'first_handful'
  | 'season_5_goals' | 'season_10_goals' | 'season_20_goals' | 'season_30_goals'
  | 'season_top_scorer'
  // Assists
  | 'first_assist' | 'assists_25' | 'assists_50' | 'assists_100'
  | 'season_10_assists' | 'season_20_assists'
  // GK
  | 'first_clean_sheet' | 'clean_sheets_10' | 'clean_sheets_25' | 'clean_sheets_50' | 'clean_sheets_100'
  | 'first_penalty_save'
  // Defense
  | 'tackles_50' | 'tackles_100' | 'tackles_250'
  // Career
  | 'first_match' | 'matches_10' | 'matches_50' | 'matches_100' | 'matches_200' | 'matches_300'
  | 'first_match_new_club'
  | 'birthday_20' | 'birthday_25' | 'birthday_30'
  // Cards
  | 'first_red_card' | 'yellows_100'
  // Titles & history
  | 'first_title' | 'second_title' | 'third_title'
  | 'first_runner_up' | 'first_relegation'
  // Future (templates ready, detectors not wired yet)
  | 'first_derby_goal' | 'national_team_callup' | 'national_team_debut';

interface TemplateSet { pt: string; en: string; }

const T: Record<MilestoneType, TemplateSet> = {
  first_goal: {
    pt: "Primeiro gol da carreira de {player_name}: marcou hoje contra {opponent_name} numa partida que ficará pra sempre na história pessoal do jogador. Pra qualquer atacante, é o gol que abre as portas — depois dele, vem todo o resto.",
    en: "First career goal for {player_name}: scored today against {opponent_name} in a match that will stay forever in the player's personal history. For any striker, it's the goal that opens the doors — everything else follows.",
  },
  goals_10: {
    pt: "{player_name} chegou aos 10 gols na carreira profissional. Marca importante pra um atacante em construção, e o jogador mostra que tem capacidade de se firmar entre os goleadores do clube.",
    en: "{player_name} reached 10 career professional goals. An important mark for a developing striker, showing capacity to establish himself among the club's goalscorers.",
  },
  goals_25: {
    pt: "Passou dos 25 gols na carreira: {player_name} continua somando números importantes, gol após gol. Marca que coloca o atacante em rota de longevidade entre os finalizadores do clube.",
    en: "Past 25 career goals: {player_name} keeps adding important numbers, goal after goal. A mark that puts the striker on a longevity track among the club's finishers.",
  },
  goals_50: {
    pt: "Marca dos 50 gols alcançada: {player_name} entra para um clube seleto de finalizadores históricos do clube. Cada gol carrega uma história, e a coleção dele cresce semana a semana.",
    en: "50-goal mark reached: {player_name} enters a select club of historic finishers at the club. Every goal carries a story, and his collection grows week by week.",
  },
  goals_100: {
    pt: "Centenária: {player_name} chegou aos 100 gols na carreira profissional. Marca que coloca o atacante entre os maiores artilheiros da história recente, e que será lembrada por décadas pelos torcedores do clube.",
    en: "Centenary: {player_name} reached 100 career professional goals. A mark placing the striker among the greatest goalscorers of recent history, one that will be remembered by club fans for decades.",
  },
  goals_200: {
    pt: "Histórico: {player_name} chega à marca dos 200 gols na carreira profissional. Atinge patamar de jogador lendário, com nome cravado em qualquer relatório histórico do clube. Esses números só não impressionam quem nunca jogou bola.",
    en: "Historic: {player_name} reaches 200 career professional goals. Achieves legendary-player tier, name carved into any historical record of the club. These numbers only fail to impress those who've never played football.",
  },
  first_hat_trick: {
    pt: "Primeiro hat-trick da carreira: {player_name} marcou três gols na partida contra {opponent_name}. Atuação que entra direto pra galeria pessoal do jogador, e que sinaliza um atacante em forma máxima.",
    en: "First career hat-trick: {player_name} scored three goals in the match against {opponent_name}. A performance that goes straight into the player's personal gallery and signals a striker at peak form.",
  },
  first_poker: {
    pt: "Quatro gols num jogo só! {player_name} fez um poker contra {opponent_name} numa noite mágica que dificilmente se repete na carreira de qualquer atacante. Atuação histórica.",
    en: "Four goals in a single match! {player_name} scored a poker against {opponent_name} on a magical night that rarely repeats in any striker's career. A historic display.",
  },
  first_handful: {
    pt: "Cinco gols ou mais! {player_name} fez uma exibição quase impossível contra {opponent_name}, atingindo a mão cheia que poucos jogadores na história alcançaram. Noite pra contar pros netos.",
    en: "Five goals or more! {player_name} put on an almost impossible display against {opponent_name}, reaching the handful that few players in history have achieved. A night to tell the grandkids.",
  },
  season_5_goals: {
    pt: "{player_name} fez seu 5º gol na temporada — começa a se firmar entre os destaques ofensivos do campeonato e mostra regularidade nas finalizações.",
    en: "{player_name} scored his 5th goal of the season — starting to settle among the championship's offensive standouts, showing regularity in finishing.",
  },
  season_10_goals: {
    pt: "Marca dos 10 gols na temporada atingida por {player_name}. Atacante entra em cogitação pra prêmios da temporada e segue numa fase produtiva impressionante.",
    en: "10-goal season mark reached by {player_name}. The striker enters the conversation for season awards and continues in an impressive productive phase.",
  },
  season_20_goals: {
    pt: "{player_name} chega aos 20 gols na temporada — número que coloca o atacante na disputa pela chuteira de ouro do campeonato e firma seu lugar entre os melhores finalizadores do ano.",
    en: "{player_name} reaches 20 goals in the season — a number that puts the striker in the golden boot race and cements his place among the year's best finishers.",
  },
  season_30_goals: {
    pt: "30 gols na temporada! {player_name} entra para a história do campeonato com uma marca que poucos atingem: passar dos 30 gols numa só edição é feito de jogador absolutamente inspirado.",
    en: "30 goals in the season! {player_name} enters championship history with a mark few reach: surpassing 30 goals in a single edition is the feat of an absolutely inspired player.",
  },
  season_top_scorer: {
    pt: "Chuteira de ouro pra {player_name}! Terminou a temporada como artilheiro do campeonato com {goals_count} gols, premiação individual que coroa um ano de regularidade e talento. Nome cravado entre os destaques absolutos do ano.",
    en: "Golden boot for {player_name}! Finished the season as the championship's top scorer with {goals_count} goals, an individual prize that crowns a year of consistency and talent. Name carved among the year's absolute standouts.",
  },
  first_assist: {
    pt: "Primeira assistência da carreira de {player_name}: passe que rendeu o gol do companheiro contra {opponent_name}. Em jogos coletivos, o garçom é tão importante quanto o artilheiro, e o jogador inaugura a função.",
    en: "First career assist for {player_name}: pass that produced a teammate's goal against {opponent_name}. In a collective game, the playmaker is as important as the goalscorer, and the player opens that account.",
  },
  assists_25: {
    pt: "{player_name} passa das 25 assistências na carreira. Visão de jogo, qualidade no passe e leitura tática se traduzem em números — e os companheiros agradecem cada bola servida na hora certa.",
    en: "{player_name} passes 25 career assists. Game vision, passing quality, and tactical reading translate into numbers — and teammates appreciate every ball served at the right time.",
  },
  assists_50: {
    pt: "Meia centena de assistências na carreira! {player_name} chega à marca dos 50 passes pra gol e se firma como armador de referência do elenco. Habilidade que poucos têm e que faz toda a diferença em times competitivos.",
    en: "Half a century of assists! {player_name} reaches 50 career assists and establishes himself as a reference playmaker. A skill few possess and that makes all the difference in competitive teams.",
  },
  assists_100: {
    pt: "Cem assistências na carreira! {player_name} entra para um grupo seleto de meio-campistas que combinam visão privilegiada, qualidade técnica e generosidade tática. Marca que merece reconhecimento e que será lembrada por anos.",
    en: "100 career assists! {player_name} enters a select group of midfielders combining privileged vision, technical quality, and tactical generosity. A mark deserving recognition and one that will be remembered for years.",
  },
  season_10_assists: {
    pt: "{player_name} passa das 10 assistências na temporada — meio-campista em estado de graça, alimentando o ataque com qualidade rodada após rodada e brigando pelo título de melhor garçom do campeonato.",
    en: "{player_name} passes 10 assists for the season — a midfielder in state of grace, feeding the attack with quality round after round and fighting for the championship's best playmaker title.",
  },
  season_20_assists: {
    pt: "20 assistências numa temporada! {player_name} atinge marca rara, daquelas que só meio-campistas em forma absoluta conseguem. Performance que entra pra história individual do jogador e que merece destaque na coluna dos melhores da temporada.",
    en: "20 assists in a season! {player_name} reaches a rare mark, achievable only by midfielders in absolute form. A performance that goes into the player's individual history and deserves highlight among the season's best.",
  },
  first_clean_sheet: {
    pt: "Primeiro jogo sem sofrer gols na carreira de {player_name}! Goleiro inaugura a coleção de clean sheets contra {opponent_name}, e o time confirma que tem uma peça confiável entre as traves.",
    en: "First career clean sheet for {player_name}! The goalkeeper opens his clean-sheet collection against {opponent_name}, and the team confirms it has a reliable piece between the posts.",
  },
  clean_sheets_10: {
    pt: "{player_name} chega aos 10 jogos sem sofrer gols na carreira. Marca importante pra um goleiro em construção, e mostra regularidade defensiva que vai render confiança pros zagueiros.",
    en: "{player_name} reaches 10 career clean sheets. An important mark for a developing keeper, showing defensive consistency that will breed confidence among the centerbacks.",
  },
  clean_sheets_25: {
    pt: "25 clean sheets na carreira de {player_name}: o goleiro segue construindo sua reputação como peça defensiva fundamental do elenco, com regularidade entre as traves que poucos arqueiros mantêm.",
    en: "25 career clean sheets for {player_name}: the keeper continues building his reputation as a fundamental defensive piece of the squad, with between-the-posts consistency few keepers maintain.",
  },
  clean_sheets_50: {
    pt: "Meia centena de jogos sem tomar gol! {player_name} atinge marca expressiva na carreira e se firma entre os goleiros mais consistentes do campeonato. Trabalho silencioso que sustenta times inteiros.",
    en: "Half a century of clean sheets! {player_name} reaches an expressive career mark and settles among the championship's most consistent keepers. Silent work that holds entire teams together.",
  },
  clean_sheets_100: {
    pt: "Cem clean sheets na carreira: {player_name} entra para o panteão dos goleiros lendários do clube. Marca histórica que poucos atingem e que reflete uma carreira inteira de dedicação ao trabalho defensivo.",
    en: "100 career clean sheets: {player_name} enters the pantheon of the club's legendary keepers. A historic mark few reach, reflecting an entire career dedicated to defensive work.",
  },
  first_penalty_save: {
    pt: "Primeira defesa de pênalti na carreira de {player_name}! Goleiro vestiu a capa de herói contra {opponent_name} e segurou a cobrança decisiva. Momento que se aplaude de pé.",
    en: "First career penalty save for {player_name}! The keeper donned the hero's cape against {opponent_name} and stopped the decisive spot kick. A moment that earns a standing ovation.",
  },
  tackles_50: {
    pt: "{player_name} chega aos 50 desarmes na carreira. Trabalho silencioso da defesa que merece reconhecimento — cada bola interrompida no meio-campo é gol que o adversário não fez.",
    en: "{player_name} reaches 50 career tackles. Silent defensive work that deserves recognition — every ball intercepted in midfield is a goal the opponent didn't score.",
  },
  tackles_100: {
    pt: "Cem desarmes na carreira: {player_name} se firma como zagueiro de referência defensiva. Marca importante que reflete posicionamento, leitura de jogo e timing perfeito na entrada na bola.",
    en: "100 career tackles: {player_name} establishes himself as a reference defender. An important mark reflecting positioning, game reading, and perfect timing on the ball.",
  },
  tackles_250: {
    pt: "250 desarmes na carreira de {player_name}! Marca de jogador lendário no setor defensivo, daquelas que só atletas com longevidade e qualidade técnica acima da média conseguem. Pilar do sistema.",
    en: "250 career tackles for {player_name}! A legendary defensive-sector mark, achievable only by athletes with longevity and above-average technical quality. A system pillar.",
  },
  first_match: {
    pt: "Estreia profissional: {player_name} entrou em campo pelo profissional pela primeira vez na carreira contra {opponent_name}. Início oficial de uma trajetória que mal começou e que ainda pode produzir muita história.",
    en: "Professional debut: {player_name} entered the pitch professionally for the first time against {opponent_name}. Official start of a journey that's barely begun and may still produce much history.",
  },
  matches_10: {
    pt: "{player_name} chega aos 10 jogos na carreira profissional. Marca curta mas simbólica — primeiros passos consolidados, e o caminho pela frente segue se desenhando rodada após rodada.",
    en: "{player_name} reaches 10 career professional matches. A small but symbolic mark — first steps consolidated, and the path ahead keeps drawing itself round after round.",
  },
  matches_50: {
    pt: "50 jogos na carreira de {player_name}: número que sinaliza atleta consolidado no profissional, com vivência suficiente pra dar respostas táticas em qualquer situação que apareça em campo.",
    en: "50 career matches for {player_name}: a number signaling a consolidated professional athlete, with enough experience to give tactical answers in any situation that appears on the pitch.",
  },
  matches_100: {
    pt: "Cem jogos na carreira! {player_name} chega à centésima partida no profissional — marca que reflete consistência, qualidade física e capacidade de se manter em alto nível ao longo dos anos.",
    en: "100 career matches! {player_name} reaches the 100th professional match — a mark reflecting consistency, physical quality, and the ability to stay at high level over the years.",
  },
  matches_200: {
    pt: "200 partidas na carreira de {player_name}: marca expressiva de atleta veterano, com vivência de campeonatos inteiros e capacidade comprovada de manter regularidade no longo prazo.",
    en: "200 career matches for {player_name}: an expressive veteran-athlete mark, with experience of entire championships and proven ability to maintain consistency long-term.",
  },
  matches_300: {
    pt: "Histórico: {player_name} chega aos 300 jogos na carreira profissional! Marca de jogador lendário, daquelas que demandam uma vida inteira dedicada ao futebol e que merece os aplausos da torcida em qualquer estádio que pisar daqui em diante.",
    en: "Historic: {player_name} reaches 300 career professional matches! A legendary-player mark, the kind that demands a lifetime dedicated to football and earns crowd applause in any stadium he steps onto from now on.",
  },
  first_match_new_club: {
    pt: "Primeiro jogo de {player_name} pelo {new_club}: estreia oficial na nova camisa após a transferência. Cada novo capítulo da carreira começa assim — uniforme novo, desafios novos, oportunidade pra escrever uma história diferente.",
    en: "First match for {player_name} at {new_club}: official debut in the new shirt after the transfer. Every new chapter of a career begins this way — new uniform, new challenges, opportunity to write a different story.",
  },
  birthday_20: {
    pt: "{player_name} completa 20 anos hoje. Idade simbólica pra qualquer atleta — sai oficialmente da fase de moleque e entra no momento em que se espera consistência, evolução técnica e lugar firmado entre os titulares do elenco.",
    en: "{player_name} turns 20 today. A symbolic age for any athlete — officially leaves the kid phase and enters the moment when consistency, technical evolution, and a firm starting role are expected.",
  },
  birthday_25: {
    pt: "25 anos pra {player_name}. Fase considerada o auge físico de qualquer atleta, momento de consolidar carreira, somar conquistas e tirar o máximo da forma boa. Ano importante pra qualquer profissional.",
    en: "25 turns for {player_name}. Considered the physical peak phase for any athlete, a moment to consolidate career, add achievements, and extract maximum from peak form. An important year for any professional.",
  },
  birthday_30: {
    pt: "{player_name} completa 30 anos hoje. Marca em que muitos atletas alcançam maturidade técnica e tática que faltava nas fases anteriores. Idade dos veteranos respeitados, daqueles que viraram referência dentro e fora de campo.",
    en: "{player_name} turns 30 today. A mark when many athletes reach the technical and tactical maturity that was lacking in earlier phases. The age of respected veterans, those who became references on and off the pitch.",
  },
  first_red_card: {
    pt: "Primeiro cartão vermelho da carreira de {player_name}: lance polêmico contra {opponent_name} que terminou com o jogador deixando o campo antes do apito final. Aprendizado precoce, daqueles que jogador carrega pelo resto da carreira.",
    en: "First career red card for {player_name}: a controversial play against {opponent_name} that ended with the player leaving the pitch before the final whistle. An early lesson, the kind a player carries the rest of his career.",
  },
  yellows_100: {
    pt: "Cem cartões amarelos na carreira! {player_name} atinge marca controversa, daquelas que mostram entrega defensiva e raça, mas que também rendem suspensões em momentos importantes do calendário. Disciplina é aprendizado constante.",
    en: "100 career yellow cards! {player_name} reaches a controversial mark, showing defensive commitment and grit but also producing suspensions at important calendar moments. Discipline is constant learning.",
  },
  first_title: {
    pt: "Primeiro título da carreira de {player_name}! Campeão da Liga, conquista que marca pra sempre a trajetória profissional do jogador. Nada substitui a sensação de levantar uma taça pela primeira vez.",
    en: "First career title for {player_name}! League champion, an achievement that forever marks the player's professional trajectory. Nothing replaces the feeling of lifting a trophy for the first time.",
  },
  second_title: {
    pt: "Bicampeão! {player_name} levanta seu segundo título de campeão, confirmando que a primeira conquista não foi acaso. Jogador de momentos decisivos, vencedor confirmado, nome que entra na conversa dos atletas mais bem-sucedidos da geração.",
    en: "Two-time champion! {player_name} lifts his second title, confirming the first wasn't luck. A player of decisive moments, a confirmed winner, name entering the conversation of his generation's most successful athletes.",
  },
  third_title: {
    pt: "Tricampeão! {player_name} alcança a marca de três títulos na carreira, feito de jogador absolutamente vencedor que entra pra história do clube e do campeonato. Conquista que justifica todo o esforço de uma carreira dedicada.",
    en: "Three-time champion! {player_name} reaches the three-title career mark, the feat of an absolutely winning player entering club and championship history. An achievement that justifies an entire career's dedicated effort.",
  },
  first_runner_up: {
    pt: "Vice-campeão: {player_name} terminou a temporada como segundo colocado da Liga. Resultado amargo de quem brigou até o fim mas viu o título escapar nos detalhes — combustível pra próxima temporada.",
    en: "Runner-up: {player_name} ended the season as second place in the League. A bitter result for someone who fought until the end but saw the title slip away on details — fuel for next season.",
  },
  first_relegation: {
    pt: "Capítulo difícil na carreira: {player_name} foi rebaixado com seu clube ao fim da temporada. Momento duro mas formativo, daqueles que separam profissionais que voltam dos que desistem. Reconstrução começa agora.",
    en: "Tough chapter in the career: {player_name} was relegated with his club at the end of the season. A hard but formative moment, the kind that separates professionals who return from those who give up. Reconstruction begins now.",
  },
  first_derby_goal: {
    pt: "Gol em clássico! {player_name} marcou seu primeiro gol num confronto entre rivais históricos contra {opponent_name}. Daqueles momentos que jogador guarda pra sempre — clássico tem nome próprio na história.",
    en: "Derby goal! {player_name} scored his first goal in a confrontation between historic rivals against {opponent_name}. The kind of moment a player keeps forever — a derby has its own name in history.",
  },
  national_team_callup: {
    pt: "Convocação histórica! {player_name} foi convocado pela primeira vez pra defender a Seleção. Reconhecimento máximo pra qualquer atleta — a camisa amarela representa milhões de pessoas.",
    en: "Historic call-up! {player_name} was called up to defend the National Team for the first time. The maximum recognition for any athlete — the national jersey represents millions.",
  },
  national_team_debut: {
    pt: "Estreia pela Seleção! {player_name} entrou em campo pela primeira vez vestindo a camisa nacional. Sonho realizado de jogador que carrega a esperança de toda uma nação no peito.",
    en: "National team debut! {player_name} entered the pitch for the first time wearing the national jersey. A dream realized for a player carrying the hope of an entire nation.",
  },
};

function fillTemplate(t: string, vars: Record<string, string | number | null>): string {
  let out = t;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v == null ? '' : String(v));
  }
  return out.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

interface MilestoneTrigger {
  type: MilestoneType;
  vars: Record<string, string | number | null>;
}

function buildBodies(t: MilestoneTrigger): { body_pt: string; body_en: string } {
  const tpl = T[t.type];
  return {
    body_pt: fillTemplate(tpl.pt, t.vars),
    body_en: fillTemplate(tpl.en, t.vars),
  };
}

async function persistMilestone(
  supabase: SupabaseClient,
  playerProfileId: string,
  trigger: MilestoneTrigger,
): Promise<void> {
  const { body_pt, body_en } = buildBodies(trigger);
  await supabase.from('narratives').insert({
    entity_type: 'player',
    entity_id: playerProfileId,
    scope: 'milestone',
    milestone_type: trigger.type,
    body_pt,
    body_en,
    facts_json: { milestone_type: trigger.type, ...trigger.vars },
  });
  // Conflicts (already exists) are silently ignored — partial UNIQUE
  // index on (entity_type, entity_id, milestone_type) does the dedup.
}

interface CareerStats {
  goals: number;
  assists: number;
  cleanSheets: number;
  penaltiesSaved: number;
  tackles: number;
  yellow: number;
  red: number;
  matches: number;
  hatTrickMatches: number;
  pokerMatches: number;
  handfulMatches: number;
}

function emptyStats(): CareerStats {
  return { goals: 0, assists: 0, cleanSheets: 0, penaltiesSaved: 0, tackles: 0, yellow: 0, red: 0, matches: 0, hatTrickMatches: 0, pokerMatches: 0, handfulMatches: 0 };
}

function aggregate(rows: any[]): CareerStats {
  const s = emptyStats();
  for (const r of rows) {
    s.goals += r.goals ?? 0;
    s.assists += r.assists ?? 0;
    if (r.clean_sheet) s.cleanSheets += 1;
    s.penaltiesSaved += r.gk_penalties_saved ?? 0;
    s.tackles += r.tackles ?? 0;
    s.yellow += r.yellow_cards ?? 0;
    s.red += r.red_cards ?? 0;
    s.matches += 1;
    if ((r.goals ?? 0) >= 3) s.hatTrickMatches += 1;
    if ((r.goals ?? 0) >= 4) s.pokerMatches += 1;
    if ((r.goals ?? 0) >= 5) s.handfulMatches += 1;
  }
  return s;
}

function crossed(before: number, after: number, threshold: number): boolean {
  return before < threshold && after >= threshold;
}

// ── Per-match detector ──
// Called after persistMatchPlayerStats. Iterates every player who played
// the match and emits any career-threshold milestones that crossed in
// this match (first goal, 50 goals, first hat-trick, 100 matches, etc.)
export async function detectAndPersistMatchMilestones(
  supabase: SupabaseClient,
  matchId: string,
): Promise<void> {
  try {
    const { data: matchStatsAll } = await supabase
      .from('player_match_stats')
      .select('player_profile_id, club_id, goals, assists, clean_sheet, gk_penalties_saved, tackles, yellow_cards, red_cards')
      .eq('match_id', matchId);
    if (!matchStatsAll || matchStatsAll.length === 0) return;

    const { data: match } = await supabase
      .from('matches')
      .select('home_club_id, away_club_id')
      .eq('id', matchId)
      .maybeSingle();
    if (!match) return;

    // Pre-fetch all player profiles + opponent club names
    const playerIds = matchStatsAll.map((r: any) => r.player_profile_id).filter(Boolean);
    const { data: profiles } = await supabase
      .from('player_profiles')
      .select('id, full_name, club_id')
      .in('id', playerIds);
    const profileById = new Map<string, any>();
    for (const p of profiles ?? []) profileById.set(p.id, p);

    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name')
      .in('id', [match.home_club_id, match.away_club_id]);
    const clubName = new Map<string, string>();
    for (const c of clubs ?? []) clubName.set(c.id, c.name);

    for (const ms of matchStatsAll) {
      const profile = profileById.get(ms.player_profile_id);
      if (!profile) continue;

      const opponentClubId = ms.club_id === match.home_club_id ? match.away_club_id : match.home_club_id;
      const opponentName = clubName.get(opponentClubId) ?? '';

      // Career rows for this player (includes the current match)
      const { data: careerRows } = await supabase
        .from('player_match_stats')
        .select('match_id, season_id, goals, assists, clean_sheet, gk_penalties_saved, tackles, yellow_cards, red_cards')
        .eq('player_profile_id', ms.player_profile_id);

      const allRows = careerRows ?? [];
      const beforeRows = allRows.filter((r: any) => r.match_id !== matchId);
      const seasonRows = allRows.filter((r: any) => r.season_id === (ms as any).season_id);
      const seasonBeforeRows = seasonRows.filter((r: any) => r.match_id !== matchId);

      const careerAfter = aggregate(allRows);
      const careerBefore = aggregate(beforeRows);
      const seasonAfter = aggregate(seasonRows);
      const seasonBefore = aggregate(seasonBeforeRows);

      const triggers: MilestoneTrigger[] = [];
      const baseVars = { player_name: profile.full_name, opponent_name: opponentName };

      // Goals career
      if (crossed(careerBefore.goals, careerAfter.goals, 1)) triggers.push({ type: 'first_goal', vars: baseVars });
      for (const t of [10, 25, 50, 100, 200] as const) {
        if (crossed(careerBefore.goals, careerAfter.goals, t)) triggers.push({ type: `goals_${t}` as MilestoneType, vars: baseVars });
      }
      // Hat-trick / poker / handful (first only)
      if ((ms.goals ?? 0) >= 3 && careerBefore.hatTrickMatches === 0) triggers.push({ type: 'first_hat_trick', vars: baseVars });
      if ((ms.goals ?? 0) >= 4 && careerBefore.pokerMatches === 0) triggers.push({ type: 'first_poker', vars: baseVars });
      if ((ms.goals ?? 0) >= 5 && careerBefore.handfulMatches === 0) triggers.push({ type: 'first_handful', vars: baseVars });

      // Goals season
      for (const t of [5, 10, 20, 30] as const) {
        if (crossed(seasonBefore.goals, seasonAfter.goals, t)) triggers.push({ type: `season_${t}_goals` as MilestoneType, vars: baseVars });
      }

      // Assists career
      if (crossed(careerBefore.assists, careerAfter.assists, 1)) triggers.push({ type: 'first_assist', vars: baseVars });
      for (const t of [25, 50, 100] as const) {
        if (crossed(careerBefore.assists, careerAfter.assists, t)) triggers.push({ type: `assists_${t}` as MilestoneType, vars: baseVars });
      }
      for (const t of [10, 20] as const) {
        if (crossed(seasonBefore.assists, seasonAfter.assists, t)) triggers.push({ type: `season_${t}_assists` as MilestoneType, vars: baseVars });
      }

      // GK
      if (crossed(careerBefore.cleanSheets, careerAfter.cleanSheets, 1)) triggers.push({ type: 'first_clean_sheet', vars: baseVars });
      for (const t of [10, 25, 50, 100] as const) {
        if (crossed(careerBefore.cleanSheets, careerAfter.cleanSheets, t)) triggers.push({ type: `clean_sheets_${t}` as MilestoneType, vars: baseVars });
      }
      if (crossed(careerBefore.penaltiesSaved, careerAfter.penaltiesSaved, 1)) triggers.push({ type: 'first_penalty_save', vars: baseVars });

      // Defense
      for (const t of [50, 100, 250] as const) {
        if (crossed(careerBefore.tackles, careerAfter.tackles, t)) triggers.push({ type: `tackles_${t}` as MilestoneType, vars: baseVars });
      }

      // Career matches
      if (crossed(careerBefore.matches, careerAfter.matches, 1)) triggers.push({ type: 'first_match', vars: baseVars });
      for (const t of [10, 50, 100, 200, 300] as const) {
        if (crossed(careerBefore.matches, careerAfter.matches, t)) triggers.push({ type: `matches_${t}` as MilestoneType, vars: baseVars });
      }

      // Cards
      if (crossed(careerBefore.red, careerAfter.red, 1)) triggers.push({ type: 'first_red_card', vars: baseVars });
      if (crossed(careerBefore.yellow, careerAfter.yellow, 100)) triggers.push({ type: 'yellows_100', vars: baseVars });

      // Persist all
      for (const trig of triggers) {
        await persistMilestone(supabase, ms.player_profile_id, trig);
      }
    }
  } catch (err) {
    console.error('[milestones] match detect failed:', err);
  }
}

// ── End-of-season detector ──
// Called when a league_seasons row transitions to status='finished'.
// Emits: season_top_scorer, first_title, first_runner_up, first_relegation,
// and second/third_title for repeat champions.
export async function detectAndPersistSeasonMilestones(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<void> {
  try {
    // Final standings
    const { data: standings } = await supabase
      .from('league_standings')
      .select('club_id, points, goals_for, goals_against, played, won, drawn, lost')
      .eq('season_id', seasonId);
    if (!standings || standings.length === 0) return;

    const sorted = [...standings].sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goals_for - a.goals_against;
      const gdB = b.goals_for - b.goals_against;
      if (gdB !== gdA) return gdB - gdA;
      return b.goals_for - a.goals_for;
    });
    const championClubId = sorted[0]?.club_id;
    const runnerUpClubId = sorted[1]?.club_id;
    const numClubs = sorted.length;
    const relegatedClubIds = sorted.slice(numClubs - 4).map((s: any) => s.club_id);

    // Season top scorer
    const { data: seasonStats } = await supabase
      .from('player_match_stats')
      .select('player_profile_id, goals, club_id')
      .eq('season_id', seasonId);
    const goalsByPlayer = new Map<string, { goals: number; club_id: string }>();
    for (const s of seasonStats ?? []) {
      if (!s.player_profile_id) continue;
      const cur = goalsByPlayer.get(s.player_profile_id);
      if (cur) cur.goals += s.goals ?? 0;
      else goalsByPlayer.set(s.player_profile_id, { goals: s.goals ?? 0, club_id: s.club_id });
    }
    let topScorerId: string | null = null;
    let topScorerGoals = 0;
    for (const [pid, info] of goalsByPlayer) {
      if (info.goals > topScorerGoals) {
        topScorerGoals = info.goals;
        topScorerId = pid;
      }
    }

    // Resolve names
    const allPlayerIds = new Set<string>(goalsByPlayer.keys());
    if (topScorerId) allPlayerIds.add(topScorerId);
    const { data: profiles } = allPlayerIds.size > 0
      ? await supabase.from('player_profiles').select('id, full_name, club_id').in('id', Array.from(allPlayerIds))
      : { data: [] as any[] };
    const profileById = new Map<string, any>();
    for (const p of profiles ?? []) profileById.set(p.id, p);

    // Top scorer milestone
    if (topScorerId && topScorerGoals > 0) {
      const profile = profileById.get(topScorerId);
      if (profile) {
        await persistMilestone(supabase, topScorerId, {
          type: 'season_top_scorer',
          vars: { player_name: profile.full_name, goals_count: topScorerGoals },
        });
      }
    }

    // Title / runner-up / relegation milestones — apply to every player
    // who appeared for those clubs this season.
    const titledClubMap = new Map<string, MilestoneType>();
    if (championClubId) titledClubMap.set(championClubId, 'first_title');
    if (runnerUpClubId) titledClubMap.set(runnerUpClubId, 'first_runner_up');
    for (const rid of relegatedClubIds) titledClubMap.set(rid, 'first_relegation');

    for (const [clubId, milestoneType] of titledClubMap) {
      const playersForClub = new Set<string>();
      for (const s of seasonStats ?? []) {
        if (s.club_id === clubId) playersForClub.add(s.player_profile_id);
      }
      for (const pid of playersForClub) {
        const profile = profileById.get(pid)
          ?? (await supabase.from('player_profiles').select('full_name').eq('id', pid).maybeSingle()).data;
        if (!profile?.full_name) continue;

        // Promote to second/third_title if this player already has a title
        let actualType = milestoneType;
        if (milestoneType === 'first_title') {
          const { data: prevTitles } = await supabase
            .from('narratives')
            .select('milestone_type')
            .eq('entity_type', 'player')
            .eq('entity_id', pid)
            .eq('scope', 'milestone')
            .in('milestone_type', ['first_title', 'second_title']);
          if (prevTitles && prevTitles.length === 1) actualType = 'second_title';
          else if (prevTitles && prevTitles.length >= 2) actualType = 'third_title';
        }
        await persistMilestone(supabase, pid, {
          type: actualType,
          vars: { player_name: profile.full_name },
        });
      }
    }
  } catch (err) {
    console.error('[milestones] season detect failed:', err);
  }
}
