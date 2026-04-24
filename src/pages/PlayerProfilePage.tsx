import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ATTR_LABELS } from '@/lib/attributes';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  User, Shield, Star, Footprints, Ruler, Dumbbell, Brain, Crosshair,
  ShieldAlert, Loader2, AlertTriangle, TrendingUp, Calendar,
  Repeat, Plus, UserCircle, Copy, Trash2, Award,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { positionToPT } from '@/lib/positions';
import { formatBRL } from '@/lib/formatting';
import { CareerStatsBlock } from '@/components/player/CareerStatsBlock';

// ── Attribute category definitions (same keys as PublicClubPage) ──

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

function AttrGroup({ title, icon, rows, attrs }: { title: string; icon: React.ReactNode; rows: AttrRow[]; attrs: any }) {
  const avg = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + Number(attrs?.[r.key] ?? 0), 0) / rows.length)
    : 0;
  const color = avg >= 70 ? 'text-pitch' : avg >= 50 ? 'text-yellow-500' : 'text-destructive';
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-28 shrink-0">
        {icon}
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <Progress value={avg} className="flex-1 h-2.5" />
      <span className={`w-8 text-right font-display font-bold text-sm ${color}`}>{avg}</span>
    </div>
  );
}

// OVR color helper
function ovrColor(ovr: number) {
  if (ovr > 70) return 'text-pitch';
  if (ovr > 50) return 'text-yellow-500';
  return 'text-destructive';
}

interface TrainingRecord {
  id: string;
  attribute_key: string;
  old_value: number;
  new_value: number;
  growth: number;
  trained_at: string;
}

const NEW_PLAYER_COST = 1_000_000;
const SECONDARY_POS_COST = 100_000;
const PRIMARY_POS_CHANGE_COST = 100_000;
const ALL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'] as const;

interface PlayerCard {
  id: string;
  full_name: string;
  primary_position: string;
  overall: number;
  club_id: string | null;
}

