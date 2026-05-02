import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { PositionBadge } from '@/components/PositionBadge';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { ATTR_LABELS, ATTRIBUTE_CATEGORIES, COACH_BONUS_RATE, TRAINING_CENTER_BONUS, coachTypeLabel } from '@/lib/attributes';
import { positionLabel, sortPlayersByPosition } from '@/lib/positions';
import {
  Shield, Users, FileText, Trophy, Calendar, Dumbbell, Store,
  Handshake, Building2, Swords, Brain, CircleDot, Loader2, Star,
  Shirt, Footprints, Crosshair, ShieldAlert, Pencil, User, Bot,
} from 'lucide-react';
import { LineupFieldView } from '@/components/LineupFieldView';
import { ClubCrest } from '@/components/ClubCrest';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { seededAppearance } from '@/lib/avatar';
import { formatBRL } from '@/lib/formatting';
import { formatDate as formatDateI18n } from '@/lib/formatDate';
import type { SupportedLanguage } from '@/i18n';
import { getNextClubMatch, formatBRTDateTime, type NextClubMatch } from '@/lib/upcomingMatches';
import { ClubIntroTour } from '@/components/tour/ClubIntroTour';

// ── Types ──

interface ClubInfo {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url: string | null;
  city: string | null;
  reputation: number;
}

interface ManagerInfo {
  id: string;
  full_name: string;
  coach_type: string | null;
  user_id: string | null;
  appearance: any | null;
}

interface ContractInfo {
  weekly_salary: number;
  release_clause: number;
  start_date: string;
  end_date: string | null;
}

interface Teammate {
  id: string;
  full_name: string;
  primary_position: string;
  overall: number;
  archetype: string;
  user_id: string | null;
  appearance: any;
}

interface UniformInfo {
  uniform_number: number;
  shirt_color: string;
  number_color: string;
  pattern: string;
  stripe_color: string;
}

interface FacilityInfo {
  facility_type: string;
  level: number;
}

interface StandingInfo {
  position: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  total: number;
}

interface RecentResultInfo {
  id: string;
  result: 'V' | 'E' | 'D';
  myScore: number;
  oppScore: number;
  isHome: boolean;
  opponent: { id: string; name: string; short_name: string; primary_color: string; secondary_color: string; crest_url: string | null } | null;
}

interface LineupSlotInfo {
  slot_position: string;
  role_type: string;
  sort_order: number;
  player: {
    id: string;
    full_name: string;
    overall: number;
    primary_position: string;
    jersey_number: number | null;
    appearance: any;
    height: string | null;
  } | null;
}

interface LineupInfo {
  formation: string;
  name: string | null;
  slots: LineupSlotInfo[];
}

type PlayerProfileSummary = Pick<
  Tables<'player_profiles'>,
  | 'id'
  | 'full_name'
  | 'age'
  | 'primary_position'
  | 'secondary_position'
  | 'archetype'
  | 'overall'
  | 'dominant_foot'
  | 'reputation'
>;

// ── Constants ──

const FACILITY_ICONS: Record<string, typeof Store> = {
  souvenir_shop: Store,
  sponsorship: Handshake,
  training_center: Dumbbell,
  stadium: Building2,
};

const COACH_ICONS: Record<string, typeof Shield> = {
  defensive: Shield,
  offensive: Swords,
  technical: Brain,
  all_around: CircleDot,
  complete: CircleDot,
};

const physicalKeys = ATTRIBUTE_CATEGORIES['Físico'];
const technicalKeys = ATTRIBUTE_CATEGORIES['Técnico'];
const mentalKeys = ATTRIBUTE_CATEGORIES['Mental'];
const shootingKeys = ATTRIBUTE_CATEGORIES['Chute'];
const gkKeys = ATTRIBUTE_CATEGORIES['Goleiro'];

// ── Helpers ──

function formatDominantFoot(foot: string, t: (k: string) => string) {
  if (foot === 'right') return t('foot.right');
  if (foot === 'left') return t('foot.left');
  if (foot === 'both') return t('foot.both');
  return foot || '-';
}

// ── Sub-components ──

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display font-bold text-foreground">{value}</p>
    </div>
  );
}

