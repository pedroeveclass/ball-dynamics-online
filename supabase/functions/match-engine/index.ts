import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000;
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

function botDecideAction(participant: any, phase: string, isBallHolder: boolean): { action: string; target_x?: number; target_y?: number } {
  const px = participant.pos_x ?? 50;
  const py = participant.pos_y ?? 50;

  if (isBallHolder) {
    const rand = Math.random();
    if (rand < 0.5) {
      // Move with ball - small random displacement
      const dx = (Math.random() - 0.3) * 10;
      const dy = (Math.random() - 0.5) * 10;
      return { action: 'move', target_x: Math.max(2, Math.min(98, px + dx)), target_y: Math.max(2, Math.min(98, py + dy)) };
    }
    if (rand < 0.8) return { action: 'pass_low', target_x: px + (Math.random() - 0.3) * 15, target_y: py + (Math.random() - 0.5) * 20 };
    return { action: 'shoot', target_x: 98, target_y: 40 + Math.random() * 20 };
  }

  // Off-ball: move or stay
  if (Math.random() < 0.6) {
    const dx = (Math.random() - 0.5) * 8;
    const dy = (Math.random() - 0.5) * 8;
    return { action: 'move', target_x: Math.max(2, Math.min(98, px + dx)), target_y: Math.max(2, Math.min(98, py + dy)) };
  }
  // No action = stay in place
  return { action: 'move', target_x: px, target_y: py };
}

