import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Square, LogOut, User } from 'lucide-react';
import type { ClubInfo } from './types';
import { computeMatchMinute } from './constants';

// ─── ClubBadgeInline ──────────────────────────────────────────
function ClubBadgeInline({ club, right }: { club: ClubInfo | null; right?: boolean }) {
  if (!club) return <div className="w-7 h-7 rounded bg-muted animate-pulse" />;
  return (
    <div className={`flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-7 h-7 rounded flex items-center justify-center font-display text-[9px] font-extrabold shadow"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
      >
        {club.short_name.substring(0, 3)}
      </div>
      <span className="font-display font-bold text-[11px] text-white hidden sm:block max-w-24 truncate">{club.name}</span>
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
  isManager: boolean; isPlayer: boolean;
  onFinishMatch: () => void; onExit: () => void;
  homeUniformNum: number; awayUniformNum: number;
  homeActiveUniform: { shirt_color: string; number_color: string };
  awayActiveUniform: { shirt_color: string; number_color: string };
  onToggleUniform: (side: 'home' | 'away') => void;
  myClubId: string | null;
}

export const MatchScoreboard = React.memo(function MatchScoreboard(props: MatchScoreboardProps) {
  const {
    isLive, isFinished, isTestMatch, isLooseBall, isPhaseProcessing, isPositioningTurn,
    homeClub, awayClub, homeScore, awayScore, currentTurnNumber, activeTurnPhase,
    halfStartedAt, currentHalf,
    myRole, isBenchPlayer, isManager, isPlayer, onFinishMatch, onExit,
    homeUniformNum, awayUniformNum, homeActiveUniform, awayActiveUniform, onToggleUniform, myClubId,
  } = props;

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
        <Badge variant="outline" className={`font-display text-[10px] ${isLive ? 'border-pitch/60 text-pitch animate-pulse' : 'border-border text-muted-foreground'}`}>
          {isLive && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-pitch inline-block" />}
          {isLive ? 'AO VIVO' : isFinished ? 'ENCERRADA' : 'AGENDADA'}
        </Badge>
        {isTestMatch && <Badge variant="secondary" className="text-[9px] font-display">5v5</Badge>}
        {isLooseBall && <Badge variant="secondary" className="text-[9px] font-display text-warning border-warning/40">BOLA SOLTA</Badge>}
        {isPhaseProcessing && <Badge variant="secondary" className="text-[9px] font-display animate-pulse">PROCESSANDO</Badge>}
        {isPositioningTurn && <Badge variant="secondary" className="text-[9px] font-display text-tactical border-tactical/40">POSICIONAMENTO</Badge>}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <ClubBadgeInline club={homeClub} />
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
          <ClubBadgeInline club={awayClub} right />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onExit} className="h-8 text-[10px] font-display">
          <LogOut className="h-3 w-3" /> Sair
        </Button>
        {isManager && isTestMatch && isLive && (
          <button
            onClick={onFinishMatch}
            className="flex items-center gap-1 text-[10px] font-display bg-destructive/20 text-destructive border border-destructive/40 px-2 py-1 rounded hover:bg-destructive/30 transition-colors"
          >
            <Square className="h-3 w-3" /> Finalizar
          </button>
        )}
        {myRole === 'spectator' && !isBenchPlayer && <Badge variant="secondary" className="text-[10px] font-display"><Eye className="h-3 w-3 mr-1" />Espectador</Badge>}
        {isBenchPlayer && <Badge className="bg-warning/20 text-warning text-[10px] border border-warning/40 font-display"><User className="h-3 w-3 mr-1" />No Banco</Badge>}
        {isPlayer && <Badge className="bg-pitch/20 text-pitch text-[10px] border border-pitch/40 font-display"><User className="h-3 w-3 mr-1" />Jogador</Badge>}
        {isManager && (
          <Badge className="bg-tactical/20 text-tactical text-[10px] border border-tactical/40 font-display">
            <User className="h-3 w-3 mr-1" />Manager
          </Badge>
        )}
      </div>
    </div>
  );
});
