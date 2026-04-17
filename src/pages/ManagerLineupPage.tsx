import { useEffect, useState, useCallback } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PositionBadge } from '@/components/PositionBadge';
import { Save, UserPlus, X, Users, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { sortPlayersByPosition, positionalPenaltyPercent } from '@/lib/positions';

interface SquadPlayer {
  id: string;
  full_name: string;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
  user_id: string | null;
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

export const FORMATIONS: Record<string, SlotDef[]> = {
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
  '3-5-2': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'CB1', label: 'ZAG', x: 25, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 50, y: 78 },
    { position: 'CB3', label: 'ZAG', x: 75, y: 75 },
    { position: 'LWB', label: 'ALE', x: 10, y: 50 },
    { position: 'CM1', label: 'MC', x: 30, y: 48 },
    { position: 'CM2', label: 'MC', x: 50, y: 45 },
    { position: 'CM3', label: 'MC', x: 70, y: 48 },
    { position: 'RWB', label: 'ALD', x: 90, y: 50 },
    { position: 'ST1', label: 'ATA', x: 37, y: 18 },
    { position: 'ST2', label: 'ATA', x: 63, y: 18 },
  ],
  '3-4-3': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'CB1', label: 'ZAG', x: 25, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 50, y: 78 },
    { position: 'CB3', label: 'ZAG', x: 75, y: 75 },
    { position: 'LM', label: 'ME', x: 15, y: 48 },
    { position: 'CM1', label: 'MC', x: 37, y: 50 },
    { position: 'CM2', label: 'MC', x: 63, y: 50 },
    { position: 'RM', label: 'MD', x: 85, y: 48 },
    { position: 'LW', label: 'PE', x: 18, y: 20 },
    { position: 'ST', label: 'ATA', x: 50, y: 15 },
    { position: 'RW', label: 'PD', x: 82, y: 20 },
  ],
  '5-3-2': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LWB', label: 'ALE', x: 10, y: 65 },
    { position: 'CB1', label: 'ZAG', x: 30, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 50, y: 78 },
    { position: 'CB3', label: 'ZAG', x: 70, y: 75 },
    { position: 'RWB', label: 'ALD', x: 90, y: 65 },
    { position: 'CM1', label: 'MC', x: 25, y: 48 },
    { position: 'CM2', label: 'MC', x: 50, y: 45 },
    { position: 'CM3', label: 'MC', x: 75, y: 48 },
    { position: 'ST1', label: 'ATA', x: 37, y: 18 },
    { position: 'ST2', label: 'ATA', x: 63, y: 18 },
  ],
  '5-4-1': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LWB', label: 'ALE', x: 10, y: 65 },
    { position: 'CB1', label: 'ZAG', x: 30, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 50, y: 78 },
    { position: 'CB3', label: 'ZAG', x: 70, y: 75 },
    { position: 'RWB', label: 'ALD', x: 90, y: 65 },
    { position: 'LM', label: 'ME', x: 15, y: 45 },
    { position: 'CM1', label: 'MC', x: 37, y: 48 },
    { position: 'CM2', label: 'MC', x: 63, y: 48 },
    { position: 'RM', label: 'MD', x: 85, y: 45 },
    { position: 'ST', label: 'ATA', x: 50, y: 15 },
  ],
  '4-1-4-1': [
    { position: 'GK', label: 'GK', x: 50, y: 90 },
    { position: 'LB', label: 'LE', x: 15, y: 70 },
    { position: 'CB1', label: 'ZAG', x: 37, y: 75 },
    { position: 'CB2', label: 'ZAG', x: 63, y: 75 },
    { position: 'RB', label: 'LD', x: 85, y: 70 },
    { position: 'CDM', label: 'VOL', x: 50, y: 58 },
    { position: 'LM', label: 'ME', x: 15, y: 38 },
    { position: 'CM1', label: 'MC', x: 37, y: 40 },
    { position: 'CM2', label: 'MC', x: 63, y: 40 },
    { position: 'RM', label: 'MD', x: 85, y: 38 },
    { position: 'ST', label: 'ATA', x: 50, y: 15 },
  ],
};

const MAX_BENCH = 7;

const SHIRT_COLORS = [
  '#FF0000', '#0000FF', '#008000', '#FFD700', '#800080',
  '#FF4500', '#00CED1', '#DC143C', '#006400', '#191970',
  '#8B0000', '#2F4F4F', '#FF1493', '#1E90FF', '#FFFFFF',
  '#000000', '#FF6347', '#4B0082', '#228B22', '#708090',
];
const NUMBER_COLORS = ['#FFFFFF', '#000000', '#FFD700', '#FF0000', '#0000FF', '#00FF00'];

interface UniformData {
  id: string;
  uniform_number: number;
  shirt_color: string;
  number_color: string;
  pattern: string;
  stripe_color: string;
}

