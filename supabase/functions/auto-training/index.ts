import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// ISO-style day_of_week the planner uses: 0 = Monday, 6 = Sunday.
// JS Date#getUTCDay returns 0=Sunday..6=Saturday, so remap.
function isoDayOfWeekUTC(d: Date): number {
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return (js + 6) % 7;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Cron auth — mirrors energy-regen: accept CRON_SECRET header OR service_role JWT.
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
    } catch { /* malformed token */ }
  }
  if (!hasCronSecret && !hasServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const todayDow = isoDayOfWeekUTC(now); // 0..6
    const todayIso = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Pull every slot scheduled for today plus its owner's current state.
    // We only run once per player per day: `last_auto_trained_date = today` acts as the lock.
    const { data: slotsForToday, error: slotsErr } = await supabase
      .from('training_plans')
      .select('id, player_profile_id, slot_index, attribute_key')
      .eq('day_of_week', todayDow)
      .order('slot_index', { ascending: true });

    if (slotsErr) throw slotsErr;
    if (!slotsForToday || slotsForToday.length === 0) {
      return new Response(JSON.stringify({ success: true, executed: 0, players: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const slotsByPlayer = new Map<string, Array<{ slot_index: number; attribute_key: string }>>();
    for (const row of slotsForToday) {
      const list = slotsByPlayer.get(row.player_profile_id) || [];
      list.push({ slot_index: row.slot_index, attribute_key: row.attribute_key });
      slotsByPlayer.set(row.player_profile_id, list);
    }
    const playerIds = Array.from(slotsByPlayer.keys());

    // Fetch profiles to read the idempotency marker + user_id for notifications.
    const { data: profiles } = await supabase
      .from('player_profiles')
      .select('id, user_id, full_name, last_auto_trained_date')
      .in('id', playerIds);

    const results: Array<{ player_id: string; executed: number; skipped: number; reasons: string[] }> = [];
    let totalExecuted = 0;

    for (const profile of (profiles || [])) {
      if (profile.last_auto_trained_date === todayIso) {
        // Already ran today — skip to stay idempotent if the cron fires twice.
        continue;
      }

      const plannedSlots = (slotsByPlayer.get(profile.id) || [])
        .sort((a, b) => a.slot_index - b.slot_index);

      let executed = 0;
      let skipped = 0;
      const reasons: string[] = [];
      const trainedAttrs: Array<{ attr: string; growth: number }> = [];

      for (const slot of plannedSlots) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('auto_train_attribute', {
          p_player_profile_id: profile.id,
          p_attribute_key: slot.attribute_key,
        });

        if (rpcErr) {
          reasons.push(`slot ${slot.slot_index}: ${rpcErr.message}`);
          skipped++;
          // Insufficient energy is also a reason to stop — no point retrying the rest.
          if (rpcErr.message?.toLowerCase().includes('insufficient')) break;
          continue;
        }

        const payload = rpcData as { skipped?: boolean; reason?: string; attribute?: string; growth?: number };
        if (payload?.skipped) {
          reasons.push(`slot ${slot.slot_index}: ${payload.reason}`);
          skipped++;
          if (payload.reason === 'insufficient_energy') break; // stop — energy only regens tomorrow
          continue;
        }

        executed++;
        if (payload?.attribute && typeof payload.growth === 'number') {
          trainedAttrs.push({ attr: payload.attribute, growth: payload.growth });
        }
      }

      // Flip the idempotency marker regardless of outcome — we tried; don't retry today.
      await supabase
        .from('player_profiles')
        .update({ last_auto_trained_date: todayIso })
        .eq('id', profile.id);

      totalExecuted += executed;
      results.push({ player_id: profile.id, executed, skipped, reasons });

      // Notify the user with a short summary.
      if (profile.user_id && (executed > 0 || skipped > 0)) {
        const summary = executed > 0
          ? trainedAttrs
              .map(t => `${t.attr} +${t.growth.toFixed(2)}`)
              .join(' · ')
          : 'Sem energia suficiente hoje — plano do dia ficou pendente.';
        await supabase.from('notifications').insert({
          user_id: profile.user_id,
          player_profile_id: profile.id,
          title: executed > 0 ? '🏋️ Treino automático concluído' : '🏋️ Treino automático travou',
          body: executed > 0
            ? `${executed} sessão(ões): ${summary}`
            : summary,
          type: 'training',
          link: '/player/training-plan',
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, executed: totalExecuted, players: results.length, details: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
