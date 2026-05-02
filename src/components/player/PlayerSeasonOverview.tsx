import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, Shield, Goal, TrendingUp, Crosshair, Footprints, ShieldAlert, Zap, Activity,
} from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { RatingChip } from './RatingChip';
import { PitchHeatmap } from './PitchHeatmap';
import {
  PlayerPassMap, PlayerShotMap, ShotMapLegend,
  PlayerDefensiveMap, DefensiveMapLegend,
  PlayerDribbleMap, PlayerRunMap,
  syntheticPasses, syntheticShots, syntheticDefensive, syntheticDribbles,
  type PassDatum, type ShotDatum, type DefensiveDatum, type DribbleDatum,
} from './PlayerActionMap';
import { totalXg, totalXa, isLongPass, isKeyPass, totalDistanceKm } from './statsHelpers';

interface SeasonRow {
  id: string;
  match_id: string;
  participant_id: string;
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

type MapMode = 'movement' | 'passes' | 'shots' | 'defensive' | 'dribble' | 'running';
type PassFilter = 'all' | 'completed' | 'failed' | 'key' | 'long';

export function PlayerSeasonOverview({ playerProfileId }: { playerProfileId: string }) {
  const { t } = useTranslation('public_player');
  const [rows, setRows] = useState<SeasonRow[] | null>(null);
  const [clubsById, setClubsById] = useState<Map<string, ClubLite>>(new Map());
  const [mode, setMode] = useState<MapMode>('movement');
  const [passFilter, setPassFilter] = useState<PassFilter>('all');

  // Aggregated event-derived data (loaded lazily on first non-movement click).
  const [aggPasses, setAggPasses] = useState<PassDatum[] | null>(null);
  const [aggShots, setAggShots] = useState<ShotDatum[] | null>(null);
  const [aggDefensive, setAggDefensive] = useState<DefensiveDatum[] | null>(null);
  const [aggDribbles, setAggDribbles] = useState<DribbleDatum[] | null>(null);
  const [aggDribbleCount, setAggDribbleCount] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stats, error: statsErr } = await supabase
        .from('player_match_stats')
        .select(`
          id, match_id, participant_id, rating, goals, assists, shots, shots_on_target,
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

  // Lazy-load events the first time a non-movement mode is picked.
  useEffect(() => {
    if (mode === 'movement' || aggPasses !== null || !rows || rows.length === 0) return;
    let cancelled = false;
    setEventsLoading(true);
    (async () => {
      const matchIds = rows.map(r => r.match_id);
      const participantsByMatch = new Map<string, { participantId: string; isHome: boolean }>();
      for (const r of rows) {
        participantsByMatch.set(r.match_id, {
          participantId: r.participant_id,
          isHome: r.club_id === r.match.home_club_id,
        });
      }

      const { data } = await supabase
        .from('match_event_logs')
        .select('match_id, event_type, payload')
        .in('match_id', matchIds)
        .in('event_type', ['pass_complete', 'pass_failed', 'goal', 'shot_missed', 'shot_post', 'dispute', 'possession_change', 'bh_dribble']);
      if (cancelled) return;

      const passesList: PassDatum[] = [];
      const shotsList: ShotDatum[] = [];
      const defList: DefensiveDatum[] = [];
      const dribbleList: DribbleDatum[] = [];
      let dribbleTotal = 0;

      const mirrorIfAway = (x: number, isHome: boolean) => isHome ? x : 100 - x;

      for (const ev of (data || [])) {
        const meta = participantsByMatch.get((ev as any).match_id);
        if (!meta) continue;
        const p = (ev.payload || {}) as Record<string, any>;
        const { participantId, isHome } = meta;

        if (ev.event_type === 'pass_complete' || ev.event_type === 'pass_failed') {
          if (p.passer_participant_id !== participantId) continue;
          if (typeof p.from_x !== 'number' || typeof p.to_x !== 'number') continue;
          passesList.push({
            from: { x: mirrorIfAway(p.from_x, isHome), y: p.from_y },
            to: { x: mirrorIfAway(p.to_x, isHome), y: p.to_y },
            completed: ev.event_type === 'pass_complete',
          });
        } else if (ev.event_type === 'dispute') {
          if (p.defender_participant_id !== participantId) continue;
          if (p.winner !== 'defender') continue;
          if (typeof p.defender_x !== 'number') continue;
          defList.push({
            pos: { x: mirrorIfAway(p.defender_x, isHome), y: p.defender_y },
            kind: 'tackle',
          });
        } else if (ev.event_type === 'possession_change') {
          if (p.cause !== 'interception') continue;
          if (p.new_ball_holder_participant_id !== participantId) continue;
          if (typeof p.recovery_x !== 'number') continue;
          defList.push({
            pos: { x: mirrorIfAway(p.recovery_x, isHome), y: p.recovery_y },
            kind: 'interception',
          });
        } else if (ev.event_type === 'bh_dribble') {
          if (p.ball_holder_participant_id !== participantId) continue;
          dribbleTotal += 1;
          if (typeof p.from_x !== 'number') continue;
          dribbleList.push({ pos: { x: mirrorIfAway(p.from_x, isHome), y: p.from_y } });
        } else {
          // Shot family
          const shooterId = p.shooter_participant_id ?? p.scorer_participant_id;
          if (shooterId !== participantId) continue;
          if (typeof p.from_x !== 'number') continue;
          let outcome: ShotDatum['outcome'];
          if (ev.event_type === 'goal') outcome = 'goal';
          else if (ev.event_type === 'shot_post') outcome = 'post';
          else outcome = p.outcome === 'over' ? 'over' : 'wide';
          shotsList.push({ from: { x: mirrorIfAway(p.from_x, isHome), y: p.from_y }, outcome });
        }
      }

      setAggPasses(passesList);
      setAggShots(shotsList);
      setAggDefensive(defList);
      setAggDribbles(dribbleList);
      setAggDribbleCount(dribbleTotal);
      setEventsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, rows, aggPasses]);

  const aggregate = useMemo(() => {
    if (!rows) return null;
    const samples: Array<{ x: number; y: number }> = [];
    let goals = 0, assists = 0, shots = 0, shotsOnTarget = 0;
    let passesCompleted = 0, passesAttempted = 0;
    let tackles = 0, interceptions = 0, gkSaves = 0, cleanSheets = 0;
    let ratedSum = 0, ratedCount = 0;
    let distanceKm = 0;
    for (const r of rows) {
      const isHome = r.club_id === r.match.home_club_id;
      if (Array.isArray(r.position_samples)) {
        const mirrored = r.position_samples.map(s => ({ x: isHome ? s.x : 100 - s.x, y: s.y }));
        samples.push(...mirrored);
        distanceKm += totalDistanceKm(r.position_samples);
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
      distanceKm,
    };
  }, [rows]);

  const recent = useMemo(() => (rows ?? []).slice(0, 10).reverse(), [rows]);

  if (rows === null) {
    return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">{t('stats.season.no_matches')}</p>;
  }
  if (!aggregate) return null;

  const buttons: { id: MapMode; label: string; count?: number | string }[] = [
    { id: 'movement', label: t('stats.tabs.movement') },
    { id: 'passes', label: t('stats.tabs.passes'), count: aggregate.passesAttempted },
    { id: 'shots', label: t('stats.tabs.shots'), count: aggregate.shots },
    { id: 'defensive', label: t('stats.tabs.defensive'), count: aggregate.tackles + aggregate.interceptions },
    { id: 'dribble', label: t('stats.tabs.dribble'), count: aggDribbleCount },
    { id: 'running', label: t('stats.tabs.running'), count: aggregate.distanceKm > 0 ? `${aggregate.distanceKm.toFixed(1)}km` : undefined },
  ];

  // For each mode: real coords come from aggPasses/aggShots/aggDefensive
  // (lazy-loaded), and any gap to the authoritative stats count is filled
  // with synthetic dots placed in canonical zones with lateral spread.
  const realPassCount = aggPasses?.length ?? 0;
  const realShotCount = aggShots?.length ?? 0;
  const realDefensiveCount = aggDefensive?.length ?? 0;

  const missingPasses = Math.max(0, aggregate.passesAttempted - realPassCount);
  const missingPassesCompleted = Math.max(0, aggregate.passesCompleted - (aggPasses?.filter(p => p.completed).length ?? 0));
  const missingPassesFailed = Math.max(0, missingPasses - missingPassesCompleted);

  const missingShots = Math.max(0, aggregate.shots - realShotCount);
  const missingGoals = Math.max(0, aggregate.goals - (aggShots?.filter(s => s.outcome === 'goal').length ?? 0));
  const missingShotOthers = Math.max(0, missingShots - missingGoals);

  const missingDefensive = Math.max(0, (aggregate.tackles + aggregate.interceptions) - realDefensiveCount);
  const missingTackles = Math.max(0, aggregate.tackles - (aggDefensive?.filter(d => d.kind === 'tackle').length ?? 0));
  const missingInterceptions = Math.max(0, missingDefensive - missingTackles);

  const passesToRender: PassDatum[] = [
    ...(aggPasses ?? []),
    ...(missingPasses > 0 ? syntheticPasses(missingPassesCompleted, missingPassesFailed) : []),
  ];
  const shotsToRender: ShotDatum[] = [
    ...(aggShots ?? []),
    ...(missingShots > 0 ? syntheticShots(missingGoals, missingShotOthers) : []),
  ];
  const defensiveToRender: DefensiveDatum[] = [
    ...(aggDefensive ?? []),
    ...(missingDefensive > 0 ? syntheticDefensive(missingTackles, missingInterceptions) : []),
  ];
  const realDribbleCount = aggDribbles?.length ?? 0;
  const missingDribbles = Math.max(0, aggDribbleCount - realDribbleCount);
  const dribblesToRender: DribbleDatum[] = [
    ...(aggDribbles ?? []),
    ...(missingDribbles > 0 ? syntheticDribbles(missingDribbles) : []),
  ];

  const hasSynthetic = {
    passes: missingPasses > 0,
    shots: missingShots > 0,
    defensive: missingDefensive > 0,
    dribble: missingDribbles > 0,
  };

  const filteredPasses = passesToRender.filter(p => {
    if (passFilter === 'all') return true;
    if (passFilter === 'completed') return p.completed;
    if (passFilter === 'failed') return !p.completed;
    if (passFilter === 'key') return isKeyPass(p);
    if (passFilter === 'long') return isLongPass(p);
    return true;
  });

  const seasonXg = totalXg(aggShots ?? []);
  const seasonXa = totalXa(aggPasses ?? []);

  return (
    <div className="space-y-4">
      {/* Last-N rating strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{t('stats.season.recent_matches')}</h3>
          {aggregate.avgRating !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('stats.season.average')}</span>
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

      {/* Toggle buttons + field map */}
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {buttons.map(b => (
            <button
              key={b.id}
              onClick={() => setMode(b.id)}
              className={`px-3 py-1.5 text-xs font-display font-semibold rounded-md transition-colors ${
                mode === b.id ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {b.label}{b.count !== undefined && b.count !== '' ? ` (${b.count})` : ''}
            </button>
          ))}
        </div>

        {mode === 'movement' && (
          <>
            <PitchHeatmap samples={aggregate.samples} attackingDirection="ltr" className="rounded-md overflow-hidden" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('stats.match.samples_season_summary', { count: aggregate.samples.length, matches: aggregate.gp })}
            </p>
          </>
        )}

        {mode === 'passes' && (
          <>
            <div className="flex gap-2 items-center flex-wrap mb-2">
              {(['all', 'completed', 'failed', 'key', 'long'] as const).map(f => (
                <button key={f} onClick={() => setPassFilter(f)}
                  className={`text-[11px] font-display px-2.5 py-1 rounded-full transition-colors ${
                    passFilter === f ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}>
                  {t(`stats.pass_filters.${f}`)}
                </button>
              ))}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {aggregate.passesCompleted}/{aggregate.passesAttempted}{aggregate.passesAttempted ? ` · ${Math.round((aggregate.passesCompleted / aggregate.passesAttempted) * 100)}%` : ''}
              </span>
            </div>
            {eventsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <PlayerPassMap passes={filteredPasses} attackingDirection="ltr" filter="all" className="rounded-md overflow-hidden" />
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('stats.match.pass_legend')}
              {hasSynthetic.passes && ` · ${t('stats.match.synthetic_note_season')}`}
            </p>
          </>
        )}

        {mode === 'shots' && (
          <>
            {eventsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <PlayerShotMap shots={shotsToRender} attackingDirection="ltr" className="rounded-md overflow-hidden" />
            )}
            <ShotMapLegend />
            {hasSynthetic.shots && (
              <p className="text-[10px] text-muted-foreground mt-1">{t('stats.match.synthetic_note_season')}</p>
            )}
          </>
        )}

        {mode === 'defensive' && (
          <>
            {eventsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <PlayerDefensiveMap events={defensiveToRender} attackingDirection="ltr" className="rounded-md overflow-hidden" />
            )}
            <DefensiveMapLegend />
            {hasSynthetic.defensive && (
              <p className="text-[10px] text-muted-foreground mt-1">{t('stats.match.synthetic_note_season')}</p>
            )}
          </>
        )}

        {mode === 'dribble' && (
          <>
            {eventsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <PlayerDribbleMap dribbles={dribblesToRender} attackingDirection="ltr" className="rounded-md overflow-hidden" />
            )}
            {hasSynthetic.dribble && (
              <p className="text-[10px] text-muted-foreground mt-1">{t('stats.match.synthetic_note_season')}</p>
            )}
          </>
        )}

        {mode === 'running' && (
          <>
            <PlayerRunMap samples={aggregate.samples} attackingDirection="ltr" className="rounded-md overflow-hidden" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('stats.match.running_summary', { distance: aggregate.distanceKm.toFixed(2) })}
            </p>
          </>
        )}
      </div>

      {/* Season totals — same StatCell style as CareerStatsBlock so the
          two surfaces match visually. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label={t('stats.season.tile_matches')} value={aggregate.gp}
          icon={<Shield className="h-4 w-4" />} />
        <StatCell label={t('stats.season.tile_goals')} value={aggregate.goals}
          icon={<Goal className="h-4 w-4" />} color="text-pitch" />
        <StatCell label={t('stats.season.tile_xg')} value={seasonXg.toFixed(2)}
          icon={<Goal className="h-4 w-4" />} color="text-amber-400" />
        <StatCell label={t('stats.season.tile_assists')} value={aggregate.assists}
          icon={<TrendingUp className="h-4 w-4" />} color="text-blue-400" />
        <StatCell label={t('stats.season.tile_xa')} value={seasonXa.toFixed(2)}
          icon={<TrendingUp className="h-4 w-4" />} color="text-cyan-400" />
        <StatCell label={t('stats.season.tile_shots_on_target')} value={`${aggregate.shotsOnTarget}/${aggregate.shots}`}
          icon={<Crosshair className="h-4 w-4" />} />
        <StatCell label={t('stats.season.tile_pass_accuracy')} value={
          aggregate.passesAttempted
            ? `${Math.round((aggregate.passesCompleted / aggregate.passesAttempted) * 100)}%`
            : '—'
        } icon={<TrendingUp className="h-4 w-4" />} />
        <StatCell label={t('stats.season.tile_tackles')} value={aggregate.tackles}
          icon={<Footprints className="h-4 w-4" />} />
        <StatCell label={t('stats.season.tile_interceptions')} value={aggregate.interceptions}
          icon={<ShieldAlert className="h-4 w-4" />} />
        {aggDribbleCount > 0 && (
          <StatCell label={t('stats.season.tile_dribbles')} value={aggDribbleCount}
            icon={<Zap className="h-4 w-4" />} />
        )}
        {aggregate.distanceKm > 0 && (
          <StatCell label={t('stats.season.tile_distance')} value={aggregate.distanceKm.toFixed(1)}
            icon={<Activity className="h-4 w-4" />} />
        )}
        {aggregate.gkSaves > 0 && (
          <StatCell label={t('stats.season.tile_saves')} value={aggregate.gkSaves}
            icon={<Shield className="h-4 w-4" />} />
        )}
        {aggregate.cleanSheets > 0 && (
          <StatCell label={t('stats.season.tile_clean_sheets')} value={aggregate.cleanSheets}
            icon={<Shield className="h-4 w-4" />} color="text-pitch" />
        )}
      </div>
    </div>
  );
}

// Mirrors CareerStatsBlock's StatCell so both surfaces share the same look.
function StatCell({ label, value, icon, color }: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-center space-y-1">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${color || ''}`}>{value}</p>
    </div>
  );
}