export default function PlayerProfilePage() {
  const { user, playerProfile, refreshPlayerProfile, switchPlayerProfile } = useAuth();
  const navigate = useNavigate();

  const [clubName, setClubName] = useState<string | null>(null);
  const [clubColors, setClubColors] = useState<{ primary: string; secondary: string; crestUrl: string | null } | null>(null);
  const [bodyVariant, setBodyVariant] = useState<'full-front' | 'full-back'>('full-front');
  const [attrs, setAttrs] = useState<any>(null);
  const [attrsLoading, setAttrsLoading] = useState(true);
  const [trainingHistory, setTrainingHistory] = useState<TrainingRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Multi-character state
  const [allPlayers, setAllPlayers] = useState<PlayerCard[]>([]);
  const [allPlayersLoading, setAllPlayersLoading] = useState(true);
  const [newPlayerOpen, setNewPlayerOpen] = useState(false);
  const [creatingNewPlayer, setCreatingNewPlayer] = useState(false);

  // Secondary position state
  const [secondaryPosOpen, setSecondaryPosOpen] = useState(false);
  const [selectedSecondaryPos, setSelectedSecondaryPos] = useState<string>('');
  const [changingSecondaryPos, setChangingSecondaryPos] = useState(false);

  // Primary position change state
  const [primaryPosOpen, setPrimaryPosOpen] = useState(false);
  const [selectedPrimaryPos, setSelectedPrimaryPos] = useState<string>('');
  const [changingPrimaryPos, setChangingPrimaryPos] = useState(false);

  // Reset player state
  const [resetOpen, setResetOpen] = useState(false);
  const [resettingPlayer, setResettingPlayer] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  // Retire player state
  const [retireOpen, setRetireOpen] = useState(false);
  const [retiringPlayer, setRetiringPlayer] = useState(false);

  const p = playerProfile;

  // ── Fetch club info ──
  useEffect(() => {
    if (!p?.club_id) { setClubName(null); setClubColors(null); return; }
    (async () => {
      const { data } = await supabase
        .from('clubs')
        .select('name, primary_color, secondary_color, crest_url')
        .eq('id', p.club_id!)
        .single();
      if (data) {
        setClubName(data.name);
        setClubColors({ primary: data.primary_color, secondary: data.secondary_color, crestUrl: (data as any).crest_url ?? null });
      }
    })();
  }, [p?.club_id]);

  // ── Fetch attributes ──
  useEffect(() => {
    if (!p) return;
    setAttrsLoading(true);
    (async () => {
      const { data } = await supabase
        .from('player_attributes')
        .select('*')
        .eq('player_profile_id', p.id)
        .maybeSingle();
      setAttrs(data);
      setAttrsLoading(false);
    })();
  }, [p?.id]);

  // ── Fetch training history (last 10) ──
  useEffect(() => {
    if (!p) return;
    setHistoryLoading(true);
    (async () => {
      const { data } = await supabase
        .from('training_history')
        .select('id, attribute_key, old_value, new_value, growth, trained_at')
        .eq('player_profile_id', p.id)
        .order('trained_at', { ascending: false })
        .limit(10);
      setTrainingHistory((data as TrainingRecord[]) || []);
      setHistoryLoading(false);
    })();
  }, [p?.id]);

  // ── Fetch all players for this user ──
  useEffect(() => {
    if (!user) return;
    setAllPlayersLoading(true);
    (async () => {
      const { data } = await supabase
        .from('player_profiles')
        .select('id, full_name, primary_position, overall, club_id')
        .eq('user_id', user.id)
        .order('created_at');
      setAllPlayers((data as PlayerCard[]) || []);
      setAllPlayersLoading(false);
    })();
  }, [user?.id, p?.id]);

  // ── Create new player handler ──
  async function handleCreateNewPlayer() {
    if (!p || !user) return;
    setCreatingNewPlayer(true);

    try {
      if (p.money < NEW_PLAYER_COST) {
        toast.error('Saldo insuficiente para criar novo jogador.');
        setCreatingNewPlayer(false);
        return;
      }

      // Deduct money from current player
      const { error: moneyErr } = await supabase
        .from('player_profiles')
        .update({ money: p.money - NEW_PLAYER_COST })
        .eq('id', p.id);
      if (moneyErr) throw moneyErr;

      toast.success('Saldo debitado. Crie seu novo jogador!');
      navigate('/onboarding/player');
    } catch (err) {
      toast.error('Erro ao iniciar criação de novo jogador.');
    }
    setCreatingNewPlayer(false);
  }

  // ── Switch player handler ──
  async function handleSwitchPlayer(playerId: string) {
    if (playerId === p?.id) return;
    await switchPlayerProfile(playerId);
    toast.success('Jogador ativo alterado!');
  }

  // ── Secondary position handler ──
  async function handleSecondaryPosition() {
    if (!p || !selectedSecondaryPos) return;
    setChangingSecondaryPos(true);

    try {
      if (p.money < SECONDARY_POS_COST) {
        toast.error('Saldo insuficiente para alterar posição secundária.');
        setChangingSecondaryPos(false);
        return;
      }

      const { error } = await supabase
        .from('player_profiles')
        .update({
          secondary_position: selectedSecondaryPos,
          money: p.money - SECONDARY_POS_COST,
        })
        .eq('id', p.id);

      if (error) throw error;

      toast.success(`Posição secundária alterada para ${positionToPT(selectedSecondaryPos)}!`);
      await refreshPlayerProfile();
      setSecondaryPosOpen(false);
      setSelectedSecondaryPos('');
    } catch (err) {
      toast.error('Erro ao alterar posição secundária.');
    }
    setChangingSecondaryPos(false);
  }

  // ── Primary position change handler ──
  async function handlePrimaryPositionChange() {
    if (!p || !selectedPrimaryPos) return;
    if (selectedPrimaryPos === p.primary_position) {
      toast.error('Escolha uma posição diferente da atual.');
      return;
    }
    setChangingPrimaryPos(true);

    try {
      const changesUsed = (p as any).primary_position_changes ?? 0;
      const isFree = changesUsed === 0;
      const cost = isFree ? 0 : PRIMARY_POS_CHANGE_COST;

      if (!isFree && p.money < cost) {
        toast.error('Saldo insuficiente para alterar posição principal.');
        setChangingPrimaryPos(false);
        return;
      }

      // If new primary matches current secondary, clear secondary to avoid duplicate.
      const clearSecondary = p.secondary_position === selectedPrimaryPos;

      const update: Record<string, unknown> = {
        primary_position: selectedPrimaryPos,
        primary_position_changes: changesUsed + 1,
        money: p.money - cost,
      };
      if (clearSecondary) update.secondary_position = null;

      const { error } = await supabase
        .from('player_profiles')
        .update(update)
        .eq('id', p.id);

      if (error) throw error;

      toast.success(
        isFree
          ? `Posição principal alterada para ${positionToPT(selectedPrimaryPos)}! (1ª mudança gratuita)`
          : `Posição principal alterada para ${positionToPT(selectedPrimaryPos)}!`
      );
      await refreshPlayerProfile();
      setPrimaryPosOpen(false);
      setSelectedPrimaryPos('');
    } catch (err) {
      toast.error('Erro ao alterar posição principal.');
    }
    setChangingPrimaryPos(false);
  }

  // ── Reset (delete) player handler ──
  function handleResetClick() {
    if (!p) return;
    if (p.club_id) {
      toast.error('Você só pode resetar um jogador que está sem time. Saia do clube atual primeiro.');
      return;
    }
    setResetConfirmText('');
    setResetOpen(true);
  }

  async function handleRetirePlayer() {
    if (!p) return;
    setRetiringPlayer(true);
    try {
      const { error } = await (supabase as any).rpc('retire_player', {
        p_player_profile_id: p.id,
      });
      if (error) throw error;

      toast.success('Jogador aposentado. Suas estatísticas continuam disponíveis pelo link público.');
      setRetireOpen(false);
      await refreshPlayerProfile();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao aposentar jogador.');
    }
    setRetiringPlayer(false);
  }

  async function handleResetPlayer() {
    if (!p) return;
    if (p.club_id) {
      toast.error('Você só pode resetar um jogador sem time.');
      return;
    }
    setResettingPlayer(true);
    try {
      const { error } = await (supabase as any).rpc('delete_player_profile', {
        p_player_id: p.id,
      });
      if (error) throw error;

      toast.success('Jogador apagado. Crie seu novo jogador!');
      setResetOpen(false);
      setResetConfirmText('');
      await refreshPlayerProfile();
      navigate('/onboarding/player', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao resetar jogador.');
    }
    setResettingPlayer(false);
  }

  if (!p) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const footLabel = p.dominant_foot === 'right' ? 'Direito' : p.dominant_foot === 'left' ? 'Esquerdo' : 'Ambos';
  const canCreateNewPlayer = p.money >= NEW_PLAYER_COST;

  const isRetired = (p as any).retirement_status === 'retired';
  const canRetire = !isRetired && p.age >= 38 && p.user_id != null;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">

        {/* ── Retired Banner ── */}
        {isRetired && (
          <div className="stat-card space-y-2 border-amber-500/40 bg-amber-500/5">
            <h2 className="font-display font-semibold text-sm flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Award className="h-4 w-4" /> Jogador Aposentado
            </h2>
            <p className="text-xs text-muted-foreground">
              {p.full_name} encerrou a carreira. As estatísticas e conquistas continuam disponíveis
              pelo link público. Você pode resetar este jogador a qualquer momento para liberar o slot.
            </p>
          </div>
        )}

        {/* ── Character Selector ── */}
        {!allPlayersLoading && allPlayers.length > 1 && (
          <div className="space-y-2">
            <h2 className="font-display font-semibold text-sm flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-tactical" /> Seus Jogadores
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allPlayers.map(pl => {
                const isActive = pl.id === p.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleSwitchPlayer(pl.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm shrink-0 transition-colors ${
                      isActive
                        ? 'border-pitch bg-pitch/10 text-foreground'
                        : 'border-border bg-card hover:border-muted-foreground/40 text-muted-foreground'
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span className="font-display font-semibold truncate max-w-[120px]">{pl.full_name}</span>
                    <span className="text-xs">{positionToPT(pl.primary_position)}</span>
                    <span className="font-display font-bold text-xs">{pl.overall}</span>
                    <span className="text-[10px]">{pl.club_id ? 'Clube' : 'Livre'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Player Card ── */}
        <div className="stat-card space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <PlayerAvatar
              appearance={(p as any).appearance}
              variant="face"
              clubPrimaryColor={clubColors?.primary}
              clubSecondaryColor={clubColors?.secondary}
              playerName={p.full_name}
              className="h-20 w-20 shrink-0"
              fallbackSeed={p.id}
            />

            {/* Name + positions */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl font-bold truncate">{p.full_name}</h1>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    const url = `${window.location.origin}/player/${p.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success('Link do seu perfil copiado!', { description: 'Compartilhe com um técnico para receber propostas.' });
                    } catch {
                      toast.info(url);
                    }
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copiar link
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <PositionBadge position={p.primary_position} />
                {p.secondary_position && <PositionBadge position={p.secondary_position} />}
                <Badge variant="outline" className="text-xs">{p.archetype}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>{p.age} anos</span>
                <span className="flex items-center gap-1"><Footprints className="h-3.5 w-3.5" />{footLabel}</span>
                <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{p.height} cm</span>
              </div>
            </div>

            {/* OVR */}
            <div className="text-center shrink-0">
              <span className={`font-display text-4xl font-extrabold ${ovrColor(p.overall)}`}>{p.overall}</span>
              <p className="text-xs text-muted-foreground">OVR</p>
            </div>
          </div>

          {/* Club + reputation row */}
          <div className="flex items-center gap-3 pt-3 border-t border-border flex-wrap">
            {p.club_id && clubName ? (
              <Badge variant="secondary" className="gap-1.5 text-sm">
                {clubColors && (
                  <div
                    className="w-4 h-4 rounded-sm flex items-center justify-center text-[6px] font-bold"
                    style={{ backgroundColor: clubColors.primary, color: clubColors.secondary }}
                  >
                    C
                  </div>
                )}
                {clubName}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-sm text-muted-foreground">Agente Livre</Badge>
            )}
            <Badge variant="outline" className="gap-1 text-xs">
              <Star className="h-3 w-3" /> Reputação {p.reputation}
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              Saldo: {formatBRL(p.money)}
            </Badge>
          </div>
        </div>

        {/* ── Full-body visual ── */}
        {(p as any).appearance && (
          <div className="stat-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-semibold text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-tactical" /> Visual
              </h2>
              <div className="flex gap-1">
                {(['full-front', 'full-back'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setBodyVariant(v)}
                    className={`px-3 py-1 rounded text-xs font-display font-semibold transition-colors ${
                      bodyVariant === v ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {v === 'full-front' ? 'Frente' : 'Costas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center py-2">
              <div className="h-80 w-40">
                <PlayerAvatar
                  appearance={(p as any).appearance}
                  variant={bodyVariant}
                  height={p.height}
                  clubPrimaryColor={clubColors?.primary}
                  clubSecondaryColor={clubColors?.secondary}
                  clubCrestUrl={clubColors?.crestUrl}
                  playerName={p.full_name}
                  jerseyNumber={(p as any).jersey_number}
                  className="w-full h-full"
                  fallbackSeed={p.id}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Career Statistics (position-specific block) ── */}
        <CareerStatsBlock playerProfileId={p.id} position={p.primary_position} />

        {/* ── Attribute Overview ── */}
        <div className="stat-card space-y-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-tactical" /> Visão Geral de Atributos
          </h2>
          {attrsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : attrs ? (
            <div className="space-y-2.5">
              <AttrGroup title="Físico" icon={<Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />} rows={PHYSICAL} attrs={attrs} />
              <AttrGroup title="Técnico" icon={<Footprints className="h-3.5 w-3.5 text-muted-foreground" />} rows={TECHNICAL} attrs={attrs} />
              <AttrGroup title="Mental" icon={<Brain className="h-3.5 w-3.5 text-muted-foreground" />} rows={MENTAL} attrs={attrs} />
              <AttrGroup title="Finalização" icon={<Crosshair className="h-3.5 w-3.5 text-muted-foreground" />} rows={SHOOTING} attrs={attrs} />
              <AttrGroup title="Defesa" icon={<ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />} rows={DEFENDING} attrs={attrs} />
              {p.primary_position === 'GK' && (
                <AttrGroup title="Goleiro" icon={<Shield className="h-3.5 w-3.5 text-muted-foreground" />} rows={GK_ATTRS} attrs={attrs} />
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Atributos não disponíveis.</p>
          )}
        </div>

        {/* ── Training History (last 10) ── */}
        <div className="stat-card space-y-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-tactical" /> Evolução Recente
          </h2>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : trainingHistory.length > 0 ? (
            <div className="space-y-1.5">
              {trainingHistory.map(h => {
                const growthColor = h.growth >= 2 ? 'text-pitch' : h.growth >= 1 ? 'text-yellow-500' : 'text-destructive';
                const attrLabel = ATTR_LABELS[h.attribute_key] || h.attribute_key;
                return (
                  <div key={h.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(h.trained_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="font-medium">{attrLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{h.old_value} → {h.new_value}</span>
                      <span className={`font-display font-bold text-sm ${growthColor}`}>+{h.growth.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum treino registrado ainda.</p>
          )}
        </div>

        {/* ── Primary Position ── */}
        {(() => {
          const changesUsed = (p as any).primary_position_changes ?? 0;
          const nextIsFree = changesUsed === 0;
          const nextCost = nextIsFree ? 0 : PRIMARY_POS_CHANGE_COST;
          return (
            <div className="stat-card space-y-3">
              <h2 className="font-display font-semibold text-sm flex items-center gap-2">
                <Repeat className="h-4 w-4 text-tactical" /> Mudar Posição do Jogador
              </h2>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Atual:</span>
                  <PositionBadge position={p.primary_position} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSelectedPrimaryPos(''); setPrimaryPosOpen(true); }}
                >
                  Mudar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {nextIsFree
                  ? 'Primeira mudança gratuita. Próximas custarão ' + formatBRL(PRIMARY_POS_CHANGE_COST) + '.'
                  : 'Próxima mudança: ' + formatBRL(nextCost) + '.'}
              </p>
            </div>
          );
        })()}

        {/* ── Secondary Position ── */}
        <div className="stat-card space-y-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Repeat className="h-4 w-4 text-tactical" /> Posição Secundária
          </h2>
          {p.secondary_position ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Atual:</span>
                <PositionBadge position={p.secondary_position} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelectedSecondaryPos(''); setSecondaryPosOpen(true); }}
              >
                Mudar
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Escolha uma posição secundária para poder ser escalado nela pelo treinador.
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { setSelectedSecondaryPos(''); setSecondaryPosOpen(true); }}
              >
                <Repeat className="h-4 w-4" /> Escolher Posição Secundária - {formatBRL(SECONDARY_POS_COST)}
              </Button>
            </>
          )}
        </div>

        {/* ── Novo Jogador ── */}
        <div className="stat-card space-y-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-tactical" /> Novo Jogador
          </h2>
          <p className="text-xs text-muted-foreground">
            Crie um novo jogador e alterne entre eles a qualquer momento. Seu jogador atual sera mantido.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Custo: {formatBRL(NEW_PLAYER_COST)}</span>
            {!canCreateNewPlayer && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Saldo insuficiente
              </span>
            )}
          </div>
          <Button
            className="w-full gap-2"
            disabled={!canCreateNewPlayer}
            onClick={() => setNewPlayerOpen(true)}
          >
            <Plus className="h-4 w-4" /> Criar Novo Jogador - {formatBRL(NEW_PLAYER_COST)}
          </Button>
        </div>

        {/* ── Aposentar Jogador ── */}
        {canRetire && (
          <div className="stat-card space-y-3 border-amber-500/40">
            <h2 className="font-display font-semibold text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Aposentar Jogador
            </h2>
            <p className="text-xs text-muted-foreground">
              Seu jogador tem {p.age} anos. Aposentar encerra a carreira: ele sai do clube atual,
              para de treinar e não aparece mais em mercados ou escalações. As estatísticas ficam
              preservadas e acessíveis pelo link público.
            </p>
            <Button
              variant="outline"
              className="w-full gap-2 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              onClick={() => setRetireOpen(true)}
            >
              <Award className="h-4 w-4" /> Aposentar {p.full_name}
            </Button>
          </div>
        )}

        {/* ── Resetar Jogador ── */}
        <div className="stat-card space-y-3 border-destructive/30">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> Resetar Jogador
          </h2>
          <p className="text-xs text-muted-foreground">
            Apaga este jogador permanentemente e volta para o onboarding para criar um novo.
            Só é permitido para jogadores sem time.
          </p>
          {p.club_id ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Você está em um clube. Saia do clube atual antes de resetar.
            </p>
          ) : null}
          <Button
            variant="destructive"
            className="w-full gap-2"
            onClick={handleResetClick}
          >
            <Trash2 className="h-4 w-4" /> Resetar Jogador
          </Button>
        </div>
      </div>

      {/* ── New Player Confirmation Dialog ── */}
      <Dialog open={newPlayerOpen} onOpenChange={setNewPlayerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Plus className="h-5 w-5 text-tactical" /> Criar Novo Jogador
            </DialogTitle>
            <DialogDescription>
              Criar um novo jogador custa {formatBRL(NEW_PLAYER_COST)}. O valor sera debitado do jogador atual.
              Seu jogador atual sera mantido e voce podera alternar entre eles.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-lg bg-tactical/10 border border-tactical/20 text-sm space-y-1">
            <p className="font-semibold">O que vai acontecer:</p>
            <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
              <li>{formatBRL(NEW_PLAYER_COST)} sera debitado de {p.full_name}</li>
              <li>Voce sera redirecionado para criar um novo jogador</li>
              <li>O novo jogador se tornara o jogador ativo</li>
              <li>Voce podera alternar entre jogadores a qualquer momento</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2">Saldo atual: {formatBRL(p.money)}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewPlayerOpen(false)} disabled={creatingNewPlayer}>
              Cancelar
            </Button>
            <Button onClick={handleCreateNewPlayer} disabled={creatingNewPlayer} className="gap-2">
              {creatingNewPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingNewPlayer ? 'Processando...' : 'Confirmar e Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Secondary Position Dialog ── */}
      <Dialog open={secondaryPosOpen} onOpenChange={setSecondaryPosOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Repeat className="h-5 w-5 text-tactical" />
              {p.secondary_position ? 'Mudar Posição Secundária' : 'Escolher Posição Secundária'}
            </DialogTitle>
            <DialogDescription>
              Custo: {formatBRL(SECONDARY_POS_COST)} (debitado do saldo atual de {formatBRL(p.money)}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedSecondaryPos} onValueChange={setSelectedSecondaryPos}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma posição" />
              </SelectTrigger>
              <SelectContent>
                {ALL_POSITIONS.filter(pos => pos !== p.primary_position).map(pos => (
                  <SelectItem key={pos} value={pos}>{positionToPT(pos)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {p.money < SECONDARY_POS_COST && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Saldo insuficiente
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSecondaryPosOpen(false)} disabled={changingSecondaryPos}>
              Cancelar
            </Button>
            <Button
              onClick={handleSecondaryPosition}
              disabled={changingSecondaryPos || !selectedSecondaryPos || p.money < SECONDARY_POS_COST}
              className="gap-2"
            >
              {changingSecondaryPos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
              {changingSecondaryPos ? 'Processando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Primary Position Change Dialog ── */}
      {(() => {
        const changesUsed = (p as any).primary_position_changes ?? 0;
        const isFree = changesUsed === 0;
        const cost = isFree ? 0 : PRIMARY_POS_CHANGE_COST;
        const insufficient = !isFree && p.money < cost;
        return (
          <Dialog open={primaryPosOpen} onOpenChange={setPrimaryPosOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-tactical" /> Mudar Posição do Jogador
                </DialogTitle>
                <DialogDescription>
                  {isFree
                    ? 'Primeira mudança de posição principal é GRATUITA. As próximas custarão ' + formatBRL(PRIMARY_POS_CHANGE_COST) + '.'
                    : 'Custo: ' + formatBRL(cost) + ' (debitado do saldo atual de ' + formatBRL(p.money) + ').'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Atual:</span>
                  <PositionBadge position={p.primary_position} />
                </div>
                <Select value={selectedPrimaryPos} onValueChange={setSelectedPrimaryPos}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a nova posição principal" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_POSITIONS.filter(pos => pos !== p.primary_position).map(pos => (
                      <SelectItem key={pos} value={pos}>{positionToPT(pos)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {p.secondary_position && selectedPrimaryPos === p.secondary_position && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sua posição secundária atual ({positionToPT(p.secondary_position)}) será removida.
                  </p>
                )}
                {insufficient && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Saldo insuficiente
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setPrimaryPosOpen(false)} disabled={changingPrimaryPos}>
                  Cancelar
                </Button>
                <Button
                  onClick={handlePrimaryPositionChange}
                  disabled={changingPrimaryPos || !selectedPrimaryPos || insufficient}
                  className="gap-2"
                >
                  {changingPrimaryPos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                  {changingPrimaryPos
                    ? 'Processando...'
                    : isFree
                      ? 'Confirmar (Grátis)'
                      : 'Confirmar - ' + formatBRL(cost)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Reset Player Confirmation Dialog ── */}
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!resettingPlayer) { setResetOpen(open); if (!open) setResetConfirmText(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Resetar Jogador
            </DialogTitle>
            <DialogDescription>
              Esta ação é <strong>permanente</strong>. Todo o progresso de <strong>{p.full_name}</strong> será apagado
              (atributos, histórico de treino, estatísticas, saldo). Depois você será enviado ao onboarding para criar um novo jogador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs space-y-1">
              <p className="font-semibold text-destructive">O que será apagado:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>Jogador <strong>{p.full_name}</strong> (OVR {p.overall})</li>
                <li>Todos os atributos e evolução de treino</li>
                <li>Estatísticas de carreira</li>
                <li>Saldo atual ({formatBRL(p.money)})</li>
              </ul>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Digite <strong className="text-destructive">RESETAR</strong> para confirmar:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                disabled={resettingPlayer}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                placeholder="RESETAR"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resettingPlayer}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetPlayer}
              disabled={resettingPlayer || resetConfirmText !== 'RESETAR'}
              className="gap-2"
            >
              {resettingPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {resettingPlayer ? 'Apagando...' : 'Apagar Jogador'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Retire Player Confirmation Dialog ── */}
      <Dialog open={retireOpen} onOpenChange={(open) => { if (!retiringPlayer) setRetireOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Award className="h-5 w-5" /> Aposentar {p.full_name}
            </DialogTitle>
            <DialogDescription>
              Encerrar a carreira é uma decisão definitiva. As estatísticas continuam preservadas
              e visíveis pelo link público do jogador.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">O que vai acontecer:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Contrato com o clube atual {p.club_id ? 'será rescindido' : '(sem clube)'}</li>
              <li>Plano de auto-treino semanal será apagado</li>
              <li>Jogador não aparece mais em mercados, escalações ou ofertas</li>
              <li>Atributos congelam no estado atual (OVR {p.overall})</li>
              <li>Você pode resetar depois para liberar o slot</li>
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetireOpen(false)} disabled={retiringPlayer}>
              Cancelar
            </Button>
            <Button
              onClick={handleRetirePlayer}
              disabled={retiringPlayer}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {retiringPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              {retiringPlayer ? 'Aposentando...' : 'Confirmar Aposentadoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

