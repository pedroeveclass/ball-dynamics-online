import { useEffect, useState } from 'react';
import { resolveCharAvatar, type ResolvedCharAvatar } from '@/lib/charAvatar';
import { PlayerAvatar } from '@/components/PlayerAvatar';

export interface TeamOfSeasonSlot {
  position: string;
  playerName: string;
  playerProfileId?: string;
  clubName: string;
  clubId?: string;
  rating: number;
  matches: number;
}

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';

function groupOf(pos: string): Group {
  const p = (pos ?? '').toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB'].includes(p)) return 'DEF';
  if (['CDM', 'DM', 'CM', 'CAM', 'LM', 'RM'].includes(p)) return 'MID';
  return 'ATT';
}

// Y positions per row (top→bottom, %). Forwards near the top, GK at bottom.
const ROW_Y: Record<Group, number> = { ATT: 18, MID: 42, DEF: 66, GK: 88 };

function spreadX(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [50];
  // Even spacing with 12% padding on each side
  const left = 12, right = 88;
  const step = (right - left) / (count - 1);
  return Array.from({ length: count }, (_, i) => left + i * step);
}

export function TeamOfSeasonPitch({ slots }: { slots: TeamOfSeasonSlot[] }) {
  const grouped: Record<Group, TeamOfSeasonSlot[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const s of slots) grouped[groupOf(s.position)].push(s);

  const placed: Array<{ slot: TeamOfSeasonSlot; x: number; y: number }> = [];
  (['ATT', 'MID', 'DEF', 'GK'] as Group[]).forEach((g) => {
    const xs = spreadX(grouped[g].length);
    grouped[g].forEach((s, i) => placed.push({ slot: s, x: xs[i], y: ROW_Y[g] }));
  });

  return (
    <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
      {/* Pitch background */}
      <div
        className="absolute inset-0 rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1e6b3a 0%, #2a8a4a 50%, #1e6b3a 100%)',
        }}
      >
        {/* Field markings — center line + center circle + penalty boxes */}
        <svg viewBox="0 0 100 133" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-60">
          {/* outer line */}
          <rect x="2" y="2" width="96" height="129" fill="none" stroke="white" strokeWidth="0.4" />
          {/* halfway line */}
          <line x1="2" y1="66.5" x2="98" y2="66.5" stroke="white" strokeWidth="0.3" />
          {/* center circle */}
          <circle cx="50" cy="66.5" r="10" fill="none" stroke="white" strokeWidth="0.3" />
          <circle cx="50" cy="66.5" r="0.8" fill="white" />
          {/* top penalty box */}
          <rect x="22" y="2" width="56" height="18" fill="none" stroke="white" strokeWidth="0.3" />
          <rect x="36" y="2" width="28" height="7" fill="none" stroke="white" strokeWidth="0.3" />
          {/* bottom penalty box */}
          <rect x="22" y="113" width="56" height="18" fill="none" stroke="white" strokeWidth="0.3" />
          <rect x="36" y="124" width="28" height="7" fill="none" stroke="white" strokeWidth="0.3" />
        </svg>
      </div>

      {/* Players */}
      {placed.map(({ slot, x, y }, i) => (
        <PitchAvatar key={`${slot.playerProfileId ?? slot.playerName}-${i}`} slot={slot} x={x} y={y} />
      ))}
    </div>
  );
}

function PitchAvatar({ slot, x, y }: { slot: TeamOfSeasonSlot; x: number; y: number }) {
  const [resolved, setResolved] = useState<ResolvedCharAvatar | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slot.playerProfileId) return;
    resolveCharAvatar(`player:${slot.playerProfileId}`).then((r) => {
      if (!cancelled) setResolved(r);
    });
    return () => { cancelled = true; };
  }, [slot.playerProfileId]);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
      style={{ left: `${x}%`, top: `${y}%`, width: '22%' }}
    >
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/90 ring-2 ring-white/70 shadow-lg overflow-hidden">
        {resolved ? (
          <PlayerAvatar
            appearance={resolved.appearance}
            variant="face"
            clubPrimaryColor={resolved.clubPrimaryColor}
            clubSecondaryColor={resolved.clubSecondaryColor}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-muted/40" />
        )}
        <span className="absolute -bottom-1 -right-1 text-[9px] font-mono font-bold bg-black/80 text-white px-1 rounded">
          {slot.position}
        </span>
      </div>
      <p className="mt-1 text-[10px] sm:text-xs font-display font-bold text-white text-center leading-tight drop-shadow truncate w-full">
        {slot.playerName}
      </p>
      <p className="text-[9px] text-white/80 text-center leading-tight truncate w-full">{slot.clubName}</p>
      <span className="text-[10px] font-mono font-bold text-amber-300 drop-shadow">
        {slot.rating?.toFixed?.(1) ?? slot.rating}
      </span>
    </div>
  );
}
