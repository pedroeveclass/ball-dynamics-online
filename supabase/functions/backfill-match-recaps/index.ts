// Backfill match recaps for matches that finished before the recap
// system existed. Iterates matches with status='finished' that don't yet
// have an entry in narratives (entity_type='match', scope='match_recap')
// and runs the same generator the engine uses.
//
// One-shot endpoint — call once, then forget. Idempotent thanks to the
// UNIQUE (entity_type, entity_id, scope) constraint, so safe to retry.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndPersistMatchRecap } from '../match-engine-lab/match_recap_templates.ts';

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

    // When force=1 wipe existing match recaps so v2 templates regenerate
    // over the v1 paragraphs. Without force, only fill in matches that
    // never had a recap (default safe behavior).
    if (force) {
      await supabase
        .from('narratives')
        .delete()
        .eq('entity_type', 'match')
        .eq('scope', 'match_recap');
    }

    const { data: existing } = await supabase
      .from('narratives')
      .select('entity_id')
      .eq('entity_type', 'match')
      .eq('scope', 'match_recap');

    const existingIds = new Set((existing ?? []).map((r: any) => r.entity_id));

    const { data: finished, error } = await supabase
      .from('matches')
      .select('id, finished_at')
      .eq('status', 'finished')
      .order('finished_at', { ascending: true });

    if (error) throw error;

    const todo = (finished ?? []).filter((m: any) => !existingIds.has(m.id));

    let processed = 0;
    const errors: { matchId: string; message: string }[] = [];

    for (const m of todo) {
      try {
        await generateAndPersistMatchRecap(supabase, m.id);
        processed += 1;
      } catch (err: any) {
        errors.push({ matchId: m.id, message: String(err?.message ?? err) });
      }
    }

    return new Response(
      JSON.stringify({
        total_finished: finished?.length ?? 0,
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