function resolveAction(action: string, _attacker: any, _defender: any): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
} {
  const rand = Math.random();
  if (action === 'shoot') {
    const success = rand < 0.25;
    return { success, event: success ? 'goal' : 'save', description: success ? '⚽ GOL!' : '🧤 Defesa do goleiro', possession_change: !success, goal: success };
  }
  if (action === 'pass_low') {
    const success = rand < 0.75;
    return { success, event: success ? 'pass_complete' : 'pass_intercepted', description: success ? '✅ Passe baixo completo' : '❌ Passe interceptado', possession_change: !success, goal: false };
  }
  if (action === 'pass_high') {
    const success = rand < 0.55;
    return { success, event: success ? 'pass_complete' : 'pass_intercepted', description: success ? '✅ Passe longo completo' : '❌ Passe longo interceptado', possession_change: !success, goal: false };
  }
  if (action === 'move' || action === 'press' || action === 'intercept' || action === 'block_lane') {
    return { success: true, event: action, description: `🔄 ${action === 'move' ? 'Movimentação' : action === 'press' ? 'Pressão' : action === 'intercept' ? 'Interceptação' : 'Bloqueio de linha'}`, possession_change: action === 'intercept' && rand < 0.3, goal: false };
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

    // ─── FINISH MATCH ───
    if (action === 'finish_match' && match_id) {
      const { data: match } = await supabase
        .from('matches').select('*').eq('id', match_id).single();
      if (!match) {
        return new Response(JSON.stringify({ error: 'Match not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Resolve any active turns
      await supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('match_id', match_id).eq('status', 'active');

      await supabase.from('matches').update({
        status: 'finished',
        finished_at: new Date().toISOString(),
      }).eq('id', match_id);

      await supabase.from('match_event_logs').insert({
        match_id,
        event_type: 'final_whistle',
        title: `🏁 Apito final! ${match.home_score} – ${match.away_score}`,
        body: 'Partida encerrada manualmente.',
      });

      return new Response(JSON.stringify({ status: 'finished' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── AUTO-START ───
    if (action === 'auto_start' || !action) {
      const now = new Date().toISOString();
      const { data: dueMatches } = await supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, home_lineup_id, away_lineup_id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now);

      const started: string[] = [];

      for (const m of (dueMatches || [])) {
        const possessionClubId = Math.random() < 0.5 ? m.home_club_id : m.away_club_id;

        const { data: ballHolderPart } = await supabase
          .from('match_participants')
          .select('id')
          .eq('match_id', m.id)
          .eq('club_id', possessionClubId)
          .eq('role_type', 'player')
          .limit(1)
          .single();

        await supabase.from('matches').update({
          status: 'live',
          started_at: now,
          current_phase: 'ball_holder',
          current_turn_number: 1,
          possession_club_id: possessionClubId,
        }).eq('id', m.id);

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

        await supabase.from('match_event_logs').insert({
          match_id: m.id,
          event_type: 'kickoff',
          title: '⚽ Partida iniciada!',
          body: 'A bola está rolando.',
        });

        started.push(m.id);
      }

      if (!match_id) {
        return new Response(JSON.stringify({ started }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ─── TICK ───
    if (action === 'tick' && match_id) {
      const { data: match } = await supabase
        .from('matches').select('*').eq('id', match_id).eq('status', 'live').single();

      if (!match) {
        return new Response(JSON.stringify({ error: 'Match not found or not live' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: activeTurn } = await supabase
        .from('match_turns').select('*').eq('match_id', match_id).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).single();

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const now = new Date();
      const endsAt = new Date(activeTurn.ends_at);

      if (now < endsAt) {
        return new Response(JSON.stringify({ status: 'waiting', remaining_ms: endsAt.getTime() - now.getTime() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: participants } = await supabase
        .from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player');

      const { data: humanActions } = await supabase
        .from('match_actions').select('*').eq('match_turn_id', activeTurn.id)
        .neq('controlled_by_type', 'bot').eq('status', 'pending');

      const humanActionMap = new Map((humanActions || []).map(a => [a.participant_id, a]));

      const possClubId = activeTurn.possession_club_id;
      const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
      const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);

      const ballHolder = activeTurn.ball_holder_participant_id
        ? (participants || []).find(p => p.id === activeTurn.ball_holder_participant_id)
        : possPlayers[0];

      // No bot actions - humans only. If no action submitted, player stays in place (no-op).

      // ── RESOLUTION ──
      let newPossessionClubId = possClubId;
      let homeScore = match.home_score;
      let awayScore = match.away_score;
      let nextBallHolderParticipantId = ballHolder?.id || null;

      if (activeTurn.phase === 'resolution') {
        // Apply all move actions: update participant positions
        const { data: allActions } = await supabase
          .from('match_actions').select('*').eq('match_turn_id', activeTurn.id).eq('status', 'pending');

        // Update positions for all move actions
        for (const a of (allActions || [])) {
          if (a.target_x != null && a.target_y != null) {
            await supabase.from('match_participants').update({
              pos_x: a.target_x,
              pos_y: a.target_y,
            }).eq('id', a.participant_id);
          }
        }

        // Resolve ball holder action
        const ballHolderAction = (allActions || [])
          .filter(a => a.participant_id === ballHolder?.id)
          .sort((a, b) => {
            const priority = { player: 0, manager: 1, bot: 2 };
            return (priority[a.controlled_by_type as keyof typeof priority] ?? 2) -
                   (priority[b.controlled_by_type as keyof typeof priority] ?? 2);
          })[0];

        if (ballHolderAction) {
          const defender = defPlayers[0];
          const result = resolveAction(ballHolderAction.action_type, ballHolder, defender);

          if (result.goal) {
            if (possClubId === match.home_club_id) homeScore++;
            else awayScore++;

            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'goal',
              title: `⚽ GOL! ${homeScore} – ${awayScore}`,
              body: `Turno ${match.current_turn_number}`,
            });
          } else if (result.possession_change) {
            newPossessionClubId = defPlayers[0]?.club_id || possClubId;
            nextBallHolderParticipantId = defPlayers[0]?.id || null;

            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'possession_change',
              title: '🔄 Troca de posse',
              body: result.description,
            });
          } else {
            const samePlayers = possPlayers.filter(p => p.id !== ballHolder?.id);
            if (ballHolderAction.target_participant_id) {
              nextBallHolderParticipantId = ballHolderAction.target_participant_id;
            } else if (samePlayers.length > 0) {
              nextBallHolderParticipantId = samePlayers[Math.floor(Math.random() * samePlayers.length)].id;
            }
          }

          // Mark actions
          const usedIds = (allActions || [])
            .filter(a => a.participant_id === ballHolder?.id && a.id !== ballHolderAction.id)
            .map(a => a.id);

          await supabase.from('match_actions').update({ status: 'used' }).eq('id', ballHolderAction.id);

          if (usedIds.length > 0) {
            await supabase.from('match_actions').update({ status: 'overridden' }).in('id', usedIds);
          }

          // Mark all other pending actions as used
          const remainingPending = (allActions || []).filter(a => a.id !== ballHolderAction.id && !usedIds.includes(a.id)).map(a => a.id);
          if (remainingPending.length > 0) {
            await supabase.from('match_actions').update({ status: 'used' }).in('id', remainingPending);
          }
        }

        // ── Advance to next turn ──
        const newTurnNumber = match.current_turn_number + 1;
        const MAX_TURNS = 40;

        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        if (newTurnNumber > MAX_TURNS) {
          await supabase.from('matches').update({
            status: 'finished', finished_at: new Date().toISOString(),
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'final_whistle',
            title: `🏁 Apito final! ${homeScore} – ${awayScore}`,
            body: 'Partida encerrada.',
          });
        } else {
          const nextPhaseStart = new Date().toISOString();
          const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

          await supabase.from('matches').update({
            current_turn_number: newTurnNumber,
            current_phase: 'ball_holder',
            possession_club_id: newPossessionClubId,
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_turns').insert({
            match_id, turn_number: newTurnNumber,
            phase: 'ball_holder',
            possession_club_id: newPossessionClubId,
            ball_holder_participant_id: nextBallHolderParticipantId,
            started_at: nextPhaseStart, ends_at: nextPhaseEnd,
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

        await supabase.from('matches').update({ current_phase: nextPhase }).eq('id', match_id);

        await supabase.from('match_turns').insert({
          match_id, turn_number: activeTurn.turn_number,
          phase: nextPhase,
          possession_club_id: possClubId,
          ball_holder_participant_id: activeTurn.ball_holder_participant_id,
          started_at: nextPhaseStart, ends_at: nextPhaseEnd,
          status: 'active',
        });
      }

      return new Response(JSON.stringify({ status: 'advanced' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── SUBMIT HUMAN ACTION ───
    if (action === 'submit_action' && match_id) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { participant_id, action_type, target_participant_id, target_x, target_y } = body;

      const { data: activeTurn } = await supabase
        .from('match_turns').select('id').eq('match_id', match_id).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).single();

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: participant } = await supabase
        .from('match_participants')
        .select('*, matches!inner(home_club_id, away_club_id)')
        .eq('id', participant_id).single();

      const isOwnParticipant = participant?.connected_user_id === user.id;

      const { data: managerClub } = await supabase
        .from('clubs').select('id')
        .eq('manager_profile_id', (await supabase.from('manager_profiles').select('id').eq('user_id', user.id).single()).data?.id || '')
        .single();

      const isManagerOfClub = managerClub?.id === participant?.club_id;

      if (!isOwnParticipant && !isManagerOfClub) {
        return new Response(JSON.stringify({ error: 'Not authorized to control this participant' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        target_x: target_x ?? null,
        target_y: target_y ?? null,
        status: 'pending',
      });

      return new Response(JSON.stringify({ status: 'action_submitted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
