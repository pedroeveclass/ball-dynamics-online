import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export default function PlayerContractPage() {
  const { playerProfile } = useAuth();
  const [contract, setContract] = useState<Tables<'contracts'> | null>(null);

  useEffect(() => {
    if (!playerProfile) return;
    supabase.from('contracts').select('*').eq('player_profile_id', playerProfile.id).order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => setContract(data));
  }, [playerProfile]);

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Contrato</h1>

        <div className="stat-card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <p className="font-display font-bold capitalize">
                {contract?.status === 'free_agent' ? 'Agente Livre' :
                 contract?.status === 'active' ? 'Ativo' :
                 contract?.status || 'Agente Livre'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Clube</span>
              <p className="font-display font-bold">{contract?.club_id || 'Sem clube'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Salário Semanal</span>
              <p className="font-display font-bold">${contract?.weekly_salary?.toLocaleString() || '0'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Multa de Saída</span>
              <p className="font-display font-bold">${contract?.release_clause?.toLocaleString() || '0'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Início</span>
              <p className="font-display font-bold">{contract?.start_date || '—'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Fim</span>
              <p className="font-display font-bold">{contract?.end_date || 'Indeterminado'}</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
