import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { PositionBadge } from '@/components/PositionBadge';

export default function PlayerProfilePage() {
  const { playerProfile } = useAuth();

  if (!playerProfile) return <AppLayout><p className="text-muted-foreground">Carregando perfil...</p></AppLayout>;

  const p = playerProfile;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Perfil do Jogador</h1>

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
            <div><span className="text-xs text-muted-foreground">Clube</span><p className="font-display font-bold">{p.club_id || 'Sem clube'}</p></div>
            <div><span className="text-xs text-muted-foreground">Status</span><p className="font-display font-bold">{p.club_id ? 'Contratado' : 'Agente Livre'}</p></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
