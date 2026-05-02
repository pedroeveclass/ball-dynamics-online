import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { RatingChip } from './RatingChip';
import { PitchHeatmap } from './PitchHeatmap';
import { PlayerPassMap, PlayerShotMap, ShotMapLegend, PlayerDefensiveMap, DefensiveMapLegend, type PassDatum, type ShotDatum, type DefensiveDatum } from './PlayerActionMap';

interface MatchStatRow {
  id: string;
  match_id: string;
  participant_id: string;
  rating: number | null;
  position: string | null;
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  passes_completed: number;
  passes_attempted: number;
  tackles: number;
  interceptions: number;
  fouls_committed: number;
  yellow_cards: number;
  red_cards: number;
  gk_saves: number;
  goals_conceded: number;
  clean_sheet: boolean;
  position_samples: Array<{ x: number; y: number }> | null;
  match: {
    id: string;
    home_club_id: string;
    away_club_id: string;
    home_score: number;
    away_score: number;
    scheduled_at: string;
  };
  player_club_id: string;
}

interface ClubLite {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url: string | null;
}

interface MatchDetailPanelProps {
  row: MatchStatRow;
  opponentClub: ClubLite | null;
  playerIsHome: boolean;
  participantId: string;
}

type MapMode = 'movement' | 'passes' | 'shots' | 'defensive';

function useMatchActionEvents(matchId: string, participantId: string) {
  const [passes, setPasses] = useState<PassDatum[]>([]);
  const [shots, setShots] = useState<ShotDatum[]>([]);
  const [defensive, setDefensive] = useState<DefensiveDatum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('match_event_logs')
        .select('event_type, payload')
        .eq('match_id', matchId)
        .in('event_type', ['pass_complete', 'pass_failed', 'goal', 'shot_missed', 'shot_post', 'dispute', 'possession_change']);
      if (cancelled) return;
      const passesList: PassDatum[] = [];
      const shotsList: ShotDatum[] = [];
      const defList: DefensiveDatum[] = [];
      for (const ev of (data || [])) {
        const p = (ev.payload || {}) as Record<string, any>;
        if (ev.event_type === 'pass_complete' || ev.event_type === 'pass_failed') {
          if (p.passer_participant_id !== participantId) continue;
          if (typeof p.from_x !== 'number' || typeof p.to_x !== 'number') continue;
          passesList.push({
            from: { x: p.from_x, y: p.from_y },
            to: { x: p.to_x, y: p.to_y },
            completed: ev.event_type === 'pass_complete',
          });
        } else if (ev.event_type === 'dispute') {
          if (p.defender_participant_id !== participantId) continue;
          if (p.winner !== 'defender') continue;
          if (typeof p.defender_x !== 'number') continue;
          defList.push({ pos: { x: p.defender_x, y: p.defender_y }, kind: 'tackle' });
        } else if (ev.event_type === 'possession_change') {
          if (p.cause !== 'interception') continue;
          if (p.new_ball_holder_participant_id !== participantId) continue;
          if (typeof p.recovery_x !== 'number') continue;
          defList.push({ pos: { x: p.recovery_x, y: p.recovery_y }, kind: 'interception' });
        } else {
          // Shot family
          const shooterId = p.shooter_participant_id ?? p.scorer_participant_id;
          if (shooterId !== participantId) continue;
          if (typeof p.from_x !== 'number') continue;
          let outcome: ShotDatum['outcome'];
          if (ev.event_type === 'goal') outcome = 'goal';
          else if (ev.event_type === 'shot_post') outcome = 'post';
          else outcome = p.outcome === 'over' ? 'over' : 'wide';
          shotsList.push({ from: { x: p.from_x, y: p.from_y }, outcome });
        }
      }
      setPasses(passesList);
      setShots(shotsList);
      setDefensive(defList);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [matchId, participantId]);

  return { passes, shots, defensive, loading };
}

