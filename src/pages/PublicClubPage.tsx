import { useEffect, useState, ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { PositionBadge } from '@/components/PositionBadge';
import { ClubCrest } from '@/components/ClubCrest';
import { CountryFlag } from '@/components/CountryFlag';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { positionLabel, sortPlayersByPosition } from '@/lib/positions';
import { formatBRL } from '@/lib/formatting';
import { archetypeLabel } from '@/lib/attributes';
import { seededAppearance } from '@/lib/avatar';
import { getNextClubMatch, formatBRTDateTime, type NextClubMatch } from '@/lib/upcomingMatches';
import {
  Shield, Star, Building2, Users, Calendar, Trophy, Loader2, ArrowLeft, UserPlus, Bot, User,
} from 'lucide-react';

const SQUAD_ROLE_VALUES = ['starter', 'rotation', 'backup', 'youth'] as const;

// Adaptive layout: ManagerLayout for managers, AppLayout for players, simple public layout otherwise.
// Picks based on profile.role_selected so the correct sidebar appears regardless of which
// profile the user happens to also have.
function ClubLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const role = (profile as any)?.role_selected;
  if (role === 'manager' && managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (role === 'player' && playerProfile) return <AppLayout>{children}</AppLayout>;
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (playerProfile) return <AppLayout>{children}</AppLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/league" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Shield className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">{i18n.t('public_club:header.club_label')}</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

// ── Attribute helpers ──
interface AttrRow { label: string; key: string }

const PHYSICAL: AttrRow[] = [
  { label: 'Velocidade', key: 'velocidade' },
  { label: 'Aceleração', key: 'aceleracao' },
  { label: 'Agilidade', key: 'agilidade' },
  { label: 'Força', key: 'forca' },
  { label: 'Stamina', key: 'stamina' },
  { label: 'Resistência', key: 'resistencia' },
];

const TECHNICAL: AttrRow[] = [
  { label: 'Controle de Bola', key: 'controle_bola' },
  { label: 'Drible', key: 'drible' },
  { label: 'Passe Baixo', key: 'passe_baixo' },
  { label: 'Passe Alto', key: 'passe_alto' },
  { label: 'Um Toque', key: 'um_toque' },
  { label: 'Curva', key: 'curva' },
];

const MENTAL: AttrRow[] = [
  { label: 'Visão de Jogo', key: 'visao_jogo' },
  { label: 'Tomada de Decisão', key: 'tomada_decisao' },
  { label: 'Antecipação', key: 'antecipacao' },
  { label: 'Posic. Ofensivo', key: 'posicionamento_ofensivo' },
  { label: 'Posic. Defensivo', key: 'posicionamento_defensivo' },
];

const SHOOTING: AttrRow[] = [
  { label: 'Acurácia de Chute', key: 'acuracia_chute' },
  { label: 'Força de Chute', key: 'forca_chute' },
];

const DEFENDING: AttrRow[] = [
  { label: 'Desarme', key: 'desarme' },
  { label: 'Marcação', key: 'marcacao' },
  { label: 'Cabeceio', key: 'cabeceio' },
];

const GK_ATTRS: AttrRow[] = [
  { label: 'Reflexo', key: 'reflexo' },
  { label: 'Posic. Gol', key: 'posicionamento_gol' },
  { label: 'Pegada', key: 'pegada' },
  { label: 'Saída de Gol', key: 'saida_gol' },
  { label: 'Comando de Área', key: 'comando_area' },
];

function AttrGroup({ title, rows, attrs }: { title: string; rows: AttrRow[]; attrs: any }) {
  const avg = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + Number(attrs?.[r.key] ?? 0), 0) / rows.length)
    : 0;
  const color = avg >= 70 ? 'text-pitch' : avg >= 50 ? 'text-yellow-500' : 'text-destructive';
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-sm text-muted-foreground">{title}</span>
      <Progress value={avg} className="flex-1 h-2.5" />
      <span className={`w-8 text-right font-display font-bold text-sm ${color}`}>{avg}</span>
    </div>
  );
}

// ── Main component ──

function squadRoleLabel(value: string): string {
  return i18n.t(`public_club:squad_roles.${value}`, { defaultValue: value });
}

