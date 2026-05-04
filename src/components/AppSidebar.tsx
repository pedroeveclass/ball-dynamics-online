import {
  Home, User, TrendingUp, FileText, Inbox, Shield, Swords, Bell, Settings, Trophy, Landmark, Store, MessageSquare, CalendarClock, Users2, UserCircle2, Newspaper,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, Link } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { positionLabel } from '@/lib/positions';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { playerProfile } = useAuth();
  const { t } = useTranslation(['nav', 'common']);

  const playerNav = [
    { title: t('nav:player.dashboard'), url: '/player', icon: Home },
    { title: t('nav:player.profile'), url: '/player/profile', icon: User },
    { title: t('nav:player.attributes'), url: '/player/attributes', icon: TrendingUp },
    { title: t('nav:player.training_plan'), url: '/player/training-plan', icon: CalendarClock },
    { title: t('nav:player.club'), url: '/player/club', icon: Shield },
    { title: t('nav:player.matches'), url: '/player/matches', icon: Swords },
    { title: t('nav:player.pickup'), url: '/varzea', icon: Users2 },
    { title: t('nav:player.league'), url: '/league', icon: Trophy },
    { title: t('nav:player.contract'), url: '/player/contract', icon: FileText },
    { title: t('nav:player.offers'), url: '/player/offers', icon: Inbox },
    { title: t('nav:player.inbox'), url: '/inbox', icon: Newspaper },
    { title: t('nav:player.bank'), url: '/bank', icon: Landmark },
    { title: t('nav:player.store'), url: '/store', icon: Store },
    { title: t('nav:player.forum'), url: '/forum', icon: MessageSquare },
  ];

  const accountNav = [
    { title: t('nav:account.notifications'), url: '/notifications', icon: Bell },
    { title: t('nav:account.profile'), url: '/account/profile', icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
        {playerProfile && (
          <SidebarGroup>
            <SidebarGroupContent>
              {collapsed ? (
                <Link
                  to="/player/profile"
                  title={`${playerProfile.full_name} • ${positionLabel(playerProfile.primary_position)}`}
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-tactical/15 text-tactical hover:bg-tactical/25 transition-colors"
                >
                  <UserCircle2 className="h-5 w-5" />
                </Link>
              ) : (
                <Link
                  to="/player/profile"
                  className="mx-2 flex items-center gap-2 rounded-md border border-tactical/20 bg-tactical/10 px-2.5 py-2 hover:bg-tactical/20 transition-colors"
                  title={t('nav:active_player.switch_hint')}
                >
                  <UserCircle2 className="h-5 w-5 shrink-0 text-tactical" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                      {t('nav:active_player.label')}
                    </div>
                    <div className="text-sm font-display font-semibold leading-tight truncate flex items-center gap-1.5">
                      <span className="truncate">{playerProfile.full_name}</span>
                      {(playerProfile as any).country_code && <CountryFlag code={(playerProfile as any).country_code} size="xs" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-tight truncate">
                      {positionLabel(playerProfile.primary_position)}
                    </div>
                  </div>
                </Link>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav:groups.player')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {playerNav.map(item => (
                <SidebarMenuItem
                  key={item.title}
                  data-tour={
                    item.url === '/player/club' ? 'nav-club'
                    : item.url === '/player/training-plan' ? 'nav-training-plan'
                    : undefined
                  }
                >
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav:account.label')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountNav.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
