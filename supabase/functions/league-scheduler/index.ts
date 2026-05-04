import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndPersistSeasonRecap } from '../match-engine-lab/season_recap_templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authorize cron/admin access — accepts CRON_SECRET header or service_role JWT.
  // Decode the bearer and accept any role=service_role so a rotated service
  // key doesn't silently break the cron hardcoded JWT.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
  const hasCronSecret = cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  let hasServiceRole = !!(serviceRoleKey && authHeader === serviceRoleKey);
  if (!hasServiceRole && authHeader) {
    try {
      const parts = authHeader.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload?.role === 'service_role') hasServiceRole = true;
      }
    } catch { /* malformed token */ }
  }

  if (!hasCronSecret && !hasServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Validate match_id is UUID format when provided
    if (body.match_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.match_id)) {
      return new Response(JSON.stringify({ error: 'Invalid match_id format, expected UUID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper: resolve active (or most recent) lineup id for a club
    async function resolveLineupId(clubId: string): Promise<string | null> {
      const { data: active } = await supabase
        .from('lineups').select('id').eq('club_id', clubId).eq('is_active', true).maybeSingle();
      if (active?.id) return active.id;
      const { data: recent } = await supabase
        .from('lineups').select('id').eq('club_id', clubId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      return recent?.id || null;
    }

    // Helper: materialize a single league_match row into a real matches row (race-safe)
    async function materializeLeagueMatch(lm: { id: string; home_club_id: string; away_club_id: string }, scheduledAt: string): Promise<{ matchId: string | null; warning?: string }> {
      // Guard: refuse to materialize if EITHER club is already in a `live` match.
      // Prevents the Samba-style desync where an orphaned live match (engine
      // never finished it) and a freshly-materialized round both try to act
      // on the same club. The DB also enforces this via UNIQUE indexes on
      // matches.home_club_id / matches.away_club_id WHERE status='live'
      // (migration 20260430030000), but checking here lets us short-circuit
      // BEFORE the INSERT and emit a useful diagnostic.
      const { data: liveBusy } = await supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, status')
        .eq('status', 'live')
        .or(`home_club_id.in.(${lm.home_club_id},${lm.away_club_id}),away_club_id.in.(${lm.home_club_id},${lm.away_club_id})`)
        .limit(1);
      if (liveBusy && liveBusy.length > 0) {
        const existing = liveBusy[0];
        console.log(`[SCHEDULER] club_busy lm=${lm.id} match=${existing.id} (home=${existing.home_club_id} away=${existing.away_club_id})`);
        return { matchId: null, warning: `club_busy lm=${lm.id} match=${existing.id}` };
      }

      const [homeLineupId, awayLineupId] = await Promise.all([
        resolveLineupId(lm.home_club_id),
        resolveLineupId(lm.away_club_id),
      ]);

      const { data: match, error: insertErr } = await supabase.from('matches').insert({
        home_club_id: lm.home_club_id,
        away_club_id: lm.away_club_id,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        home_lineup_id: homeLineupId,
        away_lineup_id: awayLineupId,
        current_half: 1,
        injury_time_turns: 0,
      }).select('id').single();

      if (insertErr || !match) {
        return { matchId: null, warning: `insert_failed lm=${lm.id}: ${insertErr?.message || 'no row'}` };
      }

      // Race-safe link: only set if still null
      const { data: linked, error: linkErr } = await supabase
        .from('league_matches').update({ match_id: match.id })
        .eq('id', lm.id).is('match_id', null).select('id');

      if (linkErr || !linked || linked.length === 0) {
        // Lost the race — another invocation already created a match. Delete ours.
        await supabase.from('matches').delete().eq('id', match.id);
        return { matchId: null, warning: `race_lost lm=${lm.id}` };
      }

      return { matchId: match.id };
    }

    // ─── Materialize due pickup matches (kickoff has arrived) ───
    //
    // Picks every pickup_games row whose kickoff_at has passed and status
    // is still 'open', atomically flips it to 'materialized' (CAS), then
    // creates the `matches` row + participants (humans + bots) and fires
    // match-engine-lab's auto_start. Keep slot defs in sync with
    // src/lib/pickupSlots.ts — Deno can't import from src/.
    if (action === 'materialize_due_pickups') {
      const PICKUP_SLOTS: Record<string, Array<{ slot_id: string; x: number; y: number }>> = {
        '5v5': [
          { slot_id: 'GK',   x: 5,  y: 50 },
          { slot_id: 'DEF1', x: 25, y: 30 },
          { slot_id: 'DEF2', x: 25, y: 70 },
          { slot_id: 'MC',   x: 40, y: 50 },
          { slot_id: 'ATA',  x: 42, y: 50 },
        ],
        '11v11': [
          { slot_id: 'GK',  x: 5,  y: 50 },
          { slot_id: 'LB',  x: 20, y: 15 },
          { slot_id: 'CB1', x: 18, y: 38 },
          { slot_id: 'CB2', x: 18, y: 62 },
          { slot_id: 'RB',  x: 20, y: 85 },
          { slot_id: 'LM',  x: 40, y: 20 },
          { slot_id: 'CM1', x: 37, y: 42 },
          { slot_id: 'CM2', x: 37, y: 58 },
          { slot_id: 'RM',  x: 40, y: 80 },
          { slot_id: 'ST1', x: 55, y: 40 },
          { slot_id: 'ST2', x: 55, y: 60 },
        ],
      };

      const nowIso = new Date().toISOString();
      const { data: due } = await supabase
        .from('pickup_games')
        .select('id, format, kickoff_at, created_by_profile_id')
        .eq('status', 'open')
        .lte('kickoff_at', nowIso);

      const { data: homeClub } = await supabase.rpc('pickup_home_club_id');
      const { data: awayClub } = await supabase.rpc('pickup_away_club_id');
      const homeClubId = homeClub as string | null;
      const awayClubId = awayClub as string | null;

      if (!homeClubId || !awayClubId) {
        return new Response(JSON.stringify({ error: 'Pickup shell clubs missing — run migration' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const warnings: string[] = [];
      let materialized = 0;

      for (const pg of (due || [])) {
        // Atomic CAS: only one invocation wins.
        const { data: claimed } = await supabase.from('pickup_games')
          .update({ status: 'materialized', updated_at: nowIso })
          .eq('id', pg.id).eq('status', 'open')
          .select('id').maybeSingle();
        if (!claimed) continue;

        const slots = PICKUP_SLOTS[pg.format as string];
        if (!slots) {
          warnings.push(`unknown_format pg=${pg.id} format=${pg.format}`);
          continue;
        }

        // Create the real match row.
        const { data: match, error: insertErr } = await supabase.from('matches').insert({
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          scheduled_at: nowIso,
          status: 'scheduled',
          home_lineup_id: null,
          away_lineup_id: null,
          current_half: 1,
          injury_time_turns: 0,
          match_type: 'pickup',
        }).select('id').single();

        if (insertErr || !match) {
          warnings.push(`match_insert_failed pg=${pg.id}: ${insertErr?.message || 'no row'}`);
          await supabase.from('pickup_games').update({ status: 'open' }).eq('id', pg.id);
          continue;
        }

        // Fetch humans who joined.
        const { data: humans } = await supabase
          .from('pickup_game_participants')
          .select('player_profile_id, team_side, slot_id, player_profiles!inner(user_id)')
          .eq('pickup_game_id', pg.id);

        type Row = { slot_id: string; x: number; y: number; humanPid: string | null; humanUid: string | null };
        const buildSide = (side: 'home' | 'away'): Row[] => {
          const humansOnSide = (humans || []).filter((h: any) => h.team_side === side);
          return slots.map(s => {
            const h = humansOnSide.find((x: any) => x.slot_id === s.slot_id);
            return {
              slot_id: s.slot_id,
              x: side === 'home' ? s.x : 100 - s.x,
              y: s.y,
              humanPid: h ? (h.player_profile_id as string) : null,
              humanUid: h?.player_profiles ? ((h.player_profiles as any).user_id as string | null) : null,
            };
          });
        };

        const homeRows = buildSide('home');
        const awayRows = buildSide('away');

        const participants = [
          ...homeRows.map(r => ({
            match_id: match.id,
            club_id: homeClubId,
            role_type: 'player',
            is_bot: r.humanPid === null,
            player_profile_id: r.humanPid,
            connected_user_id: r.humanUid,
            pos_x: r.x,
            pos_y: r.y,
            pickup_slot_id: r.slot_id,
          })),
          ...awayRows.map(r => ({
            match_id: match.id,
            club_id: awayClubId,
            role_type: 'player',
            is_bot: r.humanPid === null,
            player_profile_id: r.humanPid,
            connected_user_id: r.humanUid,
            pos_x: r.x,
            pos_y: r.y,
            pickup_slot_id: r.slot_id,
          })),
        ];

        const { error: partsErr } = await supabase.from('match_participants').insert(participants);
        if (partsErr) {
          warnings.push(`participants_insert_failed pg=${pg.id}: ${partsErr.message}`);
          await supabase.from('matches').delete().eq('id', match.id);
          await supabase.from('pickup_games').update({ status: 'open' }).eq('id', pg.id);
          continue;
        }

        // Link the pickup to its match row.
        await supabase.from('pickup_games')
          .update({ match_id: match.id, updated_at: nowIso })
          .eq('id', pg.id);

        // Kick off the engine.
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/match-engine-lab`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ action: 'auto_start', match_id: match.id }),
          });
        } catch (e) {
          warnings.push(`auto_start_failed pg=${pg.id}: ${e}`);
        }

        materialized++;
      }

      console.log(`[SCHEDULER] materialize_due_pickups: materialized=${materialized} warnings=${warnings.length}`);
      return new Response(JSON.stringify({ materialized, warnings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Materialize upcoming matches (5 min before kickoff) ───
    if (action === 'materialize_upcoming_matches') {
      const nowIso = new Date().toISOString();
      const cutoffIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { data: pending } = await supabase
        .from('league_matches')
        .select('id, home_club_id, away_club_id, round_id, league_rounds!inner(id, scheduled_at, status)')
        .is('match_id', null)
        .lte('league_rounds.scheduled_at', cutoffIso)
        .in('league_rounds.status', ['scheduled', 'live']);

      const warnings: string[] = [];
      let created = 0;

      for (const lm of (pending || [])) {
        const scheduledAt = (lm as any).league_rounds?.scheduled_at || nowIso;
        const res = await materializeLeagueMatch(lm as any, scheduledAt);
        if (res.matchId) created++;
        if (res.warning) warnings.push(res.warning);
      }

      console.log(`[SCHEDULER] materialize_upcoming_matches: created=${created} warnings=${warnings.length}`);
      return new Response(JSON.stringify({ created, warnings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Process due rounds: start matches for rounds whose time has arrived ───
    if (action === 'process_due_rounds' || !action) {
      const now = new Date().toISOString();

      // Find scheduled rounds that are due
      const { data: dueRounds } = await supabase
        .from('league_rounds')
        .select('id, round_number, season_id, scheduled_at')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now);

      if (!dueRounds || dueRounds.length === 0) {
        return new Response(JSON.stringify({ status: 'no_due_rounds' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let matchesStarted = 0;

      for (const round of dueRounds) {
        // Mark round as live
        await supabase.from('league_rounds').update({ status: 'live' }).eq('id', round.id);

        // Activate the season if still scheduled
        await supabase.from('league_seasons').update({
          status: 'active',
          started_at: new Date().toISOString(),
        }).eq('id', round.season_id).eq('status', 'scheduled');

        // Get matches for this round
        const { data: leagueMatches } = await supabase
          .from('league_matches')
          .select('id, match_id, home_club_id, away_club_id')
          .eq('round_id', round.id);

        // Safety net: materialize any row that hasn't been picked up by the 5-min cron yet
        for (const lm of (leagueMatches || [])) {
          if (lm.match_id) continue;
          const res = await materializeLeagueMatch(lm as any, round.scheduled_at || now);
          if (res.matchId) lm.match_id = res.matchId;
          if (res.warning) console.warn(`[SCHEDULER] process_due_rounds fallback: ${res.warning}`);
        }

        for (const lm of (leagueMatches || [])) {
          if (!lm.match_id) continue;

          // Refresh lineup IDs with current active lineups before starting
          const [{ data: homeLineup }, { data: awayLineup }] = await Promise.all([
            supabase.from('lineups').select('id').eq('club_id', lm.home_club_id).eq('is_active', true).maybeSingle(),
            supabase.from('lineups').select('id').eq('club_id', lm.away_club_id).eq('is_active', true).maybeSingle(),
          ]);

          // Update match to scheduled with current time + fresh lineup IDs
          await supabase.from('matches').update({
            scheduled_at: now,
            status: 'scheduled',
            home_lineup_id: homeLineup?.id || null,
            away_lineup_id: awayLineup?.id || null,
          }).eq('id', lm.match_id).eq('status', 'scheduled');

          // Trigger match-engine-lab to auto-start this match
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/match-engine-lab`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ action: 'auto_start', match_id: lm.match_id }),
            });
          } catch (e) {
            console.error(`[SCHEDULER] Failed to trigger auto_start for match ${lm.match_id}:`, e);
          }

          matchesStarted++;
        }

        console.log(`[SCHEDULER] Round ${round.round_number}: ${(leagueMatches || []).length} matches activated`);
      }

      return new Response(JSON.stringify({
        status: 'processed',
        rounds_processed: dueRounds.length,
        matches_started: matchesStarted,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Update standings after a match finishes ───
    if (action === 'update_standings' && body.match_id) {
      const { data: match } = await supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, home_score, away_score, status')
        .eq('id', body.match_id)
        .maybeSingle();

      if (!match || match.status !== 'finished') {
        return new Response(JSON.stringify({ error: 'Match not found or not finished' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: leagueMatch } = await supabase
        .from('league_matches')
        .select('id, round_id')
        .eq('match_id', match.id)
        .maybeSingle();

      if (!leagueMatch) {
        return new Response(JSON.stringify({ status: 'not_league_match' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: round } = await supabase
        .from('league_rounds')
        .select('season_id')
        .eq('id', leagueMatch.round_id)
        .maybeSingle();

      if (!round) {
        return new Response(JSON.stringify({ error: 'Round not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const homeScore = match.home_score ?? 0;
      const awayScore = match.away_score ?? 0;
      const homeWon = homeScore > awayScore;
      const awayWon = awayScore > homeScore;
      const draw = homeScore === awayScore;

      // Update both teams' standings (with upsert for safety)
      for (const [clubId, gf, ga, won, lost] of [
        [match.home_club_id, homeScore, awayScore, homeWon, awayWon],
        [match.away_club_id, awayScore, homeScore, awayWon, homeWon],
      ] as [string, number, number, boolean, boolean][]) {
        const { data: standing } = await supabase
          .from('league_standings')
          .select('*')
          .eq('season_id', round.season_id)
          .eq('club_id', clubId)
          .maybeSingle();

        if (standing) {
          await supabase.from('league_standings').update({
            played: standing.played + 1,
            won: standing.won + (won ? 1 : 0),
            drawn: standing.drawn + (draw ? 1 : 0),
            lost: standing.lost + (lost ? 1 : 0),
            goals_for: standing.goals_for + gf,
            goals_against: standing.goals_against + ga,
            points: standing.points + (won ? 3 : draw ? 1 : 0),
            updated_at: new Date().toISOString(),
          }).eq('id', standing.id);
        } else {
          await supabase.from('league_standings').insert({
            season_id: round.season_id, club_id: clubId,
            played: 1, won: won ? 1 : 0, drawn: draw ? 1 : 0, lost: lost ? 1 : 0,
            goals_for: gf, goals_against: ga, points: won ? 3 : draw ? 1 : 0,
          });
          console.log(`[SCHEDULER] Created missing standing for club ${clubId}`);
        }
      }

      // Check if all matches in this round are finished
      const { data: roundMatches } = await supabase
        .from('league_matches')
        .select('match_id')
        .eq('round_id', leagueMatch.round_id);

      const matchIds = (roundMatches || []).map(rm => rm.match_id).filter(Boolean);
      const { data: allMatches } = matchIds.length > 0
        ? await supabase.from('matches').select('status').in('id', matchIds)
        : { data: [] };

      const allFinished = (allMatches || []).every(m => m.status === 'finished');
      if (allFinished) {
        await supabase.from('league_rounds').update({ status: 'finished' }).eq('id', leagueMatch.round_id);

        const { data: seasonRounds } = await supabase
          .from('league_rounds')
          .select('status')
          .eq('season_id', round.season_id);

        const allRoundsFinished = (seasonRounds || []).every(r => r.status === 'finished');
        if (allRoundsFinished) {
          await supabase.from('league_seasons').update({
            status: 'finished',
            finished_at: new Date().toISOString(),
            next_season_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          }).eq('id', round.season_id);
          console.log(`[SCHEDULER] Season ${round.season_id} finished!`);

          // Season-end aging: +1 age all active players, decay 33+, cull bots 40+.
          // Idempotent per season — safe if both scheduler and engine reach here.
          try {
            const { data: aging, error: agingErr } = await supabase.rpc('advance_all_player_ages', {
              p_season_id: round.season_id,
            });
            if (agingErr) {
              console.error(`[SCHEDULER] advance_all_player_ages failed for season ${round.season_id}:`, agingErr);
            } else {
              console.log(`[SCHEDULER] Aging applied for season ${round.season_id}:`, aging);
            }
          } catch (agingEx) {
            console.error(`[SCHEDULER] advance_all_player_ages threw for season ${round.season_id}:`, agingEx);
          }

          // Season recap narrative — generated after awards + MVP poll exist
          // (those are inserted by the league_season_finished_awards trigger
          // synchronously with the UPDATE above).
          try {
            await generateAndPersistSeasonRecap(supabase, round.season_id);
            console.log(`[SCHEDULER] Season recap generated for ${round.season_id}`);
          } catch (recapEx) {
            console.error(`[SCHEDULER] generateAndPersistSeasonRecap threw for season ${round.season_id}:`, recapEx);
          }

          // Auto-create Season N+1 immediately so the Hall da Fama widget +
          // LeaguePage have something to point at during the 14-day gap.
          // First round of N+1 is scheduled at next_season_at (= now + 14d).
          try {
            const { data: leagueRow } = await supabase
              .from('league_seasons')
              .select('league_id')
              .eq('id', round.season_id)
              .maybeSingle();
            if (leagueRow?.league_id) {
              const seedRes = await fetch(`${supabaseUrl}/functions/v1/league-seed`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ action: 'start_next_season', league_id: leagueRow.league_id }),
              });
              const seedJson = await seedRes.json();
              console.log(`[SCHEDULER] start_next_season for league ${leagueRow.league_id}:`, seedJson);
            }
          } catch (seedEx) {
            console.error(`[SCHEDULER] start_next_season call failed for season ${round.season_id}:`, seedEx);
          }
        }
      }

      console.log(`[SCHEDULER] Updated standings for match ${match.id}: ${homeScore}-${awayScore}`);

      return new Response(JSON.stringify({ status: 'standings_updated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Recalculate all standings from scratch for a season ───
    if (action === 'recalculate_standings') {
      // Find the active or most recent season
      const { data: season } = await supabase
        .from('league_seasons')
        .select('id')
        .in('status', ['active', 'scheduled'])
        .order('season_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!season) {
        return new Response(JSON.stringify({ error: 'No active season found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const seasonId = body.season_id || season.id;

      // Reset all standings for this season to zero
      await supabase.from('league_standings').update({
        played: 0, won: 0, drawn: 0, lost: 0,
        goals_for: 0, goals_against: 0, points: 0,
        updated_at: new Date().toISOString(),
      }).eq('season_id', seasonId);

      // Get all rounds for this season
      const { data: rounds } = await supabase
        .from('league_rounds')
        .select('id')
        .eq('season_id', seasonId);

      if (!rounds || rounds.length === 0) {
        return new Response(JSON.stringify({ status: 'no_rounds' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const roundIds = rounds.map(r => r.id);

      // Get all league matches
      const { data: leagueMatches } = await supabase
        .from('league_matches')
        .select('match_id, home_club_id, away_club_id')
        .in('round_id', roundIds)
        .not('match_id', 'is', null);

      const matchIds = (leagueMatches || []).map(lm => lm.match_id).filter(Boolean);

      // Get all finished matches
      const { data: finishedMatches } = matchIds.length > 0
        ? await supabase.from('matches').select('id, home_club_id, away_club_id, home_score, away_score').eq('status', 'finished').in('id', matchIds)
        : { data: [] };

      let matchesProcessed = 0;

      for (const match of (finishedMatches || [])) {
        const hS = match.home_score ?? 0;
        const aS = match.away_score ?? 0;
        const hW = hS > aS, aW = aS > hS, dr = hS === aS;

        for (const [clubId, gf, ga, won, lost] of [
          [match.home_club_id, hS, aS, hW, aW],
          [match.away_club_id, aS, hS, aW, hW],
        ] as [string, number, number, boolean, boolean][]) {
          const { data: st } = await supabase
            .from('league_standings')
            .select('*')
            .eq('season_id', seasonId)
            .eq('club_id', clubId)
            .maybeSingle();

          if (st) {
            await supabase.from('league_standings').update({
              played: st.played + 1,
              won: st.won + (won ? 1 : 0),
              drawn: st.drawn + (dr ? 1 : 0),
              lost: st.lost + (lost ? 1 : 0),
              goals_for: st.goals_for + gf,
              goals_against: st.goals_against + ga,
              points: st.points + (won ? 3 : dr ? 1 : 0),
              updated_at: new Date().toISOString(),
            }).eq('id', st.id);
          } else {
            await supabase.from('league_standings').insert({
              season_id: seasonId, club_id: clubId,
              played: 1, won: won ? 1 : 0, drawn: dr ? 1 : 0, lost: lost ? 1 : 0,
              goals_for: gf, goals_against: ga, points: won ? 3 : dr ? 1 : 0,
            });
          }
        }
        matchesProcessed++;
      }

      // Also update round statuses
      for (const round of rounds) {
        const { data: roundLMs } = await supabase
          .from('league_matches')
          .select('match_id')
          .eq('round_id', round.id);
        const rmIds = (roundLMs || []).map(rm => rm.match_id).filter(Boolean);
        if (rmIds.length === 0) continue;
        const { data: allM } = await supabase.from('matches').select('status').in('id', rmIds);
        const allDone = (allM || []).every(m => m.status === 'finished');
        if (allDone) {
          await supabase.from('league_rounds').update({ status: 'finished' }).eq('id', round.id);
        }
      }

      console.log(`[SCHEDULER] Recalculated standings: ${matchesProcessed} matches processed for season ${seasonId}`);

      return new Response(JSON.stringify({
        status: 'recalculated',
        season_id: seasonId,
        matches_processed: matchesProcessed,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Apply schedule votes ───
    if (action === 'apply_votes') {
      const { data: leagues } = await supabase
        .from('leagues')
        .select('id')
        .eq('status', 'active');

      for (const league of (leagues || [])) {
        // Get all votes for this league
        const { data: votes } = await supabase
          .from('league_schedule_votes')
          .select('preferred_day_1, preferred_day_2, preferred_time, manager_profile_id');

        if (!votes || votes.length === 0) continue;

        // Count votes for each combo
        const comboCounts = new Map<string, number>();
        for (const v of votes) {
          const key = `${v.preferred_day_1}|${v.preferred_day_2}|${v.preferred_time}`;
          comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
        }

        // Find the most popular combo
        let maxVotes = 0;
        let winningCombo = '';
        for (const [combo, count] of comboCounts) {
          if (count > maxVotes) {
            maxVotes = count;
            winningCombo = combo;
          }
        }

        // Check if it's a majority (> 50% of human managers)
        const { data: humanClubs } = await supabase
          .from('clubs')
          .select('id')
          .eq('league_id', league.id)
          .eq('is_bot_managed', false);

        const totalHumanManagers = (humanClubs || []).length;
        if (totalHumanManagers > 0 && maxVotes > totalHumanManagers / 2) {
          const [day1, day2, time] = winningCombo.split('|');
          await supabase.from('leagues').update({
            match_day_1: day1,
            match_day_2: day2,
            match_time: time,
          }).eq('id', league.id);

          // Update the cron job to match new schedule
          await supabase.rpc('update_league_cron_schedule', {
            p_day_1: day1,
            p_day_2: day2,
            p_time: time,
          });

          console.log(`[SCHEDULER] League ${league.id} schedule updated to ${day1}+${day2} at ${time} (${maxVotes}/${totalHumanManagers} votes) — cron updated`);
        }
      }

      return new Response(JSON.stringify({ status: 'votes_applied' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: process_due_rounds, materialize_upcoming_matches, materialize_due_pickups, update_standings, recalculate_standings, apply_votes' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SCHEDULER ERROR]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
