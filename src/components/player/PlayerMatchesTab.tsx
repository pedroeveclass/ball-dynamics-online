import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { RatingChip } from './RatingChip';
import { PitchHeatmap } from './PitchHeatmap';

interface MatchStatRow {
  id: string;
  match_id: string;
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

function ImpactBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  // value normalized -1..+1 (negative means under-perform)
  const v = Math.max(-1, Math.min(1, value / max));
  const pct = Math.abs(v) * 50;
  const color = v >= 0.4 ? 'bg-green-500' : v >= 0.05 ? 'bg-yellow-500' : v <= -0.05 ? 'bg-orange-500' : 'bg-muted';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted/40 rounded-full relative overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/30" />
        <div
          className={`absolute top-0 bottom-0 ${color}`}
          style={
            v >= 0
              ? { left: '50%', width: `${pct}%` }
              : { right: '50%', width: `${pct}%` }
          }
        />
      </div>
    </div>
  );
}

interface MatchDetailPanelProps {
  row: MatchStatRow;
  opponentClub: ClubLite | null;
  playerIsHome: boolean;
}

function MatchDetailPanel({ row, opponentClub, playerIsHome }: MatchDetailPanelProps) {
  // Impact bars derived from per-stat ratios.
  const passAcc = row.passes_attempted > 0 ? row.passes_completed / row.passes_attempted : null;
  const shooting = row.goals > 0 ? Math.min(1, row.goals * 0.6) : row.shots_on_target > 0 ? 0.2 : row.shots > 0 ? -0.3 : 0;
  const passing = passAcc === null ? 0 : (passAcc - 0.7) * 2.5;
  const dribbling = row.assists * 0.6 - row.fouls_committed * 0.15;
  const defending = (row.tackles + row.interceptions) * 0.2 + (row.gk_saves * 0.25) + (row.clean_sheet ? 0.4 : 0) - row.yellow_cards * 0.2 - row.red_cards * 0.6;

  // attacking direction depends on the half + which side the player's club is on.
  // Heatmap aggregates the whole match, so just mirror by player's home/away affiliation.
  const attackingDirection: 'ltr' | 'rtl' = playerIsHome ? 'ltr' : 'rtl';

  return (
    <div className="bg-muted/20 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Mapa de calor</h4>
          <PitchHeatmap
            samples={row.position_samples ?? []}
            attackingDirection={attackingDirection}
            className="rounded-md overflow-hidden"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {(row.position_samples?.length ?? 0)} amostras · ataque →
          </p>
        </div>

        <div>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Impacto por área</h4>
          <div className="space-y-2 mb-4">
            <ImpactBar label="Finalização" value={shooting} />
            <ImpactBar label="Passe" value={passing} />
            <ImpactBar label="Drible" value={dribbling} />
            <ImpactBar label="Defesa" value={defending} />
          </div>

          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Estatísticas</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Stat label="Gols" value={row.goals} />
            <Stat label="Assistências" value={row.assists} />
            <Stat label="Finalizações" value={`${row.shots_on_target}/${row.shots}`} />
            <Stat label="Passes" value={`${row.passes_completed}/${row.passes_attempted}${row.passes_attempted ? ` (${Math.round((row.passes_completed/row.passes_attempted)*100)}%)` : ''}`} />
            <Stat label="Desarmes" value={row.tackles} />
            <Stat label="Interceptações" value={row.interceptions} />
            <Stat label="Faltas" value={row.fouls_committed} />
            {row.gk_saves > 0 && <Stat label="Defesas (GK)" value={row.gk_saves} />}
            {row.clean_sheet && <Stat label="Não sofreu gol" value="✓" />}
            {row.yellow_cards > 0 && <Stat label="Amarelos" value={row.yellow_cards} />}
            {row.red_cards > 0 && <Stat label="Vermelhos" value={row.red_cards} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-right tabular-nums">{value}</span>
    </>
  );
}

export function PlayerMatchesTab({ playerProfileId }: { playerProfileId: string }) {
  const [rows, setRows] = useState<MatchStatRow[] | null>(null);
  const [clubsById, setClubsById] = useState<Map<string, ClubLite>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stats } = await supabase
        .from('player_match_stats')
        .select(`
          id, match_id, rating, position, goals, assists, shots, shots_on_target,
          passes_completed, passes_attempted, tackles, interceptions, fouls_committed,
          yellow_cards, red_cards, gk_saves, goals_conceded, clean_sheet, position_samples,
          player_club:club_id ( id ),
          match:matches!player_match_stats_match_id_fkey ( id, home_club_id, away_club_id, home_score, away_score, scheduled_at )
        `)
        .eq('player_profile_id', playerProfileId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      const list: MatchStatRow[] = ((stats || []) as any[]).map((s: any) => ({
        ...s,
        player_club_id: s.club_id || s.player_club?.id,
        match: Array.isArray(s.match) ? s.match[0] : s.match,
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
                <MatchDetailPanel row={row} opponentClub={opp} playerIsHome={playerIsHome} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
