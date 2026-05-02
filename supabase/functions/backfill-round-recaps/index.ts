// Backfill round recaps for league_rounds finished before this system
// rolled out. Idempotent — narratives UNIQUE constraint prevents
// duplicates. Pass ?force=1 to wipe existing round recaps before
// regenerating (used when templates change).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndPersistRoundRecap } from '../match-engine-lab/round_recap_templates.ts';

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

    if (force) {
      await supabase
        .from('narratives')
        .delete()
        .eq('entity_type', 'league_round')
        .eq('scope', 'round_recap');
    }

    const { data: existing } = await supabase
      .from('narratives')
      .select('entity_id')
      .eq('entity_type', 'league_round')
      .eq('scope', 'round_recap');
    const existingIds = new Set((existing ?? []).map((r: any) => r.entity_id));

    // Order by season + round_number so leader-change detection in the
    // extractor (which reads the previous round's recap) works correctly.
    const { data: rounds, error } = await supabase
      .from('league_rounds')
      .select('id, round_number, season_id')
      .eq('status', 'finished')
      .order('season_id')
      .order('round_number');
    if (error) throw error;

    const todo = (rounds ?? []).filter((r: any) => !existingIds.has(r.id));

    let processed = 0;
    const errors: { roundId: string; message: string }[] = [];

    for (const r of todo) {
      try {
        await generateAndPersistRoundRecap(supabase, r.id);
        processed += 1;
      } catch (err: any) {
        errors.push({ roundId: r.id, message: String(err?.message ?? err) });
      }
    }

    return new Response(
      JSON.stringify({
        total_finished_rounds: rounds?.length ?? 0,
        already_had_recap: existingIds.size,
        processed,
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
