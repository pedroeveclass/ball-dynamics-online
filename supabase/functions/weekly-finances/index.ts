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
  stadium: { 1: { revenue: 0, cost: 2000 }, 2: { revenue: 0, cost: 3500 }, 3: { revenue: 0, cost: 5500 }, 4: { revenue: 0, cost: 8000 }, 5: { revenue: 0, cost: 12000 }, 6: { revenue: 0, cost: 18000 }, 7: { revenue: 0, cost: 25000 }, 8: { revenue: 0, cost: 35000 }, 9: { revenue: 0, cost: 48000 }, 10: { revenue: 0, cost: 65000 } },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

      // Credit player salaries
      const { data: activeContracts } = await supabase
        .from('contracts')
        .select('player_profile_id, weekly_salary')
        .eq('club_id', club.id)
        .eq('status', 'active');

      for (const contract of (activeContracts || [])) {
        if (contract.player_profile_id && contract.weekly_salary > 0) {
          const { data: player } = await supabase
            .from('player_profiles')
            .select('money, user_id')
            .eq('id', contract.player_profile_id)
            .maybeSingle();

          if (player) {
            await supabase.from('player_profiles').update({
              money: (player.money || 0) + contract.weekly_salary,
            }).eq('id', contract.player_profile_id);

            // Notify player about salary received
            if (player.user_id) {
              await supabase.from('notifications').insert({
                user_id: player.user_id,
                title: '💰 Salário recebido!',
                body: `Você recebeu ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.weekly_salary)} de salário semanal.`,
                type: 'salary_paid',
              });
            }
          }
        }
      }

      // --- Process club loan payments ---
      const { data: clubLoans } = await supabase
        .from('loans')
        .select('*')
        .eq('club_id', club.id)
        .eq('status', 'active');

      for (const loan of (clubLoans || [])) {
        const interest = loan.remaining * 0.02;
        const payment = Math.min(loan.weekly_payment, loan.remaining + interest);
        const newRemaining = loan.remaining + interest - payment;

        // Deduct from club balance (re-fetch current balance after salary credits)
        const { data: currentFin } = await supabase
          .from('club_finances')
          .select('balance')
          .eq('club_id', club.id)
          .maybeSingle();

        if (currentFin) {
          await supabase.from('club_finances').update({
            balance: Math.max(0, (currentFin.balance || 0) - payment),
          }).eq('club_id', club.id);
        }

        if (newRemaining <= 0.01) {
          await supabase.from('loans').update({ remaining: 0, status: 'paid', paid_at: new Date().toISOString() }).eq('id', loan.id);
        } else {
          await supabase.from('loans').update({ remaining: newRemaining }).eq('id', loan.id);
        }

        console.log(`[FINANCES] Club loan payment: club=${club.name} loan=${loan.id} payment=${payment} remaining=${newRemaining}`);
      }

      processed++;
      console.log(`[FINANCES] ${club.name}: revenue=${totalRevenue} expense=${totalExpense} net=${netIncome} balance=${newBalance} players_paid=${(activeContracts || []).length}`);
    }

    // --- Process player loan payments (outside club loop) ---
    const { data: playerLoans } = await supabase
      .from('loans')
      .select('*')
      .eq('status', 'active')
      .not('player_profile_id', 'is', null);

    for (const loan of (playerLoans || [])) {
      const interest = loan.remaining * 0.02;
      const payment = Math.min(loan.weekly_payment, loan.remaining + interest);
      const newRemaining = loan.remaining + interest - payment;

      // Deduct from player money
      const { data: player } = await supabase
        .from('player_profiles')
        .select('money')
        .eq('id', loan.player_profile_id)
        .maybeSingle();

      if (player) {
        await supabase.from('player_profiles').update({
          money: Math.max(0, (player.money || 0) - payment),
        }).eq('id', loan.player_profile_id);
      }

      if (newRemaining <= 0.01) {
        await supabase.from('loans').update({ remaining: 0, status: 'paid', paid_at: new Date().toISOString() }).eq('id', loan.id);
      } else {
        await supabase.from('loans').update({ remaining: newRemaining }).eq('id', loan.id);
      }

      console.log(`[FINANCES] Player loan payment: player=${loan.player_profile_id} loan=${loan.id} payment=${payment} remaining=${newRemaining}`);
    }

    return new Response(JSON.stringify({ status: 'processed', clubs_processed: processed, player_loans_processed: (playerLoans || []).length }), {
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
