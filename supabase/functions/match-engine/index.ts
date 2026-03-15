import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000; // 6 seconds per phase
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

// Simple bot decision engine
function botDecideAction(participant: any, phase: string, isBallHolder: boolean): string {
  if (isBallHolder) {
    // Ball holder actions
    const rand = Math.random();
    if (rand < 0.4) return 'pass_low';
    if (rand < 0.65) return 'move';
    if (rand < 0.85) return 'pass_high';
    return 'shoot';
  }
  // Off-ball actions depend on team side
  if (phase === 'attacking_support') {
    return Math.random() < 0.6 ? 'move' : 'pass_low';
  }
  if (phase === 'defending_response') {
    const rand = Math.random();
    if (rand < 0.4) return 'press';
    if (rand < 0.7) return 'intercept';
    return 'block_lane';
  }
  return 'move';
}

// Simple resolution: returns { success, event_type, description, possession_change, goal }
function resolveAction(action: string, attacker: any, defender: any): {
  success: boolean;
  event: string;
  description: string;
  possession_change: boolean;
  goal: boolean;
} {
  const rand = Math.random();
  
  if (action === 'shoot') {
    const success = rand < 0.25; // 25% base shot success
    return {
      success,
      event: success ? 'goal' : 'save',
      description: success ? '⚽ GOL!' : '🧤 Defesa do goleiro',
      possession_change: !success,
      goal: success,
    };
  }
  
  if (action === 'pass_low') {
    const success = rand < 0.75;
    return {
      success,
      event: success ? 'pass_complete' : 'pass_intercepted',
      description: success ? '✅ Passe baixo completo' : '❌ Passe interceptado',
      possession_change: !success,
      goal: false,
    };
  }
  
  if (action === 'pass_high') {
    const success = rand < 0.55;
    return {
      success,
      event: success ? 'pass_complete' : 'pass_intercepted',
      description: success ? '✅ Passe longo completo' : '❌ Passe longo interceptado',
      possession_change: !success,
      goal: false,
    };
  }
  
  if (action === 'move' || action === 'press' || action === 'intercept' || action === 'block_lane') {
    return {
      success: true,
      event: action,
      description: `🔄 ${action === 'move' ? 'Movimentação' : action === 'press' : 'Pressão' : action === 'intercept' ? 'Interceptação' : 'Bloqueio de linha'}`,
      possession_change: action === 'intercept' && rand < 0.3,
      goal: false,
    };
  }
  
  return { success: true, event: 'move', description: '🔄 Movimentação', possession_change: false, goal: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { match_id, action } = body;

    // ─── AUTO-START: promote scheduled matches that are past their scheduled_at ───
    if (action === 'auto_start' || !action) {
      const now = new Date().toISOString();
      const { data: dueMatches } = await supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, home_lineup_id, away_lineup_id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now);

      const started: string[] = [];

      for (const m of (dueMatches || [])) {
        // Pick random possession to start
        const possessionClubId = Math.random() < 0.5 ? m.home_club_id : m.away_club_id;

        // Get ball holder participant (first player of possession team)
        const { data: ballHolderPart } = await supabase
          .from('match_participants')
          .select('id')
          .eq('match_id', m.id)
          .eq('club_id', possessionClubId)
          .eq('role_type', 'player')
          .limit(1)
          .single();

        // Update match to live
        await supabase.from('matches').update({
          status: 'live',
          started_at: now,
          current_phase: 'ball_holder',
          current_turn_number: 1,
          possession_club_id: possessionClubId,
        }).eq('id', m.id);

        // Create first turn
        const phaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();
        await supabase.from('match_turns').insert({
          match_id: m.id,
          turn_number: 1,
          phase: 'ball_holder',
          possession_club_id: possessionClubId,
          ball_holder_participant_id: ballHolderPart?.id || null,
          started_at: now,
          ends_at: phaseEnd,
          status: 'active',
        });

        // Log event
        await supabase.from('match_event_logs').insert({
          match_id: m.id,
          event_type: 'kickoff',
          title: '⚽ Partida iniciada!',
          body: 'A bola está rolando. Bots controlam todos os atletas por padrão.',
        });

        started.push(m.id);
      }

      if (!match_id) {
        return new Response(JSON.stringify({ started }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── TICK: advance a specific match turn ───
    if (action === 'tick' && match_id) {
      const { data: match } = await supabase
        .from('matches')
        .select('*')
        .eq('id', match_id)
        .eq('status', 'live')
        .single();

      if (!match) {
        return new Response(JSON.stringify({ error: 'Match not found or not live' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get active turn
      const { data: activeTurn } = await supabase
        .from('match_turns')
        .select('*')
        .eq('match_id', match_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const now = new Date();
      const endsAt = new Date(activeTurn.ends_at);

      // Not expired yet
      if (now < endsAt) {
        return new Response(JSON.stringify({ status: 'waiting', remaining_ms: endsAt.getTime() - now.getTime() }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all participants
      const { data: participants } = await supabase
        .from('match_participants')
        .select('*')
        .eq('match_id', match_id)
        .eq('role_type', 'player');

      // Get existing human actions for this turn
      const { data: humanActions } = await supabase
        .from('match_actions')
        .select('*')
        .eq('match_turn_id', activeTurn.id)
        .neq('controlled_by_type', 'bot')
        .eq('status', 'pending');

      const humanActionMap = new Map((humanActions || []).map(a => [a.participant_id, a]));

      // Determine possession
      const possClubId = activeTurn.possession_club_id;
      const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
      const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);

      // Ball holder: participant with ball
      const ballHolder = activeTurn.ball_holder_participant_id
        ? (participants || []).find(p => p.id === activeTurn.ball_holder_participant_id)
        : possPlayers[0];

      // Generate bot actions for anyone who hasn't acted
      const actionsToInsert: any[] = [];
      
      for (const p of (participants || [])) {
        if (humanActionMap.has(p.id)) continue; // human already acted
        const isBH = p.id === ballHolder?.id;
        const phase = activeTurn.phase;
        const isAttacking = p.club_id === possClubId;
        
        // Only ball holder acts in ball_holder phase; others in their respective phases
        if (phase === 'ball_holder' && !isBH) continue;
        if (phase === 'attacking_support' && (!isAttacking || isBH)) continue;
        if (phase === 'defending_response' && isAttacking) continue;
        
        actionsToInsert.push({
          match_id,
          match_turn_id: activeTurn.id,
          participant_id: p.id,
          controlled_by_type: 'bot',
          controlled_by_user_id: null,
          action_type: botDecideAction(p, phase, isBH),
          status: 'pending',
        });
      }

      if (actionsToInsert.length > 0) {
        await supabase.from('match_actions').insert(actionsToInsert);
      }

      // ── RESOLUTION ──
      let newPossessionClubId = possClubId;
      let homeScore = match.home_score;
      let awayScore = match.away_score;
      let nextBallHolderParticipantId = ballHolder?.id || null;

      if (activeTurn.phase === 'resolution') {
        // Get final decisive action (priority: player > manager > bot)
        const { data: allActions } = await supabase
          .from('match_actions')
          .select('*')
          .eq('match_turn_id', activeTurn.id)
          .eq('status', 'pending');

        const ballHolderAction = (allActions || [])
          .filter(a => a.participant_id === ballHolder?.id)
          .sort((a, b) => {
            const priority = { player: 0, manager: 1, bot: 2 };
            return (priority[a.controlled_by_type as keyof typeof priority] ?? 2) -
                   (priority[b.controlled_by_type as keyof typeof priority] ?? 2);
          })[0];

        if (ballHolderAction) {
          const defender = defPlayers[0]; // simplified
          const result = resolveAction(ballHolderAction.action_type, ballHolder, defender);

          if (result.goal) {
            if (possClubId === match.home_club_id) homeScore++;
            else awayScore++;

            await supabase.from('match_event_logs').insert({
              match_id,
              event_type: 'goal',
              title: `⚽ GOL! ${homeScore} – ${awayScore}`,
              body: `Turno ${match.current_turn_number}`,
            });
          } else if (result.possession_change) {
            newPossessionClubId = defPlayers[0]?.club_id || possClubId;
            nextBallHolderParticipantId = defPlayers[0]?.id || null;

            await supabase.from('match_event_logs').insert({
              match_id,
              event_type: 'possession_change',
              title: '🔄 Troca de posse',
              body: result.description,
            });
          } else {
            // Possession maintained — pick new ball holder in same team
            const samePlayers = possPlayers.filter(p => p.id !== ballHolder?.id);
            if (ballHolderAction.target_participant_id) {
              nextBallHolderParticipantId = ballHolderAction.target_participant_id;
            } else if (samePlayers.length > 0) {
              nextBallHolderParticipantId = samePlayers[Math.floor(Math.random() * samePlayers.length)].id;
            }
          }

          // Mark all actions used/overridden
          const usedIds = (allActions || [])
            .filter(a => a.participant_id === ballHolder?.id && a.id !== ballHolderAction.id)
            .map(a => a.id);

          await supabase.from('match_actions')
            .update({ status: 'used' })
            .eq('id', ballHolderAction.id);

          if (usedIds.length > 0) {
            await supabase.from('match_actions')
              .update({ status: 'overridden' })
              .in('id', usedIds);
          }
        }

        // ── Advance to next turn ──
        const newTurnNumber = match.current_turn_number + 1;
        const MAX_TURNS = 40;

        // Mark current turn resolved
        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        if (newTurnNumber > MAX_TURNS) {
          // Finish match
          await supabase.from('matches').update({
            status: 'finished',
            finished_at: new Date().toISOString(),
            home_score: homeScore,
            away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_event_logs').insert({
            match_id,
            event_type: 'final_whistle',
            title: `🏁 Apito final! ${homeScore} – ${awayScore}`,
            body: 'Partida encerrada.',
          });
        } else {
          // Create next turn starting with ball_holder phase
          const nextPhaseStart = new Date().toISOString();
          const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

          await supabase.from('matches').update({
            current_turn_number: newTurnNumber,
            current_phase: 'ball_holder',
            possession_club_id: newPossessionClubId,
            home_score: homeScore,
            away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_turns').insert({
            match_id,
            turn_number: newTurnNumber,
            phase: 'ball_holder',
            possession_club_id: newPossessionClubId,
            ball_holder_participant_id: nextBallHolderParticipantId,
            started_at: nextPhaseStart,
            ends_at: nextPhaseEnd,
            status: 'active',
          });
        }
      } else {
        // Advance to next phase within same turn
        const currentPhaseIndex = PHASES.indexOf(activeTurn.phase as Phase);
        const nextPhase = PHASES[currentPhaseIndex + 1] || 'resolution';

        const nextPhaseStart = new Date().toISOString();
        const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        await supabase.from('matches').update({
          current_phase: nextPhase,
        }).eq('id', match_id);

        await supabase.from('match_turns').insert({
          match_id,
          turn_number: activeTurn.turn_number,
          phase: nextPhase,
          possession_club_id: possClubId,
          ball_holder_participant_id: activeTurn.ball_holder_participant_id,
          started_at: nextPhaseStart,
          ends_at: nextPhaseEnd,
          status: 'active',
        });
      }

      return new Response(JSON.stringify({ status: 'advanced' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── SUBMIT HUMAN ACTION ───
    if (action === 'submit_action' && match_id) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { participant_id, action_type, target_participant_id, controlled_by_type } = body;

      // Get active turn
      const { data: activeTurn } = await supabase
        .from('match_turns')
        .select('id')
        .eq('match_id', match_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify participant ownership: player owns their own participant; manager owns any in their club
      const { data: participant } = await supabase
        .from('match_participants')
        .select('*, matches!inner(home_club_id, away_club_id)')
        .eq('id', participant_id)
        .single();

      const isOwnParticipant = participant?.connected_user_id === user.id;
      
      // Check if manager of that club
      const { data: managerClub } = await supabase
        .from('clubs')
        .select('id')
        .eq('manager_profile_id', (await supabase.from('manager_profiles').select('id').eq('user_id', user.id).single()).data?.id || '')
        .single();
      
      const isManagerOfClub = managerClub?.id === participant?.club_id;

      if (!isOwnParticipant && !isManagerOfClub) {
        return new Response(JSON.stringify({ error: 'Not authorized to control this participant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const byType = isOwnParticipant ? 'player' : 'manager';

      await supabase.from('match_actions').insert({
        match_id,
        match_turn_id: activeTurn.id,
        participant_id,
        controlled_by_type: byType,
        controlled_by_user_id: user.id,
        action_type,
        target_participant_id: target_participant_id || null,
        status: 'pending',
      });

      return new Response(JSON.stringify({ status: 'action_submitted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
