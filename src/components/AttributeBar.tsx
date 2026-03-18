import { cn } from '@/lib/utils';
import { getAttributeTier } from '@/lib/attributes';

interface AttributeBarProps {
  label: string;
  value: number;
  max?: number;
  showTier?: boolean;
}

export function AttributeBar({ label, value, max = 99, showTier = false }: AttributeBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 80 ? 'bg-pitch' : value >= 60 ? 'bg-tactical' : value >= 40 ? 'bg-warning' : 'bg-destructive';
  const tier = getAttributeTier(value);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-display text-sm font-bold w-10 text-right">{typeof value === 'number' ? value.toFixed(2) : value}</span>
      {showTier && (
        <span className={cn('text-[10px] font-display font-semibold w-20 text-right truncate', tier.color)}>
          {tier.label}
        </span>
      )}
    </div>
  );
}
