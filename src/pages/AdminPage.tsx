import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

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
  const [clubs, setClubs] = useState<Club[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [finances, setFinances] = useState<ClubFinance[]>([]);

  // ─── Load data ───
  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
  }, [isAdmin]);

  async function loadAll() {
    const [clubsRes, leaguesRes, seasonsRes, roundsRes, matchesRes, financesRes] = await Promise.all([
      supabase.from('clubs').select('*').order('name'),
      supabase.from('leagues').select('*'),
      supabase.from('league_seasons').select('*').order('season_number', { ascending: false }),
      supabase.from('league_rounds').select('*').order('round_number'),
      supabase.from('matches').select('*').order('scheduled_at', { ascending: false }).limit(50),
      supabase.from('club_finances').select('*'),
    ]);
    setClubs((clubsRes.data || []) as any);
    setLeagues((leaguesRes.data || []) as any);
    setSeasons((seasonsRes.data || []) as any);
    setRounds((roundsRes.data || []) as any);
    setMatches((matchesRes.data || []) as any);
    setFinances((financesRes.data || []) as any);
  }

  const clubName = (id: string) => clubs.find(c => c.id === id)?.name || id.slice(0, 8);

  if (!isAdmin) return <div className="p-8 text-center">Acesso negado</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold font-display mb-6">Painel Admin</h1>

      <Tabs defaultValue="liga" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="liga">Liga</TabsTrigger>
          <TabsTrigger value="times">Times</TabsTrigger>
          <TabsTrigger value="financas">Financas</TabsTrigger>
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
          <TabsTrigger value="jogadores">Jogadores</TabsTrigger>
        </TabsList>

        {/* ═══ LIGA TAB ═══ */}
        <TabsContent value="liga">
          <LigaTab leagues={leagues} seasons={seasons} rounds={rounds} clubs={clubs} onReload={loadAll} />
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

  async function runMatchAction(matchId: string, kind: 'start' | 'simulate' | 'finalize' | 'restart') {
    setBusyMatchId(matchId);
    try {
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
        toast.success({ start: 'Iniciada', simulate: 'Simulada', finalize: 'Finalizada', restart: 'Reiniciada' }[kind]);
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
    else { toast.success('Horario atualizado'); onReload(); }
  }

  async function cancelRound(roundId: string) {
    const { error } = await supabase.from('league_rounds').update({ status: 'cancelled' }).eq('id', roundId);
    if (error) toast.error(error.message);
    else { toast.success('Rodada cancelada'); onReload(); }
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
    else { toast.success(`Rodada ${maxRound + 1} criada`); setNewRoundDate(''); onReload(); }
  }

  async function endSeason() {
    if (!season) return;
    const { error } = await supabase.from('league_seasons').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', season.id);
    if (error) toast.error(error.message);
    else { toast.success('Temporada finalizada'); onReload(); }
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
    else { toast.success(`Temporada ${newSeasonNum} criada`); onReload(); }
  }

  async function updateRoundDate(roundId: string, newDate: string) {
    const { error } = await supabase.from('league_rounds').update({ scheduled_at: new Date(newDate).toISOString() }).eq('id', roundId);
    if (error) toast.error(error.message);
    else { toast.success('Data da rodada atualizada'); onReload(); }
  }

  return (
    <div className="space-y-6">
      {/* Schedule */}
      <Card>
        <CardHeader><CardTitle>Horarios da Liga</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {league && (
            <div className="text-sm text-muted-foreground mb-2">
              Atual: {league.match_day_1} + {league.match_day_2} as {league.match_time}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Select value={matchDay1} onValueChange={setMatchDay1}>
              <SelectTrigger><SelectValue placeholder="Dia 1" /></SelectTrigger>
              <SelectContent>
                {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={matchDay2} onValueChange={setMatchDay2}>
              <SelectTrigger><SelectValue placeholder="Dia 2" /></SelectTrigger>
              <SelectContent>
                {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Horario (ex: 21:00)" value={matchTime} onChange={e => setMatchTime(e.target.value)} />
          </div>
          <Button onClick={updateSchedule}>Salvar Horario</Button>
        </CardContent>
      </Card>

      {/* Season controls */}
      <Card>
        <CardHeader><CardTitle>Temporada</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {season ? `Temporada ${season.season_number} - Status: ${season.status}` : 'Nenhuma temporada'}
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={endSeason} disabled={!season || season.status === 'finished'}>
              Finalizar Temporada
            </Button>
            <Button onClick={startNewSeason}>Nova Temporada</Button>
          </div>
        </CardContent>
      </Card>

      {/* Rounds */}
      <Card>
        <CardHeader><CardTitle>Rodadas ({rounds.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <Input type="datetime-local" value={newRoundDate} onChange={e => setNewRoundDate(e.target.value)} className="max-w-xs" />
            <Button onClick={createRound}>Criar Rodada</Button>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3">
            {rounds.map(r => (
              <div key={r.id} className="bg-card rounded border">
                <div className="flex items-center justify-between text-sm p-2 border-b">
                  <span className="font-medium">R{r.round_number} - {new Date(r.scheduled_at).toLocaleString('pt-BR')} [{r.status}]</span>
                  <div className="flex gap-1">
                    <Input
                      type="datetime-local"
                      className="w-44 h-7 text-xs"
                      defaultValue={new Date(r.scheduled_at).toISOString().slice(0, 16)}
                      onBlur={e => e.target.value && updateRoundDate(r.id, e.target.value)}
                    />
                    {r.status === 'scheduled' && (
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => cancelRound(r.id)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {(roundMatches[r.id] || []).map(m => {
                    const hasMatchRow = !!m.match_id && !!m.status;
                    const status = m.status || 'pendente';
                    const score = hasMatchRow ? `${m.home_score ?? 0} x ${m.away_score ?? 0}` : '-';
                    const busy = busyMatchId === m.match_id;
                    return (
                      <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs p-1.5 bg-background rounded">
                        <span className="font-mono w-44 shrink-0">
                          {clubName(m.home_club_id)} {score} {clubName(m.away_club_id)}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{status}</Badge>
                        {!hasMatchRow && (
                          <span className="text-muted-foreground italic">aguardando materializar (5min antes)</span>
                        )}
                        {hasMatchRow && (
                          <div className="flex gap-1 ml-auto">
                            {status === 'scheduled' && (
                              <Button size="sm" className="h-6 text-[11px] px-2" disabled={busy}
                                onClick={() => m.match_id && runMatchAction(m.match_id, 'start')}>
                                Iniciar
                              </Button>
                            )}
                            {(status === 'scheduled' || status === 'live') && (
                              <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" disabled={busy}
                                onClick={() => m.match_id && runMatchAction(m.match_id, 'simulate')}>
                                Simular
                              </Button>
                            )}
                            {status === 'live' && (
                              <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" disabled={busy}
                                onClick={() => m.match_id && runMatchAction(m.match_id, 'finalize')}>
                                Finalizar
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" disabled={busy}
                              onClick={() => {
                                if (!m.match_id) return;
                                if (!confirm('Reiniciar a partida zera placar e apaga eventos. Continuar?')) return;
                                runMatchAction(m.match_id, 'restart');
                              }}>
                              Reiniciar
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(roundMatches[r.id] || []).length === 0 && (
                    <div className="text-xs text-muted-foreground italic p-1">Sem partidas nesta rodada.</div>
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
    toast.success('Time salvo');
    setSelected(null);
    onReload();
  }

  async function fireManager(clubId: string) {
    const { error } = await supabase.rpc('admin_fire_manager', { p_club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success('Treinador demitido, time voltou a ser bot'); onReload(); }
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
                <div className="text-xs text-muted-foreground">{club.is_bot_managed ? 'Bot' : 'Humano'} | {club.city}</div>
              </div>
              {!club.is_bot_managed && (
                <Button size="sm" variant="destructive" className="text-xs" onClick={e => { e.stopPropagation(); fireManager(club.id); }}>
                  Demitir
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="Sigla" value={shortName} onChange={e => setShortName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Cor primaria</label>
                <Input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cor secundaria</label>
                <Input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
              </div>
            </div>
            <Input placeholder="Cidade" value={city} onChange={e => setCity(e.target.value)} />
            <Select value={formation} onValueChange={setFormation}>
              <SelectTrigger><SelectValue placeholder="Formacao" /></SelectTrigger>
              <SelectContent>
                {FORMATIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={saveClub} className="w-full">Salvar</Button>
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
      toast.success(`R$ ${amount.toLocaleString()} ${amount >= 0 ? 'adicionado' : 'removido'}`);
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
      toast.success(`R$ ${amount.toLocaleString()} ${amount >= 0 ? 'adicionado' : 'removido'} para ${selectedPlayer.full_name || selectedPlayer.name}`);
      setPlayerAmount('');
      setSelectedPlayer(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Club finances */}
      <Card>
        <CardHeader><CardTitle>Dinheiro do Time</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedClub} onValueChange={setSelectedClub}>
            <SelectTrigger><SelectValue placeholder="Selecione um time" /></SelectTrigger>
            <SelectContent>
              {clubs.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} (R$ {(finances.find(f => f.club_id === c.id)?.balance || 0).toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="number" placeholder="Valor (negativo = retirar)" value={clubAmount} onChange={e => setClubAmount(e.target.value)} />
            <Button onClick={addClubMoney}>Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Player finances */}
      <Card>
        <CardHeader><CardTitle>Dinheiro do Jogador</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Buscar jogador por nome" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlayer()} />
            <Button onClick={searchPlayer}>Buscar</Button>
          </div>
          {playerResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {playerResults.map(p => (
                <div key={p.id}
                  className={`text-sm p-2 rounded cursor-pointer border ${selectedPlayer?.id === p.id ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                  onClick={() => setSelectedPlayer(p)}>
                  {p.full_name || p.name || 'Sem nome'} | {p.primary_position} | R$ {(p.money || 0).toLocaleString()} | {clubs.find(c => c.id === p.club_id)?.name || 'Free agent'}
                </div>
              ))}
            </div>
          )}
          {selectedPlayer && (
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium">{selectedPlayer.full_name || selectedPlayer.name}:</span>
              <Input type="number" placeholder="Valor" value={playerAmount} onChange={e => setPlayerAmount(e.target.value)} className="max-w-40" />
              <Button onClick={addPlayerMoney}>Aplicar</Button>
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
  const clubName = (id: string) => clubs.find(c => c.id === id)?.name || id.slice(0, 8);

  async function forceStart(matchId: string) {
    const now = new Date(Date.now() + 5000).toISOString(); // 5s in future
    const { error } = await supabase.from('matches').update({
      status: 'scheduled',
      scheduled_at: now,
    }).eq('id', matchId);
    if (error) toast.error(error.message);
    else { toast.success('Partida agendada para iniciar em 5s'); onReload(); }
  }

  async function cancelMatch(matchId: string) {
    const { error } = await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId);
    if (error) toast.error(error.message);
    else { toast.success('Partida cancelada'); onReload(); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Partidas Recentes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {matches.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm p-2 bg-card rounded border">
                <div>
                  <span className="font-medium">{clubName(m.home_club_id)}</span>
                  <span className="mx-2">{m.home_score} x {m.away_score}</span>
                  <span className="font-medium">{clubName(m.away_club_id)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">[{m.status}] {new Date(m.scheduled_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex gap-1">
                  {m.status === 'scheduled' && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => forceStart(m.id)}>
                      Forcar Inicio
                    </Button>
                  )}
                  {(m.status === 'scheduled' || m.status === 'waiting') && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => cancelMatch(m.id)}>
                      Cancelar
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
  overall: number;
  club_id: string | null;
  club_name: string | null;
  email: string | null;
}

interface StoreItem { id: string; name: string; category: string; level: number | null; bonus_type: string | null; duration: string | null; is_available: boolean; sort_order: number; }

function JogadoresTab({ clubs }: { clubs: Club[] }) {
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
    if (!Number.isFinite(val)) { toast.error('Valor inválido'); return; }
    const { data, error } = await supabase.rpc('admin_set_player_energy', { p_player_id: playerId, p_energy: val });
    if (error) toast.error(error.message);
    else {
      toast.success(`Energia setada para ${data}`);
      setEnergyDraft(prev => ({ ...prev, [playerId]: '' }));
    }
  }

  async function resetAvatar(userId: string, name: string) {
    if (!confirm(`Resetar avatar de ${name}? Ele será obrigado a recriar no próximo login.`)) return;
    const { error } = await supabase.rpc('admin_reset_avatar', { p_user_id: userId });
    if (error) toast.error(error.message);
    else toast.success('Avatar resetado');
  }

  async function grantItem(playerId: string, itemId: string) {
    setGrantingItemId(itemId);
    try {
      const { data, error } = await supabase.rpc('admin_grant_store_item', { p_player_id: playerId, p_item_id: itemId });
      if (error) toast.error(error.message);
      else {
        const r: any = data;
        toast.success(`${r?.item_name || 'Item'} concedido (${r?.status || 'ok'})`);
      }
    } finally {
      setGrantingItemId(null);
    }
  }

  async function loadHumanPlayers() {
    setLoading(true);
    const { data: players } = await supabase
      .from('player_profiles')
      .select('id, user_id, full_name, primary_position, overall, club_id')
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
      full_name: p.full_name || 'Sem nome',
      primary_position: p.primary_position || '?',
      overall: p.overall ?? 0,
      club_id: p.club_id,
      club_name: p.club_id ? (clubMap.get(p.club_id) || p.club_id?.slice(0, 8)) : null,
      email: emailMap.get(p.user_id) || null,
    })));
    setLoading(false);
  }

  async function handleLoginAs(player: HumanPlayer) {
    try {
      await navigator.clipboard.writeText(player.user_id);
      toast.success(`User ID copiado: ${player.user_id}`, { description: 'Use no Supabase Dashboard > Authentication para gerar magic link.' });
    } catch {
      toast.info(`User ID: ${player.user_id}`);
    }
  }

  async function handleAssignClub() {
    if (!assignDialog || !selectedClubId) return;
    const { error } = await supabase.rpc('admin_assign_player_to_club', {
      p_player_id: assignDialog.id,
      p_club_id: selectedClubId,
    });
    if (error) { toast.error('Erro ao atribuir clube: ' + error.message); return; }

    toast.success(`${assignDialog.full_name} atribuído ao ${clubs.find(c => c.id === selectedClubId)?.name}`);
    setAssignDialog(null);
    setSelectedClubId('');
    loadHumanPlayers();
  }

  async function handleRemoveFromClub(player: HumanPlayer) {
    if (!player.club_id) return;
    const { error } = await supabase.rpc('admin_remove_player_from_club', { p_player_id: player.id });
    if (error) { toast.error('Erro ao remover: ' + error.message); return; }
    toast.success(`${player.full_name} removido do clube`);
    loadHumanPlayers();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Jogadores Humanos ({humanPlayers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Carregando...</div>
          ) : humanPlayers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Nenhum jogador humano encontrado.</div>
          ) : (
            <div className="space-y-2">
              {humanPlayers.map(p => (
                <div key={p.id} className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-sm">{p.full_name}</span>
                        <Badge variant="outline" className="text-[10px]">{p.primary_position}</Badge>
                        <span className="text-xs text-muted-foreground">OVR {Math.round(p.overall)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {p.email && <span>{p.email}</span>}
                        {p.club_name ? (
                          <Badge className="text-[10px]" variant="secondary">{p.club_name}</Badge>
                        ) : (
                          <Badge className="text-[10px]" variant="destructive">Sem clube</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleLoginAs(p)}>
                        Copiar ID
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssignDialog(p); setSelectedClubId(p.club_id || ''); }}>
                        Atribuir Clube
                      </Button>
                      {p.club_id && (
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleRemoveFromClub(p)}>
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pl-1">
                    <span className="text-[11px] text-muted-foreground">Energia:</span>
                    <Input
                      type="number"
                      placeholder="0-100"
                      className="h-7 w-20 text-xs"
                      value={energyDraft[p.id] ?? ''}
                      onChange={e => setEnergyDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && applyEnergy(p.id)}
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyEnergy(p.id)}>
                      Aplicar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setItemsDialog(p); loadStoreItems(); }}>
                      Dar item
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resetAvatar(p.user_id, p.full_name)}>
                      Resetar avatar
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
            <DialogTitle>Atribuir Clube — {assignDialog?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Selecione o clube</Label>
            <Select value={selectedClubId} onValueChange={setSelectedClubId}>
              <SelectTrigger><SelectValue placeholder="Escolha um clube..." /></SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.is_bot_managed ? '(Bot)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancelar</Button>
            <Button onClick={handleAssignClub} disabled={!selectedClubId}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemsDialog} onOpenChange={open => { if (!open) setItemsDialog(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Dar item — {itemsDialog?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {storeItems.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">Carregando itens...</div>
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
                      {!it.is_available && <Badge variant="destructive" className="text-[10px]">indisponível</Badge>}
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-xs" disabled={grantingItemId === it.id}
                    onClick={() => itemsDialog && grantItem(itemsDialog.id, it.id)}>
                    Dar
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
