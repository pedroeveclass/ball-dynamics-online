import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PositionBadge } from '@/components/PositionBadge';
import { Search, UserPlus, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FreeAgent {
  id: string;
  full_name: string;
  age: number;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
  reputation: number;
}

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const ARCHETYPES = ['All Around', 'Condutor', 'Chutador', 'Velocista', 'Torre', 'Cão de Guarda'];
const SQUAD_ROLES = [
  { value: 'starter', label: 'Titular' },
  { value: 'rotation', label: 'Rotação' },
  { value: 'backup', label: 'Reserva' },
  { value: 'youth', label: 'Jovem Promessa' },
];

export default function ManagerMarketPage() {
  const { managerProfile, club } = useAuth();
  const [players, setPlayers] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [archFilter, setArchFilter] = useState('all');
  const [selected, setSelected] = useState<FreeAgent | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const [salary, setSalary] = useState(500);
  const [clause, setClause] = useState(5000);
  const [length, setLength] = useState(12);
  const [role, setRole] = useState('rotation');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchFreeAgents();
  }, []);

  const fetchFreeAgents = async () => {
    setLoading(true);

    // Get players with no active contract and no club_id
    const { data, error } = await supabase
      .from('player_profiles')
      .select('id, full_name, age, primary_position, secondary_position, archetype, overall, reputation')
      .is('club_id', null)
      .order('overall', { ascending: false });

    if (!error && data) setPlayers(data);
    setLoading(false);
  };

  const filtered = players.filter(p => {
    if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (posFilter !== 'all' && p.primary_position !== posFilter) return false;
    if (archFilter !== 'all' && p.archetype !== archFilter) return false;
    return true;
  });

  const openOffer = (player: FreeAgent) => {
    setSelected(player);
    setSalary(500);
    setClause(5000);
    setLength(12);
    setRole('rotation');
    setMessage('');
    setOfferOpen(true);
  };

  const sendOffer = async () => {
    if (!selected || !managerProfile || !club) return;
    setSending(true);

    const { error } = await supabase.from('contract_offers').insert({
      club_id: club.id,
      manager_profile_id: managerProfile.id,
      player_profile_id: selected.id,
      weekly_salary: salary,
      release_clause: clause,
      contract_length: length,
      squad_role: role,
      message: message || null,
      status: 'pending',
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível enviar a proposta.', variant: 'destructive' });
    } else {
      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('user_id')
        .eq('id', selected.id)
        .single();

      if (playerData) {
        await supabase.from('notifications').insert({
          user_id: playerData.user_id,
          title: 'Nova proposta de contrato!',
          body: `${club.name} enviou uma proposta de R$${salary}/semana.`,
          type: 'contract_offer',
        });
      }

      toast({ title: 'Proposta enviada!', description: `Proposta enviada para ${selected.full_name}.` });
      setOfferOpen(false);
    }
    setSending(false);
  };

  if (!managerProfile || !club) return null;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Mercado de Agentes Livres</h1>
          <p className="text-sm text-muted-foreground">Encontre jogadores sem clube e envie propostas de contrato.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={posFilter} onValueChange={setPosFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Posição" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={archFilter} onValueChange={setArchFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Arquétipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ARCHETYPES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando jogadores...</div>
        ) : filtered.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">Nenhum agente livre encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">Tente ajustar os filtros ou aguarde novos jogadores.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(p => (
              <div key={p.id} className="stat-card flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center min-w-[48px]">
                    <span className="font-display text-2xl font-extrabold text-tactical">{p.overall}</span>
                    <p className="text-[10px] text-muted-foreground">OVR</p>
                  </div>
                  <div>
                    <p className="font-display font-bold">{p.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <PositionBadge position={p.primary_position as any} />
                      {p.secondary_position && <PositionBadge position={p.secondary_position as any} />}
                      <span className="text-xs text-muted-foreground">{p.archetype}</span>
                      <span className="text-xs text-muted-foreground">• {p.age} anos</span>
                      <span className="text-xs text-muted-foreground">• Rep: {p.reputation}</span>
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={() => openOffer(p)} className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  Proposta
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Enviar Proposta</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <span className="font-display text-xl font-extrabold text-tactical">{selected.overall}</span>
                <div>
                  <p className="font-display font-bold text-sm">{selected.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selected.primary_position} • {selected.archetype} • {selected.age} anos</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Salário Semanal ($)</Label>
                  <Input type="number" min={100} value={salary} onChange={e => setSalary(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Multa Rescisória ($)</Label>
                  <Input type="number" min={0} value={clause} onChange={e => setClause(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Duração (meses)</Label>
                  <Input type="number" min={1} max={60} value={length} onChange={e => setLength(Number(e.target.value))} />
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
                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Ex: Queremos você como peça-chave do time..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>Cancelar</Button>
            <Button onClick={sendOffer} disabled={sending}>{sending ? 'Enviando...' : 'Enviar Proposta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
