import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { EnergyBar } from '@/components/EnergyBar';
import { PlayerCardDialog } from '@/components/PlayerCardDialog';
import { Users } from 'lucide-react';

interface SquadPlayer {
  id: string;
  full_name: string;
  age: number;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
  weekly_salary: number;
  energy_current: number;
  energy_max: number;
}

export default function ManagerSquadPage() {
  const { club } = useAuth();
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!club) return;
    const fetchSquad = async () => {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('player_profile_id, weekly_salary')
        .eq('club_id', club.id)
        .eq('status', 'active');

      if (!contracts || contracts.length === 0) { setPlayers([]); setLoading(false); return; }

      const playerIds = contracts.map(c => c.player_profile_id);
      const salaryMap = new Map(contracts.map(c => [c.player_profile_id, c.weekly_salary]));

      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('id, full_name, age, primary_position, secondary_position, archetype, overall, weekly_salary, energy_current, energy_max')
        .in('id', playerIds)
        .order('overall', { ascending: false });

      setPlayers((playerData || []).map(p => ({
        ...p,
        weekly_salary: salaryMap.get(p.id) ?? p.weekly_salary,
      })));
      setLoading(false);
    };
    fetchSquad();
  }, [club]);

  if (!club) return null;
  const totalWages = players.reduce((s, p) => s + p.weekly_salary, 0);

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Elenco</h1>
            <p className="text-sm text-muted-foreground">{players.length} jogadores • Folha semanal: ${totalWages.toLocaleString()}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando elenco...</p>
        ) : players.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold">Nenhum jogador no elenco</p>
            <p className="text-xs text-muted-foreground mt-1">Contrate jogadores no Mercado de Agentes Livres para montar seu time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">OVR</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Posição</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Idade</th>
                  <th className="py-2 pr-3">Energia</th>
                  <th className="py-2 pr-3 text-right">Salário/Sem</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 pr-3">
                      <span className="font-display text-lg font-extrabold text-tactical">{p.overall}</span>
                    </td>
                    <td className="py-3 pr-3 font-display font-bold">{p.full_name}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1">
                        <PositionBadge position={p.primary_position as any} />
                        {p.secondary_position && <PositionBadge position={p.secondary_position as any} />}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">{p.archetype}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{p.age}</td>
                    <td className="py-3 pr-3 w-28">
                      <EnergyBar current={p.energy_current} max={p.energy_max} />
                    </td>
                    <td className="py-3 pr-3 text-right font-display font-bold">${p.weekly_salary.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlayerCardDialog playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} clubName={club.name} />
    </ManagerLayout>
  );
}
