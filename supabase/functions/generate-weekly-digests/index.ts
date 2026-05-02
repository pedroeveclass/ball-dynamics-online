// Weekly digest generator (FM inbox-style).
//
// Triggered by:
//   - Cron Mon 11:00 UTC (= Mon 08:00 BRT) — automatic weekly run
//   - Manual POST with { season_id, round_number } for backfill / testing
//
// For each authenticated user it builds a per-user digest with 5 sections
// (Sua Liga, Seu Clube, Você, Tabela, Próxima Rodada) as a bullet list,
// in PT and EN, and persists to user_digests. Idempotent via UNIQUE
// (user_id, season_id, round_number).
//
// Free agents / users without a club still get a digest — just shorter.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DigestSectionItem {
  pt: string;
  en: string;
}

interface ProgressUser {
  user_id: string;
  manager_profile?: { id: string; display_name: string | null; full_name: string | null; club_id: string | null } | null;
  player_profiles?: Array<{ id: string; full_name: string; club_id: string | null; primary_position: string | null }>;
}

async function pickActiveSeasonAndRound(
  supabase: SupabaseClient,
): Promise<{ seasonId: string; roundNumber: number; roundId: string } | null> {
  // Latest finished round in any active or recently-finished season
  const { data: rounds } = await supabase
    .from('league_rounds')
    .select('id, round_number, season_id, scheduled_at, status')
    .eq('status', 'finished')
    .order('round_number', { ascending: false })
    .order('scheduled_at', { ascending: false })
    .limit(1);
  if (!rounds || rounds.length === 0) return null;
  return { seasonId: rounds[0].season_id, roundNumber: rounds[0].round_number, roundId: rounds[0].id };
}

async function pickRoundById(
  supabase: SupabaseClient,
  seasonId: string,
  roundNumber: number,
): Promise<{ seasonId: string; roundNumber: number; roundId: string } | null> {
  const { data: round } = await supabase
    .from('league_rounds')
    .select('id, round_number, season_id, status')
    .eq('season_id', seasonId)
    .eq('round_number', roundNumber)
    .maybeSingle();
  if (!round) return null;
  return { seasonId: round.season_id, roundNumber: round.round_number, roundId: round.id };
}

interface RoundContext {
  seasonId: string;
  roundNumber: number;
  roundId: string;
  // global context valid for any user
  leaderClubName: string | null;
  leaderPoints: number;
  secondClubName: string | null;
  secondPoints: number;
  topScorerName: string | null;
  topScorerGoals: number;
  hatTrickPlayerName: string | null;
  hatTrickGoals: number;
  hatTrickClubName: string | null;
  topMatch: { home: string; away: string; homeGoals: number; awayGoals: number } | null;
  standings: Array<{ club_id: string; name: string; points: number; played: number }>;
  numClubs: number;
  // next round
  nextRound: { roundNumber: number; scheduledAt: string | null } | null;
}

