import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatDate';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Loader2, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Types ───
interface Club { id: string; name: string; short_name: string; primary_color: string; secondary_color: string; city: string; league_id: string | null; is_bot_managed: boolean; manager_profile_id: string; }
interface LeagueRound { id: string; round_number: number; scheduled_at: string; status: string; season_id: string; }
interface LeagueSeason { id: string; season_number: number; status: string; league_id: string; }
interface League { id: string; name: string; match_day_1: string; match_day_2: string; match_time: string; }
interface PlayerProfile { id: string; full_name?: string; name?: string; club_id: string; primary_position: string; overall: number; money: number; }
interface ClubFinance { club_id: string; balance: number; }
interface MatchRow { id: string; home_club_id: string; away_club_id: string; status: string; scheduled_at: string; home_score: number; away_score: number; }

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation('admin');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [finances, setFinances] = useState<ClubFinance[]>([]);
  const [pendingReports, setPendingReports] = useState(0);

  // ─── Load data ───
  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
  }, [isAdmin]);

  async function loadAll() {
    const [clubsRes, leaguesRes, seasonsRes, roundsRes, matchesRes, financesRes, reportCountRes] = await Promise.all([
      supabase.from('clubs').select('*').order('name'),
      supabase.from('leagues').select('*'),
      supabase.from('league_seasons').select('*').order('season_number', { ascending: false }),
      supabase.from('league_rounds').select('*').order('round_number'),
      supabase.from('matches').select('*').order('scheduled_at', { ascending: false }).limit(50),
      supabase.from('club_finances').select('*'),
      (supabase as any).from('image_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setClubs((clubsRes.data || []) as any);
    setLeagues((leaguesRes.data || []) as any);
    setSeasons((seasonsRes.data || []) as any);
    setRounds((roundsRes.data || []) as any);
    setMatches((matchesRes.data || []) as any);
    setFinances((financesRes.data || []) as any);
    setPendingReports((reportCountRes as any).count ?? 0);
  }

  async function refreshReportCount() {
    const { count } = await (supabase as any)
      .from('image_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingReports(count ?? 0);
  }

  const clubName = (id: string) => clubs.find(c => c.id === id)?.name || id.slice(0, 8);

  if (!isAdmin) return <div className="p-8 text-center">{t('access_denied')}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold font-display mb-6">{t('title')}</h1>

      <Tabs defaultValue="liga" className="space-y-4">
        <TabsList className="grid grid-cols-8 w-full max-w-5xl">
          <TabsTrigger value="liga">{t('tabs.league')}</TabsTrigger>
          <TabsTrigger value="ops">{t('tabs.ops', { defaultValue: 'Operações' })}</TabsTrigger>
          <TabsTrigger value="awards">{t('tabs.awards', { defaultValue: 'Prêmios' })}</TabsTrigger>
          <TabsTrigger value="times">{t('tabs.clubs')}</TabsTrigger>
          <TabsTrigger value="financas">{t('tabs.finances')}</TabsTrigger>
          <TabsTrigger value="partidas">{t('tabs.matches')}</TabsTrigger>
          <TabsTrigger value="jogadores">{t('tabs.players')}</TabsTrigger>
          <TabsTrigger value="reportes" className="relative">
            {t('tabs.reports', { defaultValue: 'Reportes' })}
            {pendingReports > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                {pendingReports}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══ LIGA TAB ═══ */}
        <TabsContent value="liga">
          <LigaTab leagues={leagues} seasons={seasons} rounds={rounds} clubs={clubs} onReload={loadAll} />
        </TabsContent>

        {/* ═══ OPERAÇÕES TAB ═══ */}
        <TabsContent value="ops">
          <OperationsTab leagues={leagues} seasons={seasons} clubs={clubs} onReload={loadAll} />
        </TabsContent>

        {/* ═══ PRÊMIOS TAB ═══ */}
        <TabsContent value="awards">
          <AwardsTab seasons={seasons} rounds={rounds} leagues={leagues} onReload={loadAll} />
        </TabsContent>

        {/* ═══ TIMES TAB ═══ */}
        <TabsContent value="times">
          <TimesTab clubs={clubs} onReload={loadAll} />
        </TabsContent>

        {/* ═══ FINANCAS TAB ═══ */}
        <TabsContent value="financas">
          <FinancasTab clubs={clubs} finances={finances} onReload={loadAll} />
        </TabsContent>

        {/* ═══ PARTIDAS TAB ═══ */}
        <TabsContent value="partidas">
          <PartidasTab matches={matches} clubs={clubs} onReload={loadAll} />
        </TabsContent>

        {/* ═══ JOGADORES TAB ═══ */}
        <TabsContent value="jogadores">
          <JogadoresTab clubs={clubs} />
        </TabsContent>

        {/* ═══ REPORTES TAB ═══ */}
        <TabsContent value="reportes">
          <ReportsTab onActionComplete={refreshReportCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LIGA TAB
// ═══════════════════════════════════════════════════
interface RoundMatch {
  id: string;
  round_id: string;
  home_club_id: string;
  away_club_id: string;
  match_id: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  scheduled_at: string | null;
}

function LigaTab({ leagues, seasons, rounds, clubs, onReload }: { leagues: League[]; seasons: LeagueSeason[]; rounds: LeagueRound[]; clubs: Club[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const { current: lang } = useAppLanguage();
  const [editLeague, setEditLeague] = useState<League | null>(null);
  const [matchDay1, setMatchDay1] = useState('');
  const [matchDay2, setMatchDay2] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [newRoundDate, setNewRoundDate] = useState('');
  const [roundMatches, setRoundMatches] = useState<Record<string, RoundMatch[]>>({});
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  const league = leagues[0];
  const season = seasons[0];

  async function loadRoundMatches() {
    const { data } = await supabase
      .from('league_matches')
      .select('id, round_id, home_club_id, away_club_id, match_id, matches(status, home_score, away_score, scheduled_at)');
    if (!data) return;
    const grouped: Record<string, RoundMatch[]> = {};
    for (const lm of data as any[]) {
      const m = lm.matches || {};
      const row: RoundMatch = {
        id: lm.id,
        round_id: lm.round_id,
        home_club_id: lm.home_club_id,
        away_club_id: lm.away_club_id,
        match_id: lm.match_id,
        status: m.status ?? null,
        home_score: m.home_score ?? null,
        away_score: m.away_score ?? null,
        scheduled_at: m.scheduled_at ?? null,
      };
      (grouped[row.round_id] ??= []).push(row);
    }
    setRoundMatches(grouped);
  }

  useEffect(() => { loadRoundMatches(); }, [rounds.length]);

  const clubName = (id: string) => clubs.find(c => c.id === id)?.short_name || clubs.find(c => c.id === id)?.name?.slice(0, 8) || id.slice(0, 8);

  async function ensureMaterialized(m: RoundMatch): Promise<string | null> {
    if (m.match_id) return m.match_id;
    const { data, error } = await supabase.rpc('admin_materialize_league_match', { p_league_match_id: m.id });
    if (error) { toast.error(t('league_toast.materialize_failed', { message: error.message })); return null; }
    return (data as string) || null;
  }

  async function runMatchAction(m: RoundMatch, kind: 'start' | 'simulate' | 'finalize' | 'restart') {
    const tag = m.match_id || m.id;
    setBusyMatchId(tag);
    try {
      const matchId = await ensureMaterialized(m);
      if (!matchId) return;

      let err: any = null;
      if (kind === 'start') {
        const { error } = await supabase.rpc('admin_force_start_match', { p_match_id: matchId });
        err = error;
      } else if (kind === 'simulate') {
        const { error } = await supabase.rpc('admin_simulate_match', { p_match_id: matchId, p_home_score: null, p_away_score: null });
        err = error;
      } else if (kind === 'finalize') {
        const res = await supabase.functions.invoke('match-engine-lab', { body: { action: 'finish_match', match_id: matchId } });
        err = res.error;
      } else if (kind === 'restart') {
        const { error } = await supabase.rpc('admin_restart_match', { p_match_id: matchId, p_scheduled_at: null });
        err = error;
      }
      if (err) toast.error(err.message || String(err));
      else {
        toast.success({
          start: t('league_toast.started'),
          simulate: t('league_toast.simulated'),
          finalize: t('league_toast.finalized'),
          restart: t('league_toast.restarted'),
        }[kind]);
        await loadRoundMatches();
      }
    } finally {
      setBusyMatchId(null);
    }
  }

  async function updateSchedule() {
    if (!league) return;
    const { error } = await supabase.from('leagues').update({
      match_day_1: matchDay1 || league.match_day_1,
      match_day_2: matchDay2 || league.match_day_2,
      match_time: matchTime || league.match_time,
    }).eq('id', league.id);
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.schedule_saved')); onReload(); }
  }

  async function cancelRound(roundId: string) {
    const { error } = await supabase.from('league_rounds').update({ status: 'cancelled' }).eq('id', roundId);
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.round_cancelled')); onReload(); }
  }

  async function createRound() {
    if (!season || !newRoundDate) return;
    const maxRound = Math.max(0, ...rounds.map(r => r.round_number));
    const { error } = await supabase.from('league_rounds').insert({
      season_id: season.id,
      round_number: maxRound + 1,
      scheduled_at: new Date(newRoundDate).toISOString(),
      status: 'scheduled',
    });
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.round_created', { n: maxRound + 1 })); setNewRoundDate(''); onReload(); }
  }

  async function endSeason() {
    if (!season) return;
    const { error } = await supabase.from('league_seasons').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', season.id);
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.season_finished')); onReload(); }
  }

  async function startNewSeason() {
    if (!league) return;
    const newSeasonNum = (season?.season_number ?? 0) + 1;
    const { error } = await supabase.from('league_seasons').insert({
      league_id: league.id,
      season_number: newSeasonNum,
      status: 'scheduled',
    });
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.season_started', { n: newSeasonNum })); onReload(); }
  }

  async function updateRoundDate(roundId: string, newDate: string) {
    const { error } = await supabase.from('league_rounds').update({ scheduled_at: new Date(newDate).toISOString() }).eq('id', roundId);
    if (error) toast.error(error.message);
    else { toast.success(t('league_toast.round_date_updated')); onReload(); }
  }

  return (
    <div className="space-y-6">
      {/* Schedule */}
      <Card>
        <CardHeader><CardTitle>{t('league.schedule_title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {league && (
            <div className="text-sm text-muted-foreground mb-2">
              {t('league.schedule_current', { day1: league.match_day_1, day2: league.match_day_2, time: league.match_time })}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Select value={matchDay1} onValueChange={setMatchDay1}>
              <SelectTrigger><SelectValue placeholder={t('league.day_placeholder', { n: 1 })} /></SelectTrigger>
              <SelectContent>
                {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={matchDay2} onValueChange={setMatchDay2}>
              <SelectTrigger><SelectValue placeholder={t('league.day_placeholder', { n: 2 })} /></SelectTrigger>
              <SelectContent>
                {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder={t('league.time_placeholder')} value={matchTime} onChange={e => setMatchTime(e.target.value)} />
          </div>
          <Button onClick={updateSchedule}>{t('league.save_schedule')}</Button>
        </CardContent>
      </Card>

      {/* Season controls */}
      <Card>
        <CardHeader><CardTitle>{t('league.season_title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {season ? t('league.season_status', { n: season.season_number, status: season.status }) : t('league.season_none')}
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={endSeason} disabled={!season || season.status === 'finished'}>
              {t('league.end_season')}
            </Button>
            <Button onClick={startNewSeason}>{t('league.new_season')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Rounds */}
      <Card>
        <CardHeader><CardTitle>{t('league.rounds_title', { count: rounds.length })}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <Input type="datetime-local" value={newRoundDate} onChange={e => setNewRoundDate(e.target.value)} className="max-w-xs" />
            <Button onClick={createRound}>{t('league.create_round')}</Button>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3">
            {rounds.map(r => (
              <div key={r.id} className="bg-card rounded border">
                <div className="flex items-center justify-between text-sm p-2 border-b">
                  <span className="font-medium">{t('league.round_label', { n: r.round_number, when: formatDate(r.scheduled_at, lang, 'datetime_short'), status: r.status })}</span>
                  <div className="flex gap-1">
                    <Input
                      type="datetime-local"
                      className="w-44 h-7 text-xs"
                      defaultValue={new Date(r.scheduled_at).toISOString().slice(0, 16)}
                      onBlur={e => e.target.value && updateRoundDate(r.id, e.target.value)}
                    />
                    {r.status === 'scheduled' && (
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => cancelRound(r.id)}>
                        {t('league.cancel_round')}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {(roundMatches[r.id] || []).map(m => {
                    const hasMatchRow = !!m.match_id && !!m.status;
                    const status = hasMatchRow ? (m.status as string) : t('league.match_pending');
                    const score = hasMatchRow ? `${m.home_score ?? 0} x ${m.away_score ?? 0}` : '-';
                    const busy = busyMatchId === (m.match_id || m.id);
                    const canStart = !hasMatchRow || status === 'scheduled';
                    const canSimulate = !hasMatchRow || status === 'scheduled' || status === 'live';
                    const canFinalize = status === 'live';
                    const canRestart = hasMatchRow;
                    return (
                      <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs p-1.5 bg-background rounded">
                        <span className="font-mono w-44 shrink-0">
                          {clubName(m.home_club_id)} {score} {clubName(m.away_club_id)}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{status}</Badge>
                        <div className="flex gap-1 ml-auto">
                          {canStart && (
                            <Button size="sm" className="h-6 text-[11px] px-2" disabled={busy}
                              onClick={() => runMatchAction(m, 'start')}>
                              {t('league.actions.start')}
                            </Button>
                          )}
                          {canSimulate && (
                            <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" disabled={busy}
                              onClick={() => runMatchAction(m, 'simulate')}>
                              {t('league.actions.simulate')}
                            </Button>
                          )}
                          {canFinalize && (
                            <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" disabled={busy}
                              onClick={() => runMatchAction(m, 'finalize')}>
                              {t('league.actions.finalize')}
                            </Button>
                          )}
                          {canRestart && (
                            <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" disabled={busy}
                              onClick={() => {
                                if (!confirm(t('league.restart_confirm'))) return;
                                runMatchAction(m, 'restart');
                              }}>
                              {t('league.actions.restart')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(roundMatches[r.id] || []).length === 0 && (
                    <div className="text-xs text-muted-foreground italic p-1">{t('league.no_matches_in_round')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// TIMES TAB
// ═══════════════════════════════════════════════════
function TimesTab({ clubs, onReload }: { clubs: Club[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const [selected, setSelected] = useState<Club | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [city, setCity] = useState('');
  const [formation, setFormation] = useState('');

  function openEdit(club: Club) {
    setSelected(club);
    setName(club.name);
    setShortName(club.short_name);
    setPrimaryColor(club.primary_color);
    setSecondaryColor(club.secondary_color);
    setCity(club.city || '');
    setFormation('');
    // Load current formation
    supabase.from('club_settings').select('default_formation').eq('club_id', club.id).maybeSingle()
      .then(({ data }) => setFormation(data?.default_formation || '4-4-2'));
  }

  async function saveClub() {
    if (!selected) return;
    const { error } = await supabase.rpc('admin_update_club', {
      p_club_id: selected.id,
      p_name: name.trim(),
      p_short_name: shortName.trim().toUpperCase(),
      p_primary_color: primaryColor,
      p_secondary_color: secondaryColor,
      p_city: city.trim(),
      p_formation: formation,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t('clubs_toast.saved'));
    setSelected(null);
    onReload();
  }

  async function fireManager(clubId: string) {
    const { error } = await supabase.rpc('admin_fire_manager', { p_club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success(t('clubs_toast.manager_fired')); onReload(); }
  }

  const FORMATIONS = ['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','4-2-3-1','5-3-2','5-4-1'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {clubs.map(club => (
          <Card key={club.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => openEdit(club)}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="font-bold flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: club.primary_color }} />
                  {club.name}
                </div>
                <div className="text-xs text-muted-foreground">{club.is_bot_managed ? t('clubs.type_bot') : t('clubs.type_human')} | {club.city}</div>
              </div>
              {!club.is_bot_managed && (
                <Button size="sm" variant="destructive" className="text-xs" onClick={e => { e.stopPropagation(); fireManager(club.id); }}>
                  {t('clubs.fire_manager')}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clubs.edit_title', { name: selected?.name })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t('clubs.name')} value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder={t('clubs.short_name')} value={shortName} onChange={e => setShortName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('clubs.primary_color')}</label>
                <Input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('clubs.secondary_color')}</label>
                <Input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
              </div>
            </div>
            <Input placeholder={t('clubs.city')} value={city} onChange={e => setCity(e.target.value)} />
            <Select value={formation} onValueChange={setFormation}>
              <SelectTrigger><SelectValue placeholder={t('clubs.formation')} /></SelectTrigger>
              <SelectContent>
                {FORMATIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={saveClub} className="w-full">{t('clubs.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FINANCAS TAB
// ═══════════════════════════════════════════════════
function FinancasTab({ clubs, finances, onReload }: { clubs: Club[]; finances: ClubFinance[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const [selectedClub, setSelectedClub] = useState('');
  const [clubAmount, setClubAmount] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerProfile[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [playerAmount, setPlayerAmount] = useState('');

  async function addClubMoney() {
    if (!selectedClub || !clubAmount) return;
    const amount = parseInt(clubAmount);
    if (!Number.isFinite(amount)) return;
    const { error } = await supabase.rpc('admin_adjust_club_balance', { p_club_id: selectedClub, p_amount: amount });
    if (error) toast.error(error.message);
    else {
      const formatted = `R$ ${Math.abs(amount).toLocaleString()}`;
      toast.success(amount >= 0 ? t('finances_toast.club_added', { amount: formatted }) : t('finances_toast.club_removed', { amount: formatted }));
      setClubAmount('');
      onReload();
    }
  }

  async function searchPlayer() {
    if (!playerSearch.trim()) return;
    const { data, error } = await supabase.rpc('admin_search_players', { p_query: playerSearch });
    if (error) { toast.error(error.message); return; }
    setPlayerResults((data || []) as any);
  }

  async function addPlayerMoney() {
    if (!selectedPlayer || !playerAmount) return;
    const amount = parseInt(playerAmount);
    if (!Number.isFinite(amount)) return;
    const { error } = await supabase.rpc('admin_adjust_player_money', { p_player_id: selectedPlayer.id, p_amount: amount });
    if (error) toast.error(error.message);
    else {
      const formatted = `R$ ${Math.abs(amount).toLocaleString()}`;
      const playerName = selectedPlayer.full_name || selectedPlayer.name || '';
      toast.success(amount >= 0
        ? t('finances_toast.player_added', { amount: formatted, name: playerName })
        : t('finances_toast.player_removed', { amount: formatted, name: playerName }));
      setPlayerAmount('');
      setSelectedPlayer(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Club finances */}
      <Card>
        <CardHeader><CardTitle>{t('finances.club_title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedClub} onValueChange={setSelectedClub}>
            <SelectTrigger><SelectValue placeholder={t('finances.select_club')} /></SelectTrigger>
            <SelectContent>
              {clubs.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} (R$ {(finances.find(f => f.club_id === c.id)?.balance || 0).toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="number" placeholder={t('finances.amount_placeholder')} value={clubAmount} onChange={e => setClubAmount(e.target.value)} />
            <Button onClick={addClubMoney}>{t('finances.apply')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Player finances */}
      <Card>
        <CardHeader><CardTitle>{t('finances.player_title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder={t('finances.search_placeholder')} value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlayer()} />
            <Button onClick={searchPlayer}>{t('finances.search')}</Button>
          </div>
          {playerResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {playerResults.map(p => (
                <div key={p.id}
                  className={`text-sm p-2 rounded cursor-pointer border ${selectedPlayer?.id === p.id ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                  onClick={() => setSelectedPlayer(p)}>
                  {p.full_name || p.name || t('finances.no_name')} | {p.primary_position} | R$ {(p.money || 0).toLocaleString()} | {clubs.find(c => c.id === p.club_id)?.name || t('finances.free_agent')}
                </div>
              ))}
            </div>
          )}
          {selectedPlayer && (
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium">{selectedPlayer.full_name || selectedPlayer.name}:</span>
              <Input type="number" placeholder={t('finances.value_placeholder')} value={playerAmount} onChange={e => setPlayerAmount(e.target.value)} className="max-w-40" />
              <Button onClick={addPlayerMoney}>{t('finances.apply')}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PARTIDAS TAB
// ═══════════════════════════════════════════════════
function PartidasTab({ matches, clubs, onReload }: { matches: MatchRow[]; clubs: Club[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const { current: lang } = useAppLanguage();
  const clubName = (id: string) => clubs.find(c => c.id === id)?.name || id.slice(0, 8);

  async function forceStart(matchId: string) {
    const now = new Date(Date.now() + 5000).toISOString(); // 5s in future
    const { error } = await supabase.from('matches').update({
      status: 'scheduled',
      scheduled_at: now,
    }).eq('id', matchId);
    if (error) toast.error(error.message);
    else { toast.success(t('matches_toast.scheduled_5s')); onReload(); }
  }

  async function cancelMatch(matchId: string) {
    const { error } = await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId);
    if (error) toast.error(error.message);
    else { toast.success(t('matches_toast.cancelled')); onReload(); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{t('matches.recent_title')}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {matches.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm p-2 bg-card rounded border">
                <div>
                  <span className="font-medium">{clubName(m.home_club_id)}</span>
                  <span className="mx-2">{m.home_score} x {m.away_score}</span>
                  <span className="font-medium">{clubName(m.away_club_id)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">[{m.status}] {formatDate(m.scheduled_at, lang, 'datetime_short')}</span>
                </div>
                <div className="flex gap-1">
                  {m.status === 'scheduled' && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => forceStart(m.id)}>
                      {t('matches.force_start')}
                    </Button>
                  )}
                  {(m.status === 'scheduled' || m.status === 'waiting') && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => cancelMatch(m.id)}>
                      {t('matches.cancel')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// JOGADORES TAB
// ═══════════════════════════════════════════════════
interface HumanPlayer {
  id: string;
  user_id: string;
  full_name: string;
  primary_position: string;
  secondary_position: string | null;
  overall: number;
  age: number;
  club_id: string | null;
  club_name: string | null;
  email: string | null;
}

interface StoreItem { id: string; name: string; category: string; level: number | null; bonus_type: string | null; duration: string | null; is_available: boolean; sort_order: number; }

function JogadoresTab({ clubs }: { clubs: Club[] }) {
  const { t } = useTranslation('admin');
  const [humanPlayers, setHumanPlayers] = useState<HumanPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialog, setAssignDialog] = useState<HumanPlayer | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [energyDraft, setEnergyDraft] = useState<Record<string, string>>({});
  const [itemsDialog, setItemsDialog] = useState<HumanPlayer | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [grantingItemId, setGrantingItemId] = useState<string | null>(null);

  useEffect(() => { loadHumanPlayers(); }, []);

  async function loadStoreItems() {
    if (storeItems.length > 0) return;
    const { data } = await supabase
      .from('store_items')
      .select('id, name, category, level, bonus_type, duration, is_available, sort_order')
      .order('category')
      .order('sort_order');
    setStoreItems((data || []) as any);
  }

  async function applyEnergy(playerId: string) {
    const raw = energyDraft[playerId];
    if (raw === undefined || raw === '') return;
    const val = parseInt(raw);
    if (!Number.isFinite(val)) { toast.error(t('players_toast.invalid_value')); return; }
    const { data, error } = await supabase.rpc('admin_set_player_energy', { p_player_id: playerId, p_energy: val });
    if (error) toast.error(error.message);
    else {
      toast.success(t('players_toast.energy_set', { value: data as number }));
      setEnergyDraft(prev => ({ ...prev, [playerId]: '' }));
    }
  }

  async function resetAvatar(userId: string, name: string) {
    if (!confirm(t('players.reset_avatar_confirm', { name }))) return;
    const { error } = await supabase.rpc('admin_reset_avatar', { p_user_id: userId });
    if (error) toast.error(error.message);
    else toast.success(t('players_toast.avatar_reset'));
  }

  async function grantItem(playerId: string, itemId: string) {
    setGrantingItemId(itemId);
    try {
      const { data, error } = await supabase.rpc('admin_grant_store_item', { p_player_id: playerId, p_item_id: itemId });
      if (error) toast.error(error.message);
      else {
        const r: any = data;
        toast.success(t('players_toast.item_granted', { item: r?.item_name || t('players_toast.item_default'), status: r?.status || 'ok' }));
      }
    } finally {
      setGrantingItemId(null);
    }
  }

  async function loadHumanPlayers() {
    setLoading(true);
    const { data: players } = await supabase
      .from('player_profiles')
      .select('id, user_id, full_name, primary_position, secondary_position, overall, age, club_id')
      .not('user_id', 'is', null)
      .order('full_name');

    if (!players || players.length === 0) { setHumanPlayers([]); setLoading(false); return; }

    const userIds = players.map(p => p.user_id).filter(Boolean);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, username')
      .in('id', userIds);
    const emailMap = new Map((profiles || []).map((p: any) => [p.id, p.email || p.username || null]));
    const clubMap = new Map(clubs.map(c => [c.id, c.name]));

    setHumanPlayers(players.map((p: any) => ({
      id: p.id,
      user_id: p.user_id,
      full_name: p.full_name || t('players.no_name'),
      primary_position: p.primary_position || '?',
      secondary_position: p.secondary_position ?? null,
      overall: p.overall ?? 0,
      age: p.age ?? 0,
      club_id: p.club_id,
      club_name: p.club_id ? (clubMap.get(p.club_id) || p.club_id?.slice(0, 8)) : null,
      email: emailMap.get(p.user_id) || null,
    })));
    setLoading(false);
  }

  async function handleLoginAs(player: HumanPlayer) {
    try {
      await navigator.clipboard.writeText(player.user_id);
      toast.success(t('players_toast.user_id_copied', { id: player.user_id }), { description: t('players_toast.user_id_copied_desc') });
    } catch {
      toast.info(t('players_toast.user_id_fallback', { id: player.user_id }));
    }
  }

  async function handleAssignClub() {
    if (!assignDialog || !selectedClubId) return;
    const { error } = await supabase.rpc('admin_assign_player_to_club', {
      p_player_id: assignDialog.id,
      p_club_id: selectedClubId,
    });
    if (error) { toast.error(t('players_toast.assign_error', { message: error.message })); return; }

    toast.success(t('players_toast.assigned', { name: assignDialog.full_name, club: clubs.find(c => c.id === selectedClubId)?.name }));
    setAssignDialog(null);
    setSelectedClubId('');
    loadHumanPlayers();
  }

  async function handleRemoveFromClub(player: HumanPlayer) {
    if (!player.club_id) return;
    const { error } = await supabase.rpc('admin_remove_player_from_club', { p_player_id: player.id });
    if (error) { toast.error(t('players_toast.remove_error', { message: error.message })); return; }
    toast.success(t('players_toast.removed', { name: player.full_name }));
    loadHumanPlayers();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('players.humans_title', { count: humanPlayers.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">{t('players.loading')}</div>
          ) : humanPlayers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">{t('players.empty')}</div>
          ) : (
            <div className="space-y-2">
              {humanPlayers.map(p => (
                <div key={p.id} className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-sm">{p.full_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {p.primary_position}{p.secondary_position ? ` / ${p.secondary_position}` : ''}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{t('players.ovr_label', { value: Math.round(p.overall) })}</span>
                        <Badge variant="secondary" className="text-[10px]">{p.age} anos</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {p.email && <span>{p.email}</span>}
                        {p.club_name ? (
                          <Badge className="text-[10px]" variant="secondary">{p.club_name}</Badge>
                        ) : (
                          <Badge className="text-[10px]" variant="destructive">{t('players.no_club')}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleLoginAs(p)}>
                        {t('players.copy_id')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssignDialog(p); setSelectedClubId(p.club_id || ''); }}>
                        {t('players.assign_club')}
                      </Button>
                      {p.club_id && (
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleRemoveFromClub(p)}>
                          {t('players.remove')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pl-1">
                    <span className="text-[11px] text-muted-foreground">{t('players.energy_label')}</span>
                    <Input
                      type="number"
                      placeholder={t('players.energy_placeholder')}
                      className="h-7 w-20 text-xs"
                      value={energyDraft[p.id] ?? ''}
                      onChange={e => setEnergyDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && applyEnergy(p.id)}
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyEnergy(p.id)}>
                      {t('players.apply')}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setItemsDialog(p); loadStoreItems(); }}>
                      {t('players.give_item')}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                      if (!confirm(`Envelhecer ${p.full_name} em +1 ano? (idade ${p.age} → ${p.age + 1})`)) return;
                      const { data, error } = await supabase.rpc('admin_age_player_one_year', { p_player_profile_id: p.id });
                      if (error) { toast.error(error.message); return; }
                      const r = data as any;
                      if (r?.ok === false) { toast.error(r.reason); return; }
                      toast.success(`${r.player}: ${r.old_age} → ${r.new_age}${r.decay_applied ? ' (decay aplicado)' : ''}`);
                      loadHumanPlayers();
                    }}>+1 ano</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={async () => {
                      if (!confirm(`Aposentar ${p.full_name}? Vai liberar como agente livre + encerrar contrato.`)) return;
                      const { error } = await supabase.rpc('admin_retire_player', { p_player_profile_id: p.id });
                      if (error) toast.error(error.message);
                      else { toast.success(`${p.full_name} aposentado`); loadHumanPlayers(); }
                    }}>Aposentar</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                      const { data, error } = await supabase.rpc('admin_mark_user_notifications_read', { p_user_id: p.user_id });
                      if (error) toast.error(error.message);
                      else toast.success(`${(data as any)?.marked_read ?? 0} notificações marcadas`);
                    }}>Ler notifs</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resetAvatar(p.user_id, p.full_name)}>
                      {t('players.reset_avatar')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!assignDialog} onOpenChange={open => { if (!open) setAssignDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('players.assign_dialog_title', { name: assignDialog?.full_name })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>{t('players.select_club')}</Label>
            <Select value={selectedClubId} onValueChange={setSelectedClubId}>
              <SelectTrigger><SelectValue placeholder={t('players.select_club_placeholder')} /></SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.is_bot_managed ? t('players.bot_suffix') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>{t('players.cancel')}</Button>
            <Button onClick={handleAssignClub} disabled={!selectedClubId}>{t('players.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemsDialog} onOpenChange={open => { if (!open) setItemsDialog(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('players.items_dialog_title', { name: itemsDialog?.full_name })}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {storeItems.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">{t('players.items_loading')}</div>
            ) : (
              storeItems.map(it => (
                <div key={it.id} className="flex items-center gap-2 p-2 rounded border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{it.category}</Badge>
                      {it.level !== null && <Badge variant="outline" className="text-[10px]">L{it.level}</Badge>}
                      {it.duration && <Badge variant="outline" className="text-[10px]">{it.duration}</Badge>}
                      {it.bonus_type && <Badge variant="outline" className="text-[10px]">{it.bonus_type}</Badge>}
                      {!it.is_available && <Badge variant="destructive" className="text-[10px]">{t('players.item_unavailable')}</Badge>}
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-xs" disabled={grantingItemId === it.id}
                    onClick={() => itemsDialog && grantItem(itemsDialog.id, it.id)}>
                    {t('players.give')}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsDialog(null)}>{t('players.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REPORTES TAB — image-report queue moderation
// ═══════════════════════════════════════════════════

interface ReportRow {
  id: string;
  reporter_user_id: string;
  reported_player_profile_id: string;
  reported_purchase_id: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  player_name: string;
  player_user_id: string | null;
  reporter_email: string | null;
  bg_image_url: string | null;
  bg_variant: string | null;
}

function ReportsTab({ onActionComplete }: { onActionComplete?: () => void }) {
  const { t } = useTranslation('admin');
  const { current: lang } = useAppLanguage();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [actionTarget, setActionTarget] = useState<{ id: string; action: 'remove' | 'dismiss'; playerName: string; imageUrl: string | null } | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');

  useEffect(() => { loadReports(); }, [statusFilter]);

  async function loadReports() {
    setLoading(true);
    try {
      // Direct table query — admin RLS policy on image_reports allows full
      // read. We then resolve player names + reporter emails via secondary
      // queries since the report only carries IDs.
      let query = (supabase as any).from('image_reports').select('*').order('created_at', { ascending: false });
      if (statusFilter === 'pending') query = query.eq('status', 'pending');
      const { data: rows, error } = await query.limit(100);
      if (error) { toast.error(error.message); return; }
      const list = (rows || []) as any[];
      if (list.length === 0) { setReports([]); return; }

      const playerIds = [...new Set(list.map(r => r.reported_player_profile_id))];
      const reporterIds = [...new Set(list.map(r => r.reporter_user_id))];
      const purchaseIds = [...new Set(list.map(r => r.reported_purchase_id).filter(Boolean))];

      const [playersRes, reportersRes, purchasesRes] = await Promise.all([
        (supabase as any).from('player_profiles').select('id, full_name, user_id').in('id', playerIds),
        (supabase as any).from('profiles').select('id, email').in('id', reporterIds),
        purchaseIds.length
          ? (supabase as any).from('store_purchases').select('id, bg_image_url, bg_variant').in('id', purchaseIds)
          : Promise.resolve({ data: [] }),
      ]);

      const playerById = new Map((playersRes.data || []).map((p: any) => [p.id, p]));
      const reporterById = new Map((reportersRes.data || []).map((r: any) => [r.id, r]));
      const purchaseById = new Map((purchasesRes.data || []).map((p: any) => [p.id, p]));

      setReports(list.map(r => {
        const player = playerById.get(r.reported_player_profile_id) as any;
        const reporter = reporterById.get(r.reporter_user_id) as any;
        const purchase = r.reported_purchase_id ? purchaseById.get(r.reported_purchase_id) as any : null;
        return {
          id: r.id,
          reporter_user_id: r.reporter_user_id,
          reported_player_profile_id: r.reported_player_profile_id,
          reported_purchase_id: r.reported_purchase_id,
          reason: r.reason,
          status: r.status,
          created_at: r.created_at,
          player_name: player?.full_name || r.reported_player_profile_id.slice(0, 8),
          player_user_id: player?.user_id ?? null,
          reporter_email: reporter?.email ?? null,
          bg_image_url: purchase?.bg_image_url ?? null,
          bg_variant: purchase?.bg_variant ?? null,
        };
      }));
    } finally {
      setLoading(false);
    }
  }

  function openAction(report: ReportRow, action: 'remove' | 'dismiss') {
    setActionTarget({ id: report.id, action, playerName: report.player_name, imageUrl: report.bg_image_url });
    setReviewerNote('');
  }

  async function confirmAction() {
    if (!actionTarget) return;
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_action_image_report', {
        p_report_id: actionTarget.id,
        p_action: actionTarget.action,
        p_note: reviewerNote.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }

      // For 'remove' actions also delete the underlying file from storage
      // so the inappropriate content is purged. Admin storage RLS policy
      // (added in the same migration) grants delete on this bucket.
      if (actionTarget.action === 'remove' && actionTarget.imageUrl) {
        const path = extractStoragePath(actionTarget.imageUrl);
        if (path) {
          const { error: rmErr } = await supabase.storage.from('player-backgrounds').remove([path]);
          if (rmErr) console.warn('Storage delete failed:', rmErr.message);
        }
      }

      toast.success(result?.message || 'OK');
      setActionTarget(null);
      loadReports();
      onActionComplete?.();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setActing(false);
    }
  }

  // Pulls the storage object path out of a public URL like
  //   https://<ref>.supabase.co/storage/v1/object/public/player-backgrounds/<uid>/<file>.png
  // returning '<uid>/<file>.png'.
  function extractStoragePath(publicUrl: string): string | null {
    const marker = '/player-backgrounds/';
    const i = publicUrl.indexOf(marker);
    return i === -1 ? null : publicUrl.slice(i + marker.length);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          {t('reports.title', { defaultValue: 'Reportes de imagem' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t('reports.filter_pending', { defaultValue: 'Pendentes' })}</SelectItem>
              <SelectItem value="all">{t('reports.filter_all', { defaultValue: 'Todos' })}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : t('reports.refresh', { defaultValue: 'Atualizar' })}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('reports.empty', { defaultValue: 'Nenhum reporte encontrado.' })}
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-3">
                  {r.bg_image_url ? (
                    <a
                      href={r.bg_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 hover:opacity-80 transition-opacity"
                      title="Abrir em tamanho real"
                    >
                      <img
                        src={r.bg_image_url}
                        alt="background"
                        className="w-32 h-20 object-cover rounded border border-border"
                      />
                    </a>
                  ) : (
                    <div className="w-32 h-20 bg-muted rounded border border-border shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">
                      {t('reports.no_image', { defaultValue: 'Sem imagem' })}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/player/${r.reported_player_profile_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-bold text-sm hover:underline hover:text-tactical transition-colors"
                      >
                        {r.player_name} ↗
                      </Link>
                      <Badge variant={r.status === 'pending' ? 'destructive' : 'outline'} className="text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t('reports.reported_by', { defaultValue: 'Reportado por' })}: {r.reporter_email || r.reporter_user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(r.created_at, lang, 'datetime_short')}
                    </p>
                    {r.reason && (
                      <p className="text-xs mt-1 italic text-muted-foreground bg-muted/40 p-1.5 rounded">
                        "{r.reason}"
                      </p>
                    )}
                  </div>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => openAction(r, 'remove')}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t('reports.remove', { defaultValue: 'Remover imagem' })}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAction(r, 'dismiss')}>
                      <X className="h-3 w-3 mr-1" />
                      {t('reports.dismiss', { defaultValue: 'Descartar reporte' })}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Action confirmation dialog */}
      <Dialog open={!!actionTarget} onOpenChange={(open) => { if (!acting && !open) setActionTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === 'remove'
                ? t('reports.confirm_remove_title', { defaultValue: 'Remover imagem?' })
                : t('reports.confirm_dismiss_title', { defaultValue: 'Descartar reporte?' })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {actionTarget?.action === 'remove'
              ? t('reports.confirm_remove_body', { defaultValue: 'A imagem de fundo de {{name}} será desativada e o arquivo removido permanentemente. Reportes pendentes do mesmo jogador serão fechados automaticamente.', name: actionTarget?.playerName ?? '' })
              : t('reports.confirm_dismiss_body', { defaultValue: 'Marca o reporte como descartado sem afetar o jogador.' })}
          </p>
          <Textarea
            value={reviewerNote}
            onChange={e => setReviewerNote(e.target.value.slice(0, 500))}
            placeholder={t('reports.note_placeholder', { defaultValue: 'Nota interna (opcional)...' })}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={acting}>
              {t('reports.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button
              variant={actionTarget?.action === 'remove' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={acting}
            >
              {acting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {actionTarget?.action === 'remove'
                ? t('reports.confirm_remove', { defaultValue: 'Remover' })
                : t('reports.confirm_dismiss', { defaultValue: 'Descartar' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═══════════════════════════════════════════════════
// OPERAÇÕES TAB — season-end controls + league CRUD
// ═══════════════════════════════════════════════════
function OperationsTab({ leagues, seasons, clubs, onReload }: { leagues: League[]; seasons: LeagueSeason[]; clubs: Club[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const [busy, setBusy] = useState<string | null>(null);
  const [bumpDays, setBumpDays] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [moveClubId, setMoveClubId] = useState('');
  const [moveLeagueId, setMoveLeagueId] = useState('');

  const currentYear = Math.max(0, ...seasons.map(s => s.season_number));
  const openSeasons = seasons.filter(s => s.season_number === currentYear && s.status !== 'finished');

  async function fire(label: string, fn: () => Promise<{ data: any; error: any } | { error: any }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(label);
    try {
      const res = await fn();
      const err = (res as any).error;
      const data = (res as any).data;
      if (err) {
        toast.error(err.message || String(err));
      } else if (data?.ok === false) {
        toast.error(`${label}: ${data.reason || 'falhou'}`);
      } else {
        const summary = data ? Object.entries(data).filter(([k]) => k !== 'ok').map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
        toast.success(summary ? `${label} ✓ — ${summary}` : `${label} ✓`);
        onReload();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* PÉTREO controls */}
      <Card>
        <CardHeader><CardTitle>Encerrar temporada (regra pétrea)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Game year atual: <strong>Temp {currentYear || '—'}</strong>. Encerrar dispara o trigger pétreo:
            todas as ligas em aberto no mesmo ano viram <code>finished</code>, awards + MVP poll abrem por liga,
            recap é gerado, aging roda, Season N+1 é criada pra todo mundo com datas espelhadas.
          </p>
          <Button
            variant="destructive"
            disabled={openSeasons.length === 0 || busy === 'finish'}
            onClick={() => fire(
              'Forçar fim de temporada',
              async () => await supabase.rpc('admin_force_finish_current_season'),
              `Vai encerrar ${openSeasons.length} season(s) abertas. Confirma?`,
            )}
          >
            {busy === 'finish' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Forçar fim do Game Year {currentYear}
          </Button>
        </CardContent>
      </Card>

      {/* Bump round dates */}
      <Card>
        <CardHeader><CardTitle>Mudar datas das rodadas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger><SelectValue placeholder="Escolha a temporada" /></SelectTrigger>
            <SelectContent>
              {seasons.map(s => {
                const lg = leagues.find(l => l.id === s.league_id);
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {lg?.name || 'Liga'} · Temp {s.season_number} · {s.status}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center">
            <Input type="number" placeholder="Dias (+/-)" value={bumpDays} onChange={e => setBumpDays(e.target.value)} className="max-w-32" />
            <Button
              disabled={!selectedSeason || !bumpDays || busy === 'bump'}
              onClick={() => fire(
                'Mudar datas',
                async () => await supabase.rpc('admin_bump_round_dates', { p_season_id: selectedSeason, p_delta_days: parseInt(bumpDays) }),
              )}
            >
              {busy === 'bump' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Aplicar shift
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ex: <strong>+14</strong> empurra todas as rodadas 2 semanas pra frente. <strong>-7</strong> antecipa em 1 semana.
          </p>
        </CardContent>
      </Card>

      {/* Cascade rounds → finished */}
      <Card>
        <CardHeader><CardTitle>Cascade rodadas → finished</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Defensivo — quando uma intervenção manual deixa rodadas com <code>status='scheduled'</code> mas a season está finished.
            Hoje o trigger <code>league_season_finish_cascade</code> faz isso automático em transições normais.
          </p>
          <div className="flex gap-2 items-center">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Escolha a temporada" /></SelectTrigger>
              <SelectContent>
                {seasons.map(s => {
                  const lg = leagues.find(l => l.id === s.league_id);
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {lg?.name || 'Liga'} · Temp {s.season_number} · {s.status}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!selectedSeason || busy === 'cascade'}
              onClick={() => fire(
                'Cascade rodadas',
                async () => await supabase.rpc('admin_cascade_finish_rounds', { p_season_id: selectedSeason }),
              )}
            >
              {busy === 'cascade' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Marcar rodadas como finished
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Liga CRUD */}
      <Card>
        <CardHeader><CardTitle>Ligas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {leagues.map(lg => {
              const lgClubs = clubs.filter(c => c.league_id === lg.id).length;
              const lgSeasons = seasons.filter(s => s.league_id === lg.id).length;
              const empty = lgClubs === 0 && lgSeasons === 0;
              return (
                <div key={lg.id} className="flex items-center justify-between text-sm p-2 bg-card rounded border">
                  <div>
                    <span className="font-medium">{lg.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{lgClubs} clubes · {lgSeasons} seasons</span>
                  </div>
                  {empty && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      disabled={busy === `del-${lg.id}`}
                      onClick={() => fire(
                        'Apagar liga vazia',
                        async () => await supabase.rpc('admin_delete_empty_league', { p_league_id: lg.id }),
                        `Apagar a liga "${lg.name}"? (ela está vazia)`,
                      )}
                    >
                      Apagar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground pt-2">
            Pra criar uma nova divisão (Série C, etc.), chame a edge function <code>league-seed</code> com action <code>seed_serie_b</code> ou crie uma variante. Vou expor um botão aqui depois de generalizar a função.
          </p>
        </CardContent>
      </Card>

      {/* Mover clube entre ligas */}
      <Card>
        <CardHeader><CardTitle>Mover clube entre ligas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={moveClubId} onValueChange={setMoveClubId}>
            <SelectTrigger><SelectValue placeholder="Clube" /></SelectTrigger>
            <SelectContent>
              {clubs.map(c => {
                const lg = leagues.find(l => l.id === c.league_id);
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {lg ? `(${lg.name})` : '(sem liga)'}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select value={moveLeagueId} onValueChange={setMoveLeagueId}>
            <SelectTrigger><SelectValue placeholder="Liga destino" /></SelectTrigger>
            <SelectContent>
              {leagues.map(lg => (
                <SelectItem key={lg.id} value={lg.id}>{lg.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!moveClubId || !moveLeagueId || busy === 'move'}
            onClick={() => fire(
              'Mover clube',
              async () => await supabase.rpc('admin_move_club_to_league', { p_club_id: moveClubId, p_target_league_id: moveLeagueId }),
            )}
          >
            {busy === 'move' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Mover
          </Button>
        </CardContent>
      </Card>

      {/* Aging + decay */}
      <Card>
        <CardHeader><CardTitle>Aging + Decay</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Aging é idempotente por season — rodar de novo retorna <code>skipped</code>. Decay aplica a um jogador específico (já dispara automático no aging).
          </p>
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger><SelectValue placeholder="Season pra rodar aging" /></SelectTrigger>
            <SelectContent>
              {seasons.map(s => {
                const lg = leagues.find(l => l.id === s.league_id);
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {lg?.name || 'Liga'} · Temp {s.season_number} · {s.status}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            disabled={!selectedSeason || busy === 'aging'}
            onClick={() => fire(
              'Rodar aging',
              async () => await supabase.rpc('admin_run_aging', { p_season_id: selectedSeason }),
              'Aging vai +1 idade em todos os ativos. Confirmar?',
            )}
          >
            {busy === 'aging' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Rodar aging desta season
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PRÊMIOS TAB — Round/Season MVP polls + auto-awards
// ═══════════════════════════════════════════════════
interface AwardPoll {
  id: string;
  scope: string;
  scope_entity_id: string;
  status: string;
  closes_at: string;
  candidates_n: number;
}

function AwardsTab({ seasons, rounds, leagues, onReload }: { seasons: LeagueSeason[]; rounds: LeagueRound[]; leagues: League[]; onReload: () => void }) {
  const { t } = useTranslation('admin');
  const [polls, setPolls] = useState<AwardPoll[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [selRound, setSelRound] = useState('');
  const [selSeason, setSelSeason] = useState('');

  async function loadPolls() {
    const { data } = await (supabase as any)
      .from('player_award_polls')
      .select('id, scope, scope_entity_id, status, closes_at, candidates')
      .order('opens_at', { ascending: false })
      .limit(50);
    setPolls((data || []).map((p: any) => ({
      id: p.id,
      scope: p.scope,
      scope_entity_id: p.scope_entity_id,
      status: p.status,
      closes_at: p.closes_at,
      candidates_n: Array.isArray(p.candidates) ? p.candidates.length : 0,
    })));
  }

  useEffect(() => { loadPolls(); }, []);

  async function fire(label: string, fn: () => Promise<{ data: any; error: any }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(label);
    try {
      const { data, error } = await fn();
      if (error) toast.error(error.message);
      else if (data?.ok === false) toast.error(`${label}: ${data.reason || 'falhou'}`);
      else {
        const summary = data ? Object.entries(data).filter(([k]) => k !== 'ok').map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
        toast.success(summary ? `${label} ✓ — ${summary}` : `${label} ✓`);
        await loadPolls();
        onReload();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Polls de MVP</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" onClick={loadPolls}>Recarregar</Button>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {polls.length === 0 && <p className="text-xs text-muted-foreground">Nenhum poll.</p>}
            {polls.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-card rounded border">
                <div className="flex-1 min-w-0">
                  <Badge variant={p.status === 'open' ? 'default' : 'outline'} className="text-[10px] mr-2">
                    {p.scope} · {p.status}
                  </Badge>
                  <span className="font-mono text-[10px]">{p.scope_entity_id.slice(0, 8)}</span>
                  <span className="ml-2 text-muted-foreground">{p.candidates_n} candidatos · fecha {new Date(p.closes_at).toLocaleString()}</span>
                </div>
                {p.status === 'open' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 text-[10px] px-2"
                    disabled={busy === `close-${p.id}`}
                    onClick={() => fire(
                      'Fechar poll',
                      async () => await supabase.rpc('admin_close_award_poll', { p_poll_id: p.id }),
                      'Apurar vencedor com os votos atuais e fechar?',
                    )}
                  >
                    Fechar agora
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abrir Round MVP poll</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selRound} onValueChange={setSelRound}>
            <SelectTrigger><SelectValue placeholder="Escolha a rodada" /></SelectTrigger>
            <SelectContent>
              {rounds
                .filter(r => r.status === 'finished')
                .sort((a, b) => b.round_number - a.round_number)
                .slice(0, 50)
                .map(r => {
                  const season = seasons.find(s => s.id === r.season_id);
                  const lg = season ? leagues.find(l => l.id === season.league_id) : null;
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      {lg?.name || 'Liga'} · Temp {season?.season_number ?? '?'} · Rodada {r.round_number}
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
          <Button
            disabled={!selRound || busy === 'open-round'}
            onClick={() => fire(
              'Abrir Round MVP',
              async () => await supabase.rpc('admin_open_round_mvp_poll', { p_round_id: selRound }),
            )}
          >
            {busy === 'open-round' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Abrir poll
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abrir Season MVP poll</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selSeason} onValueChange={setSelSeason}>
            <SelectTrigger><SelectValue placeholder="Escolha a season" /></SelectTrigger>
            <SelectContent>
              {seasons.map(s => {
                const lg = leagues.find(l => l.id === s.league_id);
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {lg?.name || 'Liga'} · Temp {s.season_number} · {s.status}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            disabled={!selSeason || busy === 'open-season'}
            onClick={() => fire(
              'Abrir Season MVP',
              async () => await supabase.rpc('admin_open_season_mvp_poll', { p_season_id: selSeason }),
            )}
          >
            {busy === 'open-season' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Abrir poll
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Regenerar auto-awards</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Recalcula artilheiro / assistências / desarmes / luva de ouro / fair play da season escolhida. Idempotente
            (UNIQUE no <code>player_awards</code>) — fica seguro chamar de novo se você mudou stats e quer atualizar.
          </p>
          <Select value={selSeason} onValueChange={setSelSeason}>
            <SelectTrigger><SelectValue placeholder="Escolha a season" /></SelectTrigger>
            <SelectContent>
              {seasons.map(s => {
                const lg = leagues.find(l => l.id === s.league_id);
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {lg?.name || 'Liga'} · Temp {s.season_number} · {s.status}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            disabled={!selSeason || busy === 'awards'}
            onClick={() => fire(
              'Regenerar auto-awards',
              async () => await supabase.rpc('admin_persist_season_auto_awards', { p_season_id: selSeason }),
            )}
          >
            {busy === 'awards' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Regenerar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
