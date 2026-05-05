import {
  Home, Shield, DollarSign, Building2, ShoppingCart, Users, ClipboardList, CalendarDays, Bell, Settings, Trophy, Landmark, Store, Brain, MessageSquare, BarChart3, Newspaper,
  LayoutGrid, UsersRound, Briefcase, Swords as SwordsIcon, Sparkles,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface SectionDef {
  label: string;
  groupIcon: LucideIcon;
  accent: string; // tailwind text color for the group icon
  items: NavItem[];
}

export function ManagerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  // Stadium hosts the Estrutura tab; League hosts the Voto tab — keep parents active.
  const isActive = (path: string) => {
    if (path === '/manager/stadium') {
      return location.pathname === '/manager/stadium' || location.pathname === '/manager/facilities';
    }
    if (path === '/league') {
      return location.pathname === '/league' || location.pathname === '/league/vote';
    }
    return location.pathname === path;
  };
  const { t } = useTranslation('nav');

  const sections: SectionDef[] = [
    {
      label: t('groups.manager_overview'),
      groupIcon: LayoutGrid,
      accent: 'text-tactical',
      items: [
        { title: t('manager.dashboard'), url: '/manager', icon: Home },
        { title: t('manager.club'), url: '/manager/club', icon: Shield },
        { title: t('manager.reports'), url: '/manager/relatorios', icon: BarChart3 },
      ],
    },
    {
      label: t('groups.manager_team'),
      groupIcon: UsersRound,
      accent: 'text-emerald-500',
      items: [
        { title: t('manager.squad'), url: '/manager/squad', icon: Users },
        { title: t('manager.lineup'), url: '/manager/lineup', icon: ClipboardList },
        { title: t('manager.training'), url: '/manager/coach', icon: Brain },
      ],
    },
    {
      label: t('groups.manager_operation'),
      groupIcon: Briefcase,
      accent: 'text-amber-500',
      items: [
        { title: t('manager.stadium'), url: '/manager/stadium', icon: Building2 },
        { title: t('manager.market'), url: '/manager/market', icon: ShoppingCart },
        { title: t('manager.finance'), url: '/manager/finance', icon: DollarSign },
      ],
    },
    {
      label: t('groups.manager_compete'),
      groupIcon: SwordsIcon,
      accent: 'text-red-500',
      items: [
        { title: t('manager.matches'), url: '/manager/challenges', icon: CalendarDays },
        { title: t('manager.league'), url: '/league', icon: Trophy },
      ],
    },
    {
      label: t('groups.manager_social'),
      groupIcon: Sparkles,
      accent: 'text-violet-500',
      items: [
        { title: t('manager.inbox'), url: '/inbox', icon: Newspaper },
        { title: t('manager.forum'), url: '/forum', icon: MessageSquare },
        { title: t('manager.bank'), url: '/bank', icon: Landmark },
        { title: t('manager.store'), url: '/store', icon: Store },
      ],
    },
  ];

  const accountNav: NavItem[] = [
    { title: t('account.notifications'), url: '/notifications', icon: Bell },
    { title: t('account.profile'), url: '/account/profile', icon: Settings },
  ];

  // ── Style B (Manager): bold pill labels with leading colored icon. Each group has a tinted pill header so it reads as a card.
  const renderGroup = (
    label: string,
    items: NavItem[],
    GroupIcon?: LucideIcon,
    accent?: string,
  ) => (
    <SidebarGroup>
      <SidebarGroupLabel className="px-1">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-sidebar-accent/40 px-2 py-0.5 text-[11px] font-display font-bold uppercase tracking-wide text-sidebar-foreground/85">
          {GroupIcon && <GroupIcon className={`h-3 w-3 ${accent ?? 'text-tactical'}`} />}
          {label}
        </span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(item => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink
                  to={item.url}
                  end
                  className="hover:bg-sidebar-accent/50"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent>
        {sections.map(section => (
          <div key={section.label}>
            {renderGroup(section.label, section.items, section.groupIcon, section.accent)}
          </div>
        ))}
        {renderGroup(t('account.label'), accountNav, Settings, 'text-muted-foreground')}
      </SidebarContent>
    </Sidebar>
  );
}
