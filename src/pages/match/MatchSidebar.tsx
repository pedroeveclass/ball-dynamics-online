import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bot, User, ChevronDown, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { positionToPT } from '@/lib/positions';
import type { ClubInfo, Participant, MatchTurn, EventLog } from './types';

// ─── TurnWheel (horizontal segmented bar) ─────────────────────
function TurnWheel({ currentPhase, timeLeft, turnNumber, possessionClub, phaseDuration, isLooseBall, isHalftime: isHalftimeProp, timerDisplayRef, timerBarRef }: {
  currentPhase: string | null; timeLeft: number; turnNumber: number;
  possessionClub: ClubInfo | null; phaseDuration: number; isLooseBall: boolean;
  isHalftime?: boolean;
  timerDisplayRef?: React.RefObject<HTMLSpanElement | null>; timerBarRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const isPositioning = currentPhase === 'positioning_attack' || currentPhase === 'positioning_defense';
  const isHalftime = isHalftimeProp ?? false;

  const phases = isPositioning
    ? [
        { key: 'positioning_attack', label: 'ATK', icon: '\u26BD' },
        { key: 'positioning_defense', label: 'DEF', icon: '\uD83D\uDEE1\uFE0F' },
      ]
    : [
        { key: 'ball_holder', label: 'Portador', icon: '\u26BD' },
        { key: 'attacking_support', label: 'Ataque', icon: '\u2694\uFE0F' },
        { key: 'defending_response', label: 'Defesa', icon: '\uD83D\uDEE1\uFE0F' },
        { key: 'resolution', label: 'Motion', icon: '\u26A1' },
      ];
  const currentIdx = phases.findIndex(p => p.key === currentPhase);
  const progress = phaseDuration > 0 ? (1 - timeLeft / phaseDuration) : 0;

  return (
    <div className="flex flex-col gap-2">
      {isHalftime && (
        <div className="bg-warning/20 border border-warning/40 rounded px-3 py-1 text-center">
          <span className="text-[10px] font-display font-bold text-warning">&#x23F8; INTERVALO</span>
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
                className={`h-7 rounded-md flex items-center justify-center gap-1 text-[9px] font-display font-bold transition-all relative overflow-hidden ${
                  isSkipped ? 'bg-muted/20 text-muted-foreground/30' :
                  isActive ? 'border border-foreground/40 text-foreground' :
                  isPast ? 'bg-pitch/25 text-pitch' :
                  'bg-[hsl(220,15%,20%)] text-foreground/50'
                }`}
                style={isActive ? { backgroundColor: 'hsl(220,15%,22%)' } : undefined}
              >
                {/* Active progress fill */}
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-md transition-all duration-100"
                    style={{
                      width: `${progress * 100}%`,
                      background: 'linear-gradient(90deg, hsl(160,84%,39%,0.3), hsl(160,84%,39%,0.15))',
                    }}
                  />
                )}
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
            <span className="text-[10px] font-display font-semibold text-white/80">
              {isLooseBall ? 'BOLA SOLTA' : possessionClub.short_name}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[9px] font-display text-white/40">T{turnNumber || '\u2014'}</span>
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
        <span className="font-display text-[11px] font-bold text-white flex-1 truncate">{title}</span>
        {badge && <span className="text-[9px] text-white/50 font-display">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

// ─── TeamList ─────────────────────────────────────────────────
function TeamList({ players, ballHolderId, myId, selectedId, onSelect, submittedIds }: {
  players: Participant[]; ballHolderId: string | null; myId: string | null;
  selectedId: string | null; onSelect: (id: string) => void; submittedIds: Set<string>;
}) {
  return (
    <div className="space-y-0.5">
      {players.map(p => (
        <button key={p.id}
          onClick={() => onSelect(p.id)}
          className={`w-full flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded transition-colors text-left ${
            selectedId === p.id ? 'bg-tactical/20 text-tactical' : myId === p.id ? 'bg-pitch/15 text-pitch' : 'hover:bg-[hsl(220,15%,18%)] text-white/80'
          }`}
        >
          {p.is_bot
            ? <Bot className="h-2.5 w-2.5 text-amber-400 shrink-0" />
            : <User className="h-2.5 w-2.5 text-pitch shrink-0" />}
          <span className="font-display w-5 shrink-0 text-white/60">{p.jersey_number || '?'}</span>
          <span className="font-display w-6 text-white/50 shrink-0">{positionToPT(p.field_pos)}</span>
          <span className="truncate flex-1">{p.player_name?.split(' ')[0] || 'Bot'}</span>
          {ballHolderId === p.id && <span className="text-[8px]">{'\u26BD'}</span>}
          {submittedIds.has(p.id) && <span className="text-[8px] text-pitch">{'\u2713'}</span>}
          {(p as any).yellow_cards >= 1 && <span className="text-[8px]">{'\uD83D\uDFE8'}</span>}
          {(p as any).is_sent_off && <span className="text-[8px]">{'\uD83D\uDFE5'}</span>}
        </button>
      ))}
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
      <span className="text-[9px] font-display font-bold text-white/40 uppercase tracking-wider">Banco</span>
      <div className="space-y-0.5 mt-0.5">
        {players.map(p => {
          const isPendingIn = pendingSubstitutions?.some(s => s.inId === p.id);
          const wasSubbedOut = substitutedOutIds?.has(p.id);
          return (
            <div key={p.id} className="relative">
              <div className={`w-full flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded ${wasSubbedOut ? 'text-white/25 line-through' : isPendingIn ? 'text-amber-400' : 'text-white/60'}`}>
                {p.is_bot
                  ? <Bot className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                  : <User className="h-2.5 w-2.5 text-pitch shrink-0" />}
                <span className="font-display w-6 text-white/40 shrink-0">{positionToPT((p.slot_position || '').replace(/^BENCH_?/i, ''))}</span>
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
  matchId: string;
  userId: string | null;
  username: string | null;
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
    matchId, userId, username,
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

  return (
    <div className="w-72 shrink-0 bg-[hsl(220,15%,13%)] border-l border-[hsl(220,10%,22%)] flex flex-col overflow-y-auto">
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
        <TeamList
          players={homePlayers}
          ballHolderId={ballHolderId}
          myId={myId}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          submittedIds={submittedIds}
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
        <TeamList
          players={awayPlayers}
          ballHolderId={ballHolderId}
          myId={myId}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          submittedIds={submittedIds}
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
            <p className="text-[10px] text-white/40 px-1">Aguardando eventos...</p>
          )}
          {events.slice(-30).map(e => (
            <div key={e.id} className={`text-[10px] border-l-2 pl-1.5 leading-tight py-0.5 ${
              e.event_type === 'goal' ? 'border-pitch text-pitch font-bold' :
              e.event_type === 'kickoff' ? 'border-tactical text-tactical/90' :
              e.event_type === 'possession_change' ? 'border-warning/60 text-warning/80' :
              e.event_type === 'final_whistle' ? 'border-destructive text-destructive font-bold' :
              e.event_type === 'tackle' ? 'border-red-400 text-red-300' :
              e.event_type === 'dribble' ? 'border-green-400 text-green-300' :
              e.event_type === 'blocked' ? 'border-orange-400 text-orange-300' :
              e.event_type === 'saved' ? 'border-blue-400 text-blue-300' :
              e.event_type === 'foul' || e.event_type === 'penalty' ? 'border-yellow-400 text-yellow-300' :
              e.event_type === 'yellow_card' ? 'border-yellow-400 text-yellow-300 font-bold' :
              e.event_type === 'red_card' ? 'border-red-500 text-red-400 font-bold' :
              e.event_type === 'offside' ? 'border-purple-400 text-purple-300' :
              e.event_type === 'one_touch' ? 'border-cyan-400 text-cyan-300' :
              'border-white/20 text-white/70'
            }`}>
              <p className="font-display font-semibold">{e.title}</p>
              {e.body && <p className="opacity-70 text-[9px]">{e.body}</p>}
            </div>
          ))}
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
            <p className="text-[9px] text-white/20 text-center py-2">Sem mensagens</p>
          )}
          {chatMessages.map(m => (
            <div key={m.id} className="text-[9px] leading-tight py-0.5">
              <span className={`font-bold ${m.user_id === userId ? 'text-pitch' : 'text-white/70'}`}>{m.username}: </span>
              <span className="text-white/60">{m.message}</span>
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
              className="flex-1 bg-[hsl(220,15%,18%)] text-white/80 text-[10px] rounded px-2 py-1 outline-none placeholder:text-white/20 focus:ring-1 focus:ring-tactical/50"
            />
            <button
              onClick={handleSendChat}
              disabled={sendingChat || !chatInput.trim()}
              className="text-[9px] font-display bg-tactical/20 text-tactical px-2 py-1 rounded hover:bg-tactical/30 disabled:opacity-30 transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </AccordionSection>
    </div>
  );
});
