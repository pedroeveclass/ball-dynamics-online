// One-shot: generate season_recap narrative for a specific league_season.
// Run: deno run --allow-net --allow-env --allow-read scripts/generate-season-recap-oneshot.ts <season_id>
//
// Mirrors the production trigger (`generateAndPersistSeasonRecap` from the
// edge function), but invokable from the local machine. Used 2026-05-04 to
// backfill BR Série A T1 recap that was never written (T1 finished before
// the recap pipeline shipped).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndPersistSeasonRecap } from '../supabase/functions/match-engine-lab/season_recap_templates.ts';

const SEASON_ID = Deno.args[0];
if (!SEASON_ID) {
  console.error('usage: deno run --allow-net --allow-env --allow-read scripts/generate-season-recap-oneshot.ts <season_id>');
  Deno.exit(1);
}

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  Deno.exit(1);
}

const supabase = createClient(url, key);

console.log(`generating season_recap for ${SEASON_ID}…`);
await generateAndPersistSeasonRecap(supabase as any, SEASON_ID);

const { data, error } = await supabase
  .from('narratives')
  .select('entity_id, scope, season, generated_at, body_pt')
  .eq('entity_type', 'league_season')
  .eq('entity_id', SEASON_ID)
  .eq('scope', 'season_recap')
  .maybeSingle();

if (error) { console.error('verify failed:', error); Deno.exit(1); }
if (!data) { console.error('no row written — generator returned silently. Check edge logs.'); Deno.exit(1); }
console.log('OK:', { entity_id: data.entity_id, scope: data.scope, season: data.season, generated_at: data.generated_at, body_pt_preview: String(data.body_pt).slice(0, 200) + '…' });
