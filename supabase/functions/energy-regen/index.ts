import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Authorize cron/admin access — accepts CRON_SECRET header or service_role JWT.
  // NOTE: We used to compare the bearer token against the literal
  // SUPABASE_SERVICE_ROLE_KEY env var, but that broke after service-key
  // rotation (the hardcoded JWT in pg_cron stopped matching). Now we also
  // accept any JWT whose payload has role=service_role.
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
    } catch { /* malformed token — leave hasServiceRole=false */ }
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

    // Fetch all players with energy below max
    const { data: players, error } = await supabase
      .from('player_profiles')
      .select('id, user_id, energy_current, energy_max');

    if (error) throw error;

    const needsRegen = (players || []).filter(p => p.energy_current < p.energy_max);
    let updated = 0;

    // Load active physio purchases for all players
    const playerIds = needsRegen.map(p => p.id);
    let physioBonusByPlayer = new Map<string, number>();
    if (playerIds.length > 0) {
      const { data: physioPurchases } = await supabase
        .from('store_purchases')
        .select('player_profile_id, store_item_id')
        .in('player_profile_id', playerIds)
        .in('status', ['active', 'cancelling']);

      if (physioPurchases && physioPurchases.length > 0) {
        const itemIds = [...new Set(physioPurchases.map(p => p.store_item_id))];
        const { data: physioItems } = await supabase
          .from('store_items')
          .select('id, bonus_value')
          .in('id', itemIds)
          .eq('category', 'physio');

        if (physioItems) {
          const itemMap = new Map(physioItems.map(i => [i.id, Number(i.bonus_value || 0)]));
          for (const purchase of physioPurchases) {
            const bonus = itemMap.get(purchase.store_item_id);
            if (bonus) {
              physioBonusByPlayer.set(purchase.player_profile_id, bonus);
            }
          }
        }
      }
    }

    for (const p of needsRegen) {
      // Base regen: random 25-30% of max energy
      const baseRegenPct = 0.25 + Math.random() * 0.10;
      // Physio bonus: adds % on top (e.g., physio nv3 = +15% → base 27% + 15% = 42%)
      const physioBonus = physioBonusByPlayer.get(p.id) || 0;
      const regenPct = baseRegenPct + (physioBonus / 100);
      const regenAmount = Math.floor(p.energy_max * regenPct);
      const newEnergy = Math.min(p.energy_max, p.energy_current + regenAmount);

      await supabase
        .from('player_profiles')
        .update({ energy_current: newEnergy })
        .eq('id', p.id);

      // Notify player if they have a user_id
      if (p.user_id) {
        if (newEnergy >= p.energy_max && p.energy_current < p.energy_max) {
          // Energy just hit 100%
          await supabase.from('notifications').insert({
            user_id: p.user_id,
            title: '⚡ Energia 100%!',
            body: 'Sua energia está cheia! Aproveite para treinar antes que fique parado.',
            type: 'energy',
            link: '/player/attributes',
          });
        } else {
          const pctRecovered = Math.round((regenAmount / p.energy_max) * 100);
          await supabase.from('notifications').insert({
            user_id: p.user_id,
            title: '⚡ Energia recuperada!',
            body: `+${pctRecovered}% de energia. Atual: ${newEnergy}/${p.energy_max}`,
            type: 'energy',
            link: '/player',
          });
        }
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
