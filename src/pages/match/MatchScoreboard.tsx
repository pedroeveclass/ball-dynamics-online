import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Square, LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClubInfo, EventLog } from './types';
import { computeMatchMinute, HALF_DURATION_MS_CLIENT } from './constants';
import { ClubCrest } from '@/components/ClubCrest';

// Mirrors MatchSidebar.tsx eventMinute: approximates the match-minute at which
// an event occurred from its created_at relative to the current half start.
// For goals logged in a previous half, this becomes inaccurate once the next
// half starts — acceptable since we have no turn_number in the event row.
function goalMinute(event: EventLog, halfStartedAt: string | null, currentHalf: number): number | null {
  if (!halfStartedAt) {
    // Fallback: extract "Turno N" from body and approximate 1 turn ≈ 1 minute.
    const m = /Turno\s+(\d+)/.exec(event.body || '');
    if (m) {
      const turn = Number(m[1]);
      if (Number.isFinite(turn) && turn > 0) return Math.min(90, turn);
    }
    return null;
  }
  const halfStart = new Date(halfStartedAt).getTime();
  const eventTs = new Date(event.created_at).getTime();
  const elapsed = eventTs - halfStart;
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < 0) {
    // Event is before the current half started → belongs to a previous half.
    // Fallback to the body's "Turno N" if available.
    const m = /Turno\s+(\d+)/.exec(event.body || '');
    if (m) {
      const turn = Number(m[1]);
      if (Number.isFinite(turn) && turn > 0) return Math.min(90, turn);
    }
    return null;
  }
  const halfMinutes = Math.min(45, Math.floor((elapsed / HALF_DURATION_MS_CLIENT) * 45));
  return currentHalf === 1 ? halfMinutes : 45 + halfMinutes;
}

interface ScorerEntry {
  key: string;
  name: string;
  minutes: number[];
}

function collectGoalsForClub(events: EventLog[], clubId: string | undefined, halfStartedAt: string | null, currentHalf: number): ScorerEntry[] {
  if (!clubId) return [];
  const byKey = new Map<string, ScorerEntry>();
  for (const ev of events) {
    if (ev.event_type !== 'goal') continue;
    const payload = (ev.payload || {}) as Record<string, any>;
    if (payload.scorer_club_id !== clubId) continue;
    const name = (payload.scorer_name as string | undefined)?.trim() || 'Jogador';
    const key = (payload.scorer_profile_id as string | undefined)
      || (payload.scorer_participant_id as string | undefined)
      || name;
    const minute = goalMinute(ev, halfStartedAt, currentHalf) ?? 0;
    const existing = byKey.get(key);
    if (existing) existing.minutes.push(minute);
    else byKey.set(key, { key, name, minutes: [minute] });
  }
  return Array.from(byKey.values()).map(e => ({
    ...e,
    minutes: [...e.minutes].sort((a, b) => a - b),
  }));
}

function GoalList({ entries, alignRight }: { entries: ScorerEntry[]; alignRight?: boolean }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className={`flex flex-col gap-0.5 text-[10px] font-display text-white/80 leading-tight ${alignRight ? 'items-end text-right' : 'items-start text-left'}`}>
      {entries.map(entry => {
        const minutesLabel = entry.minutes.map(m => `${m}'`).join(', ');
        const suffix = entry.minutes.length > 1 ? ` (${entry.minutes.length})` : '';
        return (
          <span key={entry.key} className="whitespace-nowrap truncate max-w-[140px]">
            {minutesLabel} {entry.name}{suffix}
          </span>
        );
      })}
    </div>
  );
}

