import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { RatingChip } from './RatingChip';
import { PitchHeatmap } from './PitchHeatmap';

interface SeasonRow {
  id: string;
  match_id: string;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  passes_completed: number;
  passes_attempted: number;
  tackles: number;
  interceptions: number;
  gk_saves: number;
  clean_sheet: boolean;
  position_samples: Array<{ x: number; y: number }> | null;
  club_id: string;
  match: {
    id: string;
    home_club_id: string;
    away_club_id: string;
    home_score: number;
    away_score: number;
    scheduled_at: string;
  };
}

interface ClubLite {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url: string | null;
}

export function PlayerSeasonOverview({ playerProfileId }: { playerProfileId: string }) {
  const [rows, setRows] = useState<SeasonRow[] | null>(null);
  const [clubsById, setClubsById] = useState<Map<string, ClubLite>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stats, error: statsErr } = await supabase
        .from('player_match_stats')
        .select(`
          id, match_id, rating, goals, assists, shots, shots_on_target,
          passes_completed, passes_attempted, tackles, interceptions, gk_saves,
          clean_sheet, position_samples, club_id
        `)
        .eq('player_profile_id', playerProfileId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (statsErr) { console.error('[PlayerSeasonOverview] stats error', statsErr); setRows([]); return; }

      const matchIds = (stats || []).map((s: any) => s.match_id).filter(Boolean);
      let matchesById = new Map<string, SeasonRow['match']>();
      if (matchIds.length > 0) {
        const { data: matches } = await supabase
          .from('matches')
          .select('id, home_club_id, away_club_id, home_score, away_score, scheduled_at')
          .in('id', matchIds);
        if (cancelled) return;
        for (const m of (matches || [])) matchesById.set(m.id, m as any);
      }

      const list: SeasonRow[] = ((stats || []) as any[]).map(s => ({
        ...s,
        match: matchesById.get(s.match_id),
      })).filter(s => s.match);
      const clubIds = new Set<string>();
      for (const r of list) {
        clubIds.add(r.match.home_club_id);
        clubIds.add(r.match.away_club_id);
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

  const aggregate = useMemo(() => {
    if (!rows) return null;
    const samples: Array<{ x: number; y: number }> = [];
    let goals = 0, assists = 0, shots = 0, shotsOnTarget = 0;
    let passesCompleted = 0, passesAttempted = 0;
    let tackles = 0, interceptions = 0, gkSaves = 0, cleanSheets = 0;
    let ratedSum = 0, ratedCount = 0;
    for (const r of rows) {
      if (Array.isArray(r.position_samples)) {
        // Mirror x for away appearances so the aggregate reads ltr.
        const isHome = r.club_id === r.match.home_club_id;
        for (const s of r.position_samples) {
          samples.push({ x: isHome ? s.x : 100 - s.x, y: s.y });
        }
      }
      goals += r.goals;
      assists += r.assists;
      shots += r.shots;
      shotsOnTarget += r.shots_on_target;
      passesCompleted += r.passes_completed;
      passesAttempted += r.passes_attempted;
      tackles += r.tackles;
      interceptions += r.interceptions;
      gkSaves += r.gk_saves;
      if (r.clean_sheet) cleanSheets += 1;
      if (r.rating !== null && r.rating !== undefined) {
        ratedSum += Number(r.rating);
        ratedCount += 1;
      }
    }
    return {
      samples,
      goals, assists, shots, shotsOnTarget,
      passesCompleted, passesAttempted,
      tackles, interceptions, gkSaves, cleanSheets,
      avgRating: ratedCount > 0 ? Math.round((ratedSum / ratedCount) * 10) / 10 : null,
      gp: rows.length,
    };
  }, [rows]);

  const recent = useMemo(() => (rows ?? []).slice(0, 10).reverse(), [rows]);

  if (rows === null) {
    return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Sem partidas de liga registradas.</p>;
  }
  if (!aggregate) return null;

  return (
    <div className="space-y-4">
      {/* Last-N rating strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Últimas partidas</h3>
          {aggregate.avgRating !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Média</span>
              <RatingChip rating={aggregate.avgRating} size="sm" />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 overflow-x-auto pb-1">
          {recent.map(r => {
            const isHome = r.club_id === r.match.home_club_id;
            const oppId = isHome ? r.match.away_club_id : r.match.home_club_id;
            const opp = clubsById.get(oppId);
            return (
              <div key={r.id} className="flex flex-col items-center gap-1 shrink-0 w-12">
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {new Date(r.match.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
                {opp ? (
                  <ClubCrest
                    crestUrl={opp.crest_url}
                    primaryColor={opp.primary_color}
                    secondaryColor={opp.secondary_color}
                    shortName={opp.short_name}
                    className="w-6 h-6 rounded text-[8px] font-bold"
                  />
                ) : <div className="w-6 h-6 bg-muted rounded" />}
                <RatingChip rating={r.rating} size="sm" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Season heatmap */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Mapa de calor da temporada</h3>
        <PitchHeatmap samples={aggregate.samples} attackingDirection="ltr" className="rounded-md overflow-hidden" />
        <p className="text-[10px] text-muted-foreground mt-1">
          {aggregate.samples.length} amostras em {aggregate.gp} partidas · ataque →
        </p>
      </div>

      {/* Season totals grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Partidas" value={aggregate.gp} />
        <Stat label="Gols" value={aggregate.goals} />
        <Stat label="Assistências" value={aggregate.assists} />
        <Stat label="Chutes" value={`${aggregate.shotsOnTarget}/${aggregate.shots}`} />
        <Stat label="Passes" value={
          aggregate.passesAttempted
            ? `${aggregate.passesCompleted}/${aggregate.passesAttempted} (${Math.round((aggregate.passesCompleted / aggregate.passesAttempted) * 100)}%)`
            : '0'
        } />
        <Stat label="Desarmes" value={aggregate.tackles} />
        <Stat label="Interceptações" value={aggregate.interceptions} />
        {aggregate.gkSaves > 0 && <Stat label="Defesas" value={aggregate.gkSaves} />}
        {aggregate.cleanSheets > 0 && <Stat label="Sem sofrer" value={aggregate.cleanSheets} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/30 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg tabular-nums">{value}</div>
    </div>
  );
}
