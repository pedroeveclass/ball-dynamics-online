import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { Shield, Building2, Users, FileText } from 'lucide-react';

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

function formatDate(d: string | null) {
  if (!d) return 'Indeterminado';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function PlayerClubPage() {
  const { playerProfile } = useAuth();
  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerProfile || !playerProfile.club_id) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      // Fetch club
      const { data: club } = await supabase
        .from('clubs')
        .select('id, name, short_name, primary_color, secondary_color, city, reputation, manager_profile_id')
        .eq('id', playerProfile.club_id!)
        .single();

      if (!club) { setLoading(false); return; }

      // Fetch manager name, stadium, contract, teammates in parallel
      const [mgrRes, stadRes, contractRes, teammatesRes] = await Promise.all([
        supabase.from('manager_profiles').select('full_name').eq('id', club.manager_profile_id).single(),
        supabase.from('stadiums').select('name, capacity').eq('club_id', club.id).single(),
        supabase.from('contracts').select('weekly_salary, release_clause, start_date, end_date').eq('player_profile_id', playerProfile.id).eq('status', 'active').single(),
        supabase.from('player_profiles').select('id, full_name, primary_position, overall, archetype').eq('club_id', playerProfile.club_id!).order('overall', { ascending: false }),
      ]);

      setClubInfo({
        ...club,
        manager_name: mgrRes.data?.full_name || 'Desconhecido',
        stadium_name: stadRes.data?.name || null,
        stadium_capacity: stadRes.data?.capacity || null,
      });
      setContract(contractRes.data);
      setTeammates(teammatesRes.data || []);
      setLoading(false);
    };

    fetchAll();
  }, [playerProfile]);

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando...</p></AppLayout>;

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      </AppLayout>
    );
  }

  if (!playerProfile.club_id || !clubInfo) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-2xl">
          <h1 className="font-display text-2xl font-bold">Meu Clube</h1>
          <div className="stat-card text-center py-12">
            <Shield className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">Você está sem clube</p>
            <p className="text-xs text-muted-foreground mt-1">Aguarde propostas de contrato ou procure oportunidades.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <h1 className="font-display text-2xl font-bold">Meu Clube</h1>

        {/* Club header */}
        <div className="stat-card">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-lg flex items-center justify-center font-display text-xl font-extrabold"
              style={{ backgroundColor: clubInfo.primary_color, color: clubInfo.secondary_color }}>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Reputação</span>
              <p className="font-display font-bold">{clubInfo.reputation}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Elenco</span>
              <p className="font-display font-bold">{teammates.length} jogadores</p>
            </div>
            {clubInfo.stadium_name && (
              <>
                <div>
                  <span className="text-xs text-muted-foreground">Estádio</span>
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

        {/* My contract */}
        {contract && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Meu Contrato</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Salário/Sem</span>
                <p className="font-display font-bold">${contract.weekly_salary.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Multa</span>
                <p className="font-display font-bold">${contract.release_clause.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Início</span>
                <p className="font-display font-bold">{formatDate(contract.start_date)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Término</span>
                <p className="font-display font-bold">{formatDate(contract.end_date)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Teammates */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">Elenco ({teammates.length})</span>
          </div>
          {teammates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum jogador no elenco.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">OVR</th>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Posição</th>
                    <th className="py-2 pr-3">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {teammates.map(t => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="py-2 pr-3">
                        <span className="font-display text-lg font-extrabold text-tactical">{t.overall}</span>
                      </td>
                      <td className="py-2 pr-3 font-display font-bold">
                        {t.full_name}
                        {t.id === playerProfile.id && <span className="text-xs text-tactical ml-1">(você)</span>}
                      </td>
                      <td className="py-2 pr-3"><PositionBadge position={t.primary_position as any} /></td>
                      <td className="py-2 pr-3 text-muted-foreground">{t.archetype}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
