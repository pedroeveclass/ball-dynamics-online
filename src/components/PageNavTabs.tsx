import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PageNavTab {
  to: string;
  label: string;
  icon?: LucideIcon;
}

export function PageNavTabs({ tabs, className }: { tabs: PageNavTab[]; className?: string }) {
  const { pathname } = useLocation();
  return (
    <div
      role="tablist"
      className={cn(
        'flex w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1',
        className,
      )}
    >
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            role="tab"
            aria-selected={active}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-display font-semibold transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
