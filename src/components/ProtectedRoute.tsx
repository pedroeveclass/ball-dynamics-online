import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 border-2 border-tactical border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground font-display">Carregando...</p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function PlayerRoute({ children }: { children: React.ReactNode }) {
  const { user, playerProfile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!playerProfile) return <Navigate to="/onboarding/player" replace />;
  // One-shot forced avatar creation — any player without a saved visual must
  // customize before entering the app. Editing later is not allowed.
  if ((playerProfile as any).appearance == null) return <Navigate to="/player/avatar/create" replace />;
  return <>{children}</>;
}

export function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { user, managerProfile, club, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!managerProfile) return <Navigate to="/onboarding/manager" replace />;
  // One-shot forced avatar creation — any manager without a saved visual
  // must customize before entering the app. Editing later is not allowed.
  if ((managerProfile as any).appearance == null) return <Navigate to="/manager/avatar/create" replace />;
  // Manager without club is allowed — dashboard shows "no team" state
  return <>{children}</>;
}

// Same as ManagerRoute but also lets in an assistant manager (a non-manager
// user that was nominated assistant of some club). The page itself must then
// fall back to `assistantClub` when `club` is null.
export function ManagerOrAssistantRoute({ children }: { children: React.ReactNode }) {
  const { user, managerProfile, assistantClub, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!managerProfile && !assistantClub) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
