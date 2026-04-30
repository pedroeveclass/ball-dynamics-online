import { cn } from '@/lib/utils';
import { getAttributeTier, tierLabel } from '@/lib/attributes';
import { ArrowUp, Lock } from 'lucide-react';
import { AttributeInfo } from '@/components/AttributeInfo';

interface AttributeBarProps {
  label: string;
  value: number;
  max?: number;
  cap?: number;
  showTier?: boolean;
  evo?: number;
  showEvoSlot?: boolean;
  /** Item bonus added to base value (e.g. equipped boots +6 acuracia_chute). */
  bonus?: number;
  /** Attribute key — when set, renders an info "i" icon left of the label. */
  infoKey?: string;
}

export function AttributeBar({ label, value, max = 99, cap, showTier = false, evo, showEvoSlot = false, bonus, infoKey }: AttributeBarProps) {
  const hasBonus = typeof bonus === 'number' && bonus > 0;
  const totalValue = hasBonus ? value + bonus! : value;
  const pct = Math.min(100, (totalValue / max) * 100);
  const basePct = hasBonus ? Math.min(100, (value / max) * 100) : pct;
  const color = totalValue >= 80 ? 'bg-pitch' : totalValue >= 60 ? 'bg-tactical' : totalValue >= 40 ? 'bg-warning' : 'bg-destructive';
  const tier = getAttributeTier(totalValue);
  const hasRestrictedCap = typeof cap === 'number' && cap < 99;
  const atCap = hasRestrictedCap && value >= cap;
  const capPct = hasRestrictedCap ? Math.min(100, (cap / max) * 100) : null;
  const hasEvo = typeof evo === 'number' && evo > 0;
  const showEvo = showEvoSlot || hasEvo;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 w-32 min-w-0">
        {infoKey && <AttributeInfo attrKey={infoKey} />}
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
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
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${basePct}%` }} />
        {hasBonus && (
          <div
            className="absolute top-0 h-2 bg-emerald-400 rounded-r-full"
            style={{ left: `${basePct}%`, width: `${Math.max(0, pct - basePct)}%` }}
            title={`Bônus de item: +${bonus}`}
          />
        )}
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
      <span className={cn('font-display text-sm font-bold text-right shrink-0', hasBonus ? 'w-auto' : 'w-10', atCap && !hasBonus && 'text-muted-foreground')}>
        {typeof value === 'number' ? value.toFixed(2) : value}
        {hasBonus && (
          <span className="ml-1 text-xs text-emerald-400" title="Bônus de item ativo">+{bonus}</span>
        )}
      </span>
      {atCap && (
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label={`No limite (${cap})`} />
      )}
      {showTier && (
        <span className={cn('text-[10px] font-display font-semibold w-20 text-right truncate', tier.color)}>
          {tierLabel(tier)}
        </span>
      )}
    </div>
  );
}
