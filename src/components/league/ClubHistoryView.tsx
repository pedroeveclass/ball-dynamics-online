import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Medal, History, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ClubRecord {
  biggestWin: { home: string; away: string; homeGoals: number; awayGoals: number; matchId: string } | null;
  highestScoring: { home: string; away: string; homeGoals: number; awayGoals: number; matchId: string } | null;
}
interface RetiredIdol { id: string; name: string; matches: number }
interface AllTimeScorer { id: string; name: string; goals: number }
interface ClubTrophyCounts {
  titles: number;
  runnerUps: number;
  relegations: number;
}

// Lightweight "history" view for PublicClubPage. Aggregates trophies,
// records, retired idols, and all-time top scorers from data we already
// have. No new tables — just smarter joins. Templated narrative paragraph
// is deferred to v2 (see project_narrative_system memory).
export function ClubHistoryView({ clubId }: { clubId: string }) {
  const { t } = useTranslation('narratives');
  const [trophies, setTrophies] = useState<ClubTrophyCounts | null>(null);
  const [records, setRecords] = useState<ClubRecord | null>(null);
  const [idols, setIdols] = useState<RetiredIdol[]>([]);
  const [scorers, setScorers] = useState<AllTimeScorer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Trophies — count narratives milestones where the player's stats
      // include this club at the moment of the title (rough heuristic:
      // count distinct milestones across players who played for this club)
      const trophyCounts: ClubTrophyCounts = await fetchTrophyCounts(clubId);

      // Records: biggest win for the club + highest scoring of any match
      const rec = await fetchClubRecords(clubId);

      // Retired idols (players with retirement_status='retired' who
      // played for this club, top 5 by matches at this club)
      const retired = await fetchRetiredIdols(clubId);

      // All-time top scorers for the club
      const allTimeScorers = await fetchAllTimeScorers(clubId);

      if (cancelled) return;
      setTrophies(trophyCounts);
      setRecords(rec);
      setIdols(retired);
      setScorers(allTimeScorers);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="stat-card space-y-3">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <History className="h-4 w-4 text-tactical" /> {t('clubHistory.title', { defaultValue: 'História do Clube' })}
      </h3>

      {/* Trophy counts */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <TrophyCell icon={<Trophy className="h-5 w-5 text-amber-500" />} label={t('clubHistory.titles', { defaultValue: 'Títulos' })} value={trophies?.titles ?? 0} />
        <TrophyCell icon={<Medal className="h-5 w-5 text-slate-300" />} label={t('clubHistory.runner_ups', { defaultValue: 'Vices' })} value={trophies?.runnerUps ?? 0} />
        <TrophyCell icon={<History className="h-5 w-5 text-destructive" />} label={t('clubHistory.relegations', { defaultValue: 'Rebaixamentos' })} value={trophies?.relegations ?? 0} />
      </div>

      {/* Records */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('clubHistory.records', { defaultValue: 'Recordes' })}</p>
        {records?.biggestWin && (
          <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-sm">
            <span className="text-xs text-muted-foreground shrink-0 mr-2">{t('clubHistory.biggest_win', { defaultValue: 'Maior goleada' })}</span>
            <Link to={`/match/${records.biggestWin.matchId}/replay`} className="font-display font-semibold truncate hover:text-pitch">
              {records.biggestWin.home} {records.biggestWin.homeGoals}-{records.biggestWin.awayGoals} {records.biggestWin.away}
            </Link>
          </div>
        )}
        {records?.highestScoring && (
          <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-sm">
            <span className="text-xs text-muted-foreground shrink-0 mr-2">{t('clubHistory.highest_scoring', { defaultValue: 'Jogo de mais gols' })}</span>
            <Link to={`/match/${records.highestScoring.matchId}/replay`} className="font-display font-semibold truncate hover:text-pitch">
              {records.highestScoring.home} {records.highestScoring.homeGoals}-{records.highestScoring.awayGoals} {records.highestScoring.away}
            </Link>
          </div>
        )}
      </div>

      {/* All-time top scorers */}
      {scorers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('clubHistory.top_scorers', { defaultValue: 'Maiores artilheiros' })}</p>
          <ol className="space-y-1">
            {scorers.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-sm">
                <Link to={`/player/${s.id}`} className="font-display font-semibold truncate hover:text-pitch">
                  {i + 1}. {s.name}
                </Link>
                <span className="font-mono text-pitch">{s.goals}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Retired idols */}
      {idols.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('clubHistory.retired_idols', { defaultValue: 'Ídolos aposentados' })}</p>
          <ul className="space-y-1">
            {idols.map(p => (
              <li key={p.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-sm">
                <Link to={`/player/${p.id}`} className="font-display font-semibold truncate hover:text-pitch">
                  {p.name}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{p.matches} jogos</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TrophyCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-muted/30 rounded p-2">
      <div className="flex justify-center">{icon}</div>
      <p className="font-display font-bold text-xl">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

async function fetchTrophyCounts(clubId: string): Promise<ClubTrophyCounts> {
  // Aggregate from player_awards (season_mvp / first_title... aren't there;
  // titles come from milestones on players, but counting them all per club
  // double-counts the squad. Better: count from league_seasons + standings.)
  const { data: standings } = await supabase
    .from('league_standings')
    .select('season_id, club_id, points, goals_for, goals_against, played, won, drawn, lost')
    .eq('club_id', clubId);
  if (!standings || standings.length === 0) {
    return { titles: 0, runnerUps: 0, relegations: 0 };
  }
  // For each season, fetch the full standings to know the club's position
  const seasonIds = Array.from(new Set(standings.map((s: any) => s.season_id)));
  const { data: seasonMeta } = await supabase
    .from('league_seasons')
    .select('id, status')
    .in('id', seasonIds);
  const finishedSeasonIds = new Set((seasonMeta ?? []).filter((s: any) => s.status === 'finished').map((s: any) => s.id));

  let titles = 0, runnerUps = 0, relegations = 0;
  for (const sid of finishedSeasonIds) {
    const { data: full } = await supabase
      .from('league_standings')
      .select('club_id, points, goals_for, goals_against')
      .eq('season_id', sid);
    const sorted = [...(full ?? [])].sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdA = a.goals_for - a.goals_against;
      const gdB = b.goals_for - b.goals_against;
      if (gdB !== gdA) return gdB - gdA;
      return b.goals_for - a.goals_for;
    });
    if (sorted[0]?.club_id === clubId) titles += 1;
    if (sorted[1]?.club_id === clubId) runnerUps += 1;
    if (sorted.length >= 8) {
      const bottomFour = sorted.slice(sorted.length - 4).map((s: any) => s.club_id);
      if (bottomFour.includes(clubId)) relegations += 1;
    }
  }
  return { titles, runnerUps, relegations };
}

async function fetchClubRecords(clubId: string): Promise<ClubRecord> {
  // Biggest win: club as home OR away with biggest goal difference in their favor
  const { data: home } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score')
    .eq('home_club_id', clubId)
    .eq('status', 'finished');
  const { data: away } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score')
    .eq('away_club_id', clubId)
    .eq('status', 'finished');
  const all = [...(home ?? []), ...(away ?? [])];

  let biggestDiff = -1;
  let biggestWinMatch: any = null;
  let highestSum = -1;
  let highestScoringMatch: any = null;
  for (const m of all) {
    const isHome = m.home_club_id === clubId;
    const my = isHome ? m.home_score : m.away_score;
    const opp = isHome ? m.away_score : m.home_score;
    const diff = my - opp;
    if (diff > biggestDiff) { biggestDiff = diff; biggestWinMatch = m; }
    const sum = (m.home_score ?? 0) + (m.away_score ?? 0);
    if (sum > highestSum) { highestSum = sum; highestScoringMatch = m; }
  }

  const matchClubIds = new Set<string>();
  if (biggestWinMatch) { matchClubIds.add(biggestWinMatch.home_club_id); matchClubIds.add(biggestWinMatch.away_club_id); }
  if (highestScoringMatch) { matchClubIds.add(highestScoringMatch.home_club_id); matchClubIds.add(highestScoringMatch.away_club_id); }
  const { data: clubs } = matchClubIds.size > 0
    ? await supabase.from('clubs').select('id, name').in('id', Array.from(matchClubIds))
    : { data: [] as any[] };
  const clubName = new Map<string, string>();
  for (const c of clubs ?? []) clubName.set(c.id, c.name);

  const map = (m: any) => m ? {
    home: clubName.get(m.home_club_id) ?? '',
    away: clubName.get(m.away_club_id) ?? '',
    homeGoals: m.home_score ?? 0,
    awayGoals: m.away_score ?? 0,
    matchId: m.id,
  } : null;

  return { biggestWin: map(biggestWinMatch), highestScoring: map(highestScoringMatch) };
}

async function fetchRetiredIdols(clubId: string): Promise<RetiredIdol[]> {
  // Players who retired AND have stats rows for this club
  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('player_profile_id')
    .eq('club_id', clubId);
  const matchCount = new Map<string, number>();
  for (const s of (stats ?? []) as any[]) {
    if (!s.player_profile_id) continue;
    matchCount.set(s.player_profile_id, (matchCount.get(s.player_profile_id) ?? 0) + 1);
  }
  if (matchCount.size === 0) return [];

  const { data: profiles } = await supabase
    .from('player_profiles')
    .select('id, full_name, retirement_status')
    .in('id', Array.from(matchCount.keys()))
    .eq('retirement_status', 'retired');
  const list = (profiles ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name,
    matches: matchCount.get(p.id) ?? 0,
  }));
  list.sort((a, b) => b.matches - a.matches);
  return list.slice(0, 5);
}

async function fetchAllTimeScorers(clubId: string): Promise<AllTimeScorer[]> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('player_profile_id, goals')
    .eq('club_id', clubId);
  if (!data || data.length === 0) return [];
  const totals = new Map<string, number>();
  for (const r of data as any[]) {
    if (!r.player_profile_id) continue;
    totals.set(r.player_profile_id, (totals.get(r.player_profile_id) ?? 0) + (r.goals ?? 0));
  }
  const ids = Array.from(totals.entries()).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from('player_profiles')
    .select('id, full_name')
    .in('id', ids);
  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
  return ids.map(id => ({ id, name: nameById.get(id) ?? '', goals: totals.get(id) ?? 0 }));
}
