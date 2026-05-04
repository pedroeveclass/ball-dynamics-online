import {
  Home, Shield, DollarSign, Building2, ShoppingCart, Users, ClipboardList, CalendarDays, Bell, Settings, Wrench, Trophy, Vote, Landmark, Store, Brain, MessageSquare, BarChart3, Newspaper,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';

export function ManagerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { t } = useTranslation('nav');

  const managerNav = [
    { title: t('manager.dashboard'), url: '/manager', icon: Home },
    { title: t('manager.club'), url: '/manager/club', icon: Shield },
    { title: t('manager.squad'), url: '/manager/squad', icon: Users },
    { title: t('manager.lineup'), url: '/manager/lineup', icon: ClipboardList },
    { title: t('manager.market'), url: '/manager/market', icon: ShoppingCart },
    { title: t('manager.finance'), url: '/manager/finance', icon: DollarSign },
    { title: t('manager.stadium'), url: '/manager/stadium', icon: Building2 },
    { title: t('manager.facilities'), url: '/manager/facilities', icon: Wrench },
    { title: t('manager.training'), url: '/manager/coach', icon: Brain },
    { title: t('manager.reports'), url: '/manager/relatorios', icon: BarChart3 },
    { title: t('manager.inbox'), url: '/inbox', icon: Newspaper },
    { title: t('manager.league'), url: '/league', icon: Trophy },
    { title: t('manager.vote'), url: '/league/vote', icon: Vote },
    { title: t('manager.matches'), url: '/manager/challenges', icon: CalendarDays },
    { title: t('manager.bank'), url: '/bank', icon: Landmark },
    { title: t('manager.store'), url: '/store', icon: Store },
    { title: t('manager.forum'), url: '/forum', icon: MessageSquare },
  ];

  const accountNav = [
    { title: t('account.notifications'), url: '/notifications', icon: Bell },
    { title: t('account.profile'), url: '/account/profile', icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('groups.manager')}</SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupLabel>{t('account.label')}</SidebarGroupLabel>
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
