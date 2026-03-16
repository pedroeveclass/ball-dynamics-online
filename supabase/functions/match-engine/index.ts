import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000;
const RESOLUTION_PHASE_DURATION_MS = 3000;
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

// No bot actions - humans only

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
} {
  if (action === 'shoot') {
    // Check if any player has a "receive" (dominar bola) action that intercepts the shot path
    const interceptor = findInterceptor(allActions, _attacker, participants);
    if (interceptor) {
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada!`, possession_change: interceptor.club_id !== possClubId, goal: false, newBallHolderId: interceptor.id, newPossessionClubId: interceptor.club_id };
    }
    // No interceptor → goal
    return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true };
  }
  if (action === 'pass_low' || action === 'pass_high') {
    // Check for interceptor along the pass path
    const interceptor = findInterceptor(allActions, _attacker, participants);
    if (interceptor) {
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada!`, possession_change: interceptor.club_id !== possClubId, goal: false, newBallHolderId: interceptor.id, newPossessionClubId: interceptor.club_id };
    }
    // Pass succeeds - find nearest player to target
    return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  }
  if (action === 'move') {
    return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
  }
  return { success: true, event: 'no_action', description: '🔄 Sem ação', possession_change: false, goal: false };
}

// Find the closest interceptor (player who moved onto the ball path and chose "dominar bola" or just moved there)
function findInterceptor(allActions: any[], ballHolderAction: any, participants: any[]): any | null {
  if (!ballHolderAction || ballHolderAction.target_x == null || ballHolderAction.target_y == null) return null;
  const bh = participants.find((p: any) => p.id === ballHolderAction.participant_id);
  if (!bh) return null;

  const startX = bh.pos_x ?? 50;
  const startY = bh.pos_y ?? 50;
  const endX = ballHolderAction.target_x;
  const endY = ballHolderAction.target_y;

  // Find players who moved onto the ball path
  const interceptors: Array<{ participant: any; progress: number }> = [];
  for (const a of allActions) {
    if (a.participant_id === ballHolderAction.participant_id) continue;
    if (a.action_type !== 'move' || a.target_x == null || a.target_y == null) continue;

    // Check if their move target is close to the ball path
    const dx = endX - startX;
    const dy = endY - startY;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((a.target_x - startX) * dx + (a.target_y - startY) * dy) / len2));
    const cx = startX + dx * t;
    const cy = startY + dy * t;
    const dist = Math.sqrt((a.target_x - cx) ** 2 + (a.target_y - cy) ** 2);

    if (dist <= 4) { // Close enough to intercept
      interceptors.push({ participant: participants.find((p: any) => p.id === a.participant_id), progress: t });
    }
  }

  if (interceptors.length === 0) return null;
  // Closest to the start of the ball path gets priority
  interceptors.sort((a, b) => a.progress - b.progress);
  return interceptors[0].participant;
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
        // Get ALL turn row IDs for this turn number (phases 1-4)
        const { data: turnRows } = await supabase
          .from('match_turns')
          .select('id')
          .eq('match_id', match_id)
          .eq('turn_number', activeTurn.turn_number);

        const allTurnIds = (turnRows || []).map(t => t.id);

        // Get all pending actions across ALL phases of this turn
        const { data: rawActions } = await supabase
          .from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending')
          .order('created_at', { ascending: false });

        // Deduplicate: keep only the LATEST action per participant (allows re-submission)
        const seenParticipants = new Set<string>();
        const allActions = (rawActions || []).filter(a => {
          if (seenParticipants.has(a.participant_id)) return false;
          seenParticipants.add(a.participant_id);
          return true;
        });

        // Update positions for all move actions
        for (const a of allActions) {
          if (a.action_type === 'move' && a.target_x != null && a.target_y != null) {
            await supabase.from('match_participants').update({
              pos_x: a.target_x,
              pos_y: a.target_y,
            }).eq('id', a.participant_id);
          }
        }

        // Resolve ball holder action
        const ballHolderAction = allActions
          .find(a => a.participant_id === ballHolder?.id);

        if (ballHolderAction) {
          const result = resolveAction(ballHolderAction.action_type, ballHolderAction, null, allActions, participants || [], possClubId || '');

          if (result.goal) {
            if (possClubId === match.home_club_id) homeScore++;
            else awayScore++;

            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'goal',
              title: `⚽ GOL! ${homeScore} – ${awayScore}`,
              body: `Turno ${match.current_turn_number}`,
            });

            // After goal, possession goes to the other team
            newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
            const otherTeamPlayers = (participants || []).filter(p => p.club_id === newPossessionClubId);
            nextBallHolderParticipantId = otherTeamPlayers[0]?.id || null;
          } else if (result.newBallHolderId) {
            // Intercepted - ball goes to the interceptor
            nextBallHolderParticipantId = result.newBallHolderId;
            newPossessionClubId = result.newPossessionClubId || possClubId;

            await supabase.from('match_event_logs').insert({
              match_id, event_type: result.possession_change ? 'possession_change' : 'pass_complete',
              title: result.possession_change ? '🔄 Troca de posse - Bola dominada!' : '🤲 Bola dominada!',
              body: result.description,
            });
          } else if (ballHolderAction.action_type === 'pass_low' || ballHolderAction.action_type === 'pass_high') {
            // Pass succeeded without interception - find nearest player to target
            if (ballHolderAction.target_participant_id) {
              nextBallHolderParticipantId = ballHolderAction.target_participant_id;
            } else if (ballHolderAction.target_x != null && ballHolderAction.target_y != null) {
              // Find closest player to pass target
              let closestDist = Infinity;
              let closestId: string | null = null;
              for (const p of (participants || [])) {
                if (p.id === ballHolder?.id) continue;
                const moveAction = allActions.find(a => a.participant_id === p.id && a.action_type === 'move');
                const px = moveAction?.target_x ?? p.pos_x ?? 50;
                const py = moveAction?.target_y ?? p.pos_y ?? 50;
                const dist = Math.sqrt((px - ballHolderAction.target_x) ** 2 + (py - ballHolderAction.target_y) ** 2);
                if (dist < closestDist) {
                  closestDist = dist;
                  closestId = p.id;
                }
              }
              if (closestId) {
                nextBallHolderParticipantId = closestId;
                const closestPlayer = (participants || []).find(p => p.id === closestId);
                if (closestPlayer && closestPlayer.club_id !== possClubId) {
                  newPossessionClubId = closestPlayer.club_id;
                  await supabase.from('match_event_logs').insert({
                    match_id, event_type: 'possession_change',
                    title: '🔄 Troca de posse',
                    body: 'Passe interceptado pelo adversário mais próximo.',
                  });
                }
              }
            }
          } else if (ballHolderAction.action_type === 'move') {
            // Ball holder moved with ball - they keep it
            nextBallHolderParticipantId = ballHolder?.id || null;
          }
        }

        // Mark ALL raw actions for this turn as used/overridden
        const allRawIds = (rawActions || []).map(a => a.id);
        if (allRawIds.length > 0) {
          const usedIds = allActions.map(a => a.id);
          const overriddenIds = allRawIds.filter(id => !usedIds.includes(id));
          if (usedIds.length > 0) await supabase.from('match_actions').update({ status: 'used' }).in('id', usedIds);
          if (overriddenIds.length > 0) await supabase.from('match_actions').update({ status: 'overridden' }).in('id', overriddenIds);
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
        const phaseDuration = nextPhase === 'resolution' ? RESOLUTION_PHASE_DURATION_MS : PHASE_DURATION_MS;
        const nextPhaseEnd = new Date(Date.now() + phaseDuration).toISOString();

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

      // Check if this is a test match (<=4 players total) - manager who created it can control all players
      const { data: allParts } = await supabase
        .from('match_participants').select('id').eq('match_id', match_id).eq('role_type', 'player');
      const isTestMatch = (allParts || []).length <= 4;

      // In test matches, the manager of either club can control ALL participants (both teams)
      const isManagerOfMatch = isTestMatch && (
        managerClub?.id === (participant as any)?.matches?.home_club_id ||
        managerClub?.id === (participant as any)?.matches?.away_club_id
      );

      if (!isOwnParticipant && !isManagerOfClub && !isManagerOfMatch) {
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