async function buildRoundContext(
  supabase: SupabaseClient,
  seasonId: string,
  roundNumber: number,
  roundId: string,
): Promise<RoundContext> {
  // League matches in this round + their match results
  const { data: leagueMatches } = await supabase
    .from('league_matches')
    .select('match_id, home_club_id, away_club_id')
    .eq('round_id', roundId);

  const matchIds = (leagueMatches ?? []).map((lm: any) => lm.match_id).filter(Boolean);
  const { data: matches } = matchIds.length > 0
    ? await supabase.from('matches').select('id, home_club_id, away_club_id, home_score, away_score').in('id', matchIds)
    : { data: [] as any[] };

  const allClubIds = new Set<string>();
  for (const lm of leagueMatches ?? []) { allClubIds.add(lm.home_club_id); allClubIds.add(lm.away_club_id); }

  // Standings
  const { data: standingsRaw } = await supabase
    .from('league_standings')
    .select('club_id, points, goals_for, goals_against, played')
    .eq('season_id', seasonId);
  const sortedStandings = [...(standingsRaw ?? [])].sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goals_for - a.goals_against;
    const gdB = b.goals_for - b.goals_against;
    if (gdB !== gdA) return gdB - gdA;
    return b.goals_for - a.goals_for;
  });
  for (const s of sortedStandings) allClubIds.add(s.club_id);

  // Resolve club names
  const { data: clubs } = allClubIds.size > 0
    ? await supabase.from('clubs').select('id, name').in('id', Array.from(allClubIds))
    : { data: [] as any[] };
  const clubName = new Map<string, string>();
  for (const c of clubs ?? []) clubName.set(c.id, c.name);

  const standings = sortedStandings.map((s: any) => ({
    club_id: s.club_id,
    name: clubName.get(s.club_id) ?? '',
    points: s.points,
    played: s.played,
  }));

  const leaderClubName = standings[0]?.name ?? null;
  const leaderPoints = standings[0]?.points ?? 0;
  const secondClubName = standings[1]?.name ?? null;
  const secondPoints = standings[1]?.points ?? 0;
  const numClubs = standings.length;

  // Top match (highest combined goals)
  let topMatch: RoundContext['topMatch'] = null;
  let topMatchSum = -1;
  for (const m of matches ?? []) {
    const sum = (m.home_score ?? 0) + (m.away_score ?? 0);
    if (sum > topMatchSum) {
      topMatchSum = sum;
      topMatch = {
        home: clubName.get(m.home_club_id) ?? '',
        away: clubName.get(m.away_club_id) ?? '',
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
      };
    }
  }

  // Round goals — find hat-trick + top scorer of round
  const { data: roundStats } = matchIds.length > 0
    ? await supabase
        .from('player_match_stats')
        .select('match_id, player_profile_id, club_id, goals')
        .in('match_id', matchIds)
    : { data: [] as any[] };
  const goalsByPlayerInRound = new Map<string, { goals: number; club_id: string }>();
  for (const s of roundStats ?? []) {
    if (!s.player_profile_id) continue;
    const cur = goalsByPlayerInRound.get(s.player_profile_id);
    if (cur) cur.goals += s.goals ?? 0;
    else goalsByPlayerInRound.set(s.player_profile_id, { goals: s.goals ?? 0, club_id: s.club_id });
  }
  let hatTrickPlayerId: string | null = null;
  let hatTrickGoals = 0;
  let topScorerOfRoundId: string | null = null;
  let topScorerOfRoundGoals = 0;
  for (const [pid, info] of goalsByPlayerInRound) {
    if (info.goals >= 3 && info.goals > hatTrickGoals) { hatTrickGoals = info.goals; hatTrickPlayerId = pid; }
    if (info.goals > topScorerOfRoundGoals) { topScorerOfRoundGoals = info.goals; topScorerOfRoundId = pid; }
  }

  // Season top scorer
  const { data: seasonStats } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, goals')
    .eq('season_id', seasonId);
  const seasonGoals = new Map<string, number>();
  for (const s of seasonStats ?? []) {
    if (!s.player_profile_id) continue;
    seasonGoals.set(s.player_profile_id, (seasonGoals.get(s.player_profile_id) ?? 0) + (s.goals ?? 0));
  }
  let seasonTopScorerId: string | null = null;
  let seasonTopScorerGoals = 0;
  for (const [pid, g] of seasonGoals) {
    if (g > seasonTopScorerGoals) { seasonTopScorerGoals = g; seasonTopScorerId = pid; }
  }

  // Resolve player names for hat-trick and season top scorer
  const playerIdsToResolve = new Set<string>();
  if (hatTrickPlayerId) playerIdsToResolve.add(hatTrickPlayerId);
  if (seasonTopScorerId) playerIdsToResolve.add(seasonTopScorerId);
  const { data: players } = playerIdsToResolve.size > 0
    ? await supabase.from('player_profiles').select('id, full_name').in('id', Array.from(playerIdsToResolve))
    : { data: [] as any[] };
  const playerName = new Map<string, string>();
  for (const p of players ?? []) playerName.set(p.id, p.full_name);

  const hatTrickPlayerName = hatTrickPlayerId ? playerName.get(hatTrickPlayerId) ?? null : null;
  const hatTrickClubName = hatTrickPlayerId
    ? clubName.get(goalsByPlayerInRound.get(hatTrickPlayerId)?.club_id ?? '') ?? null
    : null;
  const topScorerName = seasonTopScorerId ? playerName.get(seasonTopScorerId) ?? null : null;

  // Next round (next round_number with status != finished, ordered by scheduled_at)
  const { data: nextRoundRow } = await supabase
    .from('league_rounds')
    .select('round_number, scheduled_at')
    .eq('season_id', seasonId)
    .gt('round_number', roundNumber)
    .order('round_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextRound = nextRoundRow
    ? { roundNumber: nextRoundRow.round_number, scheduledAt: nextRoundRow.scheduled_at }
    : null;

  return {
    seasonId,
    roundNumber,
    roundId,
    leaderClubName,
    leaderPoints,
    secondClubName,
    secondPoints,
    topScorerName,
    topScorerGoals: seasonTopScorerGoals,
    hatTrickPlayerName,
    hatTrickGoals,
    hatTrickClubName,
    topMatch,
    standings,
    numClubs,
    nextRound,
  };
}

