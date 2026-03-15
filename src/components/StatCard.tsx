import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, subtitle, trend, icon, className }: StatCardProps) {
  return (
    <div className={cn('stat-card', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      {trend && (
        <div className="mt-2">
          <span className={cn(
            'text-xs font-semibold',
            trend === 'up' && 'text-pitch',
            trend === 'down' && 'text-destructive',
            trend === 'neutral' && 'text-muted-foreground',
          )}>
            {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'}
          </span>
        </div>
      )}
    </div>
  );
}