export default function PublicClubPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { managerProfile, club: myClub } = useAuth();
  const { t } = useTranslation('public_club');
  const { current: lang } = useAppLanguage();

  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<any>(null);
  const [stadium, setStadium] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [standing, setStanding] = useState<any>(null);
  const [squad, setSquad] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [nextMatch, setNextMatch] = useState<NextClubMatch | null>(null);
  const [teamOverall, setTeamOverall] = useState<number | null>(null);
  const [startingXI, setStartingXI] = useState<Array<{
    slot_position: string;
    sort_order: number;
    player_profile_id: string;
  }>>([]);

  // Player detail dialog
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [playerAttrs, setPlayerAttrs] = useState<any>(null);
  const [attrsLoading, setAttrsLoading] = useState(false);
  const [releaseClause, setReleaseClause] = useState<number | null>(null);

  // Offer dialog
  const [offerOpen, setOfferOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [salary, setSalary] = useState(500);
  const [clause, setClause] = useState(5000);
  const [contractLength, setContractLength] = useState('12');
  const [role, setRole] = useState('rotation');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (clubId) fetchClubData(clubId);
  }, [clubId]);

  async function fetchClubData(id: string) {
    setLoading(true);

    // Club info
    const { data: club } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!club) { setLoading(false); return; }
    setClubData(club);

    // Parallel fetches
    const [stadRes, conRes] = await Promise.all([
      supabase.from('stadiums').select('*').eq('club_id', id).maybeSingle(),
      supabase.from('contracts').select('id, player_profile_id, weekly_salary, release_clause').eq('club_id', id).eq('status', 'active'),
    ]);

    setStadium(stadRes.data);

    // Manager
    if (club.manager_profile_id) {
      const { data: mgr } = await supabase
        .from('manager_profiles')
        .select('id, full_name, user_id, appearance' as any)
        .eq('id', club.manager_profile_id)
        .maybeSingle();
      setManager(mgr);
    }

    // Squad – fetch player profiles for active contracts
    const contracts = conRes.data || [];
    if (contracts.length > 0) {
      const playerIds = contracts.map((c: any) => c.player_profile_id);
      const contractMap = new Map(contracts.map((c: any) => [c.player_profile_id, c]));

      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('id, full_name, age, primary_position, secondary_position, archetype, overall, dominant_foot, height, appearance, user_id, jersey_number')
        .in('id', playerIds)
        .order('overall', { ascending: false });

      setSquad(sortPlayersByPosition((playerData || []).map((p: any) => {
        const contract = contractMap.get(p.id);
        return { ...p, contract_id: contract?.id, weekly_salary: contract?.weekly_salary ?? 0, release_clause: contract?.release_clause ?? 0 };
      })));
    } else {
      setSquad([]);
    }

    // Active lineup → starting XI
    const { data: activeLineup } = await supabase
      .from('lineups')
      .select('id')
      .eq('club_id', id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (activeLineup) {
      const { data: slots } = await supabase
        .from('lineup_slots')
        .select('slot_position, sort_order, player_profile_id, role_type')
        .eq('lineup_id', activeLineup.id)
        .eq('role_type', 'starter')
        .order('sort_order', { ascending: true });

      setStartingXI(
        (slots || [])
          .filter((s: any) => s.player_profile_id)
          .map((s: any) => ({
            slot_position: s.slot_position,
            sort_order: s.sort_order,
            player_profile_id: s.player_profile_id,
          }))
      );
    } else {
      setStartingXI([]);
    }

    // League standing
    const { data: season } = await supabase
      .from('league_seasons')
      .select('id')
      .in('status', ['active', 'scheduled'])
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (season) {
      const { data: std } = await supabase
        .from('league_standings')
        .select('*')
        .eq('season_id', season.id)
        .order('points', { ascending: false })
        .order('goals_for', { ascending: false });

      if (std) {
        const pos = std.findIndex((s: any) => s.club_id === id);
        if (pos >= 0) setStanding({ position: pos + 1, ...std[pos], total: std.length });
      }
    }

    // Team overall (avg of starting XI from active lineup)
    const { data: ovr } = await supabase.rpc('get_club_starting_overall' as any, { p_club_id: id });
    setTeamOverall(typeof ovr === 'number' ? ovr : null);

    // Recent results (last 5 finished matches)
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id, home_score, away_score, status, finished_at')
      .or(`home_club_id.eq.${id},away_club_id.eq.${id}`)
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(5);

    if (recentMatches && recentMatches.length > 0) {
      const oppIds = Array.from(new Set(recentMatches.map((m: any) =>
        m.home_club_id === id ? m.away_club_id : m.home_club_id
      )));
      const { data: oppClubs } = await supabase
        .from('clubs')
        .select('id, name, short_name, primary_color, secondary_color, crest_url')
        .in('id', oppIds);
      const oppMap = new Map((oppClubs || []).map((c: any) => [c.id, c]));

      setRecentResults(recentMatches.map((m: any) => {
        const isHome = m.home_club_id === id;
        const myScore = isHome ? m.home_score : m.away_score;
        const oppScore = isHome ? m.away_score : m.home_score;
        const oppId = isHome ? m.away_club_id : m.home_club_id;
        const result = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
        return { ...m, result, myScore, oppScore, isHome, opponent: oppMap.get(oppId) };
      }));
    } else {
      setRecentResults([]);
    }

    // Next league fixture — uses league_matches + league_rounds (publicly
    // readable), since the `matches` row isn't materialized until ~5 min
    // before kickoff.
    setNextMatch(await getNextClubMatch(id));

    setLoading(false);
  }

  // Load player attributes on demand
  async function openPlayerDetail(player: any) {
    setSelectedPlayer(player);
    setPlayerAttrs(null);
    setReleaseClause(player.release_clause || null);
    setAttrsLoading(true);

    const { data } = await supabase
      .from('player_attributes')
      .select('*')
      .eq('player_profile_id', player.id)
      .maybeSingle();

    setPlayerAttrs(data);
    setAttrsLoading(false);
  }

  function openOfferDialog() {
    if (!selectedPlayer) return;
    setSalary(selectedPlayer.weekly_salary || 500);
    setClause(Math.min((selectedPlayer.weekly_salary || 500) * 10, 50000));
    setContractLength('12');
    setRole('rotation');
    setMessage('');
    setOfferOpen(true);
  }

  async function sendOffer() {
    if (!selectedPlayer || !managerProfile || !myClub) return;
    setSending(true);

    const { error } = await supabase.from('contract_offers').insert({
      club_id: myClub.id,
      manager_profile_id: managerProfile.id,
      player_profile_id: selectedPlayer.id,
      weekly_salary: salary,
      release_clause: clause,
      contract_length: Number(contractLength),
      squad_role: role,
      message: message || null,
      status: 'pending',
    });

    if (error) {
      toast.error(t('toast.offer_error'));
    } else {
      // Notify player if human
      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('user_id')
        .eq('id', selectedPlayer.id)
        .single();

      if (playerData?.user_id) {
        await supabase.from('notifications').insert({
          user_id: playerData.user_id,
          player_profile_id: selectedPlayer.id,
          title: t('toast.offer_notification_title'),
          body: t('toast.offer_notification_body', { club: myClub.name, salary: formatBRL(salary) }),
          type: 'contract',
          link: '/player/offers',
          i18n_key: 'contract_offer_received',
          i18n_params: { club: myClub.name, salary: formatBRL(salary) },
        } as any);
      }

      toast.success(t('toast.offer_sent', { name: selectedPlayer.full_name }));
      setOfferOpen(false);
    }
    setSending(false);
  }

  const canOffer = !!managerProfile && !!myClub && myClub.id !== clubId;

  if (loading) {
    return (
      <ClubLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ClubLayout>
    );
  }

  if (!clubData) {
    return (
      <ClubLayout>
        <div className="text-center py-12 space-y-3">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{t('header.not_found')}</p>
          <Link to="/league">
            <Button variant="outline">{t('header.back_to_league')}</Button>
          </Link>
        </div>
      </ClubLayout>
    );
  }

  return (
    <ClubLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-5">
          <div className="flex items-start gap-5 min-w-0">
            <ClubCrest
              crestUrl={clubData.crest_url}
              primaryColor={clubData.primary_color}
              secondaryColor={clubData.secondary_color}
              shortName={clubData.short_name}
              className="w-20 h-20 rounded-xl text-2xl shadow-lg shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold truncate flex items-center gap-2">
                <span className="truncate">{clubData.name}</span>
                {(clubData as any).country && <CountryFlag code={(clubData as any).country} size="sm" />}
              </h1>
              <p className="text-muted-foreground text-sm">
                {clubData.short_name} {clubData.city && `• ${clubData.city}`}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-xs">
                  <Star className="h-3 w-3 mr-1" /> {t('stats.rep_short')} {clubData.reputation}
                </Badge>
                {stadium && (
                  <Badge variant="outline" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    {stadium.name} ({stadium.capacity?.toLocaleString()})
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Manager avatar — prominent right-side block (full body) */}
          <div className="shrink-0 flex flex-col items-center text-center">
            {clubData.is_bot_managed ? (
              <>
                <div className="w-20 h-40 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg">
                  <Bot className="h-9 w-9 text-muted-foreground" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">{t('manager.no_manager')}</p>
              </>
            ) : manager ? (
              <>
                <div className="w-20 h-40 flex items-end justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg overflow-hidden">
                  <PlayerAvatar
                    appearance={manager.appearance ?? seededAppearance(manager.id || manager.full_name || 'mgr')}
                    variant="full-front"
                    clubPrimaryColor={clubData.primary_color}
                    clubSecondaryColor={clubData.secondary_color}
                    playerName={manager.full_name}
                    className="w-full h-full"
                    fallbackSeed={manager.id || manager.full_name || 'mgr'}
                    outfit="coach"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">{t('manager.label')}</p>
                <p className="text-xs font-semibold max-w-[120px] truncate">{manager.full_name}</p>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Top stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Team Overall */}
          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Star className="h-3.5 w-3.5" /> {t('stats.team_overall')}
            </div>
            <p className="font-display font-extrabold text-3xl text-tactical leading-none">
              {teamOverall ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t('stats.team_overall_hint')}</p>
          </div>

          {/* League standing */}
          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Trophy className="h-3.5 w-3.5" /> {t('stats.standing')}
            </div>
            <p className="font-display font-bold text-lg">
              {standing ? (lang === 'en' ? `#${standing.position}` : `${standing.position}º lugar`) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {standing ? t('stats.standing_value', { points: standing.points, played: standing.played }) : t('stats.no_data')}
            </p>
          </div>

          {standing && (
            <>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">{t('stats.wins_draws_losses')}</div>
                <p className="font-display font-bold text-lg">
                  <span className="text-pitch">{standing.won}</span>
                  {' / '}
                  <span>{standing.drawn}</span>
                  {' / '}
                  <span className="text-destructive">{standing.lost}</span>
                </p>
              </div>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">{t('stats.goals_for_against')}</div>
                <p className="font-display font-bold text-lg">
                  {standing.goals_for} / {standing.goals_against}
                </p>
              </div>
            </>
          )}

          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" /> {t('stats.squad')}
            </div>
            <p className="font-display font-bold text-lg">{t('stats.players_count', { count: squad.length })}</p>
            {squad.filter((p: any) => p.user_id).length > 0 && (
              <p className="text-xs text-pitch flex items-center gap-1 mt-0.5">
                <User className="h-3 w-3" />
                {t('stats.humans_count', { count: squad.filter((p: any) => p.user_id).length })}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Next match */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">
              {t('next_match.title')} {nextMatch && <span className="text-xs font-normal text-muted-foreground">— {t('next_match.round', { n: nextMatch.round_number })}</span>}
            </h3>
            {nextMatch ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {nextMatch.is_home ? t('next_match.home') : t('next_match.away')} vs {nextMatch.opponent_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBRTDateTime(nextMatch.scheduled_at)}
                    </p>
                  </div>
                </div>
                <ClubCrest
                  crestUrl={nextMatch.opponent_crest_url}
                  primaryColor={nextMatch.opponent_primary_color}
                  secondaryColor={nextMatch.opponent_secondary_color}
                  shortName={nextMatch.opponent_short_name}
                  className="w-8 h-8 rounded text-[8px] shrink-0"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('next_match.none')}</p>
            )}
          </div>

          {/* Recent results */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">{t('recent.title')}</h3>
            {recentResults.length > 0 ? (
              <div className="space-y-1.5">
                {recentResults.map((r: any) => (
                  <Link
                    key={r.id}
                    to={`/match/${r.id}/replay`}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors group"
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-display font-bold shrink-0 ${
                      r.result === 'V' ? 'bg-pitch/15 text-pitch' :
                      r.result === 'D' ? 'bg-destructive/15 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {r.result}
                    </span>
                    {r.opponent && (
                      <ClubCrest
                        crestUrl={r.opponent.crest_url}
                        primaryColor={r.opponent.primary_color}
                        secondaryColor={r.opponent.secondary_color}
                        shortName={r.opponent.short_name}
                        className="w-5 h-5 rounded text-[7px] shrink-0"
                      />
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.isHome ? 'vs' : '@'}
                    </span>
                    <span className="text-xs font-medium truncate group-hover:text-tactical transition-colors">
                      {r.opponent?.name || t('recent.opponent_fallback')}
                    </span>
                    <span className="ml-auto text-xs font-display font-bold tabular-nums shrink-0">
                      {r.myScore}–{r.oppScore}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('recent.empty')}</p>
            )}
          </div>
        </div>

        {/* ── Starting XI (avatars) ── */}
        {startingXI.length > 0 && (() => {
          const playerById = new Map<string, any>(squad.map((p: any) => [p.id, p]));
          const xi = startingXI
            .map(s => ({ slot: s, player: playerById.get(s.player_profile_id) }))
            .filter(x => x.player);
          if (xi.length === 0) return null;
          return (
            <div className="stat-card space-y-3">
              <h3 className="font-display font-semibold text-sm">{t('starting_xi.title', { defaultValue: 'Onze inicial' })}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-3">
                {xi.map(({ slot, player }) => (
                  <Link
                    key={slot.player_profile_id}
                    to={`/player/${player.id}`}
                    className="group flex flex-col items-center text-center gap-1.5 rounded-lg p-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-14 h-28 flex items-end justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-md overflow-hidden">
                      <PlayerAvatar
                        appearance={player.appearance}
                        variant="full-front"
                        height={player.height}
                        clubPrimaryColor={clubData?.primary_color}
                        clubSecondaryColor={clubData?.secondary_color}
                        clubCrestUrl={clubData?.crest_url}
                        playerName={player.full_name}
                        jerseyNumber={player.jersey_number}
                        className="w-full h-full"
                        fallbackSeed={player.id}
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-0 w-full">
                      {player.jersey_number != null && (
                        <span className="font-display font-extrabold text-[11px] text-tactical shrink-0">#{player.jersey_number}</span>
                      )}
                      <span className="text-[11px] font-semibold truncate group-hover:text-tactical transition-colors">
                        {player.full_name.split(' ').slice(-1)[0] || player.full_name}
                      </span>
                    </div>
                    <PositionBadge
                      position={slot.slot_position.replace(/[0-9]/g, '')}
                      className="text-[9px] px-1 py-0"
                    />
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Squad table ── */}
        <div className="stat-card space-y-3">
          <h3 className="font-display font-semibold text-sm">{t('squad.title')}</h3>
          {squad.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 w-10"></th>
                    <th className="py-2 pr-3">{t('squad.col_position')}</th>
                    <th className="py-2 pr-3">{t('squad.col_name')}</th>
                    <th className="py-2 pr-3">{t('squad.col_overall')}</th>
                    <th className="py-2 pr-3">{t('squad.col_age')}</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((p: any) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => openPlayerDetail(p)}
                    >
                      <td className="py-3 pr-3">
                        <PlayerAvatar
                          appearance={p.appearance}
                          variant="face"
                          clubPrimaryColor={clubData?.primary_color}
                          clubSecondaryColor={clubData?.secondary_color}
                          playerName={p.full_name}
                          className="h-12 w-12"
                          fallbackSeed={p.id}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1">
                          <PositionBadge position={p.primary_position} />
                          {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-display font-bold">
                        <div className="flex items-center gap-1.5">
                          {p.user_id ? (
                            <User className="h-3.5 w-3.5 text-pitch shrink-0" aria-label={t('squad.human')} />
                          ) : (
                            <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label={t('squad.bot')} />
                          )}
                          <Link
                            to={`/player/${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-tactical transition-colors"
                          >
                            {p.full_name}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-display text-lg font-extrabold text-tactical">{p.overall}</span>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{p.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t('squad.empty')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Player Detail Dialog ── */}
      <Dialog open={!!selectedPlayer} onOpenChange={(open) => { if (!open) setSelectedPlayer(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{selectedPlayer?.full_name}</DialogTitle>
            <DialogDescription>
              {t('player_dialog.subtitle', {
                position: positionLabel(selectedPlayer?.primary_position),
                secondary: selectedPlayer?.secondary_position
                  ? t('player_dialog.secondary_separator', { position: positionLabel(selectedPlayer.secondary_position) })
                  : '',
                archetype: archetypeLabel(selectedPlayer?.archetype),
                age: selectedPlayer?.age,
              })}
            </DialogDescription>
          </DialogHeader>

          {selectedPlayer && (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="text-center">
                  <span className="font-display text-3xl font-extrabold text-tactical">{selectedPlayer.overall}</span>
                  <p className="text-[10px] text-muted-foreground">{t('player_dialog.ovr')}</p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">{t('player_dialog.foot')}</span>
                    <span className="font-semibold capitalize">{selectedPlayer.dominant_foot || t('player_dialog.dash')}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">{t('player_dialog.height')}</span>
                    <span className="font-semibold">{selectedPlayer.height ? t('player_dialog.height_value', { value: selectedPlayer.height }) : t('player_dialog.dash')}</span>
                  </div>
                  {releaseClause != null && releaseClause > 0 && (
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">{t('player_dialog.release_clause')}</span>
                      <span className="font-semibold text-destructive">{formatBRL(releaseClause)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Attributes */}
              {attrsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : playerAttrs ? (
                <div className="space-y-2.5">
                  <AttrGroup title={t('player_dialog.section_physical')} rows={PHYSICAL} attrs={playerAttrs} />
                  <AttrGroup title={t('player_dialog.section_technical')} rows={TECHNICAL} attrs={playerAttrs} />
                  <AttrGroup title={t('player_dialog.section_mental')} rows={MENTAL} attrs={playerAttrs} />
                  <AttrGroup title={t('player_dialog.section_shooting')} rows={SHOOTING} attrs={playerAttrs} />
                  <AttrGroup title={t('player_dialog.section_defending')} rows={DEFENDING} attrs={playerAttrs} />
                  {selectedPlayer.primary_position === 'GK' && (
                    <AttrGroup title={t('player_dialog.section_goalkeeping')} rows={GK_ATTRS} attrs={playerAttrs} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">{t('player_dialog.no_attrs')}</p>
              )}

              {/* Offer button */}
              {canOffer && (
                <Button className="w-full gap-2" onClick={openOfferDialog}>
                  <UserPlus className="h-4 w-4" /> {t('player_dialog.make_offer')}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Contract Offer Dialog ── */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t('offer.title')}</DialogTitle>
            <DialogDescription>
              {t('offer.description', { name: selectedPlayer?.full_name })}
            </DialogDescription>
          </DialogHeader>

          {selectedPlayer && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <span className="font-display text-xl font-extrabold text-tactical">{selectedPlayer.overall}</span>
                <div>
                  <p className="font-display font-bold text-sm">{selectedPlayer.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('player_dialog.subtitle', {
                      position: positionLabel(selectedPlayer.primary_position),
                      secondary: '',
                      archetype: archetypeLabel(selectedPlayer.archetype),
                      age: selectedPlayer.age,
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('offer.weekly_salary')}</Label>
                  <Input type="number" min={100} value={salary} onChange={e => setSalary(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">{t('offer.release_clause')}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={salary * 10}
                    value={clause}
                    onChange={e => setClause(Math.min(Number(e.target.value), salary * 10))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('offer.contract_length')}</Label>
                  <Select value={contractLength} onValueChange={setContractLength}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">{t('offer.months_6')}</SelectItem>
                      <SelectItem value="12">{t('offer.months_12')}</SelectItem>
                      <SelectItem value="18">{t('offer.months_18')}</SelectItem>
                      <SelectItem value="24">{t('offer.months_24')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t('offer.squad_role')}</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SQUAD_ROLE_VALUES.map(r => <SelectItem key={r} value={r}>{squadRoleLabel(r)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">{t('offer.message')}</Label>
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t('offer.message_placeholder')}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>{t('offer.cancel')}</Button>
            <Button onClick={sendOffer} disabled={sending}>
              {sending ? t('offer.sending') : t('offer.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClubLayout>
  );
}
