import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authorize cron-only access (optional: only enforced if CRON_SECRET is set)
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
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
        .single();

      if (!match || match.status !== 'finished') {
        return new Response(JSON.stringify({ error: 'Match not found or not finished' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find which league match this belongs to
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

      // Get season_id from round
      const { data: round } = await supabase
        .from('league_rounds')
        .select('season_id')
        .eq('id', leagueMatch.round_id)
        .single();

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

      // Update home team standings
      const { data: homeStanding } = await supabase
        .from('league_standings')
        .select('*')
        .eq('season_id', round.season_id)
        .eq('club_id', match.home_club_id)
        .single();

      if (homeStanding) {
        await supabase.from('league_standings').update({
          played: homeStanding.played + 1,
          won: homeStanding.won + (homeWon ? 1 : 0),
          drawn: homeStanding.drawn + (draw ? 1 : 0),
          lost: homeStanding.lost + (awayWon ? 1 : 0),
          goals_for: homeStanding.goals_for + homeScore,
          goals_against: homeStanding.goals_against + awayScore,
          points: homeStanding.points + (homeWon ? 3 : draw ? 1 : 0),
          updated_at: new Date().toISOString(),
        }).eq('id', homeStanding.id);
      }

      // Update away team standings
      const { data: awayStanding } = await supabase
        .from('league_standings')
        .select('*')
        .eq('season_id', round.season_id)
        .eq('club_id', match.away_club_id)
        .single();

      if (awayStanding) {
        await supabase.from('league_standings').update({
          played: awayStanding.played + 1,
          won: awayStanding.won + (awayWon ? 1 : 0),
          drawn: awayStanding.drawn + (draw ? 1 : 0),
          lost: awayStanding.lost + (homeWon ? 1 : 0),
          goals_for: awayStanding.goals_for + awayScore,
          goals_against: awayStanding.goals_against + homeScore,
          points: awayStanding.points + (awayWon ? 3 : draw ? 1 : 0),
          updated_at: new Date().toISOString(),
        }).eq('id', awayStanding.id);
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

        // Check if all rounds in season are finished
        const { data: seasonRounds } = await supabase
          .from('league_rounds')
          .select('status')
          .eq('season_id', round.season_id);

        const allRoundsFinished = (seasonRounds || []).every(r => r.status === 'finished');
        if (allRoundsFinished) {
          await supabase.from('league_seasons').update({
            status: 'finished',
            finished_at: new Date().toISOString(),
            next_season_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks rest
          }).eq('id', round.season_id);
          console.log(`[SCHEDULER] Season ${round.season_id} finished!`);
        }
      }

      console.log(`[SCHEDULER] Updated standings for match ${match.id}: ${homeScore}-${awayScore}`);

      return new Response(JSON.stringify({ status: 'standings_updated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
