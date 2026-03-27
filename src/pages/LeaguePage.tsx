import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Calendar, ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Club {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
}

interface Standing {
  id: string;
  club_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  clubs: Club;
}

interface LeagueMatch {
  id: string;
  home_club_id: string;
  away_club_id: string;
  match_id: string | null;
  home_club: Club;
  away_club: Club;
  match: { home_score: number; away_score: number; status: string } | null;
}

interface Round {
  id: string;
  round_number: number;
  scheduled_at: string;
  status: string;
  league_matches: LeagueMatch[];
}

export default function LeaguePage() {
  const [loading, setLoading] = useState(true);
  const [leagueName, setLeagueName] = useState('');
  const [seasonNumber, setSeasonNumber] = useState(0);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const roundsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLeagueData();
  }, []);

  async function fetchLeagueData() {
    try {
      // 1. Get active league
      const { data: league } = await supabase
        .from('leagues')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (!league) { setLoading(false); return; }
      setLeagueName(league.name);

      // 2. Get current season
      const { data: season } = await supabase
        .from('league_seasons')
        .select('*')
        .eq('league_id', league.id)
        .order('season_number', { ascending: false })
        .limit(1)
        .single();

      if (!season) { setLoading(false); return; }
      setSeasonNumber(season.season_number);

      // 3. Fetch standings and rounds in parallel
      const [standingsRes, roundsRes] = await Promise.all([
        supabase
          .from('league_standings')
          .select('*, clubs(id, name, short_name, primary_color, secondary_color)')
          .eq('season_id', season.id)
          .order('points', { ascending: false })
          .order('goals_for', { ascending: false }),
        supabase
          .from('league_rounds')
          .select(`
            *,
            league_matches(
              id,
              home_club_id,
              away_club_id,
              match_id,
              home_club:clubs!league_matches_home_club_id_fkey(id, name, short_name, primary_color, secondary_color),
              away_club:clubs!league_matches_away_club_id_fkey(id, name, short_name, primary_color, secondary_color)
            )
          `)
          .eq('season_id', season.id)
          .order('round_number', { ascending: true }),
      ]);

      if (standingsRes.data) {
        // Sort: points DESC, goal diff DESC, goals_for DESC
        const sorted = [...standingsRes.data].sort((a: any, b: any) => {
          const diffA = a.goals_for - a.goals_against;
          const diffB = b.goals_for - b.goals_against;
          if (b.points !== a.points) return b.points - a.points;
          if (diffB !== diffA) return diffB - diffA;
          return b.goals_for - a.goals_for;
        });
        setStandings(sorted as any);
      }

      if (roundsRes.data) {
        // For each league_match, fetch the associated match scores if match_id exists
        const roundsWithScores = await Promise.all(
          roundsRes.data.map(async (round: any) => {
            const matchesWithScores = await Promise.all(
              (round.league_matches || []).map(async (lm: any) => {
                if (lm.match_id) {
                  const { data: matchData } = await supabase
                    .from('matches')
                    .select('home_score, away_score, status')
                    .eq('id', lm.match_id)
                    .single();
                  return { ...lm, match: matchData };
                }
                return { ...lm, match: null };
              })
            );
            return { ...round, league_matches: matchesWithScores };
          })
        );
        setRounds(roundsWithScores as any);

        // Select the current or most recent round by default
        const current = roundsWithScores.find((r: any) => r.status === 'in_progress')
          || roundsWithScores.find((r: any) => r.status === 'scheduled')
          || roundsWithScores[roundsWithScores.length - 1];
        if (current) setSelectedRound(current.id);
      }
    } catch (err) {
      console.error('Error fetching league data:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="text-xs">Agendado</Badge>;
      case 'in_progress':
        return <Badge className="bg-pitch text-white text-xs animate-pulse">Ao Vivo</Badge>;
      case 'finished':
        return <Badge variant="secondary" className="text-xs">Finalizado</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  }

  const activeRound = rounds.find(r => r.id === selectedRound);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation bar */}
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-tactical" />
              <h1 className="font-display text-lg font-bold">{leagueName || 'Liga'}</h1>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">Temporada {seasonNumber}</span>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="standings">Classificação</TabsTrigger>
            <TabsTrigger value="rounds">Rodadas</TabsTrigger>
          </TabsList>

          {/* Classificação tab */}
          <TabsContent value="standings">
            <div className="stat-card overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Clube</th>
                    <th className="text-center">P</th>
                    <th className="text-center">V</th>
                    <th className="text-center">E</th>
                    <th className="text-center">D</th>
                    <th className="text-center">GP</th>
                    <th className="text-center">GC</th>
                    <th className="text-center">SG</th>
                    <th className="text-center">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s: any, i: number) => {
                    const club = s.clubs;
                    const gd = s.goals_for - s.goals_against;
                    const total = standings.length;
                    const isTop4 = i < 4;
                    const isBottom4 = i >= total - 4 && total > 8;

                    return (
                      <tr
                        key={s.id}
                        className={
                          isTop4
                            ? 'bg-green-500/10 border-l-2 border-l-green-500'
                            : isBottom4
                            ? 'bg-red-500/10 border-l-2 border-l-red-500'
                            : ''
                        }
                      >
                        <td className="font-display font-bold text-center">{i + 1}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: club?.primary_color, color: club?.secondary_color }}
                            >
                              {club?.short_name}
                            </div>
                            <span className="font-medium text-sm">{club?.name}</span>
                          </div>
                        </td>
                        <td className="text-center">{s.played}</td>
                        <td className="text-center text-pitch font-semibold">{s.won}</td>
                        <td className="text-center">{s.drawn}</td>
                        <td className="text-center text-destructive">{s.lost}</td>
                        <td className="text-center">{s.goals_for}</td>
                        <td className="text-center">{s.goals_against}</td>
                        <td className="text-center font-semibold">
                          {gd > 0 ? `+${gd}` : gd}
                        </td>
                        <td className="text-center font-display text-lg font-bold">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {standings.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  Nenhum dado de classificação disponível.
                </p>
              )}
            </div>

            {/* Legend */}
            {standings.length > 0 && (
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500" />
                  <span>Zona de classificação</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500" />
                  <span>Zona de rebaixamento</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Rodadas tab */}
          <TabsContent value="rounds" className="space-y-4">
            {/* Round selector */}
            <div className="overflow-x-auto pb-2" ref={roundsRef}>
              <div className="flex gap-2 min-w-max">
                {rounds.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRound(r.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedRound === r.id
                        ? 'bg-tactical text-white'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                  >
                    Rodada {r.round_number}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected round details */}
            {activeRound && (
              <div className="stat-card space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-display font-semibold">
                      Rodada {activeRound.round_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {new Date(activeRound.scheduled_at).toLocaleDateString('pt-BR')}
                    </span>
                    {getStatusBadge(activeRound.status)}
                  </div>
                </div>

                <div className="divide-y">
                  {activeRound.league_matches.map((lm: any) => {
                    const homeClub = lm.home_club;
                    const awayClub = lm.away_club;
                    const hasResult = lm.match && lm.match.status === 'finished';
                    const isLive = lm.match && lm.match.status === 'in_progress';

                    return (
                      <div key={lm.id} className="py-3 flex items-center justify-between">
                        {/* Home club */}
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <span className="font-medium text-sm text-right">{homeClub?.name}</span>
                          <div
                            className="h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: homeClub?.primary_color, color: homeClub?.secondary_color }}
                          >
                            {homeClub?.short_name}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="px-4 min-w-[80px] text-center">
                          {hasResult || isLive ? (
                            <span className={`font-display font-bold text-lg ${isLive ? 'text-pitch' : ''}`}>
                              {lm.match.home_score} - {lm.match.away_score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">vs</span>
                          )}
                        </div>

                        {/* Away club */}
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className="h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: awayClub?.primary_color, color: awayClub?.secondary_color }}
                          >
                            {awayClub?.short_name}
                          </div>
                          <span className="font-medium text-sm">{awayClub?.name}</span>
                        </div>
                      </div>
                    );
                  })}

                  {activeRound.league_matches.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      Nenhuma partida nesta rodada.
                    </p>
                  )}
                </div>
              </div>
            )}

            {rounds.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nenhuma rodada disponível.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
