import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000;
const POSITIONING_PHASE_DURATION_MS = 10000;
const RESOLUTION_PHASE_DURATION_MS = 3000;
const HALFTIME_PAUSE_MS = 5 * 60 * 1000; // 5 minutes halftime
const MAX_TURNS = 124;
const TURNS_PER_HALF = 62;
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;

// ─── Match minute calculation ────────────────────────────────
function computeMatchMinute(turnNumber: number): number {
  if (turnNumber <= TURNS_PER_HALF) {
    return Math.floor((turnNumber / TURNS_PER_HALF) * 45);
  }
  return 45 + Math.floor(((turnNumber - TURNS_PER_HALF) / TURNS_PER_HALF) * 45);
}

// ─── Formation positions for bot fill ─────────────────────────
const FORMATION_POSITIONS: Record<string, Array<{ x: number; y: number; pos: string }>> = {
  '4-4-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 42, y: 15, pos: 'LM' }, { x: 42, y: 37, pos: 'CM' }, { x: 42, y: 63, pos: 'CM' }, { x: 42, y: 85, pos: 'RM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '4-3-3': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 15, pos: 'LW' }, { x: 62, y: 50, pos: 'ST' }, { x: 60, y: 85, pos: 'RW' },
  ],
  '4-2-3-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 36, y: 35, pos: 'CDM' }, { x: 36, y: 65, pos: 'CDM' },
    { x: 50, y: 15, pos: 'LM' }, { x: 50, y: 50, pos: 'CAM' }, { x: 50, y: 85, pos: 'RM' },
    { x: 63, y: 50, pos: 'ST' },
  ],
};

function getFormationForFill(formation: string, isHome: boolean): Array<{ x: number; y: number; pos: string }> {
  const base = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS['4-4-2'];
  if (isHome) return base;
  return base.map(p => ({ ...p, x: 100 - p.x }));
}

// ─── Bot AI: generate fallback actions ─────────────────────────
async function generateBotActions(
  supabase: any,
  matchId: string,
  turnId: string,
  participants: any[],
  submittedParticipantIds: Set<string>,
  ballHolderId: string | null,
  possClubId: string | null,
  isLooseBall: boolean,
  phase: string,
) {
  const botsToAct: any[] = [];

  for (const p of participants) {
    if (p.role_type !== 'player') continue;
    if (submittedParticipantIds.has(p.id)) continue;

    // Determine if this participant should act in this phase
    const isAttacker = p.club_id === possClubId;
    const isBH = p.id === ballHolderId;

    if (phase === 'ball_holder' && isBH) botsToAct.push(p);
    else if (phase === 'attacking_support' && isAttacker) botsToAct.push(p);
    else if (phase === 'defending_response' && !isAttacker) botsToAct.push(p);
    else if (phase === 'positioning_attack' && isAttacker && !isBH) botsToAct.push(p);
    else if (phase === 'positioning_defense' && !isAttacker) botsToAct.push(p);
  }

  if (botsToAct.length === 0) return;

  const actions: any[] = [];

  for (const bot of botsToAct) {
    const posX = Number(bot.pos_x ?? 50);
    const posY = Number(bot.pos_y ?? 50);
    const isBH = bot.id === ballHolderId;

    if (isBH && phase === 'ball_holder') {
      // Ball holder bot: pass to nearest teammate
      const teammates = participants.filter(
        (p: any) => p.club_id === bot.club_id && p.id !== bot.id && p.role_type === 'player'
      );
      if (teammates.length > 0) {
        // Find closest teammate ahead
        const forward = teammates
          .map((t: any) => ({ ...t, dist: Math.sqrt((Number(t.pos_x ?? 50) - posX) ** 2 + (Number(t.pos_y ?? 50) - posY) ** 2) }))
          .sort((a: any, b: any) => a.dist - b.dist);
        const target = forward[0];
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'pass_low',
          target_x: Number(target.pos_x ?? 50), target_y: Number(target.pos_y ?? 50),
          target_participant_id: target.id, status: 'pending',
        });
      } else {
        // No teammates — just hold position
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: posX, target_y: posY, status: 'pending',
        });
      }
    } else {
      // Non-ball-holder bot or positioning: move slightly toward ball or hold formation
      let targetX = posX;
      let targetY = posY;

      if (isLooseBall) {
        // Move toward ball area (center-ish) with some randomness
        targetX = posX + (50 - posX) * 0.15 + (Math.random() - 0.5) * 4;
        targetY = posY + (50 - posY) * 0.15 + (Math.random() - 0.5) * 4;
      } else if (ballHolderId) {
        const bh = participants.find((p: any) => p.id === ballHolderId);
        if (bh) {
          const bhX = Number(bh.pos_x ?? 50);
          const bhY = Number(bh.pos_y ?? 50);
          const isAttacker = bot.club_id === possClubId;
          if (isAttacker) {
            // Move toward ball holder to offer support
            targetX = posX + (bhX - posX) * 0.1 + (Math.random() - 0.5) * 3;
            targetY = posY + (bhY - posY) * 0.1 + (Math.random() - 0.5) * 3;
          } else {
            // Defender: move toward ball holder to mark
            targetX = posX + (bhX - posX) * 0.12 + (Math.random() - 0.5) * 3;
            targetY = posY + (bhY - posY) * 0.12 + (Math.random() - 0.5) * 3;
          }
        }
      }

      targetX = Math.max(1, Math.min(99, targetX));
      targetY = Math.max(1, Math.min(99, targetY));

      actions.push({
        match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
        controlled_by_type: 'bot', action_type: 'move',
        target_x: targetX, target_y: targetY, status: 'pending',
      });
    }
  }

  if (actions.length > 0) {
    await supabase.from('match_actions').insert(actions);
    console.log(`[ENGINE] Bot AI generated ${actions.length} fallback actions for phase ${phase}`);
  }
}
type Phase = typeof PHASES[number];

function isPositioningPhase(phase: string): boolean {
  return phase === 'positioning_attack' || phase === 'positioning_defense';
}

// ─── Accuracy deviation ─────────────────────────────────────────
function normalizeAttr(val: number): number {
  return Math.max(0, Math.min(1, (val - 10) / 89));
}

interface DeviationResult {
  actualX: number;
  actualY: number;
  deviationDist: number;
  overGoal: boolean; // for shoot_power when ball goes over
}

