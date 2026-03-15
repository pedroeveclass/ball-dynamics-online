import {
  LayoutDashboard, User, TrendingUp, DollarSign,
  Trophy, Calendar, Swords, Table2,
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
  { title: 'Contrato', url: '/player/contract', icon: DollarSign },
];

const leagueNav = [
  { title: 'Classificação', url: '/league', icon: Table2 },
  { title: 'Calendário', url: '/league/calendar', icon: Calendar },
  { title: 'Partida', url: '/match', icon: Swords },
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
          <SidebarGroupLabel>Liga & Partidas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {leagueNav.map(item => (
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
