import { cn } from '@/lib/utils';
import type { PositionCategory } from '@/types/game';
import { positionToPT } from '@/lib/positions';

interface PositionBadgeProps {
  position: string;
  category?: PositionCategory;
  className?: string;
}

const categoryMap: Record<string, PositionCategory> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', CF: 'FWD', ST: 'FWD',
};

export function PositionBadge({ position, category, className }: PositionBadgeProps) {
  const clean = position.replace(/[0-9]/g, '').toUpperCase();
  const cat = category || categoryMap[clean] || 'MID';
  const cls = {
    GK: 'badge-gk',
    DEF: 'badge-def',
    MID: 'badge-mid',
    FWD: 'badge-fwd',
  }[cat];

  return <span className={cn(cls, className)}>{positionToPT(position)}</span>;
}