interface UserClubContext {
  clubId: string;
  clubName: string;
  matchInRound: { home: string; away: string; homeGoals: number; awayGoals: number; isHome: boolean } | null;
  standingPos: number | null;
  points: number;
  nextMatchOpponent: string | null;
  nextMatchScheduledAt: string | null;
  isHomeNext: boolean;
}

async function getClubContext(
  supabase: SupabaseClient,
  ctx: RoundContext,
  clubId: string,
): Promise<UserClubContext | null> {
  const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).maybeSingle();
  if (!club) return null;

  // Match in this round involving the club
  const { data: leagueMatch } = await supabase
    .from('league_matches')
    .select('match_id, home_club_id, away_club_id')
    .eq('round_id', ctx.roundId)
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .maybeSingle();

  let matchInRound: UserClubContext['matchInRound'] = null;
  if (leagueMatch?.match_id) {
    const { data: m } = await supabase
      .from('matches')
      .select('home_club_id, away_club_id, home_score, away_score')
      .eq('id', leagueMatch.match_id)
      .maybeSingle();
    if (m) {
      const isHome = m.home_club_id === clubId;
      const otherId = isHome ? m.away_club_id : m.home_club_id;
      const { data: other } = await supabase.from('clubs').select('name').eq('id', otherId).maybeSingle();
      matchInRound = {
        home: isHome ? club.name : other?.name ?? '',
        away: isHome ? other?.name ?? '' : club.name,
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
        isHome,
      };
    }
  }

  const standingIdx = ctx.standings.findIndex(s => s.club_id === clubId);
  const standingPos = standingIdx >= 0 ? standingIdx + 1 : null;
  const points = standingIdx >= 0 ? ctx.standings[standingIdx].points : 0;

  // Next match for this club (next round-match that hasn't started yet)
  let nextMatchOpponent: string | null = null;
  let nextMatchScheduledAt: string | null = null;
  let isHomeNext = false;
  if (ctx.nextRound) {
    const { data: nextRound } = await supabase
      .from('league_rounds')
      .select('id, scheduled_at')
      .eq('season_id', ctx.seasonId)
      .eq('round_number', ctx.nextRound.roundNumber)
      .maybeSingle();
    if (nextRound) {
      const { data: nextLm } = await supabase
        .from('league_matches')
        .select('home_club_id, away_club_id')
        .eq('round_id', nextRound.id)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .maybeSingle();
      if (nextLm) {
        isHomeNext = nextLm.home_club_id === clubId;
        const oppId = isHomeNext ? nextLm.away_club_id : nextLm.home_club_id;
        const { data: opp } = await supabase.from('clubs').select('name').eq('id', oppId).maybeSingle();
        nextMatchOpponent = opp?.name ?? null;
        nextMatchScheduledAt = nextRound.scheduled_at;
      }
    }
  }

  return {
    clubId,
    clubName: club.name,
    matchInRound,
    standingPos,
    points,
    nextMatchOpponent,
    nextMatchScheduledAt,
    isHomeNext,
  };
}

