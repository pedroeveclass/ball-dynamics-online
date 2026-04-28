import { energyLabel } from '@/lib/attributes';

interface EnergyBarProps {
  current: number;
  max: number;
}

export function EnergyBar({ current, max }: EnergyBarProps) {
  const pct = (current / max) * 100;
  const color = pct >= 70 ? 'bg-pitch' : pct >= 40 ? 'bg-warning' : 'bg-destructive';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{energyLabel()}</span>
        <span className="font-display font-bold">{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
