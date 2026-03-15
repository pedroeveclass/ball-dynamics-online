import { useEffect, useState, useCallback } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PositionBadge } from '@/components/PositionBadge';
import { Save, UserPlus, X, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SquadPlayer {
  id: string;
  full_name: string;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
}

interface SlotDef {
  position: string;
  label: string;
  x: number; // % from left
  y: number; // % from top
}

interface SlotAssignment {
  slot_position: string;
  player_profile_id: string;
  role_type: 'starter' | 'bench';
}

const FORMATIONS: Record<string, SlotDef[]> = {
  '4-4-2': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LB', label: 'LE', x: 15, y: 70 },
    { position: 'CB1', label: 'ZAG', x: 37, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 63, y: 75 },
    { position: 'RB', label: 'LD', x: 85, y: 70 },
    { position: 'LM', label: 'ME', x: 15, y: 45 },
    { position: 'CM1', label: 'MC', x: 37, y: 50 },
    { position: 'CM2', label: 'MC', x: 63, y: 50 },
    { position: 'RM', label: 'MD', x: 85, y: 45 },
    { position: 'ST1', label: 'ATA', x: 37, y: 18 },
    { position: 'ST2', label: 'ATA', x: 63, y: 18 },
  ],
  '4-3-3': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LB', label: 'LE', x: 15, y: 70 },
    { position: 'CB1', label: 'ZAG', x: 37, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 63, y: 75 },
    { position: 'RB', label: 'LD', x: 85, y: 70 },
    { position: 'CM1', label: 'MC', x: 25, y: 48 },
    { position: 'CM2', label: 'MC', x: 50, y: 52 },
    { position: 'CM3', label: 'MC', x: 75, y: 48 },
    { position: 'LW', label: 'PE', x: 18, y: 22 },
    { position: 'ST', label: 'ATA', x: 50, y: 15 },
    { position: 'RW', label: 'PD', x: 82, y: 22 },
  ],
  '4-2-3-1': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LB', label: 'LE', x: 15, y: 70 },
    { position: 'CB1', label: 'ZAG', x: 37, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 63, y: 75 },
    { position: 'RB', label: 'LD', x: 85, y: 70 },
    { position: 'CDM1', label: 'VOL', x: 37, y: 55 },
    { position: 'CDM2', label: 'VOL', x: 63, y: 55 },
    { position: 'LW', label: 'ME', x: 18, y: 35 },
    { position: 'CAM', label: 'MEI', x: 50, y: 35 },
    { position: 'RW', label: 'MD', x: 82, y: 35 },
    { position: 'ST', label: 'ATA', x: 50, y: 15 },
  ],
};

const MAX_BENCH = 7;