interface UserPlayerContext {
  playerId: string;
  fullName: string;
  goalsInRound: number;
  assistsInRound: number;
  rating: number | null;
  milestonesUnlockedDescPt: string[];
  milestonesUnlockedDescEn: string[];
}

async function getPlayerContext(
  supabase: SupabaseClient,
  ctx: RoundContext,
  player: { id: string; full_name: string },
): Promise<UserPlayerContext | null> {
  // Player stats in any of the round's matches
  const { data: leagueMatches } = await supabase
    .from('league_matches')
    .select('match_id')
    .eq('round_id', ctx.roundId);
  const matchIds = (leagueMatches ?? []).map((lm: any) => lm.match_id).filter(Boolean);
  if (matchIds.length === 0) return null;

  const { data: pms } = await supabase
    .from('player_match_stats')
    .select('match_id, goals, assists, rating')
    .in('match_id', matchIds)
    .eq('player_profile_id', player.id)
    .maybeSingle();
  if (!pms) return null;

  // Milestones unlocked in this round (rough heuristic: generated in the
  // same week as this round's last match)
  const { data: roundMatches } = await supabase
    .from('matches')
    .select('finished_at')
    .in('id', matchIds)
    .order('finished_at', { ascending: false })
    .limit(1);
  const roundEndIso = roundMatches?.[0]?.finished_at;
  const windowStartIso = roundEndIso
    ? new Date(new Date(roundEndIso).getTime() - 7 * 24 * 3600 * 1000).toISOString()
    : null;

  const { data: milestones } = windowStartIso
    ? await supabase
        .from('narratives')
        .select('body_pt, body_en, milestone_type')
        .eq('entity_type', 'player')
        .eq('entity_id', player.id)
        .eq('scope', 'milestone')
        .gte('generated_at', windowStartIso)
    : { data: [] as any[] };

  // Take only the type tag for the bullet (full body shows on profile)
  const milestoneLabels = (milestones ?? []).map((m: any) => prettyMilestone(m.milestone_type));
  const milestonesUnlockedDescPt = milestoneLabels.map(l => l.pt);
  const milestonesUnlockedDescEn = milestoneLabels.map(l => l.en);

  return {
    playerId: player.id,
    fullName: player.full_name,
    goalsInRound: pms.goals ?? 0,
    assistsInRound: pms.assists ?? 0,
    rating: pms.rating != null ? Number(pms.rating) : null,
    milestonesUnlockedDescPt,
    milestonesUnlockedDescEn,
  };
}

