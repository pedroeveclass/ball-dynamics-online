// Backfill player milestones for matches that finished before the
// milestone system rolled out. Iterates matches chronologically (so
// "first goal" / "first hat-trick" land on the actual first occurrence)
// and runs the same detector the engine uses. Then sweeps finished
// seasons for end-of-season awards.
//
// Idempotent — partial UNIQUE on (entity_type, entity_id, milestone_type)
// dedupes silently. Pass ?force=1 to wipe existing milestones first.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  detectAndPersistMatchMilestones,
  detectAndPersistSeasonMilestones,
  detectMilestonesForSinglePlayer,
} from '../match-engine-lab/player_milestones_templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';
    const maxMatches = Number(url.searchParams.get('max') ?? '0') || Infinity;
    // Skip bot players (user_id IS NULL) when set to '1'. Pedro asked
    // to backfill humans first then bots, so caller controls scope.
    const humansOnly = url.searchParams.get('humans_only') === '1';
    // missing_only mode: only run for players who currently have NO
    // milestones at all (haven't been processed yet). Walks each missing
    // player's career chronologically with detectMilestonesForSinglePlayer
    // — much lighter on memory than the per-match path because state is
    // bounded by one player's history.
    const missingOnly = url.searchParams.get('missing_only') === '1';
    const maxPlayers = Number(url.searchParams.get('max_players') ?? '0') || Infinity;

    if (force) {
      await supabase
        .from('narratives')
        .delete()
        .eq('entity_type', 'player')
        .eq('scope', 'milestone');
    }

    let processedMatches = 0;
    let processedPlayers = 0;
    const errors: { id: string; message: string }[] = [];

    if (missingOnly) {
      // Find players with at least one player_match_stats row but no
      // narratives milestone yet. Two-step query (cheaper than NOT EXISTS
      // through the JS client). Apply humansOnly filter via player_profiles
      // join when requested.
      const { data: playersWithStats } = await supabase
        .from('player_match_stats')
        .select('player_profile_id');
      const havingStats = new Set<string>();
      for (const r of playersWithStats ?? []) {
        if (r.player_profile_id) havingStats.add(r.player_profile_id);
      }

      const { data: alreadyHave } = await supabase
        .from('narratives')
        .select('entity_id')
        .eq('entity_type', 'player')
        .eq('scope', 'milestone');
      const alreadyHaveSet = new Set<string>();
      for (const r of alreadyHave ?? []) alreadyHaveSet.add(r.entity_id);

      let candidatePids = Array.from(havingStats).filter(pid => !alreadyHaveSet.has(pid));

      if (humansOnly) {
        const { data: profiles } = candidatePids.length > 0
          ? await supabase.from('player_profiles').select('id, user_id').in('id', candidatePids)
          : { data: [] as any[] };
        const humanIds = new Set<string>();
        for (const p of profiles ?? []) {
          if (p.user_id) humanIds.add(p.id);
        }
        candidatePids = candidatePids.filter(pid => humanIds.has(pid));
      }

      const targetPids = candidatePids.slice(0, maxPlayers === Infinity ? 1000 : maxPlayers);

      for (const pid of targetPids) {
        try {
          await detectMilestonesForSinglePlayer(supabase, pid);
          processedPlayers += 1;
        } catch (err: any) {
          errors.push({ id: pid, message: String(err?.message ?? err) });
        }
      }
    } else {
      // Process matches chronologically so threshold detection reads
      // the accumulated state correctly.
      const { data: matches, error } = await supabase
        .from('matches')
        .select('id, finished_at')
        .eq('status', 'finished')
        .order('finished_at', { ascending: true })
        .limit(maxMatches === Infinity ? 1000 : maxMatches);
      if (error) throw error;

      for (const m of matches ?? []) {
        try {
          await detectAndPersistMatchMilestones(supabase, m.id, { humansOnly });
          processedMatches += 1;
        } catch (err: any) {
          errors.push({ id: m.id, message: String(err?.message ?? err) });
        }
      }
    }

    // Sweep finished seasons for end-of-season awards
    const { data: seasons } = await supabase
      .from('league_seasons')
      .select('id')
      .eq('status', 'finished');
    let processedSeasons = 0;
    for (const s of seasons ?? []) {
      try {
        await detectAndPersistSeasonMilestones(supabase, s.id);
        processedSeasons += 1;
      } catch (err: any) {
        errors.push({ id: s.id, message: String(err?.message ?? err) });
      }
    }

    return new Response(
      JSON.stringify({
        mode: missingOnly ? 'missing_only' : 'per_match',
        processed_matches: processedMatches,
        processed_players: processedPlayers,
        processed_seasons: processedSeasons,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
