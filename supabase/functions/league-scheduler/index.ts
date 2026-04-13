import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    return new Response(JSON.stringify({ error: 'Unknown action. Use: process_due_rounds, update_standings, apply_votes' }), {
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
