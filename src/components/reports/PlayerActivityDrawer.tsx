import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PositionBadge } from '@/components/PositionBadge';
import { ActivityHeatmap, type DayActivity } from './ActivityHeatmap';
import { NotifyPlayerDialog } from './NotifyPlayerDialog';
import { Dumbbell, Trophy, ShoppingBag, Bell, Clock } from 'lucide-react';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import type { TFunction } from 'i18next';
import type { SupportedLanguage } from '@/i18n';

export interface ReportEvent {
  type: 'training' | 'match' | 'purchase';
  date: string; // ISO
  data: any;
}

export interface PlayerReportDetail {
  player: {
    id: string;
    user_id: string | null;
    full_name: string;
    age: number;
    primary_position: string;
    overall: number;
    appearance: any;
  };
  events: ReportEvent[];
  activityByDay: Record<string, DayActivity>;
  stats: {
    daysTrained: number;
    trainings: number;
    matchesPlayed: number;
    goals: number;
    assists: number;
    purchases: number;
    attributeGain: number;
    score: number;
  };
  daysSinceLastTraining: number | null;
}

interface PlayerActivityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PlayerReportDetail | null;
  periodDays: number;
}

function formatRelativeDate(iso: string, t: TFunction, lang: SupportedLanguage): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return t('relative_date.just_now');
  if (diffH < 24) return t('relative_date.hours', { count: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return t('relative_date.days', { count: diffD });
  return formatDate(d, lang, 'date_short');
}

export function PlayerActivityDrawer({ open, onOpenChange, detail, periodDays }: PlayerActivityDrawerProps) {
  const { t } = useTranslation('player_activity_drawer');
  const { current: lang } = useAppLanguage();
  const [notifyOpen, setNotifyOpen] = useState(false);

  if (!detail) return null;

  const { player, events, activityByDay, stats, daysSinceLastTraining } = detail;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0">
                <PlayerAvatar appearance={player.appearance} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <SheetTitle className="truncate">{player.full_name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-0.5">
                  <PositionBadge position={player.primary_position} />
                  <span className="text-xs">
                    {t('header.years_old', { count: player.age })} • {t('header.ovr', { value: player.overall })}
                  </span>
                </SheetDescription>
              </div>
              {player.user_id && (
                <Button size="sm" variant="outline" onClick={() => setNotifyOpen(true)}>
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  {t('header.notify')}
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <StatBox
              label={t('stats.trainings')}
              value={stats.trainings}
              sublabel={t('stats.trainings_sublabel', { count: stats.daysTrained })}
            />
            <StatBox
              label={t('stats.matches')}
              value={stats.matchesPlayed}
              sublabel={t('stats.matches_sublabel', { goals: stats.goals, assists: stats.assists })}
            />
            <StatBox label={t('stats.purchases')} value={stats.purchases} />
            <StatBox label={t('stats.score')} value={stats.score} highlight />
          </div>

          {daysSinceLastTraining != null && daysSinceLastTraining >= 3 && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              {t('alerts.no_training', { count: daysSinceLastTraining })}
            </div>
          )}

          {/* Heatmap */}
          <div className="mt-5">
            <div className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('sections.heatmap_title')}
            </div>
            <ActivityHeatmap activity={activityByDay} days={30} />
          </div>

          {/* Timeline */}
          <div className="mt-5">
            <div className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('sections.history_title', { count: periodDays })}
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('sections.history_empty')}</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((ev, i) => (
                  <TimelineRow key={i} event={ev} t={t} lang={lang} />
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <NotifyPlayerDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        playerUserId={player.user_id}
        playerName={player.full_name}
        daysInactive={daysSinceLastTraining}
      />
    </>
  );
}

function StatBox({ label, value, sublabel, highlight }: { label: string; value: number; sublabel?: string; highlight?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 text-center ${highlight ? 'border-pitch/40 bg-pitch/10' : 'border-border bg-card'}`}>
      <div className={`font-display font-bold text-lg ${highlight ? 'text-pitch' : ''}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground">{sublabel}</div>}
    </div>
  );
}

function TimelineRow({ event, t, lang }: { event: ReportEvent; t: TFunction; lang: SupportedLanguage }) {
  const when = formatRelativeDate(event.date, t, lang);
  if (event.type === 'training') {
    const growth = event.data.growth ?? 0;
    return (
      <li className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-b-0">
        <Dumbbell className="h-3.5 w-3.5 text-pitch shrink-0" />
        <span className="flex-1">
          <Trans
            i18nKey="events.training"
            ns="player_activity_drawer"
            values={{ attribute: event.data.attribute_key }}
            components={[<strong />]}
          />
          {growth > 0 && <span className="text-pitch">{t('events.training_growth', { growth })}</span>}
        </span>
        <span className="text-muted-foreground tabular-nums">{when}</span>
      </li>
    );
  }
  if (event.type === 'match') {
    const { opponent, goals, assists, result } = event.data;
    return (
      <li className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-b-0">
        <Trophy className="h-3.5 w-3.5 text-tactical shrink-0" />
        <span className="flex-1">
          <Trans
            i18nKey="events.match_vs"
            ns="player_activity_drawer"
            values={{ opponent }}
            components={[<strong />]}
          />
          {result && <span className="text-muted-foreground">{t('events.match_result', { result })}</span>}
          {(goals > 0 || assists > 0) && <span className="text-pitch">{t('events.match_stats', { goals, assists })}</span>}
        </span>
        <span className="text-muted-foreground tabular-nums">{when}</span>
      </li>
    );
  }
  // purchase
  return (
    <li className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-b-0">
      <ShoppingBag className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="flex-1">
        <Trans
          i18nKey="events.purchase"
          ns="player_activity_drawer"
          values={{ name: event.data.name }}
          components={[<strong />]}
        />
        {event.data.category && <span className="text-muted-foreground">{t('events.purchase_category', { category: event.data.category })}</span>}
      </span>
      <span className="text-muted-foreground tabular-nums">{when}</span>
    </li>
  );
}