function MatchDetailPanel({ row, opponentClub, playerIsHome, participantId }: MatchDetailPanelProps) {
  const [mode, setMode] = useState<MapMode>('movement');
  const [passFilter, setPassFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const { passes, shots, defensive, loading: actionsLoading } = useMatchActionEvents(row.match_id, participantId);

  // attacking direction depends on the half + which side the player's club is on.
  // Heatmap aggregates the whole match, so just mirror by player's home/away affiliation.
  const attackingDirection: 'ltr' | 'rtl' = playerIsHome ? 'ltr' : 'rtl';

  // Authoritative counts come from player_match_stats (always populated).
  // The arrays below may be shorter when older events lack coords — that's
  // why the map can be empty even when the count is positive.
  const buttons: { id: MapMode; label: string; count?: number }[] = [
    { id: 'movement', label: 'Movimentação' },
    { id: 'passes', label: 'Passes', count: row.passes_attempted },
    { id: 'shots', label: 'Finalizações', count: row.shots },
    { id: 'defensive', label: 'Desarmes', count: row.tackles + row.interceptions },
  ];
  const missingCoords =
    (mode === 'passes' && row.passes_attempted > 0 && passes.length === 0) ||
    (mode === 'shots' && row.shots > 0 && shots.length === 0) ||
    (mode === 'defensive' && (row.tackles + row.interceptions) > 0 && defensive.length === 0);

  return (
    <div className="bg-muted/20 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {buttons.map(b => (
          <button
            key={b.id}
            onClick={() => setMode(b.id)}
            className={`px-3 py-1.5 text-xs font-display font-semibold rounded-md transition-colors ${
              mode === b.id ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {b.label}{b.count !== undefined ? ` (${b.count})` : ''}
          </button>
        ))}
      </div>

      {mode === 'movement' && (
        <>
          <PitchHeatmap
            samples={row.position_samples ?? []}
            attackingDirection={attackingDirection}
            className="rounded-md overflow-hidden"
          />
          <p className="text-[10px] text-muted-foreground">
            {(row.position_samples?.length ?? 0)} amostras · ataque →
          </p>
        </>
      )}

      {mode === 'passes' && (
        <>
          <div className="flex gap-2 items-center flex-wrap">
            {(['all', 'completed', 'failed'] as const).map(f => (
              <button key={f} onClick={() => setPassFilter(f)}
                className={`text-[11px] font-display px-2.5 py-1 rounded-full transition-colors ${
                  passFilter === f ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
                {f === 'all' ? 'Todos' : f === 'completed' ? 'Certos' : 'Errados'}
              </button>
            ))}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {row.passes_completed}/{row.passes_attempted}{row.passes_attempted ? ` · ${Math.round((row.passes_completed / row.passes_attempted) * 100)}%` : ''}
            </span>
          </div>
          {actionsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <PlayerPassMap passes={passes} attackingDirection={attackingDirection} filter={passFilter} className="rounded-md overflow-hidden" />
          )}
          <p className="text-[10px] text-muted-foreground">
            Verde = certo · Vermelho = errado · Ataque →
            {missingCoords && ' · Localizações de passe não foram registradas neste jogo (engine antigo).'}
          </p>
        </>
      )}

      {mode === 'shots' && (
        <>
          {actionsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <PlayerShotMap shots={shots} attackingDirection={attackingDirection} className="rounded-md overflow-hidden" />
          )}
          <ShotMapLegend />
          {missingCoords && (
            <p className="text-[10px] text-muted-foreground">Localizações de finalização não foram registradas neste jogo (engine antigo).</p>
          )}
        </>
      )}

      {mode === 'defensive' && (
        <>
          {actionsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <PlayerDefensiveMap events={defensive} attackingDirection={attackingDirection} className="rounded-md overflow-hidden" />
          )}
          <DefensiveMapLegend />
          {missingCoords && (
            <p className="text-[10px] text-muted-foreground">Localizações de desarme/interceptação não foram registradas neste jogo (engine antigo).</p>
          )}
        </>
      )}
    </div>
  );
}

