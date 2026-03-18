import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all players with energy below max
    const { data: players, error } = await supabase
      .from('player_profiles')
      .select('id, energy_current, energy_max')
      .lt('energy_current', supabase.rpc ? 100000 : 100000); // just get all

    if (error) throw error;

    const needsRegen = (players || []).filter(p => p.energy_current < p.energy_max);
    let updated = 0;

    for (const p of needsRegen) {
      // Random 15-35% of max energy
      const regenPct = 0.15 + Math.random() * 0.20;
      const regenAmount = Math.floor(p.energy_max * regenPct);
      const newEnergy = Math.min(p.energy_max, p.energy_current + regenAmount);

      await supabase
        .from('player_profiles')
        .update({ energy_current: newEnergy })
        .eq('id', p.id);

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
