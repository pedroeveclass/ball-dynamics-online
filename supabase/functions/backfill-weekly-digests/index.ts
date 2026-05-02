// Backfill weekly digests for past finished rounds. Iterates over each
// finished league_round and triggers the generate-weekly-digests function
// for that specific (season_id, round_number). Idempotent via UNIQUE
// (user_id, season_id, round_number); pass ?force=1 to wipe and regen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      await supabase.from('user_digests').delete().neq('id', 0);
    }

    const { data: rounds, error } = await supabase
      .from('league_rounds')
      .select('season_id, round_number')
      .eq('status', 'finished')
      .order('season_id')
      .order('round_number');
    if (error) throw error;

    const summary: { round: number; result: any }[] = [];
    for (const r of rounds ?? []) {
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-weekly-digests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: r.season_id, round_number: r.round_number }),
      });
      const payload = await resp.json().catch(() => ({}));
      summary.push({ round: r.round_number, result: payload });
    }

    return new Response(JSON.stringify({ rounds_processed: summary.length, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
