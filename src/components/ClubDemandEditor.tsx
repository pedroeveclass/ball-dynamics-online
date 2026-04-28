import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { POSITIONS } from '@/lib/attributes';
import { positionLabel } from '@/lib/positions';
import { toast } from 'sonner';
import { Check } from 'lucide-react';

const FIELD_SLOTS: Record<string, { col: number; row: number }> = {
  LW:  { col: 1, row: 1 },
  ST:  { col: 3, row: 1 },
  RW:  { col: 5, row: 1 },
  CF:  { col: 3, row: 2 },
  CAM: { col: 3, row: 3 },
  LM:  { col: 1, row: 4 },
  CM:  { col: 3, row: 4 },
  RM:  { col: 5, row: 4 },
  DM:  { col: 3, row: 5 },
  LWB: { col: 1, row: 6 },
  CB:  { col: 3, row: 6 },
  RWB: { col: 5, row: 6 },
  LB:  { col: 1, row: 7 },
  RB:  { col: 5, row: 7 },
  GK:  { col: 3, row: 8 },
};

export function ClubDemandEditor() {
  const { t } = useTranslation('club_demand');
  const [active, setActive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('get_my_club_demand').then(({ data, error }) => {
      if (!error && data) {
        const set = new Set<string>();
        for (const row of data as Array<{ pos: string }>) {
          set.add(row.pos);
        }
        setActive(set);
      }
      setLoading(false);
    });
  }, []);

  const toggle = async (pos: string) => {
    if (pending) return;
    setPending(pos);
    const { data, error } = await supabase.rpc('toggle_club_position_demand', { p_position: pos });
    setPending(null);
    if (error) {
      toast.error(error.message || t('toast.update_error'));
      return;
    }
    setActive(prev => {
      const next = new Set(prev);
      if (data) next.add(pos);
      else next.delete(pos);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t('count', { count: active.size })}
        </span>
      </div>

      <div
        className="relative rounded-lg border border-border bg-gradient-to-b from-pitch/10 via-pitch/5 to-pitch/10 p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(8, minmax(3rem, auto))',
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
          const isActive = active.has(p.value);
          const isPending = pending === p.value;

          return (
            <button
              key={p.value}
              type="button"
              disabled={loading || isPending}
              onClick={() => toggle(p.value)}
              style={{ gridColumn: slot.col, gridRow: slot.row }}
              className={`relative rounded-md border px-1 py-1 text-center transition-colors ${
                isActive
                  ? 'border-tactical bg-tactical/20 text-tactical'
                  : 'border-border bg-card text-muted-foreground hover:border-tactical/50'
              } ${isPending ? 'opacity-50' : ''}`}
              title={p.label}
            >
              <div className="font-display text-[11px] font-bold leading-tight">
                {positionLabel(p.value, 'short')}
              </div>
              <div className="font-display text-[10px] leading-tight opacity-70">
                {p.label}
              </div>
              {isActive && (
                <Check className="absolute top-0.5 right-0.5 h-3 w-3 text-tactical" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
