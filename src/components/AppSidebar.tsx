import {
  LayoutDashboard, User, TrendingUp, FileText, Inbox, Shield, Swords, Bell, Settings, Trophy, Landmark, Store, MessageSquare, CalendarClock, Users2, UserCircle2,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, Link } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { positionToPT } from '@/lib/positions';

const playerNav = [
  { title: 'Dashboard', url: '/player', icon: LayoutDashboard },
  { title: 'Perfil', url: '/player/profile', icon: User },
  { title: 'Atributos & Treino', url: '/player/attributes', icon: TrendingUp },
  { title: 'Treino Automático', url: '/player/training-plan', icon: CalendarClock },
  { title: 'Meu Clube', url: '/player/club', icon: Shield },
  { title: 'Partidas', url: '/player/matches', icon: Swords },
  { title: 'Jogos de Várzea', url: '/varzea', icon: Users2 },
  { title: 'Liga', url: '/league', icon: Trophy },
  { title: 'Contrato', url: '/player/contract', icon: FileText },
  { title: 'Propostas', url: '/player/offers', icon: Inbox },
  { title: 'Banco', url: '/bank', icon: Landmark },
  { title: 'Loja', url: '/store', icon: Store },
  { title: 'Fórum', url: '/forum', icon: MessageSquare },
];

const accountNav = [
  { title: 'Notificações', url: '/notifications', icon: Bell },
  { title: 'Perfil da Conta', url: '/account/profile', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { playerProfile } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
        {playerProfile && (
          <SidebarGroup>
            <SidebarGroupContent>
              {collapsed ? (
                <Link
                  to="/player/profile"
                  title={`${playerProfile.full_name} • ${positionToPT(playerProfile.primary_position)}`}
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-tactical/15 text-tactical hover:bg-tactical/25 transition-colors"
                >
                  <UserCircle2 className="h-5 w-5" />
                </Link>
              ) : (
                <Link
                  to="/player/profile"
                  className="mx-2 flex items-center gap-2 rounded-md border border-tactical/20 bg-tactical/10 px-2.5 py-2 hover:bg-tactical/20 transition-colors"
                  title="Trocar jogador ativo"
                >
                  <UserCircle2 className="h-5 w-5 shrink-0 text-tactical" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                      Jogando como
                    </div>
                    <div className="text-sm font-display font-semibold leading-tight truncate">
                      {playerProfile.full_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-tight truncate">
                      {positionToPT(playerProfile.primary_position)}
                    </div>
                  </div>
                </Link>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Jogador</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {playerNav.map(item => (
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
        <SidebarGroup>
          <SidebarGroupLabel>Conta</SidebarGroupLabel>
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
