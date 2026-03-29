import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Authorize cron-only access
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('x-cron-secret');
  if (!cronSecret || authHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all players with energy below max
    const { data: players, error } = await supabase
      .from('player_profiles')
      .select('id, user_id, energy_current, energy_max');

    if (error) throw error;

    const needsRegen = (players || []).filter(p => p.energy_current < p.energy_max);
    let updated = 0;

    for (const p of needsRegen) {
      // Random 25-30% de energia máxima
      const regenPct = 0.25 + Math.random() * 0.10;
      const regenAmount = Math.floor(p.energy_max * regenPct);
      const newEnergy = Math.min(p.energy_max, p.energy_current + regenAmount);

      await supabase
        .from('player_profiles')
        .update({ energy_current: newEnergy })
        .eq('id', p.id);

      // Notify player if they have a user_id
      if (p.user_id) {
        const pctRecovered = Math.round((regenAmount / p.energy_max) * 100);
        await supabase.from('notifications').insert({
          user_id: p.user_id,
          title: '⚡ Energia recuperada!',
          body: `${pctRecovered}% de energia recuperada. Aproveite para treinar!`,
          type: 'energy_regen',
        });
      }

      updated++;
    }

    return new Response(
      JSON.stringify({ success: true, updated, total: needsRegen.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
