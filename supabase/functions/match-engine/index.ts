import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 6000;
const RESOLUTION_PHASE_DURATION_MS = 3000;
const POSITIONING_PHASE_DURATION_MS = 10000;
const HALFTIME_PAUSE_MS = 5 * 60 * 1000; // 5 minutes halftime
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;
type Phase = typeof PHASES[number];

const TURNS_PER_HALF = 62;
const TOTAL_TURNS = TURNS_PER_HALF * 2; // 124 turns total

// ─── Accuracy deviation ─────────────────────────────────────────
function normalizeAttr(val: number): number {
  return Math.max(0, Math.min(1, (val - 10) / 89));
}

interface DeviationResult {
  actualX: number;
  actualY: number;
  deviationDist: number;
  overGoal: boolean;
}

function computeDeviation(
  targetX: number, targetY: number, startX: number, startY: number,
  actionType: string, attrs: Record<string, number>,
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

  if (actionType === 'shoot_controlled' || actionType === 'shoot_power') {
    const goalX = targetX > 50 ? 100 : 0;
    const distFromGoal = Math.abs(startX - goalX);
    if (distFromGoal > 50) {
      difficultyMultiplier += 20;
    } else if (distFromGoal > 25) {
      const extraPenalty = Math.pow((distFromGoal - 25) / 25, 1.5) * 5;
      difficultyMultiplier += extraPenalty;
    }
  }

  if (isPassType(actionType)) {
    const maxPassDist = actionType === 'pass_low' ? 50 : actionType === 'pass_high' ? 60 : 70;
    if (dist > maxPassDist) {
      const overPct = (dist - maxPassDist) / maxPassDist;
      difficultyMultiplier += overPct * 8;
    }
  }

  const baseDifficulty = (dist / 100) * difficultyMultiplier;
  const skillCurve = Math.pow(1 - skillFactor, 3.5);
  const minimumDeviation = skillFactor < 0.45 ? (1 + (0.45 - skillFactor) * 3) : 0;
  const deviationRadius = (baseDifficulty * skillCurve + minimumDeviation) * (0.6 + Math.random() * 0.4);
  const angle = Math.random() * 2 * Math.PI;
  let actualX = targetX + Math.cos(angle) * deviationRadius;
  let actualY = targetY + Math.sin(angle) * deviationRadius;

  let overGoal = false;
  if (actionType === 'shoot_power' && deviationRadius > 1.0) {
    if (actualY >= 38 && actualY <= 62) {
      actualY = Math.random() > 0.5 ? 35 - Math.random() * 5 : 65 + Math.random() * 5;
      overGoal = true;
    }
  }

  const deviationDist = Math.sqrt((actualX - targetX) ** 2 + (actualY - targetY) ** 2);
  console.log(`[ENGINE] Deviation: intended=(${targetX.toFixed(1)},${targetY.toFixed(1)}) actual=(${actualX.toFixed(1)},${actualY.toFixed(1)}) deviation=${deviationDist.toFixed(2)} skill=${skillFactor.toFixed(2)} overGoal=${overGoal}`);
  return { actualX, actualY, deviationDist, overGoal };
}

