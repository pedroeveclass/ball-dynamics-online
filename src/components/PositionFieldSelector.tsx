import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { POSITIONS } from '@/lib/attributes';
import { positionToPT } from '@/lib/positions';
import { Briefcase, Users } from 'lucide-react';

// Grid slot for each of the 16 positions on a 5-col × 8-row field
// (col/row are 1-indexed; attacking top, GK bottom).
const FIELD_SLOTS: Record<string, { col: number; row: number }> = {
  LW:  { col: 1, row: 1 },
  ST:  { col: 3, row: 1 },
  RW:  { col: 5, row: 1 },
  CF:  { col: 3, row: 2 },
  CAM: { col: 3, row: 3 },
  LM:  { col: 1, row: 4 },
  CM:  { col: 3, row: 4 },
  RM:  { col: 5, row: 4 },
  DM:  { col: 2, row: 5 },
  CDM: { col: 4, row: 5 },
  LWB: { col: 1, row: 6 },
  CB:  { col: 3, row: 6 },
  RWB: { col: 5, row: 6 },
  LB:  { col: 1, row: 7 },
  RB:  { col: 5, row: 7 },
  GK:  { col: 3, row: 8 },
};

const SCARCE_THRESHOLD = 5;

interface Props {
  value: string;
  onChange: (pos: string) => void;
}

export function PositionFieldSelector({ value, onChange }: Props) {
  const [humanCounts, setHumanCounts] = useState<Record<string, number> | null>(null);
  const [demandCounts, setDemandCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    supabase.rpc('get_human_counts_by_position').then(({ data, error }) => {
      if (error) return;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ pos: string; human_count: number }>) {
        map[row.pos] = Number(row.human_count);
      }
      setHumanCounts(map);
    });

    supabase.rpc('get_position_demand_counts').then(({ data, error }) => {
      if (error) return;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ pos: string; demand_count: number }>) {
        map[row.pos] = Number(row.demand_count);
      }
      setDemandCounts(map);
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Jogadores humanos</span>
        <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> Clubes procurando</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-pitch" /> Poucos jogadores (&lt;5)</span>
      </div>

      <div
        className="relative rounded-lg border border-border bg-gradient-to-b from-pitch/10 via-pitch/5 to-pitch/10 p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(8, minmax(3.6rem, auto))',
          gap: '0.4rem',
        }}
      >
        <div
          className="pointer-events-none border-t border-dashed border-pitch/30"
          style={{ gridColumn: '1 / -1', gridRow: '5' }}
        />

        {POSITIONS.map(p => {
          const slot = FIELD_SLOTS[p.value];
          if (!slot) return null;
          const humans = humanCounts?.[p.value] ?? 0;
          const demand = demandCounts?.[p.value] ?? 0;
          const isSelected = value === p.value;
          const isScarce = humanCounts !== null && humans < SCARCE_THRESHOLD;

          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              style={{ gridColumn: slot.col, gridRow: slot.row }}
              className={`rounded-md border px-1 py-1 text-center transition-colors ${
                isSelected
                  ? 'border-tactical bg-tactical/20 text-tactical'
                  : isScarce
                    ? 'border-pitch/60 bg-pitch/10 text-foreground hover:bg-pitch/20'
                    : 'border-border bg-card text-muted-foreground hover:border-tactical/50'
              }`}
              title={`${p.label} — ${humans} jogador${humans === 1 ? '' : 'es'}, ${demand} clube${demand === 1 ? '' : 's'} procurando`}
            >
              <div className="font-display text-[11px] font-bold leading-tight">
                {positionToPT(p.value)}
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <span className="flex items-center gap-0.5 text-[11px] font-display font-bold">
                  <Users className="h-2.5 w-2.5 opacity-70" />
                  <span className={isSelected ? 'text-tactical' : humans === 0 || isScarce ? 'text-pitch' : 'text-foreground'}>
                    {humanCounts === null ? '–' : humans}
                  </span>
                </span>
                {demandCounts !== null && demand > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-display font-bold text-tactical">
                    <Briefcase className="h-2.5 w-2.5 opacity-70" />
                    {demand}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {value && (
        <div className="flex items-center justify-between rounded-md border border-tactical/30 bg-tactical/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Selecionada:</span>
          <span className="font-display font-bold text-tactical">
            {POSITIONS.find(p => p.value === value)?.label}
          </span>
        </div>
      )}
    </div>
  );
}