function computeDeviation(
  targetX: number,
  targetY: number,
  startX: number,
  startY: number,
  actionType: string,
  attrs: Record<string, number>,
): DeviationResult {
  const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

  let difficultyMultiplier: number;
  let skillFactor: number;

  switch (actionType) {
    case 'pass_low':
      difficultyMultiplier = 5;
      skillFactor = normalizeAttr(attrs.passe_baixo ?? 40);
      break;
    case 'pass_high':
      difficultyMultiplier = 7;
      skillFactor = normalizeAttr(attrs.passe_alto ?? 40);
      break;
    case 'pass_launch':
      difficultyMultiplier = 6;
      skillFactor = (normalizeAttr(attrs.passe_baixo ?? 40) + normalizeAttr(attrs.passe_alto ?? 40)) / 2;
      break;
    case 'shoot_controlled':
      difficultyMultiplier = 4;
      skillFactor = normalizeAttr(attrs.acuracia_chute ?? 40);
      break;
    case 'shoot_power':
      difficultyMultiplier = 8;
      skillFactor = (normalizeAttr(attrs.acuracia_chute ?? 40) + normalizeAttr(attrs.forca_chute ?? 40)) / 2;
      break;
    default:
      return { actualX: targetX, actualY: targetY, deviationDist: 0, overGoal: false };
  }

  const baseDifficulty = (dist / 100) * difficultyMultiplier;
  // Harsh exponential curve: 99 = zero deviation, <50 = harsh, <40 = always large
  const skillCurve = Math.pow(1 - skillFactor, 3.5);
  const minimumDeviation = skillFactor < 0.45 ? (1 + (0.45 - skillFactor) * 3) : 0;
  const deviationRadius = (baseDifficulty * skillCurve + minimumDeviation) * (0.6 + Math.random() * 0.4);
  const angle = Math.random() * 2 * Math.PI;
  let actualX = targetX + Math.cos(angle) * deviationRadius;
  let actualY = targetY + Math.sin(angle) * deviationRadius;

  // For shoot_power: if deviation is large, ball goes over the goal
  let overGoal = false;
  if (actionType === 'shoot_power' && deviationRadius > 1.0) {
    // Push target_y outside goal range (38-62)
    if (actualY >= 38 && actualY <= 62) {
      actualY = Math.random() > 0.5 ? 35 - Math.random() * 5 : 65 + Math.random() * 5;
      overGoal = true;
    }
  }

  // Don't clamp — allow ball to go out of bounds for set pieces

  const deviationDist = Math.sqrt((actualX - targetX) ** 2 + (actualY - targetY) ** 2);

  console.log(`[ENGINE] Deviation: intended=(${targetX.toFixed(1)},${targetY.toFixed(1)}) actual=(${actualX.toFixed(1)},${actualY.toFixed(1)}) deviation=${deviationDist.toFixed(2)} skill=${skillFactor.toFixed(2)} overGoal=${overGoal}`);

  return { actualX, actualY, deviationDist, overGoal };
}

// ─── Height-based interception zones ─────────────────────────────
function getInterceptableRanges(actionType: string): Array<[number, number]> {
  switch (actionType) {
    case 'pass_low':
      return [[0, 1]]; // fully interceptable
    case 'pass_high':
      return [[0, 0.2], [0.8, 1]]; // yellow zones only
    case 'pass_launch':
      return [[0, 0.35], [0.65, 1]]; // yellow zones (interceptable)
    case 'shoot_controlled':
      return [[0, 1]]; // ground ball, fully interceptable
    case 'shoot_power':
      return [[0, 0.3]]; // only near start
    case 'move':
      return [[0, 1]];
    default:
      return [[0, 1]];
  }
}

function isPassType(action: string): boolean {
  return action === 'pass_low' || action === 'pass_high' || action === 'pass_launch';
}

function isShootType(action: string): boolean {
  return action === 'shoot' || action === 'shoot_controlled' || action === 'shoot_power';
}

// ─── Skill-based interception probability ────────────────────
interface InterceptContext {
  type: 'tackle' | 'receive_pass' | 'block_shot' | 'gk_save';
  baseChance: number;
}

function getInterceptContext(bhActionType: string, interceptorClubId: string, bhClubId: string, interceptorRoleType: string): InterceptContext {
  const isOpponent = interceptorClubId !== bhClubId;

  if (bhActionType === 'move' && isOpponent) {
    return { type: 'tackle', baseChance: 0.45 };
  }
  if (isShootType(bhActionType)) {
    if (interceptorRoleType === 'GK' || !isOpponent) {
      return { type: 'gk_save', baseChance: 0.35 };
    }
    return { type: 'block_shot', baseChance: 0.25 };
  }
  // Pass types
  if (bhActionType === 'pass_low') return { type: 'receive_pass', baseChance: 0.85 };
  if (bhActionType === 'pass_high') return { type: 'receive_pass', baseChance: 0.60 };
  if (bhActionType === 'pass_launch') return { type: 'receive_pass', baseChance: 0.70 };

  return { type: 'receive_pass', baseChance: 0.75 };
}