// ─── Height-based interception zones ─────────────────────────────
function getInterceptableRanges(actionType: string): Array<[number, number]> {
  switch (actionType) {
    case 'pass_low': return [[0, 1]];
    case 'pass_high': return [[0, 0.2], [0.8, 1]];
    case 'pass_launch': return [[0, 0.35], [0.65, 1]];
    case 'shoot_controlled': return [[0, 1]];
    case 'shoot_power': return [[0, 0.3]];
    case 'move': return [[0, 1]];
    default: return [[0, 1]];
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
  if (bhActionType === 'move' && isOpponent) return { type: 'tackle', baseChance: 0.45 };
  if (isShootType(bhActionType)) {
    if (interceptorRoleType === 'GK' || !isOpponent) return { type: 'gk_save', baseChance: 0.35 };
    return { type: 'block_shot', baseChance: 0.25 };
  }
  if (bhActionType === 'pass_low') return { type: 'receive_pass', baseChance: 0.85 };
  if (bhActionType === 'pass_high') return { type: 'receive_pass', baseChance: 0.60 };
  if (bhActionType === 'pass_launch') return { type: 'receive_pass', baseChance: 0.70 };
  return { type: 'receive_pass', baseChance: 0.75 };
}

function computeInterceptSuccess(
  context: InterceptContext,
  attackerAttrs: Record<string, number>,
  defenderAttrs: Record<string, number>,
): { success: boolean; chance: number; foul: boolean } {
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

  // Foul check: only for tackles that FAIL
  let foul = false;
  if (context.type === 'tackle' && !success) {
    const tackleSkill = (normalizeAttr(defenderAttrs.desarme ?? 40) + normalizeAttr(defenderAttrs.marcacao ?? 40)) / 2;
    const foulChance = (1 - tackleSkill) * 0.35;
    foul = Math.random() < foulChance;
    if (foul) console.log(`[ENGINE] ⚠️ FOUL! tackleSkill=${tackleSkill.toFixed(2)} foulChance=${(foulChance*100).toFixed(0)}%`);
  }

  console.log(`[ENGINE] Intercept ${context.type}: defSkill=${defenderSkill.toFixed(2)} atkSkill=${attackerSkill.toFixed(2)} chance=${(successChance*100).toFixed(1)}% roll=${roll.toFixed(3)} success=${success} foul=${foul}`);
  return { success, chance: successChance, foul };
}

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string, attrByProfile: Record<string, any>): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
  looseBallPos?: { x: number; y: number };
  failedContestParticipantId?: string;
  failedContestLog?: string;
  foul?: boolean;
  foulPosition?: { x: number; y: number };
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
  const interceptors = findInterceptorCandidates(allActions, _attacker, participants);

  for (const candidate of interceptors) {
    const defAttrs = getFullAttrs(candidate.participant);
    const slotPos = candidate.participant.slot_position || candidate.participant.field_pos || '';
    const isGK = slotPos === 'GK';
    const context = getInterceptContext(bhActionType, candidate.participant.club_id, bh?.club_id || possClubId, isGK ? 'GK' : 'player');
    const { success, chance, foul } = computeInterceptSuccess(context, bhAttrs, defAttrs);
    const chancePct = `${(chance * 100).toFixed(0)}%`;

    if (success) {
      if (context.type === 'tackle') return { success: false, event: 'tackle', description: `🦵 Desarme bem-sucedido! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
      if (context.type === 'block_shot') {
        const blockX = candidate.interceptX ?? 50;
        const blockY = candidate.interceptY ?? 50;
        const deflectAngle = Math.random() * 2 * Math.PI;
        const deflectDist = 3 + Math.random() * 5;
        return { success: false, event: 'blocked', description: `🛡️ Bloqueio! (${chancePct})`, possession_change: false, goal: false, newBallHolderId: undefined, looseBallPos: { x: Math.max(0, Math.min(100, blockX + Math.cos(deflectAngle) * deflectDist)), y: Math.max(0, Math.min(100, blockY + Math.sin(deflectAngle) * deflectDist)) } };
      }
      if (context.type === 'gk_save') return { success: false, event: 'saved', description: `🧤 Defesa do goleiro! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada! (${chancePct})`, possession_change: candidate.participant.club_id !== possClubId, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
    } else {
      if (context.type === 'tackle') {
        if (foul) {
          return { success: false, event: 'foul', description: `🟡 Falta! (Desarme: ${chancePct})`, possession_change: false, goal: false, foul: true, foulPosition: { x: candidate.interceptX ?? 50, y: candidate.interceptY ?? 50 }, failedContestParticipantId: candidate.participant.id, failedContestLog: `🟡 Falta cometida! (${chancePct})` };
        }
        return { success: true, event: 'dribble', description: `🏃 Drible bem-sucedido! (Desarme: ${chancePct})`, possession_change: false, goal: false, failedContestParticipantId: candidate.participant.id, failedContestLog: `🦵 Desarme falhou! (${chancePct})` };
      } else if (context.type === 'block_shot') {
        console.log(`[ENGINE] 💨 Bloqueio falhou! (${chancePct}) Chute continua.`);
      } else if (context.type === 'gk_save') {
        console.log(`[ENGINE] 🧤 Goleiro não segurou! (${chancePct})`);
      } else {
        console.log(`[ENGINE] ❌ Falhou o domínio! (${chancePct}) Bola continua.`);
      }
    }
  }

  if (isShootType(action)) return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true };
  if (isPassType(action)) return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  if (action === 'move') return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
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
    if (dist <= 2) {
      const isInInterceptableZone = interceptableRanges.some(([lo, hi]) => t >= lo && t <= hi);
      if (isInInterceptableZone) {
        interceptors.push({ participant: participants.find((p: any) => p.id === a.participant_id), progress: t, interceptX: cx, interceptY: cy });
      }
    }
  }
  interceptors.sort((a, b) => a.progress - b.progress);
  return interceptors;
}

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
      .eq('match_id', matchId).eq('club_id', clubId).eq('role_type', 'player');
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

interface PhysicsPlayerState { pos: Vec2; vel: Vec2; }

function simulatePlayerMovement(
  startPos: Vec2, targetPos: Vec2,
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
    if (newDist < 0.3 || newDist > dist) { state.pos = { ...targetPos }; break; }
  }
  return state.pos;
}

interface BallPhysicsResult { finalPos: Vec2; speedAtEnd: number; }

function simulateBallPhysics(
  startPos: Vec2, targetPos: Vec2, actionType: string,
  attrs: { passe_baixo: number; passe_alto: number; forca_chute: number; acuracia_chute: number },
): BallPhysicsResult {
  let impulse: number;
  let friction: number;
  if (actionType === 'pass_low') { impulse = 8 + normalizeAttr(attrs.passe_baixo) * 4; friction = 0.92; }
  else if (actionType === 'pass_high') { impulse = 12 + normalizeAttr(attrs.passe_alto) * 5; friction = 0.90; }
  else if (actionType === 'pass_launch') { impulse = 10 + (normalizeAttr(attrs.passe_baixo) + normalizeAttr(attrs.passe_alto)) / 2 * 5; friction = 0.91; }
  else if (actionType === 'shoot_controlled') { impulse = 12 + normalizeAttr(attrs.acuracia_chute) * 6; friction = 0.93; }
  else if (actionType === 'shoot_power') { impulse = 18 + normalizeAttr(attrs.forca_chute) * 10; friction = 0.96; }
  else if (actionType === 'shoot') { impulse = 15 + normalizeAttr(attrs.forca_chute) * 8; friction = 0.95; }
  else return { finalPos: { ...targetPos }, speedAtEnd: 0 };

  const dir = vecNorm({ x: targetPos.x - startPos.x, y: targetPos.y - startPos.y });
  const totalDist = vecLen({ x: targetPos.x - startPos.x, y: targetPos.y - startPos.y });
  let vel = impulse / NUM_SUBSTEPS;
  const pos = { ...startPos };
  let speed = 0;
  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    pos.x += dir.x * vel; pos.y += dir.y * vel;
    vel *= friction; speed = vel * NUM_SUBSTEPS;
    const traveled = vecLen({ x: pos.x - startPos.x, y: pos.y - startPos.y });
    if (traveled >= totalDist) return { finalPos: { ...targetPos }, speedAtEnd: speed };
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
    ranked.push({ participant, distance: Math.sqrt((action.target_x - startX) ** 2 + (action.target_y - startY) ** 2), createdAt: new Date(action.created_at || 0).getTime() });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.distance - b.distance || a.createdAt - b.createdAt);
  return ranked[0].participant;
}

// ─── Out of bounds detection ─────────────────────────────────
interface OOBResult { type: 'throw_in' | 'corner' | 'goal_kick'; awardedClubId: string; exitX: number; exitY: number; side?: 'top' | 'bottom'; }

function detectOutOfBounds(ballX: number, ballY: number, lastTouchClubId: string, match: { home_club_id: string; away_club_id: string }): OOBResult | null {
  const oppositeClub = lastTouchClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
  if (ballY <= 1 || ballY >= 99) return { type: 'throw_in', awardedClubId: oppositeClub, exitX: ballX, exitY: ballY, side: ballY <= 1 ? 'top' : 'bottom' };
  if (ballX <= 1) {
    if (lastTouchClubId === match.home_club_id) return { type: 'corner', awardedClubId: match.away_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    else return { type: 'goal_kick', awardedClubId: match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
  }
  if (ballX >= 99) {
    if (lastTouchClubId === match.away_club_id) return { type: 'corner', awardedClubId: match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    else return { type: 'goal_kick', awardedClubId: match.away_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
  }
  return null;
}

async function handleSetPiece(
  supabase: any, matchId: string, oob: OOBResult, participants: any[],
  match: { home_club_id: string; away_club_id: string }, allActions: any[]
): Promise<{ playerId: string; clubId: string; title: string; body: string } | null> {
  const teamPlayers = participants.filter((p: any) => p.club_id === oob.awardedClubId && p.role_type === 'player');
  if (teamPlayers.length === 0) return null;
  const isHomeTeam = oob.awardedClubId === match.home_club_id;

  const slotIds = teamPlayers.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id);
  const { data: slots } = slotIds.length > 0 ? await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds) : { data: [] };
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
      return Math.sqrt((posA.x - oob.exitX) ** 2 + (posA.y - oob.exitY) ** 2) - Math.sqrt((posB.x - oob.exitX) ** 2 + (posB.y - oob.exitY) ** 2);
    });
    const chosen = candidates[0];
    const restartY = oob.side === 'top' ? 1 : 99;
    const restartX = Math.max(2, Math.min(98, oob.exitX));
    await supabase.from('match_participants').update({ pos_x: restartX, pos_y: restartY }).eq('id', chosen.id);
    return { playerId: chosen.id, clubId: oob.awardedClubId, title: '🏳️ Lateral!', body: `Reposição pela lateral para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.` };
  }

  if (oob.type === 'corner') {
    const forwards = teamPlayers.filter((p: any) => ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(getSlotPos(p).toUpperCase()));
    const chosen = forwards.length > 0 ? forwards[0] : teamPlayers.filter((p: any) => getSlotPos(p) !== 'GK')[0] || teamPlayers[0];
    const cornerX = isHomeTeam ? 99 : 1;
    const cornerY = oob.side === 'top' ? 1 : 99;
    await supabase.from('match_participants').update({ pos_x: cornerX, pos_y: cornerY }).eq('id', chosen.id);
    return { playerId: chosen.id, clubId: oob.awardedClubId, title: '🚩 Escanteio!', body: `Escanteio para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.` };
  }

  if (oob.type === 'goal_kick') {
    const gk = teamPlayers.find((p: any) => getSlotPos(p).toUpperCase() === 'GK') || teamPlayers[0];
    const gkX = isHomeTeam ? 6 : 94;
    const gkY = Math.max(40, Math.min(60, oob.exitY));
    await supabase.from('match_participants').update({ pos_x: gkX, pos_y: gkY }).eq('id', gk.id);
    return { playerId: gk.id, clubId: oob.awardedClubId, title: '🥅 Tiro de Meta!', body: `Tiro de meta para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.` };
  }
  return null;
}

// ─── Bot AI: generate actions for bots that haven't acted ─────
async function generateBotActions(
  supabase: any,
  matchId: string,
  activeTurnId: string,
  phase: string,
  participants: any[],
  possClubId: string | null,
  ballHolderParticipantId: string | null,
  match: { home_club_id: string; away_club_id: string; current_turn_number: number },
  existingActionParticipantIds: Set<string>,
  attrByProfile: Record<string, any>,
) {
  const players = participants.filter(p => p.role_type === 'player');
  const botActions: any[] = [];

  // Helper: compute max move range for a bot
  const botMoveRange = (p: any): number => {
    const raw = p.player_profile_id ? attrByProfile[p.player_profile_id] : null;
    const vel = Number(raw?.velocidade ?? 40);
    const accel = Number(raw?.aceleracao ?? 40);
    const stam = Number(raw?.stamina ?? 40);
    const forca = Number(raw?.forca ?? 40);
    const base = 8 + normalizeAttr(vel) * 17;
    const af = 0.6 + normalizeAttr(accel) * 0.4;
    const sd = 1.0 - (Math.max(0, match.current_turn_number - 20) / 40) * (1 - normalizeAttr(stam)) * 0.2;
    const ff = 1.0 + normalizeAttr(forca) * 0.1;
    return base * af * sd * ff;
  };

  // Ball position for reference
  const ballHolder = ballHolderParticipantId ? players.find(p => p.id === ballHolderParticipantId) : null;
  const ballX = Number(ballHolder?.pos_x ?? 50);
  const ballY = Number(ballHolder?.pos_y ?? 50);

  const isHome = (clubId: string) => clubId === match.home_club_id;

  for (const p of players) {
    if (existingActionParticipantIds.has(p.id)) continue; // Human or manager already acted

    const px = Number(p.pos_x ?? 50);
    const py = Number(p.pos_y ?? 50);
    const isAttacking = p.club_id === possClubId;
    const isBH = p.id === ballHolderParticipantId;
    const maxRange = botMoveRange(p);

    // Phase 1: Ball holder bot
    if (phase === 'ball_holder' && isBH) {
      // Bot ball holder: look for a teammate to pass to, or dribble forward
      const teammates = players.filter(t => t.club_id === p.club_id && t.id !== p.id);
      const goalX = isHome(p.club_id) ? 100 : 0;
      
      // Check if in shooting range
      const distToGoal = Math.abs(px - goalX);
      if (distToGoal < 30) {
        // Shoot!
        const shotY = 45 + Math.random() * 10; // aim roughly at goal center
        botActions.push({
          match_id: matchId, match_turn_id: activeTurnId,
          participant_id: p.id, controlled_by_type: 'bot',
          action_type: Math.random() > 0.5 ? 'shoot_controlled' : 'shoot_power',
          target_x: goalX, target_y: shotY,
          status: 'pending',
        });
        console.log(`[BOT] Ball holder ${p.id.slice(0,8)} shoots at goal`);
        continue;
      }

      // Find best pass target: teammate closest to opponent goal
      const bestTarget = teammates
        .filter(t => {
          const tx = Number(t.pos_x ?? 50);
          return isHome(p.club_id) ? tx > px - 5 : tx < px + 5; // forward or lateral
        })
        .sort((a, b) => {
          const da = Math.abs(Number(a.pos_x ?? 50) - goalX);
          const db = Math.abs(Number(b.pos_x ?? 50) - goalX);
          return da - db;
        })[0];

      if (bestTarget && Math.random() > 0.3) {
        const tx = Number(bestTarget.pos_x ?? 50);
        const ty = Number(bestTarget.pos_y ?? 50);
        const dist = Math.sqrt((tx - px) ** 2 + (ty - py) ** 2);
        const passType = dist > 40 ? 'pass_high' : dist > 25 ? 'pass_launch' : 'pass_low';
        botActions.push({
          match_id: matchId, match_turn_id: activeTurnId,
          participant_id: p.id, controlled_by_type: 'bot',
          action_type: passType,
          target_x: tx, target_y: ty,
          target_participant_id: bestTarget.id,
          status: 'pending',
        });
        console.log(`[BOT] Ball holder ${p.id.slice(0,8)} passes to ${bestTarget.id.slice(0,8)}`);
      } else {
        // Dribble forward
        const dribbleDir = isHome(p.club_id) ? 1 : -1;
        const dx = dribbleDir * (3 + Math.random() * Math.min(maxRange * 0.5, 8));
        const dy = (Math.random() - 0.5) * 6;
        botActions.push({
          match_id: matchId, match_turn_id: activeTurnId,
          participant_id: p.id, controlled_by_type: 'bot',
          action_type: 'move',
          target_x: Math.max(1, Math.min(99, px + dx)),
          target_y: Math.max(1, Math.min(99, py + dy)),
          status: 'pending',
        });
        console.log(`[BOT] Ball holder ${p.id.slice(0,8)} dribbles forward`);
      }
      continue;
    }

    // Phase 2: Attacking support bots
    if (phase === 'attacking_support' && isAttacking && !isBH) {
      // Move towards a useful attacking position
      const goalX = isHome(p.club_id) ? 100 : 0;
      const forwardBias = isHome(p.club_id) ? 1 : -1;
      
      // Move towards ball or forward, with some randomness
      const moveScale = Math.min(maxRange, 10);
      let targetX = px + forwardBias * (2 + Math.random() * moveScale * 0.5);
      let targetY = py + (ballY - py) * 0.2 + (Math.random() - 0.5) * 8;
      
      // Clamp to field and range
      targetX = Math.max(1, Math.min(99, targetX));
      targetY = Math.max(1, Math.min(99, targetY));
      const dx = targetX - px;
      const dy = targetY - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRange) {
        const scale = maxRange / dist;
        targetX = px + dx * scale;
        targetY = py + dy * scale;
      }

      botActions.push({
        match_id: matchId, match_turn_id: activeTurnId,
        participant_id: p.id, controlled_by_type: 'bot',
        action_type: 'move',
        target_x: targetX, target_y: targetY,
        status: 'pending',
      });
      continue;
    }

    // Phase 2 for ball holder: mini-move after passing (already acted in phase 1)
    if (phase === 'attacking_support' && isBH) {
      const forwardBias = isHome(p.club_id) ? 1 : -1;
      const miniRange = maxRange * 0.35;
      const targetX = Math.max(1, Math.min(99, px + forwardBias * (1 + Math.random() * miniRange * 0.5)));
      const targetY = Math.max(1, Math.min(99, py + (Math.random() - 0.5) * 4));
      botActions.push({
        match_id: matchId, match_turn_id: activeTurnId,
        participant_id: p.id, controlled_by_type: 'bot',
        action_type: 'move',
        target_x: targetX, target_y: targetY,
        status: 'pending',
      });
      continue;
    }

    // Phase 3: Defending bots
    if (phase === 'defending_response' && !isAttacking) {
      // Move towards ball or mark nearest attacker
      const defBias = isHome(p.club_id) ? -1 : 1; // move towards own goal
      
      // GK stays near goal
      const slotPos = p.slot_position || '';
      if (slotPos === 'GK') {
        const homeGoalX = isHome(p.club_id) ? 5 : 95;
        const gkTargetX = homeGoalX + (ballX > 50 && isHome(p.club_id) ? 3 : !isHome(p.club_id) && ballX < 50 ? -3 : 0);
        const gkTargetY = Math.max(35, Math.min(65, py + (ballY - py) * 0.3));
        const dx = gkTargetX - px;
        const dy = gkTargetY - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let tx = gkTargetX, ty = gkTargetY;
        if (dist > maxRange) { const s = maxRange / dist; tx = px + dx * s; ty = py + dy * s; }
        botActions.push({
          match_id: matchId, match_turn_id: activeTurnId,
          participant_id: p.id, controlled_by_type: 'bot',
          action_type: 'move', target_x: tx, target_y: ty, status: 'pending',
        });
        continue;
      }

      // Move towards ball with compactness
      const moveScale = Math.min(maxRange, 8);
      let targetX = px + (ballX - px) * 0.3 + defBias * (1 + Math.random() * 2);
      let targetY = py + (ballY - py) * 0.2 + (Math.random() - 0.5) * 4;
      targetX = Math.max(1, Math.min(99, targetX));
      targetY = Math.max(1, Math.min(99, targetY));
      const dx = targetX - px;
      const dy = targetY - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRange) {
        const scale = maxRange / dist;
        targetX = px + dx * scale;
        targetY = py + dy * scale;
      }

      botActions.push({
        match_id: matchId, match_turn_id: activeTurnId,
        participant_id: p.id, controlled_by_type: 'bot',
        action_type: 'move', target_x: targetX, target_y: targetY, status: 'pending',
      });
      continue;
    }
  }

  // Insert all bot actions at once
  if (botActions.length > 0) {
    await supabase.from('match_actions').insert(botActions);
    console.log(`[BOT] Generated ${botActions.length} bot actions for phase ${phase}`);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function claimActiveTurnForProcessing(supabase: any, matchId: string) {
  const processingToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc('claim_match_turn_for_processing', {
    p_match_id: matchId,
    p_processing_token: processingToken,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;

  const claimedTurn = Array.isArray(data) ? data[0] : data;
  if (!claimedTurn) return null;

  return { claimedTurn, processingToken };
}

async function releaseTurnProcessing(supabase: any, turnId: string, processingToken: string) {
  const { error } = await supabase.rpc('release_match_turn_processing', {
    p_turn_id: turnId,
    p_processing_token: processingToken,
  });
  if (error) {
    console.error('[ENGINE] Failed to release turn processing lock', { turnId, error });
  }
}

async function invokeTickForMatch(functionUrl: string, matchId: string) {
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tick', match_id: matchId }),
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

async function autoStartDueMatches(supabase: any, matchId?: string | null) {
  const now = new Date().toISOString();
  let query = supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, home_lineup_id, away_lineup_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  if (matchId) {
    query = query.eq('id', matchId);
  }

  const { data: dueMatches } = await query;
  const started: string[] = [];

  for (const m of (dueMatches || [])) {
    const possessionClubId = m.home_club_id;
    const { data: claimedMatch } = await supabase.from('matches').update({
      status: 'live',
      started_at: now,
      current_phase: 'ball_holder',
      current_turn_number: 1,
      possession_club_id: possessionClubId,
    }).eq('id', m.id).eq('status', 'scheduled').lte('scheduled_at', now).select('id').maybeSingle();

    if (!claimedMatch) {
      continue;
    }

    const ballHolderParticipantId = await pickCenterKickoffPlayer(supabase, m.id, possessionClubId);

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
      set_piece_type: 'kickoff',
    });

    await supabase.from('match_event_logs').insert({
      match_id: m.id,
      event_type: 'kickoff',
      title: 'Partida iniciada!',
      body: 'Time da casa comeca com a bola no meio-campo.',
    });
    started.push(m.id);
  }

  return started;
}

async function processDueMatches(supabase: any, functionUrl: string, matchId?: string | null) {
  const started = await autoStartDueMatches(supabase, matchId);
  const now = new Date().toISOString();
  let query = supabase
    .from('match_turns')
    .select('match_id')
    .eq('status', 'active')
    .lte('ends_at', now);

  if (matchId) {
    query = query.eq('match_id', matchId);
  }

  const { data: dueTurns } = await query;
  const dueMatchIds = [...new Set((dueTurns || []).map((turn: any) => turn.match_id).filter(Boolean))];

  let advanced = 0;
  let busy = 0;
  let failed = 0;

  for (const dueMatchId of dueMatchIds) {
    try {
      const { response, result } = await invokeTickForMatch(functionUrl, dueMatchId);
      if (result?.status === 'busy') {
        busy += 1;
        continue;
      }
      if (result?.status === 'waiting') {
        continue;
      }
      if (response.ok) {
        advanced += 1;
      } else {
        failed += 1;
        console.error('[ENGINE] process_due_matches failed', { matchId: dueMatchId, result });
      }
    } catch (error) {
      failed += 1;
      console.error('[ENGINE] process_due_matches tick error', { matchId: dueMatchId, error });
    }
  }

  return {
    started,
    started_count: started.length,
    advanced,
    busy,
    failed,
  };
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
      const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).single();
      if (!match) return new Response(JSON.stringify({ error: 'Match not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      await supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('match_id', match_id).eq('status', 'active');
      await supabase.from('matches').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', match_id);
      await supabase.from('match_event_logs').insert({ match_id, event_type: 'final_whistle', title: `🏁 Apito final! ${match.home_score} – ${match.away_score}`, body: 'Partida encerrada manualmente.' });
      return new Response(JSON.stringify({ status: 'finished', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── AUTO-START ───
    if (action === 'auto_start' || !action) {
      const started = await autoStartDueMatches(supabase, match_id);
      return jsonResponse({ started, started_count: started.length, server_now: Date.now() });
    }

    if (action === 'process_due_matches') {
      const result = await processDueMatches(supabase, req.url, match_id);
      return jsonResponse({ ...result, server_now: Date.now() });
    }
    if (action === 'tick' && match_id) {
      const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).eq('status', 'live').single();
      if (!match) return new Response(JSON.stringify({ error: 'Match not found or not live' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let { data: activeTurn } = await supabase.from('match_turns').select('*').eq('match_id', match_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
      if (!activeTurn) return new Response(JSON.stringify({ error: 'No active turn' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const now = new Date();
      const endsAt = new Date(activeTurn.ends_at);
      if (!forceTick && now < endsAt) return new Response(JSON.stringify({ status: 'waiting', remaining_ms: endsAt.getTime() - now.getTime(), server_now: now.getTime() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const turnClaim = await claimActiveTurnForProcessing(supabase, match_id);
      if (!turnClaim) {
        return jsonResponse({ status: 'busy', server_now: now.getTime() });
      }

      activeTurn = turnClaim.claimedTurn;
      const lockedEndsAt = new Date(activeTurn.ends_at);
      if (lockedEndsAt > now) {
        await releaseTurnProcessing(supabase, activeTurn.id, turnClaim.processingToken);
        return new Response(JSON.stringify({ status: 'waiting', remaining_ms: lockedEndsAt.getTime() - now.getTime(), server_now: now.getTime() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        const { data: participants } = await supabase.from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player');
        const possClubId = activeTurn.possession_club_id;
      const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
      const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);
      const ballHolder = activeTurn.ball_holder_participant_id ? (participants || []).find(p => p.id === activeTurn.ball_holder_participant_id) : null;
      const isLooseBall = !activeTurn.ball_holder_participant_id;

      // ── Load attributes for bot AI + physics ──
      const profileIds = (participants || []).filter(p => p.player_profile_id).map(p => p.player_profile_id);
      let attrByProfile: Record<string, any> = {};
      if (profileIds.length > 0) {
        const { data: attrRows } = await supabase.from('player_attributes').select('*').in('player_profile_id', profileIds);
        for (const row of (attrRows || [])) attrByProfile[row.player_profile_id] = row;
      }

      // ── Enrich participants with slot positions for GK detection ──
      const slotIds = (participants || []).filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id);
      if (slotIds.length > 0) {
        const { data: slots } = await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds);
        const slotMap = new Map((slots || []).map((s: any) => [s.id, s.slot_position]));
        for (const p of (participants || [])) {
          if (p.lineup_slot_id && slotMap.has(p.lineup_slot_id)) {
            p.slot_position = slotMap.get(p.lineup_slot_id);
          }
        }
      }

      // ── Generate bot actions BEFORE phase transition ──
      // Get existing actions to know which participants already acted
      const { data: existingActions } = await supabase.from('match_actions').select('participant_id').eq('match_turn_id', activeTurn.id).eq('status', 'pending');
      const existingActionPids = new Set((existingActions || []).map(a => a.participant_id));

      // Only generate bot actions for phases 1-3 (not resolution or positioning)
      const currentPhase = activeTurn.phase;
      if (['ball_holder', 'attacking_support', 'defending_response'].includes(currentPhase)) {
        await generateBotActions(
          supabase, match_id, activeTurn.id, currentPhase,
          participants || [], possClubId, activeTurn.ball_holder_participant_id,
          match, existingActionPids, attrByProfile,
        );
      }

      // ── RESOLUTION ──
      let newPossessionClubId = possClubId;
      let homeScore = match.home_score;
      let awayScore = match.away_score;
      let nextBallHolderParticipantId = ballHolder?.id || null;
      let ballEndPos: { x: number; y: number } | null = null;
      const lastTouchClubId = possClubId;
      let nextSetPieceType: string | null = null;

      const getAttrs = (part: any) => {
        const raw = part?.player_profile_id ? attrByProfile[part.player_profile_id] : null;
        return {
          aceleracao: Number(raw?.aceleracao ?? 40), agilidade: Number(raw?.agilidade ?? 40),
          velocidade: Number(raw?.velocidade ?? 40), forca: Number(raw?.forca ?? 40),
          stamina: Number(raw?.stamina ?? 40), passe_baixo: Number(raw?.passe_baixo ?? 40),
          passe_alto: Number(raw?.passe_alto ?? 40), forca_chute: Number(raw?.forca_chute ?? 40),
          acuracia_chute: Number(raw?.acuracia_chute ?? 40), controle_bola: Number(raw?.controle_bola ?? 40),
          um_toque: Number(raw?.um_toque ?? 40),
        };
      };

      if (activeTurn.phase === 'resolution') {
        console.log(`[ENGINE] Resolution phase: turn=${match.current_turn_number} ballHolder=${activeTurn.ball_holder_participant_id?.slice(0,8) ?? 'NONE'} possession=${possClubId?.slice(0,8) ?? 'NONE'}`);
        const { data: turnRows } = await supabase.from('match_turns').select('id').eq('match_id', match_id).eq('turn_number', activeTurn.turn_number);
        const allTurnIds = (turnRows || []).map(t => t.id);
        const { data: rawActions } = await supabase.from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending').order('created_at', { ascending: false });

        const seenParticipants = new Map<string, string[]>();
        const allActions = (rawActions || []).filter(a => {
          const existing = seenParticipants.get(a.participant_id);
          if (!existing) { seenParticipants.set(a.participant_id, [a.action_type]); return true; }
          const isBallHolder = a.participant_id === activeTurn.ball_holder_participant_id;
          if (isBallHolder) {
            const hasBallAction = existing.some(t => isPassType(t) || isShootType(t));
            const hasMoveAction = existing.some(t => t === 'move');
            if ((isPassType(a.action_type) || isShootType(a.action_type)) && !hasBallAction) { existing.push(a.action_type); return true; }
            if (a.action_type === 'move' && !hasMoveAction) { existing.push(a.action_type); return true; }
            return false;
          }
          return false;
        });

        // Apply movement
        const bhHasBallAction = ballHolder && allActions.some(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));
        console.log(`[ENGINE] Processing ${allActions.length} actions bhHasBallAction=${bhHasBallAction}`);

        for (const a of allActions) {
          if ((a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null) {
            if (a.participant_id === ballHolder?.id && a.action_type === 'move' && bhHasBallAction) { console.log(`[ENGINE] Deferring BH move`); continue; }
            await supabase.from('match_participants').update({ pos_x: Number(a.target_x), pos_y: Number(a.target_y) }).eq('id', a.participant_id);
          }
        }

        if (ballHolder) {
          const ballHolderAction = allActions.find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)))
            || allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');

          if (ballHolderAction) {
            const result = resolveAction(ballHolderAction.action_type, ballHolderAction, null, allActions, participants || [], possClubId || '', attrByProfile);

            if (result.goal) {
              const isOverGoal = ballHolderAction.payload && typeof ballHolderAction.payload === 'object' && (ballHolderAction.payload as any).over_goal;
              const shotTargetY = Number(ballHolderAction.target_y ?? 50);
              const isOnTarget = shotTargetY >= 38 && shotTargetY <= 62 && !isOverGoal;

              if (isOnTarget) {
                if (possClubId === match.home_club_id) homeScore++; else awayScore++;
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'goal', title: `⚽ GOL! ${homeScore} – ${awayScore}`, body: `Turno ${match.current_turn_number}` });
                newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
                nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
                nextSetPieceType = 'kickoff';
              } else {
                nextBallHolderParticipantId = null;
                ballEndPos = { x: Number(ballHolderAction.target_x ?? 50), y: shotTargetY };
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'shot_missed', title: isOverGoal ? '💨 Chute por cima do gol!' : '💨 Chute para fora!', body: isOverGoal ? 'A bola foi por cima do gol.' : 'A bola saiu pela linha de fundo.' });
              }
            } else if (result.looseBallPos) {
              nextBallHolderParticipantId = null;
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'blocked', title: result.description, body: `Bola espirrou para (${result.looseBallPos.x.toFixed(0)},${result.looseBallPos.y.toFixed(0)})` });
            } else if (result.newBallHolderId) {
              nextBallHolderParticipantId = result.newBallHolderId;
              newPossessionClubId = result.newPossessionClubId || possClubId;
              await supabase.from('match_event_logs').insert({ match_id, event_type: result.possession_change ? 'possession_change' : (result.event === 'tackle' ? 'tackle' : 'pass_complete'), title: result.possession_change ? `🔄 Troca de posse` : result.description, body: result.description });
            } else if (result.foul && result.foulPosition) {
              // Foul: ball holder keeps ball at foul position for free kick
              nextBallHolderParticipantId = ballHolder.id;
              await supabase.from('match_participants').update({ pos_x: result.foulPosition.x, pos_y: result.foulPosition.y }).eq('id', ballHolder.id);
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'foul', title: result.description, body: 'Falta cometida! Tiro livre para o time atacante.' });
              nextSetPieceType = 'free_kick';
              if (result.failedContestLog) {
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'foul_detail', title: result.failedContestLog, body: 'O defensor cometeu falta.' });
              }
            } else if (result.event === 'dribble') {
              nextBallHolderParticipantId = ballHolder.id;
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'dribble', title: result.description, body: 'O desarme falhou e o jogador seguiu com a bola.' });
              if (result.failedContestLog) {
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'tackle_failed', title: result.failedContestLog, body: 'O defensor perdeu o equilíbrio e terá penalidade de velocidade.' });
              }
              if (result.failedContestParticipantId) {
                const failedPart = (participants || []).find((p: any) => p.id === result.failedContestParticipantId);
                if (failedPart) {
                  const failMoveAct = allActions.find((a: any) => a.participant_id === failedPart.id && (a.action_type === 'move' || a.action_type === 'receive') && a.target_x != null && a.target_y != null);
                  if (failMoveAct) {
                    const startX = Number(failedPart.pos_x ?? 50);
                    const startY = Number(failedPart.pos_y ?? 50);
                    await supabase.from('match_participants').update({ pos_x: startX + (Number(failMoveAct.target_x) - startX) * 0.75, pos_y: startY + (Number(failMoveAct.target_y) - startY) * 0.75 }).eq('id', failedPart.id);
                  }
                }
              }
            } else if (isPassType(ballHolderAction.action_type)) {
              if (ballHolderAction.target_participant_id) {
                nextBallHolderParticipantId = ballHolderAction.target_participant_id;
              } else if (ballHolderAction.target_x != null && ballHolderAction.target_y != null) {
                let closestDist = Infinity;
                let closestId: string | null = null;
                for (const p of (participants || [])) {
                  if (p.id === ballHolder.id) continue;
                  const moveAction = allActions.find(a => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive'));
                  const px = moveAction?.target_x ?? p.pos_x ?? 50;
                  const py = moveAction?.target_y ?? p.pos_y ?? 50;
                  const dist = Math.sqrt((px - ballHolderAction.target_x) ** 2 + (py - ballHolderAction.target_y) ** 2);
                  if (dist < closestDist) { closestDist = dist; closestId = p.id; }
                }
                if (closestId && closestDist <= 8) {
                  nextBallHolderParticipantId = closestId;
                  const closestPlayer = (participants || []).find(p => p.id === closestId);
                  if (closestPlayer && closestPlayer.club_id !== possClubId) {
                    newPossessionClubId = closestPlayer.club_id;
                    await supabase.from('match_event_logs').insert({ match_id, event_type: 'possession_change', title: '🔄 Troca de posse', body: 'Passe interceptado pelo adversário mais próximo.' });
                  }
                } else {
                  nextBallHolderParticipantId = null;
                  await supabase.from('match_event_logs').insert({ match_id, event_type: 'loose_ball', title: '⚽ Bola solta!', body: 'Passe para área vazia. Ninguém está com a bola.' });
                }
              }
            } else if (ballHolderAction.action_type === 'move') {
              nextBallHolderParticipantId = ballHolder.id;
            }
          }

          // ── Offside check for completed passes ──
          if (ballHolderAction && isPassType(ballHolderAction.action_type) && nextBallHolderParticipantId && nextBallHolderParticipantId !== ballHolder.id) {
            const receiver = (participants || []).find(p => p.id === nextBallHolderParticipantId);
            if (receiver && receiver.club_id === possClubId && checkOffside(receiver, ballHolder, participants || [], possClubId || '', match)) {
              const defClub = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
              const defPlayersForFK = (participants || []).filter(p => p.club_id === defClub && p.role_type === 'player');
              const offsideX = Number(receiver.pos_x ?? 50);
              const offsideY = Number(receiver.pos_y ?? 50);
              defPlayersForFK.sort((a: any, b: any) => {
                const dA = Math.sqrt((Number(a.pos_x ?? 50) - offsideX) ** 2 + (Number(a.pos_y ?? 50) - offsideY) ** 2);
                const dB = Math.sqrt((Number(b.pos_x ?? 50) - offsideX) ** 2 + (Number(b.pos_y ?? 50) - offsideY) ** 2);
                return dA - dB;
              });
              const fkTaker = defPlayersForFK[0];
              if (fkTaker) {
                await supabase.from('match_participants').update({ pos_x: offsideX, pos_y: offsideY }).eq('id', fkTaker.id);
                nextBallHolderParticipantId = fkTaker.id;
              } else {
                nextBallHolderParticipantId = null;
              }
              newPossessionClubId = defClub;
              nextSetPieceType = 'free_kick';
              ballEndPos = { x: offsideX, y: offsideY };
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'offside', title: '🚩 Impedimento!', body: 'Jogador em posição irregular. Tiro livre indireto.' });
            }
          }
        } else {
          // LOOSE BALL
          const { data: prevTurnData } = await supabase.from('match_turns').select('ball_holder_participant_id').eq('match_id', match_id).eq('turn_number', match.current_turn_number - 1).order('created_at', { ascending: false }).limit(1).maybeSingle();
          const wasAlreadyLoose = prevTurnData && prevTurnData.ball_holder_participant_id === null && match.current_turn_number > 1;
          const looseBallClaimer = findLooseBallClaimer(allActions, participants || []);

          if (looseBallClaimer) {
            nextBallHolderParticipantId = looseBallClaimer.id;
            newPossessionClubId = looseBallClaimer.club_id;
            await supabase.from('match_event_logs').insert({ match_id, event_type: looseBallClaimer.club_id === possClubId ? 'loose_ball_recovered' : 'possession_change', title: looseBallClaimer.club_id === possClubId ? '🤲 Bola recuperada!' : '🔄 Bola roubada!', body: 'Quem chegou primeiro na bola solta ficou com a posse.' });
          } else {
            nextBallHolderParticipantId = null;
            if (wasAlreadyLoose) {
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'ball_stopped', title: '⚽ Bola parada', body: 'A bola perdeu a inércia e está parada no campo.' });
            } else {
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'ball_inertia', title: '⚽ Bola continua rolando...', body: 'Ninguém alcançou a bola. Ela continua na mesma direção por inércia.' });
            }
          }
        }

        // Deferred ball holder move
        if (bhHasBallAction && ballHolder) {
          const bhMoveAction = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
          if (bhMoveAction?.target_x != null && bhMoveAction?.target_y != null) {
            await supabase.from('match_participants').update({ pos_x: Number(bhMoveAction.target_x), pos_y: Number(bhMoveAction.target_y) }).eq('id', ballHolder.id);
          }
        }

        const allRawIds = (rawActions || []).map(a => a.id);
        if (allRawIds.length > 0) {
          const usedIds = allActions.map(a => a.id);
          const overriddenIds = allRawIds.filter(id => !usedIds.includes(id));
          if (usedIds.length > 0) await supabase.from('match_actions').update({ status: 'used' }).in('id', usedIds);
          if (overriddenIds.length > 0) await supabase.from('match_actions').update({ status: 'overridden' }).in('id', overriddenIds);
        }

        // Ball end position for OOB
        if (!ballEndPos) {
          if (nextBallHolderParticipantId) {
            const holder = (participants || []).find((p: any) => p.id === nextBallHolderParticipantId);
            if (holder) {
              const moveAct = allActions.find((a: any) => a.participant_id === holder.id && (a.action_type === 'move' || a.action_type === 'receive'));
              ballEndPos = { x: Number(moveAct?.target_x ?? holder.pos_x ?? 50), y: Number(moveAct?.target_y ?? holder.pos_y ?? 50) };
            }
          } else if (ballHolder) {
            const bhAction = allActions.find((a: any) => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));
            if (bhAction?.target_x != null && bhAction?.target_y != null) ballEndPos = { x: Number(bhAction.target_x), y: Number(bhAction.target_y) };
          }
        }

        // ── Goal from pass/move ending in goal area ──
        if (nextBallHolderParticipantId === null && ballEndPos) {
          const inHomeGoal = ballEndPos.x <= 1 && ballEndPos.y >= 38 && ballEndPos.y <= 62;
          const inAwayGoal = ballEndPos.x >= 99 && ballEndPos.y >= 38 && ballEndPos.y <= 62;
          if (inHomeGoal || inAwayGoal) {
            const bhPassAction = ballHolder ? allActions.find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type) || a.action_type === 'move')) : null;
            const isOverGoal = bhPassAction?.payload && typeof bhPassAction.payload === 'object' && (bhPassAction.payload as any).over_goal;
            if (!isOverGoal) {
              if (inAwayGoal) {
                if (possClubId === match.home_club_id) homeScore++; else awayScore++;
              } else {
                if (possClubId === match.away_club_id) awayScore++; else homeScore++;
              }
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'goal', title: `⚽ GOL! ${homeScore} – ${awayScore}`, body: `Turno ${match.current_turn_number} - Bola no fundo da rede!` });
              newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
              nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
              nextSetPieceType = 'kickoff';
            }
          }
        }

        // Goal from dribble/move into goal area
        if (ballHolder && nextBallHolderParticipantId === ballHolder.id) {
          const bhMoveAct = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
          if (bhMoveAct?.target_x != null && bhMoveAct?.target_y != null) {
            const moveEndX = Number(bhMoveAct.target_x);
            const moveEndY = Number(bhMoveAct.target_y);
            const inHGoal = moveEndX <= 2 && moveEndY >= 38 && moveEndY <= 62;
            const inAGoal = moveEndX >= 98 && moveEndY >= 38 && moveEndY <= 62;
            if (inHGoal || inAGoal) {
              if (inAGoal) {
                if (possClubId === match.home_club_id) homeScore++; else awayScore++;
              } else {
                if (possClubId === match.away_club_id) awayScore++; else homeScore++;
              }
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'goal', title: `⚽ GOL! ${homeScore} – ${awayScore}`, body: `Turno ${match.current_turn_number} - Gol de condução!` });
              newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
              nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
              nextSetPieceType = 'kickoff';
            }
          }
        }

        // OOB
        const goalScored = homeScore > match.home_score || awayScore > match.away_score;
        if (ballEndPos && !goalScored && nextBallHolderParticipantId === null) {
          const oob = detectOutOfBounds(ballEndPos.x, ballEndPos.y, lastTouchClubId || match.home_club_id, match);
          if (oob) {
            const restart = await handleSetPiece(supabase, match_id, oob, participants || [], match, allActions);
            if (restart) {
              nextBallHolderParticipantId = restart.playerId;
              newPossessionClubId = restart.clubId;
              nextSetPieceType = oob.type;
              await supabase.from('match_event_logs').insert({ match_id, event_type: oob.type, title: restart.title, body: restart.body });
            }
          }
        }

        const newTurnNumber = match.current_turn_number + 1;

        await supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', activeTurn.id);

        // ── Check halftime ──
        if (match.current_turn_number === TURNS_PER_HALF && newTurnNumber === TURNS_PER_HALF + 1) {
          // Halftime! Create a positioning phase with halftime pause
          const halftimeEnd = new Date(Date.now() + HALFTIME_PAUSE_MS).toISOString();
          
          await supabase.from('matches').update({
            current_turn_number: newTurnNumber,
            current_phase: 'positioning_attack',
            possession_club_id: newPossessionClubId,
            home_score: homeScore, away_score: awayScore,
          }).eq('id', match_id);

          await supabase.from('match_turns').insert({
            match_id, turn_number: newTurnNumber,
            phase: 'positioning_attack',
            possession_club_id: newPossessionClubId,
            ball_holder_participant_id: nextBallHolderParticipantId,
            started_at: new Date().toISOString(), ends_at: halftimeEnd,
            status: 'active',
            set_piece_type: 'kickoff',
          });

          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'halftime',
            title: `⏸ Intervalo! ${homeScore} – ${awayScore}`,
            body: 'Fim do primeiro tempo. Intervalo de 5 minutos.',
          });

          return new Response(JSON.stringify({ status: 'halftime', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ── Check end of match ──
        if (newTurnNumber > TOTAL_TURNS) {
          await supabase.from('matches').update({ status: 'finished', finished_at: new Date().toISOString(), home_score: homeScore, away_score: awayScore }).eq('id', match_id);
          await supabase.from('match_event_logs').insert({ match_id, event_type: 'final_whistle', title: `🏁 Apito final! ${homeScore} – ${awayScore}`, body: 'Partida encerrada.' });
        } else {
          const nextPhaseStart = new Date().toISOString();
          const isNextLooseBall = nextBallHolderParticipantId === null;
          const nextPhase = isNextLooseBall ? 'attacking_support' : 'ball_holder';
          const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();

          await supabase.from('matches').update({ current_turn_number: newTurnNumber, current_phase: nextPhase, possession_club_id: newPossessionClubId, home_score: homeScore, away_score: awayScore }).eq('id', match_id);
          const { data: newTurnData } = await supabase.from('match_turns').insert({ match_id, turn_number: newTurnNumber, phase: nextPhase, possession_club_id: newPossessionClubId, ball_holder_participant_id: nextBallHolderParticipantId, started_at: nextPhaseStart, ends_at: nextPhaseEnd, status: 'active' }).select('id').single();

          if (isNextLooseBall) {
            await supabase.from('match_event_logs').insert({ match_id, event_type: 'loose_ball_phase', title: '⚽ Bola solta — Fase 1 pulada', body: 'Todos os jogadores se movimentam para disputar a bola.' });
          }

          // One-touch auto-action
          if (nextBallHolderParticipantId && newTurnData?.id) {
            const oneTouchAction = allActions.find(a =>
              a.participant_id === nextBallHolderParticipantId &&
              a.action_type === 'receive' &&
              a.payload && typeof a.payload === 'object' && (a.payload as any).one_touch === true
            );
            if (oneTouchAction) {
              const otPayload = oneTouchAction.payload as any;
              if (otPayload.next_action_type) {
                await supabase.from('match_actions').insert({
                  match_id, match_turn_id: newTurnData.id,
                  participant_id: nextBallHolderParticipantId,
                  controlled_by_type: oneTouchAction.controlled_by_type || 'player',
                  controlled_by_user_id: oneTouchAction.controlled_by_user_id || null,
                  action_type: otPayload.next_action_type,
                  target_x: otPayload.next_target_x ?? null,
                  target_y: otPayload.next_target_y ?? null,
                  target_participant_id: otPayload.next_target_participant_id || null,
                  payload: { one_touch_executed: true },
                  status: 'pending',
                });
                console.log(`[ENGINE] One-touch auto-action: ${otPayload.next_action_type}`);
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'one_touch', title: '⚡ Toque único!', body: `Jogada de primeira: ${otPayload.next_action_type}` });
              }
            }
          }
        }
      } else if (activeTurn.phase === 'ball_holder' && isLooseBall) {
        await supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', activeTurn.id);
        const nextPhaseStart = new Date().toISOString();
        const nextPhaseEnd = new Date(Date.now() + PHASE_DURATION_MS).toISOString();
        await supabase.from('matches').update({ current_phase: 'attacking_support' }).eq('id', match_id);
        await supabase.from('match_turns').insert({ match_id, turn_number: activeTurn.turn_number, phase: 'attacking_support', possession_club_id: possClubId, ball_holder_participant_id: null, started_at: nextPhaseStart, ends_at: nextPhaseEnd, status: 'active' });
      } else {
        // ── Early deviation at ball_holder → attacking_support ──
        if (activeTurn.phase === 'ball_holder' && ballHolder) {
          const { data: bhActions } = await supabase.from('match_actions').select('*').eq('match_turn_id', activeTurn.id).eq('participant_id', ballHolder.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
          const bhAction = bhActions?.[0];
          if (bhAction && (isPassType(bhAction.action_type) || isShootType(bhAction.action_type)) && bhAction.target_x != null && bhAction.target_y != null) {
            const raw = ballHolder.player_profile_id ? attrByProfile[ballHolder.player_profile_id] : null;
            const devAttrs: Record<string, number> = {
              passe_baixo: Number(raw?.passe_baixo ?? 40), passe_alto: Number(raw?.passe_alto ?? 40),
              forca_chute: Number(raw?.forca_chute ?? 40), acuracia_chute: Number(raw?.acuracia_chute ?? 40),
            };
            const startX = Number(ballHolder.pos_x ?? 50);
            const startY = Number(ballHolder.pos_y ?? 50);
            const deviation = computeDeviation(Number(bhAction.target_x), Number(bhAction.target_y), startX, startY, bhAction.action_type, devAttrs);
            await supabase.from('match_actions').update({
              target_x: deviation.actualX, target_y: deviation.actualY,
              payload: { original_target_x: Number(bhAction.target_x), original_target_y: Number(bhAction.target_y), deviated: true, over_goal: deviation.overGoal },
            }).eq('id', bhAction.id);
            if (deviation.overGoal) {
              await supabase.from('match_event_logs').insert({ match_id, event_type: 'shot_over', title: '💨 Chute para fora!', body: 'A bola foi por cima do gol.' });
            }
          }
        }

        const currentPhaseIndex = PHASES.indexOf(activeTurn.phase as Phase);
        const nextPhase = PHASES[currentPhaseIndex + 1] || 'resolution';
        const nextPhaseStart = new Date().toISOString();
        const phaseDuration = nextPhase === 'resolution' ? RESOLUTION_PHASE_DURATION_MS : PHASE_DURATION_MS;
        const nextPhaseEnd = new Date(Date.now() + phaseDuration).toISOString();

        await supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', activeTurn.id);
        await supabase.from('matches').update({ current_phase: nextPhase }).eq('id', match_id);
        await supabase.from('match_turns').insert({ match_id, turn_number: activeTurn.turn_number, phase: nextPhase, possession_club_id: possClubId, ball_holder_participant_id: activeTurn.ball_holder_participant_id, started_at: nextPhaseStart, ends_at: nextPhaseEnd, status: 'active' });
      }

      return new Response(JSON.stringify({ status: 'advanced', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } finally {
        await releaseTurnProcessing(supabase, activeTurn.id, turnClaim.processingToken);
      }
    }

    // ─── SUBMIT HUMAN ACTION ───
    if (action === 'submit_action' && match_id) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { participant_id, action_type, target_participant_id, target_x, target_y } = body;

      let activeTurn: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data } = await supabase.from('match_turns').select('id').eq('match_id', match_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
        if (data) { activeTurn = data; break; }
        if (attempt < 2) await new Promise(r => setTimeout(r, 300));
      }
      if (!activeTurn) return new Response(JSON.stringify({ error: 'No active turn', recoverable: true }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: participant } = await supabase.from('match_participants').select('*, matches!inner(home_club_id, away_club_id)').eq('id', participant_id).single();
      const isOwnParticipant = participant?.connected_user_id === user.id;

      const { data: managerClub } = await supabase.from('clubs').select('id').eq('manager_profile_id', (await supabase.from('manager_profiles').select('id').eq('user_id', user.id).single()).data?.id || '').single();
      const isManagerOfClub = managerClub?.id === participant?.club_id;

      const { data: allParts } = await supabase.from('match_participants').select('id').eq('match_id', match_id).eq('role_type', 'player');
      const isTestMatch = (allParts || []).length <= 4;
      const isManagerOfMatch = isTestMatch && (managerClub?.id === (participant as any)?.matches?.home_club_id || managerClub?.id === (participant as any)?.matches?.away_club_id);

      if (!isOwnParticipant && !isManagerOfClub && !isManagerOfMatch) return new Response(JSON.stringify({ error: 'Not authorized to control this participant' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const byType = isOwnParticipant ? 'player' : 'manager';
      await supabase.from('match_actions').insert({
        match_id, match_turn_id: activeTurn.id, participant_id,
        controlled_by_type: byType, controlled_by_user_id: user.id,
        action_type, target_participant_id: target_participant_id || null,
        target_x: target_x ?? null, target_y: target_y ?? null,
        payload: body.payload || null, status: 'pending',
      });

      return new Response(JSON.stringify({ status: 'action_submitted', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ─── Offside detection ────────────────────────────────────────
function checkOffside(
  receiverParticipant: any,
  passerParticipant: any,
  participants: any[],
  possClubId: string,
  match: { home_club_id: string; away_club_id: string },
): boolean {
  if (!receiverParticipant || !passerParticipant) return false;
  if (receiverParticipant.club_id !== possClubId) return false;

  const isHomeAttacking = possClubId === match.home_club_id;
  const receiverX = Number(receiverParticipant.pos_x ?? 50);
  const passerX = Number(passerParticipant.pos_x ?? 50);

  // Ball must be played forward
  if (isHomeAttacking && receiverX <= passerX) return false;
  if (!isHomeAttacking && receiverX >= passerX) return false;

  // Receiver must be in opponent's half
  if (isHomeAttacking && receiverX < 50) return false;
  if (!isHomeAttacking && receiverX > 50) return false;

  const defenders = participants.filter(p => p.club_id !== possClubId && p.role_type === 'player');

  let sortedX: number[];
  if (isHomeAttacking) {
    // Away defenders sorted by x descending (closest to their goal at x=100)
    sortedX = defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => b - a);
  } else {
    // Home defenders sorted by x ascending (closest to their goal at x=0)
    sortedX = defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => a - b);
  }

  if (sortedX.length < 2) return false;
  const penultimateX = sortedX[1];

  const isOffside = isHomeAttacking ? receiverX > penultimateX : receiverX < penultimateX;
  if (isOffside) {
    console.log(`[ENGINE] 🚩 OFFSIDE! receiverX=${receiverX.toFixed(1)} penultimateDefX=${penultimateX.toFixed(1)} passerX=${passerX.toFixed(1)}`);
  }
  return isOffside;
}


