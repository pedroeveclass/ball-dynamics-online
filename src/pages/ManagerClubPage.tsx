import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';

export default function ManagerClubPage() {
  const { managerProfile, club } = useAuth();

  if (!managerProfile || !club) return null;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Clube</h1>

        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-xl flex items-center justify-center font-display text-2xl font-extrabold shadow-lg"
            style={{ backgroundColor: club.primary_color, color: club.secondary_color }}>
            {club.short_name}
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold">{club.name}</h2>
            <p className="text-muted-foreground text-sm">{club.short_name} {club.city && `• ${club.city}`}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">Identidade</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span className="font-bold">{club.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sigla</span><span className="font-bold">{club.short_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cidade</span><span className="font-bold">{club.city || '—'}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Cores</span>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: club.primary_color }} />
                  <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: club.secondary_color }} />
                </div>
              </div>
            </div>
          </div>

          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Reputação</span><span className="font-display font-bold text-tactical">{club.reputation}/100</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-display font-bold text-pitch capitalize">{club.status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Manager</span><span className="font-bold">{managerProfile.full_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rep. Manager</span><span className="font-display font-bold">{managerProfile.reputation}/100</span></div>
            </div>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
