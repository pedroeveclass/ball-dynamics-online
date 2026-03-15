import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { clubs, players } from '@/data/mock';
import { cn } from '@/lib/utils';
import type { TurnPhase } from '@/types/game';

const TURN_DURATION = 6;

const phaseLabels: Record<TurnPhase, string> = {
  ballCarrier: 'PORTADOR DA BOLA',
  possession: 'TIME COM POSSE',
  defending: 'TIME SEM POSSE',
  resolution: 'RESOLUÇÃO',
};

const phaseColors: Record<TurnPhase, string> = {
  ballCarrier: 'text-pitch',
  possession: 'text-tactical',
  defending: 'text-destructive',
  resolution: 'text-warning',
};

export default function MatchPage() {
  const [turnNumber, setTurnNumber] = useState(1);
  const [phase, setPhase] = useState<TurnPhase>('ballCarrier');
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);
  const [isRunning, setIsRunning] = useState(false);

  const homeClub = clubs[0];
  const awayClub = clubs[1];

  const advancePhase = useCallback(() => {
    const phases: TurnPhase[] = ['ballCarrier', 'possession', 'defending', 'resolution'];
    const idx = phases.indexOf(phase);
    if (idx < 3) {
      setPhase(phases[idx + 1]);
      setTimeLeft(idx + 1 === 3 ? 3 : TURN_DURATION);
    } else {
      setTurnNumber(n => n + 1);
      setPhase('ballCarrier');
      setTimeLeft(TURN_DURATION);
    }
  }, [phase]);

  useEffect(() => {
    if (!isRunning) return;
    if (timeLeft <= 0) {
      advancePhase();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, isRunning, advancePhase]);

  const timerPct = (timeLeft / TURN_DURATION) * 100;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Scoreboard */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded" style={{ backgroundColor: homeClub.primaryColor }} />
              <span className="font-display text-xl font-bold">{homeClub.shortName}</span>
            </div>
            <div className="text-center">
              <span className="font-display text-4xl font-extrabold">0 — 0</span>
              <p className="text-xs text-muted-foreground mt-1">Turno {turnNumber}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-display text-xl font-bold">{awayClub.shortName}</span>
              <div className="h-8 w-8 rounded" style={{ backgroundColor: awayClub.primaryColor }} />
            </div>
          </div>
        </div>

        {/* Timer Bar */}
        <div className="stat-card space-y-2">
          <div className="flex items-center justify-between">
            <span className={cn('font-display text-sm font-bold uppercase', phaseColors[phase])}>
              {phaseLabels[phase]}
            </span>
            <span className={cn(
              'font-display text-2xl font-extrabold tabular-nums',
              timeLeft <= 2 && isRunning && 'text-destructive animate-pulse-timer'
            )}>
              {timeLeft}s
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${timerPct}%`,
                background: `linear-gradient(90deg, hsl(var(--pitch-green)), hsl(var(--warning-amber)), hsl(var(--destructive)))`,
              }}
            />
          </div>
        </div>

        {/* Pitch */}
        <div className="stat-card p-0 overflow-hidden">
          <div className="relative bg-pitch/10 aspect-[16/10]">
            {/* Field lines */}
            <svg viewBox="0 0 1050 680" className="w-full h-full" style={{ position: 'absolute', inset: 0 }}>
              {/* Field border */}
              <rect x="25" y="25" width="1000" height="630" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="2" opacity="0.3" rx="2" />
              {/* Center line */}
              <line x1="525" y1="25" x2="525" y2="655" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />
              {/* Center circle */}
              <circle cx="525" cy="340" r="80" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />
              <circle cx="525" cy="340" r="3" fill="hsl(var(--pitch-green))" opacity="0.5" />
              {/* Penalty areas */}
              <rect x="25" y="170" width="160" height="340" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />
              <rect x="865" y="170" width="160" height="340" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />
              {/* Goal areas */}
              <rect x="25" y="250" width="55" height="180" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />
              <rect x="970" y="250" width="55" height="180" fill="none" stroke="hsl(var(--pitch-green))" strokeWidth="1.5" opacity="0.3" />

              {/* Example arrow — pass */}
              {phase === 'ballCarrier' && (
                <g>
                  <line x1="500" y1="340" x2="700" y2="280" className="arrow-pass" strokeWidth="2" strokeDasharray="6 3" />
                  <polygon points="700,280 688,278 692,290" fill="hsl(var(--tactical-blue))" />
                </g>
              )}
            </svg>

            {/* Player dots — home */}
            {[
              { x: 5, y: 50, label: 'GK', name: 'Ricci' },
              { x: 20, y: 25, label: 'CB', name: 'Luiz' },
              { x: 20, y: 75, label: 'CB', name: 'Bot' },
              { x: 18, y: 10, label: 'LB', name: 'Bot' },
              { x: 18, y: 90, label: 'RB', name: 'Bot' },
              { x: 40, y: 30, label: 'CM', name: 'Bot' },
              { x: 40, y: 50, label: 'CM', name: 'Mendes' },
              { x: 40, y: 70, label: 'CM', name: 'Bot' },
              { x: 65, y: 15, label: 'LW', name: 'Bot' },
              { x: 65, y: 85, label: 'RW', name: 'Silva' },
              { x: 70, y: 50, label: 'ST', name: 'Torres' },
            ].map((p, i) => (
              <div
                key={i}
                className="absolute flex flex-col items-center"
                style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="h-6 w-6 rounded-full bg-tactical border-2 border-card flex items-center justify-center">
                  <span className="text-[8px] font-bold text-tactical-foreground">{p.label}</span>
                </div>
                <span className="text-[9px] font-display font-semibold mt-0.5 text-foreground/80">{p.name}</span>
              </div>
            ))}

            {/* Player dots — away */}
            {[
              { x: 95, y: 50, label: 'GK' },
              { x: 80, y: 30, label: 'CB' },
              { x: 80, y: 70, label: 'CB' },
              { x: 82, y: 10, label: 'LB' },
              { x: 82, y: 90, label: 'RB' },
              { x: 60, y: 35, label: 'CM' },
              { x: 60, y: 65, label: 'CM' },
              { x: 55, y: 50, label: 'CAM' },
              { x: 35, y: 15, label: 'LW' },
              { x: 35, y: 85, label: 'RW' },
              { x: 30, y: 50, label: 'ST' },
            ].map((p, i) => (
              <div
                key={`a${i}`}
                className="absolute flex flex-col items-center"
                style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="h-6 w-6 rounded-full bg-destructive border-2 border-card flex items-center justify-center">
                  <span className="text-[8px] font-bold text-destructive-foreground">{p.label}</span>
                </div>
              </div>
            ))}

            {/* Ball */}
            <div className="absolute" style={{ left: '48%', top: '50%', transform: 'translate(-50%, -50%)' }}>
              <div className="h-4 w-4 rounded-full bg-foreground border-2 border-card shadow-lg" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="px-6 py-2 rounded-md bg-pitch text-pitch-foreground font-display font-bold text-sm hover:bg-pitch/90 transition-colors"
          >
            {isRunning ? 'PAUSAR' : 'INICIAR SIMULAÇÃO'}
          </button>
          <button
            onClick={advancePhase}
            className="px-6 py-2 rounded-md bg-secondary text-secondary-foreground font-display font-bold text-sm hover:bg-secondary/80 transition-colors"
          >
            AVANÇAR FASE
          </button>
        </div>

        {/* Match Log */}
        <div className="stat-card">
          <span className="font-display font-semibold text-sm">Log da Partida</span>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground font-mono">
            <p>[Turno 1] Bola com Carlos Mendes (CM) — Fase: {phaseLabels[phase]}</p>
            <p>[Turno 1] Mendes avalia opções de passe...</p>
            <p>[Turno 1] Seta de passe: direção 35°, distância 28m, curva 0.2, precisão esperada 78%</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