function AttributeSection({
  title,
  keys,
  attrs,
}: {
  title: string;
  keys: readonly string[];
  attrs: Tables<'player_attributes'>;
}) {
  return (
    <div className="stat-card space-y-3">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      <div className="space-y-2">
        {keys.map((key) => (
          <AttributeBar
            key={key}
            label={ATTR_LABELS[key] || key}
            value={Number(attrs[key as keyof Tables<'player_attributes'>] ?? 0)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Teammate summary view: category averages only, no per-attribute breakdown ──
const SUMMARY_PHYSICAL = ['velocidade', 'aceleracao', 'agilidade', 'forca', 'stamina', 'resistencia'] as const;
const SUMMARY_TECHNICAL = ['controle_bola', 'drible', 'passe_baixo', 'passe_alto', 'um_toque', 'curva'] as const;
const SUMMARY_MENTAL = ['visao_jogo', 'tomada_decisao', 'antecipacao', 'posicionamento_ofensivo', 'posicionamento_defensivo'] as const;
const SUMMARY_SHOOTING = ['acuracia_chute', 'forca_chute'] as const;
const SUMMARY_DEFENDING = ['desarme', 'marcacao', 'cabeceio'] as const;
const SUMMARY_GK = ['reflexo', 'posicionamento_gol', 'pegada', 'saida_gol', 'comando_area'] as const;

function AttrSummaryRow({ title, icon, keys, attrs }: { title: string; icon: React.ReactNode; keys: readonly string[]; attrs: Tables<'player_attributes'> }) {
  const avg = keys.length > 0
    ? Math.round(keys.reduce((sum, k) => sum + Number(attrs[k as keyof Tables<'player_attributes'>] ?? 0), 0) / keys.length)
    : 0;
  const color = avg >= 70 ? 'text-pitch' : avg >= 50 ? 'text-yellow-500' : 'text-destructive';
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-32 shrink-0">
        {icon}
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <Progress value={avg} className="flex-1 h-2.5" />
      <span className={`w-8 text-right font-display font-bold text-sm ${color}`}>{avg}</span>
    </div>
  );
}

function JerseyPreview({ label, shirtColor, numberColor }: { label: string; shirtColor: string; numberColor: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div
        className="flex h-24 w-20 items-center justify-center rounded-lg border-2 border-border/40 font-display text-3xl font-extrabold shadow-md"
        style={{ backgroundColor: shirtColor, color: numberColor }}
      >
        10
      </div>
    </div>
  );
}

// ── Main Component ──

export default function PlayerClubPage() {
  const { playerProfile, assistantClub } = useAuth();
  const { t } = useTranslation('player_club');
  const { current: lang } = useAppLanguage();

  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [managerInfo, setManagerInfo] = useState<ManagerInfo | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [uniforms, setUniforms] = useState<UniformInfo[]>([]);
  const [facilities, setFacilities] = useState<FacilityInfo[]>([]);
  const [standing, setStanding] = useState<StandingInfo | null>(null);
  const [formation, setFormation] = useState<string>('4-4-2');
  const [lineup, setLineup] = useState<LineupInfo | null>(null);
  const [nextMatch, setNextMatch] = useState<NextClubMatch | null>(null);
  const [recentResults, setRecentResults] = useState<RecentResultInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Player detail dialog
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfileSummary | null>(null);
  const [selectedPlayerAttrs, setSelectedPlayerAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerProfile || !playerProfile.club_id) {
      setLoading(false);
      return;
    }

    const clubId = playerProfile.club_id;

    const fetchAll = async () => {
      // First: get club info to know manager_profile_id
      const { data: club } = await supabase
        .from('clubs')
        .select('id, name, short_name, primary_color, secondary_color, crest_url, city, reputation, manager_profile_id')
        .eq('id', clubId)
        .single();

      if (!club) {
        setLoading(false);
        return;
      }

      setClubInfo({
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        primary_color: club.primary_color,
        secondary_color: club.secondary_color,
        crest_url: (club as any).crest_url ?? null,
        city: club.city,
        reputation: club.reputation,
      });

      // Parallel batch: everything that depends on clubId / manager_profile_id
      const [
        managerRes,
        contractRes,
        contractsRes,
        uniformsRes,
        facilitiesRes,
        settingsRes,
        lineupRes,
        seasonRes,
        nextMatchData,
        recentMatchesRes,
      ] = await Promise.all([
        supabase.from('manager_profiles').select('id, full_name, coach_type, user_id, appearance' as any).eq('id', club.manager_profile_id).single(),
        supabase.from('contracts').select('weekly_salary, release_clause, start_date, end_date')
          .eq('player_profile_id', playerProfile.id).eq('status', 'active').maybeSingle(),
        supabase.from('contracts').select('player_profile_id').eq('club_id', clubId).eq('status', 'active'),
        supabase.from('club_uniforms').select('uniform_number, shirt_color, number_color, pattern, stripe_color').eq('club_id', clubId).order('uniform_number'),
        supabase.from('club_facilities').select('facility_type, level').eq('club_id', clubId),
        supabase.from('club_settings').select('default_formation').eq('club_id', clubId).maybeSingle(),
        supabase.from('lineups').select('id, formation, name').eq('club_id', clubId).eq('is_active', true).maybeSingle(),
        supabase.from('league_seasons').select('id').eq('status', 'active').order('season_number', { ascending: false }).limit(1).maybeSingle(),
        // Uses league_matches + league_rounds — the `matches` row isn't
        // materialized until ~5 min before kickoff, so querying it directly
        // would return nothing for upcoming fixtures.
        getNextClubMatch(clubId),
        supabase.from('matches').select('id, home_club_id, away_club_id, home_score, away_score, status')
          .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
          .eq('status', 'finished').order('finished_at', { ascending: false }).limit(5),
      ]);

      // Manager
      setManagerInfo(managerRes.data ? { id: managerRes.data.id, full_name: managerRes.data.full_name, coach_type: managerRes.data.coach_type, user_id: (managerRes.data as any).user_id ?? null, appearance: (managerRes.data as any).appearance ?? null } : null);

      // Contract
      setContract(contractRes.data);

      // Formation
      setFormation(settingsRes.data?.default_formation || '4-4-2');

      // Uniforms
      setUniforms((uniformsRes.data || []) as UniformInfo[]);

      // Facilities
      setFacilities((facilitiesRes.data || []) as FacilityInfo[]);

      // Teammates
      const playerIds = (contractsRes.data || []).map((c) => c.player_profile_id);
      if (playerIds.length > 0) {
        const { data } = await supabase
          .from('player_profiles')
          .select('id, full_name, primary_position, overall, archetype, user_id, appearance')
          .in('id', playerIds)
          .order('overall', { ascending: false });
        setTeammates(sortPlayersByPosition((data || []) as any) as Teammate[]);
      }

      // Lineup slots
      if (lineupRes.data) {
        const { data: slots } = await supabase
          .from('lineup_slots')
          .select('slot_position, role_type, sort_order, player_profile_id')
          .eq('lineup_id', lineupRes.data.id)
          .order('sort_order');

        if (slots && slots.length > 0) {
          const slotPlayerIds = slots.map((s) => s.player_profile_id);
          const { data: slotPlayers } = await supabase
            .from('player_profiles')
            .select('id, full_name, overall, primary_position, jersey_number, appearance, height')
            .in('id', slotPlayerIds);

          const playerMap = new Map((slotPlayers || []).map((p) => [p.id, p]));

          setLineup({
            formation: lineupRes.data.formation,
            name: lineupRes.data.name,
            slots: slots.map((s) => ({
              slot_position: s.slot_position,
              role_type: s.role_type,
              sort_order: s.sort_order,
              player: playerMap.get(s.player_profile_id) || null,
            })),
          });
        } else {
          setLineup({ formation: lineupRes.data.formation, name: lineupRes.data.name, slots: [] });
        }
      }

      // League standing
      let seasonId = seasonRes.data?.id;
      if (!seasonId) {
        const { data: scheduledSeason } = await supabase
          .from('league_seasons').select('id').eq('status', 'scheduled')
          .order('season_number', { ascending: false }).limit(1).maybeSingle();
        seasonId = scheduledSeason?.id;
      }
      if (seasonId) {
        const { data: std } = await supabase
          .from('league_standings')
          .select('*')
          .eq('season_id', seasonId)
          .order('points', { ascending: false })
          .order('goals_for', { ascending: false });
        if (std) {
          const pos = std.findIndex((s: any) => s.club_id === clubId);
          if (pos >= 0) {
            const s = std[pos] as any;
            setStanding({
              position: pos + 1,
              points: s.points,
              played: s.played,
              won: s.won,
              drawn: s.drawn,
              lost: s.lost,
              goals_for: s.goals_for,
              goals_against: s.goals_against,
              total: std.length,
            });
          }
        }
      }

      // Next league fixture (from league_matches join — publicly readable).
      setNextMatch(nextMatchData);

      // Recent results — enrich with opponent club so each row can link
      // straight to the replay and show the crest/name.
      if (recentMatchesRes.data && recentMatchesRes.data.length > 0) {
        const oppIds = Array.from(new Set(recentMatchesRes.data.map((m: any) =>
          m.home_club_id === clubId ? m.away_club_id : m.home_club_id
        )));
        const { data: oppClubs } = await supabase
          .from('clubs')
          .select('id, name, short_name, primary_color, secondary_color, crest_url')
          .in('id', oppIds);
        const oppMap = new Map((oppClubs || []).map((c: any) => [c.id, c]));

        setRecentResults(recentMatchesRes.data.map((m: any) => {
          const isHome = m.home_club_id === clubId;
          const myScore = isHome ? m.home_score : m.away_score;
          const oppScore = isHome ? m.away_score : m.home_score;
          const oppId = isHome ? m.away_club_id : m.home_club_id;
          const result = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
          return {
            id: m.id,
            result: result as 'V' | 'E' | 'D',
            myScore,
            oppScore,
            isHome,
            opponent: oppMap.get(oppId) ?? null,
          };
        }));
      }

      setLoading(false);
    };

    fetchAll();
  }, [playerProfile]);

  // Player detail dialog fetch
  useEffect(() => {
    if (!selectedPlayerId) {
      setSelectedPlayer(null);
      setSelectedPlayerAttrs(null);
      setLoadingDetails(false);
      setDetailsError(null);
      return;
    }

    let active = true;

    const fetchPlayerDetails = async () => {
      setLoadingDetails(true);
      setSelectedPlayer(null);
      setSelectedPlayerAttrs(null);
      setDetailsError(null);

      const [profileRes, attrsRes] = await Promise.all([
        supabase
          .from('player_profiles')
          .select('id, full_name, age, primary_position, secondary_position, archetype, overall, dominant_foot, reputation')
          .eq('id', selectedPlayerId)
          .maybeSingle(),
        supabase
          .from('player_attributes')
          .select('*')
          .eq('player_profile_id', selectedPlayerId)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (profileRes.error || !profileRes.data) {
        setDetailsError(t('details.error_profile'));
        setLoadingDetails(false);
        return;
      }

      setSelectedPlayer(profileRes.data);

      if (attrsRes.error) {
        setDetailsError(t('details.error_attrs'));
      } else if (!attrsRes.data) {
        setDetailsError(t('details.no_attrs'));
      } else {
        setSelectedPlayerAttrs(attrsRes.data);
      }

      setLoadingDetails(false);
    };

    fetchPlayerDetails();

    return () => { active = false; };
  }, [selectedPlayerId]);

  // ── Renders ──

  if (!playerProfile) {
    return (
      <AppLayout>
        <p className="text-muted-foreground">{t('loading')}</p>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Free agent
  if (!playerProfile.club_id || !clubInfo) {
    return (
      <AppLayout>
        <div className="max-w-2xl space-y-6">
          <h1 className="font-display text-2xl font-bold">{t('free_agent.title')}</h1>
          <div className="stat-card py-12 text-center space-y-4">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-display text-lg font-semibold">{t('free_agent.no_club_title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('free_agent.no_club_body')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                to="/league?tab=join"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-tactical px-4 py-2 text-sm font-display font-semibold text-tactical-foreground hover:bg-tactical/90 transition-colors"
              >
                <Trophy className="h-4 w-4" />
                {t('free_agent.find_club', { defaultValue: 'Procurar time na liga' })}
              </Link>
              <Link
                to="/player/offers"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              >
                {t('free_agent.see_offers')}
              </Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const coachType = managerInfo?.coach_type || 'all_around';
  const CoachIcon = COACH_ICONS[coachType] || CircleDot;
  const trainingCenter = facilities.find((f) => f.facility_type === 'training_center');
  const tcLevel = trainingCenter?.level || 0;
  const tcBonus = TRAINING_CENTER_BONUS[tcLevel] ?? 0;
  const isGK = selectedPlayer?.primary_position === 'GK';

  const coachBonusLabel = (() => {
    const ct = coachType || 'all_around';
    const rate = COACH_BONUS_RATE[ct] || 0.10;
    const label = coachTypeLabel(ct);
    return t('coach.label', { type: label, pct: Math.round(rate * 100) });
  })();

  // Team overall: average of the active lineup's starters (derived from
  // already-fetched lineup state). Falls back to null when no lineup yet.
  const teamOverall: number | null = (() => {
    if (!lineup) return null;
    const starters = lineup.slots.filter(s => s.role_type === 'starter' && s.player);
    if (starters.length === 0) return null;
    const sum = starters.reduce((acc, s) => acc + (s.player?.overall ?? 0), 0);
    return Math.round(sum / starters.length);
  })();

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">

        <ClubIntroTour
          enabled={!!playerProfile.club_id && !!clubInfo && !!lineup && lineup.slots.length > 0}
          clubName={clubInfo.name}
        />

        {/* ── Header + Stats (compact beside coach) ── */}
        <div data-tour="club-header" className="flex items-start justify-between gap-5">
          <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-5 min-w-0">
          <ClubCrest
            crestUrl={(clubInfo as any).crest_url}
            primaryColor={clubInfo.primary_color}
            secondaryColor={clubInfo.secondary_color}
            shortName={clubInfo.short_name}
            className="h-20 w-20 shrink-0 rounded-xl text-2xl shadow-lg"
          />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold truncate">{clubInfo.name}</h1>
            <p className="text-sm text-muted-foreground">
              {clubInfo.short_name} {clubInfo.city && `\u2022 ${clubInfo.city}`}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <CoachIcon className="mr-1 h-3 w-3 text-tactical" />
                {coachBonusLabel}
              </Badge>
            </div>
          </div>
          </div>

          {/* Stats: 5 cards arranged in 2 rows beside the coach (dense flow) */}
          <div data-tour="club-stats" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:grid-flow-row-dense">
          {/* Team Overall */}
          <div className="stat-card">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5" /> {t('stats.team_overall')}
            </div>
            <p className="font-display text-3xl font-extrabold text-tactical leading-none">
              {teamOverall ?? '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('stats.team_overall_caption')}</p>
          </div>

          {/* Liga Position */}
          <div className="stat-card">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> {t('stats.league')}
            </div>
            <p className="font-display text-lg font-bold">
              {standing ? t('stats.league_position', { n: standing.position }) : '\u2014'}
            </p>
            <p className="text-xs text-muted-foreground">
              {standing ? t('stats.league_caption', { points: standing.points, played: standing.played }) : t('stats.league_no_data')}
            </p>
          </div>

          {/* Next match (wider — more content) */}
          <div className="stat-card sm:col-span-2">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {t('stats.next_match')}
              {nextMatch && <span className="text-[10px] text-muted-foreground/80">{t('stats.next_match_round', { round: nextMatch.round_number })}</span>}
            </div>
            {nextMatch ? (
              <>
                <p className="truncate font-display text-sm font-bold">
                  {nextMatch.is_home
                    ? t('stats.next_match_home', { name: nextMatch.opponent_name })
                    : t('stats.next_match_away', { name: nextMatch.opponent_name })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBRTDateTime(nextMatch.scheduled_at)}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t('stats.next_match_none')}</p>
            )}
          </div>

          {/* Formation */}
          <div className="stat-card">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {t('stats.formation')}
            </div>
            <p className="font-display text-lg font-bold">{formation}</p>
            <p className="text-xs text-muted-foreground">{t('stats.formation_count', { count: teammates.length })}</p>
          </div>

          {/* Reputation */}
          <div className="stat-card">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5" /> {t('stats.reputation')}
            </div>
            <p className="font-display text-lg font-bold">{clubInfo.reputation}/100</p>
          </div>
          </div>
          </div>

          {/* Manager avatar - full-body block on the right */}
          <div data-tour="club-manager" className="shrink-0 flex flex-col items-center text-center">
            {managerInfo ? (
              <>
                <div className="w-20 h-40 flex items-end justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg overflow-hidden">
                  <PlayerAvatar
                    appearance={managerInfo.appearance ?? seededAppearance(managerInfo.id || managerInfo.full_name)}
                    variant="full-front"
                    clubPrimaryColor={clubInfo.primary_color}
                    clubSecondaryColor={clubInfo.secondary_color}
                    playerName={managerInfo.full_name}
                    className="w-full h-full"
                    fallbackSeed={managerInfo.id || managerInfo.full_name}
                    outfit="coach"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">{t('coach.manager')}</p>
                <p className="text-xs font-semibold max-w-[120px] truncate">{managerInfo.full_name}</p>
              </>
            ) : (
              <div className="w-20 h-40 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg">
                <Bot className="h-9 w-9 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column: Uniforms + Facilities ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

          {/* Uniforms */}
          <div className="stat-card space-y-3">
            <div className="flex items-center gap-2">
              <Shirt className="h-4 w-4 text-tactical" />
              <h3 className="font-display text-sm font-semibold">{t('uniforms.title')}</h3>
            </div>
            {uniforms.length > 0 ? (
              <div className="flex items-center justify-center gap-8">
                {uniforms.map((u) => (
                  <JerseyPreview
                    key={u.uniform_number}
                    label={u.uniform_number === 1 ? t('uniforms.home') : t('uniforms.away')}
                    shirtColor={u.shirt_color}
                    numberColor={u.number_color}
                  />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{t('uniforms.empty')}</p>
            )}
          </div>

          {/* Facilities */}
          <div className="stat-card space-y-3">
            <h3 className="font-display text-sm font-semibold">{t('facilities.title')}</h3>
            <div className="space-y-2.5">
              {facilities.map((f) => {
                const Icon = FACILITY_ICONS[f.facility_type];
                if (!Icon) return null;
                const maxLevel = f.facility_type === 'stadium' ? 10 : 5;
                return (
                  <div key={f.facility_type} className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="text-muted-foreground">{t(`facility_labels.${f.facility_type}` as any)}</span>
                        <span className="font-display font-bold">{t('facilities.level', { n: f.level })}</span>
                      </div>
                      <Progress value={(f.level / maxLevel) * 100} className="h-1.5" />
                    </div>
                  </div>
                );
              })}
              {facilities.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('facilities.empty')}</p>
              )}
            </div>
            {tcLevel > 0 && (
              <p className="rounded-md bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400">
                <Dumbbell className="mr-1 inline h-3 w-3" />
                {t('facilities.tc_summary', { level: tcLevel, pct: Math.round(tcBonus * 100) })}
              </p>
            )}
          </div>
        </div>

        {/* ── Lineup Preview ── */}
        {lineup && lineup.slots.length > 0 && (
          <div data-tour="club-lineup" className="stat-card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">
                {lineup.name
                  ? t('lineup.title_named', { name: lineup.name, formation: lineup.formation })
                  : t('lineup.title', { formation: lineup.formation })}
              </h3>
              {assistantClub?.id === clubInfo?.id && (
                <Link
                  to="/manager/lineup"
                  className="inline-flex items-center gap-1 text-xs font-display font-semibold text-tactical hover:underline"
                >
                  <Pencil className="h-3 w-3" /> {t('lineup.edit_assistant')}
                </Link>
              )}
            </div>

            {/* Starting XI avatars (mirror PublicClubPage). Uniform 1 (home)
                for outfielders + uniform 3 (goalkeeper) for the GK, falling
                back to club primary color when the kit row is missing. */}
            {(() => {
              const starters = lineup.slots
                .filter((s) => s.role_type === 'starter' && s.player)
                .sort((a, b) => a.sort_order - b.sort_order);
              if (starters.length === 0) return null;
              const homeKit = uniforms.find((u) => u.uniform_number === 1) ?? null;
              const gkKit = uniforms.find((u) => u.uniform_number === 3) ?? null;
              return (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('lineup.starting_xi', { defaultValue: 'Starting XI' })}
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-3">
                    {starters.map((s) => {
                      const isGK = (s.player!.primary_position || s.slot_position).toUpperCase().replace(/[0-9]/g, '') === 'GK';
                      const kit = isGK ? (gkKit ?? homeKit) : homeKit;
                      return (
                      <Link
                        key={s.player!.id}
                        to={`/player/${s.player!.id}`}
                        className="group flex flex-col items-center text-center gap-1.5 rounded-lg p-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="w-14 h-28 flex items-end justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-md overflow-hidden">
                          <PlayerAvatar
                            appearance={s.player!.appearance}
                            variant="full-front"
                            height={s.player!.height || undefined}
                            clubPrimaryColor={kit?.shirt_color ?? clubInfo?.primary_color}
                            clubSecondaryColor={kit?.stripe_color ?? clubInfo?.secondary_color}
                            clubCrestUrl={clubInfo?.crest_url || undefined}
                            playerName={s.player!.full_name}
                            jerseyNumber={s.player!.jersey_number ?? undefined}
                            uniformPattern={kit?.pattern}
                            uniformStripeColor={kit?.stripe_color}
                            uniformNumberColor={kit?.number_color}
                            isGoalkeeper={isGK}
                            className="w-full h-full"
                            fallbackSeed={s.player!.id}
                          />
                        </div>
                        <div className="flex items-center gap-1 min-w-0 w-full">
                          {s.player!.jersey_number != null && (
                            <span className="font-display font-extrabold text-[11px] text-tactical shrink-0">#{s.player!.jersey_number}</span>
                          )}
                          <span className={`text-[11px] font-semibold truncate transition-colors ${s.player!.id === playerProfile.id ? 'text-tactical' : 'group-hover:text-tactical'}`}>
                            {s.player!.full_name.split(' ').slice(-1)[0] || s.player!.full_name}
                          </span>
                        </div>
                        <PositionBadge
                          position={s.slot_position.replace(/[0-9]/g, '')}
                          className="text-[9px] px-1 py-0"
                        />
                      </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <LineupFieldView
              formation={lineup.formation}
              slots={lineup.slots}
              highlightPlayerId={playerProfile.id}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs text-muted-foreground">
                    <th className="py-1.5 text-left">{t('lineup.col_jersey')}</th>
                    <th className="py-1.5 text-left">{t('lineup.col_position')}</th>
                    <th className="py-1.5 text-left">{t('lineup.col_player')}</th>
                    <th className="py-1.5 text-right">{t('lineup.col_ovr')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lineup.slots
                    .filter((s) => s.role_type === 'starter')
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((slot, idx) => (
                      <tr key={idx} className="border-b border-border/20">
                        <td className="py-1.5 font-display font-bold text-tactical">
                          {slot.player?.jersey_number != null ? `#${slot.player.jersey_number}` : '\u2014'}
                        </td>
                        <td className="py-1.5">
                          <PositionBadge position={slot.slot_position} />
                        </td>
                        <td className="py-1.5 font-display font-semibold">
                          {slot.player?.full_name || t('lineup.vacant')}
                          {slot.player?.id === playerProfile.id && (
                            <span className="ml-1 text-xs text-tactical">{t('lineup.you')}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-display font-bold text-tactical">
                          {slot.player?.overall ?? '\u2014'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {lineup.slots.filter((s) => s.role_type === 'bench').length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('lineup.bench')}</p>
                <div className="flex flex-wrap gap-2">
                  {lineup.slots
                    .filter((s) => s.role_type === 'bench')
                    .map((slot, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {positionLabel(slot.player?.primary_position || slot.slot_position, 'long')} • {slot.player?.full_name || t('lineup.vacant')} {slot.player ? `(${slot.player.overall})` : ''}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Results ── */}
        <div className="stat-card space-y-3">
          <h3 className="font-display text-sm font-semibold">{t('results.title')}</h3>
          {recentResults.length > 0 ? (
            <div className="space-y-1.5">
              {recentResults.map((r) => (
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
                    {r.isHome ? t('results.vs') : t('results.at')}
                  </span>
                  <span className="text-xs font-medium truncate group-hover:text-tactical transition-colors">
                    {r.opponent?.name || t('results.opponent')}
                  </span>
                  <span className="ml-auto text-xs font-display font-bold tabular-nums shrink-0">
                    {r.myScore}–{r.oppScore}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('results.empty')}</p>
          )}
        </div>

        {/* ── Roster ── */}
        <div data-tour="club-roster" className="stat-card">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-tactical" />
            <span className="font-display text-sm font-semibold">{t('roster.title', { count: teammates.length })}</span>
            {teammates.filter(tm => tm.user_id).length > 0 && (() => {
              const humanCount = teammates.filter(tm => tm.user_id).length;
              return (
                <span className="inline-flex items-center gap-1 text-xs text-pitch">
                  <User className="h-3 w-3" />
                  {t(humanCount === 1 ? 'roster.humans_one' : 'roster.humans_other', { count: humanCount })}
                </span>
              );
            })()}
          </div>

          {teammates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('roster.empty')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('roster.click_hint')}</p>
              <div className="space-y-2">
                {teammates.map((teammate) => (
                  <button
                    key={teammate.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(teammate.id)}
                    className="w-full rounded-lg border border-border/60 bg-background/30 px-3 py-3 text-left transition-colors hover:border-tactical/50 hover:bg-tactical/10 focus-visible:border-tactical focus-visible:bg-tactical/10 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <PlayerAvatar
                        appearance={teammate.appearance}
                        variant="face"
                        clubPrimaryColor={clubInfo.primary_color}
                        clubSecondaryColor={clubInfo.secondary_color}
                        playerName={teammate.full_name}
                        className="h-12 w-12 shrink-0"
                        fallbackSeed={teammate.id}
                      />
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted/60">
                        <span className="font-display text-lg font-extrabold text-tactical">{teammate.overall}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-bold text-foreground flex items-center gap-1.5">
                          {teammate.user_id ? (
                            <User className="h-3.5 w-3.5 text-pitch shrink-0" aria-label={t('roster.human_label')} />
                          ) : (
                            <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label={t('roster.bot_label')} />
                          )}
                          <span className="truncate">{teammate.full_name}</span>
                          {teammate.id === playerProfile.id && <span className="ml-1 text-xs text-tactical">{t('roster.you')}</span>}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <PositionBadge position={teammate.primary_position} />
                          <span className="text-xs text-muted-foreground">{teammate.archetype}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── My Contract ── */}
        {contract && (
          <div className="stat-card">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-tactical" />
              <span className="font-display text-sm font-semibold">{t('contract.title')}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.weekly_salary')}</span>
                <p className="font-display font-bold">{formatBRL(contract.weekly_salary)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.release_clause')}</span>
                <p className="font-display font-bold">{formatBRL(contract.release_clause)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.start')}</span>
                <p className="font-display font-bold">{contract.start_date ? formatDateI18n(new Date(contract.start_date + 'T00:00:00'), lang, 'date_short') : '-'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('contract.end')}</span>
                <p className="font-display font-bold">{contract.end_date ? formatDateI18n(new Date(contract.end_date + 'T00:00:00'), lang, 'date_short') : '-'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Player Detail Dialog ── */}
      <Dialog
        open={!!selectedPlayerId}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayerId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{t('details.title')}</DialogTitle>
            <DialogDescription>
              {t('details.subtitle')}
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="stat-card py-10 text-center text-sm text-muted-foreground">
              {t('details.loading')}
            </div>
          ) : detailsError ? (
            <div className="stat-card py-10 text-center text-sm text-muted-foreground">
              {detailsError}
            </div>
          ) : selectedPlayer ? (
            <div className="space-y-6">
              <div className="stat-card space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                    <span className="font-display text-2xl font-bold text-primary-foreground">
                      {selectedPlayer.full_name[0]}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-xl font-bold">{selectedPlayer.full_name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PositionBadge position={selectedPlayer.primary_position} />
                      {selectedPlayer.secondary_position && <PositionBadge position={selectedPlayer.secondary_position} />}
                      <span className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground">
                        {selectedPlayer.archetype}
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="font-display text-4xl font-extrabold text-tactical">{selectedPlayer.overall}</span>
                    <p className="text-xs text-muted-foreground">OVR</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label={t('details.age')} value={t('details.age_value', { count: selectedPlayer.age })} />
                  <DetailItem label={t('details.foot')} value={formatDominantFoot(selectedPlayer.dominant_foot, t)} />
                  <DetailItem label={t('details.archetype')} value={selectedPlayer.archetype} />
                  <DetailItem label={t('details.reputation')} value={selectedPlayer.reputation.toString()} />
                  <DetailItem label={t('details.primary_position')} value={positionLabel(selectedPlayer.primary_position, 'long')} />
                  <DetailItem label={t('details.secondary_position')} value={selectedPlayer.secondary_position ? positionLabel(selectedPlayer.secondary_position, 'long') : '-'} />
                  <DetailItem label={t('details.club')} value={clubInfo.name} />
                </div>
              </div>

              {selectedPlayerAttrs ? (
                <div className="stat-card space-y-3">
                  <h3 className="font-display text-sm font-bold">{t('details.summary_title')}</h3>
                  <div className="space-y-2.5">
                    <AttrSummaryRow title={t('details.physical')} icon={<Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_PHYSICAL} attrs={selectedPlayerAttrs} />
                    <AttrSummaryRow title={t('details.technical')} icon={<Footprints className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_TECHNICAL} attrs={selectedPlayerAttrs} />
                    <AttrSummaryRow title={t('details.mental')} icon={<Brain className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_MENTAL} attrs={selectedPlayerAttrs} />
                    <AttrSummaryRow title={t('details.shooting')} icon={<Crosshair className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_SHOOTING} attrs={selectedPlayerAttrs} />
                    <AttrSummaryRow title={t('details.defending')} icon={<ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_DEFENDING} attrs={selectedPlayerAttrs} />
                    {isGK && (
                      <AttrSummaryRow title={t('details.goalkeeping')} icon={<Shield className="h-3.5 w-3.5 text-muted-foreground" />} keys={SUMMARY_GK} attrs={selectedPlayerAttrs} />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