function prettyMilestone(type: string | null): { pt: string; en: string } {
  if (!type) return { pt: '', en: '' };
  const map: Record<string, { pt: string; en: string }> = {
    first_goal: { pt: '🆕 1º gol da carreira', en: '🆕 First career goal' },
    goals_10: { pt: '🆕 10 gols na carreira', en: '🆕 10 career goals' },
    goals_25: { pt: '🆕 25 gols na carreira', en: '🆕 25 career goals' },
    goals_50: { pt: '🆕 50 gols na carreira', en: '🆕 50 career goals' },
    goals_100: { pt: '🆕 100 gols na carreira', en: '🆕 100 career goals' },
    goals_200: { pt: '🆕 200 gols na carreira', en: '🆕 200 career goals' },
    first_hat_trick: { pt: '🆕 1º hat-trick', en: '🆕 First hat-trick' },
    first_poker: { pt: '🆕 1º poker (4 gols)', en: '🆕 First poker (4 goals)' },
    first_handful: { pt: '🆕 5+ gols num jogo', en: '🆕 5+ goals in one match' },
    season_5_goals: { pt: '🆕 5 gols na temporada', en: '🆕 5 season goals' },
    season_10_goals: { pt: '🆕 10 gols na temporada', en: '🆕 10 season goals' },
    season_20_goals: { pt: '🆕 20 gols na temporada', en: '🆕 20 season goals' },
    season_30_goals: { pt: '🆕 30 gols na temporada', en: '🆕 30 season goals' },
    first_assist: { pt: '🆕 1ª assistência', en: '🆕 First assist' },
    assists_25: { pt: '🆕 25 assistências', en: '🆕 25 assists' },
    assists_50: { pt: '🆕 50 assistências', en: '🆕 50 assists' },
    assists_100: { pt: '🆕 100 assistências', en: '🆕 100 assists' },
    season_10_assists: { pt: '🆕 10 assistências na temporada', en: '🆕 10 season assists' },
    season_20_assists: { pt: '🆕 20 assistências na temporada', en: '🆕 20 season assists' },
    first_clean_sheet: { pt: '🆕 1º jogo sem sofrer gols', en: '🆕 First clean sheet' },
    clean_sheets_10: { pt: '🆕 10 clean sheets', en: '🆕 10 clean sheets' },
    clean_sheets_25: { pt: '🆕 25 clean sheets', en: '🆕 25 clean sheets' },
    clean_sheets_50: { pt: '🆕 50 clean sheets', en: '🆕 50 clean sheets' },
    clean_sheets_100: { pt: '🆕 100 clean sheets', en: '🆕 100 clean sheets' },
    first_penalty_save: { pt: '🆕 1ª defesa de pênalti', en: '🆕 First penalty save' },
    tackles_50: { pt: '🆕 50 desarmes', en: '🆕 50 tackles' },
    tackles_100: { pt: '🆕 100 desarmes', en: '🆕 100 tackles' },
    tackles_250: { pt: '🆕 250 desarmes', en: '🆕 250 tackles' },
    first_match: { pt: '🆕 Estreia profissional', en: '🆕 Professional debut' },
    matches_10: { pt: '🆕 10 jogos na carreira', en: '🆕 10 career matches' },
    matches_50: { pt: '🆕 50 jogos na carreira', en: '🆕 50 career matches' },
    matches_100: { pt: '🆕 100 jogos na carreira', en: '🆕 100 career matches' },
    matches_200: { pt: '🆕 200 jogos na carreira', en: '🆕 200 career matches' },
    matches_300: { pt: '🆕 300 jogos na carreira', en: '🆕 300 career matches' },
    first_red_card: { pt: '🆕 1º cartão vermelho', en: '🆕 First red card' },
    yellows_100: { pt: '🆕 100 amarelos na carreira', en: '🆕 100 career yellows' },
    season_top_scorer: { pt: '🏆 Artilheiro da temporada', en: '🏆 Season top scorer' },
    first_title: { pt: '🏆 Primeiro título', en: '🏆 First title' },
    second_title: { pt: '🏆 Bicampeão', en: '🏆 Two-time champion' },
    third_title: { pt: '🏆 Tricampeão', en: '🏆 Three-time champion' },
    first_runner_up: { pt: '🥈 Vice-campeão', en: '🥈 Runner-up' },
    first_relegation: { pt: '🔻 Rebaixamento', en: '🔻 Relegated' },
  };
  return map[type] ?? { pt: type, en: type };
}

function fmtDateBRT(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '');
  } catch { return ''; }
}

function fmtDateEN(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
}

interface DigestBuildArgs {
  ctx: RoundContext;
  clubCtx: UserClubContext | null;
  playerCtx: UserPlayerContext | null;
  isManager: boolean;
}

