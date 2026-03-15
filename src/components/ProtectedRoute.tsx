import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-tactical border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-display">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function PlayerRoute({ children }: { children: React.ReactNode }) {
  const { user, playerProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-tactical border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-display">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!playerProfile) return <Navigate to="/onboarding/player" replace />;
  return <>{children}</>;
}
