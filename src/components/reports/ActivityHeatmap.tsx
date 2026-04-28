import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';

export interface DayActivity {
  trainings: number;
  matches: number;
  purchases: number;
}

interface ActivityHeatmapProps {
  // Key format: YYYY-MM-DD (local date)
  activity: Record<string, DayActivity>;
  days?: number; // default 30
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ActivityHeatmap({ activity, days = 30 }: ActivityHeatmapProps) {
  const { t } = useTranslation('manager_reports');
  const { current: lang } = useAppLanguage();
  const dateLocale = lang === 'en' ? 'en-US' : 'pt-BR';
  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: { date: string; total: number; label: string; data: DayActivity }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toLocalISODate(d);
      const data = activity[key] ?? { trainings: 0, matches: 0, purchases: 0 };
      out.push({
        date: key,
        total: data.trainings + data.matches + data.purchases,
        label: d.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }),
        data,
      });
    }
    return out;
  }, [activity, days, dateLocale]);

  const intensity = (total: number): string => {
    if (total === 0) return 'bg-muted/30';
    if (total === 1) return 'bg-pitch/30';
    if (total === 2) return 'bg-pitch/55';
    if (total === 3) return 'bg-pitch/75';
    return 'bg-pitch';
  };

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-5 gap-1" style={{ gridAutoColumns: 'minmax(14px, 1fr)' }}>
        {cells.map(c => (
          <div
            key={c.date}
            className={`aspect-square rounded-sm ${intensity(c.total)} hover:ring-1 hover:ring-pitch/60 transition-all`}
            title={t('heatmap.tooltip', {
              label: c.label,
              trainings: c.data.trainings,
              trainingsWord: c.data.trainings === 1 ? t('heatmap.trainings_one') : t('heatmap.trainings_other'),
              matches: c.data.matches,
              matchesWord: c.data.matches === 1 ? t('heatmap.matches_one') : t('heatmap.matches_other'),
              purchases: c.data.purchases,
              purchasesWord: c.data.purchases === 1 ? t('heatmap.purchases_one') : t('heatmap.purchases_other'),
            })}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
        <span>{cells[0]?.label}</span>
        <div className="flex items-center gap-1">
          <span>{t('heatmap.less')}</span>
          <div className="w-2.5 h-2.5 rounded-sm bg-muted/30" />
          <div className="w-2.5 h-2.5 rounded-sm bg-pitch/30" />
          <div className="w-2.5 h-2.5 rounded-sm bg-pitch/55" />
          <div className="w-2.5 h-2.5 rounded-sm bg-pitch/75" />
          <div className="w-2.5 h-2.5 rounded-sm bg-pitch" />
          <span>{t('heatmap.more')}</span>
        </div>
        <span>{t('heatmap.today')}</span>
      </div>
    </div>
  );
}