function buildDigestBody({ ctx, clubCtx, playerCtx, isManager }: DigestBuildArgs): { body_pt: string; body_en: string } {
  const linesPt: string[] = [];
  const linesEn: string[] = [];

  linesPt.push(`📰 Resumo da Semana — Rodada ${ctx.roundNumber}`);
  linesEn.push(`📰 Weekly Recap — Round ${ctx.roundNumber}`);
  linesPt.push('');
  linesEn.push('');

  // §1 — Sua Liga
  linesPt.push('🏆 Sua Liga');
  linesEn.push('🏆 Your League');
  if (ctx.topMatch) {
    linesPt.push(`  • Jogo da rodada: ${ctx.topMatch.home} ${ctx.topMatch.homeGoals} x ${ctx.topMatch.awayGoals} ${ctx.topMatch.away}`);
    linesEn.push(`  • Match of the round: ${ctx.topMatch.home} ${ctx.topMatch.homeGoals}-${ctx.topMatch.awayGoals} ${ctx.topMatch.away}`);
  }
  if (ctx.leaderClubName) {
    linesPt.push(`  • Líder: ${ctx.leaderClubName} (${ctx.leaderPoints} pts)`);
    linesEn.push(`  • Leader: ${ctx.leaderClubName} (${ctx.leaderPoints} pts)`);
  }
  if (ctx.hatTrickPlayerName && ctx.hatTrickGoals >= 3) {
    linesPt.push(`  • Hat-trick: ${ctx.hatTrickPlayerName} (${ctx.hatTrickGoals} gols pelo ${ctx.hatTrickClubName ?? ''})`);
    linesEn.push(`  • Hat-trick: ${ctx.hatTrickPlayerName} (${ctx.hatTrickGoals} goals for ${ctx.hatTrickClubName ?? ''})`);
  }
  if (ctx.topScorerName && ctx.topScorerGoals > 0) {
    linesPt.push(`  • Artilheiro: ${ctx.topScorerName} (${ctx.topScorerGoals} gols na temporada)`);
    linesEn.push(`  • Top scorer: ${ctx.topScorerName} (${ctx.topScorerGoals} season goals)`);
  }
  linesPt.push('');
  linesEn.push('');

  // §2 — Seu Clube
  if (clubCtx) {
    linesPt.push(`⚽ Seu Clube (${clubCtx.clubName})`);
    linesEn.push(`⚽ Your Club (${clubCtx.clubName})`);
    if (clubCtx.matchInRound) {
      const m = clubCtx.matchInRound;
      const myGoals = m.isHome ? m.homeGoals : m.awayGoals;
      const oppGoals = m.isHome ? m.awayGoals : m.homeGoals;
      const opp = m.isHome ? m.away : m.home;
      const venuePt = m.isHome ? '(em casa)' : '(fora)';
      const venueEn = m.isHome ? '(home)' : '(away)';
      let resultPt: string, resultEn: string, prepPt: string, prepEn: string;
      if (myGoals > oppGoals) { resultPt = 'Vitória'; resultEn = 'Win'; prepPt = 'sobre'; prepEn = 'over'; }
      else if (myGoals === oppGoals) { resultPt = 'Empate'; resultEn = 'Draw'; prepPt = 'com'; prepEn = 'with'; }
      else { resultPt = 'Derrota'; resultEn = 'Loss'; prepPt = 'para'; prepEn = 'to'; }
      linesPt.push(`  • ${resultPt} ${myGoals}-${oppGoals} ${prepPt} ${opp} ${venuePt}`);
      linesEn.push(`  • ${resultEn} ${myGoals}-${oppGoals} ${prepEn} ${opp} ${venueEn}`);
    }
    if (clubCtx.standingPos) {
      linesPt.push(`  • ${clubCtx.standingPos}ª posição com ${clubCtx.points} pontos`);
      linesEn.push(`  • ${clubCtx.standingPos}${suffixEn(clubCtx.standingPos)} place with ${clubCtx.points} points`);
    }
    if (clubCtx.nextMatchOpponent) {
      const venuePt = clubCtx.isHomeNext ? 'em casa vs' : 'fora vs';
      const venueEn = clubCtx.isHomeNext ? 'home vs' : 'away vs';
      linesPt.push(`  • Próximo: ${fmtDateBRT(clubCtx.nextMatchScheduledAt)} — ${venuePt} ${clubCtx.nextMatchOpponent}`);
      linesEn.push(`  • Next: ${fmtDateEN(clubCtx.nextMatchScheduledAt)} — ${venueEn} ${clubCtx.nextMatchOpponent}`);
    }
    linesPt.push('');
    linesEn.push('');
  } else if (!isManager && !clubCtx) {
    linesPt.push('⚽ Seu Clube');
    linesEn.push('⚽ Your Club');
    linesPt.push('  • Você está como agente livre. Aguardando proposta.');
    linesEn.push('  • You are a free agent. Awaiting offers.');
    linesPt.push('');
    linesEn.push('');
  }

  // §3 — Você (player only)
  if (playerCtx) {
    linesPt.push(`🏅 Você (${playerCtx.fullName})`);
    linesEn.push(`🏅 You (${playerCtx.fullName})`);
    const ratingTxtPt = playerCtx.rating != null ? ` — Nota ${playerCtx.rating.toFixed(1)}` : '';
    const ratingTxtEn = playerCtx.rating != null ? ` — Rating ${playerCtx.rating.toFixed(1)}` : '';
    linesPt.push(`  • Atuação: ${playerCtx.goalsInRound}G ${playerCtx.assistsInRound}A${ratingTxtPt}`);
    linesEn.push(`  • Performance: ${playerCtx.goalsInRound}G ${playerCtx.assistsInRound}A${ratingTxtEn}`);
    for (const m of playerCtx.milestonesUnlockedDescPt) linesPt.push(`  • ${m}`);
    for (const m of playerCtx.milestonesUnlockedDescEn) linesEn.push(`  • ${m}`);
    linesPt.push('');
    linesEn.push('');
  }

  // §4 — Tabela
  if (ctx.standings.length > 0) {
    linesPt.push('📊 Tabela');
    linesEn.push('📊 Standings');
    const top3 = ctx.standings.slice(0, 3);
    linesPt.push(`  • Top 3: ${top3.map(s => `${s.name} (${s.points})`).join(' | ')}`);
    linesEn.push(`  • Top 3: ${top3.map(s => `${s.name} (${s.points})`).join(' | ')}`);
    if (ctx.numClubs >= 8) {
      const bottom = ctx.standings.slice(ctx.numClubs - 4).map(s => s.name);
      linesPt.push(`  • Z. rebaixamento: ${bottom.join(', ')}`);
      linesEn.push(`  • Relegation zone: ${bottom.join(', ')}`);
    }
    linesPt.push('');
    linesEn.push('');
  }

  // §5 — Próxima Rodada
  if (ctx.nextRound) {
    linesPt.push(`⏭️ Próxima Rodada — ${fmtDateBRT(ctx.nextRound.scheduledAt)}`);
    linesEn.push(`⏭️ Next Round — ${fmtDateEN(ctx.nextRound.scheduledAt)}`);
    if (clubCtx?.nextMatchOpponent) {
      const venuePt = clubCtx.isHomeNext ? 'em casa vs' : 'fora vs';
      const venueEn = clubCtx.isHomeNext ? 'home vs' : 'away vs';
      linesPt.push(`  • Seu jogo: ${venuePt} ${clubCtx.nextMatchOpponent}`);
      linesEn.push(`  • Your match: ${venueEn} ${clubCtx.nextMatchOpponent}`);
    }
  }

  return {
    body_pt: linesPt.join('\n').trim(),
    body_en: linesEn.join('\n').trim(),
  };
}

