import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Facility stats lookup (must match migration function get_facility_stats)
const FACILITY_STATS: Record<string, Record<number, { revenue: number; cost: number }>> = {
  souvenir_shop: { 1: { revenue: 3000, cost: 500 }, 2: { revenue: 6000, cost: 1000 }, 3: { revenue: 12000, cost: 2000 }, 4: { revenue: 22000, cost: 4000 }, 5: { revenue: 40000, cost: 7000 } },
  sponsorship: { 1: { revenue: 5000, cost: 800 }, 2: { revenue: 10000, cost: 1500 }, 3: { revenue: 20000, cost: 3000 }, 4: { revenue: 38000, cost: 6000 }, 5: { revenue: 70000, cost: 10000 } },
  training_center: { 1: { revenue: 0, cost: 700 }, 2: { revenue: 0, cost: 1500 }, 3: { revenue: 0, cost: 3000 }, 4: { revenue: 0, cost: 6000 }, 5: { revenue: 0, cost: 10000 } },
  stadium: { 1: { revenue: 0, cost: 2000 }, 2: { revenue: 0, cost: 4000 }, 3: { revenue: 0, cost: 7000 }, 4: { revenue: 0, cost: 12000 }, 5: { revenue: 0, cost: 20000 } },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all active clubs
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name, manager_profile_id')
      .eq('status', 'active');

    if (!clubs || clubs.length === 0) {
      return new Response(JSON.stringify({ status: 'no_clubs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;

    for (const club of clubs) {
      // Fetch facilities
      const { data: facilities } = await supabase
        .from('club_facilities')
        .select('facility_type, level')
        .eq('club_id', club.id);

      // Calculate total revenue and cost from facilities
      let totalRevenue = 0;
      let totalFacilityCost = 0;
      for (const f of (facilities || [])) {
        const stats = FACILITY_STATS[f.facility_type]?.[f.level];
        if (stats) {
          totalRevenue += stats.revenue;
          totalFacilityCost += stats.cost;
        }
      }

      // Fetch active contracts for wage bill
      const { data: contracts } = await supabase
        .from('contracts')
        .select('weekly_salary')
        .eq('club_id', club.id)
        .eq('status', 'active');

      const totalWages = (contracts || []).reduce((sum, c) => sum + Number(c.weekly_salary || 0), 0);
      const totalExpense = totalFacilityCost + totalWages;
      const netIncome = totalRevenue - totalExpense;

      // Fetch current balance
      const { data: finance } = await supabase
        .from('club_finances')
        .select('balance')
        .eq('club_id', club.id)
        .maybeSingle();

      const currentBalance = Number(finance?.balance ?? 0);
      const newBalance = currentBalance + netIncome;

      // Update club_finances
      await supabase.from('club_finances').update({
        balance: newBalance,
        weekly_wage_bill: totalWages,
        projected_income: totalRevenue,
        projected_expense: totalExpense,
        updated_at: new Date().toISOString(),
      }).eq('club_id', club.id);

      // Send notification to manager (if human)
      const { data: managerProfile } = await supabase
        .from('manager_profiles')
        .select('user_id')
        .eq('id', club.manager_profile_id)
        .maybeSingle();

      if (managerProfile?.user_id) {
        const sign = netIncome >= 0 ? '+' : '';
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        await supabase.from('notifications').insert({
          user_id: managerProfile.user_id,
          type: 'weekly_finance',
          title: '📊 Relatório Financeiro Semanal',
          body: `Receita: ${fmt(totalRevenue)} | Despesas: ${fmt(totalExpense)} | Resultado: ${sign}${fmt(netIncome)} | Saldo: ${fmt(newBalance)}`,
        });
      }

      processed++;
      console.log(`[FINANCES] ${club.name}: revenue=${totalRevenue} expense=${totalExpense} net=${netIncome} balance=${newBalance}`);
    }

    return new Response(JSON.stringify({ status: 'processed', clubs_processed: processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FINANCES ERROR]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
