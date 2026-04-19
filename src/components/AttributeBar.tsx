import { cn } from '@/lib/utils';
import { getAttributeTier } from '@/lib/attributes';
import { ArrowUp, Lock } from 'lucide-react';

interface AttributeBarProps {
  label: string;
  value: number;
  max?: number;
  cap?: number;
  showTier?: boolean;
  evo?: number;
  showEvoSlot?: boolean;
}

export function AttributeBar({ label, value, max = 99, cap, showTier = false, evo, showEvoSlot = false }: AttributeBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 80 ? 'bg-pitch' : value >= 60 ? 'bg-tactical' : value >= 40 ? 'bg-warning' : 'bg-destructive';
  const tier = getAttributeTier(value);
  const hasRestrictedCap = typeof cap === 'number' && cap < 99;
  const atCap = hasRestrictedCap && value >= cap;
  const capPct = hasRestrictedCap ? Math.min(100, (cap / max) * 100) : null;
  const hasEvo = typeof evo === 'number' && evo > 0;
  const showEvo = showEvoSlot || hasEvo;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate">{label}</span>
      {showEvo && (
        <span className="flex items-center justify-start gap-0.5 w-14 shrink-0 text-xs font-display font-bold text-pitch">
          {hasEvo && (
            <>
              <ArrowUp className="h-3 w-3" />
              +{evo!.toFixed(2)}
            </>
          )}
        </span>
      )}
      <div className="relative flex-1 h-2 rounded-full bg-muted">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        {capPct != null && capPct < 100 && (
          <>
            {/* Shaded "locked" region from cap → 99 */}
            <div
              className="absolute top-0 h-2 rounded-r-full bg-foreground/15 pointer-events-none"
              style={{ left: `${capPct}%`, right: 0 }}
            />
            {/* Cap tick mark */}
            <div
              className="absolute -top-0.5 h-3 w-0.5 bg-foreground/50 pointer-events-none"
              style={{ left: `calc(${capPct}% - 1px)` }}
              title={`Limite: ${cap}`}
            />
          </>
        )}
      </div>
      <span className={cn('font-display text-sm font-bold w-10 text-right', atCap && 'text-muted-foreground')}>
        {typeof value === 'number' ? value.toFixed(2) : value}
      </span>
      {atCap && (
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label={`No limite (${cap})`} />
      )}
      {showTier && (
        <span className={cn('text-[10px] font-display font-semibold w-20 text-right truncate', tier.color)}>
          {tier.label}
        </span>
      )}
    </div>
  );
}