const PATTERN_CATEGORIES = [
  { value: 'solid', label: 'Cor Completa' },
  { value: 'stripe_vertical', label: 'Listra Vertical' },
  { value: 'stripe_horizontal', label: 'Listra Horizontal' },
  { value: 'stripe_diagonal', label: 'Listra Diagonal' },
  { value: 'bicolor', label: 'Bicolor' },
];

const STRIPE_COUNTS = [
  { value: 'unique', label: 'Unica' },
  { value: 'single', label: 'Simples' },
  { value: 'double', label: 'Dupla' },
  { value: 'triple', label: 'Tripla' },
];

const BICOLOR_TYPES = [
  { value: 'bicolor_vertical', label: 'Vertical' },
  { value: 'bicolor_horizontal', label: 'Horizontal' },
  { value: 'bicolor_diagonal', label: 'Diagonal' },
];

// Build full pattern value from category + count/type
const buildPattern = (category: string, count: string) => {
  if (category === 'solid') return 'solid';
  if (category === 'bicolor') return count; // count holds the bicolor subtype
  return `${category}_${count}`;
};

// Parse pattern into category + count
const parsePattern = (pattern: string): { category: string; count: string } => {
  if (pattern === 'solid') return { category: 'solid', count: 'unique' };
  if (pattern.startsWith('bicolor')) return { category: 'bicolor', count: pattern };
  for (const cat of ['stripe_vertical', 'stripe_horizontal', 'stripe_diagonal']) {
    if (pattern.startsWith(cat)) {
      const count = pattern.replace(`${cat}_`, '');
      if (['unique', 'single', 'double', 'triple'].includes(count)) return { category: cat, count };
      if (pattern === cat) return { category: cat, count: 'unique' };
    }
  }
  return { category: 'solid', count: 'unique' };
};

