import { useEffect, useState, useRef, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { Trophy, Calendar, Loader2, Users, Pencil, BarChart3, Shield, Swords, Award, ArrowLeft } from 'lucide-react';

// Wrapper: uses ManagerLayout if logged in as manager, otherwise a simple public layout
function LeagueLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (playerProfile) return <AppLayout>{children}</AppLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Trophy className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">Liga</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

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

interface AvailableClub {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  city: string | null;
  stadiums: { id: string; name: string }[];
}

const PRESET_COLORS = [
  '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
  '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
];

export default function LeaguePage() {
  const { user, managerProfile, club, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [leagueName, setLeagueName] = useState('');
  const [seasonNumber, setSeasonNumber] = useState(0);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const roundsRef = useRef<HTMLDivElement>(null);

  // Available teams state
  const [availableClubs, setAvailableClubs] = useState<AvailableClub[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<AvailableClub | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [clubName, setClubName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1a5276');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');
  const [cityName, setCityName] = useState('');
  const [stadiumName, setStadiumName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Statistics state
  const [topScorers, setTopScorers] = useState<{ participant_id: string; player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string; goals: number }[]>([]);
  const [topAssisters, setTopAssisters] = useState<{ participant_id: string; player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string; assists: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [seasonId, setSeasonId] = useState<string | null>(null);

  const isManagerWithoutClub = !!managerProfile && !club;

  useEffect(() => {
    fetchLeagueData();
    if (isManagerWithoutClub) fetchAvailableClubs();
  }, [managerProfile, club]);

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
      setSeasonId(season.id);

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
        // Collect all match IDs across rounds and batch-fetch scores in a single query
        const allMatchIds = roundsRes.data.flatMap(
          (r: any) => r.league_matches?.map((lm: any) => lm.match_id).filter(Boolean) || []
        );

        let scoreMap = new Map<string, { id: string; home_score: number; away_score: number; status: string }>();
        if (allMatchIds.length > 0) {
          const { data: matchScores } = await supabase
            .from('matches')
            .select('id, home_score, away_score, status')
            .in('id', allMatchIds);
          scoreMap = new Map((matchScores || []).map((m: any) => [m.id, m]));
        }

        // Join scores locally
        const roundsWithScores = roundsRes.data.map((round: any) => ({
          ...round,
          league_matches: (round.league_matches || []).map((lm: any) => ({
            ...lm,
            match: lm.match_id ? scoreMap.get(lm.match_id) || null : null,
          })),
        }));
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

  async function fetchAvailableClubs() {
    const { data } = await supabase
      .from('clubs')
      .select('id, name, short_name, primary_color, secondary_color, city, stadiums(id, name)')
      .eq('is_bot_managed', true)
      .not('league_id', 'is', null);
    setAvailableClubs((data as any) || []);
  }

  async function fetchStatistics() {
    if (!seasonId || statsLoaded) return;
    setStatsLoading(true);
    try {
      // Get all league match IDs for this season
      const { data: leagueMatches } = await supabase
        .from('league_matches')
        .select('match_id, league_rounds!inner(season_id)')
        .eq('league_rounds.season_id', seasonId)
        .not('match_id', 'is', null);

      if (!leagueMatches || leagueMatches.length === 0) {
        setStatsLoaded(true);
        setStatsLoading(false);
        return;
      }

      const matchIds = leagueMatches.map((lm: any) => lm.match_id).filter(Boolean);

      // Fetch all goal events for these matches
      const { data: goalEvents } = await supabase
        .from('match_event_logs')
        .select('payload, match_id')
        .eq('event_type', 'goal')
        .in('match_id', matchIds);

      if (!goalEvents || goalEvents.length === 0) {
        setStatsLoaded(true);
        setStatsLoading(false);
        return;
      }

      // Aggregate scorers and assisters, collecting names from payload
      const scorerMap: Record<string, number> = {};
      const assisterMap: Record<string, number> = {};
      const participantIds = new Set<string>();
      const payloadNames: Record<string, string> = {}; // pid → name from payload
      const participantClubIds: Record<string, string> = {}; // pid → club_id from payload

      for (const ev of goalEvents) {
        const payload = ev.payload as any;
        if (!payload) continue;
        if (payload.scorer_participant_id) {
          scorerMap[payload.scorer_participant_id] = (scorerMap[payload.scorer_participant_id] || 0) + 1;
          participantIds.add(payload.scorer_participant_id);
          if (payload.scorer_name) payloadNames[payload.scorer_participant_id] = payload.scorer_name;
          if (payload.scorer_club_id) participantClubIds[payload.scorer_participant_id] = payload.scorer_club_id;
        }
        if (payload.assister_participant_id) {
          assisterMap[payload.assister_participant_id] = (assisterMap[payload.assister_participant_id] || 0) + 1;
          participantIds.add(payload.assister_participant_id);
          if (payload.assister_name) payloadNames[payload.assister_participant_id] = payload.assister_name;
        }
      }

      if (participantIds.size === 0) {
        setStatsLoaded(true);
        setStatsLoading(false);
        return;
      }

      // Fetch participant details (player name via player_profile_id, club)
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select('id, club_id, player_profile_id, player_profiles(full_name), clubs(name, short_name, primary_color, secondary_color)')
        .in('id', Array.from(participantIds));

      // Also fetch club info for participants without club join (e.g. via scorer_club_id)
      const allClubIds = new Set<string>();
      for (const p of (participantsData || [])) {
        if (p.club_id) allClubIds.add(p.club_id);
      }
      for (const cid of Object.values(participantClubIds)) {
        allClubIds.add(cid);
      }
      const { data: clubsData } = allClubIds.size > 0
        ? await supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').in('id', Array.from(allClubIds))
        : { data: [] };
      const clubLookup: Record<string, any> = {};
      for (const c of (clubsData || [])) clubLookup[c.id] = c;

      // Build lookup: prefer payload name → then player_profiles.full_name → then 'Jogador'
      const participantLookup: Record<string, { player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string }> = {};
      for (const p of (participantsData || [])) {
        const profile = p.player_profiles as any;
        const clubData = (p.clubs as any) || clubLookup[p.club_id] || clubLookup[participantClubIds[p.id]];
        const name = payloadNames[p.id] || profile?.full_name || null;
        participantLookup[p.id] = {
          player_name: name || 'Jogador',
          club_name: clubData?.name || '',
          club_short_name: clubData?.short_name || '',
          club_primary_color: clubData?.primary_color || '#333',
          club_secondary_color: clubData?.secondary_color || '#fff',
        };
      }

      // For participants not in DB (edge case), use payload info
      for (const pid of participantIds) {
        if (!participantLookup[pid]) {
          const clubId = participantClubIds[pid];
          const clubData = clubId ? clubLookup[clubId] : null;
          participantLookup[pid] = {
            player_name: payloadNames[pid] || 'Jogador',
            club_name: clubData?.name || '',
            club_short_name: clubData?.short_name || '',
            club_primary_color: clubData?.primary_color || '#333',
            club_secondary_color: clubData?.secondary_color || '#fff',
          };
        }
      }

      // Build sorted lists — top 5
      const scorers = Object.entries(scorerMap)
        .map(([pid, goals]) => ({ participant_id: pid, goals, ...participantLookup[pid] }))
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 5);

      const assisters = Object.entries(assisterMap)
        .map(([pid, assists]) => ({ participant_id: pid, assists, ...participantLookup[pid] }))
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 5);

      setTopScorers(scorers);
      setTopAssisters(assisters);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    } finally {
      setStatsLoading(false);
      setStatsLoaded(true);
    }
  }

  function openCustomize(club: AvailableClub) {
    setSelectedTeam(club);
    setClubName(club.name);
    setShortName(club.short_name);
    setPrimaryColor(club.primary_color);
    setSecondaryColor(club.secondary_color);
    setCityName(club.city || '');
    setStadiumName(club.stadiums?.[0]?.name || '');
    setCustomizeOpen(true);
  }

  async function handleAssumeTeam() {
    if (!selectedTeam || !managerProfile) return;
    setSubmitting(true);
    try {
      // Update club with manager info
      const { error: clubError } = await supabase
        .from('clubs')
        .update({
          manager_profile_id: managerProfile.id,
          name: clubName.trim(),
          short_name: shortName.trim().toUpperCase(),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          city: cityName.trim() || null,
          is_bot_managed: false,
        })
        .eq('id', selectedTeam.id);
      if (clubError) throw clubError;

      // Update stadium name if changed
      const originalStadium = selectedTeam.stadiums?.[0];
      if (originalStadium && stadiumName.trim() !== originalStadium.name) {
        await supabase.from('stadiums')
          .update({ name: stadiumName.trim() })
          .eq('id', originalStadium.id);
      }

      await refreshManagerProfile();
      toast.success('Time assumido com sucesso!');
      setCustomizeOpen(false);
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao assumir time');
    } finally {
      setSubmitting(false);
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
      <LeagueLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </LeagueLayout>
    );
  }

  return (
    <LeagueLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-tactical" />
            <h1 className="font-display text-2xl font-bold">{leagueName || 'Liga'}</h1>
          </div>
          <span className="text-sm text-muted-foreground">Temporada {seasonNumber}</span>
        </div>
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList className={`grid w-full ${isManagerWithoutClub ? 'grid-cols-4' : 'grid-cols-3'} max-w-lg`}>
            <TabsTrigger value="standings">Classificação</TabsTrigger>
            <TabsTrigger value="rounds">Rodadas</TabsTrigger>
            <TabsTrigger value="stats" onClick={() => fetchStatistics()}>Estatísticas</TabsTrigger>
            {isManagerWithoutClub && (
              <TabsTrigger value="available" className="relative">
                Times
                {availableClubs.length > 0 && (
                  <span className="ml-1.5 bg-pitch text-white text-[10px] rounded-full px-1.5 py-0.5">
                    {availableClubs.length}
                  </span>
                )}
              </TabsTrigger>
            )}
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
                            <Link to={`/club/${club?.id}`} className="font-medium text-sm hover:text-tactical hover:underline transition-colors">{club?.name}</Link>
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
                        <div className="px-4 min-w-[80px] text-center flex flex-col items-center">
                          {hasResult || isLive ? (
                            <>
                              <span className={`font-display font-bold text-lg ${isLive ? 'text-pitch animate-pulse' : ''}`}>
                                {lm.match.home_score} - {lm.match.away_score}
                              </span>
                              {isLive && lm.match_id && (
                                <Link to={`/match/${lm.match_id}`} className="text-[10px] font-display font-bold text-pitch hover:text-pitch/80 transition-colors mt-0.5">
                                  AO VIVO — Assistir
                                </Link>
                              )}
                              {hasResult && lm.match_id && (
                                <Link to={`/match/${lm.match_id}`} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                                  Ver Resultado
                                </Link>
                              )}
                            </>
                          ) : lm.match_id ? (
                            <Link to={`/match/${lm.match_id}`} className="text-muted-foreground text-sm hover:text-pitch transition-colors">
                              Entrar
                            </Link>
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
          {/* Estatísticas tab */}
          <TabsContent value="stats" className="space-y-6">
            {statsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !statsLoaded || (topScorers.length === 0 && topAssisters.length === 0) ? (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">Dados disponíveis após próximos jogos</p>
                <p className="text-xs text-muted-foreground mt-1">
                  As estatísticas detalhadas serão exibidas conforme as partidas forem jogadas.
                </p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                {standings.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(() => {
                      const bestAttack = [...standings].sort((a, b) => b.goals_for - a.goals_for)[0];
                      const bestDefense = [...standings].sort((a, b) => a.goals_against - b.goals_against)[0];
                      const mostWins = [...standings].sort((a, b) => b.won - a.won)[0];
                      return (
                        <>
                          <div className="stat-card flex items-center gap-3 p-4">
                            <div className="p-2 rounded-lg bg-green-500/10">
                              <Swords className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Melhor Ataque</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                  className="h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                  style={{ backgroundColor: bestAttack.clubs?.primary_color, color: bestAttack.clubs?.secondary_color }}
                                >
                                  {bestAttack.clubs?.short_name}
                                </div>
                                <span className="font-display font-bold text-sm">{bestAttack.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{bestAttack.goals_for} gols</p>
                            </div>
                          </div>
                          <div className="stat-card flex items-center gap-3 p-4">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                              <Shield className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Melhor Defesa</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                  className="h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                  style={{ backgroundColor: bestDefense.clubs?.primary_color, color: bestDefense.clubs?.secondary_color }}
                                >
                                  {bestDefense.clubs?.short_name}
                                </div>
                                <span className="font-display font-bold text-sm">{bestDefense.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{bestDefense.goals_against} gols sofridos</p>
                            </div>
                          </div>
                          <div className="stat-card flex items-center gap-3 p-4">
                            <div className="p-2 rounded-lg bg-yellow-500/10">
                              <Award className="h-5 w-5 text-yellow-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Mais Vitórias</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                  className="h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                  style={{ backgroundColor: mostWins.clubs?.primary_color, color: mostWins.clubs?.secondary_color }}
                                >
                                  {mostWins.clubs?.short_name}
                                </div>
                                <span className="font-display font-bold text-sm">{mostWins.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{mostWins.won} vitórias</p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Top Scorers */}
                {topScorers.length > 0 && (
                  <div className="stat-card overflow-x-auto">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <Trophy className="h-4 w-4 text-tactical" />
                      <h3 className="font-display font-bold text-sm">Artilharia</h3>
                    </div>
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th className="w-8">#</th>
                          <th>Jogador</th>
                          <th className="w-10"></th>
                          <th className="text-center w-16">Gols</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topScorers.map((s, i) => (
                          <tr key={s.participant_id}>
                            <td className="font-display font-bold text-center">{i + 1}</td>
                            <td>
                              <span className="font-medium text-sm">{s.player_name}</span>
                            </td>
                            <td>
                              <div
                                className="h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                style={{ backgroundColor: s.club_primary_color, color: s.club_secondary_color }}
                              >
                                {s.club_short_name}
                              </div>
                            </td>
                            <td className="text-center font-display text-lg font-bold">{s.goals}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Top Assists */}
                {topAssisters.length > 0 && (
                  <div className="stat-card overflow-x-auto">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <Users className="h-4 w-4 text-tactical" />
                      <h3 className="font-display font-bold text-sm">Assistências</h3>
                    </div>
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th className="w-8">#</th>
                          <th>Jogador</th>
                          <th className="w-10"></th>
                          <th className="text-center w-16">Assist.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topAssisters.map((a, i) => (
                          <tr key={a.participant_id}>
                            <td className="font-display font-bold text-center">{i + 1}</td>
                            <td>
                              <span className="font-medium text-sm">{a.player_name}</span>
                            </td>
                            <td>
                              <div
                                className="h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                                style={{ backgroundColor: a.club_primary_color, color: a.club_secondary_color }}
                              >
                                {a.club_short_name}
                              </div>
                            </td>
                            <td className="text-center font-display text-lg font-bold">{a.assists}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Times Disponíveis tab */}
          {isManagerWithoutClub && (
            <TabsContent value="available" className="space-y-4">
              {availableClubs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableClubs.map((ac) => (
                    <div key={ac.id} className="stat-card flex flex-col items-center text-center gap-3 p-4">
                      <div
                        className="h-14 w-14 rounded-lg flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: ac.primary_color, color: ac.secondary_color }}
                      >
                        {ac.short_name}
                      </div>
                      <div>
                        <h3 className="font-display font-bold">{ac.name}</h3>
                        {ac.city && <p className="text-xs text-muted-foreground">{ac.city}</p>}
                      </div>
                      <Button
                        onClick={() => openCustomize(ac)}
                        className="w-full bg-tactical hover:bg-tactical/90 text-white"
                        size="sm"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Assumir Time
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Nenhum time disponível no momento.</p>
                  <p className="text-xs text-muted-foreground mt-1">Você será notificado quando houver vagas.</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Customize team dialog */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Personalizar Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Badge preview */}
            <div className="flex justify-center">
              <div
                className="h-16 w-16 rounded-lg flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: primaryColor, color: secondaryColor }}
              >
                {shortName.toUpperCase() || '???'}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome do Time</Label>
              <Input value={clubName} onChange={e => setClubName(e.target.value)} maxLength={40} />
            </div>

            <div className="space-y-2">
              <Label>Abreviação (3 letras)</Label>
              <Input value={shortName} onChange={e => setShortName(e.target.value.slice(0, 3).toUpperCase())} maxLength={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cor Principal</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      className={`h-6 w-6 rounded-full border-2 ${primaryColor === c ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setPrimaryColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor Secundária</Label>
                <div className="flex flex-wrap gap-1.5">
                  {['#FFFFFF', '#000000', '#FFD700', '#FF6347', '#00FA9A', '#FF4500'].map(c => (
                    <button
                      key={c}
                      className={`h-6 w-6 rounded-full border-2 ${secondaryColor === c ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setSecondaryColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={cityName} onChange={e => setCityName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Nome do Estádio</Label>
              <Input value={stadiumName} onChange={e => setStadiumName(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizeOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleAssumeTeam}
              disabled={submitting || !clubName.trim() || shortName.trim().length !== 3}
              className="bg-pitch hover:bg-pitch/90 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LeagueLayout>
  );
}