function computeInterceptSuccess(
  context: InterceptContext,
  attackerAttrs: Record<string, number>,
  defenderAttrs: Record<string, number>,
): { success: boolean; chance: number } {
  let attackerSkill: number;
  let defenderSkill: number;

  switch (context.type) {
    case 'tackle':
      attackerSkill = (normalizeAttr(attackerAttrs.drible ?? 40) * 0.35 + normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.25 +
        normalizeAttr(attackerAttrs.forca ?? 40) * 0.2 + normalizeAttr(attackerAttrs.agilidade ?? 40) * 0.2);
      defenderSkill = (normalizeAttr(defenderAttrs.desarme ?? 40) * 0.3 + normalizeAttr(defenderAttrs.marcacao ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.controle_bola ?? 40) * 0.2 + normalizeAttr(defenderAttrs.forca ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.antecipacao ?? 40) * 0.1);
      break;
    case 'receive_pass':
      attackerSkill = (normalizeAttr(attackerAttrs.passe_baixo ?? 40) * 0.4 + normalizeAttr(attackerAttrs.visao_jogo ?? 40) * 0.3 +
        normalizeAttr(attackerAttrs.passe_alto ?? 40) * 0.3);
      defenderSkill = (normalizeAttr(defenderAttrs.controle_bola ?? 40) * 0.3 + normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.2 +
        normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.2 + normalizeAttr(defenderAttrs.um_toque ?? 40) * 0.3);
      break;
    case 'block_shot':
      attackerSkill = (normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.4 + normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.3 +
        normalizeAttr(attackerAttrs.curva ?? 40) * 0.3);
      defenderSkill = (normalizeAttr(defenderAttrs.antecipacao ?? 40) * 0.3 + normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.coragem ?? 40) * 0.25 + normalizeAttr(defenderAttrs.forca ?? 40) * 0.2);
      break;
    case 'gk_save':
      attackerSkill = (normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.4 + normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.3 +
        normalizeAttr(attackerAttrs.curva ?? 40) * 0.3);
      defenderSkill = (normalizeAttr(defenderAttrs.reflexo ?? 40) * 0.3 + normalizeAttr(defenderAttrs.posicionamento_gol ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.um_contra_um ?? 40) * 0.25 + normalizeAttr(defenderAttrs.tempo_reacao ?? 40) * 0.2);
      break;
  }

  let successChance = context.baseChance * (0.5 + defenderSkill * 0.5) * (1 - attackerSkill * 0.3);
  successChance = Math.max(0.05, Math.min(0.95, successChance));

  const roll = Math.random();
  const success = roll < successChance;
  console.log(`[ENGINE] Intercept ${context.type}: defSkill=${defenderSkill.toFixed(2)} atkSkill=${attackerSkill.toFixed(2)} chance=${(successChance*100).toFixed(1)}% roll=${roll.toFixed(3)} success=${success}`);
  return { success, chance: successChance };
}

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string, attrByProfile: Record<string, any>): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
  looseBallPos?: { x: number; y: number };
  failedContestParticipantId?: string;
  failedContestLog?: string;
} {
  const getFullAttrs = (participant: any) => {
    const raw = participant?.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
    const result: Record<string, number> = {};
    const keys = ['drible','controle_bola','forca','agilidade','desarme','marcacao','antecipacao',
      'passe_baixo','passe_alto','visao_jogo','tomada_decisao','um_toque','acuracia_chute',
      'forca_chute','curva','coragem','reflexo','posicionamento_gol','um_contra_um','tempo_reacao'];
    for (const k of keys) result[k] = Number(raw?.[k] ?? 40);
    return result;
  };

  const bh = participants.find((p: any) => p.id === _attacker.participant_id);
  const bhAttrs = getFullAttrs(bh);
  const bhActionType = _attacker.action_type || action;

  // Find interceptors sorted by progress
  const interceptors = findInterceptorCandidates(allActions, _attacker, participants);

  for (const candidate of interceptors) {
    const defAttrs = getFullAttrs(candidate.participant);
    const slotPos = candidate.participant.slot_position || candidate.participant.field_pos || '';
    const isGK = slotPos === 'GK';
    const context = getInterceptContext(bhActionType, candidate.participant.club_id, bh?.club_id || possClubId, isGK ? 'GK' : 'player');
    const { success, chance } = computeInterceptSuccess(context, bhAttrs, defAttrs);
    const chancePct = `${(chance * 100).toFixed(0)}%`;

    if (success) {
      if (context.type === 'tackle') {
        return { success: false, event: 'tackle', description: `🦵 Desarme bem-sucedido! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
      }
      if (context.type === 'block_shot') {
        // Deflect ball randomly
        const blockX = candidate.interceptX ?? 50;
        const blockY = candidate.interceptY ?? 50;
        const deflectAngle = Math.random() * 2 * Math.PI;
        const deflectDist = 3 + Math.random() * 5;
        const looseBallX = Math.max(0, Math.min(100, blockX + Math.cos(deflectAngle) * deflectDist));
        const looseBallY = Math.max(0, Math.min(100, blockY + Math.sin(deflectAngle) * deflectDist));
        return { success: false, event: 'blocked', description: `🛡️ Bloqueio! (${chancePct})`, possession_change: false, goal: false, newBallHolderId: undefined, looseBallPos: { x: looseBallX, y: looseBallY } };
      }
      if (context.type === 'gk_save') {
        return { success: false, event: 'saved', description: `🧤 Defesa do goleiro! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
      }
      // receive_pass
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada! (${chancePct})`, possession_change: candidate.participant.club_id !== possClubId, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
    } else {
      // Failure — log event and continue to next candidate
      if (context.type === 'tackle') {
        // Tackle failed: dribble continues, apply penalty to defender (reduce movement by 25%)
        return { 
          success: true, event: 'dribble', 
          description: `🏃 Drible bem-sucedido! (Desarme: ${chancePct})`, 
          possession_change: false, goal: false,
          failedContestParticipantId: candidate.participant.id,
          failedContestLog: `🦵 Desarme falhou! (${chancePct})`
        };
      } else if (context.type === 'block_shot') {
        // Block failed: shot continues — log and continue
        console.log(`[ENGINE] 💨 Bloqueio falhou! (${chancePct}) Chute continua.`);
      } else if (context.type === 'gk_save') {
        console.log(`[ENGINE] 🧤 Goleiro não segurou! (${chancePct})`);
      } else {
        // Pass receive failed: ball continues, next interceptor gets a chance
        console.log(`[ENGINE] ❌ Falhou o domínio! (${chancePct}) Bola continua.`);
      }
    }
  }

  // No interceptors succeeded or none exist
  if (isShootType(action)) {
    return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true };
  }
  if (isPassType(action)) {
    return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  }
  if (action === 'move') {
    return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
  }
  return { success: true, event: 'no_action', description: '🔄 Sem ação', possession_change: false, goal: false };
}

function findInterceptorCandidates(allActions: any[], ballHolderAction: any, participants: any[]): Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> {
  if (!ballHolderAction || ballHolderAction.target_x == null || ballHolderAction.target_y == null) return [];
  const bh = participants.find((p: any) => p.id === ballHolderAction.participant_id);
  if (!bh) return [];

  const startX = bh.pos_x ?? 50;
  const startY = bh.pos_y ?? 50;
  const endX = ballHolderAction.target_x;
  const endY = ballHolderAction.target_y;

  const bhActionType = ballHolderAction.action_type || 'move';
  const interceptableRanges = getInterceptableRanges(bhActionType);

  const interceptors: Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> = [];
  for (const a of allActions) {
    if (a.participant_id === ballHolderAction.participant_id) continue;
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
      const isInInterceptableZone = interceptableRanges.some(([lo, hi]) => t >= lo && t <= hi);
      if (isInInterceptableZone) {
        interceptors.push({ participant: participants.find((p: any) => p.id === a.participant_id), progress: t, interceptX: cx, interceptY: cy });
      } else {
        console.log(`[ENGINE] Intercept rejected: t=${t.toFixed(2)} outside interceptable zones for ${bhActionType}`);
      }
    }
  }

  interceptors.sort((a, b) => a.progress - b.progress);
  return interceptors;
}

// Keep legacy findInterceptor for compatibility (unused now but safe)
function findInterceptor(allActions: any[], ballHolderAction: any, participants: any[]): any | null {
  const candidates = findInterceptorCandidates(allActions, ballHolderAction, participants);
  return candidates.length > 0 ? candidates[0].participant : null;
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

// ─── Physics helpers ───────────────────────────────────────────
const NUM_SUBSTEPS = 10;

interface Vec2 { x: number; y: number; }

function vecLen(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function vecNorm(v: Vec2): Vec2 {
  const l = vecLen(v);
  return l > 0.001 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}
function angleBetween(a: Vec2, b: Vec2): number {
  const la = vecLen(a), lb = vecLen(b);
  if (la < 0.001 || lb < 0.001) return 0;
  const dot = (a.x * b.x + a.y * b.y) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

interface PhysicsPlayerState {
  pos: Vec2;
  vel: Vec2;
}

function simulatePlayerMovement(
  startPos: Vec2,
  targetPos: Vec2,
  attrs: { aceleracao: number; agilidade: number; velocidade: number; forca: number; stamina: number },
  turnNumber: number,
): Vec2 {
  const accelFactor = 0.3 + normalizeAttr(attrs.aceleracao) * 0.5;
  const agilityFactor = 0.4 + normalizeAttr(attrs.agilidade) * 0.5;
  const forceFactor = normalizeAttr(attrs.forca);
  const maxSpeed = (3 + normalizeAttr(attrs.velocidade) * 4) / NUM_SUBSTEPS;
  const staminaDecay = 1.0 - (Math.max(0, turnNumber - 20) / 40) * (1 - normalizeAttr(attrs.stamina)) * 0.15;

  const state: PhysicsPlayerState = { pos: { ...startPos }, vel: { x: 0, y: 0 } };

  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    const toTarget = { x: targetPos.x - state.pos.x, y: targetPos.y - state.pos.y };
    const dist = vecLen(toTarget);
    if (dist < 0.1) break;

    const desired = vecNorm(toTarget);
    const desiredVel = { x: desired.x * maxSpeed * staminaDecay, y: desired.y * maxSpeed * staminaDecay };

    const angle = angleBetween(state.vel, desiredVel);
    const basePenalty = angle / Math.PI;
    const turnPenalty = 1 - basePenalty * (1 - agilityFactor * 0.5) * (1 - forceFactor * 0.2);

    state.vel.x = state.vel.x * turnPenalty * (1 - accelFactor) + desiredVel.x * accelFactor;
    state.vel.y = state.vel.y * turnPenalty * (1 - accelFactor) + desiredVel.y * accelFactor;

    const speed = vecLen(state.vel);
    if (speed > maxSpeed) {
      state.vel.x = (state.vel.x / speed) * maxSpeed;
      state.vel.y = (state.vel.y / speed) * maxSpeed;
    }

    state.pos.x += state.vel.x;
    state.pos.y += state.vel.y;

    const newDist = vecLen({ x: targetPos.x - state.pos.x, y: targetPos.y - state.pos.y });
    if (newDist < 0.3 || newDist > dist) {
      state.pos = { ...targetPos };
      break;
    }
  }

  return state.pos;
}

interface BallPhysicsResult {
  finalPos: Vec2;
  speedAtEnd: number;
}

function simulateBallPhysics(
  startPos: Vec2,
  targetPos: Vec2,
  actionType: string,
  attrs: { passe_baixo: number; passe_alto: number; forca_chute: number; acuracia_chute: number },
): BallPhysicsResult {
  let impulse: number;
  let friction: number;

  if (actionType === 'pass_low') {
    impulse = 8 + normalizeAttr(attrs.passe_baixo) * 4;
    friction = 0.92;
  } else if (actionType === 'pass_high') {
    impulse = 12 + normalizeAttr(attrs.passe_alto) * 5;
    friction = 0.90;
  } else if (actionType === 'pass_launch') {
    impulse = 10 + (normalizeAttr(attrs.passe_baixo) + normalizeAttr(attrs.passe_alto)) / 2 * 5;
    friction = 0.91;
  } else if (actionType === 'shoot_controlled') {
    impulse = 12 + normalizeAttr(attrs.acuracia_chute) * 6;
    friction = 0.93;
  } else if (actionType === 'shoot_power') {
    impulse = 18 + normalizeAttr(attrs.forca_chute) * 10;
    friction = 0.96;
  } else if (actionType === 'shoot') {
    // Legacy fallback
    impulse = 15 + normalizeAttr(attrs.forca_chute) * 8;
    friction = 0.95;
  } else {
    return { finalPos: { ...targetPos }, speedAtEnd: 0 };
  }

  const dir = vecNorm({ x: targetPos.x - startPos.x, y: targetPos.y - startPos.y });
  const totalDist = vecLen({ x: targetPos.x - startPos.x, y: targetPos.y - startPos.y });

  let vel = impulse / NUM_SUBSTEPS;
  const pos = { ...startPos };
  let speed = 0;

  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    pos.x += dir.x * vel;
    pos.y += dir.y * vel;
    vel *= friction;
    speed = vel * NUM_SUBSTEPS;

    const traveled = vecLen({ x: pos.x - startPos.x, y: pos.y - startPos.y });
    if (traveled >= totalDist) {
      return { finalPos: { ...targetPos }, speedAtEnd: speed };
    }
    if (vel < 0.01) break;
  }

  return { finalPos: pos, speedAtEnd: speed };
}

function computeBallControlDifficulty(
  ballSpeed: number,
  attrs: { controle_bola: number; agilidade: number; um_toque: number },
): number {
  let chance = 0.7 + normalizeAttr(attrs.controle_bola) * 0.15 + normalizeAttr(attrs.agilidade) * 0.08 + normalizeAttr(attrs.um_toque) * 0.07;
  if (ballSpeed > 5) chance -= Math.min(0.3, (ballSpeed - 5) * 0.05);
  return Math.max(0.1, Math.min(1.0, chance));
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
// ─── Out of bounds detection ─────────────────────────────────
interface OOBResult {
  type: 'throw_in' | 'corner' | 'goal_kick';
  awardedClubId: string;
  exitX: number;
  exitY: number;
  side?: 'top' | 'bottom';
}

function detectOutOfBounds(
  ballX: number, ballY: number,
  lastTouchClubId: string,
  match: { home_club_id: string; away_club_id: string }
): OOBResult | null {
  const oppositeClub = lastTouchClubId === match.home_club_id ? match.away_club_id : match.home_club_id;

  // Sidelines: y <= 1 or y >= 99 → throw-in
  if (ballY <= 1 || ballY >= 99) {
    return { type: 'throw_in', awardedClubId: oppositeClub, exitX: ballX, exitY: ballY, side: ballY <= 1 ? 'top' : 'bottom' };
  }

  // Home end line (x <= 1): home defends left side
  if (ballX <= 1) {
    if (lastTouchClubId === match.home_club_id) {
      return { type: 'corner', awardedClubId: match.away_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    } else {
      return { type: 'goal_kick', awardedClubId: match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    }
  }

  // Away end line (x >= 99)
  if (ballX >= 99) {
    if (lastTouchClubId === match.away_club_id) {
      return { type: 'corner', awardedClubId: match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    } else {
      return { type: 'goal_kick', awardedClubId: match.away_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    }
  }

  return null;
}

async function handleSetPiece(
  supabase: any,
  matchId: string,
  oob: OOBResult,
  participants: any[],
  match: { home_club_id: string; away_club_id: string },
  allActions: any[]
): Promise<{ playerId: string; clubId: string; title: string; body: string } | null> {
  const teamPlayers = participants.filter((p: any) => p.club_id === oob.awardedClubId && p.role_type === 'player');
  if (teamPlayers.length === 0) return null;

  const isHomeTeam = oob.awardedClubId === match.home_club_id;

  // Load slot positions for GK detection
  const slotIds = teamPlayers.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id);
  const { data: slots } = slotIds.length > 0
    ? await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds)
    : { data: [] };
  const slotMap = new Map((slots || []).map((s: any) => [s.id, s.slot_position]));

  const getSlotPos = (p: any) => slotMap.get(p.lineup_slot_id) || '';
  const getPlayerFinalPos = (p: any) => {
    const moveAct = allActions.find((ac: any) => ac.participant_id === p.id && (ac.action_type === 'move' || ac.action_type === 'receive'));
    return { x: Number(moveAct?.target_x ?? p.pos_x ?? 50), y: Number(moveAct?.target_y ?? p.pos_y ?? 50) };
  };

  if (oob.type === 'throw_in') {
    const outfield = teamPlayers.filter((p: any) => getSlotPos(p) !== 'GK');
    const candidates = outfield.length > 0 ? outfield : teamPlayers;

    candidates.sort((a: any, b: any) => {
      const posA = getPlayerFinalPos(a);
      const posB = getPlayerFinalPos(b);
      const distA = Math.sqrt((posA.x - oob.exitX) ** 2 + (posA.y - oob.exitY) ** 2);
      const distB = Math.sqrt((posB.x - oob.exitX) ** 2 + (posB.y - oob.exitY) ** 2);
      return distA - distB;
    });

    const chosen = candidates[0];
    const restartY = oob.side === 'top' ? 1 : 99;
    const restartX = Math.max(2, Math.min(98, oob.exitX));
    await supabase.from('match_participants').update({ pos_x: restartX, pos_y: restartY }).eq('id', chosen.id);

    return {
      playerId: chosen.id, clubId: oob.awardedClubId,
      title: '🏳️ Lateral!',
      body: `Reposição pela lateral para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.`,
    };
  }

  if (oob.type === 'corner') {
    const forwards = teamPlayers.filter((p: any) => {
      const pos = getSlotPos(p).toUpperCase();
      return ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(pos);
    });
    const chosen = forwards.length > 0 ? forwards[0] : teamPlayers.filter((p: any) => getSlotPos(p) !== 'GK')[0] || teamPlayers[0];

    const cornerX = isHomeTeam ? 99 : 1;
    const cornerY = oob.side === 'top' ? 1 : 99;
    await supabase.from('match_participants').update({ pos_x: cornerX, pos_y: cornerY }).eq('id', chosen.id);

    return {
      playerId: chosen.id, clubId: oob.awardedClubId,
      title: '🚩 Escanteio!',
      body: `Escanteio para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.`,
    };
  }

  if (oob.type === 'goal_kick') {
    const gk = teamPlayers.find((p: any) => getSlotPos(p).toUpperCase() === 'GK') || teamPlayers[0];
    const gkX = isHomeTeam ? 6 : 94;
    const gkY = Math.max(40, Math.min(60, oob.exitY));
    await supabase.from('match_participants').update({ pos_x: gkX, pos_y: gkY }).eq('id', gk.id);

    return {
      playerId: gk.id, clubId: oob.awardedClubId,
      title: '🥅 Tiro de Meta!',
      body: `Tiro de meta para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.`,
    };
  }

  return null;
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
    const forceTick = body.force === true;

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

      return new Response(JSON.stringify({ status: 'finished', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        // ── Bot auto-fill: ensure 11 players per side ──
        const { data: existingParts } = await supabase
          .from('match_participants')
          .select('id, club_id, role_type')
          .eq('match_id', m.id)
          .eq('role_type', 'player');

        const homeParts = (existingParts || []).filter((p: any) => p.club_id === m.home_club_id);
        const awayParts = (existingParts || []).filter((p: any) => p.club_id === m.away_club_id);
        const isTestMatch = homeParts.length <= 4 && awayParts.length <= 4;

        if (!isTestMatch) {
          // Get club formations
          const { data: homeSettings } = await supabase.from('club_settings').select('default_formation').eq('club_id', m.home_club_id).maybeSingle();
          const { data: awaySettings } = await supabase.from('club_settings').select('default_formation').eq('club_id', m.away_club_id).maybeSingle();
          const homeFormation = homeSettings?.default_formation || '4-4-2';
          const awayFormation = awaySettings?.default_formation || '4-4-2';

          const fillBots = async (clubId: string, currentCount: number, formation: string, isHome: boolean) => {
            if (currentCount >= 11) return;
            const positions = getFormationForFill(formation, isHome);
            const botsToInsert: any[] = [];
            for (let i = currentCount; i < 11; i++) {
              const pos = positions[i] || { x: isHome ? 30 : 70, y: 50, pos: 'CM' };
              botsToInsert.push({
                match_id: m.id, club_id: clubId, role_type: 'player',
                is_bot: true, pos_x: pos.x, pos_y: pos.y,
              });
            }
            if (botsToInsert.length > 0) {
              await supabase.from('match_participants').insert(botsToInsert);
              console.log(`[ENGINE] Filled ${botsToInsert.length} bots for club ${clubId.slice(0,8)}`);
            }
          };

          await Promise.all([
            fillBots(m.home_club_id, homeParts.length, homeFormation, true),
            fillBots(m.away_club_id, awayParts.length, awayFormation, false),
          ]);
        }

        const possessionClubId = m.home_club_id;
        const ballHolderParticipantId = await pickCenterKickoffPlayer(supabase, m.id, possessionClubId);

        await supabase.from('matches').update({
          status: 'live',
          started_at: now,
          current_phase: 'positioning_attack',
          current_turn_number: 1,
          possession_club_id: possessionClubId,
        }).eq('id', m.id);

        const phaseEnd = new Date(Date.now() + POSITIONING_PHASE_DURATION_MS).toISOString();
        await supabase.from('match_turns').insert({
          match_id: m.id,
          turn_number: 1,
          phase: 'positioning_attack',
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
        return new Response(JSON.stringify({ started, server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      if (!forceTick && now < endsAt) {
        return new Response(JSON.stringify({ status: 'waiting', remaining_ms: endsAt.getTime() - now.getTime(), server_now: now.getTime() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── POSITIONING PHASES ──
      if (isPositioningPhase(activeTurn.phase)) {
        const { data: participants } = await supabase
          .from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player');

        const possClubId = activeTurn.possession_club_id;
        const isAttackPhase = activeTurn.phase === 'positioning_attack';

        // Load actions for this phase turn
        const { data: rawActions } = await supabase
          .from('match_actions').select('*')
          .eq('match_turn_id', activeTurn.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        // Dedup: keep latest action per participant
        const seen = new Set<string>();
        const moveActions = (rawActions || []).filter(a => {
          if (a.action_type !== 'move') return false;
          if (seen.has(a.participant_id)) return false;
          seen.add(a.participant_id);
          return true;
        });

        // Determine if this is a kickoff (ball holder at center)
        const bhId = activeTurn.ball_holder_participant_id;
        const bh = bhId ? (participants || []).find((p: any) => p.id === bhId) : null;
        const isKickoff = bh && Math.abs(Number(bh.pos_x ?? 50) - 50) < 5 && Math.abs(Number(bh.pos_y ?? 50) - 50) < 5;

        // Apply move actions
        for (const a of moveActions) {
          const part = (participants || []).find((p: any) => p.id === a.participant_id);
          if (!part) continue;

          // Don't move the ball holder (kicker)
          if (part.id === bhId) continue;

          // Check team phase constraint
          const isAttacker = part.club_id === possClubId;
          if (isAttackPhase && !isAttacker) continue;
          if (!isAttackPhase && isAttacker) continue;

          let targetX = Number(a.target_x ?? part.pos_x ?? 50);
          let targetY = Number(a.target_y ?? part.pos_y ?? 50);

          // Kickoff half-field constraint
          if (isKickoff) {
            const isHome = part.club_id === match.home_club_id;
            if (isHome) targetX = Math.min(targetX, 49);
            else targetX = Math.max(targetX, 51);
          }

          // Clamp to field
          targetX = Math.max(1, Math.min(99, targetX));
          targetY = Math.max(1, Math.min(99, targetY));

          await supabase.from('match_participants').update({
            pos_x: targetX, pos_y: targetY,
          }).eq('id', part.id);

          console.log(`[ENGINE] Positioning move: ${part.id.slice(0,8)} → (${targetX.toFixed(1)},${targetY.toFixed(1)})`);
        }

        // Mark actions as used
        const actionIds = moveActions.map(a => a.id);
        if (actionIds.length > 0) {
          await supabase.from('match_actions').update({ status: 'used' }).in('id', actionIds);
        }

        // Resolve current positioning turn
        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        const nextPhaseStart = new Date().toISOString();

        if (isAttackPhase) {
          // Advance to positioning_defense
          const nextPhaseEnd = new Date(Date.now() + POSITIONING_PHASE_DURATION_MS).toISOString();
          await supabase.from('matches').update({ current_phase: 'positioning_defense' }).eq('id', match_id);
          await supabase.from('match_turns').insert({
            match_id, turn_number: activeTurn.turn_number,
            phase: 'positioning_defense',
            possession_club_id: possClubId,
            ball_holder_participant_id: bhId,
            started_at: nextPhaseStart, ends_at: nextPhaseEnd,
            status: 'active',
          });

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'positioning',
            title: '📍 Posicionamento — Ataque concluído',
            body: 'Agora a defesa posiciona seus jogadores.',
          });
        } else {
          // Advance to ball_holder (normal turn starts)
          const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();
          await supabase.from('matches').update({ current_phase: 'ball_holder' }).eq('id', match_id);
          await supabase.from('match_turns').insert({
            match_id, turn_number: activeTurn.turn_number,
            phase: 'ball_holder',
            possession_club_id: possClubId,
            ball_holder_participant_id: bhId,
            started_at: nextPhaseStart, ends_at: nextPhaseEnd,
            status: 'active',
          });

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'positioning',
            title: '📍 Posicionamento concluído',
            body: 'A partida continua!',
          });
        }

        return new Response(JSON.stringify({ status: 'advanced', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      let ballEndPos: { x: number; y: number } | null = null;
      const lastTouchClubId = possClubId;

      if (activeTurn.phase === 'resolution') {
        console.log(`[ENGINE] Resolution phase: turn=${match.current_turn_number} ballHolder=${activeTurn.ball_holder_participant_id?.slice(0,8) ?? 'NONE'} possession=${possClubId?.slice(0,8) ?? 'NONE'}`);
        const { data: turnRows } = await supabase
          .from('match_turns')
          .select('id')
          .eq('match_id', match_id)
          .eq('turn_number', activeTurn.turn_number);

        const allTurnIds = (turnRows || []).map(t => t.id);

        const { data: rawActions } = await supabase
          .from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending')
          .order('created_at', { ascending: false });

        // Dedup: keep latest action per participant, BUT allow ball holder to have
        // BOTH a pass/shoot (from phase 1) AND a move (from phase 2)
        const seenParticipants = new Map<string, string[]>(); // participantId -> action_types kept
        const allActions = (rawActions || []).filter(a => {
          const existing = seenParticipants.get(a.participant_id);
          const isBH = a.participant_id === activeTurn.ball_holder_participant_id;
          if (isBH) {
            // Ball holder can have both a ball action (pass/shoot) AND a move
            const isBallAction = isPassType(a.action_type) || isShootType(a.action_type);
            const isMoveAction = a.action_type === 'move';
            if (existing) {
              const hasBallAction = existing.some(t => isPassType(t) || isShootType(t));
              const hasMoveAction = existing.some(t => t === 'move');
              if (isBallAction && hasBallAction) return false; // Already has a ball action
              if (isMoveAction && hasMoveAction) return false; // Already has a move
              if (!isBallAction && !isMoveAction) return false; // Unknown dupe
              existing.push(a.action_type);
              return true;
            }
            seenParticipants.set(a.participant_id, [a.action_type]);
            return true;
          }
          // Non-ball-holder: only one action
          if (existing) return false;
          seenParticipants.set(a.participant_id, [a.action_type]);
          return true;
        });

        // ── Load player attributes for physics ──
        const profileIds = (participants || []).filter(p => p.player_profile_id).map(p => p.player_profile_id);
        const { data: attrRows } = profileIds.length > 0
          ? await supabase.from('player_attributes').select('*').in('player_profile_id', profileIds)
          : { data: [] };
        const attrByProfile: Record<string, any> = {};
        for (const row of (attrRows || [])) {
          attrByProfile[row.player_profile_id] = row;
        }
        const getAttrs = (participant: any) => {
          const raw = participant?.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
          return {
            aceleracao: Number(raw?.aceleracao ?? 40),
            agilidade: Number(raw?.agilidade ?? 40),
            velocidade: Number(raw?.velocidade ?? 40),
            forca: Number(raw?.forca ?? 40),
            stamina: Number(raw?.stamina ?? 40),
            passe_baixo: Number(raw?.passe_baixo ?? 40),
            passe_alto: Number(raw?.passe_alto ?? 40),
            forca_chute: Number(raw?.forca_chute ?? 40),
            acuracia_chute: Number(raw?.acuracia_chute ?? 40),
            controle_bola: Number(raw?.controle_bola ?? 40),
            um_toque: Number(raw?.um_toque ?? 40),
          };
        };

        // ── Apply accuracy deviation to ball actions before resolution ──
        if (ballHolder) {
          const bhAction = allActions.find(a => a.participant_id === ballHolder.id);
          if (bhAction && (isPassType(bhAction.action_type) || isShootType(bhAction.action_type)) && bhAction.target_x != null && bhAction.target_y != null) {
            // Check if deviation was already applied at phase transition
            const alreadyDeviated = bhAction.payload && typeof bhAction.payload === 'object' && (bhAction.payload as any).deviated;
            if (!alreadyDeviated) {
              const bhAttrs = getAttrs(ballHolder);
              const startX = Number(ballHolder.pos_x ?? 50);
              const startY = Number(ballHolder.pos_y ?? 50);
              const deviation = computeDeviation(
                Number(bhAction.target_x),
                Number(bhAction.target_y),
                startX,
                startY,
                bhAction.action_type,
                bhAttrs,
              );
              bhAction.target_x = deviation.actualX;
              bhAction.target_y = deviation.actualY;

              if (deviation.overGoal) {
                await supabase.from('match_event_logs').insert({
                  match_id, event_type: 'shot_over',
                  title: '💨 Chute para fora!',
                  body: 'A bola foi por cima do gol.',
                });
              }
            } else {
              console.log(`[ENGINE] Deviation already applied at phase transition, using stored values`);
            }
          }
        }

        // ── Apply movement ──
        // Check if ball holder has a ball action (pass/shoot) — if so, defer their move until after resolution
        const bhHasBallAction = ballHolder && allActions.some(a =>
          a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));

        console.log(`[ENGINE] Processing ${allActions.length} actions (from ${(rawActions || []).length} raw) bhHasBallAction=${bhHasBallAction}`);
        for (const a of allActions) {
          console.log(`[ENGINE] Action: ${a.participant_id.slice(0,8)} ${a.action_type} → (${Number(a.target_x ?? 0).toFixed(1)},${Number(a.target_y ?? 0).toFixed(1)}) target_part=${a.target_participant_id?.slice(0,8) ?? 'none'}`);
          if ((a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null) {
            // Skip ball holder's move if they have a ball action — defer it after ball resolution
            if (a.participant_id === ballHolder?.id && a.action_type === 'move' && bhHasBallAction) {
              console.log(`[ENGINE] Deferring BH move until after ball resolution`);
              continue;
            }
            const part = (participants || []).find(p => p.id === a.participant_id);
            const startX = Number(part?.pos_x ?? 50);
            const startY = Number(part?.pos_y ?? 50);
            const dist = Math.sqrt((Number(a.target_x) - startX) ** 2 + (Number(a.target_y) - startY) ** 2);
            const attrs = getAttrs(part);

            console.log(`[ENGINE] Player ${a.participant_id.slice(0,8)} ${a.action_type}: (${startX.toFixed(1)},${startY.toFixed(1)}) → (${Number(a.target_x).toFixed(1)},${Number(a.target_y).toFixed(1)}) dist=${dist.toFixed(1)} | vel=${attrs.velocidade} accel=${attrs.aceleracao} agil=${attrs.agilidade} stam=${attrs.stamina} forca=${attrs.forca}`);

            await supabase.from('match_participants').update({
              pos_x: Number(a.target_x),
              pos_y: Number(a.target_y),
            }).eq('id', a.participant_id);
          }
        }

        if (ballHolder) {
          // Find the ball holder's BALL action (pass/shoot preferred, fallback to move)
          const ballHolderAction = allActions
            .find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)))
            || allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');

          if (ballHolderAction) {
            const result = resolveAction(ballHolderAction.action_type, ballHolderAction, null, allActions, participants || [], possClubId || '', attrByProfile);

            if (result.goal) {
              // Check if the shot is actually on target
              const isOverGoal = ballHolderAction.payload && typeof ballHolderAction.payload === 'object' && (ballHolderAction.payload as any).over_goal;
              const shotTargetY = Number(ballHolderAction.target_y ?? 50);
              const isOnTarget = shotTargetY >= 38 && shotTargetY <= 62 && !isOverGoal;

              if (isOnTarget) {
                if (possClubId === match.home_club_id) homeScore++;
                else awayScore++;

                await supabase.from('match_event_logs').insert({
                  match_id, event_type: 'goal',
                  title: `⚽ GOL! ${homeScore} – ${awayScore}`,
                  body: `Turno ${match.current_turn_number}`,
                });

                newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
                nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
              } else {
                // Shot missed — ball goes out of bounds
                nextBallHolderParticipantId = null;
                ballEndPos = { x: Number(ballHolderAction.target_x ?? 50), y: shotTargetY };
                await supabase.from('match_event_logs').insert({
                  match_id, event_type: 'shot_missed',
                  title: isOverGoal ? '💨 Chute por cima do gol!' : '💨 Chute para fora!',
                  body: isOverGoal ? 'A bola foi por cima do gol.' : 'A bola saiu pela linha de fundo.',
                });
                console.log(`[ENGINE] Shot missed: overGoal=${isOverGoal} targetY=${shotTargetY} (goal range: 38-62)`);
              }
            } else if (result.looseBallPos) {
              // Shot blocked — ball deflects to random position
              nextBallHolderParticipantId = null;
              await supabase.from('match_event_logs').insert({
                match_id, event_type: 'blocked',
                title: result.description,
                body: `Bola espirrou para (${result.looseBallPos.x.toFixed(0)},${result.looseBallPos.y.toFixed(0)})`,
              });
            } else if (result.newBallHolderId) {
              nextBallHolderParticipantId = result.newBallHolderId;
              newPossessionClubId = result.newPossessionClubId || possClubId;

              await supabase.from('match_event_logs').insert({
                match_id, event_type: result.possession_change ? 'possession_change' : (result.event === 'tackle' ? 'tackle' : 'pass_complete'),
                title: result.possession_change ? `🔄 Troca de posse` : result.description,
                body: result.description,
              });
            } else if (result.event === 'dribble') {
              // Tackle failed, dribble succeeded
              nextBallHolderParticipantId = ballHolder.id;
              await supabase.from('match_event_logs').insert({
                match_id, event_type: 'dribble',
                title: result.description,
                body: 'O desarme falhou e o jogador seguiu com a bola.',
              });
              // Log the failed contest too
              if (result.failedContestLog) {
                await supabase.from('match_event_logs').insert({
                  match_id, event_type: 'tackle_failed',
                  title: result.failedContestLog,
                  body: 'O defensor perdeu o equilíbrio e terá penalidade de velocidade.',
                });
              }
              // Apply movement penalty to failed tackler: reduce their effective movement by 25%
              if (result.failedContestParticipantId) {
                const failedPart = (participants || []).find((p: any) => p.id === result.failedContestParticipantId);
                if (failedPart) {
                  const failMoveAct = allActions.find((a: any) => a.participant_id === failedPart.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
                  if (failMoveAct) {
                    // Reduce their movement by 25% — move them only 75% of the way
                    const startX = Number(failedPart.pos_x ?? 50);
                    const startY = Number(failedPart.pos_y ?? 50);
                    const penaltyX = startX + (Number(failMoveAct.target_x) - startX) * 0.75;
                    const penaltyY = startY + (Number(failMoveAct.target_y) - startY) * 0.75;
                    await supabase.from('match_participants').update({ pos_x: penaltyX, pos_y: penaltyY }).eq('id', failedPart.id);
                    console.log(`[ENGINE] Failed tackle penalty: ${failedPart.id.slice(0,8)} movement reduced by 25%`);
                  }
                }
              }
            } else if (isPassType(ballHolderAction.action_type)) {
              if (ballHolderAction.target_participant_id) {
                // Only give ball if target submitted a 'receive' action
                const receiverAction = allActions.find(a => a.participant_id === ballHolderAction.target_participant_id && a.action_type === 'receive');
                if (receiverAction) {
                  nextBallHolderParticipantId = ballHolderAction.target_participant_id;
                } else {
                  nextBallHolderParticipantId = null;
                  await supabase.from('match_event_logs').insert({
                    match_id, event_type: 'loose_ball',
                    title: '⚽ Bola solta!',
                    body: 'O destinatário não dominou a bola.',
                  });
                }
              } else {
                // Pass to empty space — always loose ball
                nextBallHolderParticipantId = null;
                await supabase.from('match_event_logs').insert({
                  match_id, event_type: 'loose_ball',
                  title: '⚽ Bola solta!',
                  body: 'Passe para área vazia. Ninguém dominou a bola.',
                });
              }
            } else if (ballHolderAction.action_type === 'move') {
              nextBallHolderParticipantId = ballHolder.id;
            }
          }
        } else {
          // ── LOOSE BALL HANDLING ──
          // Check if ball was ALREADY loose in the previous turn (single-turn inertia)
          const { data: prevTurnData } = await supabase
            .from('match_turns')
            .select('ball_holder_participant_id')
            .eq('match_id', match_id)
            .eq('turn_number', match.current_turn_number - 1)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const wasAlreadyLoose = prevTurnData && prevTurnData.ball_holder_participant_id === null && match.current_turn_number > 1;

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
            if (wasAlreadyLoose) {
              await supabase.from('match_event_logs').insert({
                match_id, event_type: 'ball_stopped',
                title: '⚽ Bola parada',
                body: 'A bola perdeu a inércia e está parada no campo.',
              });
            } else {
              const prevBhAction = allActions.find(a => isPassType(a.action_type) || isShootType(a.action_type));
              let inertiaBallX = ballEndPos?.x ?? 50;
              let inertiaBallY = ballEndPos?.y ?? 50;
              if (prevBhAction && prevBhAction.target_x != null && prevBhAction.target_y != null && ballHolder) {
                const startX = Number(ballHolder.pos_x ?? 50);
                const startY = Number(ballHolder.pos_y ?? 50);
                const dirX = Number(prevBhAction.target_x) - startX;
                const dirY = Number(prevBhAction.target_y) - startY;
                inertiaBallX = Math.max(0, Math.min(100, Number(prevBhAction.target_x) + dirX * 0.15));
                inertiaBallY = Math.max(0, Math.min(100, Number(prevBhAction.target_y) + dirY * 0.15));
              }
              ballEndPos = { x: inertiaBallX, y: inertiaBallY };
              await supabase.from('match_event_logs').insert({
                match_id, event_type: 'ball_inertia',
                title: '⚽ Bola continua rolando...',
                body: 'Ninguém alcançou a bola. Ela continua na mesma direção por inércia.',
                payload: { ball_x: inertiaBallX, ball_y: inertiaBallY },
              });
            }
          }
        }

        // ── Apply deferred ball holder move (after ball resolution) ──
        if (bhHasBallAction && ballHolder) {
          const bhMoveAction = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
          if (bhMoveAction?.target_x != null && bhMoveAction?.target_y != null) {
            await supabase.from('match_participants').update({
              pos_x: Number(bhMoveAction.target_x),
              pos_y: Number(bhMoveAction.target_y),
            }).eq('id', ballHolder.id);
            console.log(`[ENGINE] Deferred BH move applied: (${Number(bhMoveAction.target_x).toFixed(1)},${Number(bhMoveAction.target_y).toFixed(1)})`);
          }
        }

        const allRawIds = (rawActions || []).map(a => a.id);
        if (allRawIds.length > 0) {
          const usedIds = allActions.map(a => a.id);
          const overriddenIds = allRawIds.filter(id => !usedIds.includes(id));
          if (usedIds.length > 0) await supabase.from('match_actions').update({ status: 'used' }).in('id', usedIds);
          if (overriddenIds.length > 0) await supabase.from('match_actions').update({ status: 'overridden' }).in('id', overriddenIds);
        }

        // ── Compute ball end position for out-of-bounds check ──
        if (!ballEndPos) {
          if (nextBallHolderParticipantId) {
            const holder = (participants || []).find((p: any) => p.id === nextBallHolderParticipantId);
            if (holder) {
              const moveAct = allActions.find((a: any) => a.participant_id === holder.id && (a.action_type === 'move' || a.action_type === 'receive'));
              ballEndPos = {
                x: Number(moveAct?.target_x ?? holder.pos_x ?? 50),
                y: Number(moveAct?.target_y ?? holder.pos_y ?? 50),
              };
            }
          } else if (ballHolder) {
            // Loose ball — ball is at the pass/shot target
            const bhAction = allActions.find((a: any) => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));
            if (bhAction?.target_x != null && bhAction?.target_y != null) {
              ballEndPos = { x: Number(bhAction.target_x), y: Number(bhAction.target_y) };
            }
          }
        }

        // ── Out-of-bounds detection — only if no goal scored and ball is loose ──
        const goalScored = homeScore > match.home_score || awayScore > match.away_score;
        if (ballEndPos && !goalScored && nextBallHolderParticipantId === null) {
          const oob = detectOutOfBounds(ballEndPos.x, ballEndPos.y, lastTouchClubId || match.home_club_id, match);
          if (oob) {
            const restart = await handleSetPiece(supabase, match_id, oob, participants || [], match, allActions);
            if (restart) {
              nextBallHolderParticipantId = restart.playerId;
              newPossessionClubId = restart.clubId;
              await supabase.from('match_event_logs').insert({
                match_id, event_type: oob.type,
                title: restart.title,
                body: restart.body,
              });
            }
          }
        }

        const newTurnNumber = match.current_turn_number + 1;

        await supabase.from('match_turns')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', activeTurn.id);

        // ── Halftime check ──
        if (newTurnNumber === TURNS_PER_HALF + 1 && match.current_turn_number <= TURNS_PER_HALF) {
          const matchMinute = computeMatchMinute(match.current_turn_number);
          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'halftime',
            title: `⏸ Intervalo! ${homeScore} – ${awayScore}`,
            body: `Fim do primeiro tempo (${matchMinute}'). Intervalo de 5 minutos.`,
          });

          // Create a halftime pause turn
          const halftimeEnd = new Date(Date.now() + HALFTIME_PAUSE_MS).toISOString();
          const halftimeStart = new Date().toISOString();

          // Swap possession for second half kickoff
          const secondHalfPossession = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
          const secondHalfKicker = await pickCenterKickoffPlayer(supabase, match_id, secondHalfPossession, participants || []);

          await supabase.from('matches').update({
            current_turn_number: newTurnNumber,
            current_phase: 'positioning_attack',
            possession_club_id: secondHalfPossession,
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_turns').insert({
            match_id, turn_number: newTurnNumber,
            phase: 'positioning_attack',
            possession_club_id: secondHalfPossession,
            ball_holder_participant_id: secondHalfKicker,
            started_at: halftimeStart, ends_at: halftimeEnd,
            status: 'active',
          });

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'second_half',
            title: '⚽ Segundo tempo!',
            body: 'Posicionamento para o início do segundo tempo.',
          });
        } else if (newTurnNumber > MAX_TURNS) {
          const matchMinute = computeMatchMinute(match.current_turn_number);
          await supabase.from('matches').update({
            status: 'finished', finished_at: new Date().toISOString(),
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'final_whistle',
            title: `🏁 Apito final! ${homeScore} – ${awayScore}`,
            body: `Partida encerrada aos ${matchMinute}'.`,
          });
        } else {
          const nextPhaseStart = new Date().toISOString();
          const isNextLooseBall = nextBallHolderParticipantId === null;

          // Dead-ball restarts (goal kickoff, set pieces) get positioning turn
          const isDeadBallRestart = goalScored || (ballEndPos && !isNextLooseBall && (
            detectOutOfBounds(ballEndPos.x, ballEndPos.y, lastTouchClubId || match.home_club_id, match) !== null
          ));
          // OOB set piece restarts also get positioning
          const hadSetPiece = ballEndPos && !goalScored && nextBallHolderParticipantId !== null && !isNextLooseBall && (
            detectOutOfBounds(
              ballEndPos.x, ballEndPos.y, lastTouchClubId || match.home_club_id, match
            ) !== null
          );

          const usePositioning = goalScored || hadSetPiece;
          const nextPhase = isNextLooseBall ? 'attacking_support' : (usePositioning ? 'positioning_attack' : 'ball_holder');
          const nextPhaseDuration = usePositioning ? POSITIONING_PHASE_DURATION_MS : PHASE_DURATION_MS;
          const nextPhaseEnd = new Date(Date.now() + nextPhaseDuration).toISOString();

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
          } else if (usePositioning) {
            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'positioning',
              title: '📍 Posicionamento',
              body: 'Time com a bola posiciona seus jogadores primeiro.',
            });
          }
        }
      } else if (activeTurn.phase === 'ball_holder' && isLooseBall) {
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
        // ── Early deviation at ball_holder → attacking_support transition ──
        if (activeTurn.phase === 'ball_holder' && ballHolder) {
          const profileIds = (participants || []).filter(p => p.player_profile_id).map(p => p.player_profile_id);
          const { data: devAttrRows } = profileIds.length > 0
            ? await supabase.from('player_attributes').select('*').in('player_profile_id', profileIds)
            : { data: [] };
          const devAttrByProfile: Record<string, any> = {};
          for (const row of (devAttrRows || [])) devAttrByProfile[row.player_profile_id] = row;

          const { data: bhActions } = await supabase.from('match_actions')
            .select('*')
            .eq('match_turn_id', activeTurn.id)
            .eq('participant_id', ballHolder.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

          const bhAction = bhActions?.[0];
          if (bhAction && (isPassType(bhAction.action_type) || isShootType(bhAction.action_type)) && bhAction.target_x != null && bhAction.target_y != null) {
            const raw = ballHolder.player_profile_id ? devAttrByProfile[ballHolder.player_profile_id] : null;
            const devAttrs: Record<string, number> = {
              passe_baixo: Number(raw?.passe_baixo ?? 40),
              passe_alto: Number(raw?.passe_alto ?? 40),
              forca_chute: Number(raw?.forca_chute ?? 40),
              acuracia_chute: Number(raw?.acuracia_chute ?? 40),
            };
            const startX = Number(ballHolder.pos_x ?? 50);
            const startY = Number(ballHolder.pos_y ?? 50);
            const deviation = computeDeviation(Number(bhAction.target_x), Number(bhAction.target_y), startX, startY, bhAction.action_type, devAttrs);

            await supabase.from('match_actions').update({
              target_x: deviation.actualX,
              target_y: deviation.actualY,
              payload: { original_target_x: Number(bhAction.target_x), original_target_y: Number(bhAction.target_y), deviated: true, over_goal: deviation.overGoal },
            }).eq('id', bhAction.id);

            console.log(`[ENGINE] Early deviation: (${Number(bhAction.target_x).toFixed(1)},${Number(bhAction.target_y).toFixed(1)}) → (${deviation.actualX.toFixed(1)},${deviation.actualY.toFixed(1)}) dev=${deviation.deviationDist.toFixed(2)}`);

            if (deviation.overGoal) {
              await supabase.from('match_event_logs').insert({
                match_id, event_type: 'shot_over',
                title: '💨 Chute para fora!',
                body: 'A bola foi por cima do gol.',
              });
            }
          }
        }

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

      return new Response(JSON.stringify({ status: 'advanced', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      let activeTurn: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data } = await supabase
          .from('match_turns').select('id').eq('match_id', match_id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).single();
        if (data) { activeTurn = data; break; }
        if (attempt < 2) await new Promise(r => setTimeout(r, 300));
      }

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn', recoverable: true }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      return new Response(JSON.stringify({ status: 'action_submitted', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
