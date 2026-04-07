import {
  LayoutDashboard, User, TrendingUp, FileText, Inbox, Shield, Swords, Bell, Settings, Trophy, Landmark, Store, MessageSquare,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';

const playerNav = [
  { title: 'Dashboard', url: '/player', icon: LayoutDashboard },
  { title: 'Perfil', url: '/player/profile', icon: User },
  { title: 'Atributos & Treino', url: '/player/attributes', icon: TrendingUp },
  { title: 'Meu Clube', url: '/player/club', icon: Shield },
  { title: 'Partidas', url: '/player/matches', icon: Swords },
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

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
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
