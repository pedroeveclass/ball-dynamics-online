import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FormToken { result: 'W' | 'D' | 'L'; score: string }
interface H2HRow { home: string; away: string; score: string; date: string | null }
interface SideStandout { name: string; goals: number; assists: number }

interface PreviewData {
  homeName: string;
  awayName: string;
  h2h: H2HRow[];
  homeForm: FormToken[];
  awayForm: FormToken[];
  homeStandout: SideStandout | null;
  awayStandout: SideStandout | null;
}

// Pre-match preview shown on MatchRoomPage when match.status === 'scheduled'.
// Pulls last 5 head-to-head matches between the two clubs, last 5 matches
// of each club for recent form (W/D/L tokens), and the season top scorer
// from each side's player_match_stats. All client-side queries — keeps
// the engine path untouched.
export function PreMatchPreviewCard({ matchId, homeClubId, awayClubId, seasonId }: {
  matchId: string;
  homeClubId: string;
  awayClubId: string;
  seasonId?: string | null;
}) {
  const { t } = useTranslation('narratives');
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: clubs }, h2hData, homeFormData, awayFormData, homeStandoutData, awayStandoutData] = await Promise.all([
        supabase.from('clubs').select('id, name').in('id', [homeClubId, awayClubId]),
        fetchH2H(homeClubId, awayClubId, matchId),
        fetchRecentForm(homeClubId, matchId),
        fetchRecentForm(awayClubId, matchId),
        fetchClubStandout(homeClubId, seasonId),
        fetchClubStandout(awayClubId, seasonId),
      ]);
      if (cancelled) return;
      const clubName = new Map<string, string>();
      for (const c of clubs ?? []) clubName.set(c.id, c.name);
      setData({
        homeName: clubName.get(homeClubId) ?? '',
        awayName: clubName.get(awayClubId) ?? '',
        h2h: h2hData,
        homeForm: homeFormData,
        awayForm: awayFormData,
        homeStandout: homeStandoutData,
        awayStandout: awayStandoutData,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [matchId, homeClubId, awayClubId, seasonId]);

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="stat-card space-y-3">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-tactical" /> {t('preMatch.title', { defaultValue: 'Pré-jogo' })}
      </h2>

      {/* Recent form for both sides */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <FormColumn label={data.homeName} tokens={data.homeForm} />
        <FormColumn label={data.awayName} tokens={data.awayForm} />
      </div>

      {/* Standout players */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <StandoutCell label={data.homeName} player={data.homeStandout} />
        <StandoutCell label={data.awayName} player={data.awayStandout} />
      </div>

      {/* Head-to-head */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          {t('preMatch.h2h', { defaultValue: 'Últimos confrontos' })}
        </p>
        {data.h2h.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {t('preMatch.h2h_empty', { defaultValue: 'Primeiro encontro entre os clubes.' })}
          </p>
        ) : (
          <ul className="space-y-1">
            {data.h2h.slice(0, 5).map((m, i) => (
              <li key={i} className="text-xs flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                <span>{m.home} — {m.away}</span>
                <span className="font-mono font-bold">{m.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FormColumn({ label, tokens }: { label: string; tokens: FormToken[] }) {
  return (
    <div className="bg-muted/30 rounded p-2">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <div className="flex gap-1 mt-1">
        {tokens.length === 0 && <span className="text-xs text-muted-foreground italic">—</span>}
        {tokens.slice(0, 5).map((tok, i) => (
          <span
            key={i}
            title={tok.score}
            className={`h-5 w-5 rounded text-[11px] font-bold flex items-center justify-center text-white ${
              tok.result === 'W' ? 'bg-pitch' : tok.result === 'D' ? 'bg-yellow-500' : 'bg-destructive'
            }`}
          >
            {tok.result}
          </span>
        ))}
      </div>
    </div>
  );
}

function StandoutCell({ label, player }: { label: string; player: SideStandout | null }) {
  return (
    <div className="bg-muted/30 rounded p-2">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      {player ? (
        <p className="text-sm font-display font-semibold truncate">
          {player.name}
          <span className="text-xs text-muted-foreground ml-1">{player.goals}G {player.assists}A</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">—</p>
      )}
    </div>
  );
}

async function fetchH2H(homeClubId: string, awayClubId: string, exceptMatchId: string): Promise<H2HRow[]> {
  // Two queries, since OR with eq+eq across two columns is easier in two passes
  const { data: a } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score, finished_at')
    .eq('home_club_id', homeClubId)
    .eq('away_club_id', awayClubId)
    .eq('status', 'finished')
    .neq('id', exceptMatchId)
    .order('finished_at', { ascending: false })
    .limit(5);
  const { data: b } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score, finished_at')
    .eq('home_club_id', awayClubId)
    .eq('away_club_id', homeClubId)
    .eq('status', 'finished')
    .neq('id', exceptMatchId)
    .order('finished_at', { ascending: false })
    .limit(5);
  const all = [...(a ?? []), ...(b ?? [])];
  if (all.length === 0) return [];

  const clubIds = Array.from(new Set(all.flatMap((m: any) => [m.home_club_id, m.away_club_id])));
  const { data: clubs } = await supabase.from('clubs').select('id, name').in('id', clubIds);
  const name = new Map<string, string>();
  for (const c of clubs ?? []) name.set(c.id, c.name);

  return all
    .sort((m1: any, m2: any) => String(m2.finished_at ?? '').localeCompare(String(m1.finished_at ?? '')))
    .slice(0, 5)
    .map((m: any) => ({
      home: name.get(m.home_club_id) ?? '',
      away: name.get(m.away_club_id) ?? '',
      score: `${m.home_score ?? 0}-${m.away_score ?? 0}`,
      date: m.finished_at,
    }));
}

async function fetchRecentForm(clubId: string, exceptMatchId: string): Promise<FormToken[]> {
  const { data: home } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score, finished_at')
    .eq('home_club_id', clubId)
    .eq('status', 'finished')
    .neq('id', exceptMatchId)
    .order('finished_at', { ascending: false })
    .limit(5);
  const { data: away } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_score, away_score, finished_at')
    .eq('away_club_id', clubId)
    .eq('status', 'finished')
    .neq('id', exceptMatchId)
    .order('finished_at', { ascending: false })
    .limit(5);
  const all = [...(home ?? []), ...(away ?? [])]
    .sort((m1: any, m2: any) => String(m2.finished_at ?? '').localeCompare(String(m1.finished_at ?? '')))
    .slice(0, 5);
  return all.map((m: any) => {
    const isHome = m.home_club_id === clubId;
    const my = isHome ? m.home_score : m.away_score;
    const opp = isHome ? m.away_score : m.home_score;
    const result: 'W' | 'D' | 'L' = my > opp ? 'W' : my < opp ? 'L' : 'D';
    return { result, score: `${my}-${opp}` };
  });
}

async function fetchClubStandout(clubId: string, seasonId?: string | null): Promise<SideStandout | null> {
  let query = supabase
    .from('player_match_stats')
    .select('player_profile_id, goals, assists')
    .eq('club_id', clubId);
  if (seasonId) query = query.eq('season_id', seasonId);
  const { data } = await query;
  if (!data || data.length === 0) return null;

  const totals = new Map<string, { goals: number; assists: number }>();
  for (const r of data as any[]) {
    if (!r.player_profile_id) continue;
    const cur = totals.get(r.player_profile_id) ?? { goals: 0, assists: 0 };
    cur.goals += r.goals ?? 0;
    cur.assists += r.assists ?? 0;
    totals.set(r.player_profile_id, cur);
  }
  let topId: string | null = null;
  let topScore = -1;
  for (const [pid, t] of totals) {
    const score = t.goals * 2 + t.assists;
    if (score > topScore) { topScore = score; topId = pid; }
  }
  if (!topId) return null;

  const { data: profile } = await supabase
    .from('player_profiles')
    .select('full_name')
    .eq('id', topId)
    .maybeSingle();
  const t = totals.get(topId)!;
  return { name: profile?.full_name ?? '', goals: t.goals, assists: t.assists };
}
