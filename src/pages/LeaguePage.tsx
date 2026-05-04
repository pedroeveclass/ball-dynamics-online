import { useEffect, useState, useRef, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { RoundRecapCard } from '@/components/league/RoundRecapCard';
import { SeasonRecapView } from '@/components/league/SeasonRecapView';
import { RoundMvpVoteCard } from '@/components/league/RoundMvpVoteCard';
import { SeasonAwardsCard } from '@/components/league/SeasonAwardsCard';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { Trophy, Calendar, Loader2, Users, Pencil, BarChart3, Shield, Swords, Award, ArrowLeft, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatBRTDateTime, formatBRTTimeOnly, getNextClubMatch, type NextClubMatch } from '@/lib/upcomingMatches';
import { formatLeagueName } from '@/lib/leagueName';
import { formatBRL } from '@/lib/formatting';
import { Bot, User as UserIcon } from 'lucide-react';
import { LeagueIntroTour } from '@/components/tour/LeagueIntroTour';
import { ManagerLeagueIntroTour } from '@/components/tour/ManagerLeagueIntroTour';

// Wrapper: uses ManagerLayout if logged in as manager, otherwise a simple public layout
function LeagueLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
  const { t } = useTranslation('league');
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
          <span className="font-display text-lg font-bold">{t('title_fallback')}</span>
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

interface JoinableClub {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url: string | null;
  city: string | null;
  is_bot_managed: boolean;
  manager_profile_id: string | null;
  human_count: number;
}

// Free-agent default contract when a player auto-signs with a bot-managed
// team. Matches the placeholder values used in the manager-side offer dialog
// so a manual offer would land in the same neighborhood.
const FREE_AGENT_DEFAULT_SALARY = 500;
const FREE_AGENT_DEFAULT_CLAUSE = 5000;
const FREE_AGENT_DEFAULT_MONTHS = 12;

const PRESET_COLORS = [
  '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
  '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
];

export default function LeaguePage() {
  const { user, managerProfile, playerProfile, club, refreshManagerProfile, refreshPlayerProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('league');
  const { t: tNarratives } = useTranslation('narratives');
  const [loading, setLoading] = useState(true);
  // The viewer's next league fixture — used both for the "Próximo Jogo"
  // highlight on the rounds list and to auto-scroll to that round.
  const [nextMatch, setNextMatch] = useState<NextClubMatch | null>(null);
  // Viewer's club ID: managers get it from `club`, players from their profile.
  const viewerClubId = club?.id || playerProfile?.club_id || null;
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
  const [topScorers, setTopScorers] = useState<{ participant_id: string; player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string; goals: number; minutes_played: number; appearance?: any }[]>([]);
  const [topAssisters, setTopAssisters] = useState<{ participant_id: string; player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string; assists: number; minutes_played: number; appearance?: any }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<string | null>(null);
  // Inter-season banner info — populated when the latest finished season has
  // a successor in 'scheduled' state. Days 0-6 since finish: display the
  // finished one + countdown to next. Days 7+: display the scheduled one +
  // "view previous recap" link.
  const [seasonBanner, setSeasonBanner] = useState<
    | { kind: 'countdown'; daysToSwap: number; daysToFirstMatch: number; nextSeasonNumber: number }
    | { kind: 'view_recap'; previousSeasonId: string; previousSeasonNumber: number; daysToFirstMatch: number }
    | null
  >(null);
  const [scorersExpanded, setScorersExpanded] = useState(false);
  const [assistsExpanded, setAssistsExpanded] = useState(false);
  const SCORERS_PREVIEW_COUNT = 5;

  const isManagerWithoutClub = !!managerProfile && !club;
  // Free-agent player: shown the league teams list with "join bot team" CTAs.
  const isPlayerFreeAgent = !!playerProfile && !playerProfile.club_id;
  // Lets /player/club send free agents straight to the join tab via
  // ?tab=join. Falls back to the Standings tab for everyone else.
  const [searchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const initialTab = tabFromQuery === 'join' && isPlayerFreeAgent
    ? 'join'
    : tabFromQuery === 'available' && isManagerWithoutClub
      ? 'available'
      : searchParams.get('round')
        ? 'rounds'
        : tabFromQuery === 'recap'
          ? 'recap'
          : seasonStatus === 'finished'
            ? 'recap' // a finished season defaults to its recap tab
            : 'standings';

  // Player join flow state
  const [joinableClubs, setJoinableClubs] = useState<JoinableClub[]>([]);
  const [joinTarget, setJoinTarget] = useState<JoinableClub | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchLeagueData();
    if (isManagerWithoutClub) fetchAvailableClubs();
    if (isPlayerFreeAgent) fetchJoinableClubs();
  }, [managerProfile, club, playerProfile?.id, playerProfile?.club_id]);

  // Look up the viewer's next league match so we can highlight it
  // inside the rounds list and optionally auto-select that round.
  useEffect(() => {
    let cancelled = false;
    if (!viewerClubId) { setNextMatch(null); return; }
    getNextClubMatch(viewerClubId).then(res => {
      if (!cancelled) setNextMatch(res);
    });
    return () => { cancelled = true; };
  }, [viewerClubId]);

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

      // 2. Get the two most recent seasons so we can run the inter-season
      // gap logic: when the latest is 'scheduled' (auto-created) and the
      // previous is 'finished', the first 7 days continue to display the
      // old season + a countdown banner; afterwards we flip to the new
      // one + a "view previous recap" pointer.
      const seasonOverride = searchParams.get('season');
      const { data: recentSeasons } = await supabase
        .from('league_seasons')
        .select('id, season_number, status, finished_at, next_season_at')
        .eq('league_id', league.id)
        .order('season_number', { ascending: false })
        .limit(2);

      if (!recentSeasons || recentSeasons.length === 0) { setLoading(false); return; }
      const latestSeason: any = recentSeasons[0];
      const previousSeason: any = recentSeasons[1] ?? null;

      let displayed: any = latestSeason;
      let banner: typeof seasonBanner = null;
      const ONE_DAY = 24 * 60 * 60 * 1000;

      // Explicit ?season=<id> override always wins (used by the "view recap"
      // link from the gap-window banner). Banner stays null in that case so
      // the user isn't pointed back at themselves.
      const overrideMatch = seasonOverride
        ? recentSeasons.find((s: any) => s.id === seasonOverride)
        : null;

      if (overrideMatch) {
        displayed = overrideMatch;
      } else if (
        latestSeason.status === 'scheduled' &&
        previousSeason?.status === 'finished' &&
        previousSeason.finished_at
      ) {
        const finishedAt = new Date(previousSeason.finished_at).getTime();
        const nextStartAt = previousSeason.next_season_at
          ? new Date(previousSeason.next_season_at).getTime()
          : finishedAt + 14 * ONE_DAY;
        const daysSinceFinish = (Date.now() - finishedAt) / ONE_DAY;
        const daysToFirstMatch = Math.max(0, Math.ceil((nextStartAt - Date.now()) / ONE_DAY));

        if (daysSinceFinish < 7) {
          displayed = previousSeason;
          banner = {
            kind: 'countdown',
            daysToSwap: Math.max(1, Math.ceil(7 - daysSinceFinish)),
            daysToFirstMatch,
            nextSeasonNumber: latestSeason.season_number,
          };
        } else {
          displayed = latestSeason;
          banner = {
            kind: 'view_recap',
            previousSeasonId: previousSeason.id,
            previousSeasonNumber: previousSeason.season_number,
            daysToFirstMatch,
          };
        }
      }

      setSeasonNumber(displayed.season_number);
      setSeasonId(displayed.id);
      setSeasonStatus(displayed.status ?? null);
      setSeasonBanner(banner);

      const season = displayed;

      // 3. Fetch standings and rounds in parallel
      const [standingsRes, roundsRes] = await Promise.all([
        supabase
          .from('league_standings')
          .select('*, clubs(id, name, short_name, primary_color, secondary_color, crest_url)')
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
              home_club:clubs!league_matches_home_club_id_fkey(id, name, short_name, primary_color, secondary_color, crest_url),
              away_club:clubs!league_matches_away_club_id_fkey(id, name, short_name, primary_color, secondary_color, crest_url)
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

        // Select round: explicit ?round=ID query (e.g. from MVP notification),
        // falling back to current → upcoming → most recent.
        const roundFromQuery = searchParams.get('round');
        const queryMatch = roundFromQuery
          ? roundsWithScores.find((r: any) => r.id === roundFromQuery)
          : null;
        const current = queryMatch
          || roundsWithScores.find((r: any) => r.status === 'in_progress')
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
      .select('id, name, short_name, primary_color, secondary_color, crest_url, city, stadiums(id, name)')
      .eq('is_bot_managed', true)
      .not('league_id', 'is', null);
    setAvailableClubs((data as any) || []);
  }

  // Player flow: list every league club so a free agent can pick one. Bot
  // teams sign on the spot; human-managed teams just deep-link to the public
  // page so the manager can send an offer. Each card also surfaces how many
  // human players currently sit in the squad so free agents can prefer
  // populated teams.
  async function fetchJoinableClubs() {
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name, short_name, primary_color, secondary_color, crest_url, city, is_bot_managed, manager_profile_id')
      .not('league_id', 'is', null)
      .order('name');
    const ids = (clubs || []).map((c: any) => c.id);
    let humanByClub = new Map<string, number>();
    if (ids.length > 0) {
      // Pull all human-controlled rosters in a single query, then tally.
      // RLS allows reading other clubs' human roster size (per project memory
      // "teammate_visibility": same-club opens attrs, but counts are public).
      const { data: humans } = await supabase
        .from('player_profiles')
        .select('club_id')
        .in('club_id', ids)
        .not('user_id', 'is', null);
      for (const row of (humans || [])) {
        const k = row.club_id as string;
        humanByClub.set(k, (humanByClub.get(k) ?? 0) + 1);
      }
    }
    const enriched = (clubs || []).map((c: any) => ({
      ...c,
      human_count: humanByClub.get(c.id) ?? 0,
    }));
    setJoinableClubs(enriched as JoinableClub[]);
  }

  async function handleJoinBotTeam() {
    if (!joinTarget || !playerProfile || !user) return;
    if (!joinTarget.is_bot_managed) {
      toast.error(t('join.toast_human_team'));
      return;
    }
    if (playerProfile.club_id) {
      toast.error(t('join.toast_already_in_club'));
      return;
    }
    setJoining(true);
    try {
      // transfer_player handles: terminate any active contract (none for a
      // free agent), create the new contract, assign jersey, set club_id,
      // update wage bill — all atomically.
      const { error } = await supabase.rpc('transfer_player' as any, {
        p_player_id: playerProfile.id,
        p_new_club_id: joinTarget.id,
        p_old_contract_id: '00000000-0000-0000-0000-000000000000',
        p_new_salary: FREE_AGENT_DEFAULT_SALARY,
        p_new_release_clause: FREE_AGENT_DEFAULT_CLAUSE,
        p_contract_months: FREE_AGENT_DEFAULT_MONTHS,
      });
      if (error) throw error;

      // Append the closing paragraph to the player's origin story.
      // No-op (idempotent) on subsequent signings — only the first
      // first contract triggers the new "now at {club}" sentence.
      try {
        const { buildOriginStoryClosingBilingual } = await import('@/lib/narratives/originStory');
        const { closing_pt, closing_en } = buildOriginStoryClosingBilingual(joinTarget.name);
        await (supabase as any).rpc('append_origin_closing', {
          p_player_id: playerProfile.id,
          p_closing_pt: closing_pt,
          p_closing_en: closing_en,
        });
      } catch (e) { console.warn('[origin closing] append failed:', e); }

      // Best-fit slot in the starting XI + first-human-as-assistant promotion.
      // Failures here are non-fatal — the contract is already signed; the
      // user can re-arrange later.
      const { data: placeRes, error: placeErr } = await supabase.rpc('auto_place_after_signing' as any, {
        p_player_id: playerProfile.id,
        p_club_id: joinTarget.id,
      });
      if (placeErr) console.warn('[JOIN BOT TEAM] auto_place failed:', placeErr);

      const placed = (placeRes as any)?.placed === true;
      const assistantAssigned = (placeRes as any)?.assistant_assigned === true;
      // Tailor the toast: signed + (optional) starter + (optional) assistant.
      let msg = t('join.toast_signed', { club: joinTarget.name });
      if (placed) msg += ' ' + t('join.toast_placed_starter', { defaultValue: 'Você entrou no time titular.' });
      if (assistantAssigned) msg += ' ' + t('join.toast_assistant', { defaultValue: 'Você é o assistente do clube agora.' });
      toast.success(msg);
      setJoinTarget(null);
      await refreshPlayerProfile();
      navigate('/player/club');
    } catch (err: any) {
      console.error('[JOIN BOT TEAM] error:', err);
      toast.error(err?.message || t('join.toast_error'));
    } finally {
      setJoining(false);
    }
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

      // Fetch all goal events + per-match turn counts + all participants (for minutes tally)
      const [goalEventsRes, matchTurnsRes, allParticipantsRes] = await Promise.all([
        supabase
          .from('match_event_logs')
          .select('payload, match_id')
          .eq('event_type', 'goal')
          .in('match_id', matchIds),
        supabase
          .from('matches')
          .select('id, current_turn_number')
          .in('id', matchIds),
        supabase
          .from('match_participants')
          .select('match_id, player_profile_id')
          .in('match_id', matchIds)
          .not('player_profile_id', 'is', null),
      ]);

      const goalEvents = goalEventsRes.data;

      // Tally minutes_played per player_profile_id.
      // 1 turn ≈ 1 minute of in-game time; use match.current_turn_number as the
      // total turns played per match. No mid-match substitutions exist today,
      // so every participant accrues the full match's turns.
      const matchTurns: Record<string, number> = {};
      for (const m of (matchTurnsRes.data || [])) {
        matchTurns[m.id] = Number(m.current_turn_number || 0);
      }
      const minutesByProfile: Record<string, number> = {};
      for (const p of (allParticipantsRes.data || [])) {
        if (!p.player_profile_id) continue;
        const t = matchTurns[p.match_id] || 0;
        minutesByProfile[p.player_profile_id] = (minutesByProfile[p.player_profile_id] || 0) + t;
      }

      if (!goalEvents || goalEvents.length === 0) {
        setStatsLoaded(true);
        setStatsLoading(false);
        return;
      }

      // Collect participant IDs from goal events so we can resolve
      // them to player_profile_ids (the same player gets a NEW
      // participant_id every match, so we must aggregate by profile).
      const participantIdsFromEvents = new Set<string>();
      const payloadNames: Record<string, string> = {};
      const participantClubIds: Record<string, string> = {};

      for (const ev of goalEvents) {
        const payload = ev.payload as any;
        if (!payload) continue;
        if (payload.scorer_participant_id) {
          participantIdsFromEvents.add(payload.scorer_participant_id);
          if (payload.scorer_name) payloadNames[payload.scorer_participant_id] = payload.scorer_name;
          if (payload.scorer_club_id) participantClubIds[payload.scorer_participant_id] = payload.scorer_club_id;
        }
        if (payload.assister_participant_id) {
          participantIdsFromEvents.add(payload.assister_participant_id);
          if (payload.assister_name) payloadNames[payload.assister_participant_id] = payload.assister_name;
        }
      }

      if (participantIdsFromEvents.size === 0) {
        setStatsLoaded(true);
        setStatsLoading(false);
        return;
      }

      // Resolve participant → player_profile_id + club
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select('id, club_id, player_profile_id, player_profiles(full_name, appearance), clubs(name, short_name, primary_color, secondary_color, crest_url)')
        .in('id', Array.from(participantIdsFromEvents));

      // Map participant_id → player_profile_id
      const pidToProfileId: Record<string, string> = {};
      for (const p of (participantsData || [])) {
        if (p.player_profile_id) pidToProfileId[p.id] = p.player_profile_id;
      }

      // Re-aggregate goals/assists by player_profile_id
      const scorerMap: Record<string, number> = {};
      const assisterMap: Record<string, number> = {};
      const profileParticipantId: Record<string, string> = {}; // profile → any participant (for lookup)

      for (const ev of goalEvents) {
        const payload = ev.payload as any;
        if (!payload) continue;
        if (payload.scorer_participant_id) {
          const profileId = pidToProfileId[payload.scorer_participant_id] || payload.scorer_participant_id;
          scorerMap[profileId] = (scorerMap[profileId] || 0) + 1;
          if (!profileParticipantId[profileId]) profileParticipantId[profileId] = payload.scorer_participant_id;
        }
        if (payload.assister_participant_id) {
          const profileId = pidToProfileId[payload.assister_participant_id] || payload.assister_participant_id;
          assisterMap[profileId] = (assisterMap[profileId] || 0) + 1;
          if (!profileParticipantId[profileId]) profileParticipantId[profileId] = payload.assister_participant_id;
        }
      }

      // Club lookup
      const allClubIds = new Set<string>();
      for (const p of (participantsData || [])) {
        if (p.club_id) allClubIds.add(p.club_id);
      }
      for (const cid of Object.values(participantClubIds)) {
        allClubIds.add(cid);
      }
      const { data: clubsData } = allClubIds.size > 0
        ? await supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').in('id', Array.from(allClubIds))
        : { data: [] };
      const clubLookup: Record<string, any> = {};
      for (const c of (clubsData || [])) clubLookup[c.id] = c;

      // Build lookup by player_profile_id (use the first participant row we found)
      const profileLookup: Record<string, { player_name: string; club_name: string; club_short_name: string; club_primary_color: string; club_secondary_color: string; club_crest_url: string | null; appearance: any }> = {};

      for (const p of (participantsData || [])) {
        const ppId = p.player_profile_id || p.id;
        if (profileLookup[ppId]) continue; // first wins
        const profile = p.player_profiles as any;
        const clubData = (p.clubs as any) || clubLookup[p.club_id] || clubLookup[participantClubIds[p.id]];
        const name = payloadNames[p.id] || profile?.full_name || null;
        profileLookup[ppId] = {
          player_name: name || t('stats.player_fallback'),
          club_name: clubData?.name || '',
          club_short_name: clubData?.short_name || '',
          club_primary_color: clubData?.primary_color || '#333',
          club_secondary_color: clubData?.secondary_color || '#fff',
          club_crest_url: clubData?.crest_url || null,
          appearance: profile?.appearance ?? null,
        };
      }

      // Fallback for profiles not in participantsData
      for (const profileId of [...Object.keys(scorerMap), ...Object.keys(assisterMap)]) {
        if (!profileLookup[profileId]) {
          const anyPid = profileParticipantId[profileId];
          const clubId = anyPid ? participantClubIds[anyPid] : undefined;
          const clubData = clubId ? clubLookup[clubId] : null;
          profileLookup[profileId] = {
            player_name: anyPid ? (payloadNames[anyPid] || t('stats.player_fallback')) : t('stats.player_fallback'),
            club_name: clubData?.name || '',
            club_short_name: clubData?.short_name || '',
            club_primary_color: clubData?.primary_color || '#333',
            club_secondary_color: clubData?.secondary_color || '#fff',
            club_crest_url: clubData?.crest_url || null,
            appearance: null,
          };
        }
      }

      // Build sorted lists. Tiebreakers: minutes_played ASC (less = better),
      // then alphabetical name ASC. Full lists; UI slices for the preview.
      const scorers = Object.entries(scorerMap)
        .map(([profileId, goals]) => ({
          participant_id: profileId,
          goals,
          minutes_played: minutesByProfile[profileId] || 0,
          ...profileLookup[profileId],
        }))
        .sort((a, b) => {
          if (b.goals !== a.goals) return b.goals - a.goals;
          if (a.minutes_played !== b.minutes_played) return a.minutes_played - b.minutes_played;
          return (a.player_name || '').localeCompare(b.player_name || '');
        });

      const assisters = Object.entries(assisterMap)
        .map(([profileId, assists]) => ({
          participant_id: profileId,
          assists,
          minutes_played: minutesByProfile[profileId] || 0,
          ...profileLookup[profileId],
        }))
        .sort((a, b) => {
          if (b.assists !== a.assists) return b.assists - a.assists;
          if (a.minutes_played !== b.minutes_played) return a.minutes_played - b.minutes_played;
          return (a.player_name || '').localeCompare(b.player_name || '');
        });

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
      // Atomic takeover via SECURITY DEFINER RPC. The previous flow did
      // two client-side UPDATEs (clubs + stadiums) and the stadium one
      // failed silently against RLS — see assume_bot_team migration note.
      const { error } = await supabase.rpc('assume_bot_team' as any, {
        p_club_id: selectedTeam.id,
        p_manager_profile_id: managerProfile.id,
        p_club_name: clubName.trim(),
        p_short_name: shortName.trim().toUpperCase(),
        p_primary_color: primaryColor,
        p_secondary_color: secondaryColor,
        p_city: cityName.trim() || null,
        p_stadium_name: stadiumName.trim() || null,
      });
      if (error) throw error;

      await refreshManagerProfile();
      toast.success(t('toast.assumed_ok'));
      setCustomizeOpen(false);
      navigate('/manager', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('toast.assume_error'));
    } finally {
      setSubmitting(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="text-xs">{t('status.scheduled')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-pitch text-white text-xs animate-pulse">{t('status.live')}</Badge>;
      case 'finished':
        return <Badge variant="secondary" className="text-xs">{t('status.finished')}</Badge>;
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
            <h1 className="font-display text-2xl font-bold">{leagueName ? formatLeagueName(leagueName) : t('title_fallback')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/league/hall-of-fame" className="text-xs text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-1 font-display font-bold">
              <Trophy className="h-3.5 w-3.5" />
              {t('hallOfFame.title')}
            </Link>
            <span className="text-sm text-muted-foreground">{t('season', { n: seasonNumber })}</span>
          </div>
        </div>
        {seasonBanner?.kind === 'countdown' && (
          <div className="rounded-md border border-tactical/40 bg-tactical/10 px-3 py-2 flex items-start gap-2 text-sm">
            <Calendar className="h-4 w-4 text-tactical shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold">
                {t('seasonGap.countdown_title', {
                  n: seasonBanner.nextSeasonNumber,
                  days: seasonBanner.daysToFirstMatch,
                  defaultValue: 'Temporada {{n}} começa em {{days}} dias',
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('seasonGap.countdown_subtitle', {
                  defaultValue: 'Você está vendo o resumo da temporada anterior. A nova classificação aparece automaticamente.',
                })}
              </p>
            </div>
          </div>
        )}
        {seasonBanner?.kind === 'view_recap' && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-sm">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-display font-semibold">
                {t('seasonGap.view_recap_title', {
                  n: seasonBanner.previousSeasonNumber,
                  days: seasonBanner.daysToFirstMatch,
                  defaultValue: 'Nova temporada começa em {{days}} dias',
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                <Link
                  to={`/league?season=${seasonBanner.previousSeasonId}&tab=recap`}
                  className="text-amber-600 hover:underline font-display font-semibold"
                >
                  {t('seasonGap.view_recap_link', {
                    n: seasonBanner.previousSeasonNumber,
                    defaultValue: 'Ver resumo da Temporada {{n}} →',
                  })}
                </Link>
              </p>
            </div>
          </div>
        )}
        <Tabs defaultValue={initialTab} className="space-y-4">
          <LeagueIntroTour enabled={isPlayerFreeAgent && tabFromQuery === 'join' && joinableClubs.length > 0} />
          <ManagerLeagueIntroTour enabled={!!managerProfile} isManagerWithoutClub={isManagerWithoutClub} />
          <TabsList data-tour="league-tabs" className={`grid w-full ${
            (() => {
              let n = 3;
              if (isManagerWithoutClub || isPlayerFreeAgent) n += 1;
              if (seasonStatus === 'finished' && seasonId) n += 1;
              return `grid-cols-${n}`;
            })()
          } max-w-2xl`}>
            {seasonStatus === 'finished' && seasonId && (
              <TabsTrigger value="recap" className="bg-tactical/10 data-[state=active]:bg-tactical data-[state=active]:text-tactical-foreground">
                {tNarratives('seasonRecap.tab_label', { defaultValue: 'Resumo' })}
              </TabsTrigger>
            )}
            <TabsTrigger data-tour="league-tab-standings" value="standings">{t('tabs.standings')}</TabsTrigger>
            <TabsTrigger data-tour="league-tab-rounds" value="rounds">{t('tabs.rounds')}</TabsTrigger>
            <TabsTrigger data-tour="league-tab-stats" value="stats" onClick={() => fetchStatistics()}>{t('tabs.stats')}</TabsTrigger>
            {isManagerWithoutClub && (
              <TabsTrigger data-tour="league-tab-available" value="available" className="relative">
                {t('tabs.available')}
                {availableClubs.length > 0 && (
                  <span className="ml-1.5 bg-pitch text-white text-[10px] rounded-full px-1.5 py-0.5">
                    {availableClubs.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {isPlayerFreeAgent && !isManagerWithoutClub && (
              <TabsTrigger value="join" className="relative">
                {t('tabs.join', { defaultValue: 'Times' })}
                {joinableClubs.length > 0 && (
                  <span className="ml-1.5 bg-pitch text-white text-[10px] rounded-full px-1.5 py-0.5">
                    {joinableClubs.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Resumo da Temporada tab — only visible when season is finished */}
          {seasonStatus === 'finished' && seasonId && (
            <TabsContent value="recap" className="space-y-4">
              <SeasonRecapView seasonId={seasonId} seasonNumber={seasonNumber} />
            </TabsContent>
          )}

          {/* Classificação tab */}
          <TabsContent value="standings">
            <div className="stat-card overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th className="w-8">{t('standings.col.rank')}</th>
                    <th>{t('standings.col.club')}</th>
                    <th className="text-center">{t('standings.col.played')}</th>
                    <th className="text-center">{t('standings.col.won')}</th>
                    <th className="text-center">{t('standings.col.drawn')}</th>
                    <th className="text-center">{t('standings.col.lost')}</th>
                    <th className="text-center">{t('standings.col.goals_for')}</th>
                    <th className="text-center">{t('standings.col.goals_against')}</th>
                    <th className="text-center">{t('standings.col.goal_diff')}</th>
                    <th className="text-center">{t('standings.col.points')}</th>
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
                            <ClubCrest
                              crestUrl={club?.crest_url}
                              primaryColor={club?.primary_color || '#333'}
                              secondaryColor={club?.secondary_color || '#fff'}
                              shortName={club?.short_name || '???'}
                              className="h-6 w-6 rounded text-[9px] shrink-0"
                            />
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
                  {t('standings.empty')}
                </p>
              )}
            </div>

            {/* Legend */}
            {standings.length > 0 && (
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500" />
                  <span>{t('standings.legend.qualification')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500" />
                  <span>{t('standings.legend.relegation')}</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Rodadas tab */}
          <TabsContent value="rounds" className="space-y-4">
            {/* Premiações + Season MVP migrated to the dedicated "Resumo da Temporada" tab when the season is finished. */}

            {/* Próximo Jogo highlight — only shown when the viewer has
                a club context AND there's a future fixture we could find. */}
            {nextMatch && (
              <div className="stat-card border-tactical/40 bg-tactical/5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-tactical" />
                  <span className="font-display font-bold text-sm uppercase tracking-wide text-tactical">
                    {t('rounds.next_match_label', { n: nextMatch.round_number })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ClubCrest
                      crestUrl={nextMatch.opponent_crest_url}
                      primaryColor={nextMatch.opponent_primary_color}
                      secondaryColor={nextMatch.opponent_secondary_color}
                      shortName={nextMatch.opponent_short_name}
                      className="h-7 w-7 rounded text-[9px] shrink-0"
                    />
                    <div>
                      <p className="font-display font-bold text-sm">
                        {t('rounds.vs_opponent', { home_or_away: nextMatch.is_home ? t('rounds.home') : t('rounds.away'), name: nextMatch.opponent_name })}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatBRTDateTime(nextMatch.scheduled_at)}
                      </div>
                    </div>
                  </div>
                  {nextMatch.match_id ? (
                    <Link
                      to={`/match/${nextMatch.match_id}`}
                      className="text-xs font-display font-bold text-pitch hover:text-pitch/80 transition-colors"
                    >
                      {t('rounds.enter_match')}
                    </Link>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">
                      {t('rounds.link_available_soon')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Round selector */}
            <div className="overflow-x-auto pb-2" ref={roundsRef}>
              <div className="flex gap-2 min-w-max">
                {rounds.map((r) => {
                  // Mark the round that contains the viewer's next fixture
                  // so it's visually distinguishable from the rest.
                  const isViewerNext = !!nextMatch && r.round_number === nextMatch.round_number;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRound(r.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                        selectedRound === r.id
                          ? 'bg-tactical text-white'
                          : isViewerNext
                          ? 'bg-tactical/20 text-tactical hover:bg-tactical/30'
                          : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                      }`}
                    >
                      {t('rounds.round_label', { n: r.round_number })}
                      {isViewerNext && selectedRound !== r.id && t('rounds.next_marker')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected round details */}
            {activeRound && (
              <div className="stat-card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-display font-semibold">
                      {t('rounds.round_label', { n: activeRound.round_number })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Show the São Paulo kickoff time (e.g. "Dom 20/04 21:00 BRT")
                        so the viewer doesn't have to translate UTC. */}
                    <span className="text-sm text-muted-foreground">
                      {formatBRTDateTime(activeRound.scheduled_at)}
                    </span>
                    {getStatusBadge(activeRound.status)}
                  </div>
                </div>

                {/* Round Recap (canonical narrative) — appears above matches when round is finished */}
                {activeRound.status === 'finished' && (
                  <>
                    <RoundRecapCard roundId={activeRound.id} />
                    <RoundMvpVoteCard roundId={activeRound.id} roundNumber={activeRound.round_number} />
                  </>
                )}

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
                          <ClubCrest crestUrl={homeClub?.crest_url} primaryColor={homeClub?.primary_color || '#333'} secondaryColor={homeClub?.secondary_color || '#fff'} shortName={homeClub?.short_name || '?'} className="h-6 w-6 rounded text-[9px] shrink-0" />
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
                                  {t('rounds.watch_live')}
                                </Link>
                              )}
                              {hasResult && lm.match_id && (
                                <div className="flex gap-2 mt-0.5">
                                  <Link to={`/match/${lm.match_id}`} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                    {t('rounds.view_result')}
                                  </Link>
                                  <Link to={`/match/${lm.match_id}/replay`} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                    {t('rounds.view_replay')}
                                  </Link>
                                </div>
                              )}
                            </>
                          ) : lm.match_id ? (
                            <>
                              <Link to={`/match/${lm.match_id}`} className="text-muted-foreground text-sm hover:text-pitch transition-colors">
                                {t('rounds.enter')}
                              </Link>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                {formatBRTTimeOnly(activeRound.scheduled_at)} BRT
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-muted-foreground text-sm">{t('rounds.vs_label')}</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                {formatBRTTimeOnly(activeRound.scheduled_at)} BRT
                              </span>
                            </>
                          )}
                        </div>

                        {/* Away club */}
                        <div className="flex items-center gap-2 flex-1">
                          <ClubCrest crestUrl={awayClub?.crest_url} primaryColor={awayClub?.primary_color || '#333'} secondaryColor={awayClub?.secondary_color || '#fff'} shortName={awayClub?.short_name || '?'} className="h-6 w-6 rounded text-[9px] shrink-0" />
                          <span className="font-medium text-sm">{awayClub?.name}</span>
                        </div>
                      </div>
                    );
                  })}

                  {activeRound.league_matches.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      {t('rounds.no_matches')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {rounds.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {t('rounds.no_rounds')}
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
                <p className="text-muted-foreground font-medium">{t('stats.no_data_title')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('stats.no_data_subtitle')}
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
                              <p className="text-xs text-muted-foreground">{t('stats.best_attack')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <ClubCrest crestUrl={bestAttack.clubs?.crest_url} primaryColor={bestAttack.clubs?.primary_color || '#333'} secondaryColor={bestAttack.clubs?.secondary_color || '#fff'} shortName={bestAttack.clubs?.short_name || '?'} className="h-5 w-5 rounded text-[8px] shrink-0" />
                                <span className="font-display font-bold text-sm">{bestAttack.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{t('stats.best_attack_value', { n: bestAttack.goals_for })}</p>
                            </div>
                          </div>
                          <div className="stat-card flex items-center gap-3 p-4">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                              <Shield className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('stats.best_defense')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <ClubCrest crestUrl={bestDefense.clubs?.crest_url} primaryColor={bestDefense.clubs?.primary_color || '#333'} secondaryColor={bestDefense.clubs?.secondary_color || '#fff'} shortName={bestDefense.clubs?.short_name || '?'} className="h-5 w-5 rounded text-[8px] shrink-0" />
                                <span className="font-display font-bold text-sm">{bestDefense.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{t('stats.best_defense_value', { n: bestDefense.goals_against })}</p>
                            </div>
                          </div>
                          <div className="stat-card flex items-center gap-3 p-4">
                            <div className="p-2 rounded-lg bg-yellow-500/10">
                              <Award className="h-5 w-5 text-yellow-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('stats.most_wins')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <ClubCrest crestUrl={mostWins.clubs?.crest_url} primaryColor={mostWins.clubs?.primary_color || '#333'} secondaryColor={mostWins.clubs?.secondary_color || '#fff'} shortName={mostWins.clubs?.short_name || '?'} className="h-5 w-5 rounded text-[8px] shrink-0" />
                                <span className="font-display font-bold text-sm">{mostWins.clubs?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{t('stats.most_wins_value', { n: mostWins.won })}</p>
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
                      <h3 className="font-display font-bold text-sm">{t('stats.top_scorers')}</h3>
                    </div>
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th className="w-8">{t('standings.col.rank')}</th>
                          <th className="w-10"></th>
                          <th>{t('stats.col_player')}</th>
                          <th className="w-10"></th>
                          <th className="text-center w-16">{t('stats.col_goals')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(scorersExpanded ? topScorers : topScorers.slice(0, SCORERS_PREVIEW_COUNT)).map((s, i) => (
                          <tr key={s.participant_id}>
                            <td className="font-display font-bold text-center">{i + 1}</td>
                            <td>
                              <PlayerAvatar
                                appearance={(s as any).appearance}
                                variant="face"
                                clubPrimaryColor={s.club_primary_color}
                                clubSecondaryColor={s.club_secondary_color}
                                playerName={s.player_name}
                                className="h-7 w-7"
                                fallbackSeed={s.participant_id}
                              />
                            </td>
                            <td>
                              <Link
                                to={`/player/${s.participant_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-sm hover:text-tactical transition-colors"
                              >
                                {s.player_name}
                              </Link>
                            </td>
                            <td>
                              <ClubCrest crestUrl={(s as any).club_crest_url} primaryColor={s.club_primary_color} secondaryColor={s.club_secondary_color} shortName={s.club_short_name} className="h-5 w-5 rounded text-[8px] shrink-0" />
                            </td>
                            <td className="text-center font-display text-lg font-bold">{s.goals}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {topScorers.length > SCORERS_PREVIEW_COUNT && (
                      <div className="flex justify-center mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setScorersExpanded(v => !v)}
                          className="text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          {scorersExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              {t('stats.see_less')}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              {t('stats.see_all')}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Top Assists */}
                <div className="stat-card overflow-x-auto">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Users className="h-4 w-4 text-tactical" />
                    <h3 className="font-display font-bold text-sm">{t('stats.top_assists')}</h3>
                  </div>
                  {topAssisters.length > 0 ? (
                    <>
                      <table className="data-table w-full">
                        <thead>
                          <tr>
                            <th className="w-8">{t('standings.col.rank')}</th>
                            <th className="w-10"></th>
                            <th>{t('stats.col_player')}</th>
                            <th className="w-10"></th>
                            <th className="text-center w-16">{t('stats.col_assists')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(assistsExpanded ? topAssisters : topAssisters.slice(0, SCORERS_PREVIEW_COUNT)).map((a, i) => (
                            <tr key={a.participant_id}>
                              <td className="font-display font-bold text-center">{i + 1}</td>
                              <td>
                                <PlayerAvatar
                                  appearance={(a as any).appearance}
                                  variant="face"
                                  clubPrimaryColor={a.club_primary_color}
                                  clubSecondaryColor={a.club_secondary_color}
                                  playerName={a.player_name}
                                  className="h-7 w-7"
                                  fallbackSeed={a.participant_id}
                                />
                              </td>
                              <td>
                                <Link
                                  to={`/player/${a.participant_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-sm hover:text-tactical transition-colors"
                                >
                                  {a.player_name}
                                </Link>
                              </td>
                              <td>
                                <ClubCrest crestUrl={(a as any).club_crest_url} primaryColor={a.club_primary_color} secondaryColor={a.club_secondary_color} shortName={a.club_short_name} className="h-5 w-5 rounded text-[8px] shrink-0" />
                              </td>
                              <td className="text-center font-display text-lg font-bold">{a.assists}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {topAssisters.length > SCORERS_PREVIEW_COUNT && (
                        <div className="flex justify-center mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAssistsExpanded(v => !v)}
                            className="text-xs text-muted-foreground hover:text-foreground gap-1"
                          >
                            {assistsExpanded ? (
                              <>
                                <ChevronUp className="h-3.5 w-3.5" />
                                {t('stats.see_less')}
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3.5 w-3.5" />
                                {t('stats.see_all')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      {t('stats.no_assists_yet')}
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Free-agent player: browse league teams. Bot teams auto-sign with
              the default contract; human-managed teams open the public page so
              the manager can decide. */}
          {isPlayerFreeAgent && (
            <TabsContent value="join" className="space-y-4">
              <p data-tour="league-join-intro" className="text-xs text-muted-foreground">
                {t('join.intro', {
                  defaultValue: 'Clubes com técnico bot aceitam contrato automaticamente. Clubes com técnico humano precisam te enviar uma proposta.',
                })}
              </p>
              {joinableClubs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...joinableClubs]
                    // Sort: human-managed first, then by human roster count desc, then by name.
                    // Free agents tend to prefer populated rooms, so we surface them at the top.
                    .sort((a, b) => {
                      if (a.is_bot_managed !== b.is_bot_managed) return a.is_bot_managed ? 1 : -1;
                      if (b.human_count !== a.human_count) return b.human_count - a.human_count;
                      return a.name.localeCompare(b.name);
                    })
                    .map((jc, idx) => (
                    <div key={jc.id} data-tour={idx === 0 ? 'league-join-first-card' : undefined} className="stat-card flex flex-col items-center text-center gap-3 p-4">
                      {/* Crest + name link to the public club page so players
                          can scout the squad/formation/positions before signing. */}
                      <Link to={`/club/${jc.id}`} className="contents">
                        <ClubCrest
                          crestUrl={jc.crest_url}
                          primaryColor={jc.primary_color}
                          secondaryColor={jc.secondary_color}
                          shortName={jc.short_name}
                          className="h-14 w-14 rounded-lg text-lg cursor-pointer hover:scale-105 transition-transform"
                        />
                      </Link>
                      <div>
                        <Link
                          to={`/club/${jc.id}`}
                          className="font-display font-bold hover:text-tactical hover:underline transition-colors"
                        >
                          {jc.name}
                        </Link>
                        {jc.city && <p className="text-xs text-muted-foreground">{jc.city}</p>}
                        <div className="flex items-center justify-center gap-1 mt-1 text-[11px]">
                          {jc.is_bot_managed ? (
                            <>
                              <Bot className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">{t('join.bot_team', { defaultValue: 'Técnico bot' })}</span>
                            </>
                          ) : (
                            <>
                              <UserIcon className="h-3 w-3 text-pitch" />
                              <span className="text-pitch">{t('join.human_team', { defaultValue: 'Técnico humano' })}</span>
                            </>
                          )}
                        </div>
                        {/* Human roster headcount — color-coded so cards with people stand out */}
                        <div className={`flex items-center justify-center gap-1 mt-1 text-[11px] ${jc.human_count > 0 ? 'text-pitch' : 'text-muted-foreground'}`}>
                          <UserIcon className="h-3 w-3" />
                          <span>
                            {t(jc.human_count === 1 ? 'join.humans_one' : 'join.humans_other', {
                              defaultValue: jc.human_count === 1 ? '{{count}} jogador humano' : '{{count}} jogadores humanos',
                              count: jc.human_count,
                            })}
                          </span>
                        </div>
                      </div>
                      {jc.is_bot_managed ? (
                        <Button
                          onClick={() => setJoinTarget(jc)}
                          className="w-full bg-tactical hover:bg-tactical/90 text-white"
                          size="sm"
                        >
                          {t('join.sign_button', { defaultValue: 'Assinar contrato' })}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => navigate(`/club/${jc.id}`)}
                          variant="outline"
                          className="w-full"
                          size="sm"
                        >
                          {t('join.view_button', { defaultValue: 'Ver clube' })}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">{t('join.empty', { defaultValue: 'Nenhum clube disponível.' })}</p>
                </div>
              )}
            </TabsContent>
          )}

          {/* Times Disponíveis tab */}
          {isManagerWithoutClub && (
            <TabsContent value="available" className="space-y-4">
              {availableClubs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableClubs.map((ac) => (
                    <div key={ac.id} className="stat-card flex flex-col items-center text-center gap-3 p-4">
                      <ClubCrest crestUrl={ac.crest_url} primaryColor={ac.primary_color} secondaryColor={ac.secondary_color} shortName={ac.short_name} className="h-14 w-14 rounded-lg text-lg" />
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
                        {t('available.assume_team')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">{t('available.empty_title')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('available.empty_subtitle')}</p>
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
            <DialogTitle className="font-display">{t('customize.title')}</DialogTitle>
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
              <Label>{t('customize.team_name')}</Label>
              <Input value={clubName} onChange={e => setClubName(e.target.value)} maxLength={40} />
            </div>

            <div className="space-y-2">
              <Label>{t('customize.short_name')}</Label>
              <Input value={shortName} onChange={e => setShortName(e.target.value.slice(0, 3).toUpperCase())} maxLength={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('customize.primary_color')}</Label>
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
                <Label>{t('customize.secondary_color')}</Label>
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
              <Label>{t('customize.city')}</Label>
              <Input value={cityName} onChange={e => setCityName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('customize.stadium_name')}</Label>
              <Input value={stadiumName} onChange={e => setStadiumName(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizeOpen(false)}>{t('customize.cancel')}</Button>
            <Button
              onClick={handleAssumeTeam}
              disabled={submitting || !clubName.trim() || shortName.trim().length !== 3}
              className="bg-pitch hover:bg-pitch/90 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('customize.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Free-agent → bot team confirm dialog */}
      <Dialog open={!!joinTarget} onOpenChange={(open) => { if (!open && !joining) setJoinTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t('join.dialog_title', { defaultValue: 'Assinar com {{club}}?', club: joinTarget?.name || '' })}
            </DialogTitle>
          </DialogHeader>
          {joinTarget && (
            <div className="space-y-3">
              <div className="flex items-center justify-center">
                <ClubCrest
                  crestUrl={joinTarget.crest_url}
                  primaryColor={joinTarget.primary_color}
                  secondaryColor={joinTarget.secondary_color}
                  shortName={joinTarget.short_name}
                  className="h-16 w-16 rounded-lg text-xl"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t('join.dialog_intro', {
                  defaultValue: 'O técnico é bot, então o contrato é aceito na hora com os valores padrão abaixo.',
                })}
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('join.salary_label', { defaultValue: 'Salário semanal' })}</span>
                  <span className="font-display font-bold">{formatBRL(FREE_AGENT_DEFAULT_SALARY)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('join.clause_label', { defaultValue: 'Multa rescisória' })}</span>
                  <span className="font-display font-bold">{formatBRL(FREE_AGENT_DEFAULT_CLAUSE)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('join.length_label', { defaultValue: 'Duração' })}</span>
                  <span className="font-display font-bold">{t('join.length_months', { defaultValue: '{{n}} meses', n: FREE_AGENT_DEFAULT_MONTHS })}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinTarget(null)} disabled={joining}>
              {t('join.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button
              onClick={handleJoinBotTeam}
              disabled={joining}
              className="bg-pitch hover:bg-pitch/90 text-white"
            >
              {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('join.confirm', { defaultValue: 'Assinar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LeagueLayout>
  );
}