export function PlayerMatchesTab({ playerProfileId }: { playerProfileId: string }) {
  const [rows, setRows] = useState<MatchStatRow[] | null>(null);
  const [clubsById, setClubsById] = useState<Map<string, ClubLite>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stats, error: statsErr } = await supabase
        .from('player_match_stats')
        .select(`
          id, match_id, participant_id, club_id, rating, position, goals, assists, shots, shots_on_target,
          passes_completed, passes_attempted, tackles, interceptions, fouls_committed,
          yellow_cards, red_cards, gk_saves, goals_conceded, clean_sheet, position_samples
        `)
        .eq('player_profile_id', playerProfileId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (statsErr) { console.error('[PlayerMatchesTab] stats error', statsErr); setRows([]); return; }

      const matchIds = (stats || []).map((s: any) => s.match_id).filter(Boolean);
      let matchesById = new Map<string, MatchStatRow['match']>();
      if (matchIds.length > 0) {
        const { data: matches } = await supabase
          .from('matches')
          .select('id, home_club_id, away_club_id, home_score, away_score, scheduled_at')
          .in('id', matchIds);
        if (cancelled) return;
        for (const m of (matches || [])) matchesById.set(m.id, m as any);
      }

      const list: MatchStatRow[] = ((stats || []) as any[]).map((s: any) => ({
        ...s,
        player_club_id: s.club_id,
        match: matchesById.get(s.match_id),
      })).filter(s => s.match);

      // Fetch club lookup for all opponents seen.
      const clubIds = new Set<string>();
      for (const r of list) {
        if (r.match) {
          clubIds.add(r.match.home_club_id);
          clubIds.add(r.match.away_club_id);
        }
      }
      if (clubIds.size > 0) {
        const { data: clubs } = await supabase
          .from('clubs')
          .select('id, name, short_name, primary_color, secondary_color, crest_url')
          .in('id', Array.from(clubIds));
        if (cancelled) return;
        const map = new Map<string, ClubLite>();
        for (const c of (clubs || [])) map.set(c.id, c as ClubLite);
        setClubsById(map);
      }
      setRows(list);
    })();
    return () => { cancelled = true; };
  }, [playerProfileId]);

  const items = useMemo(() => rows ?? [], [rows]);

  if (rows === null) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Nenhuma partida de liga registrada ainda.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map(row => {
        const playerIsHome = row.player_club_id === row.match.home_club_id;
        const opponentClubId = playerIsHome ? row.match.away_club_id : row.match.home_club_id;
        const opp = clubsById.get(opponentClubId) ?? null;
        const playerScore = playerIsHome ? row.match.home_score : row.match.away_score;
        const oppScore = playerIsHome ? row.match.away_score : row.match.home_score;
        const result = playerScore > oppScore ? 'V' : playerScore < oppScore ? 'D' : 'E';
        const resultColor = result === 'V' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : result === 'D' ? 'bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
        const isOpen = expandedId === row.id;

        return (
          <div key={row.id} className="border border-border rounded-lg overflow-hidden bg-card">
            <button
              onClick={() => setExpandedId(isOpen ? null : row.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="text-xs text-muted-foreground w-16 shrink-0 hidden sm:block">
                {new Date(row.match.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${resultColor}`}>{result}</span>
              {opp ? (
                <ClubCrest
                  crestUrl={opp.crest_url}
                  primaryColor={opp.primary_color}
                  secondaryColor={opp.secondary_color}
                  shortName={opp.short_name}
                  className="w-6 h-6 rounded text-[8px] font-bold"
                />
              ) : <div className="w-6 h-6" />}
              <span className="flex-1 truncate text-sm">{opp?.name ?? '—'}</span>
              <span className="font-display font-bold tabular-nums text-sm">
                {playerScore} – {oppScore}
              </span>
              <RatingChip rating={row.rating} />
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isOpen && (
              <div className="border-t border-border p-3">
                <MatchDetailPanel row={row} opponentClub={opp} playerIsHome={playerIsHome} participantId={row.participant_id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
