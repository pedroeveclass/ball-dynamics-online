import { useEffect, useState, ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { PositionBadge } from '@/components/PositionBadge';
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
import { positionToPT, sortPlayersByPosition } from '@/lib/positions';
import { formatBRL } from '@/lib/formatting';
import {
  Shield, Star, Building2, Users, Calendar, Trophy, Loader2, ArrowLeft, UserPlus,
} from 'lucide-react';

const SQUAD_ROLES = [
  { value: 'starter', label: 'Titular' },
  { value: 'rotation', label: 'Rotação' },
  { value: 'backup', label: 'Reserva' },
  { value: 'youth', label: 'Jovem Promessa' },
];

// Adaptive layout: ManagerLayout if logged-in manager, otherwise simple public layout
function ClubLayout({ children }: { children: ReactNode }) {
  const { managerProfile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/league" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Shield className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">Clube</span>
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

export default function PublicClubPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { managerProfile, club: myClub } = useAuth();

  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<any>(null);
  const [stadium, setStadium] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [standing, setStanding] = useState<any>(null);
  const [squad, setSquad] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [nextMatch, setNextMatch] = useState<any>(null);

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
        .select('full_name')
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
        .select('id, full_name, age, primary_position, secondary_position, archetype, overall, dominant_foot, height')
        .in('id', playerIds)
        .order('overall', { ascending: false });

      setSquad(sortPlayersByPosition((playerData || []).map((p: any) => {
        const contract = contractMap.get(p.id);
        return { ...p, contract_id: contract?.id, weekly_salary: contract?.weekly_salary ?? 0, release_clause: contract?.release_clause ?? 0 };
      })));
    } else {
      setSquad([]);
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

    // Recent results (last 5 finished matches)
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id, home_score, away_score, status')
      .or(`home_club_id.eq.${id},away_club_id.eq.${id}`)
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(5);

    if (recentMatches) {
      setRecentResults(recentMatches.map((m: any) => {
        const isHome = m.home_club_id === id;
        const myScore = isHome ? m.home_score : m.away_score;
        const oppScore = isHome ? m.away_score : m.home_score;
        const result = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
        return { ...m, result, myScore, oppScore };
      }));
    }

    // Next match
    const { data: nextMatches } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id, scheduled_at, status')
      .or(`home_club_id.eq.${id},away_club_id.eq.${id}`)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (nextMatches && nextMatches.length > 0) {
      const nm = nextMatches[0];
      const oppId = nm.home_club_id === id ? nm.away_club_id : nm.home_club_id;
      const { data: oppClub } = await supabase
        .from('clubs')
        .select('name, short_name, primary_color, secondary_color')
        .eq('id', oppId)
        .maybeSingle();
      setNextMatch({ ...nm, opponent: oppClub, isHome: nm.home_club_id === id });
    }

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
      toast.error('Não foi possível enviar a proposta.');
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
          title: 'Nova proposta de contrato!',
          body: `${myClub.name} enviou uma proposta de ${formatBRL(salary)}/semana.`,
          type: 'contract',
          link: '/player/offers',
        });
      }

      toast.success(`Proposta enviada para ${selectedPlayer.full_name}!`);
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
          <p className="text-muted-foreground">Clube não encontrado.</p>
          <Link to="/league">
            <Button variant="outline">Voltar à Liga</Button>
          </Link>
        </div>
      </ClubLayout>
    );
  }

  return (
    <ClubLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start gap-5">
          <div
            className="w-20 h-20 rounded-xl flex items-center justify-center font-display text-2xl font-extrabold shadow-lg shrink-0"
            style={{ backgroundColor: clubData.primary_color, color: clubData.secondary_color }}
          >
            {clubData.short_name}
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">{clubData.name}</h1>
            <p className="text-muted-foreground text-sm">
              {clubData.short_name} {clubData.city && `• ${clubData.city}`}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs">
                <Star className="h-3 w-3 mr-1" /> Rep. {clubData.reputation}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {clubData.is_bot_managed ? 'Sem Treinador' : (manager?.full_name || 'Manager')}
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

        {/* ── Top stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* League standing */}
          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Trophy className="h-3.5 w-3.5" /> Classificação
            </div>
            <p className="font-display font-bold text-lg">
              {standing ? `${standing.position}º lugar` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {standing ? `${standing.points} pts • ${standing.played} jogos` : 'Sem dados'}
            </p>
          </div>

          {standing && (
            <>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">Vitórias / Empates / Derrotas</div>
                <p className="font-display font-bold text-lg">
                  <span className="text-pitch">{standing.won}</span>
                  {' / '}
                  <span>{standing.drawn}</span>
                  {' / '}
                  <span className="text-destructive">{standing.lost}</span>
                </p>
              </div>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">Gols (GP / GC)</div>
                <p className="font-display font-bold text-lg">
                  {standing.goals_for} / {standing.goals_against}
                </p>
              </div>
            </>
          )}

          <div className="stat-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" /> Elenco
            </div>
            <p className="font-display font-bold text-lg">{squad.length} jogadores</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Next match */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">Próximo Jogo</h3>
            {nextMatch ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-bold">
                      {nextMatch.isHome ? 'Casa' : 'Fora'} vs {nextMatch.opponent?.name || 'TBD'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(nextMatch.scheduled_at).toLocaleDateString('pt-BR', {
                        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                {nextMatch.opponent && (
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: nextMatch.opponent.primary_color, color: nextMatch.opponent.secondary_color }}
                  >
                    {nextMatch.opponent.short_name}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum jogo agendado.</p>
            )}
          </div>

          {/* Recent results */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">Últimos Resultados</h3>
            {recentResults.length > 0 ? (
              <div className="flex gap-2">
                {recentResults.map((r: any) => (
                  <div
                    key={r.id}
                    className={`flex-1 text-center p-2 rounded text-xs font-display font-bold ${
                      r.result === 'V' ? 'bg-pitch/15 text-pitch' :
                      r.result === 'D' ? 'bg-destructive/15 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}
                  >
                    <div className="text-lg">{r.result}</div>
                    <div className="text-[10px] opacity-70">{r.myScore}-{r.oppScore}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum resultado ainda.</p>
            )}
          </div>
        </div>

        {/* ── Squad table ── */}
        <div className="stat-card space-y-3">
          <h3 className="font-display font-semibold text-sm">Elenco</h3>
          {squad.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">POS</th>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">OVR</th>
                    <th className="py-2 pr-3">Idade</th>
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
                        <div className="flex items-center gap-1">
                          <PositionBadge position={p.primary_position} />
                          {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-display font-bold">{p.full_name}</td>
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
              <p className="text-xs text-muted-foreground">Nenhum jogador no elenco.</p>
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
              {positionToPT(selectedPlayer?.primary_position)} {selectedPlayer?.secondary_position ? `/ ${positionToPT(selectedPlayer.secondary_position)}` : ''} • {selectedPlayer?.archetype} • {selectedPlayer?.age} anos
            </DialogDescription>
          </DialogHeader>

          {selectedPlayer && (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="text-center">
                  <span className="font-display text-3xl font-extrabold text-tactical">{selectedPlayer.overall}</span>
                  <p className="text-[10px] text-muted-foreground">OVR</p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">Pé:</span>
                    <span className="font-semibold capitalize">{selectedPlayer.dominant_foot || '—'}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">Altura:</span>
                    <span className="font-semibold">{selectedPlayer.height ? `${selectedPlayer.height} cm` : '—'}</span>
                  </div>
                  {releaseClause != null && releaseClause > 0 && (
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">Multa:</span>
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
                  <AttrGroup title="Físico" rows={PHYSICAL} attrs={playerAttrs} />
                  <AttrGroup title="Técnico" rows={TECHNICAL} attrs={playerAttrs} />
                  <AttrGroup title="Mental" rows={MENTAL} attrs={playerAttrs} />
                  <AttrGroup title="Finalização" rows={SHOOTING} attrs={playerAttrs} />
                  <AttrGroup title="Defesa" rows={DEFENDING} attrs={playerAttrs} />
                  {selectedPlayer.primary_position === 'GK' && (
                    <AttrGroup title="Goleiro" rows={GK_ATTRS} attrs={playerAttrs} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Atributos não disponíveis.</p>
              )}

              {/* Offer button */}
              {canOffer && (
                <Button className="w-full gap-2" onClick={openOfferDialog}>
                  <UserPlus className="h-4 w-4" /> Fazer Proposta
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
            <DialogTitle className="font-display">Enviar Proposta</DialogTitle>
            <DialogDescription>
              Proposta de contrato para {selectedPlayer?.full_name}
            </DialogDescription>
          </DialogHeader>

          {selectedPlayer && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <span className="font-display text-xl font-extrabold text-tactical">{selectedPlayer.overall}</span>
                <div>
                  <p className="font-display font-bold text-sm">{selectedPlayer.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {positionToPT(selectedPlayer.primary_position)} • {selectedPlayer.archetype} • {selectedPlayer.age} anos
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Salário Semanal (R$)</Label>
                  <Input type="number" min={100} value={salary} onChange={e => setSalary(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Multa Rescisória (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={salary * 10}
                    value={clause}
                    onChange={e => setClause(Math.min(Number(e.target.value), salary * 10))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Duração (meses)</Label>
                  <Select value={contractLength} onValueChange={setContractLength}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 meses</SelectItem>
                      <SelectItem value="12">12 meses</SelectItem>
                      <SelectItem value="18">18 meses</SelectItem>
                      <SelectItem value="24">24 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Papel no Elenco</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SQUAD_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Mensagem (opcional)</Label>
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Ex: Queremos você como peça-chave do time..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>Cancelar</Button>
            <Button onClick={sendOffer} disabled={sending}>
              {sending ? 'Enviando...' : 'Enviar Proposta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClubLayout>
  );
}