export default function ManagerLineupPage() {
  const { club: ownClub, assistantClub, managerProfile } = useAuth();
  // Head manager edits their own club; an assistant edits the club that nominated them.
  const club = ownClub || assistantClub;
  const isHeadManager = !!ownClub;
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [formation, setFormation] = useState('4-4-2');
  const [assignments, setAssignments] = useState<SlotAssignment[]>([]);
  const [benchPlayers, setBenchPlayers] = useState<string[]>([]);
  const [lineupId, setLineupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickSlot, setPickSlot] = useState<string | null>(null);
  const [pickType, setPickType] = useState<'starter' | 'bench'>('starter');

  // Uniform state
  const [uniforms, setUniforms] = useState<UniformData[]>([]);
  const [uniformEdits, setUniformEdits] = useState<Record<number, { shirt_color: string; number_color: string; pattern: string; stripe_color: string }>>({});
  const [savingUniform, setSavingUniform] = useState<number | null>(null);

  // Assistant manager state (head manager only can edit)
  const [assistantUserId, setAssistantUserId] = useState<string | null>(null);
  const [savingAssistant, setSavingAssistant] = useState(false);

  // Tactical roles state
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [freeKickId, setFreeKickId] = useState<string | null>(null);
  const [cornerRightId, setCornerRightId] = useState<string | null>(null);
  const [cornerLeftId, setCornerLeftId] = useState<string | null>(null);
  const [throwInRightId, setThrowInRightId] = useState<string | null>(null);
  const [throwInLeftId, setThrowInLeftId] = useState<string | null>(null);
  const [savingRoles, setSavingRoles] = useState(false);

  // Active suspensions: player_profile_ids with matches_remaining > 0 in the current season.
  // These players cannot be added to the starting XI or the bench.
  const [suspendedPlayerIds, setSuspendedPlayerIds] = useState<Set<string>>(new Set());
  const [suspensionReasonByPlayer, setSuspensionReasonByPlayer] = useState<Record<string, 'yellow_accumulation' | 'red_card'>>({});

  const slots = FORMATIONS[formation] || FORMATIONS['4-4-2'];

  useEffect(() => {
    if (!club) return;
    loadData();
  }, [club]);

  const loadData = async () => {
    if (!club) return;
    setLoading(true);

    // Load squad via active contracts (source of truth)
    const { data: contracts } = await supabase
      .from('contracts')
      .select('player_profile_id')
      .eq('club_id', club.id)
      .eq('status', 'active');

    const playerIds = (contracts || []).map(c => c.player_profile_id);
    let players: SquadPlayer[] = [];
    if (playerIds.length > 0) {
      const { data } = await supabase
        .from('player_profiles')
        .select('id, full_name, primary_position, secondary_position, archetype, overall, user_id')
        .in('id', playerIds)
        .order('overall', { ascending: false });
      players = data || [];
    }

    setSquad(sortPlayersByPosition(players));

    // Load current assistant on the club (head manager sees/changes it).
    setAssistantUserId((club as any).assistant_manager_id ?? null);

    // Load latest active lineup
    const { data: lineup } = await supabase
      .from('lineups')
      .select('*')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lineup) {
      setLineupId(lineup.id);
      setFormation(lineup.formation);

      // Load tactical roles
      setCaptainId(lineup.captain_player_id || null);
      setFreeKickId(lineup.free_kick_taker_id || null);
      setCornerRightId(lineup.corner_right_taker_id || null);
      setCornerLeftId(lineup.corner_left_taker_id || null);
      setThrowInRightId(lineup.throw_in_right_taker_id || null);
      setThrowInLeftId(lineup.throw_in_left_taker_id || null);

      const { data: slotsData } = await supabase
        .from('lineup_slots')
        .select('*')
        .eq('lineup_id', lineup.id)
        .order('sort_order', { ascending: true });

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

    // Load active suspensions for this club in the active season.
    // A player is suspended if ANY of their suspension rows has matches_remaining > 0.
    const { data: activeSeason } = await supabase
      .from('league_seasons')
      .select('id')
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeSeason?.id) {
      const { data: suspensions } = await supabase
        .from('player_suspensions')
        .select('player_profile_id, source_reason, matches_remaining')
        .eq('club_id', club.id)
        .eq('season_id', activeSeason.id)
        .gt('matches_remaining', 0);
      const suspendedSet = new Set<string>();
      const reasonMap: Record<string, 'yellow_accumulation' | 'red_card'> = {};
      for (const row of (suspensions || [])) {
        const pid = (row as any).player_profile_id as string;
        suspendedSet.add(pid);
        // Red card takes precedence over yellow accumulation if both exist.
        const reason = (row as any).source_reason as 'yellow_accumulation' | 'red_card';
        if (reason === 'red_card' || !reasonMap[pid]) reasonMap[pid] = reason;
      }
      setSuspendedPlayerIds(suspendedSet);
      setSuspensionReasonByPlayer(reasonMap);
    } else {
      setSuspendedPlayerIds(new Set());
      setSuspensionReasonByPlayer({});
    }

    // Load uniforms
    const { data: uniformsData } = await supabase
      .from('club_uniforms')
      .select('id, uniform_number, shirt_color, number_color, pattern, stripe_color')
      .eq('club_id', club.id)
      .order('uniform_number');

    if (uniformsData) {
      setUniforms(uniformsData);
      const edits: Record<number, { shirt_color: string; number_color: string; pattern: string; stripe_color: string }> = {};
      uniformsData.forEach(u => {
        edits[u.uniform_number] = { shirt_color: u.shirt_color, number_color: u.number_color, pattern: u.pattern || 'solid', stripe_color: u.stripe_color || '#FFFFFF' };
      });
      setUniformEdits(edits);
    }

    setLoading(false);
  };

  const saveUniform = async (uniformNumber: number) => {
    const edit = uniformEdits[uniformNumber];
    const uniform = uniforms.find(u => u.uniform_number === uniformNumber);
    if (!edit || !uniform) return;

    setSavingUniform(uniformNumber);
    try {
      const { error } = await supabase
        .from('club_uniforms')
        .update({ shirt_color: edit.shirt_color, number_color: edit.number_color, pattern: edit.pattern, stripe_color: edit.stripe_color, updated_at: new Date().toISOString() })
        .eq('id', uniform.id);

      if (error) throw error;

      setUniforms(prev => prev.map(u => u.id === uniform.id ? { ...u, shirt_color: edit.shirt_color, number_color: edit.number_color, pattern: edit.pattern, stripe_color: edit.stripe_color } : u));
      toast.success(`Uniforme salvo! Uniforme ${uniformNumber} atualizado com sucesso.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar uniforme.';
      toast.error(`Erro: ${message}`);
    } finally {
      setSavingUniform(null);
    }
  };

  const saveAssistant = async (newAssistantUserId: string | null) => {
    if (!club) return;
    setSavingAssistant(true);
    try {
      const { error } = await supabase.rpc('set_club_assistant_manager', {
        p_club_id: club.id,
        p_assistant_user_id: newAssistantUserId,
      });
      if (error) throw error;
      setAssistantUserId(newAssistantUserId);
      toast.success(newAssistantUserId ? 'Assistente designado.' : 'Assistente removido.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar assistente.';
      toast.error(`Erro: ${message}`);
    } finally {
      setSavingAssistant(false);
    }
  };

  const saveTacticalRoles = async () => {
    if (!lineupId) {
      toast.error('Erro: Salve a escalação primeiro antes de definir funções táticas.');
      return;
    }
    setSavingRoles(true);
    try {
      const { error } = await supabase.from('lineups').update({
        captain_player_id: captainId || null,
        free_kick_taker_id: freeKickId || null,
        corner_right_taker_id: cornerRightId || null,
        corner_left_taker_id: cornerLeftId || null,
        throw_in_right_taker_id: throwInRightId || null,
        throw_in_left_taker_id: throwInLeftId || null,
      }).eq('id', lineupId);
      if (error) throw error;
      toast.success('Funções táticas salvas! As funções foram atualizadas com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar funções táticas.';
      toast.error(`Erro: ${message}`);
    } finally {
      setSavingRoles(false);
    }
  };

  const assignedPlayerIds = new Set([
    ...assignments.map(a => a.player_profile_id),
    ...benchPlayers,
  ]);

  const availablePlayers = squad.filter(p => !assignedPlayerIds.has(p.id));

  const getPlayer = (id: string) => squad.find(p => p.id === id);

  const assignToSlot = (playerId: string) => {
    if (!pickSlot) return;

    // Block suspended players from being added to the lineup.
    if (suspendedPlayerIds.has(playerId)) {
      const reason = suspensionReasonByPlayer[playerId];
      const label = reason === 'red_card'
        ? 'Suspenso por cartão vermelho'
        : 'Suspenso por acúmulo de 3 amarelos';
      toast.error(`${label} — jogador não pode ser escalado nesta rodada.`);
      return;
    }

    if (pickType === 'bench') {
      if (benchPlayers.length >= MAX_BENCH) {
        toast.error(`Banco cheio: Máximo de ${MAX_BENCH} jogadores no banco.`);
        return;
      }
      setBenchPlayers(prev => [...prev, playerId]);
      // Keep dialog open for multi-select — don't close
    } else {
      setAssignments(prev => {
        const filtered = prev.filter(a => a.slot_position !== pickSlot);
        return [...filtered, { slot_position: pickSlot, player_profile_id: playerId, role_type: 'starter' }];
      });
      setPickSlot(null);
    }
  };

  const removeFromSlot = (slotPos: string) => {
    setAssignments(prev => prev.filter(a => a.slot_position !== slotPos));
  };

  const removeFromBench = (playerId: string) => {
    setBenchPlayers(prev => prev.filter(id => id !== playerId));
  };

  // Map slot positions to a generalized role for equivalence matching
  const getPositionRole = (slotPos: string): string => {
    if (slotPos === 'GK') return 'GK';
    if (['LB', 'LWB'].includes(slotPos)) return 'LB';
    if (['RB', 'RWB'].includes(slotPos)) return 'RB';
    if (slotPos.startsWith('CB')) return 'CB';
    if (['CDM', 'CDM1', 'CDM2'].includes(slotPos)) return 'CDM';
    if (slotPos.startsWith('CM') || slotPos === 'CAM') return 'CM';
    if (['LM', 'LW'].includes(slotPos)) return 'LM';
    if (['RM', 'RW'].includes(slotPos)) return 'RM';
    if (slotPos.startsWith('ST')) return 'ST';
    return slotPos;
  };

  const handleFormationChange = (newFormation: string) => {
    const newSlots = FORMATIONS[newFormation] || FORMATIONS['4-4-2'];
    const oldAssignments = [...assignments];
    const newAssignments: SlotAssignment[] = [];
    const usedPlayerIds = new Set<string>();

    // First pass: match by exact slot position name
    for (const slot of newSlots) {
      const match = oldAssignments.find(a => a.slot_position === slot.position && !usedPlayerIds.has(a.player_profile_id));
      if (match) {
        newAssignments.push({ ...match, slot_position: slot.position });
        usedPlayerIds.add(match.player_profile_id);
      }
    }

    // Second pass: match by equivalent role
    for (const slot of newSlots) {
      if (newAssignments.find(a => a.slot_position === slot.position)) continue;
      const slotRole = getPositionRole(slot.position);
      const match = oldAssignments.find(a => !usedPlayerIds.has(a.player_profile_id) && getPositionRole(a.slot_position) === slotRole);
      if (match) {
        newAssignments.push({ slot_position: slot.position, player_profile_id: match.player_profile_id, role_type: 'starter' });
        usedPlayerIds.add(match.player_profile_id);
      }
    }

    // Third pass: remaining unmatched players go to empty slots (keep them on the field)
    const remainingPlayers = oldAssignments.filter(a => !usedPlayerIds.has(a.player_profile_id));
    for (const player of remainingPlayers) {
      const emptySlot = newSlots.find(s => !newAssignments.find(a => a.slot_position === s.position));
      if (emptySlot) {
        newAssignments.push({ slot_position: emptySlot.position, player_profile_id: player.player_profile_id, role_type: 'starter' });
      }
    }

    setFormation(newFormation);
    setAssignments(newAssignments);
    // Keep bench players as-is
  };

  const saveLineup = async () => {
    if (!club) return;
    setSaving(true);

    const now = new Date().toISOString();

    try {
      const slotsToInsert = [
        ...assignments.map((a, i) => ({
          player_profile_id: a.player_profile_id,
          slot_position: a.slot_position,
          role_type: 'starter' as const,
          sort_order: i,
        })),
        ...benchPlayers.map((id, i) => ({
          player_profile_id: id,
          slot_position: `BENCH_${i + 1}`,
          role_type: 'bench' as const,
          sort_order: i,
        })),
      ];

      const { data: newLineup, error: lineupError } = await supabase
        .from('lineups')
        .insert({ club_id: club.id, formation, is_active: true, updated_at: now })
        .select()
        .single();

      if (lineupError || !newLineup) throw lineupError ?? new Error('Falha ao criar nova versão da escalação.');

      if (slotsToInsert.length > 0) {
        const { error: slotsError } = await supabase.from('lineup_slots').insert(
          slotsToInsert.map((slot) => ({
            lineup_id: newLineup.id,
            ...slot,
          }))
        );

        if (slotsError) {
          await supabase.from('lineups').delete().eq('id', newLineup.id);
          throw slotsError;
        }
      }

      const { error: cleanupError } = await supabase
        .from('lineups')
        .update({ is_active: false, updated_at: now })
        .eq('club_id', club.id)
        .eq('is_active', true)
        .neq('id', newLineup.id);

      if (cleanupError) throw cleanupError;

      setLineupId(newLineup.id);
      toast.success('Escalação salva! A nova formação foi salva sem alterar partidas já criadas.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar a escalação.';
      toast.error(`Erro ao salvar: ${message}`);
    } finally {
      setSaving(false);
    }
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
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={formation} onValueChange={handleFormationChange}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATIONS).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" className="gap-1.5">
              <Link to="/manager/lineup/tactics">
                <Target className="h-4 w-4" />
                Táticas — Jogo Situacional
              </Link>
            </Button>
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
            <div className="relative w-full rounded-xl overflow-hidden bg-pitch/20 border border-pitch/30" style={{ aspectRatio: '3/4', maxHeight: '400px' }}>
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
                const penalty = player
                  ? positionalPenaltyPercent(slot.position, player.primary_position, player.secondary_position)
                  : 0;
                const effectiveOvr = player ? Math.round(player.overall * (1 - penalty / 100)) : 0;

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
                    title={player && penalty > 0
                      ? `${player.full_name} fora de posição: ${player.primary_position}${player.secondary_position ? '/' + player.secondary_position : ''} escalado em ${slot.position} (−${penalty}% nos atributos). OVR efetivo: ${effectiveOvr}`
                      : undefined}
                  >
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-display font-bold transition-colors ${
                      player
                        ? (penalty > 0 ? 'bg-destructive/80 text-destructive-foreground' : 'bg-tactical text-tactical-foreground')
                        : 'bg-muted/60 text-muted-foreground border-2 border-dashed border-muted-foreground/40 group-hover:border-tactical'
                    }`}>
                      {player ? effectiveOvr : <UserPlus className="h-4 w-4" />}
                      {player && penalty > 0 && (
                        <span className="absolute -top-1 -right-1 text-[8px] font-display font-bold bg-background text-destructive border border-destructive rounded-full px-1 leading-tight">
                          −{penalty}%
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-display font-bold text-foreground/80 max-w-[70px] truncate text-center">
                      {player ? (
                        <>
                          {assigned && assigned.player_profile_id === captainId && <span title="Capitão">©️</span>}
                          {player.full_name.split(' ').pop()}
                        </>
                      ) : slot.label}
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
                            <PositionBadge position={p.primary_position} />
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

        {/* Funções Táticas */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold">Funções Táticas</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {[
                { label: 'Capitão', value: captainId, setter: setCaptainId },
                { label: 'Batedor de Falta', value: freeKickId, setter: setFreeKickId },
                { label: 'Cobrador de Escanteio Direito', value: cornerRightId, setter: setCornerRightId },
                { label: 'Cobrador de Escanteio Esquerdo', value: cornerLeftId, setter: setCornerLeftId },
                { label: 'Batedor de Lateral Direito', value: throwInRightId, setter: setThrowInRightId },
                { label: 'Batedor de Lateral Esquerdo', value: throwInLeftId, setter: setThrowInLeftId },
              ].map(({ label, value, setter }) => {
                const starterPlayers = assignments.map(a => getPlayer(a.player_profile_id)).filter(Boolean) as SquadPlayer[];
                return (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <label className="text-sm font-display font-semibold text-muted-foreground whitespace-nowrap">{label}</label>
                    <select
                      className="flex-1 max-w-[250px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={value || ''}
                      onChange={(e) => setter(e.target.value || null)}
                    >
                      <option value="">Selecionar...</option>
                      {starterPlayers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.primary_position})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <Button onClick={saveTacticalRoles} disabled={savingRoles || !lineupId} className="w-full gap-1.5">
                <Save className="h-4 w-4" />
                {savingRoles ? 'Salvando...' : 'Salvar Funções'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Assistente do Treinador (only the head manager can change) */}
        {isHeadManager && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold">Assistente</h2>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <p className="text-xs text-muted-foreground">
                  O assistente pode editar toda a área de escalação (campo, banco, funções táticas) como você. Útil quando o treinador está ausente.
                </p>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-display font-semibold text-muted-foreground whitespace-nowrap">Assistente atual</label>
                  <select
                    className="flex-1 max-w-[300px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={assistantUserId || ''}
                    disabled={savingAssistant}
                    onChange={(e) => saveAssistant(e.target.value || null)}
                  >
                    <option value="">Sem assistente</option>
                    {squad
                      .filter(p => p.user_id && p.user_id !== managerProfile?.user_id)
                      .map(p => (
                        <option key={p.user_id!} value={p.user_id!}>
                          {p.full_name} ({p.primary_position})
                        </option>
                      ))}
                  </select>
                </div>
                {savingAssistant && <p className="text-xs text-muted-foreground">Salvando...</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Uniformes */}
        {uniforms.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold">Uniformes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(num => {
                const uniform = uniforms.find(u => u.uniform_number === num);
                const edit = uniformEdits[num];
                if (!uniform || !edit) return null;

                const hasChanges = edit.shirt_color !== uniform.shirt_color || edit.number_color !== uniform.number_color || edit.pattern !== (uniform.pattern || 'solid') || edit.stripe_color !== (uniform.stripe_color || '#FFFFFF');

                return (
                  <Card key={num}>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-base">
                        {num === 3 ? 'Goleiro' : `Uniforme ${num} (${num === 1 ? 'Casa' : 'Fora'})`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Jersey preview */}
                      {(() => {
                        const pat = edit.pattern;
                        const sc = edit.shirt_color;
                        const stc = edit.stripe_color;
                        const pid = `pat-${num}`;

                        const getPatternDef = () => {
                          // Unique = single stripe in the middle
                          if (pat === 'stripe_vertical_unique') return null; // rendered inline
                          if (pat === 'stripe_horizontal_unique') return null;
                          if (pat === 'stripe_diagonal_unique') return null;
                          // Vertical repeating
                          if (pat === 'stripe_vertical_single') return <pattern id={pid} width="20" height="96" patternUnits="userSpaceOnUse"><rect width="10" height="96" fill={sc}/><rect x="10" width="10" height="96" fill={stc}/></pattern>;
                          if (pat === 'stripe_vertical_double') return <pattern id={pid} width="24" height="96" patternUnits="userSpaceOnUse"><rect width="8" height="96" fill={sc}/><rect x="8" width="4" height="96" fill={stc}/><rect x="12" width="8" height="96" fill={sc}/><rect x="20" width="4" height="96" fill={stc}/></pattern>;
                          if (pat === 'stripe_vertical_triple') return <pattern id={pid} width="18" height="96" patternUnits="userSpaceOnUse"><rect width="4" height="96" fill={sc}/><rect x="4" width="2" height="96" fill={stc}/><rect x="6" width="4" height="96" fill={sc}/><rect x="10" width="2" height="96" fill={stc}/><rect x="12" width="4" height="96" fill={sc}/><rect x="16" width="2" height="96" fill={stc}/></pattern>;
                          // Horizontal repeating
                          if (pat === 'stripe_horizontal_single') return <pattern id={pid} width="80" height="20" patternUnits="userSpaceOnUse"><rect width="80" height="10" fill={sc}/><rect y="10" width="80" height="10" fill={stc}/></pattern>;
                          if (pat === 'stripe_horizontal_double') return <pattern id={pid} width="80" height="24" patternUnits="userSpaceOnUse"><rect width="80" height="8" fill={sc}/><rect y="8" width="80" height="4" fill={stc}/><rect y="12" width="80" height="8" fill={sc}/><rect y="20" width="80" height="4" fill={stc}/></pattern>;
                          if (pat === 'stripe_horizontal_triple') return <pattern id={pid} width="80" height="18" patternUnits="userSpaceOnUse"><rect width="80" height="4" fill={sc}/><rect y="4" width="80" height="2" fill={stc}/><rect y="6" width="80" height="4" fill={sc}/><rect y="10" width="80" height="2" fill={stc}/><rect y="12" width="80" height="4" fill={sc}/><rect y="16" width="80" height="2" fill={stc}/></pattern>;
                          // Diagonal repeating
                          if (pat === 'stripe_diagonal_single') return <pattern id={pid} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill={sc}/><rect x="7" width="7" height="14" fill={stc}/></pattern>;
                          if (pat === 'stripe_diagonal_double') return <pattern id={pid} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="18" fill={sc}/><rect x="6" width="3" height="18" fill={stc}/><rect x="9" width="6" height="18" fill={sc}/><rect x="15" width="3" height="18" fill={stc}/></pattern>;
                          if (pat === 'stripe_diagonal_triple') return <pattern id={pid} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="18" fill={sc}/><rect x="3" width="3" height="18" fill={stc}/><rect x="6" width="3" height="18" fill={sc}/><rect x="9" width="3" height="18" fill={stc}/><rect x="12" width="3" height="18" fill={sc}/><rect x="15" width="3" height="18" fill={stc}/></pattern>;
                          return null;
                        };

                        const isBicolor = pat.startsWith('bicolor');
                        const isUnique = pat.endsWith('_unique');

                        return (
                          <div className="flex justify-center">
                            <svg width="80" height="96" viewBox="0 0 80 96" className="rounded-lg border border-border/50" overflow="hidden">
                              <defs>
                                <clipPath id={`clip-${num}`}><rect width="80" height="96" rx="8"/></clipPath>
                                {getPatternDef()}
                              </defs>
                              <g clipPath={`url(#clip-${num})`}>
                                {isBicolor ? (
                                  pat === 'bicolor_horizontal' ? (
                                    <><rect width="80" height="48" fill={sc}/><rect y="48" width="80" height="48" fill={stc}/></>
                                  ) : pat === 'bicolor_diagonal' ? (
                                    <><rect width="80" height="96" fill={sc}/><polygon points="0,96 80,0 80,96" fill={stc}/></>
                                  ) : (
                                    <><rect width="40" height="96" fill={sc}/><rect x="40" width="40" height="96" fill={stc}/></>
                                  )
                                ) : isUnique ? (
                                  <>
                                    <rect width="80" height="96" fill={sc}/>
                                    {pat === 'stripe_vertical_unique' && <rect x="34" width="12" height="96" fill={stc}/>}
                                    {pat === 'stripe_horizontal_unique' && <rect y="42" width="80" height="12" fill={stc}/>}
                                    {pat === 'stripe_diagonal_unique' && <polygon points="0,80 0,96 80,0 80,16" fill={stc} opacity="0.9"/>}
                                  </>
                                ) : (
                                  <rect width="80" height="96" fill={pat === 'solid' ? sc : `url(#${pid})`}/>
                                )}
                              </g>
                              <text x="40" y="52" textAnchor="middle" dominantBaseline="central"
                                fontSize="28" fontWeight="800" fontFamily="'Barlow Condensed', sans-serif"
                                fill={edit.number_color}>{num === 3 ? '1' : '10'}</text>
                            </svg>
                          </div>
                        );
                      })()}

                      {/* Shirt color (Cor 1) */}
                      <div className="space-y-2">
                        <label className="text-sm font-display font-semibold text-muted-foreground">
                          {edit.pattern === 'bicolor' ? 'Cor Esquerda' : 'Cor da Camisa'}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {SHIRT_COLORS.map(color => (
                            <button
                              key={color}
                              className={`w-7 h-7 rounded-md border-2 transition-all ${edit.shirt_color === color ? 'border-tactical scale-110' : 'border-border/50 hover:border-muted-foreground'}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], shirt_color: color } }))}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Pattern category */}
                      <div className="space-y-2">
                        <label className="text-sm font-display font-semibold text-muted-foreground">Padrao</label>
                        <div className="flex flex-wrap gap-1.5">
                          {PATTERN_CATEGORIES.map(p => {
                            const parsed = parsePattern(edit.pattern);
                            const isActive = parsed.category === p.value;
                            return (
                              <button
                                key={p.value}
                                className={`px-2 py-1 text-[10px] font-display rounded border-2 transition-all ${isActive ? 'border-tactical bg-tactical/10' : 'border-border/50 hover:border-muted-foreground'}`}
                                onClick={() => {
                                  let newPattern: string;
                                  if (p.value === 'bicolor') {
                                    newPattern = parsed.category === 'bicolor' ? parsed.count : 'bicolor_vertical';
                                  } else if (p.value === 'solid') {
                                    newPattern = 'solid';
                                  } else {
                                    const currentCount = ['unique','single','double','triple'].includes(parsed.count) ? parsed.count : 'unique';
                                    newPattern = buildPattern(p.value, currentCount);
                                  }
                                  setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], pattern: newPattern } }));
                                }}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bicolor type selector */}
                      {parsePattern(edit.pattern).category === 'bicolor' && (
                        <div className="space-y-2">
                          <label className="text-sm font-display font-semibold text-muted-foreground">Tipo Bicolor</label>
                          <div className="flex flex-wrap gap-1.5">
                            {BICOLOR_TYPES.map(bt => (
                              <button
                                key={bt.value}
                                className={`px-2 py-1 text-[10px] font-display rounded border-2 transition-all ${edit.pattern === bt.value ? 'border-tactical bg-tactical/10' : 'border-border/50 hover:border-muted-foreground'}`}
                                onClick={() => setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], pattern: bt.value } }))}
                              >
                                {bt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stripe count (only for stripe patterns) */}
                      {(() => {
                        const parsed = parsePattern(edit.pattern);
                        if (parsed.category === 'solid' || parsed.category === 'bicolor') return null;
                        return (
                          <div className="space-y-2">
                            <label className="text-sm font-display font-semibold text-muted-foreground">Quantidade de Listras</label>
                            <div className="flex flex-wrap gap-1.5">
                              {STRIPE_COUNTS.map(sc => (
                                <button
                                  key={sc.value}
                                  className={`px-2 py-1 text-[10px] font-display rounded border-2 transition-all ${parsed.count === sc.value ? 'border-tactical bg-tactical/10' : 'border-border/50 hover:border-muted-foreground'}`}
                                  onClick={() => {
                                    const newPattern = buildPattern(parsed.category, sc.value);
                                    setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], pattern: newPattern } }));
                                  }}
                                >
                                  {sc.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Stripe / Bicolor color (Cor 2) */}
                      {edit.pattern !== 'solid' && (
                        <div className="space-y-2">
                          <label className="text-sm font-display font-semibold text-muted-foreground">
                            {edit.pattern === 'bicolor' ? 'Cor Direita' : 'Cor da Listra'}
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {SHIRT_COLORS.map(color => (
                              <button
                                key={color}
                                className={`w-7 h-7 rounded-md border-2 transition-all ${edit.stripe_color === color ? 'border-tactical scale-110' : 'border-border/50 hover:border-muted-foreground'}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], stripe_color: color } }))}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Number color */}
                      <div className="space-y-2">
                        <label className="text-sm font-display font-semibold text-muted-foreground">Cor do Numero</label>
                        <div className="flex flex-wrap gap-1.5">
                          {NUMBER_COLORS.map(color => (
                            <button
                              key={color}
                              className={`w-7 h-7 rounded-md border-2 transition-all ${edit.number_color === color ? 'border-tactical scale-110' : 'border-border/50 hover:border-muted-foreground'}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setUniformEdits(prev => ({ ...prev, [num]: { ...prev[num], number_color: color } }))}
                            />
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={() => saveUniform(num)}
                        disabled={savingUniform === num || !hasChanges}
                        className="w-full gap-1.5"
                      >
                        <Save className="h-4 w-4" />
                        {savingUniform === num ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Player picker dialog */}
      <Dialog open={!!pickSlot} onOpenChange={() => setPickSlot(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {pickType === 'bench' ? `Banco de Reservas (${benchPlayers.length}/${MAX_BENCH})` : `Escolher Jogador — ${pickSlot}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {pickType === 'bench' ? (
              <>
                {/* Show available players with toggle selection */}
                {availablePlayers.length === 0 && benchPlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum jogador disponível</p>
                ) : (
                  <>
                    {/* Already selected bench players (can remove) */}
                    {benchPlayers.map(id => {
                      const p = getPlayer(id);
                      if (!p) return null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => removeFromBench(p.id)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg bg-pitch/10 border border-pitch/30 text-left transition-colors"
                        >
                          <span className="font-display text-lg font-extrabold text-pitch w-8 text-center">{p.overall}</span>
                          <div className="flex-1">
                            <p className="font-display font-bold text-sm">{p.full_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <PositionBadge position={p.primary_position} />
                              {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                              <span className="text-[10px] text-muted-foreground">{p.archetype}</span>
                            </div>
                          </div>
                          <span className="text-xs text-pitch font-bold">✓</span>
                        </button>
                      );
                    })}
                    {/* Available players (can add) */}
                    {availablePlayers.map(p => {
                      const isSuspended = suspendedPlayerIds.has(p.id);
                      const reason = suspensionReasonByPlayer[p.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() => assignToSlot(p.id)}
                          disabled={benchPlayers.length >= MAX_BENCH || isSuspended}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left transition-colors disabled:opacity-40"
                          title={isSuspended ? (reason === 'red_card' ? 'Suspenso — cartão vermelho' : 'Suspenso — 3 amarelos acumulados') : undefined}
                        >
                          <span className="font-display text-lg font-extrabold text-tactical w-8 text-center">{p.overall}</span>
                          <div className="flex-1">
                            <p className="font-display font-bold text-sm">{p.full_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <PositionBadge position={p.primary_position} />
                              {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                              <span className="text-[10px] text-muted-foreground">{p.archetype}</span>
                              {isSuspended && (
                                <span className="text-[10px] font-bold text-red-500">
                                  {reason === 'red_card' ? '\uD83D\uDFE5 SUSPENSO' : '\uD83D\uDFE8\uD83D\uDFE8\uD83D\uDFE8 SUSPENSO'}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            ) : (
              <>
                {availablePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum jogador disponível</p>
                ) : (
                  availablePlayers.map(p => {
                    const isSuspended = suspendedPlayerIds.has(p.id);
                    const reason = suspensionReasonByPlayer[p.id];
                    return (
                      <button
                        key={p.id}
                        onClick={() => assignToSlot(p.id)}
                        disabled={isSuspended}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left transition-colors disabled:opacity-40"
                        title={isSuspended ? (reason === 'red_card' ? 'Suspenso — cartão vermelho' : 'Suspenso — 3 amarelos acumulados') : undefined}
                      >
                        <span className="font-display text-lg font-extrabold text-tactical w-8 text-center">{p.overall}</span>
                        <div className="flex-1">
                          <p className="font-display font-bold text-sm">{p.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <PositionBadge position={p.primary_position} />
                            {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                            <span className="text-[10px] text-muted-foreground">{p.archetype}</span>
                            {isSuspended && (
                              <span className="text-[10px] font-bold text-red-500">
                                {reason === 'red_card' ? '\uD83D\uDFE5 SUSPENSO' : '\uD83D\uDFE8\uD83D\uDFE8\uD83D\uDFE8 SUSPENSO'}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
          {pickType === 'bench' && (
            <div className="pt-2 border-t">
              <Button onClick={() => setPickSlot(null)} className="w-full">
                Confirmar ({benchPlayers.length})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
