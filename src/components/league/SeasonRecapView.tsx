import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Medal, Award, Calendar, BarChart3, Newspaper, Loader2, Sparkles, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { SeasonAwardsCard } from '@/components/league/SeasonAwardsCard';
import { TeamOfSeasonPitch } from '@/components/league/TeamOfSeasonPitch';

interface SeasonRecapRow {
  body_pt: string;
  body_en: string;
  facts_json: any;
  season: number | null;
}

export function SeasonRecapView({ seasonId, seasonNumber }: { seasonId: string; seasonNumber: number | null }) {
  const { t } = useTranslation('narratives');
  const { current: lang } = useAppLanguage();
  const [recap, setRecap] = useState<SeasonRecapRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('narratives')
        .select('body_pt, body_en, facts_json, season')
        .eq('entity_type', 'league_season')
        .eq('entity_id', seasonId)
        .eq('scope', 'season_recap')
        .maybeSingle();
      if (cancelled) return;
      setRecap(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!recap) {
    return (
      <div className="stat-card text-center py-10">
        <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">{t('seasonRecap.section.missing')}</p>
      </div>
    );
  }

  const body = lang === 'en' ? recap.body_en : recap.body_pt;
  const f = (recap.facts_json ?? {}) as any;
  const num = recap.season ?? seasonNumber ?? f.seasonNumber ?? 1;

  return (
    <div className="space-y-4">
      {/* ── Title + 4-paragraph chronicle ── */}
      <div className="stat-card space-y-3">
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-tactical" />
          {t('seasonRecap.section.title', { n: num })}
        </h2>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{body}</p>
      </div>

      {/* ── Podium: Champion / Runner-up / Third / Next season ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PodiumCard
          icon={<Trophy className="h-5 w-5 text-amber-500" />}
          label={t('seasonRecap.section.champion')}
          name={f.championClubName}
          subtitle={`${f.championPoints ?? 0} pts`}
          color="border-amber-500/40 bg-amber-500/5"
        />
        <PodiumCard
          icon={<Medal className="h-5 w-5 text-slate-300" />}
          label={t('seasonRecap.section.runner_up')}
          name={f.runnerUpClubName}
          subtitle={`${f.runnerUpPoints ?? 0} pts`}
          color="border-slate-400/40 bg-slate-400/5"
        />
        <PodiumCard
          icon={<Medal className="h-5 w-5 text-orange-400" />}
          label={t('seasonRecap.section.third')}
          name={f.thirdClubName}
          subtitle={`${f.thirdPoints ?? 0} pts`}
          color="border-orange-400/40 bg-orange-400/5"
        />
        <PodiumCard
          icon={<Calendar className="h-5 w-5 text-tactical" />}
          label={t('seasonRecap.section.next_season')}
          name={`Liga ${(num as number) + 1}`}
          subtitle="14d"
          color="border-tactical/40 bg-tactical/5"
        />
      </div>

      {/* ── Per-club lens (data only — narrative templates v2 deferred) ── */}
      <PerClubLens facts={f} seasonId={seasonId} />

      {/* ── Existing SeasonAwardsCard (auto-awards + MVP poll) ── */}
      <SeasonAwardsCard seasonId={seasonId} seasonNumber={num as number} />

      {/* ── Top 5 Moments ── */}
      {Array.isArray(f.topMoments) && f.topMoments.length > 0 && (
        <div className="stat-card space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-tactical" /> {t('seasonRecap.section.top_moments')}
          </h3>
          <ol className="space-y-2 list-decimal list-inside">
            {f.topMoments.slice(0, 5).map((m: any, i: number) => (
              <li key={i} className="text-sm">
                <span className="text-xs text-muted-foreground mr-1">{t('seasonRecap.section.round_label', { n: m.roundNumber })}:</span>
                <span className="font-display font-semibold">{m.homeName} {m.homeGoals}-{m.awayGoals} {m.awayName}</span>
                <span className="text-xs text-muted-foreground ml-2">[{m.type}]</span>
                <Link to={`/match/${m.matchId}/replay`} className="text-xs text-pitch hover:underline ml-2">
                  {t('seasonRecap.section.match_chronicle_open')}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Team of the Season ── */}
      {Array.isArray(f.teamOfTheSeason) && f.teamOfTheSeason.length > 0 && (
        <div className="stat-card space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Award className="h-4 w-4 text-tactical" /> {t('seasonRecap.section.team_of_season')}
          </h3>
          <div className="max-w-md mx-auto">
            <TeamOfSeasonPitch slots={f.teamOfTheSeason} />
          </div>
        </div>
      )}

      {/* ── Curiosities ── */}
      <div className="stat-card space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-tactical" /> {t('seasonRecap.section.curiosities')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {f.biggestWin && (
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{t('seasonRecap.section.biggest_win')}</p>
              <p className="font-display font-semibold">
                {f.biggestWin.home} {f.biggestWin.homeGoals}-{f.biggestWin.awayGoals} {f.biggestWin.away}
                {f.biggestWin.round ? ` (R${f.biggestWin.round})` : ''}
              </p>
            </div>
          )}
          {f.highestScoringMatch && (
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{t('seasonRecap.section.highest_scoring')}</p>
              <p className="font-display font-semibold">
                {f.highestScoringMatch.home} {f.highestScoringMatch.homeGoals}-{f.highestScoringMatch.awayGoals} {f.highestScoringMatch.away}
                {f.highestScoringMatch.round ? ` (R${f.highestScoringMatch.round})` : ''}
              </p>
            </div>
          )}
          {f.bestAttackClub && (
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{t('seasonRecap.section.best_attack')}</p>
              <p className="font-display font-semibold">{f.bestAttackClub.name} ({f.bestAttackClub.goals} gols)</p>
            </div>
          )}
          {f.bestDefenseClub && (
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{t('seasonRecap.section.best_defense')}</p>
              <p className="font-display font-semibold">{f.bestDefenseClub.name} ({f.bestDefenseClub.conceded} sofridos)</p>
            </div>
          )}
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-xs text-muted-foreground">{t('seasonRecap.section.total_yellow')}</p>
            <p className="font-display font-semibold">🟨 {f.totalYellowCards ?? 0}</p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5">
            <p className="text-xs text-muted-foreground">{t('seasonRecap.section.total_red')}</p>
            <p className="font-display font-semibold">🟥 {f.totalRedCards ?? 0}</p>
          </div>
        </div>
      </div>

      {/* ── Hall of Fame link ── */}
      <div className="text-center">
        <Link to="/league/hall-of-fame" className="text-sm font-display font-semibold text-tactical hover:underline">
          {t('seasonRecap.section.view_hall_of_fame')} →
        </Link>
      </div>
    </div>
  );
}

// ── Per-club lens ──
// Lets the viewer reread the season "from the perspective of" a specific
// club: their final standing, record, top moments involving them, top
// rated players from their squad. Pure data view in v1 — templated
// narrative paragraphs ('A campanha do {club}') deferred to v2.
function PerClubLens({ facts, seasonId }: { facts: any; seasonId: string }) {
  const { t } = useTranslation('narratives');
  const standings = (facts?.standings ?? []) as { clubId: string; name: string; points: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number }[];
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [topPlayers, setTopPlayers] = useState<{ name: string; rating: number; matches: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const clubInStandings = useMemo(() => standings.find(s => s.clubId === selectedClubId) ?? null, [standings, selectedClubId]);

  useEffect(() => {
    if (!selectedClubId) { setTopPlayers([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('player_match_stats')
        .select('player_profile_id, rating')
        .eq('season_id', seasonId)
        .eq('club_id', selectedClubId);
      if (cancelled) return;
      const byPlayer = new Map<string, { sum: number; count: number }>();
      for (const r of (data ?? []) as any[]) {
        if (!r.player_profile_id || r.rating == null) continue;
        const cur = byPlayer.get(r.player_profile_id) ?? { sum: 0, count: 0 };
        cur.sum += Number(r.rating);
        cur.count += 1;
        byPlayer.set(r.player_profile_id, cur);
      }
      const candidates = Array.from(byPlayer.entries())
        .filter(([, v]) => v.count >= 3)
        .map(([id, v]) => ({ id, avg: v.sum / v.count, matches: v.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);
      if (candidates.length === 0) { setTopPlayers([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from('player_profiles')
        .select('id, full_name')
        .in('id', candidates.map(c => c.id));
      if (cancelled) return;
      const nameById = new Map<string, string>();
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
      setTopPlayers(candidates.map(c => ({ name: nameById.get(c.id) ?? '', rating: Number(c.avg.toFixed(2)), matches: c.matches })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedClubId, seasonId]);

  if (standings.length === 0) return null;

  return (
    <div className="stat-card space-y-3">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Eye className="h-4 w-4 text-tactical" /> {t('seasonRecap.section.per_club_lens', { defaultValue: 'Pelo lado do clube' })}
      </h3>
      <select
        value={selectedClubId}
        onChange={(e) => setSelectedClubId(e.target.value)}
        className="w-full sm:w-1/2 bg-muted/30 rounded px-2 py-1.5 text-sm border border-border"
      >
        <option value="">{t('seasonRecap.section.per_club_select', { defaultValue: 'Selecionar clube...' })}</option>
        {standings.map(s => (
          <option key={s.clubId} value={s.clubId}>{s.name}</option>
        ))}
      </select>

      {selectedClubId && clubInStandings && (
        <div className="space-y-2">
          {/* Final position + record */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[11px] text-muted-foreground">{t('seasonRecap.section.position', { defaultValue: 'Posição final' })}</p>
              <p className="font-display font-bold text-xl">{(standings.findIndex(s => s.clubId === selectedClubId) + 1) || '?'}º</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[11px] text-muted-foreground">{t('seasonRecap.section.points', { defaultValue: 'Pontos' })}</p>
              <p className="font-display font-bold text-xl">{clubInStandings.points}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[11px] text-muted-foreground">V / E / D</p>
              <p className="font-display font-bold text-sm">{clubInStandings.won}/{clubInStandings.drawn}/{clubInStandings.lost}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-[11px] text-muted-foreground">{t('seasonRecap.section.goal_balance', { defaultValue: 'Saldo' })}</p>
              <p className="font-display font-bold text-sm">{clubInStandings.goalsFor}-{clubInStandings.goalsAgainst}</p>
            </div>
          </div>

          {/* Top rated players from this club */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('seasonRecap.section.top_rated_players', { defaultValue: 'Top jogadores por nota média' })}</p>
            {loading ? (
              <div className="flex items-center justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : topPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">—</p>
            ) : (
              <ol className="space-y-1">
                {topPlayers.map((p, i) => (
                  <li key={i} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-sm">
                    <span className="font-display font-semibold truncate">{i + 1}. {p.name}</span>
                    <span className="font-mono text-pitch">{p.rating.toFixed(1)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PodiumCard({ icon, label, name, subtitle, color }: { icon: React.ReactNode; label: string; name: string | null; subtitle: string; color: string }) {
  return (
    <div className={`stat-card border ${color} text-center`}>
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-display font-bold text-sm truncate mt-0.5">{name ?? '—'}</p>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}
