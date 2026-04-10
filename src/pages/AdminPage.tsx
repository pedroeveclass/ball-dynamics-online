import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="liga">Liga</TabsTrigger>
          <TabsTrigger value="times">Times</TabsTrigger>
          <TabsTrigger value="financas">Financas</TabsTrigger>
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LIGA TAB
// ═══════════════════════════════════════════════════
function LigaTab({ leagues, seasons, rounds, clubs, onReload }: { leagues: League[]; seasons: LeagueSeason[]; rounds: LeagueRound[]; clubs: Club[]; onReload: () => void }) {
  const [editLeague, setEditLeague] = useState<League | null>(null);
  const [matchDay1, setMatchDay1] = useState('');
  const [matchDay2, setMatchDay2] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [newRoundDate, setNewRoundDate] = useState('');

  const league = leagues[0];
  const season = seasons[0];

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
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {rounds.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm p-2 bg-card rounded border">
                <span>R{r.round_number} - {new Date(r.scheduled_at).toLocaleString('pt-BR')} [{r.status}]</span>
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
    const { error } = await supabase.from('clubs').update({
      name: name.trim(),
      short_name: shortName.trim().toUpperCase(),
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      city: city.trim() || null,
    }).eq('id', selected.id);
    if (error) { toast.error(error.message); return; }
    if (formation) {
      await supabase.from('club_settings').update({ default_formation: formation }).eq('club_id', selected.id);
    }
    toast.success('Time salvo');
    setSelected(null);
    onReload();
  }

  async function fireManager(clubId: string) {
    const { error } = await supabase.from('clubs').update({ is_bot_managed: true }).eq('id', clubId);
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
    const current = finances.find(f => f.club_id === selectedClub);
    if (current) {
      const { error } = await supabase.from('club_finances').update({ balance: current.balance + amount }).eq('club_id', selectedClub);
      if (error) toast.error(error.message);
      else { toast.success(`R$ ${amount.toLocaleString()} ${amount >= 0 ? 'adicionado' : 'removido'}`); setClubAmount(''); onReload(); }
    } else {
      const { error } = await supabase.from('club_finances').insert({ club_id: selectedClub, balance: amount, weekly_wage_bill: 0, projected_income: 0, projected_expense: 0 });
      if (error) toast.error(error.message);
      else { toast.success(`R$ ${amount.toLocaleString()} adicionado`); setClubAmount(''); onReload(); }
    }
  }

  async function searchPlayer() {
    if (!playerSearch.trim()) return;
    // Sanitize input: escape PostgREST special characters to prevent filter injection
    const sanitized = playerSearch.replace(/[%_\\(),."']/g, '');
    if (!sanitized.trim()) return;
    const { data } = await supabase.from('player_profiles').select('*').or(`full_name.ilike.%${sanitized}%,name.ilike.%${sanitized}%`).limit(10);
    setPlayerResults((data || []) as any);
  }

  async function addPlayerMoney() {
    if (!selectedPlayer || !playerAmount) return;
    const amount = parseInt(playerAmount);
    const { error } = await supabase.from('player_profiles').update({ money: (selectedPlayer.money || 0) + amount }).eq('id', selectedPlayer.id);
    if (error) toast.error(error.message);
    else { toast.success(`R$ ${amount.toLocaleString()} ${amount >= 0 ? 'adicionado' : 'removido'} para ${selectedPlayer.full_name || selectedPlayer.name}`); setPlayerAmount(''); setSelectedPlayer(null); }
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
