import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000;
const RESOLUTION_PHASE_DURATION_MS = 3000;
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
} {
  if (action === 'shoot') {
    const interceptor = findInterceptor(allActions, _attacker, participants);
    if (interceptor) {
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada!`, possession_change: interceptor.club_id !== possClubId, goal: false, newBallHolderId: interceptor.id, newPossessionClubId: interceptor.club_id };
    }
    return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true };
  }
  if (action === 'pass_low' || action === 'pass_high') {
    const interceptor = findInterceptor(allActions, _attacker, participants);
    if (interceptor) {
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada!`, possession_change: interceptor.club_id !== possClubId, goal: false, newBallHolderId: interceptor.id, newPossessionClubId: interceptor.club_id };
    }
    return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  }
  if (action === 'move') {
    const interceptor = findInterceptor(allActions, _attacker, participants);
    if (interceptor && interceptor.club_id !== possClubId) {
      return { success: false, event: 'intercepted', description: '🤲 Roubo de bola!', possession_change: true, goal: false, newBallHolderId: interceptor.id, newPossessionClubId: interceptor.club_id };
    }
    return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
  }
  return { success: true, event: 'no_action', description: '🔄 Sem ação', possession_change: false, goal: false };
}

function findInterceptor(allActions: any[], ballHolderAction: any, participants: any[]): any | null {
  if (!ballHolderAction || ballHolderAction.target_x == null || ballHolderAction.target_y == null) return null;
  const bh = participants.find((p: any) => p.id === ballHolderAction.participant_id);
  if (!bh) return null;

  const startX = bh.pos_x ?? 50;
  const startY = bh.pos_y ?? 50;
  const endX = ballHolderAction.target_x;
  const endY = ballHolderAction.target_y;

  const interceptors: Array<{ participant: any; progress: number }> = [];
  for (const a of allActions) {
    if (a.participant_id === ballHolderAction.participant_id) continue;
    // Only explicit 'receive' actions should dominate/intercept the ball path
    if (a.action_type !== 'receive' || a.target_x == null || a.target_y == null) continue;

    const dx = endX - startX;
    const dy = endY - startY;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((a.target_x - startX) * dx + (a.target_y - startY) * dy) / len2));
    const cx = startX + dx * t;
    const cy = startY + dy * t;
    const dist = Math.sqrt((a.target_x - cx) ** 2 + (a.target_y - cy) ** 2);

    const threshold = 2;
    if (dist <= threshold) {
      interceptors.push({ participant: participants.find((p: any) => p.id === a.participant_id), progress: t });
    }
  }

  if (interceptors.length === 0) return null;
  interceptors.sort((a, b) => a.progress - b.progress);
  return interceptors[0].participant;
}

const KICKOFF_X = 50;
const KICKOFF_Y = 50;

async function pickCenterKickoffPlayer(supabase: any, matchId: string, clubId: string, seededParticipants?: any[]): Promise<string | null> {
  let candidates = (seededParticipants || []).filter((p: any) => p.club_id === clubId && p.role_type === 'player');

  if (candidates.length === 0) {
    const { data } = await supabase
      .from('match_participants')
      .select('id, club_id, role_type, pos_x, pos_y, created_at')
      .eq('match_id', matchId)
      .eq('club_id', clubId)
      .eq('role_type', 'player');
    candidates = data || [];
  }

  if (candidates.length === 0) return null;

  candidates.sort((a: any, b: any) => {
    const distA = ((a.pos_x ?? KICKOFF_X) - KICKOFF_X) ** 2 + ((a.pos_y ?? KICKOFF_Y) - KICKOFF_Y) ** 2;
    const distB = ((b.pos_x ?? KICKOFF_X) - KICKOFF_X) ** 2 + ((b.pos_y ?? KICKOFF_Y) - KICKOFF_Y) ** 2;
    if (distA !== distB) return distA - distB;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });

  const chosen = candidates[0];
  await supabase.from('match_participants').update({ pos_x: KICKOFF_X, pos_y: KICKOFF_Y }).eq('id', chosen.id);
  return chosen.id;
}

