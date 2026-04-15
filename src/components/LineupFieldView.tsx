import { FORMATIONS } from '@/pages/ManagerLineupPage';

export interface LineupViewSlot {
  slot_position: string;
  role_type: string;
  player: { id: string; full_name: string; overall: number; primary_position: string } | null;
}

interface LineupFieldViewProps {
  formation: string;
  slots: LineupViewSlot[];
  highlightPlayerId?: string | null;
}

// Read-only visual of a lineup, reusing the coordinate map from
// ManagerLineupPage so managers and players see the same field.
export function LineupFieldView({ formation, slots, highlightPlayerId }: LineupFieldViewProps) {
  const positions = FORMATIONS[formation] || FORMATIONS['4-4-2'];
  const byPosition = new Map(slots.filter(s => s.role_type === 'starter').map(s => [s.slot_position, s]));

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-pitch/20 border border-pitch/30" style={{ aspectRatio: '3/4', maxHeight: 400 }}>
      {/* Field markings */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-24 h-24 rounded-full border-2 border-pitch/30" />
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-t-0 border-pitch/30 rounded-b-lg" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-b-0 border-pitch/30 rounded-t-lg" />

      {positions.map(slot => {
        const s = byPosition.get(slot.position);
        const player = s?.player ?? null;
        const isMe = player && highlightPlayerId && player.id === highlightPlayerId;
        return (
          <div
            key={slot.position}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-display font-bold ${
              isMe ? 'bg-warning text-warning-foreground ring-2 ring-warning/60' : player ? 'bg-tactical text-tactical-foreground' : 'bg-muted/60 text-muted-foreground border border-dashed border-muted-foreground/40'
            }`}>
              {player ? player.overall : '—'}
            </div>
            <span className="text-[10px] font-display font-bold text-foreground/80 max-w-[70px] truncate text-center">
              {player ? player.full_name.split(' ').pop() : slot.label}
            </span>
            {player && <span className="text-[9px] text-muted-foreground">{slot.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
