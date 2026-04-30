import { cn } from '@/lib/utils';
import type { PositionCategory } from '@/types/game';
import { positionToPT } from '@/lib/positions';

interface PositionBadgeProps {
  position: string;
  category?: PositionCategory;
  className?: string;
  /**
   * Optional secondary position. When provided and different from `position`,
   * an additional, smaller badge is rendered next to the primary one
   * (e.g. "RW / ST"). Use this everywhere a player position is shown so the
   * secondary surfaces consistently across the UI.
   */
  secondary?: string | null;
}

const categoryMap: Record<string, PositionCategory> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  DM: 'MID', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', CF: 'FWD', ST: 'FWD',
};

function badgeClass(pos: string, category?: PositionCategory): string {
  const clean = pos.replace(/[0-9]/g, '').toUpperCase();
  const cat = category || categoryMap[clean] || 'MID';
  return {
    GK: 'badge-gk',
    DEF: 'badge-def',
    MID: 'badge-mid',
    FWD: 'badge-fwd',
  }[cat];
}

export function PositionBadge({ position, category, className, secondary }: PositionBadgeProps) {
  const cleanP = position.replace(/[0-9]/g, '').toUpperCase();
  const cleanS = (secondary ?? '').replace(/[0-9]/g, '').toUpperCase();
  const showSecondary = !!cleanS && cleanS !== cleanP;

  const primaryEl = (
    <span className={cn(badgeClass(position, category), className)}>
      {positionToPT(position)}
    </span>
  );

  if (!showSecondary) return primaryEl;
  return (
    <span className="inline-flex items-center gap-1">
      {primaryEl}
      <span
        className={cn(badgeClass(secondary as string), 'opacity-70 text-[0.85em]', className)}
        title={positionToPT(secondary)}
      >
        {positionToPT(secondary)}
      </span>
    </span>
  );
}