// ─── ClubBadgeInline ──────────────────────────────────────────
function ClubBadgeInline({ club, right, hasPossession }: { club: ClubInfo | null; right?: boolean; hasPossession?: boolean }) {
  if (!club) return <div className="w-7 h-7 rounded bg-muted animate-pulse" />;
  return (
    <div className={`flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
      <ClubCrest
        crestUrl={club.crest_url}
        primaryColor={club.primary_color}
        secondaryColor={club.secondary_color}
        shortName={club.short_name}
        className={`w-7 h-7 rounded text-[9px] shadow transition-shadow ${hasPossession ? 'ring-2 ring-warning ring-offset-1 ring-offset-[hsl(220,15%,16%)]' : ''}`}
      />
      <span
        className={`font-display font-bold text-[11px] hidden sm:inline-flex items-center gap-1 max-w-28 truncate px-1.5 py-0.5 rounded transition-colors ${
          hasPossession ? 'text-warning bg-warning/15' : 'text-white'
        }`}
      >
        {hasPossession && <span aria-label="com a posse" className="text-[12px] leading-none">&#x26BD;</span>}
        <span className="truncate">{club.name}</span>
      </span>
    </div>
  );
}

// ─── MatchScoreboard (extracted, memoized) ─────────────────────
export interface MatchScoreboardProps {
  isLive: boolean; isFinished: boolean; isTestMatch: boolean;
  isLooseBall: boolean; isPhaseProcessing: boolean; isPositioningTurn: boolean;
  homeClub: ClubInfo | null; awayClub: ClubInfo | null;
  homeScore: number; awayScore: number;
  currentTurnNumber: number; activeTurnPhase: string | null;
  halfStartedAt: string | null; currentHalf: number;
  myRole: 'player' | 'manager' | 'spectator';
  isBenchPlayer: boolean;
  isManager: boolean;
  onFinishMatch: () => void; onExit: () => void;
  homeUniformNum: number; awayUniformNum: number;
  homeActiveUniform: { shirt_color: string; number_color: string };
  awayActiveUniform: { shirt_color: string; number_color: string };
  onToggleUniform: (side: 'home' | 'away') => void;
  myClubId: string | null;
  possessionClubId: string | null;
  leagueRoundNumber: number | null;
  events: EventLog[];
}

export const MatchScoreboard = React.memo(function MatchScoreboard(props: MatchScoreboardProps) {
  const { t } = useTranslation('match_room');
  const {
    isLive, isFinished, isTestMatch, isLooseBall, isPhaseProcessing, isPositioningTurn,
    homeClub, awayClub, homeScore, awayScore, currentTurnNumber, activeTurnPhase,
    halfStartedAt, currentHalf,
    myRole, isBenchPlayer, isManager, onFinishMatch, onExit,
    homeUniformNum, awayUniformNum, homeActiveUniform, awayActiveUniform, onToggleUniform, myClubId,
    possessionClubId, leagueRoundNumber, events,
  } = props;

  const homeGoals = useMemo(
    () => collectGoalsForClub(events, homeClub?.id, halfStartedAt, currentHalf),
    [events, homeClub?.id, halfStartedAt, currentHalf],
  );
  const awayGoals = useMemo(
    () => collectGoalsForClub(events, awayClub?.id, halfStartedAt, currentHalf),
    [events, awayClub?.id, halfStartedAt, currentHalf],
  );

  const viewerRoleLabel = myRole === 'player' ? t('viewer_role.player') : myRole === 'manager' ? t('viewer_role.manager') : t('viewer_role.spectator');
  const viewerRoleClass =
    myRole === 'player' ? 'border-pitch/60 text-pitch' :
    myRole === 'manager' ? 'border-tactical/60 text-tactical' :
    'border-border text-muted-foreground';

  const homeHasBall = !!homeClub && possessionClubId === homeClub.id && !isLooseBall;
  const awayHasBall = !!awayClub && possessionClubId === awayClub.id && !isLooseBall;

  // Tick every second for halftime countdown
  const [, setTick] = useState(0);
  const isHalftimeNow = currentHalf === 2 && halfStartedAt && new Date(halfStartedAt).getTime() > Date.now();
  useEffect(() => {
    if (!isHalftimeNow) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isHalftimeNow]);

  return (
    <div className="bg-[hsl(220,15%,16%)] border-b border-[hsl(220,10%,25%)] px-4 py-1.5 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`font-display text-[10px] ${viewerRoleClass}`}>
          {viewerRoleLabel}
        </Badge>
        <Badge variant="outline" className={`font-display text-[10px] ${isLive ? 'border-pitch/60 text-pitch animate-pulse' : 'border-border text-muted-foreground'}`}>
          {isLive && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-pitch inline-block" />}
          {isLive ? t('status.live') : isFinished ? t('status.finished') : t('status.scheduled')}
        </Badge>
        {leagueRoundNumber !== null && (
          <Badge variant="outline" className="font-display text-[10px] border-border text-muted-foreground">
            {t('round_label', { round: leagueRoundNumber })}
          </Badge>
        )}
        {isTestMatch && <Badge variant="secondary" className="text-[9px] font-display">5v5</Badge>}
        {isLooseBall && <Badge variant="secondary" className="text-[9px] font-display text-warning border-warning/40">BOLA SOLTA</Badge>}
        {isPhaseProcessing && <Badge variant="secondary" className="text-[9px] font-display animate-pulse">PROCESSANDO</Badge>}
        {isPositioningTurn && <Badge variant="secondary" className="text-[9px] font-display text-tactical border-tactical/40">POSICIONAMENTO</Badge>}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GoalList entries={homeGoals} alignRight />
          <div className="flex items-center gap-1">
            <ClubBadgeInline club={homeClub} hasPossession={homeHasBall} />
            {isManager && isTestMatch && myClubId === homeClub?.id && (
              <button
                onClick={() => onToggleUniform('home')}
                title={`Uniforme ${homeUniformNum}`}
                className="w-5 h-5 rounded text-[8px] font-display font-bold border border-white/20 hover:border-white/50 transition-colors flex items-center justify-center"
                style={{ backgroundColor: homeActiveUniform.shirt_color, color: homeActiveUniform.number_color }}
              >
                {homeUniformNum}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="font-display text-3xl font-extrabold tracking-widest text-white">
            <span>{homeScore}</span>
            <span className="text-white/40 mx-2 text-lg">:</span>
            <span>{awayScore}</span>
          </div>
          {isLive && (() => {
            const matchClock = { half_started_at: halfStartedAt, current_half: currentHalf };
            const minute = computeMatchMinute(matchClock);
            const half = currentHalf === 1 ? '1T' : '2T';
            // Halftime: half_started_at is in the future (second half hasn't started yet)
            const isHalftime = currentHalf === 2 && halfStartedAt && new Date(halfStartedAt).getTime() > Date.now();
            return (
              <div className="flex items-center gap-1.5 ml-2 bg-[hsl(220,15%,22%)] rounded px-2 py-0.5">
                {isHalftime ? (
                  <span className="text-[11px] font-display font-bold text-warning animate-pulse">
                    &#x23F8; INT {(() => {
                      const remaining = Math.max(0, Math.ceil((new Date(halfStartedAt!).getTime() - Date.now()) / 1000));
                      const mins = Math.floor(remaining / 60);
                      const secs = remaining % 60;
                      return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
                    })()}
                  </span>
                ) : (
                  <>
                    <span className="text-[9px] font-display text-white/50">{half}</span>
                    <span className="font-display font-bold text-sm text-white tabular-nums">{minute}'</span>
                  </>
                )}
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {isManager && isTestMatch && myClubId === awayClub?.id && (
              <button
                onClick={() => onToggleUniform('away')}
                title={`Uniforme ${awayUniformNum}`}
                className="w-5 h-5 rounded text-[8px] font-display font-bold border border-white/20 hover:border-white/50 transition-colors flex items-center justify-center"
                style={{ backgroundColor: awayActiveUniform.shirt_color, color: awayActiveUniform.number_color }}
              >
                {awayUniformNum}
              </button>
            )}
            <ClubBadgeInline club={awayClub} right hasPossession={awayHasBall} />
          </div>
          <GoalList entries={awayGoals} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onExit} className="h-8 text-[10px] font-display">
          <LogOut className="h-3 w-3" /> {t('buttons.leave')}
        </Button>
        {isManager && isTestMatch && isLive && (
          <button
            onClick={onFinishMatch}
            className="flex items-center gap-1 text-[10px] font-display bg-destructive/20 text-destructive border border-destructive/40 px-2 py-1 rounded hover:bg-destructive/30 transition-colors"
          >
            <Square className="h-3 w-3" /> {t('finish_match')}
          </button>
        )}
        {isBenchPlayer && <Badge className="bg-warning/20 text-warning text-[10px] border border-warning/40 font-display"><User className="h-3 w-3 mr-1" />No Banco</Badge>}
      </div>
    </div>
  );
});