function findLooseBallClaimer(allActions: any[], participants: any[]): any | null {
  const receiveActions = allActions.filter((a) => a.action_type === 'receive' && a.target_x != null && a.target_y != null);
  const ranked: Array<{ participant: any; distance: number; createdAt: number }> = [];

  for (const action of receiveActions) {
    const participant = participants.find((p: any) => p.id === action.participant_id);
    if (!participant) continue;

    const startX = participant.pos_x ?? 50;
    const startY = participant.pos_y ?? 50;
    ranked.push({
      participant,
      distance: Math.sqrt((action.target_x - startX) ** 2 + (action.target_y - startY) ** 2),
      createdAt: new Date(action.created_at || 0).getTime(),
    });
  }

  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.distance - b.distance || a.createdAt - b.createdAt);
  return ranked[0].participant;
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
        const possessionClubId = m.home_club_id;
        const ballHolderParticipantId = await pickCenterKickoffPlayer(supabase, m.id, possessionClubId);

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
          ball_holder_participant_id: ballHolderParticipantId,
          started_at: now,
          ends_at: phaseEnd,
          status: 'active',
        });

        await supabase.from('match_event_logs').insert({
          match_id: m.id,
          event_type: 'kickoff',
          title: '⚽ Partida iniciada!',
          body: 'Time da casa começa com a bola no meio-campo.',
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

      const possClubId = activeTurn.possession_club_id;
      const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
      const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);

      const ballHolder = activeTurn.ball_holder_participant_id
        ? (participants || []).find(p => p.id === activeTurn.ball_holder_participant_id)
        : null;

      const isLooseBall = !activeTurn.ball_holder_participant_id;

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

        const { data: rawActions } = await supabase
          .from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending')
          .order('created_at', { ascending: false });

        // Deduplicate: keep only the LATEST action per participant
        const seenParticipants = new Set<string>();
        const allActions = (rawActions || []).filter(a => {
          if (seenParticipants.has(a.participant_id)) return false;
          seenParticipants.add(a.participant_id);
          return true;
        });

        // Update positions for all move/receive actions
        for (const a of allActions) {
          if ((a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null) {
            await supabase.from('match_participants').update({
              pos_x: a.target_x,
              pos_y: a.target_y,
            }).eq('id', a.participant_id);
          }
        }

        if (ballHolder) {
          // Resolve ball holder action
          const ballHolderAction = allActions
            .find(a => a.participant_id === ballHolder.id);

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

              // After goal, restart from midfield with the team that conceded
              newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
              nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
            } else if (result.newBallHolderId) {
              nextBallHolderParticipantId = result.newBallHolderId;
              newPossessionClubId = result.newPossessionClubId || possClubId;

              await supabase.from('match_event_logs').insert({
                match_id, event_type: result.possession_change ? 'possession_change' : 'pass_complete',
                title: result.possession_change ? '🔄 Troca de posse - Bola dominada!' : '🤲 Bola dominada!',
                body: result.description,
              });
            } else if (ballHolderAction.action_type === 'pass_low' || ballHolderAction.action_type === 'pass_high') {
              // Pass succeeded without interception
              if (ballHolderAction.target_participant_id) {
                nextBallHolderParticipantId = ballHolderAction.target_participant_id;
              } else if (ballHolderAction.target_x != null && ballHolderAction.target_y != null) {
                // Find closest player to pass target (use final positions after move)
                let closestDist = Infinity;
                let closestId: string | null = null;
                for (const p of (participants || [])) {
                  if (p.id === ballHolder.id) continue;
                  const moveAction = allActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive'));
                  const px = moveAction?.target_x ?? p.pos_x ?? 50;
                  const py = moveAction?.target_y ?? p.pos_y ?? 50;
                  const dist = Math.sqrt((px - ballHolderAction.target_x) ** 2 + (py - ballHolderAction.target_y) ** 2);
                  if (dist < closestDist) {
                    closestDist = dist;
                    closestId = p.id;
                  }
                }
                if (closestId && closestDist <= 8) {
                  // Someone is close enough to receive
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
                } else {
                  // LOOSE BALL: pass went to empty area, nobody close enough
                  nextBallHolderParticipantId = null;
                  // Keep possession with same team but no ball holder
                  await supabase.from('match_event_logs').insert({
                    match_id, event_type: 'loose_ball',
                    title: '⚽ Bola solta!',
                    body: 'Passe para área vazia. Ninguém está com a bola.',
                  });
                }
              }
            } else if (ballHolderAction.action_type === 'move') {
              nextBallHolderParticipantId = ballHolder.id;
            }
          }
        } else {
          const looseBallClaimer = findLooseBallClaimer(allActions, participants || []);

          if (looseBallClaimer) {
            nextBallHolderParticipantId = looseBallClaimer.id;
            newPossessionClubId = looseBallClaimer.club_id;

            await supabase.from('match_event_logs').insert({
              match_id,
              event_type: looseBallClaimer.club_id === possClubId ? 'loose_ball_recovered' : 'possession_change',
              title: looseBallClaimer.club_id === possClubId ? '🤲 Bola recuperada!' : '🔄 Bola roubada!',
              body: 'Quem chegou primeiro na bola solta ficou com a posse.',
            });
          } else {
            nextBallHolderParticipantId = null;
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

          // If loose ball, skip phase 1 and go directly to attacking_support
          const isNextLooseBall = nextBallHolderParticipantId === null;
          const nextPhase = isNextLooseBall ? 'attacking_support' : 'ball_holder';
          const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

          await supabase.from('matches').update({
            current_turn_number: newTurnNumber,
            current_phase: nextPhase,
            possession_club_id: newPossessionClubId,
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_turns').insert({
            match_id, turn_number: newTurnNumber,
            phase: nextPhase,
            possession_club_id: newPossessionClubId,
            ball_holder_participant_id: nextBallHolderParticipantId,
            started_at: nextPhaseStart, ends_at: nextPhaseEnd,
            status: 'active',
          });

          if (isNextLooseBall) {
            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'loose_ball_phase',
              title: '⚽ Bola solta — Fase 1 pulada',
              body: 'Todos os jogadores se movimentam para disputar a bola.',
            });
          }
        }
      } else if (activeTurn.phase === 'ball_holder' && isLooseBall) {
        // Loose ball: skip ball_holder phase immediately, go to attacking_support
        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        const nextPhaseStart = new Date().toISOString();
        const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

        await supabase.from('matches').update({ current_phase: 'attacking_support' }).eq('id', match_id);

        await supabase.from('match_turns').insert({
          match_id, turn_number: activeTurn.turn_number,
          phase: 'attacking_support',
          possession_club_id: possClubId,
          ball_holder_participant_id: null,
          started_at: nextPhaseStart, ends_at: nextPhaseEnd,
          status: 'active',
        });
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

      const { data: allParts } = await supabase
        .from('match_participants').select('id').eq('match_id', match_id).eq('role_type', 'player');
      const isTestMatch = (allParts || []).length <= 4;

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
