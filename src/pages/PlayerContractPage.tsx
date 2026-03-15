import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface ContractData {
  id: string;
  club_id: string | null;
  weekly_salary: number;
  release_clause: number;
  start_date: string;
  end_date: string | null;
  status: string;
  club_name?: string;
}

export default function PlayerContractPage() {
  const { playerProfile } = useAuth();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerProfile) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('contracts')
        .select('*')
        .eq('player_profile_id', playerProfile.id)
        .eq('status', 'active')
        .limit(1)
        .single();

      if (data && data.club_id) {
        const { data: club } = await supabase.from('clubs').select('name').eq('id', data.club_id).single();
        setContract({ ...data, club_name: club?.name || data.club_id });
      } else {
        setContract(null);
      }
      setLoading(false);
    };
    fetch();
  }, [playerProfile]);

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Contrato</h1>

        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-tactical" />
            <span className="font-display font-semibold text-sm">Contrato Atual</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : contract ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <p className="font-display font-bold text-pitch">Ativo</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Clube</span>
                <p className="font-display font-bold">{contract.club_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Salário Semanal</span>
                <p className="font-display font-bold">${contract.weekly_salary.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Multa de Saída</span>
                <p className="font-display font-bold">${contract.release_clause.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Início</span>
                <p className="font-display font-bold">{contract.start_date}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Fim</span>
                <p className="font-display font-bold">{contract.end_date || 'Indeterminado'}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="font-display font-semibold">Agente Livre</p>
              <p className="text-xs text-muted-foreground mt-1">Sem contrato ativo. Verifique propostas pendentes.</p>
              <Link to="/player/offers">
                <Button variant="outline" size="sm" className="mt-3">Ver Propostas</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
