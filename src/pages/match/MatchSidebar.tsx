import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bot, User, ChevronDown, ChevronRight, ArrowLeftRight, Check, CheckCheck } from 'lucide-react';
import { positionToPT } from '@/lib/positions';
import { CountryFlag } from '@/components/CountryFlag';
import { renderMatchEventTitle, renderMatchEventBody } from '@/lib/matchEventLabel';
import type { ClubInfo, Participant, MatchTurn, EventLog, MatchData } from './types';
import { HALF_DURATION_MS_CLIENT, isPositioningPhase, phaseShortLabel } from './constants';
import i18n from '@/i18n';

// Resolves which participant an event should be attributed to. Returns the
// participant row when we can find one (gives us jersey + club_id), and falls
// back to a name string pulled from the payload's *_name keys.
function resolveEventParticipant(
  event: EventLog,
  participantById: Map<string, Participant>,
): { id: string | null; name: string; jersey: number | null; clubId: string | null } | null {
  const payload = event.payload as Record<string, any> | null | undefined;
  if (!payload) return null;
  const ID_KEYS = [
    'participant_id', 'scorer_participant_id', 'fouler_participant_id',
    'tackler_participant_id', 'tackled_participant_id', 'blocker_participant_id',
    'shooter_participant_id', 'passer_participant_id', 'receiver_participant_id',
    'dribbler_participant_id', 'tackled_by_participant_id',
    'player_participant_id', 'new_ball_holder_participant_id', 'gk_participant_id',
    'caught_participant_id', 'attacker_participant_id', 'defender_participant_id',
    'taker_participant_id', 'in_participant_id', 'ball_holder_participant_id',
  ];
  for (const key of ID_KEYS) {
    const id = payload[key];
    if (typeof id === 'string') {
      const p = participantById.get(id);
      if (p) {
        return {
          id,
          name: p.player_name || 'Jogador',
          jersey: p.jersey_number ?? null,
          clubId: p.club_id,
        };
      }
    }
  }
  // Fall back to payload *_name fields (useful when the participant has since
  // left the field and isn't in our in-memory map anymore).
  const NAME_KEYS = [
    'scorer_name', 'assister_name', 'player_name', 'fouler_name',
    'tackler_name', 'blocker_name', 'shooter_name', 'passer_name',
    'dribbler_name', 'receiver_name', 'caught_name', 'attacker_name',
    'defender_name', 'taker_name', 'in_player_name', 'new_ball_holder_name',
    'tackled_name', 'ball_holder_name',
  ];
  for (const key of NAME_KEYS) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) {
      const clubIdRaw = payload.scorer_club_id || payload.fouler_club_id || payload.club_id || null;
      return { id: null, name: val, jersey: null, clubId: typeof clubIdRaw === 'string' ? clubIdRaw : null };
    }
  }
  return null;
}

// Approximate match minute at which an event happened (relies on the current
// half timing — fine for in-progress live events, less accurate for events
// from an earlier half that we loaded after-the-fact).
function eventMinute(event: EventLog, match: MatchData | null): number | null {
  if (!match?.half_started_at) return null;
  const halfStart = new Date(match.half_started_at).getTime();
  const eventTs = new Date(event.created_at).getTime();
  const elapsed = eventTs - halfStart;
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const halfMinutes = Math.min(45, Math.floor((elapsed / HALF_DURATION_MS_CLIENT) * 45));
  const half = match.current_half || 1;
  return half === 1 ? halfMinutes : 45 + halfMinutes;
}

