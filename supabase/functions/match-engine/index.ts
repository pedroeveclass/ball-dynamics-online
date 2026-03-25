// ═══════════════════════════════════════════════════════════════════
// ENGINE DESATIVADA / LEGACY
// ═══════════════════════════════════════════════════════════════════
// Esta engine foi desativada. Toda a lógica de jogo foi centralizada
// em "match-engine-lab", que é agora a engine principal para todos
// os modos de jogo (3x3, 11x11, amistosos, oficiais).
//
// Este arquivo redireciona todas as chamadas para match-engine-lab.
// O código original foi preservado em index.ts.legacy.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const body = await req.json().catch(() => ({}));

    // Forward all requests to match-engine-lab
    const labUrl = `${supabaseUrl}/functions/v1/match-engine-lab`;
    const response = await fetch(labUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': req.headers.get('Authorization') || `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.text();
    return new Response(result, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[LEGACY ENGINE] Redirect error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
