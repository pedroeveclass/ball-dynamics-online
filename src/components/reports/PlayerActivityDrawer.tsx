import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PositionBadge } from '@/components/PositionBadge';
import { ActivityHeatmap, type DayActivity } from './ActivityHeatmap';
import { NotifyPlayerDialog } from './NotifyPlayerDialog';
import { Dumbbell, Trophy, ShoppingBag, Bell, Clock } from 'lucide-react';

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

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'agora há pouco';
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function PlayerActivityDrawer({ open, onOpenChange, detail, periodDays }: PlayerActivityDrawerProps) {
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
                  <span className="text-xs">{player.age} anos • OVR {player.overall}</span>
                </SheetDescription>
              </div>
              {player.user_id && (
                <Button size="sm" variant="outline" onClick={() => setNotifyOpen(true)}>
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  Notificar
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <StatBox label="Treinos" value={stats.trainings} sublabel={`${stats.daysTrained} dias`} />
            <StatBox label="Jogos" value={stats.matchesPlayed} sublabel={`${stats.goals}G ${stats.assists}A`} />
            <StatBox label="Compras" value={stats.purchases} />
            <StatBox label="Score" value={stats.score} highlight />
          </div>

          {daysSinceLastTraining != null && daysSinceLastTraining >= 3 && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Sem treinar há {daysSinceLastTraining} dias.
            </div>
          )}

          {/* Heatmap */}
          <div className="mt-5">
            <div className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Atividade diária — últimos 30 dias
            </div>
            <ActivityHeatmap activity={activityByDay} days={30} />
          </div>

          {/* Timeline */}
          <div className="mt-5">
            <div className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Histórico — últimos {periodDays} dias
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma atividade no período.</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((ev, i) => (
                  <TimelineRow key={i} event={ev} />
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

function TimelineRow({ event }: { event: ReportEvent }) {
  const when = formatRelativeDate(event.date);
  if (event.type === 'training') {
    const growth = event.data.growth ?? 0;
    return (
      <li className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-b-0">
        <Dumbbell className="h-3.5 w-3.5 text-pitch shrink-0" />
        <span className="flex-1">
          Treinou <strong>{event.data.attribute_key}</strong>
          {growth > 0 && <span className="text-pitch"> (+{growth})</span>}
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
          vs <strong>{opponent}</strong>
          {result && <span className="text-muted-foreground"> ({result})</span>}
          {(goals > 0 || assists > 0) && <span className="text-pitch"> — {goals}G {assists}A</span>}
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
        Comprou <strong>{event.data.name}</strong>
        {event.data.category && <span className="text-muted-foreground"> ({event.data.category})</span>}
      </span>
      <span className="text-muted-foreground tabular-nums">{when}</span>
    </li>
  );
}
