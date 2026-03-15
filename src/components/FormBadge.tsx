import { cn } from '@/lib/utils';
import type { LeagueStanding } from '@/types/game';

interface FormBadgeProps {
  form: LeagueStanding['form'];
}

export function FormBadge({ form }: FormBadgeProps) {
  return (
    <div className="flex gap-0.5">
      {form.map((r, i) => (
        <span
          key={i}
          className={cn(
            'h-5 w-5 rounded-sm flex items-center justify-center text-[10px] font-bold',
            r === 'W' && 'bg-pitch text-pitch-foreground',
            r === 'D' && 'bg-warning text-warning-foreground',
            r === 'L' && 'bg-destructive text-destructive-foreground',
          )}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
