import { supabase } from '@/integrations/supabase/client';

/**
 * Shape returned to any UI that wants to render a club's next scheduled
 * league fixture. `match_id` stays null until the scheduler materializes
 * the row ~5 minutes before kickoff — in that window the UI should show
 * the date/opponent but disable the "enter match" link.
 */
export interface NextClubMatch {
  round_number: number;
  scheduled_at: string;
  opponent_club_id: string;
  opponent_name: string;
  opponent_short_name: string;
  opponent_primary_color: string;
  opponent_secondary_color: string;
  opponent_crest_url: string | null;
  is_home: boolean;
  match_id: string | null;
  league_match_id: string;
}

/**
 * Returns the next league fixture for `clubId`, using the pre-created
 * league_matches rows + league_rounds.scheduled_at (the `matches` row is
 * NOT created ahead of time; it's materialized 5 min before kickoff).
 * Rounds are filtered to scheduled_at >= now() server-side to avoid
 * shipping the entire calendar to the client.
 */
export async function getNextClubMatch(clubId: string): Promise<NextClubMatch | null> {
  if (!clubId) return null;

  const nowIso = new Date().toISOString();

  // Pull this club's fixtures joined with the round so we can filter by
  // scheduled_at and sort. We only need the soonest row, but Supabase's
  // joined-column filter + order isn't fully reliable across versions,
  // so we sort + slice client-side after pulling the small set.
  const { data, error } = await supabase
    .from('league_matches')
    .select(`
      id,
      match_id,
      home_club_id,
      away_club_id,
      league_rounds!inner(round_number, scheduled_at),
      home_club:clubs!league_matches_home_club_id_fkey(id, name, short_name, primary_color, secondary_color, crest_url),
      away_club:clubs!league_matches_away_club_id_fkey(id, name, short_name, primary_color, secondary_color, crest_url)
    `)
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .gte('league_rounds.scheduled_at', nowIso)
    .order('scheduled_at', { foreignTable: 'league_rounds', ascending: true })
    .limit(5);

  if (error || !data || data.length === 0) return null;

  // Defensive re-sort in case the foreign-table order didn't apply.
  const sorted = [...data].sort((a: any, b: any) => {
    const at = new Date(a.league_rounds?.scheduled_at ?? 0).getTime();
    const bt = new Date(b.league_rounds?.scheduled_at ?? 0).getTime();
    return at - bt;
  });

  const row: any = sorted[0];
  const round = row.league_rounds;
  if (!round) return null;

  const isHome = row.home_club_id === clubId;
  const opponent = isHome ? row.away_club : row.home_club;
  if (!opponent) return null;

  return {
    round_number: round.round_number,
    scheduled_at: round.scheduled_at,
    opponent_club_id: opponent.id,
    opponent_name: opponent.name,
    opponent_short_name: opponent.short_name,
    opponent_primary_color: opponent.primary_color || '#333',
    opponent_secondary_color: opponent.secondary_color || '#fff',
    opponent_crest_url: opponent.crest_url ?? null,
    is_home: isHome,
    match_id: row.match_id ?? null,
    league_match_id: row.id,
  };
}

const WEEKDAY_SHORT_PTBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Formats an ISO timestamp as e.g. "Dom 20/04 21:00 BRT" using the
 * São Paulo timezone. Kept helper-local so the UI layers don't have
 * to each reimplement the same formatter.
 */
export function formatBRTDateTime(iso: string): string {
  const date = new Date(iso);
  // Pull the individual parts in America/Sao_Paulo so the output is
  // correct regardless of the user's browser timezone.
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  // `weekday: 'short'` in pt-BR returns things like "dom." — normalize
  // to the three-letter capitalized form the design expects.
  const rawWeekday = pick('weekday').replace(/\./g, '');
  const normalized = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1).toLowerCase();
  // Safety net: if the platform returns an unexpected weekday string,
  // fall back to computing the weekday from the São Paulo-localized
  // date parts directly.
  const day = pick('day');
  const month = pick('month');
  const hour = pick('hour');
  const minute = pick('minute');

  const weekday = normalized && WEEKDAY_SHORT_PTBR.some(w => w.toLowerCase() === normalized.toLowerCase())
    ? WEEKDAY_SHORT_PTBR.find(w => w.toLowerCase() === normalized.toLowerCase())!
    : normalized || '';

  return `${weekday} ${day}/${month} ${hour}:${minute} BRT`;
}

/**
 * Returns the Mon–Sun "day-of-week index" (0=Mon … 6=Sun) for a given
 * ISO timestamp **as observed in São Paulo time**. The auto-training
 * planner stores the week using this same index, so using browser-local
 * time here would misalign matches on Sundays/Mondays for players
 * whose browser clock is in another timezone.
 */
export function isoDowInSaoPaulo(iso: string): number {
  const date = new Date(iso);
  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[weekdayStr] ?? 0;
}

/**
 * Returns the HH:MM portion of an ISO timestamp in São Paulo time
 * (24h clock), e.g. "21:00".
 */
export function formatBRTTimeOnly(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
