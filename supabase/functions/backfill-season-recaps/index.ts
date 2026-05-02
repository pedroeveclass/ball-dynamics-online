// Backfill season recaps for already-finished seasons.
// Idempotent (UNIQUE entity_type+entity_id+scope on narratives via partial
// index where milestone_type IS NULL). Pass ?force=1 to wipe + regenerate.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndPersistSeasonRecap } from '../match-engine-lab/season_recap_templates.ts';

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
    const seasonIdParam = url.searchParams.get('season_id');

    if (force) {
      await supabase
        .from('narratives')
        .delete()
        .eq('entity_type', 'league_season')
        .eq('scope', 'season_recap');
    }

    let seasons: { id: string }[] = [];
    if (seasonIdParam) {
      seasons = [{ id: seasonIdParam }];
    } else {
      const { data, error } = await supabase
        .from('league_seasons')
        .select('id')
        .eq('status', 'finished');
      if (error) throw error;
      seasons = (data ?? []) as { id: string }[];
    }

    let processed = 0;
    const errors: { id: string; message: string }[] = [];
    for (const s of seasons) {
      try {
        await generateAndPersistSeasonRecap(supabase, s.id);
        processed += 1;
      } catch (err: any) {
        errors.push({ id: s.id, message: String(err?.message ?? err) });
      }
    }

    return new Response(JSON.stringify({
      total_seasons: seasons.length,
      processed,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
