import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PositionBadge } from '@/components/PositionBadge';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function PlayerProfilePage() {
  const { playerProfile } = useAuth();
  const [clubName, setClubName] = useState<string | null>(null);

  useEffect(() => {
    if (!playerProfile?.club_id) return;
    (async () => {
      const { data } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', playerProfile.club_id)
        .single();
      if (data) setClubName(data.name);
    })();
  }, [playerProfile?.club_id]);

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando perfil...</p></AppLayout>;

  const p = playerProfile;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Perfil do Jogador</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" disabled className="opacity-50">
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Em breve: criar mais jogadores</TooltipContent>
          </Tooltip>
        </div>

        <div className="stat-card space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display text-2xl font-bold">{p.full_name[0]}</span>
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">{p.full_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <PositionBadge position={p.primary_position as any} />
                {p.secondary_position && <PositionBadge position={p.secondary_position as any} />}
              </div>
            </div>
            <div className="ml-auto text-right">
              <span className="font-display text-3xl font-extrabold text-tactical">{p.overall}</span>
              <p className="text-xs text-muted-foreground">OVR</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div><span className="text-xs text-muted-foreground">Idade</span><p className="font-display font-bold">{p.age} anos</p></div>
            <div><span className="text-xs text-muted-foreground">Pé Dominante</span><p className="font-display font-bold">{p.dominant_foot === 'right' ? 'Direito' : p.dominant_foot === 'left' ? 'Esquerdo' : 'Ambos'}</p></div>
            <div><span className="text-xs text-muted-foreground">Arquétipo</span><p className="font-display font-bold">{p.archetype}</p></div>
            <div><span className="text-xs text-muted-foreground">Reputação</span><p className="font-display font-bold">{p.reputation}</p></div>
            <div><span className="text-xs text-muted-foreground">Clube</span><p className="font-display font-bold">{clubName || (p.club_id ? 'Carregando...' : 'Sem clube')}</p></div>
            <div><span className="text-xs text-muted-foreground">Status</span><p className="font-display font-bold">{p.club_id ? 'Contratado' : 'Agente Livre'}</p></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
