import { ReactNode, useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { HelpModal } from '@/components/HelpModal';
import { WeeklyDigestModal } from '@/components/digest/WeeklyDigestModal';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CountryFlag } from '@/components/CountryFlag';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation('common');
  // Activate the user's saved language preference
  useAppLanguage();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">FOOTBALL IDENTITY</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} className="text-muted-foreground hover:text-foreground" title={t('tutorial')}>
                <HelpCircle className="h-5 w-5" />
              </Button>
              <NotificationBell />
              <Link to="/account/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                <UserAvatar
                  avatarUrl={(profile as any)?.avatar_url}
                  charRef={(profile as any)?.avatar_char_ref}
                  username={profile?.username}
                />
                <span className="text-sm font-medium hidden sm:flex items-center gap-1.5">
                  <span>{profile?.username || 'Jogador'}</span>
                  {(profile as any)?.country_code && <CountryFlag code={(profile as any).country_code} size="xs" />}
                </span>
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive" title={t('logout')}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      <WeeklyDigestModal />
    </SidebarProvider>
  );
}