export default function ManagerLineupPage() {
  const { club } = useAuth();
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [formation, setFormation] = useState('4-4-2');
  const [assignments, setAssignments] = useState<SlotAssignment[]>([]);
  const [benchPlayers, setBenchPlayers] = useState<string[]>([]);
  const [lineupId, setLineupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickSlot, setPickSlot] = useState<string | null>(null);
  const [pickType, setPickType] = useState<'starter' | 'bench'>('starter');

  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];

  useEffect(() => {
    if (!club) return;
    loadData();
  }, [club]);

  const loadData = async () => {
    if (!club) return;
    setLoading(true);

    // Load squad
    const { data: players } = await supabase
      .from('player_profiles')
      .select('id, full_name, primary_position, secondary_position, archetype, overall')
      .eq('club_id', club.id)
      .order('overall', { ascending: false });

    setSquad(players || []);

    // Load existing active lineup
    const { data: lineup } = await supabase
      .from('lineups')
      .select('*')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (lineup) {
      setLineupId(lineup.id);
      setFormation(lineup.formation);

      const { data: slotsData } = await supabase
        .from('lineup_slots')
        .select('*')
        .eq('lineup_id', lineup.id);

      if (slotsData) {
        const starters = slotsData.filter(s => s.role_type === 'starter').map(s => ({
          slot_position: s.slot_position,
          player_profile_id: s.player_profile_id,
          role_type: 'starter' as const,
        }));
        const bench = slotsData.filter(s => s.role_type === 'bench').map(s => s.player_profile_id);
        setAssignments(starters);
        setBenchPlayers(bench);
      }
    }

    setLoading(false);
  };

  const assignedPlayerIds = new Set([
    ...assignments.map(a => a.player_profile_id),
    ...benchPlayers,
  ]);

  const availablePlayers = squad.filter(p => !assignedPlayerIds.has(p.id));

  const getPlayer = (id: string) => squad.find(p => p.id === id);

  const assignToSlot = (playerId: string) => {
    if (!pickSlot) return;

    if (pickType === 'bench') {
      if (benchPlayers.length >= MAX_BENCH) {
        toast({ title: 'Banco cheio', description: `Máximo de ${MAX_BENCH} jogadores no banco.`, variant: 'destructive' });
        return;
      }
      setBenchPlayers(prev => [...prev, playerId]);
    } else {
      setAssignments(prev => {
        const filtered = prev.filter(a => a.slot_position !== pickSlot);
        return [...filtered, { slot_position: pickSlot, player_profile_id: playerId, role_type: 'starter' }];
      });
    }
    setPickSlot(null);
  };

  const removeFromSlot = (slotPos: string) => {
    setAssignments(prev => prev.filter(a => a.slot_position !== slotPos));
  };

  const removeFromBench = (playerId: string) => {
    setBenchPlayers(prev => prev.filter(id => id !== playerId));
  };

  const handleFormationChange = (newFormation: string) => {
    setFormation(newFormation);
    setAssignments([]);
    setBenchPlayers([]);
  };

  const saveLineup = async () => {
    if (!club) return;
    setSaving(true);

    try {
      let currentLineupId = lineupId;

      if (!currentLineupId) {
        // Deactivate any existing
        await supabase.from('lineups').update({ is_active: false }).eq('club_id', club.id).eq('is_active', true);

        const { data: newLineup, error } = await supabase
          .from('lineups')
          .insert({ club_id: club.id, formation, is_active: true })
          .select()
          .single();

        if (error || !newLineup) throw error;
        currentLineupId = newLineup.id;
        setLineupId(currentLineupId);
      } else {
        await supabase.from('lineups').update({ formation, updated_at: new Date().toISOString() }).eq('id', currentLineupId);
        await supabase.from('lineup_slots').delete().eq('lineup_id', currentLineupId);
      }

      const slotsToInsert = [
        ...assignments.map((a, i) => ({
          lineup_id: currentLineupId!,
          player_profile_id: a.player_profile_id,
          slot_position: a.slot_position,
          role_type: 'starter',
          sort_order: i,
        })),
        ...benchPlayers.map((id, i) => ({
          lineup_id: currentLineupId!,
          player_profile_id: id,
          slot_position: `BENCH_${i + 1}`,
          role_type: 'bench',
          sort_order: i,
        })),
      ];

      if (slotsToInsert.length > 0) {
        const { error } = await supabase.from('lineup_slots').insert(slotsToInsert);
        if (error) throw error;
      }

      toast({ title: 'Escalação salva!', description: 'A escalação foi salva com sucesso.' });
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar a escalação.', variant: 'destructive' });
    }

    setSaving(false);
  };

  if (!club) return null;

  if (loading) {
    return (
      <ManagerLayout>
        <div className="text-center py-12 text-muted-foreground">Carregando escalação...</div>
      </ManagerLayout>
    );
  }

  if (squad.length === 0) {
    return (
      <ManagerLayout>
        <div className="space-y-6">
          <h1 className="font-display text-2xl font-bold">Escalação</h1>
          <div className="stat-card text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">Nenhum jogador no elenco</p>
            <p className="text-xs text-muted-foreground mt-1">Contrate jogadores no Mercado antes de montar a escalação.</p>
          </div>
        </div>
      </ManagerLayout>
    );
  }

  const emptySlots = slots.filter(s => !assignments.find(a => a.slot_position === s.position));

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Escalação</h1>
            <p className="text-sm text-muted-foreground">{assignments.length}/{slots.length} titulares • {benchPlayers.length}/{MAX_BENCH} banco</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={formation} onValueChange={handleFormationChange}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={saveLineup} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {emptySlots.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
            {emptySlots.length} posição(ões) vazia(s): {emptySlots.map(s => s.label).join(', ')}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Field */}
          <div className="lg:col-span-2">
            <div className="relative w-full rounded-xl overflow-hidden bg-pitch/20 border border-pitch/30" style={{ aspectRatio: '3/4' }}>
              {/* Field markings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-2 border-pitch/30" />
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-t-0 border-pitch/30 rounded-b-lg" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-b-0 border-pitch/30 rounded-t-lg" />

              {/* Slots */}
              {slots.map(slot => {
                const assigned = assignments.find(a => a.slot_position === slot.position);
                const player = assigned ? getPlayer(assigned.player_profile_id) : null;

                return (
                  <div
                    key={slot.position}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 cursor-pointer group"
                    style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    onClick={() => {
                      if (assigned) {
                        removeFromSlot(slot.position);
                      } else {
                        setPickSlot(slot.position);
                        setPickType('starter');
                      }
                    }}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-display font-bold transition-colors ${
                      player
                        ? 'bg-tactical text-tactical-foreground'
                        : 'bg-muted/60 text-muted-foreground border-2 border-dashed border-muted-foreground/40 group-hover:border-tactical'
                    }`}>
                      {player ? player.overall : <UserPlus className="h-4 w-4" />}
                    </div>
                    <span className="text-[10px] font-display font-bold text-foreground/80 max-w-[70px] truncate text-center">
                      {player ? player.full_name.split(' ').pop() : slot.label}
                    </span>
                    {player && (
                      <span className="text-[9px] text-muted-foreground">{slot.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bench + available */}
          <div className="space-y-4">
            {/* Bench */}
            <div className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <span className="font-display font-semibold text-sm">Banco ({benchPlayers.length}/{MAX_BENCH})</span>
                <Button variant="ghost" size="sm" onClick={() => { setPickSlot('BENCH'); setPickType('bench'); }} disabled={benchPlayers.length >= MAX_BENCH} className="text-xs h-7">
                  <UserPlus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {benchPlayers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum jogador no banco</p>
              ) : (
                <div className="space-y-1.5">
                  {benchPlayers.map(id => {
                    const p = getPlayer(id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-tactical w-6 text-center">{p.overall}</span>
                          <span className="font-display font-bold text-xs">{p.full_name}</span>
                        </div>
                        <button onClick={() => removeFromBench(id)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Available players */}
            <div className="stat-card">
              <span className="font-display font-semibold text-sm mb-3 block">Disponíveis ({availablePlayers.length})</span>
              {availablePlayers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Todos escalados</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {availablePlayers.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-tactical w-6 text-center">{p.overall}</span>
                        <div>
                          <span className="font-display font-bold text-xs">{p.full_name}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <PositionBadge position={p.primary_position as any} />
                            <span className="text-[10px] text-muted-foreground">{p.archetype}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player picker dialog */}
      <Dialog open={!!pickSlot} onOpenChange={() => setPickSlot(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {pickType === 'bench' ? 'Adicionar ao Banco' : `Escolher Jogador — ${pickSlot}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {availablePlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum jogador disponível</p>
            ) : (
              availablePlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => assignToSlot(p.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left transition-colors"
                >
                  <span className="font-display text-lg font-extrabold text-tactical w-8 text-center">{p.overall}</span>
                  <div className="flex-1">
                    <p className="font-display font-bold text-sm">{p.full_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <PositionBadge position={p.primary_position as any} />
                      {p.secondary_position && <PositionBadge position={p.secondary_position as any} />}
                      <span className="text-[10px] text-muted-foreground">{p.archetype}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