// ─── TurnWheel (horizontal segmented bar) ─────────────────────
function TurnWheel({ currentPhase, timeLeft, turnNumber, possessionClub, phaseDuration, isLooseBall, isHalftime: isHalftimeProp, timerDisplayRef, timerBarRef }: {
  currentPhase: string | null; timeLeft: number; turnNumber: number;
  possessionClub: ClubInfo | null; phaseDuration: number; isLooseBall: boolean;
  isHalftime?: boolean;
  timerDisplayRef?: React.RefObject<HTMLSpanElement | null>; timerBarRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const isPositioning = isPositioningPhase(currentPhase);
  const isMergedPositioning = currentPhase === 'positioning';
  const isMergedOpenPlay = currentPhase === 'open_play';
  const isHalftime = isHalftimeProp ?? false;

  const phases = isPositioning
    ? (isMergedPositioning
        ? [{ key: 'positioning', label: phaseShortLabel('positioning'), icon: '\uD83D\uDEE1\uFE0F' }]
        : [
            { key: 'positioning_attack', label: phaseShortLabel('positioning_attack'), icon: '\u26BD' },
            { key: 'positioning_defense', label: phaseShortLabel('positioning_defense'), icon: '\uD83D\uDEE1\uFE0F' },
          ])
    : (isMergedOpenPlay
        ? [
            { key: 'ball_holder', label: phaseShortLabel('ball_holder'), icon: '\u26BD' },
            { key: 'open_play', label: phaseShortLabel('open_play'), icon: '\u2694\uFE0F' },
            { key: 'resolution', label: phaseShortLabel('resolution'), icon: '\u26A1' },
          ]
        : [
            { key: 'ball_holder', label: phaseShortLabel('ball_holder'), icon: '\u26BD' },
            { key: 'attacking_support', label: phaseShortLabel('attacking_support'), icon: '\u2694\uFE0F' },
            { key: 'defending_response', label: phaseShortLabel('defending_response'), icon: '\uD83D\uDEE1\uFE0F' },
            { key: 'resolution', label: phaseShortLabel('resolution'), icon: '\u26A1' },
          ]);
  const currentIdx = phases.findIndex(p => p.key === currentPhase);
  const progress = phaseDuration > 0 ? (1 - timeLeft / phaseDuration) : 0;

  return (
    <div className="flex flex-col gap-2">
      {isHalftime && (
        <div className="bg-warning/20 border border-warning/40 rounded px-3 py-1 text-center">
          <span className="text-xs font-display font-bold text-warning">{i18n.t('match_room:status.halftime')}</span>
        </div>
      )}

      {/* Phase segments */}
      <div className="flex gap-1">
        {phases.map((phase, i) => {
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          const isSkipped = isLooseBall && phase.key === 'ball_holder' && !isPositioning;

          return (
            <div key={phase.key} className="flex-1 relative">
              <div
                className={`h-8 rounded-md flex items-center justify-center gap-1 text-[11px] font-display font-bold transition-all relative overflow-hidden ${
                  isSkipped ? 'bg-muted/20 text-muted-foreground/40' :
                  isActive ? 'bg-warning/60 border border-warning text-white' :
                  isPast ? 'bg-pitch/25 text-pitch' :
                  'bg-[hsl(220,15%,20%)] text-white'
                }`}
              >
                <span className="relative z-10">
                  {isSkipped ? '\u2014' : isPast ? '\u2713' : phase.icon}
                </span>
                <span className="relative z-10 hidden sm:inline">
                  {isSkipped ? '' : phase.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timer + Turn info */}
      <div className="flex items-center justify-between px-1">
        {possessionClub && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: possessionClub.primary_color }} />
            <span className="text-xs font-display font-semibold text-white/80">
              {isLooseBall ? i18n.t('match_room:status.loose_ball') : possessionClub.short_name}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] font-display text-white/60">T{turnNumber || '\u2014'}</span>
          {currentPhase && timeLeft > 0 && (
            <span ref={timerDisplayRef} className={`font-display font-bold text-sm tabular-nums ${timeLeft <= 2 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
              {timeLeft}s
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {currentPhase && (
        <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
          <div
            ref={timerBarRef}
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${(timeLeft / phaseDuration) * 100}%`,
              background: timeLeft <= 2
                ? 'hsl(var(--destructive))'
                : 'linear-gradient(90deg, hsl(var(--pitch-green)), hsl(var(--warning-amber)))',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── AccordionSection ─────────────────────────────────────────
function AccordionSection({ title, badge, color, open, onToggle, children, className }: {
  title: string; badge?: string; color?: string;
  open: boolean; onToggle: () => void;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`border-b border-[hsl(220,10%,22%)] ${className || ''}`}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[hsl(220,15%,18%)] transition-colors text-left"
      >
        {color && <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />}
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
        <span className="font-display text-sm font-bold text-white flex-1 truncate">{title}</span>
        {badge && <span className="text-[11px] text-white/60 font-display">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

// ─── TeamList ─────────────────────────────────────────────────
function TeamList({ players, ballHolderId, myId, selectedId, onSelect, submittedIds, isHalftime, canMarkReady, onToggleReady }: {
  players: Participant[]; ballHolderId: string | null; myId: string | null;
  selectedId: string | null; onSelect: (id: string) => void; submittedIds: Set<string>;
  isHalftime?: boolean;
  canMarkReady?: (p: Participant) => boolean;
  onToggleReady?: (participantId: string, nextReady: boolean) => void;
}) {
  return (
    <div className="space-y-0.5">
      {players.map(p => {
        const canReady = !!(isHalftime && canMarkReady?.(p) && onToggleReady);
        const isReady = !!p.is_ready;
        return (
          <div key={p.id} className="flex items-center gap-1">
            <button
              onClick={() => onSelect(p.id)}
              className={`flex-1 flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors text-left ${
                selectedId === p.id ? 'bg-tactical/20 text-tactical' : myId === p.id ? 'bg-pitch/15 text-pitch' : 'hover:bg-[hsl(220,15%,18%)] text-white/80'
              }`}
            >
              {p.is_bot
                ? <Bot className="h-3 w-3 text-amber-400 shrink-0" />
                : <User className="h-3 w-3 text-pitch shrink-0" />}
              <span className="font-display w-5 shrink-0 text-white/60">{p.jersey_number || '?'}</span>
              <span className="font-display w-7 text-white/50 shrink-0">{positionToPT(p.field_pos)}</span>
              {p.country_code && <CountryFlag code={p.country_code} size="xs" />}
              <span className="truncate flex-1">{p.player_name?.split(' ')[0] || 'Bot'}</span>
              {ballHolderId === p.id && <span className="text-[10px]">{'\u26BD'}</span>}
              {submittedIds.has(p.id) && <span className="text-[10px] text-pitch">{'\u2713'}</span>}
              {(p as any).yellow_cards >= 1 && <span className="text-[10px]">{'\uD83D\uDFE8'}</span>}
              {(p as any).is_sent_off && <span className="text-[10px]">{'\uD83D\uDFE5'}</span>}
            </button>
            {isHalftime && (
              canReady ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleReady!(p.id, !isReady); }}
                  title={isReady ? 'Pronto' : 'Marcar como pronto'}
                  className={`shrink-0 h-6 w-6 flex items-center justify-center rounded transition-colors ${
                    isReady ? 'bg-pitch/80 text-white' : 'bg-[hsl(220,15%,20%)] text-white/50 hover:bg-pitch/30 hover:text-pitch'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </button>
              ) : (
                <span
                  title={isReady ? 'Pronto' : 'Aguardando'}
                  className={`shrink-0 h-6 w-6 flex items-center justify-center rounded ${
                    isReady ? 'bg-pitch/50 text-white' : 'bg-[hsl(220,15%,20%)] text-white/25'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── BenchList ──────────────────────────────────────────────
function BenchList({ players, isManagerTeam, starters, onSubstitute, pendingSubstitutions, substitutedOutIds }: {
  players: Participant[]; isManagerTeam: boolean;
  starters: Participant[]; onSubstitute?: (outId: string, inId: string) => void;
  pendingSubstitutions?: Array<{ outId: string; inId: string }>;
  substitutedOutIds?: Set<string>;
}) {
  const [swapTarget, setSwapTarget] = useState<string | null>(null);

  if (players.length === 0) return null;

  return (
    <div className="mt-1.5 pt-1.5 border-t border-[hsl(220,10%,22%)]">
      <span className="text-[11px] font-display font-bold text-white/60 uppercase tracking-wider">Banco</span>
      <div className="space-y-0.5 mt-0.5">
        {players.map(p => {
          const isPendingIn = pendingSubstitutions?.some(s => s.inId === p.id);
          const wasSubbedOut = substitutedOutIds?.has(p.id);
          return (
            <div key={p.id} className="relative">
              <div className={`w-full flex items-center gap-1.5 text-xs px-2 py-1 rounded ${wasSubbedOut ? 'text-white/25 line-through' : isPendingIn ? 'text-amber-400' : 'text-white/70'}`}>
                {p.is_bot
                  ? <Bot className="h-3 w-3 text-amber-400 shrink-0" />
                  : <User className="h-3 w-3 text-pitch shrink-0" />}
                <span className="font-display w-7 text-white/50 shrink-0">{positionToPT((p.field_pos || p.slot_position || '').replace(/^BENCH_?/i, '')) || 'RES'}</span>
                {p.country_code && <CountryFlag code={p.country_code} size="xs" />}
                <span className="truncate flex-1">{p.player_name?.split(' ')[0] || 'Bot'}</span>
                {isPendingIn && (
                  <span className="text-[7px] font-display text-amber-400 bg-amber-400/10 px-1 rounded">Aguardando...</span>
                )}
                {wasSubbedOut && (
                  <span className="text-[7px] font-display text-white/30 bg-white/5 px-1 rounded">Saiu</span>
                )}
                {isManagerTeam && onSubstitute && !isPendingIn && !wasSubbedOut && (
                  <button
                    onClick={() => setSwapTarget(swapTarget === p.id ? null : p.id)}
                    className="text-[8px] font-display bg-warning/20 text-warning px-1.5 py-0.5 rounded hover:bg-warning/30 transition-colors flex items-center gap-0.5"
                    title="Substituir"
                  >
                    <ArrowLeftRight className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
              {/* Swap dropdown - pick which starter to replace */}
              {swapTarget === p.id && isManagerTeam && onSubstitute && (
                <div className="absolute right-0 top-full z-50 bg-[hsl(220,15%,16%)] border border-[hsl(220,10%,28%)] rounded shadow-lg p-1.5 min-w-[140px] max-h-[200px] overflow-y-auto">
                  <span className="text-[8px] font-display text-white/40 block mb-1">Sai quem?</span>
                  {starters.filter(s => !pendingSubstitutions?.some(ps => ps.outId === s.id)).map(s => (
                    <button key={s.id}
                      onClick={() => { onSubstitute(s.id, p.id); setSwapTarget(null); }}
                      className="w-full flex items-center gap-1 text-[9px] px-1.5 py-1 rounded hover:bg-warning/20 text-white/70 hover:text-white transition-colors text-left"
                    >
                      <span className="font-display w-5 shrink-0 text-white/50">{s.jersey_number || '?'}</span>
                      <span className="font-display w-6 text-white/40 shrink-0">{positionToPT(s.field_pos)}</span>
                      {s.country_code && <CountryFlag code={s.country_code} size="xs" />}
                      <span className="truncate flex-1">{s.player_name?.split(' ')[0] || 'Bot'}</span>
                    </button>
                  ))}
                  <button onClick={() => setSwapTarget(null)}
                    className="w-full text-[8px] text-white/30 mt-1 hover:text-white/50 transition-colors"
                  >Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MatchSidebar (extracted, memoized) ─────────────────────
export interface MatchSidebarProps {
  activeTurn: MatchTurn | null;
  phaseTimeLeft: number;
  currentTurnNumber: number;
  possessionClub: ClubInfo | null;
  currentPhaseDuration: number;
  isLooseBall: boolean;
  isHalftime: boolean;
  timerDisplayRef: React.RefObject<HTMLSpanElement | null>;
  timerBarRef: React.RefObject<HTMLDivElement | null>;
  homeClub: ClubInfo | null;
  awayClub: ClubInfo | null;
  homePlayers: Participant[];
  awayPlayers: Participant[];
  ballHolderId: string | null;
  myId: string | null;
  selectedId: string | null;
  onSelectPlayer: (id: string) => void;
  submittedIds: Set<string>;
  homeBench: Participant[];
  awayBench: Participant[];
  isManager: boolean;
  myClubId: string | null;
  onSubstitute: (outId: string, inId: string) => void;
  pendingSubstitutions?: Array<{ outId: string; inId: string }>;
  substitutedOutIds?: Set<string>;
  homeAccOpen: boolean; awayAccOpen: boolean; logAccOpen: boolean; chatAccOpen: boolean;
  onToggleHome: () => void; onToggleAway: () => void; onToggleLog: () => void; onToggleChat: () => void;
  events: EventLog[];
  eventsEndRef: React.RefObject<HTMLDivElement | null>;
  match: MatchData | null;
  matchId: string;
  userId: string | null;
  username: string | null;
  onToggleReady?: (participantId: string, nextReady: boolean) => void;
  onMarkTeamReady?: (clubId: string) => void;
  canMarkReady?: (p: Participant) => boolean;
}

export const MatchSidebar = React.memo(function MatchSidebar(props: MatchSidebarProps) {
  const {
    activeTurn, phaseTimeLeft, currentTurnNumber, possessionClub, currentPhaseDuration,
    isLooseBall, isHalftime, timerDisplayRef, timerBarRef,
    homeClub, awayClub, homePlayers, awayPlayers,
    ballHolderId, myId, selectedId, onSelectPlayer, submittedIds,
    homeBench, awayBench, isManager, myClubId, onSubstitute,
    pendingSubstitutions, substitutedOutIds,
    homeAccOpen, awayAccOpen, logAccOpen, chatAccOpen,
    onToggleHome, onToggleAway, onToggleLog, onToggleChat,
    events, eventsEndRef,
    match, matchId, userId, username,
    onToggleReady, onMarkTeamReady, canMarkReady,
  } = props;

  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; user_id: string; username: string; message: string; created_at: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load initial messages + subscribe to realtime
  useEffect(() => {
    if (!matchId) return;
    (supabase.from('match_chat_messages') as any).select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(100)
      .then(({ data, error }: any) => {
        if (error) console.error('[CHAT] Load error:', error);
        if (data) { console.log('[CHAT] Loaded', data.length, 'messages'); setChatMessages(data); }
      });

    const channel = supabase.channel(`chat-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_chat_messages', filter: `match_id=eq.${matchId}` },
        (payload: any) => { setChatMessages(prev => [...prev.slice(-99), payload.new as any]); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !userId || !username || sendingChat) return;
    setSendingChat(true);
    await (supabase.from('match_chat_messages') as any).insert({ match_id: matchId, user_id: userId, username, message: chatInput.trim() });
    setChatInput('');
    setSendingChat(false);
  };

  const [collapsed, setCollapsed] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  return (
    <>
      {/* Floating toggle (always visible) — slides the sidebar in/out. */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="fixed right-2 top-2 z-50 bg-[hsl(220,20%,12%)]/90 border border-[hsl(220,10%,30%)] rounded-md px-2 py-1.5 text-[11px] font-display font-bold text-[hsl(45,30%,80%)] shadow-lg hover:bg-[hsl(220,20%,18%)] md:right-3"
        aria-label={collapsed ? 'Abrir menu' : 'Recolher menu'}
      >
        {collapsed ? '☰' : '✕'}
      </button>
    <div className={`${collapsed ? 'w-0 overflow-hidden border-l-0' : 'w-72'} shrink-0 bg-[hsl(220,15%,13%)] border-l border-[hsl(220,10%,22%)] flex flex-col overflow-y-auto transition-[width] duration-200`}>
      {/* Turn Wheel */}
      <div className="p-3 border-b border-[hsl(220,10%,22%)]">
        <TurnWheel
          currentPhase={activeTurn?.phase ?? null}
          timeLeft={phaseTimeLeft}
          turnNumber={currentTurnNumber}
          possessionClub={possessionClub}
          phaseDuration={currentPhaseDuration}
          isLooseBall={isLooseBall}
          isHalftime={isHalftime}
          timerDisplayRef={timerDisplayRef}
          timerBarRef={timerBarRef}
        />
      </div>

      <AccordionSection
        title={homeClub?.name || 'Time Casa'}
        badge={`${homePlayers.filter(p => !p.id.startsWith('virtual')).length}${homeBench.length > 0 ? ` + ${homeBench.length}` : ''}`}
        color={homeClub?.primary_color}
        open={homeAccOpen}
        onToggle={onToggleHome}
      >
        {isHalftime && isManager && myClubId === homeClub?.id && onMarkTeamReady && (
          <button
            onClick={() => onMarkTeamReady(homeClub!.id)}
            className="w-full mb-2 flex items-center justify-center gap-1.5 text-xs font-display font-bold bg-pitch/20 hover:bg-pitch/30 text-pitch px-2 py-1 rounded transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todos prontos
          </button>
        )}
        <TeamList
          players={homePlayers}
          ballHolderId={ballHolderId}
          myId={myId}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          submittedIds={submittedIds}
          isHalftime={isHalftime}
          canMarkReady={canMarkReady}
          onToggleReady={onToggleReady}
        />
        <BenchList
          players={homeBench}
          isManagerTeam={isManager && myClubId === homeClub?.id}
          starters={homePlayers}
          onSubstitute={onSubstitute}
          pendingSubstitutions={pendingSubstitutions}
          substitutedOutIds={substitutedOutIds}
        />
      </AccordionSection>

      <AccordionSection
        title={awayClub?.name || 'Time Fora'}
        badge={`${awayPlayers.filter(p => !p.id.startsWith('virtual')).length}${awayBench.length > 0 ? ` + ${awayBench.length}` : ''}`}
        color={awayClub?.primary_color}
        open={awayAccOpen}
        onToggle={onToggleAway}
      >
        {isHalftime && isManager && myClubId === awayClub?.id && onMarkTeamReady && (
          <button
            onClick={() => onMarkTeamReady(awayClub!.id)}
            className="w-full mb-2 flex items-center justify-center gap-1.5 text-xs font-display font-bold bg-pitch/20 hover:bg-pitch/30 text-pitch px-2 py-1 rounded transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todos prontos
          </button>
        )}
        <TeamList
          players={awayPlayers}
          ballHolderId={ballHolderId}
          myId={myId}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          submittedIds={submittedIds}
          isHalftime={isHalftime}
          canMarkReady={canMarkReady}
          onToggleReady={onToggleReady}
        />
        <BenchList
          players={awayBench}
          isManagerTeam={isManager && myClubId === awayClub?.id}
          starters={awayPlayers}
          onSubstitute={onSubstitute}
          pendingSubstitutions={pendingSubstitutions}
          substitutedOutIds={substitutedOutIds}
        />
      </AccordionSection>

      <AccordionSection
        title="Match Flow"
        open={logAccOpen}
        onToggle={onToggleLog}
        className="flex-1"
      >
        <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1 rounded-md p-2">
          {events.length === 0 && (
            <p className="text-xs text-white/50 px-1">Aguardando eventos...</p>
          )}
          {(() => {
            const participantById = new Map<string, Participant>();
            for (const p of homePlayers) participantById.set(p.id, p);
            for (const p of awayPlayers) participantById.set(p.id, p);
            for (const p of homeBench) participantById.set(p.id, p);
            for (const p of awayBench) participantById.set(p.id, p);
            const clubById = new Map<string, ClubInfo>();
            if (homeClub) clubById.set(homeClub.id, homeClub);
            if (awayClub) clubById.set(awayClub.id, awayClub);

            // Suppress receive_failed only when the SAME player succeeded in the
            // SAME turn resolution (same created_at batch). Matching across the whole
            // match was too broad: a player who failed at T25 and later became the
            // ball holder at T27 via an unrelated event had their T25 failure hidden,
            // making the Match Flow look like "pass → nobody tried → loose ball"
            // when in reality multiple teammates attempted the domination and missed.
            const succeededByBatch = new Map<string, Set<string>>();
            for (const e of events) {
              let pid: string | undefined;
              if (e.event_type === 'receive_success') {
                pid = (e.payload as any)?.participant_id;
              } else if (e.event_type === 'pass_complete' || e.event_type === 'possession_change') {
                pid = (e.payload as any)?.new_ball_holder_participant_id
                  ?? (e.payload as any)?.receiver_participant_id;
              }
              if (!pid || !e.created_at) continue;
              const bucket = succeededByBatch.get(e.created_at) ?? new Set<string>();
              bucket.add(pid);
              succeededByBatch.set(e.created_at, bucket);
            }
            const filteredEvents = events.filter(e => {
              if (e.event_type !== 'receive_failed') return true;
              const pid = (e.payload as any)?.participant_id;
              if (!pid || !e.created_at) return true;
              return !succeededByBatch.get(e.created_at)?.has(pid);
            });

            return filteredEvents.slice(-30).map(e => {
              const minute = eventMinute(e, match);
              const subject = resolveEventParticipant(e, participantById);
              const subjectClub = subject?.clubId ? clubById.get(subject.clubId) : null;
              const turnNum = (e.payload as any)?.turn_number;
              const prefixParts: string[] = [];
              if (minute != null) prefixParts.push(`${minute}\u2032`);
              else if (typeof turnNum === 'number') prefixParts.push(`T${turnNum}`);
              const prefix = prefixParts.length > 0 ? `${prefixParts.join(' ')} \u2022 ` : '';
              // Subtle background wash in the subject's club color so the
              // team "owning" the action is immediately recognizable.
              const clubTint = subjectClub
                ? { backgroundColor: `${subjectClub.primary_color}1f` }
                : undefined;
              return (
                <div
                  key={e.id}
                  style={clubTint}
                  className={`text-xs border-l-2 pl-2 pr-1 leading-snug py-0.5 rounded-r ${
                  e.event_type === 'goal' ? 'border-pitch text-pitch font-bold' :
                  e.event_type === 'kickoff' ? 'border-tactical text-tactical/90' :
                  e.event_type === 'possession_change' ? 'border-warning/60 text-warning/80' :
                  e.event_type === 'final_whistle' ? 'border-destructive text-destructive font-bold' :
                  e.event_type === 'tackle' ? 'border-red-400 text-red-300' :
                  e.event_type === 'dribble' ? 'border-green-400 text-green-300' :
                  e.event_type === 'blocked' || e.event_type === 'block' ? 'border-orange-400 text-orange-300' :
                  e.event_type === 'block_failed' ? 'border-orange-500/50 text-orange-300/80' :
                  e.event_type === 'saved' ? 'border-blue-400 text-blue-300' :
                  e.event_type === 'foul' || e.event_type === 'penalty' ? 'border-yellow-400 text-yellow-300' :
                  e.event_type === 'yellow_card' ? 'border-yellow-400 text-yellow-300 font-bold' :
                  e.event_type === 'red_card' ? 'border-red-500 text-red-400 font-bold' :
                  e.event_type === 'offside' ? 'border-purple-400 text-purple-300' :
                  e.event_type === 'one_touch' ? 'border-cyan-400 text-cyan-300' :
                  e.event_type === 'substitution' ? 'border-sky-400 text-sky-300 font-semibold' :
                  e.event_type === 'dispute' ? 'border-violet-400 text-violet-300' :
                  e.event_type === 'shot_over' || e.event_type === 'shot_missed' ? 'border-slate-400 text-slate-300' :
                  e.event_type === 'penalty_kick' ? 'border-red-400 text-red-300 font-bold' :
                  e.event_type === 'pass_complete' ? 'border-green-400/60 text-green-300/80' :
                  e.event_type === 'bh_dribble' ? 'border-emerald-400/70 text-emerald-300' :
                  e.event_type === 'bh_pass' ? 'border-cyan-400/70 text-cyan-300' :
                  e.event_type === 'bh_shot' ? 'border-amber-400/70 text-amber-300 font-semibold' :
                  'border-white/20 text-white/70'
                }`}>
                  <p className="font-display font-semibold">
                    {prefix && <span className="opacity-70 font-normal">{prefix}</span>}
                    {renderMatchEventTitle(e)}
                  </p>
                  {subject && (
                    <p className="opacity-95 text-[11px] font-semibold flex items-center gap-1 flex-wrap">
                      {subjectClub && (
                        <span
                          className="inline-flex items-center rounded px-1 text-[9px] font-display font-extrabold leading-none py-0.5"
                          style={{ backgroundColor: subjectClub.primary_color, color: subjectClub.secondary_color }}
                        >
                          {subjectClub.short_name}
                        </span>
                      )}
                      {subject.jersey != null && (
                        <span className="opacity-90">#{subject.jersey}</span>
                      )}
                      <span>{subject.name}</span>
                    </p>
                  )}
                  {(() => {
                    const localizedBody = renderMatchEventBody(e);
                    return localizedBody ? <p className="opacity-80 text-[11px]">{localizedBody}</p> : null;
                  })()}
                </div>
              );
            });
          })()}
          <div ref={eventsEndRef} />
        </div>
      </AccordionSection>

      {/* ── Chat ── */}
      <AccordionSection
        title="Chat"
        badge={chatMessages.length > 0 ? `${chatMessages.length}` : undefined}
        open={chatAccOpen}
        onToggle={onToggleChat}
      >
        <div className="space-y-0.5 max-h-[200px] overflow-y-auto pr-1">
          {chatMessages.length === 0 && (
            <p className="text-xs text-white/30 text-center py-2">Sem mensagens</p>
          )}
          {chatMessages.map(m => (
            <div key={m.id} className="text-xs leading-snug py-0.5">
              <span className={`font-bold ${m.user_id === userId ? 'text-pitch' : 'text-white/80'}`}>{m.username}: </span>
              <span className="text-white/70">{m.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        {userId && (
          <div className="flex gap-1 mt-1.5">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
              placeholder="Mensagem..."
              maxLength={120}
              className="flex-1 bg-[hsl(220,15%,18%)] text-white/90 text-xs rounded px-2 py-1 outline-none placeholder:text-white/30 focus:ring-1 focus:ring-tactical/50"
            />
            <button
              onClick={handleSendChat}
              disabled={sendingChat || !chatInput.trim()}
              className="text-xs font-display bg-tactical/20 text-tactical px-2 py-1 rounded hover:bg-tactical/30 disabled:opacity-30 transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </AccordionSection>
    </div>
    </>
  );
});
