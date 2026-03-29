import { ReactNode } from 'react';
import { ManagerSidebar } from '@/components/ManagerSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';

export function ManagerLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ManagerSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">FOOTBALL IDENTITY</span>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell />
              <Link to="/account/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                <UserAvatar
                  avatarUrl={(profile as any)?.avatar_url}
                  username={profile?.username}
                  bgClass="bg-tactical"
                  fgClass="text-tactical-foreground"
                />
                <span className="text-sm font-medium hidden sm:inline">{profile?.username || 'Manager'}</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}