function suffixEn(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  const last = n % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

async function generateForUser(
  supabase: SupabaseClient,
  ctx: RoundContext,
  user: ProgressUser,
): Promise<boolean> {
  const isManager = !!user.manager_profile;
  const player = user.player_profiles?.[0] ?? null;

  // Resolve club: prefer manager's club, fall back to active player's club
  let clubId: string | null = null;
  if (user.manager_profile?.club_id) clubId = user.manager_profile.club_id;
  else if (player?.club_id) clubId = player.club_id;

  const clubCtx = clubId ? await getClubContext(supabase, ctx, clubId) : null;
  const playerCtx = player ? await getPlayerContext(supabase, ctx, { id: player.id, full_name: player.full_name }) : null;

  // Skip if user has nothing related to this round (no club + no player stats)
  if (!clubCtx && !playerCtx) return false;

  const { body_pt, body_en } = buildDigestBody({ ctx, clubCtx, playerCtx, isManager });

  const { error } = await supabase.from('user_digests').insert({
    user_id: user.user_id,
    season_id: ctx.seasonId,
    round_number: ctx.roundNumber,
    body_pt,
    body_en,
    facts_json: {
      round_number: ctx.roundNumber,
      season_id: ctx.seasonId,
      has_club: !!clubCtx,
      has_player: !!playerCtx,
    },
  });
  if (error) {
    // 23505 = unique violation (already generated for this user/round)
    if (!String(error.message).includes('duplicate')) console.error('insert digest failed:', error);
    return false;
  }
  return true;
}

async function listActiveUsers(supabase: SupabaseClient): Promise<ProgressUser[]> {
  // Pull all users who have either a manager profile or an active player profile
  const { data: managers } = await supabase
    .from('manager_profiles')
    .select('id, user_id, display_name, full_name, club_id')
    .not('user_id', 'is', null);
  const { data: players } = await supabase
    .from('player_profiles')
    .select('id, user_id, full_name, club_id, primary_position, retirement_status')
    .not('user_id', 'is', null);

  const byUser = new Map<string, ProgressUser>();
  for (const mgr of managers ?? []) {
    if (!mgr.user_id) continue;
    const cur = byUser.get(mgr.user_id) ?? { user_id: mgr.user_id, player_profiles: [] };
    cur.manager_profile = { id: mgr.id, display_name: mgr.display_name, full_name: mgr.full_name, club_id: mgr.club_id };
    byUser.set(mgr.user_id, cur);
  }
  for (const p of players ?? []) {
    if (!p.user_id) continue;
    if (p.retirement_status === 'retired') continue;
    const cur = byUser.get(p.user_id) ?? { user_id: p.user_id, player_profiles: [] };
    cur.player_profiles = cur.player_profiles ?? [];
    cur.player_profiles.push({ id: p.id, full_name: p.full_name, club_id: p.club_id, primary_position: p.primary_position });
    byUser.set(p.user_id, cur);
  }
  return Array.from(byUser.values());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: { season_id?: string; round_number?: number } = {};
    try { if (req.method === 'POST') body = await req.json().catch(() => ({})); } catch { /* ignore */ }

    let target: { seasonId: string; roundNumber: number; roundId: string } | null;
    if (body.season_id && body.round_number) {
      target = await pickRoundById(supabase, body.season_id, body.round_number);
    } else {
      target = await pickActiveSeasonAndRound(supabase);
    }
    if (!target) {
      return new Response(JSON.stringify({ error: 'No finished round to digest' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ctx = await buildRoundContext(supabase, target.seasonId, target.roundNumber, target.roundId);
    const users = await listActiveUsers(supabase);

    let generated = 0;
    let skipped = 0;
    const errors: { user_id: string; message: string }[] = [];
    for (const u of users) {
      try {
        const ok = await generateForUser(supabase, ctx, u);
        if (ok) generated += 1;
        else skipped += 1;
      } catch (err: any) {
        errors.push({ user_id: u.user_id, message: String(err?.message ?? err) });
      }
    }

    return new Response(JSON.stringify({
      season_id: target.seasonId,
      round_number: target.roundNumber,
      total_users: users.length,
      generated,
      skipped,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
