import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { PositionBadge } from '@/components/PositionBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { ATTR_LABELS } from '@/lib/attributes';
import { Shield, Users, FileText } from 'lucide-react';

interface ClubInfo {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  city: string | null;
  reputation: number;
  manager_name: string;
  stadium_name: string | null;
  stadium_capacity: number | null;
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

const physicalKeys = ['velocidade', 'aceleracao', 'agilidade', 'forca', 'equilibrio', 'resistencia', 'pulo', 'stamina'] as const;
const technicalKeys = ['drible', 'controle_bola', 'marcacao', 'desarme', 'um_toque', 'curva', 'passe_baixo', 'passe_alto'] as const;
const mentalKeys = ['visao_jogo', 'tomada_decisao', 'antecipacao', 'trabalho_equipe', 'coragem', 'posicionamento_ofensivo', 'posicionamento_defensivo'] as const;
const shootingKeys = ['cabeceio', 'acuracia_chute', 'forca_chute'] as const;
const gkKeys = ['reflexo', 'posicionamento_gol', 'defesa_aerea', 'pegada', 'saida_gol', 'um_contra_um', 'distribuicao_curta', 'distribuicao_longa', 'tempo_reacao', 'comando_area'] as const;

function formatDate(date: string | null) {
  if (!date) return 'Indeterminado';
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatDominantFoot(foot: string) {
  if (foot === 'right') return 'Direito';
  if (foot === 'left') return 'Esquerdo';
  if (foot === 'both') return 'Ambos';
  return foot || '-';
}

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

export default function PlayerClubPage() {
  const { playerProfile } = useAuth();
  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);
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

    const fetchAll = async () => {
      const { data: club } = await supabase
        .from('clubs')
        .select('id, name, short_name, primary_color, secondary_color, city, reputation, manager_profile_id')
        .eq('id', playerProfile.club_id)
        .single();

      if (!club) {
        setLoading(false);
        return;
      }

      const [managerRes, stadiumRes, contractRes, contractsRes] = await Promise.all([
        supabase.from('manager_profiles').select('full_name').eq('id', club.manager_profile_id).single(),
        supabase.from('stadiums').select('name, capacity').eq('club_id', club.id).single(),
        supabase
          .from('contracts')
          .select('weekly_salary, release_clause, start_date, end_date')
          .eq('player_profile_id', playerProfile.id)
          .eq('status', 'active')
          .single(),
        supabase.from('contracts').select('player_profile_id').eq('club_id', playerProfile.club_id).eq('status', 'active'),
      ]);

      const playerIds = (contractsRes.data || []).map((contractRow) => contractRow.player_profile_id);
      let teammatesData: Teammate[] = [];

      if (playerIds.length > 0) {
        const { data } = await supabase
          .from('player_profiles')
          .select('id, full_name, primary_position, overall, archetype')
          .in('id', playerIds)
          .order('overall', { ascending: false });

        teammatesData = data || [];
      }

      setClubInfo({
        ...club,
        manager_name: managerRes.data?.full_name || 'Desconhecido',
        stadium_name: stadiumRes.data?.name || null,
        stadium_capacity: stadiumRes.data?.capacity || null,
      });
      setContract(contractRes.data);
      setTeammates(teammatesData);
      setLoading(false);
    };

    fetchAll();
  }, [playerProfile]);

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
        setDetailsError('Nao foi possivel carregar a ficha deste jogador.');
        setLoadingDetails(false);
        return;
      }

      setSelectedPlayer(profileRes.data);

      if (attrsRes.error) {
        setDetailsError('Nao foi possivel carregar os atributos deste jogador.');
      } else if (!attrsRes.data) {
        setDetailsError('Este jogador ainda nao possui atributos cadastrados.');
      } else {
        setSelectedPlayerAttrs(attrsRes.data);
      }

      setLoadingDetails(false);
    };

    fetchPlayerDetails();

    return () => {
      active = false;
    };
  }, [selectedPlayerId]);

  if (!playerProfile) {
    return (
      <AppLayout>
        <p className="text-muted-foreground">Carregando...</p>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="py-12 text-center text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  if (!playerProfile.club_id || !clubInfo) {
    return (
      <AppLayout>
        <div className="max-w-2xl space-y-6">
          <h1 className="font-display text-2xl font-bold">Meu Clube</h1>
          <div className="stat-card py-12 text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-display font-semibold">Voce esta sem clube</p>
            <p className="mt-1 text-xs text-muted-foreground">Aguarde propostas de contrato ou procure oportunidades.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isGK = selectedPlayer?.primary_position === 'GK';

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-2xl font-bold">Meu Clube</h1>

        <div className="stat-card">
          <div className="mb-4 flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-lg font-display text-xl font-extrabold"
              style={{ backgroundColor: clubInfo.primary_color, color: clubInfo.secondary_color }}
            >
              {clubInfo.short_name}
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">{clubInfo.name}</h2>
              <p className="text-sm text-muted-foreground">
                Manager: {clubInfo.manager_name}
                {clubInfo.city && <> • {clubInfo.city}</>}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground">Reputacao</span>
              <p className="font-display font-bold">{clubInfo.reputation}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Elenco</span>
              <p className="font-display font-bold">{teammates.length} jogadores</p>
            </div>
            {clubInfo.stadium_name && (
              <>
                <div>
                  <span className="text-xs text-muted-foreground">Estadio</span>
                  <p className="font-display font-bold">{clubInfo.stadium_name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Capacidade</span>
                  <p className="font-display font-bold">{clubInfo.stadium_capacity?.toLocaleString()}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {contract && (
          <div className="stat-card">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-tactical" />
              <span className="font-display text-sm font-semibold">Meu Contrato</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">Salario/Sem</span>
                <p className="font-display font-bold">${contract.weekly_salary.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Multa</span>
                <p className="font-display font-bold">${contract.release_clause.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Inicio</span>
                <p className="font-display font-bold">{formatDate(contract.start_date)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Termino</span>
                <p className="font-display font-bold">{formatDate(contract.end_date)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="stat-card">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-tactical" />
            <span className="font-display text-sm font-semibold">Elenco ({teammates.length})</span>
          </div>

          {teammates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum jogador no elenco.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Passe o mouse ou clique em um jogador para abrir a ficha.</p>
              <div className="space-y-2">
                {teammates.map((teammate) => (
                  <button
                    key={teammate.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(teammate.id)}
                    className="w-full rounded-lg border border-border/60 bg-background/30 px-3 py-3 text-left transition-colors hover:border-tactical/50 hover:bg-tactical/10 focus-visible:border-tactical focus-visible:bg-tactical/10 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted/60">
                        <span className="font-display text-lg font-extrabold text-tactical">{teammate.overall}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-bold text-foreground">
                          {teammate.full_name}
                          {teammate.id === playerProfile.id && <span className="ml-1 text-xs text-tactical">(voce)</span>}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <PositionBadge position={teammate.primary_position as any} />
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
      </div>

      <Dialog
        open={!!selectedPlayerId}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayerId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Ficha do Jogador</DialogTitle>
            <DialogDescription>
              Perfil tecnico e atributos do atleta selecionado.
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="stat-card py-10 text-center text-sm text-muted-foreground">
              Carregando ficha do jogador...
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
                      <PositionBadge position={selectedPlayer.primary_position as any} />
                      {selectedPlayer.secondary_position && <PositionBadge position={selectedPlayer.secondary_position as any} />}
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
                  <DetailItem label="Idade" value={`${selectedPlayer.age} anos`} />
                  <DetailItem label="Pe dominante" value={formatDominantFoot(selectedPlayer.dominant_foot)} />
                  <DetailItem label="Arquetipo" value={selectedPlayer.archetype} />
                  <DetailItem label="Reputacao" value={selectedPlayer.reputation.toString()} />
                  <DetailItem label="Posicao principal" value={selectedPlayer.primary_position} />
                  <DetailItem label="Posicao secundaria" value={selectedPlayer.secondary_position || '-'} />
                  <DetailItem label="Clube" value={clubInfo.name} />
                </div>
              </div>

              {selectedPlayerAttrs ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {isGK ? (
                    <>
                      <AttributeSection title="Goleiro" keys={gkKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Fisico" keys={physicalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Tecnico" keys={technicalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Mental" keys={mentalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Chute" keys={shootingKeys} attrs={selectedPlayerAttrs} />
                    </>
                  ) : (
                    <>
                      <AttributeSection title="Fisico" keys={physicalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Tecnico" keys={technicalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Mental" keys={mentalKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Chute" keys={shootingKeys} attrs={selectedPlayerAttrs} />
                      <AttributeSection title="Goleiro" keys={gkKeys} attrs={selectedPlayerAttrs} />
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
