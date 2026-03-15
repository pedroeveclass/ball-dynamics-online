import {
  LayoutDashboard, Shield, DollarSign, Building2, ShoppingCart, Users, ClipboardList, Swords,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';

const managerNav = [
  { title: 'Dashboard', url: '/manager', icon: LayoutDashboard },
  { title: 'Clube', url: '/manager/club', icon: Shield },
  { title: 'Elenco', url: '/manager/squad', icon: Users },
  { title: 'Escalação', url: '/manager/lineup', icon: ClipboardList },
  { title: 'Mercado', url: '/manager/market', icon: ShoppingCart },
  { title: 'Finanças', url: '/manager/finance', icon: DollarSign },
  { title: 'Estádio', url: '/manager/stadium', icon: Building2 },
];

export function ManagerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manager</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managerNav.map(item => (
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
