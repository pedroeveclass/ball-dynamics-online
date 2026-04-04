import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 7000;
const POSITIONING_PHASE_DURATION_MS = 7000;
const RESOLUTION_PHASE_DURATION_MS = 2000; // 2s for client animation
const HALFTIME_PAUSE_MS = 5 * 60 * 1000; // 5 minutes halftime
const MAX_TURNS = 144;
const TURNS_PER_HALF = 72;
const PHASES = ['ball_holder', 'attacking_support', 'defending_response', 'resolution'] as const;

// ─── Real-time clock constants ──────────────────────────────
const HALF_DURATION_MS = 25 * 60 * 1000;       // 25 real minutes per half
const HALFTIME_DURATION_MS = 5 * 60 * 1000;    // 5 min halftime break
const MAX_INJURY_TIME_TURNS = 3;               // 1-3 extra turns after time is up
const MAX_TURNS_SAFETY = 200;                  // absolute safety cap to prevent infinite games

// ─── Energy system constants ───────────────────────────────
const ENERGY_BASE_DRAIN = 0.20;          // base drain per turn (just existing on field)
const ENERGY_BASE_STAMINA_FACTOR = 0.6;  // how much stamina reduces base drain
const ENERGY_MOVE_WEIGHT = 1.2;          // multiplier for movement distance
const ENERGY_STAMINA_FACTOR = 0.55;      // how much stamina reduces activity drain
const ENERGY_GK_FACTOR = 0.35;           // GK activity drain multiplier
const ENERGY_HALFTIME_RECOVERY = 5;      // % energy recovered at halftime
const ENERGY_ACTION_COSTS: Record<string, number> = {
  pass_low: 0.15, pass_high: 0.15, pass_launch: 0.2,
  header_low: 0.15, header_high: 0.15,
  shoot_controlled: 0.25, shoot_power: 0.3,
  header_controlled: 0.25, header_power: 0.3,
  receive: 0.1, block: 0.2, move: 0, no_action: 0,
};

function computeEnergyDrain(
  staminaAttr: number, distanceMoved: number, maxMoveRange: number,
  actionType: string, isGoalkeeper: boolean
): number {
  const S = Math.max(0, Math.min(1, (staminaAttr - 10) / 89)); // normalize 10-99 → 0-1
  const baseDrain = ENERGY_BASE_DRAIN * (1 - S * ENERGY_BASE_STAMINA_FACTOR);
  const moveRatio = maxMoveRange > 0 ? Math.min(1, distanceMoved / maxMoveRange) : 0;
  const actionCost = ENERGY_ACTION_COSTS[actionType] ?? 0;
  let activityDrain = (moveRatio * ENERGY_MOVE_WEIGHT + actionCost) * (1 - S * ENERGY_STAMINA_FACTOR);
  if (isGoalkeeper) activityDrain *= ENERGY_GK_FACTOR;
  return baseDrain + activityDrain;
}

function getEnergyPenalty(energyPct: number): number {
  if (energyPct > 50) return 0;
  if (energyPct > 40) return 0.05;
  if (energyPct > 30) return 0.10;
  if (energyPct > 20) return 0.25;
  if (energyPct > 10) return 0.40;
  if (energyPct > 5)  return 0.50;
  return 0.75;
}

// ─── Match minute calculation (real-time clock) ─────────────
function computeMatchMinute(match: any): number {
  if (!match.half_started_at) return 0;
  const elapsed = Date.now() - new Date(match.half_started_at).getTime();
  // During halftime, elapsed may be negative (half_started_at set in the future)
  if (elapsed < 0) return match.current_half === 1 ? 45 : 90;
  const halfMinutes = Math.min(45, Math.floor((elapsed / HALF_DURATION_MS) * 45));
  const half = match.current_half || 1;
  return half === 1 ? halfMinutes : 45 + halfMinutes;
}

// Legacy fallback for turn-based calculation (used nowhere now, kept for safety)
function computeMatchMinuteFromTurn(turnNumber: number): number {
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
    { x: 50, y: 15, pos: 'LW' }, { x: 50, y: 50, pos: 'CAM' }, { x: 50, y: 85, pos: 'RW' },
    { x: 63, y: 50, pos: 'ST' },
  ],
  '3-5-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 25, pos: 'CB' }, { x: 22, y: 50, pos: 'CB' }, { x: 22, y: 75, pos: 'CB' },
    { x: 38, y: 10, pos: 'LWB' }, { x: 38, y: 35, pos: 'CM' }, { x: 38, y: 50, pos: 'CM' }, { x: 38, y: 65, pos: 'CM' }, { x: 38, y: 90, pos: 'RWB' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '3-4-3': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 25, pos: 'CB' }, { x: 22, y: 50, pos: 'CB' }, { x: 22, y: 75, pos: 'CB' },
    { x: 40, y: 15, pos: 'LM' }, { x: 40, y: 37, pos: 'CM' }, { x: 40, y: 63, pos: 'CM' }, { x: 40, y: 85, pos: 'RM' },
    { x: 60, y: 15, pos: 'LW' }, { x: 62, y: 50, pos: 'ST' }, { x: 60, y: 85, pos: 'RW' },
  ],
  '5-3-2': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 20, y: 10, pos: 'LWB' }, { x: 18, y: 30, pos: 'CB' }, { x: 18, y: 50, pos: 'CB' }, { x: 18, y: 70, pos: 'CB' }, { x: 20, y: 90, pos: 'RWB' },
    { x: 40, y: 25, pos: 'CM' }, { x: 40, y: 50, pos: 'CM' }, { x: 40, y: 75, pos: 'CM' },
    { x: 60, y: 35, pos: 'ST' }, { x: 60, y: 65, pos: 'ST' },
  ],
  '5-4-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 20, y: 10, pos: 'LWB' }, { x: 18, y: 30, pos: 'CB' }, { x: 18, y: 50, pos: 'CB' }, { x: 18, y: 70, pos: 'CB' }, { x: 20, y: 90, pos: 'RWB' },
    { x: 40, y: 15, pos: 'LM' }, { x: 40, y: 37, pos: 'CM' }, { x: 40, y: 63, pos: 'CM' }, { x: 40, y: 85, pos: 'RM' },
    { x: 62, y: 50, pos: 'ST' },
  ],
  '4-1-4-1': [
    { x: 5, y: 50, pos: 'GK' },
    { x: 22, y: 15, pos: 'LB' }, { x: 22, y: 37, pos: 'CB' }, { x: 22, y: 63, pos: 'CB' }, { x: 22, y: 85, pos: 'RB' },
    { x: 34, y: 50, pos: 'CDM' },
    { x: 48, y: 15, pos: 'LM' }, { x: 48, y: 37, pos: 'CM' }, { x: 48, y: 63, pos: 'CM' }, { x: 48, y: 85, pos: 'RM' },
    { x: 63, y: 50, pos: 'ST' },
  ],
};

function getFormationForFill(formation: string, isHome: boolean): Array<{ x: number; y: number; pos: string }> {
  const base = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS['4-4-2'];
  if (isHome) return base;
  return base.map(p => ({ ...p, x: 100 - p.x }));
}

// GK is ALWAYS determined by lineup slot or player primary_position.
// No implicit/position-based fallback — every team has a GK in their lineup.

function isExplicitGoalkeeper(
  participant: any,
  slotMap: Map<string, string>,
  profilePosMap: Map<string, string>,
): boolean {
  if (participant.lineup_slot_id && slotMap.get(participant.lineup_slot_id) === 'GK') return true;
  if (participant.player_profile_id && profilePosMap.get(participant.player_profile_id) === 'GK') return true;
  return false;
}

function getGoalkeeperIdsByClub(
  participants: any[],
  slotMap: Map<string, string>,
  profilePosMap: Map<string, string>,
): Map<string, string> {
  const gkIdByClub = new Map<string, string>();
  const teamPartsByClub = new Map<string, any[]>();

  for (const participant of participants) {
    const team = teamPartsByClub.get(participant.club_id) || [];
    team.push(participant);
    teamPartsByClub.set(participant.club_id, team);
  }

  for (const [clubId, teamParts] of teamPartsByClub.entries()) {
    const explicitGK = teamParts.find((participant: any) =>
      isExplicitGoalkeeper(participant, slotMap, profilePosMap)
    );
    if (explicitGK) gkIdByClub.set(clubId, explicitGK.id);
  }

  return gkIdByClub;
}

// ─── Enrich participants with slot_position ──────────────────
async function enrichParticipantsWithSlotPosition(supabase: any, participants: any[]): Promise<any[]> {
  const slotIds = participants.filter(p => p.lineup_slot_id).map(p => p.lineup_slot_id);
  const { data: slots } = slotIds.length > 0
    ? await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds)
    : { data: [] };
  const slotMap = new Map<string, string>((slots || []).map((s: any) => [s.id, s.slot_position]));

  // Also load player profiles for primary_position fallback
  const profileIds = participants.filter(p => p.player_profile_id).map(p => p.player_profile_id);
  let profilePosMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase.from('player_profiles').select('id, primary_position').in('id', profileIds);
    profilePosMap = new Map((profiles || []).map((p: any) => [p.id, p.primary_position]));
  }

  const gkIdByClub = getGoalkeeperIdsByClub(participants, slotMap, profilePosMap);

  return participants.map(p => {
    if (p.lineup_slot_id && slotMap.has(p.lineup_slot_id)) {
      p._slot_position = slotMap.get(p.lineup_slot_id);
    } else if (p.player_profile_id && profilePosMap.get(p.player_profile_id)) {
      p._slot_position = profilePosMap.get(p.player_profile_id);
    } else if (gkIdByClub.get(p.club_id) === p.id) {
      p._slot_position = 'GK';
    }
    // If still no position, try to infer from initial field position
    // (bots created by fillBots have pos_x/pos_y matching formation slots)
    if (!p._slot_position && p.is_bot && p.pos_x != null) {
      const px = Number(p.pos_x);
      const py = Number(p.pos_y);
      const formSlots = FORMATION_POSITIONS['4-4-2']; // default
      let bestDist = Infinity;
      let bestPos = 'CM';
      // Check if this team already has an explicit GK
      const teamHasGK = gkIdByClub.has(p.club_id);
      for (const slot of formSlots) {
        // Skip GK slot if team already has one
        if (slot.pos === 'GK' && teamHasGK) continue;
        const d = Math.sqrt((px - slot.x) ** 2 + (py - slot.y) ** 2);
        const dMirror = Math.sqrt((px - (100 - slot.x)) ** 2 + (py - slot.y) ** 2);
        const minD = Math.min(d, dMirror);
        if (minD < bestDist) {
          bestDist = minD;
          bestPos = slot.pos;
        }
      }
      p._slot_position = bestPos;
    }
    return p;
  });
}

// ─── GK detection helper (handles EN + PT-BR) ───────────────
function isGKPosition(pos: string): boolean {
  const p = (pos || '').replace(/[0-9]/g, '').toUpperCase();
  return p === 'GK' || p === 'GOL';
}

// ─── Tactical Role System ────────────────────────────────────
type TacticalRole = 'goalkeeper' | 'centerBack' | 'fullBack' | 'defensiveMid' | 'centralMid' | 'attackingMid' | 'wideMid' | 'winger' | 'striker';

function getPositionRole(slotPos: string): TacticalRole {
  // Normalize PT-BR → EN first
  const raw = (slotPos || '').replace(/[0-9]/g, '').toUpperCase();
  const NORM: Record<string, string> = {
    'GK':'GK','GOL':'GK','CB':'CB','ZAG':'CB','LB':'LB','LE':'LB','RB':'RB','LD':'RB',
    'LWB':'LWB','ALE':'LWB','RWB':'RWB','ALD':'RWB',
    'CDM':'CDM','DM':'CDM','VOL':'CDM','CM':'CM','MC':'CM','CAM':'CAM','MEI':'CAM',
    'LM':'LM','ME':'LM','RM':'RM','MD':'RM','LW':'LW','PE':'LW','RW':'RW','PD':'RW',
    'ST':'ST','ATA':'ST','CF':'CF','SA':'CF',
  };
  const pos = NORM[raw] || raw;
  if (pos === 'GK') return 'goalkeeper';
  if (pos === 'CB') return 'centerBack';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(pos)) return 'fullBack';
  if (pos === 'CDM') return 'defensiveMid';
  if (pos === 'CM') return 'centralMid';
  if (pos === 'CAM') return 'attackingMid';
  if (['LM', 'RM'].includes(pos)) return 'wideMid';
  if (['LW', 'RW'].includes(pos)) return 'winger';
  if (['ST', 'CF'].includes(pos)) return 'striker';
  return 'centralMid'; // fallback
}

// ─── Zone-Based Tactical Positioning ─────────────────────────
type Zone = { minX: number; maxX: number; minY: number; maxY: number; idealX: number; idealY: number };
type FormationZoneMap = { defensive: Zone[]; transition: Zone[]; offensive: Zone[] };

function z(minX: number, maxX: number, minY: number, maxY: number, idealX: number, idealY: number): Zone {
  return { minX, maxX, minY, maxY, idealX, idealY };
}

const FORMATION_ZONES: Record<string, FormationZoneMap> = {
  '4-4-2': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 5, 30, 20, 18),      // LB
      z(12, 28, 25, 55, 20, 38),     // CB
      z(12, 28, 45, 75, 20, 62),     // CB
      z(12, 28, 70, 95, 20, 82),     // RB
      z(28, 45, 5, 30, 35, 18),      // LM
      z(28, 45, 25, 50, 35, 38),     // CM
      z(28, 45, 50, 75, 35, 62),     // CM
      z(28, 45, 70, 95, 35, 82),     // RM
      z(38, 55, 25, 50, 45, 38),     // ST
      z(38, 55, 50, 75, 45, 62),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(20, 38, 2, 25, 28, 15),      // LB
      z(18, 35, 22, 48, 26, 35),     // CB
      z(18, 35, 52, 78, 26, 65),     // CB
      z(20, 38, 75, 98, 28, 85),     // RB
      z(35, 55, 2, 28, 44, 15),      // LM
      z(35, 55, 25, 50, 44, 38),     // CM
      z(35, 55, 50, 75, 44, 62),     // CM
      z(35, 55, 72, 98, 44, 85),     // RM
      z(50, 68, 22, 50, 58, 38),     // ST
      z(50, 68, 50, 78, 58, 62),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(30, 50, 2, 22, 40, 12),      // LB
      z(28, 45, 25, 50, 36, 38),     // CB
      z(28, 45, 50, 75, 36, 62),     // CB
      z(30, 50, 78, 98, 40, 88),     // RB
      z(48, 68, 2, 25, 56, 15),      // LM
      z(45, 65, 25, 50, 54, 38),     // CM
      z(45, 65, 50, 75, 54, 62),     // CM
      z(48, 68, 75, 98, 56, 85),     // RM
      z(62, 88, 20, 50, 72, 38),     // ST
      z(62, 88, 50, 80, 72, 62),     // ST
    ],
  },
  '4-3-3': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 5, 28, 20, 18),      // LB
      z(12, 28, 25, 55, 20, 38),     // CB
      z(12, 28, 45, 75, 20, 62),     // CB
      z(12, 28, 72, 95, 20, 82),     // RB
      z(28, 45, 15, 40, 35, 28),     // CM
      z(28, 45, 35, 65, 35, 50),     // CM
      z(28, 45, 60, 85, 35, 72),     // CM
      z(38, 55, 5, 28, 45, 18),      // LW
      z(38, 55, 30, 70, 45, 50),     // ST
      z(38, 55, 72, 95, 45, 82),     // RW
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(20, 38, 2, 25, 28, 14),      // LB
      z(18, 35, 25, 50, 26, 38),     // CB
      z(18, 35, 50, 75, 26, 62),     // CB
      z(20, 38, 75, 98, 28, 86),     // RB
      z(38, 58, 12, 38, 46, 26),     // CM
      z(38, 58, 35, 65, 46, 50),     // CM
      z(38, 58, 62, 88, 46, 74),     // CM
      z(52, 72, 2, 25, 60, 14),      // LW
      z(52, 72, 28, 72, 60, 50),     // ST
      z(52, 72, 75, 98, 60, 86),     // RW
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(30, 50, 2, 22, 40, 12),      // LB
      z(28, 45, 25, 50, 36, 38),     // CB
      z(28, 45, 50, 75, 36, 62),     // CB
      z(30, 50, 78, 98, 40, 88),     // RB
      z(48, 68, 12, 38, 56, 26),     // CM
      z(48, 68, 35, 65, 56, 50),     // CM
      z(48, 68, 62, 88, 56, 74),     // CM
      z(62, 88, 2, 22, 72, 12),      // LW
      z(62, 88, 28, 72, 72, 50),     // ST
      z(62, 88, 78, 98, 72, 88),     // RW
    ],
  },
  '4-2-3-1': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 5, 28, 20, 18),      // LB
      z(12, 28, 25, 55, 20, 38),     // CB
      z(12, 28, 45, 75, 20, 62),     // CB
      z(12, 28, 72, 95, 20, 82),     // RB
      z(25, 42, 25, 50, 32, 38),     // CDM
      z(25, 42, 50, 75, 32, 62),     // CDM
      z(32, 48, 5, 28, 38, 18),      // LM
      z(32, 48, 30, 70, 38, 50),     // CAM
      z(32, 48, 72, 95, 38, 82),     // RM
      z(40, 55, 30, 70, 46, 50),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(20, 38, 2, 25, 28, 14),      // LB
      z(18, 35, 25, 50, 26, 38),     // CB
      z(18, 35, 50, 75, 26, 62),     // CB
      z(20, 38, 75, 98, 28, 86),     // RB
      z(32, 50, 28, 50, 40, 38),     // CDM
      z(32, 50, 50, 72, 40, 62),     // CDM
      z(42, 60, 2, 25, 50, 14),      // LM
      z(42, 60, 28, 72, 50, 50),     // CAM
      z(42, 60, 75, 98, 50, 86),     // RM
      z(55, 72, 28, 72, 62, 50),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(30, 50, 2, 22, 40, 12),      // LB
      z(28, 45, 25, 50, 36, 38),     // CB
      z(28, 45, 50, 75, 36, 62),     // CB
      z(30, 50, 78, 98, 40, 88),     // RB
      z(42, 60, 28, 50, 50, 38),     // CDM
      z(42, 60, 50, 72, 50, 62),     // CDM
      z(55, 75, 2, 22, 64, 12),      // LM
      z(55, 75, 28, 72, 64, 50),     // CAM
      z(55, 75, 78, 98, 64, 88),     // RM
      z(65, 90, 28, 72, 75, 50),     // ST
    ],
  },
  '3-5-2': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 10, 35, 20, 24),     // CB
      z(12, 28, 35, 65, 20, 50),     // CB
      z(12, 28, 65, 90, 20, 76),     // CB
      z(22, 40, 2, 22, 30, 12),      // LWB
      z(25, 42, 18, 42, 32, 30),     // CM
      z(25, 42, 38, 62, 32, 50),     // CM
      z(25, 42, 58, 82, 32, 70),     // CM
      z(22, 40, 78, 98, 30, 88),     // RWB
      z(38, 55, 25, 50, 45, 38),     // ST
      z(38, 55, 50, 75, 45, 62),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(18, 35, 12, 35, 26, 24),     // CB
      z(18, 35, 35, 65, 26, 50),     // CB
      z(18, 35, 65, 88, 26, 76),     // CB
      z(32, 52, 2, 20, 40, 12),      // LWB
      z(35, 55, 18, 42, 44, 30),     // CM
      z(35, 55, 38, 62, 44, 50),     // CM
      z(35, 55, 58, 82, 44, 70),     // CM
      z(32, 52, 80, 98, 40, 88),     // RWB
      z(52, 70, 22, 50, 60, 38),     // ST
      z(52, 70, 50, 78, 60, 62),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(28, 45, 15, 38, 36, 26),     // CB
      z(28, 45, 38, 62, 36, 50),     // CB
      z(28, 45, 62, 85, 36, 74),     // CB
      z(45, 68, 2, 18, 55, 10),      // LWB
      z(45, 65, 18, 42, 54, 30),     // CM
      z(45, 65, 38, 62, 54, 50),     // CM
      z(45, 65, 58, 82, 54, 70),     // CM
      z(45, 68, 82, 98, 55, 90),     // RWB
      z(65, 88, 22, 50, 74, 38),     // ST
      z(65, 88, 50, 78, 74, 62),     // ST
    ],
  },
  '3-4-3': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 10, 35, 20, 24),     // CB
      z(12, 28, 35, 65, 20, 50),     // CB
      z(12, 28, 65, 90, 20, 76),     // CB
      z(28, 45, 5, 28, 35, 18),      // LM
      z(28, 45, 25, 50, 35, 38),     // CM
      z(28, 45, 50, 75, 35, 62),     // CM
      z(28, 45, 72, 95, 35, 82),     // RM
      z(38, 55, 5, 25, 45, 16),      // LW
      z(38, 55, 30, 70, 45, 50),     // ST
      z(38, 55, 75, 95, 45, 84),     // RW
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(18, 35, 12, 35, 26, 24),     // CB
      z(18, 35, 35, 65, 26, 50),     // CB
      z(18, 35, 65, 88, 26, 76),     // CB
      z(38, 55, 2, 25, 45, 14),      // LM
      z(38, 55, 25, 50, 45, 38),     // CM
      z(38, 55, 50, 75, 45, 62),     // CM
      z(38, 55, 75, 98, 45, 86),     // RM
      z(52, 72, 2, 22, 60, 12),      // LW
      z(52, 72, 28, 72, 60, 50),     // ST
      z(52, 72, 78, 98, 60, 88),     // RW
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(28, 45, 15, 38, 36, 26),     // CB
      z(28, 45, 38, 62, 36, 50),     // CB
      z(28, 45, 62, 85, 36, 74),     // CB
      z(48, 68, 2, 22, 56, 12),      // LM
      z(48, 65, 22, 50, 55, 38),     // CM
      z(48, 65, 50, 78, 55, 62),     // CM
      z(48, 68, 78, 98, 56, 88),     // RM
      z(62, 88, 2, 20, 72, 12),      // LW
      z(62, 88, 28, 72, 72, 50),     // ST
      z(62, 88, 80, 98, 72, 88),     // RW
    ],
  },
  '5-3-2': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 2, 22, 20, 12),      // LWB
      z(10, 25, 18, 40, 16, 30),     // CB
      z(10, 25, 38, 62, 16, 50),     // CB
      z(10, 25, 60, 82, 16, 70),     // CB
      z(12, 28, 78, 98, 20, 88),     // RWB
      z(25, 42, 18, 42, 32, 30),     // CM
      z(25, 42, 38, 62, 32, 50),     // CM
      z(25, 42, 58, 82, 32, 70),     // CM
      z(38, 55, 25, 50, 45, 38),     // ST
      z(38, 55, 50, 75, 45, 62),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(22, 42, 2, 20, 30, 12),      // LWB
      z(16, 32, 18, 40, 24, 30),     // CB
      z(16, 32, 38, 62, 24, 50),     // CB
      z(16, 32, 60, 82, 24, 70),     // CB
      z(22, 42, 80, 98, 30, 88),     // RWB
      z(35, 55, 18, 42, 44, 30),     // CM
      z(35, 55, 38, 62, 44, 50),     // CM
      z(35, 55, 58, 82, 44, 70),     // CM
      z(52, 70, 22, 50, 60, 38),     // ST
      z(52, 70, 50, 78, 60, 62),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(38, 60, 2, 18, 48, 10),      // LWB
      z(28, 45, 18, 40, 36, 30),     // CB
      z(28, 45, 38, 62, 36, 50),     // CB
      z(28, 45, 60, 82, 36, 70),     // CB
      z(38, 60, 82, 98, 48, 90),     // RWB
      z(45, 65, 18, 42, 54, 30),     // CM
      z(45, 65, 38, 62, 54, 50),     // CM
      z(45, 65, 58, 82, 54, 70),     // CM
      z(65, 88, 22, 50, 74, 38),     // ST
      z(65, 88, 50, 78, 74, 62),     // ST
    ],
  },
  '5-4-1': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 2, 20, 20, 12),      // LWB
      z(10, 25, 18, 40, 16, 30),     // CB
      z(10, 25, 38, 62, 16, 50),     // CB
      z(10, 25, 60, 82, 16, 70),     // CB
      z(12, 28, 80, 98, 20, 88),     // RWB
      z(28, 45, 5, 28, 35, 18),      // LM
      z(28, 45, 25, 50, 35, 38),     // CM
      z(28, 45, 50, 75, 35, 62),     // CM
      z(28, 45, 72, 95, 35, 82),     // RM
      z(38, 55, 30, 70, 45, 50),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(22, 42, 2, 18, 30, 10),      // LWB
      z(16, 32, 18, 40, 24, 30),     // CB
      z(16, 32, 38, 62, 24, 50),     // CB
      z(16, 32, 60, 82, 24, 70),     // CB
      z(22, 42, 82, 98, 30, 90),     // RWB
      z(38, 55, 2, 25, 45, 14),      // LM
      z(38, 55, 25, 50, 45, 38),     // CM
      z(38, 55, 50, 75, 45, 62),     // CM
      z(38, 55, 75, 98, 45, 86),     // RM
      z(52, 70, 28, 72, 60, 50),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(38, 60, 2, 16, 48, 8),       // LWB
      z(28, 45, 18, 40, 36, 30),     // CB
      z(28, 45, 38, 62, 36, 50),     // CB
      z(28, 45, 60, 82, 36, 70),     // CB
      z(38, 60, 84, 98, 48, 92),     // RWB
      z(50, 70, 2, 22, 58, 12),      // LM
      z(48, 65, 22, 50, 55, 38),     // CM
      z(48, 65, 50, 78, 55, 62),     // CM
      z(50, 70, 78, 98, 58, 88),     // RM
      z(65, 90, 28, 72, 75, 50),     // ST
    ],
  },
  '4-1-4-1': {
    defensive: [
      z(2, 12, 30, 70, 5, 50),       // GK
      z(12, 28, 5, 28, 20, 18),      // LB
      z(12, 28, 25, 55, 20, 38),     // CB
      z(12, 28, 45, 75, 20, 62),     // CB
      z(12, 28, 72, 95, 20, 82),     // RB
      z(25, 40, 30, 70, 32, 50),     // CDM
      z(32, 48, 5, 28, 38, 18),      // LM
      z(32, 48, 25, 50, 38, 38),     // CM
      z(32, 48, 50, 75, 38, 62),     // CM
      z(32, 48, 72, 95, 38, 82),     // RM
      z(40, 55, 30, 70, 46, 50),     // ST
    ],
    transition: [
      z(2, 14, 30, 70, 5, 50),       // GK
      z(20, 38, 2, 25, 28, 14),      // LB
      z(18, 35, 25, 50, 26, 38),     // CB
      z(18, 35, 50, 75, 26, 62),     // CB
      z(20, 38, 75, 98, 28, 86),     // RB
      z(32, 48, 30, 70, 40, 50),     // CDM
      z(42, 60, 2, 25, 50, 14),      // LM
      z(42, 58, 25, 50, 48, 38),     // CM
      z(42, 58, 50, 75, 48, 62),     // CM
      z(42, 60, 75, 98, 50, 86),     // RM
      z(55, 72, 28, 72, 62, 50),     // ST
    ],
    offensive: [
      z(2, 16, 30, 70, 6, 50),       // GK
      z(30, 50, 2, 22, 40, 12),      // LB
      z(28, 45, 25, 50, 36, 38),     // CB
      z(28, 45, 50, 75, 36, 62),     // CB
      z(30, 50, 78, 98, 40, 88),     // RB
      z(40, 58, 30, 70, 48, 50),     // CDM
      z(55, 75, 2, 22, 64, 12),      // LM
      z(52, 68, 22, 50, 58, 38),     // CM
      z(52, 68, 50, 78, 58, 62),     // CM
      z(55, 75, 78, 98, 64, 88),     // RM
      z(65, 90, 28, 72, 75, 50),     // ST
    ],
  },
};

// Mirror a zone for the away team (X → 100 - X)
function mirrorZone(zone: Zone): Zone {
  return {
    minX: 100 - zone.maxX,
    maxX: 100 - zone.minX,
    minY: zone.minY,
    maxY: zone.maxY,
    idealX: 100 - zone.idealX,
    idealY: zone.idealY,
  };
}

type GameMoment = 'defensive' | 'transition' | 'offensive';

function detectGameMoment(isAttacking: boolean, ballX: number, isHome: boolean): GameMoment {
  if (!isAttacking) return 'defensive';
  // Normalize ball position for home perspective
  const normBallX = isHome ? ballX : 100 - ballX;
  if (normBallX > 65) return 'offensive';
  return 'transition';
}

function getFormationAnchor(
  bot: any,
  participants: any[],
  formation: string,
  isHome: boolean,
  match?: any,
): { x: number; y: number; slotIndex: number } {
  const formSlots = FORMATION_POSITIONS[formation] || FORMATION_POSITIONS['4-4-2'];

  // Position normalizer (EN + PT-BR)
  const normPos = (pos: string): string => {
    const c = pos.replace(/[0-9]/g, '').toUpperCase();
    const M: Record<string, string> = {
      'GK':'GK','GOL':'GK','CB':'CB','ZAG':'CB','LB':'LB','LE':'LB','RB':'RB','LD':'RB',
      'LWB':'LWB','ALE':'LWB','RWB':'RWB','ALD':'RWB',
      'CDM':'CDM','DM':'CDM','VOL':'CDM','CM':'CM','MC':'CM','CAM':'CAM','MEI':'CAM',
      'LM':'LM','ME':'LM','RM':'RM','MD':'RM','LW':'LW','PE':'LW','RW':'RW','PD':'RW',
      'ST':'ST','ATA':'ST','CF':'CF','SA':'CF',
    };
    return M[c] || c;
  };
  const COMPAT: Record<string, string[]> = {
    'GK':['GK'],'CB':['CB'],'LB':['LB','LWB'],'RB':['RB','RWB'],
    'LWB':['LWB','LB'],'RWB':['RWB','RB'],
    'CDM':['CDM','CM'],'CM':['CM','CDM','CAM'],'CAM':['CAM','CM'],
    'LM':['LM','LW'],'RM':['RM','RW'],'LW':['LW','LM'],'RW':['RW','RM'],
    'ST':['ST','CF'],'CF':['CF','ST'],
  };
  const posCompat = (a: string, b: string): boolean => {
    const ca = normPos(a), cb = normPos(b);
    if (ca === cb) return true;
    return COMPAT[ca]?.includes(cb) || false;
  };

  // Get the bot's position — try _slot_position, then primary_position from profile
  const rawSlotPos = (bot._slot_position || bot.slot_position || '').toUpperCase();
  const slotPos = rawSlotPos.replace(/[0-9]/g, '');

  // If we have a slot position, match it to the formation (works for any team size)
  if (slotPos) {
    // Find all players on this team with the same canonical position (to handle duplicates like CB, CB)
    const canonSlot = normPos(slotPos);
    const teamPartsOfSamePos = participants.filter(
      (p: any) => p.club_id === bot.club_id &&
        normPos((p._slot_position || p.slot_position || '').replace(/[0-9]/g, '')) === canonSlot &&
        p.role_type === 'player'
    ).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
    const indexInPos = Math.max(0, teamPartsOfSamePos.findIndex((p: any) => p.id === bot.id));

    // Find matching formation slots for this position (with compatibility)
    const matchingSlots = formSlots
      .map((s, i) => ({ ...s, slotIndex: i }))
      .filter(s => posCompat(slotPos, s.pos));

    if (matchingSlots.length > 0) {
      const matched = matchingSlots[Math.min(indexInPos, matchingSlots.length - 1)];
      if (isHome) return { x: matched.x, y: matched.y, slotIndex: matched.slotIndex };
      return { x: 100 - matched.x, y: matched.y, slotIndex: matched.slotIndex };
    }
  }

  // Fallback: no slot position or no matching formation slot
  // Distribute proportionally across formation based on team index
  const teamParts = participants.filter(
    (p: any) => p.club_id === bot.club_id && p.role_type === 'player'
  ).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  const teamSize = teamParts.length;
  const botIndexInTeam = Math.max(0, teamParts.findIndex((p: any) => p.id === bot.id));

  const si = teamSize <= 1
    ? Math.floor(formSlots.length / 2)
    : Math.round((botIndexInTeam / (teamSize - 1)) * (formSlots.length - 1));
  const clampedSi = Math.max(0, Math.min(formSlots.length - 1, si));
  const slot = formSlots[clampedSi];
  if (isHome) return { x: slot.x, y: slot.y, slotIndex: clampedSi };
  return { x: 100 - slot.x, y: slot.y, slotIndex: clampedSi };
}

// ─── Compute max movement range based on attributes ──────────
function computeMaxMoveRange(attrs: { velocidade: number; aceleracao: number; agilidade: number; stamina: number; forca: number }, turnNumber: number): number {
  const accelFactor = 0.3 + normalizeAttr(attrs.aceleracao) * 0.5;
  const maxSpeed = 8 + normalizeAttr(attrs.velocidade) * 11; // ~12% of field per turn for avg player
  // Energy-based stamina system replaces old time-based staminaDecay
  let totalDist = 0;
  let vel = 0;
  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    vel = vel * (1 - accelFactor) + (maxSpeed / NUM_SUBSTEPS) * accelFactor;
    const speed = Math.min(vel, maxSpeed / NUM_SUBSTEPS);
    totalDist += speed;
  }
  return totalDist;
}

function computeTacticalTarget(
  bot: any,
  role: TacticalRole,
  ballPos: { x: number; y: number },
  isHome: boolean,
  isAttacking: boolean,
  isDefending: boolean,
  formation: string,
  slotIndex: number,
  maxMoveRange?: number,
  attractOverride?: { x: number; y: number },
): { x: number; y: number } {
  // Determine game moment
  const moment = isDefending ? 'defensive' : detectGameMoment(!isDefending, ballPos.x, isHome);

  // Get zone for this slot
  const formZones = FORMATION_ZONES[formation] || FORMATION_ZONES['4-4-2'];
  const momentZones = formZones[moment] || formZones.transition;
  let zone = momentZones[Math.min(slotIndex, momentZones.length - 1)];
  if (!zone) zone = { minX: 2, maxX: 98, minY: 2, maxY: 98, idealX: 50, idealY: 50 };

  // Mirror for away team
  if (!isHome) zone = mirrorZone(zone);

  // Start from the zone's ideal point
  let targetX = zone.idealX;
  let targetY = zone.idealY;

  // GK: special reactive positioning
  if (role === 'goalkeeper') {
    const goalX = isHome ? 5 : 95;
    const goalY = 50;
    targetX = goalX + (ballPos.x - goalX) * 0.12;
    targetY = goalY + (ballPos.y - goalY) * 0.3;
    targetX = Math.max(zone.minX, Math.min(zone.maxX, targetX));
    targetY = Math.max(zone.minY, Math.min(zone.maxY, targetY));
  } else {
    // Ball attraction: gentle pull toward ball, proportional to zone size
    const attractX = attractOverride ? attractOverride.x : ballPos.x;
    const attractY = attractOverride ? attractOverride.y : ballPos.y;
    const zoneWidthX = zone.maxX - zone.minX;
    const zoneWidthY = zone.maxY - zone.minY;
    const ballPullX = (attractX - targetX) * 0.10; // max 10% of displacement
    const ballPullY = (attractY - targetY) * 0.05; // max 5% in Y
    // Clamp the pull to not exceed 15% of zone dimensions
    const maxPullX = zoneWidthX * 0.15;
    const maxPullY = zoneWidthY * 0.10;
    targetX += Math.max(-maxPullX, Math.min(maxPullX, ballPullX));
    targetY += Math.max(-maxPullY, Math.min(maxPullY, ballPullY));

    // Jitter to avoid exact overlaps (minimal)
    targetX += (Math.random() - 0.5) * 1.5;
    targetY += (Math.random() - 0.5) * 1.5;

    // Clamp to zone boundaries
    targetX = Math.max(zone.minX, Math.min(zone.maxX, targetX));
    targetY = Math.max(zone.minY, Math.min(zone.maxY, targetY));
  }

  // Field boundaries
  targetX = Math.max(2, Math.min(98, targetX));
  targetY = Math.max(2, Math.min(98, targetY));

  // Clamp to physical movement range
  if (maxMoveRange && maxMoveRange > 0) {
    const botX = Number(bot.pos_x ?? 50);
    const botY = Number(bot.pos_y ?? 50);
    const dx = targetX - botX;
    const dy = targetY - botY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxMoveRange) {
      const scale = maxMoveRange / dist;
      targetX = botX + dx * scale;
      targetY = botY + dy * scale;
    }
  }

  return { x: targetX, y: targetY };
}

function pickBestPassTarget(
  bot: any,
  role: TacticalRole,
  teammates: any[],
  isHome: boolean,
  ballPos: { x: number; y: number },
  opponents: any[],
): { target: any; actionType: string } | null {
  if (teammates.length === 0) return null;

  const scored = teammates.map((t: any) => {
    const tx = Number(t.pos_x ?? 50);
    const ty = Number(t.pos_y ?? 50);
    const bx = Number(bot.pos_x ?? 50);
    const by = Number(bot.pos_y ?? 50);
    const dist = Math.sqrt((tx - bx) ** 2 + (ty - by) ** 2);
    const forwardDir = isHome ? 1 : -1;
    const forwardness = (tx - bx) * forwardDir;

    // Check how covered the target is (closest opponent distance)
    let closestOppDist = 999;
    for (const opp of opponents) {
      const ox = Number(opp.pos_x ?? 50);
      const oy = Number(opp.pos_y ?? 50);
      const oppDist = Math.sqrt((tx - ox) ** 2 + (ty - oy) ** 2);
      if (oppDist < closestOppDist) closestOppDist = oppDist;
    }
    const freedom = Math.min(closestOppDist / 15, 1); // 0-1 how free the target is

    const tRole = getPositionRole((t._slot_position || t.slot_position || '').toUpperCase());
    let rolePreference = 0;

    // Role-based preferences
    if (role === 'goalkeeper') {
      if (tRole === 'centerBack' || tRole === 'fullBack') rolePreference = 2;
      else if (tRole === 'defensiveMid') rolePreference = 1.5;
      else if (tRole === 'striker') rolePreference = freedom > 0.8 ? 1 : -1; // only if very free
    } else if (role === 'centerBack') {
      if (tRole === 'defensiveMid' || tRole === 'centralMid') rolePreference = 2;
      else if (tRole === 'fullBack') rolePreference = 1.5;
      else if (tRole === 'striker') rolePreference = 0.5;
    } else if (role === 'fullBack') {
      if (tRole === 'wideMid' || tRole === 'winger') rolePreference = 2;
      else if (tRole === 'centralMid') rolePreference = 1.5;
      else if (tRole === 'centerBack') rolePreference = 0.5;
    } else if (role === 'defensiveMid') {
      if (tRole === 'centralMid' || tRole === 'attackingMid') rolePreference = 2;
      else if (tRole === 'fullBack') rolePreference = 1;
      else if (tRole === 'striker' && freedom > 0.6) rolePreference = 1.5;
    } else if (role === 'centralMid') {
      if (tRole === 'attackingMid' || tRole === 'winger') rolePreference = 2;
      else if (tRole === 'striker' && freedom > 0.5) rolePreference = 2;
      else if (tRole === 'defensiveMid') rolePreference = 0.5;
    } else if (role === 'attackingMid' || role === 'wideMid') {
      if (tRole === 'striker') rolePreference = 2.5;
      else if (tRole === 'winger') rolePreference = 1.5;
      else if (tRole === 'centralMid') rolePreference = 0.5;
    } else if (role === 'winger') {
      if (tRole === 'striker') rolePreference = 2.5;
      else if (tRole === 'attackingMid') rolePreference = 1.5;
    } else if (role === 'striker') {
      if (tRole === 'striker') rolePreference = 1; // other striker
      else if (tRole === 'attackingMid' || tRole === 'winger') rolePreference = 1;
    }

    const score = forwardness * 0.3 + freedom * 8 + rolePreference * 3 - dist * 0.08;
    return { ...t, score, dist, freedom };
  }).sort((a: any, b: any) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  // Choose action type based on distance
  let actionType = 'pass_low';
  if (best.dist > 40) actionType = 'pass_launch';
  else if (best.dist > 25) actionType = Math.random() < 0.6 ? 'pass_high' : 'pass_low';

  return { target: best, actionType };
}

// ─── Bot AI: generate smart fallback actions ─────────────────
// ─── Tick-level cache for data that doesn't change within a tick ──
interface CoachBonus { skill_type: string; level: number; trained_formation: string | null; bonus_value: number; }

interface TickCache {
  clubSettings?: { homeFormation: string; awayFormation: string };
  attrByProfile?: Record<string, any>;
  enrichedParticipants?: any[];
  lineupRoles?: { home: any | null; away: any | null };
  coachBonuses?: { home: CoachBonus[]; away: CoachBonus[] };
}

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
  match?: any,
  tickCache?: TickCache,
  setPieceType?: string | null,
  looseBallPosition?: { x: number; y: number } | null,
) {
  const botsToAct: any[] = [];

  for (const p of participants) {
    if (p.role_type !== 'player') continue;
    if (p.is_sent_off) continue;
    if (submittedParticipantIds.has(p.id)) continue;
    // Anyone who hasn't submitted gets a bot action — human or not.
    // submittedParticipantIds already excludes those who acted.

    const isAttacker = p.club_id === possClubId;
    const isBH = p.id === ballHolderId;

    if (phase === 'ball_holder' && isBH) botsToAct.push(p);
    else if (phase === 'attacking_support' && isAttacker) botsToAct.push(p);
    else if (phase === 'defending_response' && !isAttacker) botsToAct.push(p);
    else if (phase === 'positioning_attack' && isAttacker && !isBH) botsToAct.push(p);
    else if (phase === 'positioning_defense' && !isAttacker) botsToAct.push(p);
  }

  if (botsToAct.length === 0) return;

  const homeClubId = match?.home_club_id;
  const isSecondHalfBot = (match?.current_half ?? 1) >= 2;

  // Load formations: prefer active lineup formation, fallback to club_settings
  let homeFormation = '4-4-2';
  let awayFormation = '4-4-2';
  if (tickCache?.clubSettings) {
    homeFormation = tickCache.clubSettings.homeFormation;
    awayFormation = tickCache.clubSettings.awayFormation;
  } else if (match) {
    // First try: read from lineup (where the user actually sets the formation)
    if (match.home_lineup_id || match.away_lineup_id) {
      const lineupIds = [match.home_lineup_id, match.away_lineup_id].filter(Boolean);
      const { data: lineups } = await supabase.from('lineups').select('id, formation').in('id', lineupIds);
      for (const l of (lineups || [])) {
        if (l.id === match.home_lineup_id && l.formation) homeFormation = l.formation;
        if (l.id === match.away_lineup_id && l.formation) awayFormation = l.formation;
      }
    }
    // Second try: active lineup for clubs without lineup_id on the match
    if (homeFormation === '4-4-2' && !match.home_lineup_id) {
      const { data: hl } = await supabase.from('lineups').select('formation').eq('club_id', match.home_club_id).eq('is_active', true).maybeSingle();
      if (hl?.formation) homeFormation = hl.formation;
    }
    if (awayFormation === '4-4-2' && !match.away_lineup_id) {
      const { data: al } = await supabase.from('lineups').select('formation').eq('club_id', match.away_club_id).eq('is_active', true).maybeSingle();
      if (al?.formation) awayFormation = al.formation;
    }
    // Final fallback: club_settings
    if (homeFormation === '4-4-2' || awayFormation === '4-4-2') {
      const clubIds = [match.home_club_id, match.away_club_id].filter(Boolean);
      if (clubIds.length > 0) {
        const { data: settings } = await supabase.from('club_settings').select('club_id, default_formation').in('club_id', clubIds);
        for (const s of (settings || [])) {
          if (s.club_id === match.home_club_id && s.default_formation && homeFormation === '4-4-2') homeFormation = s.default_formation;
          if (s.club_id === match.away_club_id && s.default_formation && awayFormation === '4-4-2') awayFormation = s.default_formation;
        }
      }
    }
    if (tickCache) tickCache.clubSettings = { homeFormation, awayFormation };
  }

  // ── Load coach training bonuses (cached per tick) ──
  let coachBonusHome: CoachBonus[] = [];
  let coachBonusAway: CoachBonus[] = [];
  if (tickCache?.coachBonuses) {
    coachBonusHome = tickCache.coachBonuses.home;
    coachBonusAway = tickCache.coachBonuses.away;
  } else {
    try {
      const [{ data: hb }, { data: ab }] = await Promise.all([
        supabase.rpc('get_coach_bonuses', { p_club_id: match.home_club_id }),
        supabase.rpc('get_coach_bonuses', { p_club_id: match.away_club_id }),
      ]);
      coachBonusHome = hb || [];
      coachBonusAway = ab || [];
      if (tickCache) tickCache.coachBonuses = { home: coachBonusHome, away: coachBonusAway };
    } catch { /* coach_training table may not exist yet */ }
  }

  // Helper to get a specific bonus for a club
  const getCoachBonus = (clubId: string, skillType: string): number => {
    const bonuses = clubId === match.home_club_id ? coachBonusHome : coachBonusAway;
    const b = bonuses.find(x => x.skill_type === skillType);
    return b?.bonus_value ?? 0;
  };

  // Helper: get ball position (uses loose ball position when available)
  const getBallPos = (): { x: number; y: number } => {
    if (ballHolderId) {
      const bh = participants.find((p: any) => p.id === ballHolderId);
      if (bh) return { x: Number(bh.pos_x ?? 50), y: Number(bh.pos_y ?? 50) };
    }
    if (looseBallPosition) return looseBallPosition;
    return { x: 50, y: 50 };
  };
  const ballPos = getBallPos();

  const actions: any[] = [];

  // Query ball holder's action (type + target) for AI decisions
  let bhActionType: string | null = null;
  let bhTargetX: number | null = null;
  let bhTargetY: number | null = null;
  let bhTargetParticipantId: string | null = null;
  if ((phase === 'defending_response' || phase === 'attacking_support') && ballHolderId) {
    const { data: bhActions } = await supabase
      .from('match_actions')
      .select('action_type, target_x, target_y, target_participant_id')
      .eq('match_id', matchId)
      .eq('participant_id', ballHolderId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (bhActions && bhActions.length > 0) {
      bhActionType = bhActions[0].action_type;
      bhTargetX = bhActions[0].target_x;
      bhTargetY = bhActions[0].target_y;
      bhTargetParticipantId = bhActions[0].target_participant_id;
    }
  }
  // Pre-compute pass destination for bot AI
  const passDestination = (bhTargetX != null && bhTargetY != null && bhActionType && bhActionType !== 'move')
    ? { x: bhTargetX, y: bhTargetY } : null;

  // Ball speed factor for intercept range (bot AI should match engine validation)
  const bhBallSpeedFactor = bhActionType === 'shoot_power' ? 0.25
    : bhActionType === 'shoot_controlled' ? 0.35
    : bhActionType === 'pass_launch' ? 0.5
    : bhActionType === 'pass_high' ? 0.65
    : 1.0;

  // Track pass interceptors (max 2 defenders try to intercept at pass destination)
  let passInterceptorCount = 0;

  // Track loose ball chasers (max 2 per team)
  const looseBallChasersByClub = new Map<string, number>();

  // Pre-load attributes for max move range calculation (use cache if available)
  let botAttrMap: Record<string, any> = {};
  if (tickCache?.attrByProfile) {
    // Use cached attributes — filter to only bot profiles
    botAttrMap = tickCache.attrByProfile;
  } else {
    const botProfileIds = botsToAct.filter(b => b.player_profile_id).map(b => b.player_profile_id);
    if (botProfileIds.length > 0) {
      const { data: botAttrRows } = await supabase.from('player_attributes').select('*').in('player_profile_id', botProfileIds);
      for (const row of (botAttrRows || [])) botAttrMap[row.player_profile_id] = row;
    }
  }
  const turnNumber = match?.current_turn_number ?? 1;

  // ── Pre-compute team maps: teammates and opponents by club (Fix 1) ──
  const playersByClub = new Map<string, typeof participants>();
  for (const p of participants) {
    if (p.role_type !== 'player') continue;
    const club = p.club_id;
    if (!playersByClub.has(club)) playersByClub.set(club, []);
    playersByClub.get(club)!.push(p);
  }
  const clubIds = Array.from(playersByClub.keys());

  // ── Pre-compute opponents list per club ──
  const opponentsByClub = new Map<string, typeof participants>();
  for (const clubId of clubIds) {
    const opps: typeof participants = [];
    for (const [otherClubId, players] of playersByClub) {
      if (otherClubId !== clubId) opps.push(...players);
    }
    opponentsByClub.set(clubId, opps);
  }

  // ── Pre-compute nearest opponent per participant (Fix 2) ──
  const nearestOppMap = new Map<string, { opp: any; dist: number } | null>();
  for (const bot of botsToAct) {
    const bx = Number(bot.pos_x ?? 50);
    const by = Number(bot.pos_y ?? 50);
    const opps = opponentsByClub.get(bot.club_id) || [];
    let best: { opp: any; dist: number } | null = null;
    for (const opp of opps) {
      const d = Math.sqrt((bx - Number(opp.pos_x ?? 50)) ** 2 + (by - Number(opp.pos_y ?? 50)) ** 2);
      if (!best || d < best.dist) best = { opp, dist: d };
    }
    nearestOppMap.set(bot.id, best);
  }

  for (const bot of botsToAct) {
    const posX = Number(bot.pos_x ?? 50);
    const posY = Number(bot.pos_y ?? 50);
    const isBH = bot.id === ballHolderId;
    // In 2nd half, sides are flipped (home plays on right, away on left)
    const isHomeRaw = bot.club_id === homeClubId;
    const isHome = isSecondHalfBot ? !isHomeRaw : isHomeRaw;
    const formation = isHomeRaw ? homeFormation : awayFormation; // formation doesn't change, only field side
    const slotPos = (bot._slot_position || bot.slot_position || '').toUpperCase();
    const role = getPositionRole(slotPos);
    const isGK = role === 'goalkeeper';
    const anchorResult = getFormationAnchor(bot, participants, formation, isHome, match);
    const slotIndex = anchorResult.slotIndex;

    // Calculate max movement range for this bot
    const botRawAttrs = bot.player_profile_id ? botAttrMap[bot.player_profile_id] : null;
    const botMoveAttrs = {
      velocidade: Number(botRawAttrs?.velocidade ?? 40),
      aceleracao: Number(botRawAttrs?.aceleracao ?? 40),
      agilidade: Number(botRawAttrs?.agilidade ?? 40),
      stamina: Number(botRawAttrs?.stamina ?? 40),
      forca: Number(botRawAttrs?.forca ?? 40),
    };
    const maxMoveRange = computeMaxMoveRange(botMoveAttrs, turnNumber);

    const allClubPlayers = playersByClub.get(bot.club_id) || [];
    const teammates = allClubPlayers.filter((p: any) => p.id !== bot.id);
    const opponents = opponentsByClub.get(bot.club_id) || [];

    // ── Ball Holder Decision ──
    if (isBH && phase === 'ball_holder') {
      const goalX = isHome ? 100 : 0;
      const goalY = 40 + Math.random() * 20;
      const distToGoal = Math.sqrt((posX - goalX) ** 2 + (posY - 50) ** 2);

      // ── Dead ball (kickoff, free kick, etc): BH MUST pass, never move ──
      if (setPieceType) {
        const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
        if (passResult) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: passResult.actionType,
            target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
            target_participant_id: passResult.target.id, status: 'pending',
          });
        } else {
          // Fallback: short pass forward
          const fwdX = isHome ? Math.min(98, posX + 15) : Math.max(2, posX - 15);
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'pass_low',
            target_x: fwdX, target_y: 40 + Math.random() * 20, status: 'pending',
          });
        }
        continue; // Skip the rest of BH logic
      }

      if (isGK) {
        // GK: always pass to nearest free defender/midfielder, never shoot or dribble
        const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
        if (passResult) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: passResult.actionType,
            target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
            target_participant_id: passResult.target.id, status: 'pending',
          });
        } else {
          // No target: punt forward
          const puntX = isHome ? Math.min(98, posX + 30) : Math.max(2, posX - 30);
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'pass_launch',
            target_x: puntX, target_y: 40 + Math.random() * 20, status: 'pending',
          });
        }
      } else if (role === 'centerBack') {
        // CB: always pass, never dribble. Short pass to midfielder/fullback
        const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
        if (passResult) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: passResult.actionType,
            target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
            target_participant_id: passResult.target.id, status: 'pending',
          });
        } else {
          const clearX = isHome ? Math.min(98, posX + 20) : Math.max(2, posX - 20);
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'pass_high',
            target_x: clearX, target_y: 30 + Math.random() * 40, status: 'pending',
          });
        }
      } else if (role === 'fullBack') {
        // Fullback: pass or cross if advanced
        const isAdvanced = isHome ? posX > 55 : posX < 45;
        if (isAdvanced && Math.random() < 0.4) {
          // Cross into the box
          const crossX = isHome ? 85 + Math.random() * 10 : 5 + Math.random() * 10;
          const crossY = 35 + Math.random() * 30;
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'pass_high',
            target_x: crossX, target_y: crossY, status: 'pending',
          });
        } else {
          const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
          if (passResult) {
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: passResult.actionType,
              target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
              target_participant_id: passResult.target.id, status: 'pending',
            });
          } else {
            const moveX = isHome ? Math.min(98, posX + 5) : Math.max(2, posX - 5);
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: moveX, target_y: posY + (Math.random() - 0.5) * 4, status: 'pending',
            });
          }
        }
      } else if (role === 'defensiveMid') {
        // CDM: aggressive distribution — shoot if very close, dribble forward, or long pass to attackers
        if (distToGoal < 25 && Math.random() < 0.25) {
          actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'shoot_power', target_x: goalX, target_y: goalY, status: 'pending' });
        } else {
          const nearestOpp = nearestOppMap.get(bot.id);
          if (nearestOpp && nearestOpp.dist > 10 && Math.random() < 0.35) {
            const moveX = isHome ? Math.min(98, posX + 8 + Math.random() * 5) : Math.max(2, posX - 8 - Math.random() * 5);
            actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: posY + (Math.random() - 0.5) * 6, status: 'pending' });
          } else {
            const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
            if (passResult) {
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: passResult.actionType, target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50), target_participant_id: passResult.target.id, status: 'pending' });
            } else {
              const moveX = isHome ? Math.min(98, posX + 6) : Math.max(2, posX - 6);
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: posY + (Math.random() - 0.5) * 5, status: 'pending' });
            }
          }
        }
      } else if (role === 'centralMid' || role === 'attackingMid' || role === 'wideMid') {
        // Midfielders: AGGRESSIVE — shoot often, dribble hard toward goal, pass as last resort
        if (distToGoal < 35 && Math.random() < 0.55) {
          const shootType = distToGoal < 20 ? (Math.random() < 0.6 ? 'shoot_controlled' : 'shoot_power') : 'shoot_power';
          actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: shootType, target_x: goalX, target_y: goalY, status: 'pending' });
        } else {
          const nearestOpp = nearestOppMap.get(bot.id);
          if (nearestOpp && nearestOpp.dist > 8 && Math.random() < 0.50) {
            const moveX = isHome ? Math.min(98, posX + 10 + Math.random() * 5) : Math.max(2, posX - 10 - Math.random() * 5);
            const moveY = posY + (goalY - posY) * 0.3 + (Math.random() - 0.5) * 6;
            actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: Math.max(2, Math.min(98, moveY)), status: 'pending' });
          } else {
            const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
            if (passResult) {
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: passResult.actionType, target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50), target_participant_id: passResult.target.id, status: 'pending' });
            } else {
              const moveX = isHome ? Math.min(98, posX + 8) : Math.max(2, posX - 8);
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: posY + (Math.random() - 0.5) * 5, status: 'pending' });
            }
          }
        }
      } else if (role === 'winger') {
        // Winger: VERY AGGRESSIVE — shoot often, dribble hard, cross to strikers
        if (distToGoal < 30 && Math.random() < 0.60) {
          actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: Math.random() < 0.5 ? 'shoot_controlled' : 'shoot_power', target_x: goalX, target_y: goalY, status: 'pending' });
        } else if (distToGoal < 40 && Math.random() < 0.35) {
          const strikers = teammates.filter(t => { const tRole = getPositionRole((t._slot_position || '').toUpperCase()); return tRole === 'striker'; });
          if (strikers.length > 0) {
            const st = strikers[Math.floor(Math.random() * strikers.length)];
            actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'pass_high', target_x: Number(st.pos_x ?? 50), target_y: Number(st.pos_y ?? 50), target_participant_id: st.id, status: 'pending' });
          } else {
            const moveX = isHome ? Math.min(98, posX + 12) : Math.max(2, posX - 12);
            actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: posY + (Math.random() - 0.5) * 8, status: 'pending' });
          }
        } else {
          // Dribble aggressively forward — big moves toward goal
          const moveX = isHome ? Math.min(98, posX + 10 + Math.random() * 5) : Math.max(2, posX - 10 - Math.random() * 5);
          const cutInside = Math.random() < 0.4;
          const moveY = cutInside ? posY + (posY < 50 ? 10 : -10) : posY + (Math.random() - 0.5) * 6;
          actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: Math.max(2, Math.min(98, moveY)), status: 'pending' });
        }
      } else if (role === 'striker') {
        // Striker: MOST AGGRESSIVE — always trying to score
        if (distToGoal < 40) {
          // In shooting range — SHOOT
          const shootType = distToGoal < 18 ? (Math.random() < 0.7 ? 'shoot_controlled' : 'shoot_power') : 'shoot_power';
          actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: shootType, target_x: goalX, target_y: goalY, status: 'pending' });
        } else {
          // Too far — dribble aggressively toward goal or pass to attacking teammate
          const nearestOpp = nearestOppMap.get(bot.id);
          if (nearestOpp && nearestOpp.dist > 6 && Math.random() < 0.65) {
            const moveX = isHome ? Math.min(98, posX + 12 + Math.random() * 5) : Math.max(2, posX - 12 - Math.random() * 5);
            const moveY = posY + (50 - posY) * 0.2 + (Math.random() - 0.5) * 6;
            actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: Math.max(2, Math.min(98, moveY)), status: 'pending' });
          } else {
            const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
            if (passResult) {
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: passResult.actionType, target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50), target_participant_id: passResult.target.id, status: 'pending' });
            } else {
              const moveX = isHome ? Math.min(98, posX + 10) : Math.max(2, posX - 10);
              actions.push({ match_id: matchId, match_turn_id: turnId, participant_id: bot.id, controlled_by_type: 'bot', action_type: 'move', target_x: moveX, target_y: posY + (Math.random() - 0.5) * 6, status: 'pending' });
            }
          }
        }
      } else {
        // Fallback: pass forward
        const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
        if (passResult) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: passResult.actionType,
            target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
            target_participant_id: passResult.target.id, status: 'pending',
          });
        }
      }
      continue;
    }

    // ── Loose Ball Handling ──
    if (isLooseBall) {
      const distToBall = Math.sqrt((posX - ballPos.x) ** 2 + (posY - ballPos.y) ** 2);
      const clubChasers = looseBallChasersByClub.get(bot.club_id) ?? 0;

      if (distToBall < 12 && clubChasers < 2) {
        looseBallChasersByClub.set(bot.club_id, clubChasers + 1);
        if (distToBall <= 3) {
          // Already on top of the ball — can receive
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'receive',
            target_x: ballPos.x, target_y: ballPos.y, status: 'pending',
          });
        } else {
          // Move toward ball first — need to get there before receiving
          const targetX = posX + (ballPos.x - posX) * 0.7;
          const targetY = posY + (ballPos.y - posY) * 0.7;
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'move',
            target_x: Math.max(2, Math.min(98, targetX)), target_y: Math.max(2, Math.min(98, targetY)),
            status: 'pending',
          });
        }
      } else {
        // Maintain formation position, don't chase
        const target = computeTacticalTarget(bot, role, ballPos, isHome, false, false, formation, slotIndex);
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: target.x, target_y: target.y, status: 'pending',
        });
      }
      continue;
    }

    // ── Defending Response ──
    if (phase === 'defending_response') {
      if (ballHolderId) {
        const bhDist = Math.sqrt((posX - ballPos.x) ** 2 + (posY - ballPos.y) ** 2);

        // ── GK: actively try to save shots + position for passes ──
        if (isGK) {
          const ownGoalX = isHome ? 0 : 100;
          const isBhShooting = bhActionType && (isShootType(bhActionType) || isHeaderShootType(bhActionType));
          const isBhPassing = bhActionType && (bhActionType === 'pass_low' || bhActionType === 'pass_high' || bhActionType === 'pass_launch' || bhActionType === 'header_low' || bhActionType === 'header_high');

          if (isBhShooting && passDestination) {
            // SHOT: GK ALWAYS tries to save — position on the shot trajectory near goal line
            const shotTargetY = passDestination.y;
            const interceptX = isHome ? Math.max(2, Math.min(posX, 8)) : Math.min(98, Math.max(posX, 92));
            const interceptY = Math.max(25, Math.min(75, shotTargetY));
            const distToIntercept = Math.sqrt((posX - interceptX) ** 2 + (posY - interceptY) ** 2);
            const gkActionType = Math.random() < 0.7 ? 'block' : 'receive';
            if (distToIntercept <= maxMoveRange) {
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: gkActionType,
                target_x: interceptX, target_y: interceptY, status: 'pending',
              });
            } else {
              // Out of range: STILL try — move as close as possible toward intercept
              const angle = Math.atan2(interceptY - posY, interceptX - posX);
              const targetX = posX + Math.cos(angle) * maxMoveRange;
              const targetY = posY + Math.sin(angle) * maxMoveRange;
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: gkActionType,
                target_x: targetX, target_y: targetY, status: 'pending',
              });
            }
          } else {
            // Non-shot: position between ball and goal
            const ballToGoalDist = Math.abs(ballPos.x - ownGoalX);
            if (ballToGoalDist < 50) {
              const interceptX = isHome ? Math.max(2, Math.min(18, ballPos.x * 0.3)) : Math.max(82, Math.min(98, 100 - (100 - ballPos.x) * 0.3));
              const interceptY = Math.max(25, Math.min(75, ballPos.y));
              const distToIntercept = Math.sqrt((posX - interceptX) ** 2 + (posY - interceptY) ** 2);
              if (distToIntercept <= maxMoveRange && !isBhPassing) {
                actions.push({
                  match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                  controlled_by_type: 'bot', action_type: 'receive',
                  target_x: interceptX, target_y: interceptY, status: 'pending',
                });
              } else {
                const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
                actions.push({
                  match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                  controlled_by_type: 'bot', action_type: 'move',
                  target_x: target.x, target_y: target.y, status: 'pending',
                });
              }
            } else {
              const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: target.x, target_y: target.y, status: 'pending',
              });
            }
          }
        } else if (role === 'centerBack' || role === 'fullBack') {
          // ── Defenders: use trajectory-aware interception ──
          const isBhPassing = bhActionType && (bhActionType === 'pass_low' || bhActionType === 'pass_high' || bhActionType === 'pass_launch' || bhActionType === 'header_low' || bhActionType === 'header_high');
          const isBhShooting = bhActionType && (isShootType(bhActionType) || isHeaderShootType(bhActionType));
          const isBhDribbling = !isBhPassing && !isBhShooting;

          // Find closest point on ball trajectory that the bot can reach
          const trajStart = ballPos;
          const trajEnd = passDestination || (bhTargetX != null && bhTargetY != null ? { x: bhTargetX, y: bhTargetY } : ballPos);
          const tdx = trajEnd.x - trajStart.x;
          const tdy = trajEnd.y - trajStart.y;
          const tlen2 = tdx * tdx + tdy * tdy;
          const t = tlen2 > 0 ? Math.max(0, Math.min(1, ((posX - trajStart.x) * tdx + (posY - trajStart.y) * tdy) / tlen2)) : 0;
          const closestX = trajStart.x + tdx * t;
          const closestY = trajStart.y + tdy * t;
          const distToTraj = Math.sqrt((posX - closestX) ** 2 + (posY - closestY) ** 2);
          const adjustedRange = maxMoveRange * bhBallSpeedFactor;

          // Timing check: match engine's formula — timingRange = adjustedRange * max(0.15, t)
          const trajTimingRange = adjustedRange * Math.max(0.15, t);
          const canReachTraj = distToTraj <= trajTimingRange && (t >= 0.05 || distToTraj <= 2.5);

          // Validate interceptable zone (ball height) before generating receive/block
          const botInterceptAction = isBhShooting ? 'block' : 'receive';
          const botInterceptZones = getInterceptableRanges(bhActionType || 'pass_low', botInterceptAction);
          const isInInterceptZone = botInterceptZones.some(([lo, hi]) => t >= lo && t <= hi);
          if (isBhShooting && canReachTraj && isInInterceptZone && passInterceptorCount < 2) {
            // Can reach shot trajectory in valid zone — block
            passInterceptorCount++;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'block',
              target_x: closestX, target_y: closestY, status: 'pending',
            });
          } else if (isBhPassing && passDestination && canReachTraj && isInInterceptZone && passInterceptorCount < 2) {
            // Can reach pass trajectory in valid zone — intercept
            passInterceptorCount++;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'receive',
              target_x: closestX, target_y: closestY, status: 'pending',
            });
          } else if (isBhDribbling) {
            // BH dribbling — tackle on trajectory (with timing validation matching engine)
            const moveTargetX = bhTargetX ?? ballPos.x;
            const moveTargetY = bhTargetY ?? ballPos.y;
            const mtdx = moveTargetX - ballPos.x;
            const mtdy = moveTargetY - ballPos.y;
            const mtlen2 = mtdx * mtdx + mtdy * mtdy;
            const mt = mtlen2 > 0 ? Math.max(0, Math.min(1, ((posX - ballPos.x) * mtdx + (posY - ballPos.y) * mtdy) / mtlen2)) : 0;
            const tackleX = ballPos.x + mtdx * mt;
            const tackleY = ballPos.y + mtdy * mt;
            const distToTackle = Math.sqrt((posX - tackleX) ** 2 + (posY - tackleY) ** 2);
            // Match engine timing validation: timingRange = adjustedMaxRange * max(0.15, t)
            const tackleTimingRange = maxMoveRange * Math.max(0.15, mt);
            const canTackle = distToTackle <= tackleTimingRange && (mt >= 0.05 || distToTackle <= 2.5);
            if (canTackle) {
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'receive',
                target_x: tackleX, target_y: tackleY, status: 'pending',
              });
            } else {
              // Too far even for trajectory — just move tactically
              const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: target.x, target_y: target.y, status: 'pending',
              });
            }
          } else {
            // Mark nearest attacker
            const attackersToMark = opponents.filter(opp => {
              const oppRole = getPositionRole((opp._slot_position || '').toUpperCase());
              return oppRole === 'striker' || oppRole === 'winger' || oppRole === 'attackingMid';
            });

            if (attackersToMark.length > 0) {
              const nearest = attackersToMark.reduce((best: any, opp: any) => {
                const d = Math.sqrt((posX - Number(opp.pos_x ?? 50)) ** 2 + (posY - Number(opp.pos_y ?? 50)) ** 2);
                return d < (best?.dist ?? 999) ? { opp, dist: d } : best;
              }, null as any);

              if (nearest) {
                const oppX = Number(nearest.opp.pos_x ?? 50);
                const oppY = Number(nearest.opp.pos_y ?? 50);
                const ownGoalX = isHome ? 0 : 100;
                const markX = oppX + (ownGoalX - oppX) * 0.25;
                const markY = oppY + (50 - oppY) * 0.1;
                const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange, { x: markX, y: markY });
                actions.push({
                  match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                  controlled_by_type: 'bot', action_type: 'move',
                  target_x: target.x, target_y: target.y, status: 'pending',
                });
              }
            } else {
              const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: target.x, target_y: target.y, status: 'pending',
              });
            }
          }
        } else if (role === 'defensiveMid' || role === 'centralMid') {
          // ── Midfielders: trajectory-aware interception ──
          const isBhPassing = bhActionType && (bhActionType === 'pass_low' || bhActionType === 'pass_high' || bhActionType === 'pass_launch' || bhActionType === 'header_low' || bhActionType === 'header_high');
          const isBhShooting = bhActionType && (isShootType(bhActionType) || isHeaderShootType(bhActionType));
          const isBhDribbling = !isBhPassing && !isBhShooting;

          const trajStart = ballPos;
          const trajEnd = passDestination || (bhTargetX != null && bhTargetY != null ? { x: bhTargetX, y: bhTargetY } : ballPos);
          const mtdx = trajEnd.x - trajStart.x;
          const mtdy = trajEnd.y - trajStart.y;
          const mtlen2 = mtdx * mtdx + mtdy * mtdy;
          const mt = mtlen2 > 0 ? Math.max(0, Math.min(1, ((posX - trajStart.x) * mtdx + (posY - trajStart.y) * mtdy) / mtlen2)) : 0;
          const closestX = trajStart.x + mtdx * mt;
          const closestY = trajStart.y + mtdy * mt;
          const distToTraj = Math.sqrt((posX - closestX) ** 2 + (posY - closestY) ** 2);
          const adjustedRange = maxMoveRange * bhBallSpeedFactor;

          const trajTimingRange = adjustedRange * Math.max(0.15, mt);
          const canReachTraj = distToTraj <= trajTimingRange && (mt >= 0.05 || distToTraj <= 2.5);

          // Validate interceptable zone (ball height)
          const midInterceptAction = isBhShooting ? 'block' : 'receive';
          const midInterceptZones = getInterceptableRanges(bhActionType || 'pass_low', midInterceptAction);
          const midInZone = midInterceptZones.some(([lo, hi]) => mt >= lo && mt <= hi);

          if (isBhShooting && canReachTraj && midInZone && passInterceptorCount < 2) {
            passInterceptorCount++;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'block',
              target_x: closestX, target_y: closestY, status: 'pending',
            });
          } else if (isBhPassing && canReachTraj && midInZone && passInterceptorCount < 2) {
            passInterceptorCount++;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'receive',
              target_x: closestX, target_y: closestY, status: 'pending',
            });
          } else if (isBhDribbling) {
            // Tackle on dribble trajectory (with timing validation matching engine)
            const dribTrajEnd = bhTargetX != null && bhTargetY != null ? { x: bhTargetX, y: bhTargetY } : ballPos;
            const dtdx = dribTrajEnd.x - ballPos.x;
            const dtdy = dribTrajEnd.y - ballPos.y;
            const dtlen2 = dtdx * dtdx + dtdy * dtdy;
            const dt = dtlen2 > 0 ? Math.max(0, Math.min(1, ((posX - ballPos.x) * dtdx + (posY - ballPos.y) * dtdy) / dtlen2)) : 0;
            const tackleX = ballPos.x + dtdx * dt;
            const tackleY = ballPos.y + dtdy * dt;
            const distToTackle = Math.sqrt((posX - tackleX) ** 2 + (posY - tackleY) ** 2);
            const tackleTimingRange = maxMoveRange * Math.max(0.15, dt);
            const canTackle = distToTackle <= tackleTimingRange && (dt >= 0.05 || distToTackle <= 2.5);
            if (canTackle) {
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'receive',
                target_x: tackleX, target_y: tackleY, status: 'pending',
              });
            } else {
              const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: target.x, target_y: target.y, status: 'pending',
              });
            }
          } else if (bhDist < 18) {
            // Press toward ball
            const pressX = posX + (ballPos.x - posX) * 0.5;
            const pressY = posY + (ballPos.y - posY) * 0.5;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: Math.max(2, Math.min(98, pressX)), target_y: Math.max(2, Math.min(98, pressY)),
              status: 'pending',
            });
          } else {
            const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: target.x, target_y: target.y, status: 'pending',
            });
          }
        } else {
          // ── Attackers defending: occasional press ──
          if (bhDist <= maxMoveRange && Math.random() < 0.35) {
            const pressX = posX + (ballPos.x - posX) * 0.35;
            const pressY = posY + (ballPos.y - posY) * 0.35;
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: Math.max(2, Math.min(98, pressX)), target_y: Math.max(2, Math.min(98, pressY)),
              status: 'pending',
            });
          } else {
            const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: target.x, target_y: target.y, status: 'pending',
            });
          }
        }
      } else {
        const target = computeTacticalTarget(bot, role, ballPos, isHome, false, true, formation, slotIndex, maxMoveRange);
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: target.x, target_y: target.y, status: 'pending',
        });
      }
    } else if (phase === 'attacking_support') {
      // ── Attacking Support ──
      // Skip the ball holder — they already have their action from ball_holder phase
      if (isBH) continue;
      if (isGK) {
        // GK stays back
        const target = computeTacticalTarget(bot, role, ballPos, isHome, true, false, formation, slotIndex);
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: target.x, target_y: target.y, status: 'pending',
        });
      } else if (bhTargetParticipantId === bot.id && passDestination) {
        // ── This bot is the target of the BH's pass — move to receive it ──
        const distToDest = Math.sqrt((posX - passDestination.x) ** 2 + (posY - passDestination.y) ** 2);
        if (distToDest <= maxMoveRange) {
          // Can reach pass destination — submit receive action
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'receive',
            target_x: passDestination.x, target_y: passDestination.y, status: 'pending',
          });
        } else {
          // Too far — move toward pass destination as close as possible
          const angle = Math.atan2(passDestination.y - posY, passDestination.x - posX);
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'move',
            target_x: posX + Math.cos(angle) * maxMoveRange, target_y: posY + Math.sin(angle) * maxMoveRange,
            status: 'pending',
          });
        }
      } else {
        // Move to tactical position with attacking push
        const target = computeTacticalTarget(bot, role, ballPos, isHome, true, false, formation, slotIndex);
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: target.x, target_y: target.y, status: 'pending',
        });
      }
    } else {
      // ── Positioning phases or fallback ──
      const isDefending = phase === 'positioning_defense';
      let target = computeTacticalTarget(bot, role, ballPos, isHome, !isDefending, isDefending, formation, slotIndex);

      // ── Set piece specific positioning ──
      if (setPieceType && isDefending) {
        // Free kick wall: 2-3 closest defenders line up between ball and goal
        if (setPieceType === 'free_kick' || setPieceType === 'penalty') {
          const ownGoalX = isHome ? 0 : 100;
          const distToBall = Math.sqrt((Number(bot.pos_x ?? 50) - ballPos.x) ** 2 + (Number(bot.pos_y ?? 50) - ballPos.y) ** 2);
          // Find how many teammates are closer to the ball
          const closerTeammates = participants.filter(
            (p: any) => p.club_id === bot.club_id && p.role_type === 'player' && p.id !== bot.id && !p.is_sent_off &&
            Math.sqrt((Number(p.pos_x ?? 50) - ballPos.x) ** 2 + (Number(p.pos_y ?? 50) - ballPos.y) ** 2) < distToBall
          ).length;
          // Top 3 closest non-GK defenders form a wall
          if (closerTeammates < 3 && role !== 'goalkeeper') {
            const wallDist = 11; // outside the 10-unit exclusion zone
            const angleToBall = Math.atan2(ballPos.y - 50, ballPos.x - ownGoalX);
            const wallSpread = closerTeammates * 2.5; // spread players across wall
            target = {
              x: ballPos.x + Math.cos(angleToBall + Math.PI) * wallDist + (Math.random() - 0.5) * wallSpread,
              y: ballPos.y + Math.sin(angleToBall + Math.PI) * wallDist + (closerTeammates - 1) * 2.5,
            };
          }
        }
      }

      // ── Kickoff: enforce half-field + center circle exclusion ──
      if (setPieceType === 'kickoff') {
        // Half-field constraint
        if (isHome) target.x = Math.min(target.x, 49);
        else target.x = Math.max(target.x, 51);

        // Center circle exclusion for non-possession team during positioning
        if (isDefending) {
          const CENTER_CIRCLE_R = 10; // ~10% of field (matches client visual)
          const distToCenter = Math.sqrt((target.x - 50) ** 2 + (target.y - 50) ** 2);
          if (distToCenter < CENTER_CIRCLE_R) {
            // Push outside the circle
            const angle = Math.atan2(target.y - 50, target.x - 50);
            target.x = 50 + Math.cos(angle) * (CENTER_CIRCLE_R + 1);
            target.y = 50 + Math.sin(angle) * (CENTER_CIRCLE_R + 1);
            // Re-enforce half constraint
            if (isHome) target.x = Math.min(target.x, 49);
            else target.x = Math.max(target.x, 51);
          }
        }
      }

      // Free kick / set piece exclusion zone for defending team
      if (setPieceType && setPieceType !== 'kickoff' && isDefending) {
        const FREE_KICK_R = 10;
        const distToBall = Math.sqrt((target.x - ballPos.x) ** 2 + (target.y - ballPos.y) ** 2);
        if (distToBall < FREE_KICK_R) {
          const angle = Math.atan2(target.y - ballPos.y, target.x - ballPos.x);
          target.x = ballPos.x + Math.cos(angle) * (FREE_KICK_R + 1);
          target.y = ballPos.y + Math.sin(angle) * (FREE_KICK_R + 1);
        }
      }

      // Clamp to field
      target.x = Math.max(2, Math.min(98, target.x));
      target.y = Math.max(2, Math.min(98, target.y));

      actions.push({
        match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
        controlled_by_type: 'bot', action_type: 'move',
        target_x: target.x, target_y: target.y, status: 'pending',
      });
    }
  }

  // ── Clamp all bot move actions to max movement range ──
  const botMap = new Map(botsToAct.map(b => [b.id, b]));
  for (const action of actions) {
    if ((action.action_type === 'move' || action.action_type === 'receive' || action.action_type === 'block') && action.target_x != null && action.target_y != null) {
      const bot = botMap.get(action.participant_id);
      if (bot) {
        const botRaw = bot.player_profile_id ? botAttrMap[bot.player_profile_id] : null;
        const moveAttrs = {
          velocidade: Number(botRaw?.velocidade ?? 40),
          aceleracao: Number(botRaw?.aceleracao ?? 40),
          agilidade: Number(botRaw?.agilidade ?? 40),
          stamina: Number(botRaw?.stamina ?? 40),
          forca: Number(botRaw?.forca ?? 40),
        };
        const maxRange = computeMaxMoveRange(moveAttrs, turnNumber);
        const bx = Number(bot.pos_x ?? 50);
        const by = Number(bot.pos_y ?? 50);
        const dx = action.target_x - bx;
        const dy = action.target_y - by;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRange) {
          const scale = maxRange / dist;
          action.target_x = bx + dx * scale;
          action.target_y = by + dy * scale;
        }
      }
    }
  }

  // ── Post-processing: validate receive/block targets are near ball/trajectory ──
  if (phase === 'defending_response' && ballHolderId) {
    for (const action of actions) {
      if (action.action_type !== 'receive' && action.action_type !== 'block') continue;
      const botPart = participants.find((p: any) => p.id === action.participant_id);
      if (!botPart) continue;
      const botSlot = botPart._slot_position || botPart.slot_position || '';
      if (isGKPosition(botSlot)) continue; // GK receives are special (positioning near goal)
      // Check distance from receive target to ball position
      const distToBall = Math.sqrt((action.target_x - ballPos.x) ** 2 + (action.target_y - ballPos.y) ** 2);
      if (distToBall > 20) {
        // Target too far from ball — convert to tactical move
        const bx = Number(botPart.pos_x ?? 50);
        const by = Number(botPart.pos_y ?? 50);
        action.action_type = 'move';
        action.target_x = bx + (ballPos.x - bx) * 0.3;
        action.target_y = by + (ballPos.y - by) * 0.3;
        console.log(`[ENGINE] Bot ${action.participant_id.slice(0,8)} receive/block too far from ball (${distToBall.toFixed(1)}), converted to move`);
      }
    }
  }

  if (actions.length > 0) {
    await supabase.from('match_actions').insert(actions);
    console.log(`[ENGINE] Bot tactical AI generated ${actions.length} actions for phase ${phase}`);
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
  isGK: boolean = false,
): DeviationResult {
  const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

  let difficultyMultiplier: number;
  let skillFactor: number;
  let minRandomDeviation: number;

  switch (actionType) {
    case 'pass_low': {
      // Short (<15): ~1u | Medium (20-30): 5-11u | Long (50): ~20u
      difficultyMultiplier = 25;
      skillFactor = normalizeAttr(isGK ? (attrs.distribuicao_curta ?? 40) : (attrs.passe_baixo ?? 40));
      minRandomDeviation = dist < 15 ? 0.5 : dist < 30 ? 3.0 + (dist / 50) * 6.0 : 6.0 + (dist / 50) * 10.0;
      break;
    }
    case 'pass_high':
      // dist=25: 8-15u | dist=35: 10-18u | dist=50: 15-25u
      difficultyMultiplier = 40;
      skillFactor = normalizeAttr(isGK ? (attrs.distribuicao_longa ?? 40) : (attrs.passe_alto ?? 40));
      minRandomDeviation = 4.0 + (dist / 50) * 8.0;
      break;
    case 'pass_launch':
      // dist=30: 10-18u | dist=50: 18-30u | dist=70: 30-50u
      difficultyMultiplier = 35;
      skillFactor = isGK
        ? normalizeAttr(attrs.distribuicao_longa ?? 40)
        : (normalizeAttr(attrs.passe_baixo ?? 40) + normalizeAttr(attrs.passe_alto ?? 40)) / 2;
      minRandomDeviation = 5.0 + (dist / 50) * 10.0;
      break;
    case 'shoot_controlled': {
      // Same curve as pass_low
      difficultyMultiplier = 25;
      skillFactor = normalizeAttr(attrs.acuracia_chute ?? 40);
      minRandomDeviation = dist < 15 ? 0.5 : dist < 30 ? 3.0 + (dist / 50) * 6.0 : 6.0 + (dist / 50) * 10.0;
      break;
    }
    case 'shoot_power':
      // Same curve as pass_high
      difficultyMultiplier = 40;
      skillFactor = (normalizeAttr(attrs.acuracia_chute ?? 40) + normalizeAttr(attrs.forca_chute ?? 40)) / 2;
      minRandomDeviation = 4.0 + (dist / 50) * 8.0;
      break;
    case 'header_low': {
      difficultyMultiplier = 30; // slightly harder than pass_low
      skillFactor = normalizeAttr(attrs.cabeceio ?? 40);
      minRandomDeviation = dist < 15 ? 1.0 : dist < 30 ? 4.0 + (dist / 50) * 7.0 : 7.0 + (dist / 50) * 11.0;
      break;
    }
    case 'header_high':
      difficultyMultiplier = 45; // harder than pass_high
      skillFactor = normalizeAttr(attrs.cabeceio ?? 40);
      minRandomDeviation = 5.0 + (dist / 50) * 9.0;
      break;
    case 'header_controlled': {
      // Like shoot_controlled but use cabeceio skill
      difficultyMultiplier = 30;
      skillFactor = normalizeAttr(attrs.cabeceio ?? 40);
      minRandomDeviation = dist < 15 ? 1.0 : dist < 30 ? 4.0 + (dist / 50) * 7.0 : 7.0 + (dist / 50) * 11.0;
      break;
    }
    case 'header_power':
      // Like shoot_power but use cabeceio skill
      difficultyMultiplier = 45;
      skillFactor = (normalizeAttr(attrs.cabeceio ?? 40) + normalizeAttr(attrs.forca_chute ?? 40)) / 2;
      minRandomDeviation = 5.0 + (dist / 50) * 9.0;
      break;
    default:
      return { actualX: targetX, actualY: targetY, deviationDist: 0, overGoal: false };
  }

  // Very aggressive distance factor
  const distFactor = Math.pow(dist / 80, 1.8) * difficultyMultiplier;
  // Skill curve: medium-skill players are severely punished
  const skillCurve = Math.pow(1 - skillFactor, 1.5);
  // Distance amplifier: 25+ units get progressively worse
  const distAmplifier = dist > 25 ? 1 + Math.pow((dist - 25) / 25, 1.5) : 1;
  // Final deviation
  const deviationRadius = (distFactor * skillCurve * distAmplifier + minRandomDeviation) * (0.6 + Math.random() * 0.4);

  const isShot = actionType === 'shoot_controlled' || actionType === 'shoot_power' || isHeaderShootType(actionType);

  let actualX: number;
  let actualY: number;
  let overGoal = false;

  if (isShot) {
    // ── SHOTS: deviation is LATERAL ONLY (perpendicular to shot direction) ──
    // The shot always travels to the goal line (a few units past the end line).
    // Deviation only moves the landing point up or down (Y axis).
    // Direction: +1 or -1 randomly
    const lateralSign = Math.random() > 0.5 ? 1 : -1;
    const lateralDeviation = deviationRadius * lateralSign;

    // Keep X unchanged (shot goes to the same depth — goal line)
    actualX = targetX;
    actualY = targetY + lateralDeviation;

    // For shoot_power/header_power: if deviation is large, ball goes over the goal (wide)
    if ((actionType === 'shoot_power' || actionType === 'header_power') && deviationRadius > 1.0) {
      if (actualY >= 38 && actualY <= 62) {
        // Ball was still on target despite deviation — push it wide
        actualY = lateralSign > 0 ? 65 + Math.random() * 5 : 35 - Math.random() * 5;
        overGoal = true;
      }
    }
  } else {
    // ── PASSES: deviation is radial (any direction) ──
    const angle = Math.random() * 2 * Math.PI;
    actualX = targetX + Math.cos(angle) * deviationRadius;
    actualY = targetY + Math.sin(angle) * deviationRadius;
  }

  const deviationDist = Math.sqrt((actualX - targetX) ** 2 + (actualY - targetY) ** 2);

  console.log(`[ENGINE] Deviation: intended=(${targetX.toFixed(1)},${targetY.toFixed(1)}) actual=(${actualX.toFixed(1)},${actualY.toFixed(1)}) deviation=${deviationDist.toFixed(2)} skill=${skillFactor.toFixed(2)} distFactor=${distFactor.toFixed(2)} minRandom=${minRandomDeviation.toFixed(2)} overGoal=${overGoal} lateral=${isShot}`);

  return { actualX, actualY, deviationDist, overGoal };
}

// ─── Height-based interception zones ─────────────────────────────
function getInterceptableRanges(actionType: string, interceptActionType?: string): Array<[number, number]> {
  // Block actions - only allowed in yellow zones (elevated ball)
  if (interceptActionType === 'block') {
    switch (actionType) {
      // All shots: GK can block (espalmar) at any point in trajectory
      case 'shoot_power':
      case 'header_power':
      case 'shoot_controlled':
      case 'header_controlled':
        return [[0, 1]];
      case 'pass_high':
      case 'header_high':
        return [[0, 0.2], [0.8, 1]]; // yellow zones of high pass
      case 'pass_launch':
        return [[0, 0.35], [0.65, 1]]; // yellow zones of launch
      // Ground balls (non-shot): NO block allowed
      case 'pass_low':
      case 'header_low':
      case 'move':
      default:
        return [];
    }
  }
  // Receive/dominate - allowed in green zones + descending yellow, NOT red or ascending yellow
  // Ascending yellow (ball going up) = only block; descending yellow (coming down) = receive OK
  switch (actionType) {
    case 'pass_low':
    case 'header_low':
      return [[0, 1]]; // fully green, fully interceptable
    case 'pass_high':
    case 'header_high':
      return [[0, 0.12], [0.8, 1]]; // green start + descending yellow+green (skip ascending yellow 0.12-0.2)
    case 'pass_launch':
      return [[0, 0.08], [0.65, 1]]; // green start + descending yellow+green (skip ascending yellow 0.08-0.35)
    // All shots: GK can receive (agarrar) at any point in trajectory
    case 'shoot_controlled':
    case 'header_controlled':
    case 'shoot_power':
    case 'header_power':
      return [[0, 1]];
    case 'move':
      return [[0, 1]]; // ground, fully green
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

function isBlockType(t: string): boolean { return t === 'block'; }

function isHeaderType(action: string): boolean {
  return action === 'header_low' || action === 'header_high' || action === 'header_controlled' || action === 'header_power';
}

function isHeaderShootType(action: string): boolean {
  return action === 'header_controlled' || action === 'header_power';
}

function isHeaderPassType(action: string): boolean {
  return action === 'header_low' || action === 'header_high';
}

function isBallActionType(action: string): boolean {
  return isPassType(action) || isShootType(action) || isHeaderType(action);
}

// ─── Skill-based interception probability ────────────────────
interface InterceptContext {
  type: 'tackle' | 'receive_pass' | 'block_shot' | 'gk_save' | 'block';
  baseChance: number;
  defenderRole?: string;
}

function getInterceptContext(bhActionType: string, interceptorClubId: string, bhClubId: string, interceptorRoleType: string, interceptorActionType?: string): InterceptContext {
  const isOpponent = interceptorClubId !== bhClubId;

  // If interceptor explicitly chose 'block' action
  if (interceptorActionType === 'block') {
    const isGK = isGKPosition(interceptorRoleType);
    if (isGK) {
      return { type: 'block', baseChance: 0.50, defenderRole: 'goalkeeper' };
    }
    return { type: 'block', baseChance: 0.30, defenderRole: 'outfield' };
  }

  if (bhActionType === 'move' && isOpponent) {
    return { type: 'tackle', baseChance: 0.45 };
  }
  if (isShootType(bhActionType) || isHeaderShootType(bhActionType)) {
    if (isGKPosition(interceptorRoleType) || !isOpponent) {
      return { type: 'gk_save', baseChance: 0.35 };
    }
    return { type: 'block_shot', baseChance: 0.25 };
  }
  // Pass types (foot and header)
  if (bhActionType === 'pass_low' || bhActionType === 'header_low') return { type: 'receive_pass', baseChance: 0.85 };
  if (bhActionType === 'pass_high' || bhActionType === 'header_high') return { type: 'receive_pass', baseChance: 0.60 };
  if (bhActionType === 'pass_launch') return { type: 'receive_pass', baseChance: 0.70 };

  return { type: 'receive_pass', baseChance: 0.75 };
}

function computeInterceptSuccess(
  context: InterceptContext,
  attackerAttrs: Record<string, number>,
  defenderAttrs: Record<string, number>,
  ballHeightZone?: 'green' | 'yellow' | 'red',
  defenderHeight?: string,
  ballActionType?: string,
  interceptContext?: { interceptX?: number; participantClubId?: string; homeClubId?: string; gkMovementRatio?: number },
): { success: boolean; chance: number; foul: boolean; card?: 'yellow' } {
  let attackerSkill: number;
  let defenderSkill: number;

  switch (context.type) {
    case 'tackle':
      // Attacker: trying to dribble past
      attackerSkill = (
        normalizeAttr(attackerAttrs.drible ?? 40) * 0.30 +
        normalizeAttr(attackerAttrs.agilidade ?? 40) * 0.20 +
        normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.20 +
        normalizeAttr(attackerAttrs.coragem ?? 40) * 0.10 +
        normalizeAttr(attackerAttrs.equilibrio ?? 40) * 0.10 +
        normalizeAttr(attackerAttrs.forca ?? 40) * 0.10
      );
      // Defender: trying to steal
      defenderSkill = (
        normalizeAttr(defenderAttrs.desarme ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.marcacao ?? 40) * 0.20 +
        normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.antecipacao ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.coragem ?? 40) * 0.10 +
        normalizeAttr(defenderAttrs.posicionamento_defensivo ?? 40) * 0.10 +
        normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.05
      );
      break;
    case 'receive_pass':
      attackerSkill = (
        normalizeAttr(attackerAttrs.passe_baixo ?? 40) * 0.50 +
        normalizeAttr(attackerAttrs.visao_jogo ?? 40) * 0.15 +
        normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.15 +
        normalizeAttr(attackerAttrs.curva ?? 40) * 0.10 +
        normalizeAttr(attackerAttrs.tomada_decisao ?? 40) * 0.10
      );
      {
        // Dynamic positioning: use offensive if ball in attack half, defensive if in defense half
        const receiverX = interceptContext?.interceptX ?? 50;
        const receiverIsHome = interceptContext?.participantClubId === interceptContext?.homeClubId;
        const isInAttackHalf = receiverIsHome ? receiverX > 50 : receiverX < 50;
        const posAttr = isInAttackHalf ? 'posicionamento_ofensivo' : 'posicionamento_defensivo';
        defenderSkill = (
          normalizeAttr(defenderAttrs.controle_bola ?? 40) * 0.25 +
          normalizeAttr(defenderAttrs.visao_jogo ?? 40) * 0.20 +
          normalizeAttr(defenderAttrs.equilibrio ?? 40) * 0.15 +
          normalizeAttr(defenderAttrs[posAttr] ?? 40) * 0.15 +
          normalizeAttr(defenderAttrs.trabalho_equipe ?? 40) * 0.10 +
          normalizeAttr(defenderAttrs.um_toque ?? 40) * 0.10 +
          normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.05
        );
      }
      break;
    case 'block_shot':
      // Attacker (shooter) skill
      attackerSkill = (
        normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.50 +
        normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.30 +
        normalizeAttr(attackerAttrs.curva ?? 40) * 0.10 +
        normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.10
      );
      // Defender blocking
      defenderSkill = (
        normalizeAttr(defenderAttrs.coragem ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.20 +
        normalizeAttr(defenderAttrs.marcacao ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.forca ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.posicionamento_defensivo ?? 40) * 0.10 +
        normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.10 +
        normalizeAttr(defenderAttrs.desarme ?? 40) * 0.05
      );
      break;
    case 'gk_save':
      attackerSkill = (
        normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.50 +
        normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.30 +
        normalizeAttr(attackerAttrs.curva ?? 40) * 0.10 +
        normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.10
      );
      defenderSkill = (
        normalizeAttr(defenderAttrs.reflexo ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.pegada ?? 40) * 0.25 +
        normalizeAttr(defenderAttrs.tempo_reacao ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.15 +
        normalizeAttr(defenderAttrs.posicionamento_gol ?? 40) * 0.10 +
        normalizeAttr(defenderAttrs.um_contra_um ?? 40) * 0.10
      );
      break;
    case 'block':
      if (context.defenderRole === 'goalkeeper') {
        // Espalmar
        attackerSkill = (
          normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.50 +
          normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.30 +
          normalizeAttr(attackerAttrs.curva ?? 40) * 0.10 +
          normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.10
        );
        defenderSkill = (
          normalizeAttr(defenderAttrs.reflexo ?? 40) * 0.30 +
          normalizeAttr(defenderAttrs.tempo_reacao ?? 40) * 0.20 +
          normalizeAttr(defenderAttrs.posicionamento_gol ?? 40) * 0.15 +
          normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.15 +
          normalizeAttr(defenderAttrs.pegada ?? 40) * 0.10 +
          normalizeAttr(defenderAttrs.um_contra_um ?? 40) * 0.10
        );
      } else {
        // Outfield block - attacker skill depends on whether it's a shot or pass
        if (isShootType(ballActionType || '') || isHeaderShootType(ballActionType || '')) {
          // Block Chute/Cabeceio - attacker's accuracy and curve make it harder to block
          attackerSkill = (
            normalizeAttr(attackerAttrs.acuracia_chute ?? 40) * 0.50 +
            normalizeAttr(attackerAttrs.forca_chute ?? 40) * 0.30 +
            normalizeAttr(attackerAttrs.curva ?? 40) * 0.10 +
            normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.10
          );
        } else {
          // Block Passe - passer's curve and pass skill make it harder
          attackerSkill = (
            normalizeAttr(attackerAttrs.curva ?? 40) * 0.30 +
            normalizeAttr(attackerAttrs.passe_alto ?? 40) * 0.30 +
            normalizeAttr(attackerAttrs.visao_jogo ?? 40) * 0.20 +
            normalizeAttr(attackerAttrs.controle_bola ?? 40) * 0.20
          );
        }
        // Defender blocking
        if (isShootType(ballActionType || '') || isHeaderShootType(ballActionType || '')) {
          // Block Chute
          defenderSkill = (
            normalizeAttr(defenderAttrs.coragem ?? 40) * 0.25 +
            normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.20 +
            normalizeAttr(defenderAttrs.marcacao ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.forca ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.posicionamento_defensivo ?? 40) * 0.10 +
            normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.10 +
            normalizeAttr(defenderAttrs.desarme ?? 40) * 0.05
          );
        } else {
          // Block Passe
          defenderSkill = (
            normalizeAttr(defenderAttrs.marcacao ?? 40) * 0.20 +
            normalizeAttr(defenderAttrs.desarme ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.agilidade ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.forca ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.coragem ?? 40) * 0.15 +
            normalizeAttr(defenderAttrs.posicionamento_defensivo ?? 40) * 0.10 +
            normalizeAttr(defenderAttrs.tomada_decisao ?? 40) * 0.10
          );
        }
      }
      break;
  }

  let successChance: number;
  if (context.type === 'tackle') {
    // Tackle: 50% base when skills are equal, skill difference shifts ±35%, randomness ±10%
    const skillDelta = defenderSkill - attackerSkill;
    successChance = 0.50 + skillDelta * 0.35 + (Math.random() - 0.5) * 0.20;
  } else if (context.type === 'gk_save' || (context.type === 'block' && context.defenderRole === 'goalkeeper')) {
    // GK save/block: movement-based difficulty + skill difference ±80% + randomness ±10%
    const moveRatio = interceptContext?.gkMovementRatio ?? 0.5;
    const skillDelta = defenderSkill - attackerSkill;
    const isEspalmar = context.type === 'block';
    // Agarrar: 50% still → 27.5% max move | Espalmar: 60% still → 45% max move
    const baseChance = isEspalmar
      ? 0.60 - moveRatio * 0.15
      : 0.50 - moveRatio * 0.225;
    successChance = baseChance + skillDelta * 0.80 + (Math.random() - 0.5) * 0.20;
  } else {
    successChance = context.baseChance * (0.5 + defenderSkill * 0.5) * (1 - attackerSkill * 0.3);
  }

  if (ballHeightZone === 'yellow') {
    const heightBonus = (normalizeAttr(defenderAttrs.cabeceio ?? 40) * 0.3 +
      normalizeAttr(defenderAttrs.pulo ?? 40) * 0.3 +
      normalizeAttr(defenderAttrs.defesa_aerea ?? 40) * 0.2 +
      normalizeAttr(defenderAttrs.forca ?? 40) * 0.2);
    const heightMods: Record<string, number> = {
      'Muito Baixo': -0.15, 'Baixo': -0.08, 'Médio': 0, 'Alto': 0.10, 'Muito Alto': 0.15,
    };
    const heightMod = heightMods[defenderHeight || 'Médio'] ?? 0;
    successChance *= (0.7 + heightBonus * 0.6 + heightMod);

    // Extra GK aerial bonus for agarrar/espalmar
    if (context.type === 'gk_save' || (context.type === 'block' && context.defenderRole === 'goalkeeper')) {
      successChance += normalizeAttr(defenderAttrs.defesa_aerea ?? 40) * 0.10;
    }
  }

  successChance = Math.max(0.05, Math.min(0.95, successChance));
  const roll = Math.random();
  let success = roll < successChance;

  let foul = false;
  if (context.type === 'tackle') {
    const tackleSkill = (normalizeAttr(defenderAttrs.desarme ?? 40) + normalizeAttr(defenderAttrs.marcacao ?? 40)) / 2;
    if (success) {
      // Hard tackle wins ball but might be a foul
      const foulChance = (1 - tackleSkill) * 0.20;
      foul = Math.random() < foulChance;
    } else {
      // Failed tackle has higher foul chance
      const foulChance = (1 - tackleSkill) * 0.55 + 0.10;
      foul = Math.random() < foulChance;
    }
    if (foul && success) {
      // Foul overrides the successful tackle — possession stays with attacker
      success = false;
    }
  }

  let card: 'yellow' | undefined;
  if (foul) {
    const recklessness = 1 - normalizeAttr(defenderAttrs.tomada_decisao ?? 40);
    const yellowChance = 0.25 + recklessness * 0.15; // ~25-40% of fouls get yellow
    if (Math.random() < yellowChance) {
      card = 'yellow';
    }
  }

  console.log(`[ENGINE] Intercept ${context.type}: defSkill=${defenderSkill.toFixed(2)} atkSkill=${attackerSkill.toFixed(2)} chance=${(successChance*100).toFixed(1)}% roll=${roll.toFixed(3)} success=${success} foul=${foul} card=${card || 'none'} zone=${ballHeightZone || 'green'}`);
  return { success, chance: successChance, foul, card };
}

function resolveDispute(
  attackerCandidate: { participant: any; progress: number; interceptX: number; interceptY: number },
  defenderCandidate: { participant: any; progress: number; interceptX: number; interceptY: number },
  attrByProfile: Record<string, any>,
  ballHeightZone: 'green' | 'yellow' | 'red',
  turnNumber: number,
): { winner: 'attacker' | 'defender'; chance: number } {
  const getAttrs = (p: any) => {
    const raw = p?.player_profile_id ? attrByProfile[p.player_profile_id] : null;
    const energyPct = Number(p?.match_energy ?? 100);
    const penalty = getEnergyPenalty(energyPct);
    return (key: string) => {
      const val = Number(raw?.[key] ?? 40);
      if (key === 'stamina') return val; // stamina NOT penalized
      return Math.max(10, Math.round(val * (1 - penalty)));
    };
  };

  const atkA = getAttrs(attackerCandidate.participant);
  const defA = getAttrs(defenderCandidate.participant);

  // Dispute Attack skill
  let atkSkill = (
    normalizeAttr(atkA('aceleracao')) * 0.15 +
    normalizeAttr(atkA('agilidade')) * 0.15 +
    normalizeAttr(atkA('forca')) * 0.15 +
    normalizeAttr(atkA('equilibrio')) * 0.10 +
    normalizeAttr(atkA('antecipacao')) * 0.10 +
    normalizeAttr(atkA('posicionamento_ofensivo')) * 0.10 +
    normalizeAttr(atkA('trabalho_equipe')) * 0.05 +
    normalizeAttr(atkA('tomada_decisao')) * 0.05
  );
  // Add pulo if ball is aerial (yellow zone)
  if (ballHeightZone === 'yellow') {
    atkSkill = atkSkill * 0.85 + normalizeAttr(atkA('pulo')) * 0.15;
  }

  // Dispute Defense skill
  let defSkill = (
    normalizeAttr(defA('aceleracao')) * 0.10 +
    normalizeAttr(defA('agilidade')) * 0.15 +
    normalizeAttr(defA('forca')) * 0.15 +
    normalizeAttr(defA('equilibrio')) * 0.10 +
    normalizeAttr(defA('desarme')) * 0.10 +
    normalizeAttr(defA('marcacao')) * 0.10 +
    normalizeAttr(defA('antecipacao')) * 0.10 +
    normalizeAttr(defA('posicionamento_defensivo')) * 0.05
  );
  if (ballHeightZone === 'yellow') {
    defSkill = defSkill * 0.85 + normalizeAttr(defA('pulo')) * 0.15;
  }

  // GK bonuses for defender
  const defSlotPos = defenderCandidate.participant._slot_position || defenderCandidate.participant.field_pos || '';
  if (isGKPosition(defSlotPos)) {
    // Saída do gol: bonus when GK comes out of goal area
    const defX = Number(defenderCandidate.participant.pos_x ?? 50);
    const isGKFarFromGoal = defX > 18 && defX < 82; // GK outside their box
    if (isGKFarFromGoal) {
      defSkill += normalizeAttr(defA('saida_gol')) * 0.10;
    }
    // Comando de área: bonus in aerial disputes inside the box
    if (ballHeightZone === 'yellow') {
      defSkill += normalizeAttr(defA('comando_area')) * 0.10;
    }
    // Defesa aérea: general aerial bonus
    if (ballHeightZone === 'yellow') {
      defSkill += normalizeAttr(defA('defesa_aerea')) * 0.05;
    }
  }

  // Base chance: 50/50, modified by skills
  let attackerChance = 0.50 + (atkSkill - defSkill) * 0.30;
  attackerChance = Math.max(0.15, Math.min(0.85, attackerChance));

  const roll = Math.random();
  const winner = roll < attackerChance ? 'attacker' : 'defender';

  console.log(`[ENGINE] Dispute: atkSkill=${atkSkill.toFixed(2)} defSkill=${defSkill.toFixed(2)} atkChance=${(attackerChance*100).toFixed(0)}% roll=${roll.toFixed(3)} winner=${winner}`);

  return { winner, chance: attackerChance };
}

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string, attrByProfile: Record<string, any>, playerProfilesMap?: Record<string, any>, turnNumber?: number, eventsToLog?: any[], getCoachBonusFn?: (clubId: string, skillType: string) => number, setPieceType?: string | null): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
  looseBallPos?: { x: number; y: number };
  failedContestParticipantId?: string;
  failedContestLog?: string;
  foul?: boolean;
  foulPosition?: { x: number; y: number };
  card?: 'yellow';
  disputeInfo?: { winner: 'attacker' | 'defender'; zone: string };
  gkSaveAttempt?: { gkParticipantId: string; gkClubId: string; chance: string; saved: boolean };
} {
  let _disputeInfo: { winner: 'attacker' | 'defender'; zone: string } | undefined;
  let gkSaveAttempt: { gkParticipantId: string; gkClubId: string; chance: string; saved: boolean } | undefined;
  const getFullAttrs = (participant: any) => {
    const raw = participant?.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
    const result: Record<string, number> = {};
    const keys = ['drible','controle_bola','forca','agilidade','desarme','marcacao','antecipacao',
      'passe_baixo','passe_alto','visao_jogo','tomada_decisao','um_toque','acuracia_chute',
      'forca_chute','curva','coragem','reflexo','posicionamento_gol','um_contra_um','tempo_reacao',
      'cabeceio','pulo','defesa_aerea','posicionamento_defensivo','pegada',
      'equilibrio','posicionamento_ofensivo','trabalho_equipe',
      'distribuicao_curta','distribuicao_longa','saida_gol','comando_area','resistencia','stamina'];
    for (const k of keys) result[k] = Number(raw?.[k] ?? 40);
    return result;
  };

  const getPlayerHeight = (participant: any): string => {
    if (!participant?.player_profile_id || !playerProfilesMap) return 'Médio';
    return playerProfilesMap[participant.player_profile_id]?.height || 'Médio';
  };


  const bh = participants.find((p: any) => p.id === _attacker.participant_id);
  const bhAttrs = getFullAttrs(bh);
  const bhActionType = _attacker.action_type || action;
  const interceptors = findInterceptorCandidates(allActions, _attacker, participants, turnNumber, attrByProfile, setPieceType, possClubId);

  // ── DISPUTE DETECTION ──
  // If multiple interceptors from DIFFERENT teams target the same area (within 3 units),
  // resolve a dispute to determine who gets priority.
  if (interceptors.length >= 2) {
    const possessionClubId = bh?.club_id || possClubId;
    let disputeHandled = false;

    for (let i = 0; i < interceptors.length - 1 && !disputeHandled; i++) {
      for (let j = i + 1; j < interceptors.length && !disputeHandled; j++) {
        const a = interceptors[i];
        const b = interceptors[j];

        // Check if they're from different teams AND targeting nearby spots
        if (a.participant.club_id !== b.participant.club_id) {
          const dist = Math.sqrt(
            (a.interceptX - b.interceptX) ** 2 + (a.interceptY - b.interceptY) ** 2
          );

          if (dist < 3.0) {
            // DISPUTE! Determine attacker vs defender
            const aIsAttacker = a.participant.club_id === possessionClubId;
            const attackerCand = aIsAttacker ? a : b;
            const defenderCand = aIsAttacker ? b : a;
            const attackerIdx = aIsAttacker ? i : j;
            const defenderIdx = aIsAttacker ? j : i;

            // Determine ball height at this point
            let disputeZone: 'green' | 'yellow' | 'red' = 'green';
            const avgProgress = (a.progress + b.progress) / 2;
            if (bhActionType === 'pass_high') {
              if (avgProgress > 0.2 && avgProgress < 0.8) disputeZone = 'red';
              else disputeZone = 'yellow';
            } else if (bhActionType === 'pass_launch') {
              if (avgProgress > 0.35 && avgProgress < 0.65) disputeZone = 'red';
              else if (avgProgress > 0.05 && avgProgress < 0.95) disputeZone = 'yellow';
            }

            // Check header bonus: find what action each player chose
            const atkAction = allActions.find((ac: any) => ac.participant_id === attackerCand.participant.id);
            const defAction = allActions.find((ac: any) => ac.participant_id === defenderCand.participant.id);
            const atkIsHeader = atkAction && isHeaderType(atkAction.action_type);
            const defIsHeader = defAction && isHeaderType(defAction.action_type);

            const { winner } = resolveDispute(
              attackerCand, defenderCand,
              attrByProfile || {}, disputeZone, turnNumber || 1
            );

            // Apply header bonus: if one used header and other didn't in yellow zone, header user gets second chance
            let finalWinner = winner;
            if (disputeZone === 'yellow') {
              if (atkIsHeader && !defIsHeader && winner === 'defender') {
                if (Math.random() < 0.15) finalWinner = 'attacker';
              } else if (defIsHeader && !atkIsHeader && winner === 'attacker') {
                if (Math.random() < 0.15) finalWinner = 'defender';
              }
            }

            // Reorder: winner first, loser second
            if (finalWinner === 'attacker') {
              if (attackerIdx > defenderIdx) {
                [interceptors[attackerIdx], interceptors[defenderIdx]] = [interceptors[defenderIdx], interceptors[attackerIdx]];
              }
            } else {
              if (defenderIdx > attackerIdx) {
                [interceptors[attackerIdx], interceptors[defenderIdx]] = [interceptors[defenderIdx], interceptors[attackerIdx]];
              }
            }

            _disputeInfo = { winner: finalWinner, zone: disputeZone };
            if (eventsToLog) {
              eventsToLog.push({
                match_id: _attacker.match_id,
                event_type: 'dispute',
                title: finalWinner === 'attacker' ? '⚔️ Disputa: Ataque venceu!' : '🛡️ Disputa: Defesa venceu!',
                body: `Disputa ${disputeZone === 'yellow' ? 'aérea' : 'no chão'}${atkIsHeader || defIsHeader ? ' (cabeceio)' : ''}.`,
              });
            }
            console.log(`[ENGINE] Dispute resolved: ${finalWinner === 'attacker' ? 'ATK' : 'DEF'} goes first (header bonus: atk=${atkIsHeader} def=${defIsHeader})`);
            disputeHandled = true;
          }
        }
      }
    }
  }

  for (const candidate of interceptors) {
    const defAttrs = getFullAttrs(candidate.participant);
    const slotPos = candidate.participant.slot_position || candidate.participant._slot_position || candidate.participant.field_pos || '';
    const isGK = isGKPosition(slotPos);
    // Find the interceptor's action to check if they used 'block'
    const interceptorAction = allActions.find((a: any) => a.participant_id === candidate.participant.id && (a.action_type === 'receive' || a.action_type === 'block'));
    const interceptorActionType = interceptorAction?.action_type;
    const context = getInterceptContext(bhActionType, candidate.participant.club_id, bh?.club_id || possClubId, isGK ? 'GK' : 'player', interceptorActionType);
    let ballHeightZone: 'green' | 'yellow' | 'red' = 'green';
    const t = candidate.progress;
    if (bhActionType === 'pass_high') {
      if (t > 0.2 && t < 0.8) ballHeightZone = 'red';
      else ballHeightZone = 'yellow';
    } else if (bhActionType === 'pass_launch') {
      if (t > 0.35 && t < 0.65) ballHeightZone = 'red';
      else if (t > 0.05 && t < 0.95) ballHeightZone = 'yellow';
    }
    if (ballHeightZone === 'red') {
      console.log(`[ENGINE] Intercept skipped (red zone): ball too high at t=${t.toFixed(2)}`);
      continue;
    }
    const defHeight = getPlayerHeight(candidate.participant);
    // Calculate GK movement ratio for save difficulty scaling
    let gkMovementRatio: number | undefined;
    if (isGK) {
      const gkOrigX = Number(candidate.participant.pos_x ?? candidate.participant.field_x ?? 50);
      const gkOrigY = Number(candidate.participant.pos_y ?? candidate.participant.field_y ?? 50);
      const gkMoveDist = Math.sqrt((candidate.interceptX - gkOrigX) ** 2 + (candidate.interceptY - gkOrigY) ** 2);
      const gkMaxRange = 11.8; // approximate max move range
      gkMovementRatio = Math.min(1, gkMoveDist / gkMaxRange);
    }
    let { success, chance, foul, card } = computeInterceptSuccess(context, bhAttrs, defAttrs, ballHeightZone, defHeight, bhActionType, {
      interceptX: candidate.interceptX,
      participantClubId: candidate.participant.club_id,
      homeClubId: bh?.club_id || possClubId,
      gkMovementRatio,
    });

    // ── Coach bonuses ──
    if (getCoachBonusFn) {
      // High press: +1% steal chance per level (max 5%)
      const defClubId = candidate.participant.club_id;
      const highPressBonus = getCoachBonusFn(defClubId, 'high_press') / 100;
      if (!success && highPressBonus > 0 && Math.random() < highPressBonus) {
        success = true;
        chance = Math.min(0.99, chance + highPressBonus);
      }
    }

    const chancePct = `${(chance * 100).toFixed(0)}%`;

    if (success) {
      if (context.type === 'tackle') {
        return { success: false, event: 'tackle', description: `🦵 Desarme bem-sucedido! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
      }
      if (context.type === 'block' || context.type === 'block_shot') {
        // Block: ball deflects opposite to shot direction + randomness (loose ball)
        const blockX = candidate.interceptX ?? 50;
        const blockY = candidate.interceptY ?? 50;
        const shotDx = _attacker.target_x - Number(bh?.pos_x ?? 50);
        const shotDy = _attacker.target_y - Number(bh?.pos_y ?? 50);
        const shotAngle = Math.atan2(shotDy, shotDx);
        const deflectAngle = shotAngle + Math.PI + (Math.random() - 0.5) * Math.PI; // opposite + up to ±90°
        const deflectDist = 5 + Math.random() * 15; // 5-20 units
        const looseBallX = Math.max(1, Math.min(99, blockX + Math.cos(deflectAngle) * deflectDist));
        const looseBallY = Math.max(1, Math.min(99, blockY + Math.sin(deflectAngle) * deflectDist));
        const blockDesc = (context.type === 'block' && context.defenderRole === 'goalkeeper') ? `🧤 Goleiro espalmou! (${chancePct})` : `🛡️ Bloqueio! (${chancePct})`;
        return { success: false, event: 'block', description: blockDesc, possession_change: false, goal: false, newBallHolderId: undefined, looseBallPos: { x: looseBallX, y: looseBallY } };
      }
      if (context.type === 'gk_save') {
        return { success: false, event: 'saved', description: `🧤 Defesa do goleiro! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id, gkSaveAttempt: { gkParticipantId: candidate.participant.id, gkClubId: candidate.participant.club_id, chance: chancePct, saved: true } };
      }
      return { success: false, event: 'intercepted', description: `🤲 Bola dominada! (${chancePct})`, possession_change: candidate.participant.club_id !== possClubId, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
    }

    if (context.type === 'tackle') {
      if (foul) {
        return { success: false, event: 'foul', description: `🟡 Falta! (Desarme: ${chancePct})`, possession_change: false, goal: false, foul: true, foulPosition: { x: candidate.interceptX ?? 50, y: candidate.interceptY ?? 50 }, failedContestParticipantId: candidate.participant.id, failedContestLog: `🟡 Falta cometida! (${chancePct})`, card };
      }
      return { success: true, event: 'dribble', description: `🏃 Drible bem-sucedido! (Desarme: ${chancePct})`, possession_change: false, goal: false, failedContestParticipantId: candidate.participant.id, failedContestLog: `🦵 Desarme falhou! (${chancePct})` };
    }

    if (context.type === 'block_shot' || context.type === 'block') console.log(`[ENGINE] 💨 Bloqueio falhou! (${chancePct}) Bola continua.`);
    else if (context.type === 'gk_save') {
      console.log(`[ENGINE] 🧤 Goleiro não segurou! (${chancePct})`);
      gkSaveAttempt = { gkParticipantId: candidate.participant.id, gkClubId: candidate.participant.club_id, chance: chancePct, saved: false };
    }
    else console.log(`[ENGINE] ❌ Falhou o domínio! (${chancePct}) Bola continua.`);
  }

  if (isShootType(action) || isHeaderShootType(action)) return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true, gkSaveAttempt };
  if (isPassType(action) || isHeaderPassType(action)) return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  if (action === 'move') return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
  return { success: true, event: 'no_action', description: '🔄 Sem ação', possession_change: false, goal: false };
}

function findInterceptorCandidates(allActions: any[], ballHolderAction: any, participants: any[], turnNumber?: number, attrByProfile?: Record<string, any>, setPieceType?: string | null, possClubId?: string | null): Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> {
  if (!ballHolderAction || ballHolderAction.target_x == null || ballHolderAction.target_y == null) return [];
  const bh = participants.find((p: any) => p.id === ballHolderAction.participant_id);
  if (!bh) return [];

  const startX = bh.pos_x ?? 50;
  const startY = bh.pos_y ?? 50;
  const endX = ballHolderAction.target_x;
  const endY = ballHolderAction.target_y;

  const bhActionType = ballHolderAction.action_type || 'move';

  // Ball speed: faster ball = less time to move = reduced interception range
  const ballSpeedFactor =
    (bhActionType === 'shoot_power' || bhActionType === 'header_power') ? 0.25 :
    (bhActionType === 'shoot_controlled' || bhActionType === 'header_controlled') ? 0.35 :
    bhActionType === 'pass_launch' ? 0.5 :
    (bhActionType === 'pass_high' || bhActionType === 'header_high') ? 0.65 :
    1.0; // pass_low / header_low / move = normal speed

  const interceptors: Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> = [];
  for (const a of allActions) {
    if (a.participant_id === ballHolderAction.participant_id) continue;
    if ((a.action_type !== 'receive' && a.action_type !== 'block') || a.target_x == null || a.target_y == null) continue;
    const actionParticipant = participants.find((p: any) => p.id === a.participant_id);
    if (actionParticipant?.is_sent_off) continue;

    // Free kick exclusion zone: defending players within 10 units of ball origin cannot intercept
    if (setPieceType && setPieceType !== 'kickoff' && actionParticipant && actionParticipant.club_id !== possClubId) {
      const posX = Number(actionParticipant.pos_x ?? 50);
      const posY = Number(actionParticipant.pos_y ?? 50);
      const distToBallOrigin = Math.sqrt((posX - startX) ** 2 + (posY - startY) ** 2);
      if (distToBallOrigin < 10) {
        console.log(`[ENGINE] Intercept rejected (free kick exclusion): player ${a.participant_id.slice(0,8)} dist=${distToBallOrigin.toFixed(1)} < 10 from ball origin`);
        continue;
      }
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((a.target_x - startX) * dx + (a.target_y - startY) * dy) / len2));
    const cx = startX + dx * t;
    const cy = startY + dy * t;
    const dist = Math.sqrt((a.target_x - cx) ** 2 + (a.target_y - cy) ** 2);

    // Player's action target must be within 1 unit of the ball trajectory
    const INTERCEPT_THRESHOLD = 1.0;
    if (dist <= INTERCEPT_THRESHOLD) {
      // Check interceptable zones (block vs receive have different allowed trajectory segments)
      const interceptableRanges = getInterceptableRanges(bhActionType, a.action_type);
      // Small tolerance at zone boundaries to account for client/server t calculation differences
      const ZONE_TOLERANCE = 0.03;
      const isInInterceptableZone = interceptableRanges.some(([lo, hi]) => t >= (lo - ZONE_TOLERANCE) && t <= (hi + ZONE_TOLERANCE));
      if (isInInterceptableZone) {
        // ── Physical reach + timing validation ──
        const interceptor = participants.find((p: any) => p.id === a.participant_id);
        if (interceptor && turnNumber != null && attrByProfile) {
          const pRaw = interceptor.player_profile_id ? attrByProfile[interceptor.player_profile_id] : null;
          const moveAttrs = {
            velocidade: Number(pRaw?.velocidade ?? 40),
            aceleracao: Number(pRaw?.aceleracao ?? 40),
            agilidade: Number(pRaw?.agilidade ?? 40),
            stamina: Number(pRaw?.stamina ?? 40),
            forca: Number(pRaw?.forca ?? 40),
          };
          const maxRange = computeMaxMoveRange(moveAttrs, turnNumber);
          // Block actions use full range (player puts body in the way, doesn't need to catch up to ball)
          // Receive actions get ballSpeed reduction (harder to control fast ball)
          // GK always uses full range on shots
          const isInterceptorGK = isGKPosition(interceptor._slot_position || interceptor.primary_position || '');
          const isShot = bhActionType === 'shoot_controlled' || bhActionType === 'shoot_power' || bhActionType === 'header_controlled' || bhActionType === 'header_power';
          const useFullRange = a.action_type === 'block' || (isInterceptorGK && isShot);
          const adjustedMaxRange = useFullRange ? maxRange : maxRange * ballSpeedFactor;
          const posX = Number(interceptor.pos_x ?? 50);
          const posY = Number(interceptor.pos_y ?? 50);
          const distToIntercept = Math.sqrt((posX - cx) ** 2 + (posY - cy) ** 2);
          // Range check: can the player physically reach the intercept point?
          if (distToIntercept > adjustedMaxRange) {
            console.log(`[ENGINE] Intercept rejected: player ${interceptor.id} distToIntercept=${distToIntercept.toFixed(1)} > adjustedMaxRange=${adjustedMaxRange.toFixed(1)} (ballSpeed=${ballSpeedFactor}${isInterceptorGK ? ' GK_FULL_RANGE' : ''})`);
            continue;
          }
          // ── Early intercept hard cap: at the very start of the trajectory,
          // only players already pressing the ball holder can intercept ──
          if (t < 0.05 && distToIntercept > 2.5) {
            console.log(`[ENGINE] Intercept rejected (early, too far): player ${interceptor.id} dist=${distToIntercept.toFixed(1)} > 2.5 at t=${t.toFixed(2)}`);
            continue;
          }
          // Timing check: the ball arrives at progress t (0=start, 1=end).
          // For move (tackle): defender and attacker run at similar speed — scale linearly.
          // For ball actions: ball is faster — need more restrictive timing at early progress.
          const isTackle = bhActionType === 'move';
          const timingRange = isTackle
            ? adjustedMaxRange * Math.max(0.15, t) // tackle: generous — both running
            : adjustedMaxRange * Math.max(0.15, t); // pass/shoot: also scales linearly with progress
          if (distToIntercept > timingRange) {
            console.log(`[ENGINE] Intercept rejected (timing): player ${interceptor.id} dist=${distToIntercept.toFixed(1)} > timingRange=${timingRange.toFixed(1)} (progress=${t.toFixed(2)})`);
            continue;
          }
        }
        console.log(`[ENGINE] Intercept ACCEPTED: player ${a.participant_id.slice(0,8)} at t=${t.toFixed(2)} dist=${dist.toFixed(1)} intercept=(${cx.toFixed(1)},${cy.toFixed(1)})`);
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
  let candidates = (seededParticipants || []).filter((p: any) => p.club_id === clubId && p.role_type === 'player' && !p.is_sent_off);

  if (candidates.length === 0) {
    const { data } = await supabase
      .from('match_participants')
      .select('id, club_id, role_type, lineup_slot_id, player_profile_id, pos_x, pos_y, created_at, is_sent_off')
      .eq('match_id', matchId)
      .eq('club_id', clubId)
      .eq('role_type', 'player')
      .neq('is_sent_off', true);
    candidates = data || [];
  }

  if (candidates.length === 0) return null;

  const slotIds = [...new Set(candidates.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id))];
  const profileIds = [...new Set(candidates.filter((p: any) => p.player_profile_id).map((p: any) => p.player_profile_id))];
  const [{ data: slots }, { data: profiles }] = await Promise.all([
    slotIds.length > 0
      ? supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase.from('player_profiles').select('id, primary_position').in('id', profileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const slotMap = new Map<string, string>((slots || []).map((slot: any) => [slot.id, slot.slot_position]));
  const profilePosMap = new Map<string, string>((profiles || []).map((profile: any) => [profile.id, profile.primary_position]));
  const gkIdByClub = getGoalkeeperIdsByClub(candidates, slotMap, profilePosMap);
  const clubGoalkeeperId = gkIdByClub.get(clubId);
  const nonGoalkeeperCandidates = candidates.filter((participant: any) => participant.id !== clubGoalkeeperId);
  if (nonGoalkeeperCandidates.length > 0) {
    candidates = nonGoalkeeperCandidates;
  }

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
  const maxSpeed = (10 + normalizeAttr(attrs.velocidade) * 14) / NUM_SUBSTEPS;
  // Energy-based stamina system replaces old time-based staminaDecay

  const state: PhysicsPlayerState = { pos: { ...startPos }, vel: { x: 0, y: 0 } };

  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    const toTarget = { x: targetPos.x - state.pos.x, y: targetPos.y - state.pos.y };
    const dist = vecLen(toTarget);
    if (dist < 0.1) break;

    const desired = vecNorm(toTarget);
    const desiredVel = { x: desired.x * maxSpeed, y: desired.y * maxSpeed };

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

function findLooseBallClaimer(allActions: any[], participants: any[], attrByProfile?: Record<string, any>, turnNumber?: number, ballPos?: { x: number; y: number } | null): any | null {
  const receiveActions = allActions.filter((a) => (a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null);
  const ranked: Array<{ participant: any; distance: number; createdAt: number }> = [];

  for (const action of receiveActions) {
    const participant = participants.find((p: any) => p.id === action.participant_id);
    if (!participant) continue;

    // If we know ball position, reject receives that are too far from the ball
    if (ballPos) {
      const distToBall = Math.sqrt((action.target_x - ballPos.x) ** 2 + (action.target_y - ballPos.y) ** 2);
      if (distToBall > 15) { // receive target must be within 15 units of ball
        console.log(`[ENGINE] Loose ball receive rejected: player ${participant.id.slice(0,8)} target too far from ball (${distToBall.toFixed(1)} > 15)`);
        continue;
      }
    }

    const startX = participant.pos_x ?? 50;
    const startY = participant.pos_y ?? 50;
    const dist = Math.sqrt((action.target_x - startX) ** 2 + (action.target_y - startY) ** 2);

    // ── Check if player can physically reach the ball ──
    if (attrByProfile && turnNumber != null) {
      const raw = participant.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
      const moveAttrs = {
        velocidade: Number(raw?.velocidade ?? 40),
        aceleracao: Number(raw?.aceleracao ?? 40),
        agilidade: Number(raw?.agilidade ?? 40),
        stamina: Number(raw?.stamina ?? 40),
        forca: Number(raw?.forca ?? 40),
      };
      const maxRange = computeMaxMoveRange(moveAttrs, turnNumber);
      if (dist > maxRange + 2) { // +2 tolerance
        console.log(`[ENGINE] Receive rejected: player ${participant.id.slice(0,8)} dist=${dist.toFixed(1)} > maxRange=${maxRange.toFixed(1)}`);
        continue;
      }
    }

    ranked.push({
      participant,
      distance: dist,
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
  match: { home_club_id: string; away_club_id: string; current_half?: number }
): OOBResult | null {
  const oppositeClub = lastTouchClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
  const isSecondHalf = (match.current_half ?? 1) >= 2;

  // In 2nd half, sides are flipped: home defends RIGHT (x>=99), away defends LEFT (x<=1)
  const leftDefender = isSecondHalf ? match.away_club_id : match.home_club_id;
  const rightDefender = isSecondHalf ? match.home_club_id : match.away_club_id;

  // Sidelines: y <= 1 or y >= 99 → throw-in
  if (ballY <= 1 || ballY >= 99) {
    return { type: 'throw_in', awardedClubId: oppositeClub, exitX: ballX, exitY: ballY, side: ballY <= 1 ? 'top' : 'bottom' };
  }

  // Left end line (x <= 1)
  if (ballX <= 1) {
    if (lastTouchClubId === leftDefender) {
      // Defending team touched last → corner for opponent
      return { type: 'corner', awardedClubId: lastTouchClubId === match.home_club_id ? match.away_club_id : match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    } else {
      return { type: 'goal_kick', awardedClubId: leftDefender, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    }
  }

  // Right end line (x >= 99)
  if (ballX >= 99) {
    if (lastTouchClubId === rightDefender) {
      return { type: 'corner', awardedClubId: lastTouchClubId === match.home_club_id ? match.away_club_id : match.home_club_id, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    } else {
      return { type: 'goal_kick', awardedClubId: rightDefender, exitX: ballX, exitY: ballY, side: ballY < 50 ? 'top' : 'bottom' };
    }
  }

  return null;
}

interface LineupRoles {
  captain_player_id: string | null;
  free_kick_taker_id: string | null;
  corner_right_taker_id: string | null;
  corner_left_taker_id: string | null;
  throw_in_right_taker_id: string | null;
  throw_in_left_taker_id: string | null;
}

function findParticipantByProfileId(participants: any[], profileId: string | null): any | null {
  if (!profileId) return null;
  return participants.find((p: any) => p.player_profile_id === profileId && !p.is_sent_off) || null;
}

async function handleSetPiece(
  supabase: any,
  matchId: string,
  oob: OOBResult,
  participants: any[],
  match: { home_club_id: string; away_club_id: string; home_lineup_id?: string | null; away_lineup_id?: string | null; current_half?: number },
  allActions: any[],
  lineupRoles?: { home: LineupRoles | null; away: LineupRoles | null }
): Promise<{ playerId: string; clubId: string; title: string; body: string } | null> {
  const teamPlayers = participants.filter((p: any) => p.club_id === oob.awardedClubId && p.role_type === 'player');
  if (teamPlayers.length === 0) return null;

  const isHomeTeam = oob.awardedClubId === match.home_club_id;
  const roles = lineupRoles ? (isHomeTeam ? lineupRoles.home : lineupRoles.away) : null;

  // Load slot positions for GK detection
  const slotIds = teamPlayers.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id);
  const { data: slots } = slotIds.length > 0
    ? await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds)
    : { data: [] };
  const slotMap = new Map((slots || []).map((s: any) => [s.id, s.slot_position]));

  const getSlotPos = (p: any): string => String(slotMap.get(p.lineup_slot_id) || p._slot_position || '');
  const getPlayerFinalPos = (p: any) => {
    const moveAct = allActions.find((ac: any) => ac.participant_id === p.id && (ac.action_type === 'move' || ac.action_type === 'receive' || ac.action_type === 'block'));
    return { x: Number(moveAct?.target_x ?? p.pos_x ?? 50), y: Number(moveAct?.target_y ?? p.pos_y ?? 50) };
  };

  if (oob.type === 'throw_in') {
    // Check for designated throw-in taker
    const isRightSide = oob.side === 'bottom';
    const takerId = roles ? (isRightSide ? roles.throw_in_right_taker_id : roles.throw_in_left_taker_id) : null;
    const designatedTaker = findParticipantByProfileId(teamPlayers, takerId);

    const outfield = teamPlayers.filter((p: any) => getSlotPos(p) !== 'GK');
    const candidates = outfield.length > 0 ? outfield : teamPlayers;

    candidates.sort((a: any, b: any) => {
      const posA = getPlayerFinalPos(a);
      const posB = getPlayerFinalPos(b);
      const distA = Math.sqrt((posA.x - oob.exitX) ** 2 + (posA.y - oob.exitY) ** 2);
      const distB = Math.sqrt((posB.x - oob.exitX) ** 2 + (posB.y - oob.exitY) ** 2);
      return distA - distB;
    });

    const chosen = designatedTaker || candidates[0];
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
    // Check for designated corner taker
    const isRightSide = oob.side === 'bottom';
    const takerId = roles ? (isRightSide ? roles.corner_right_taker_id : roles.corner_left_taker_id) : null;
    const designatedTaker = findParticipantByProfileId(teamPlayers, takerId);

    const forwards = teamPlayers.filter((p: any) => {
      const pos = getSlotPos(p).toUpperCase();
      return ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(pos);
    });
    const fallback = forwards.length > 0 ? forwards[0] : teamPlayers.filter((p: any) => getSlotPos(p) !== 'GK')[0] || teamPlayers[0];
    const chosen = designatedTaker || fallback;

    const isSecondHalf = (match.current_half ?? 1) >= 2;
    // In 2nd half, home attacks left (x=0), away attacks right (x=100)
    const cornerX = isHomeTeam
      ? (isSecondHalf ? 1 : 99)
      : (isSecondHalf ? 99 : 1);
    const cornerY = oob.side === 'top' ? 1 : 99;
    await supabase.from('match_participants').update({ pos_x: cornerX, pos_y: cornerY }).eq('id', chosen.id);

    return {
      playerId: chosen.id, clubId: oob.awardedClubId,
      title: '🚩 Escanteio!',
      body: `Escanteio para o ${isHomeTeam ? 'time da casa' : 'time visitante'}.`,
    };
  }

  if (oob.type === 'goal_kick') {
    const gk = teamPlayers.find((p: any) => isGKPosition(getSlotPos(p))) || teamPlayers[0];
    const isSecondHalf = (match.current_half ?? 1) >= 2;
    // In 2nd half sides are flipped: home defends right, away defends left
    const gkX = isHomeTeam
      ? (isSecondHalf ? 94 : 6)
      : (isSecondHalf ? 6 : 94);
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

function doesAerialBallGoOverGoal(action: any, startX: number): boolean {
  if (!action || (action.action_type !== 'pass_high' && action.action_type !== 'pass_launch')) return false;
  const endX = Number(action.target_x ?? startX);
  const goalX = endX >= startX ? 100 : 0;
  const deltaX = endX - startX;
  if (Math.abs(deltaX) < 0.001) return false;
  const progressAtGoal = (goalX - startX) / deltaX;
  if (progressAtGoal < 0 || progressAtGoal > 1) return false;
  if (action.action_type === 'pass_high') return progressAtGoal > 0.2 && progressAtGoal < 0.8;
  return progressAtGoal > 0.35 && progressAtGoal < 0.65;
}

function checkOffside(
  receiverParticipant: any,
  passerParticipant: any,
  participants: any[],
  possClubId: string,
  match: { home_club_id: string; away_club_id: string; current_half?: number },
): boolean {
  if (!receiverParticipant || !passerParticipant) return false;
  if (receiverParticipant.club_id !== possClubId) return false;
  const isSecondHalf = (match.current_half ?? 1) >= 2;
  // In 2nd half, home attacks LEFT (decreasing X), away attacks RIGHT (increasing X)
  const isHomeRaw = possClubId === match.home_club_id;
  const attacksRight = isHomeRaw ? !isSecondHalf : isSecondHalf;
  const receiverX = Number(receiverParticipant.pos_x ?? 50);
  const passerX = Number(passerParticipant.pos_x ?? 50);
  // Receiver must be ahead of passer in attacking direction
  if (attacksRight && receiverX <= passerX) return false;
  if (!attacksRight && receiverX >= passerX) return false;
  // Can't be offside in own half
  if (attacksRight && receiverX < 50) return false;
  if (!attacksRight && receiverX > 50) return false;
  const defenders = participants.filter(p => p.club_id !== possClubId && p.role_type === 'player');
  const sortedX = attacksRight
    ? defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => b - a)
    : defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => a - b);
  if (sortedX.length < 2) return false;
  const penultimateX = sortedX[1];
  const isOffside = attacksRight ? receiverX > penultimateX : receiverX < penultimateX;
  if (isOffside) console.log(`[ENGINE] 🚩 OFFSIDE! receiverX=${receiverX.toFixed(1)} penultimateDefX=${penultimateX.toFixed(1)} passerX=${passerX.toFixed(1)} attacksRight=${attacksRight}`);
  return isOffside;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}




async function invokeTickForMatch(functionUrl: string, matchId: string) {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ action: 'tick', match_id: matchId }),
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

// ─── Ensure each team has a goalkeeper ─────────────────────────
async function ensureGoalkeeperPerTeam(supabase: any, matchId: string, homeClubId: string, awayClubId: string) {
  const { data: allParts } = await supabase
    .from('match_participants')
    .select('id, club_id, role_type, lineup_slot_id, player_profile_id, pos_x, pos_y, is_bot')
    .eq('match_id', matchId)
    .eq('role_type', 'player');

  const participants = allParts || [];

  // Load lineup slot positions to identify GK from lineup
  const slotIds = participants.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id);
  let slotMap = new Map<string, string>();
  if (slotIds.length > 0) {
    const { data: slots } = await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds);
    slotMap = new Map((slots || []).map((s: any) => [s.id, s.slot_position]));
  }

  // Load player profiles to check primary_position
  const profileIds = participants.filter((p: any) => p.player_profile_id).map((p: any) => p.player_profile_id);
  let profilePosMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase.from('player_profiles').select('id, primary_position').in('id', profileIds);
    profilePosMap = new Map((profiles || []).map((p: any) => [p.id, p.primary_position]));
  }

  const gkIdByClub = getGoalkeeperIdsByClub(participants, slotMap, profilePosMap);

  for (const clubId of [homeClubId, awayClubId]) {
    const isHome = clubId === homeClubId;
    const teamParts = participants.filter((p: any) => p.club_id === clubId);
    const existingGKId = gkIdByClub.get(clubId);
    const existingGK = existingGKId ? teamParts.find((p: any) => p.id === existingGKId) : null;

    if (existingGK) {
      // GK exists — ensure they're positioned inside the box
      const gkX = isHome ? 5 : 95;
      const gkY = 50;
      const currentX = Number(existingGK.pos_x ?? 50);
      const currentY = Number(existingGK.pos_y ?? 50);
      const needsReposition = isHome
        ? currentX > 18 || currentY < 20 || currentY > 80
        : currentX < 82 || currentY < 20 || currentY > 80;
      if (needsReposition) {
        await supabase.from('match_participants').update({ pos_x: gkX, pos_y: gkY }).eq('id', existingGK.id);
        console.log(`[ENGINE] Repositioned existing GK ${existingGK.id.slice(0,8)} to (${gkX}, ${gkY})`);
      }
    } else {
      // No GK found — create a bot GK inside the box
      const gkX = isHome ? 5 : 95;
      const { data: insertedGK } = await supabase.from('match_participants').insert({
        match_id: matchId,
        club_id: clubId,
        role_type: 'player',
        is_bot: true,
        pos_x: gkX,
        pos_y: 50,
      }).select('id').single();
      console.log(`[ENGINE] Created bot GK ${insertedGK?.id?.slice(0,8)} for club ${clubId.slice(0,8)} at (${gkX}, 50)`);
    }
  }
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
      current_phase: 'positioning_attack',
      current_turn_number: 1,
      possession_club_id: possessionClubId,
      half_started_at: now,
      current_half: 1,
      injury_time_turns: 0,
      injury_time_start_turn: null,
    }).eq('id', m.id).eq('status', 'scheduled').lte('scheduled_at', now).select('id').maybeSingle();

    if (!claimedMatch) {
      continue;
    }

    let { data: existingParts } = await supabase
      .from('match_participants')
      .select('id, club_id, role_type, lineup_slot_id, player_profile_id, pos_x, pos_y')
      .eq('match_id', m.id)
      .eq('role_type', 'player');

    // ── Seed participants from lineups if none exist (league matches) ──
    // For league matches, participants aren't pre-created. We need to create them from
    // each club's active lineup_slots so human players get their connected_user_id set.
    const isTestMatch = !m.home_lineup_id && !m.away_lineup_id;
    if (!isTestMatch && (!existingParts || existingParts.length === 0)) {
      console.log(`[ENGINE] No existing participants for match ${m.id.slice(0,8)} — seeding from lineups`);

      const seedFromLineup = async (lineupId: string | null, clubId: string) => {
        if (!lineupId) return [];
        const { data: slots } = await supabase
          .from('lineup_slots')
          .select('id, player_profile_id, slot_position, sort_order, role_type')
          .eq('lineup_id', lineupId)
          .order('sort_order');

        if (!slots || slots.length === 0) return [];

        // Load player profiles to get user_id for connected_user_id
        const profileIds = slots.filter((s: any) => s.player_profile_id).map((s: any) => s.player_profile_id);
        const { data: profiles } = profileIds.length > 0
          ? await supabase.from('player_profiles').select('id, user_id').in('id', profileIds)
          : { data: [] };
        const profileUserMap = new Map((profiles || []).map((p: any) => [p.id, p.user_id]));

        const starterSlots = slots.filter((s: any) => s.role_type === 'starter' || !s.role_type);
        const benchSlots = slots.filter((s: any) => s.role_type === 'bench');

        const participants: any[] = [];

        // Starters become role_type 'player'
        for (const slot of starterSlots) {
          const userId = slot.player_profile_id ? profileUserMap.get(slot.player_profile_id) : null;
          participants.push({
            match_id: m.id,
            club_id: clubId,
            lineup_slot_id: slot.id,
            player_profile_id: slot.player_profile_id || null,
            role_type: 'player',
            is_bot: !userId,
            connected_user_id: userId || null,
          });
        }

        // Bench slots become role_type 'bench' (no field position)
        for (const slot of benchSlots) {
          const userId = slot.player_profile_id ? profileUserMap.get(slot.player_profile_id) : null;
          participants.push({
            match_id: m.id,
            club_id: clubId,
            lineup_slot_id: slot.id,
            player_profile_id: slot.player_profile_id || null,
            role_type: 'bench',
            is_bot: !userId,
            connected_user_id: userId || null,
            pos_x: null,
            pos_y: null,
          });
        }

        if (participants.length > 0) {
          const { data: inserted } = await supabase.from('match_participants').insert(participants).select('id, club_id, role_type, lineup_slot_id, player_profile_id, pos_x, pos_y');
          const starterCount = starterSlots.length;
          const benchCount = benchSlots.length;
          console.log(`[ENGINE] Seeded ${starterCount} starters + ${benchCount} bench (${participants.filter((p: any) => !p.is_bot).length} human) for club ${clubId.slice(0,8)}`);
          return inserted || [];
        }
        return [];
      };

      // Also create manager participants
      const seedManagers = async () => {
        const managerParts: any[] = [];
        for (const clubId of [m.home_club_id, m.away_club_id]) {
          const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', clubId).maybeSingle();
          if (club?.manager_profile_id) {
            const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', club.manager_profile_id).maybeSingle();
            if (mgr?.user_id) {
              managerParts.push({
                match_id: m.id,
                club_id: clubId,
                role_type: 'manager',
                is_bot: false,
                connected_user_id: mgr.user_id,
              });
            }
          }
        }
        if (managerParts.length > 0) {
          await supabase.from('match_participants').insert(managerParts);
          console.log(`[ENGINE] Seeded ${managerParts.length} manager participants`);
        }
      };

      const [homeSeeded, awaySeeded] = await Promise.all([
        seedFromLineup(m.home_lineup_id, m.home_club_id),
        seedFromLineup(m.away_lineup_id, m.away_club_id),
      ]);
      await seedManagers();

      existingParts = [...homeSeeded, ...awaySeeded];
    }

    // ── Backfill missing manager participants ──
    // If participants exist but manager participants are missing (e.g. RLS blocked
    // the challenger manager_profile read during challenge acceptance), create them now.
    {
      const { data: existingManagers } = await supabase
        .from('match_participants')
        .select('id, club_id, connected_user_id')
        .eq('match_id', m.id)
        .eq('role_type', 'manager');
      const managerClubIds = new Set((existingManagers || []).map((p: any) => p.club_id));
      const missingManagerParts: any[] = [];
      for (const clubId of [m.home_club_id, m.away_club_id]) {
        if (!managerClubIds.has(clubId)) {
          const { data: club } = await supabase.from('clubs').select('manager_profile_id').eq('id', clubId).maybeSingle();
          if (club?.manager_profile_id) {
            const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', club.manager_profile_id).maybeSingle();
            if (mgr?.user_id) {
              missingManagerParts.push({
                match_id: m.id,
                club_id: clubId,
                role_type: 'manager',
                is_bot: false,
                connected_user_id: mgr.user_id,
              });
            }
          }
        }
      }
      if (missingManagerParts.length > 0) {
        await supabase.from('match_participants').insert(missingManagerParts);
        console.log(`[ENGINE] Backfilled ${missingManagerParts.length} missing manager participants`);
      }
    }

    const homeParts = (existingParts || []).filter((p: any) => p.club_id === m.home_club_id && p.role_type === 'player');
    const awayParts = (existingParts || []).filter((p: any) => p.club_id === m.away_club_id && p.role_type === 'player');

    if (!isTestMatch) {
      // Read formation from lineup (where user sets it), fallback to club_settings
      const [{ data: homeLineup }, { data: awayLineup }, { data: homeSettings }, { data: awaySettings }] = await Promise.all([
        m.home_lineup_id
          ? supabase.from('lineups').select('formation').eq('id', m.home_lineup_id).maybeSingle()
          : supabase.from('lineups').select('formation').eq('club_id', m.home_club_id).eq('is_active', true).maybeSingle(),
        m.away_lineup_id
          ? supabase.from('lineups').select('formation').eq('id', m.away_lineup_id).maybeSingle()
          : supabase.from('lineups').select('formation').eq('club_id', m.away_club_id).eq('is_active', true).maybeSingle(),
        supabase.from('club_settings').select('default_formation').eq('club_id', m.home_club_id).maybeSingle(),
        supabase.from('club_settings').select('default_formation').eq('club_id', m.away_club_id).maybeSingle(),
      ]);
      const homeFormation = homeLineup?.formation || homeSettings?.default_formation || '4-4-2';
      const awayFormation = awayLineup?.formation || awaySettings?.default_formation || '4-4-2';

      const fillBots = async (clubId: string, currentCount: number, formation: string, isHome: boolean) => {
        if (currentCount >= 11) return;
        const positions = getFormationForFill(formation, isHome);
        const botsToInsert: any[] = [];
        for (let i = currentCount; i < 11; i++) {
          const pos = positions[i] || { x: isHome ? 30 : 70, y: 50, pos: 'CM' };
          botsToInsert.push({
            match_id: m.id,
            club_id: clubId,
            role_type: 'player',
            is_bot: true,
            pos_x: pos.x,
            pos_y: pos.y,
          });
        }
        if (botsToInsert.length > 0) {
          await supabase.from('match_participants').insert(botsToInsert);
          console.log(`[ENGINE] Filled ${botsToInsert.length} bots for club`);
        }
      };

      await Promise.all([
        fillBots(m.home_club_id, homeParts.length, homeFormation, true),
        fillBots(m.away_club_id, awayParts.length, awayFormation, false),
      ]);

      // ── Position ALL existing players to formation positions (match by slot position) ──
      const positionExistingPlayers = async (parts: any[], formation: string, isHome: boolean) => {
        if (parts.length === 0) return;
        const positions = getFormationForFill(formation, isHome);

        // Load slot positions for matching
        const slotIds = parts.filter((p: any) => p.lineup_slot_id).map((p: any) => p.lineup_slot_id);
        let slotPosMap = new Map<string, string>();
        if (slotIds.length > 0) {
          const { data: slots } = await supabase.from('lineup_slots').select('id, slot_position').in('id', slotIds);
          slotPosMap = new Map((slots || []).map((s: any) => [s.id, s.slot_position]));
        }

        // Also load player profiles for primary_position fallback
        const profileIds = parts.filter((p: any) => p.player_profile_id).map((p: any) => p.player_profile_id);
        let profilePosMap = new Map<string, string>();
        if (profileIds.length > 0) {
          const { data: profiles } = await supabase.from('player_profiles').select('id, primary_position').in('id', profileIds);
          profilePosMap = new Map((profiles || []).map((p: any) => [p.id, p.primary_position]));
        }

        const updates: Promise<any>[] = [];
        const usedPositionIndices = new Set<number>();

        // Position compatibility: map equivalent position names (EN + PT-BR)
        // Normalize position to a canonical key for comparison
        const normalizePosition = (pos: string): string => {
          const clean = pos.replace(/[0-9]/g, '').toUpperCase();
          const TO_CANONICAL: Record<string, string> = {
            'GK': 'GK', 'GOL': 'GK',
            'CB': 'CB', 'ZAG': 'CB',
            'LB': 'LB', 'LE': 'LB',
            'RB': 'RB', 'LD': 'RB',
            'LWB': 'LWB', 'ALE': 'LWB',
            'RWB': 'RWB', 'ALD': 'RWB',
            'CDM': 'CDM', 'DM': 'CDM', 'VOL': 'CDM',
            'CM': 'CM', 'MC': 'CM',
            'CAM': 'CAM', 'MEI': 'CAM',
            'LM': 'LM', 'ME': 'LM',
            'RM': 'RM', 'MD': 'RM',
            'LW': 'LW', 'PE': 'LW',
            'RW': 'RW', 'PD': 'RW',
            'ST': 'ST', 'ATA': 'ST',
            'CF': 'CF', 'SA': 'CF',
          };
          return TO_CANONICAL[clean] || clean;
        };
        const COMPAT_GROUPS: Record<string, string[]> = {
          'GK': ['GK'],
          'CB': ['CB'],
          'LB': ['LB', 'LWB'], 'RB': ['RB', 'RWB'],
          'LWB': ['LWB', 'LB'], 'RWB': ['RWB', 'RB'],
          'CDM': ['CDM', 'CM'],
          'CM': ['CM', 'CDM', 'CAM'],
          'CAM': ['CAM', 'CM'],
          'LM': ['LM', 'LW'], 'RM': ['RM', 'RW'],
          'LW': ['LW', 'LM'], 'RW': ['RW', 'RM'],
          'ST': ['ST', 'CF'],
          'CF': ['CF', 'ST'],
        };
        const posCompatible = (slotPos: string, formPos: string): boolean => {
          const canon = normalizePosition(slotPos);
          const formCanon = normalizePosition(formPos);
          if (canon === formCanon) return true;
          const allowed = COMPAT_GROUPS[canon];
          return allowed ? allowed.includes(formCanon) : false;
        };

        // First pass: match players to formation positions by slot_position
        const assignedPlayerIds = new Set<string>();
        for (const p of parts) {
          const playerPos = (p.lineup_slot_id && slotPosMap.get(p.lineup_slot_id))
            || (p.player_profile_id && profilePosMap.get(p.player_profile_id))
            || '';

          // Find best matching formation position
          let bestIdx = -1;
          for (let i = 0; i < positions.length; i++) {
            if (usedPositionIndices.has(i)) continue;
            if (posCompatible(playerPos, positions[i].pos)) {
              bestIdx = i;
              break;
            }
          }

          if (bestIdx >= 0) {
            usedPositionIndices.add(bestIdx);
            assignedPlayerIds.add(p.id);
            updates.push(
              supabase.from('match_participants').update({ pos_x: positions[bestIdx].x, pos_y: positions[bestIdx].y }).eq('id', p.id)
            );
          }
        }

        // Second pass: assign remaining players to unused positions
        for (const p of parts) {
          if (assignedPlayerIds.has(p.id)) continue;

          // Find first unused position
          for (let i = 0; i < positions.length; i++) {
            if (!usedPositionIndices.has(i)) {
              usedPositionIndices.add(i);
              assignedPlayerIds.add(p.id);
              updates.push(
                supabase.from('match_participants').update({ pos_x: positions[i].x, pos_y: positions[i].y }).eq('id', p.id)
              );
              break;
            }
          }
        }

        if (updates.length > 0) await Promise.all(updates);
      };

      await Promise.all([
        positionExistingPlayers(homeParts, homeFormation, true),
        positionExistingPlayers(awayParts, awayFormation, false),
      ]);
      console.log(`[ENGINE] Positioned existing players: home=${homeParts.length} away=${awayParts.length}`);
    }

    // ── Ensure each team has a GK (including test matches / 3x3) ──
    await ensureGoalkeeperPerTeam(supabase, m.id, m.home_club_id, m.away_club_id);


    const ballHolderParticipantId = await pickCenterKickoffPlayer(supabase, m.id, possessionClubId);

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
      set_piece_type: 'kickoff',
    });

    await supabase.from('match_event_logs').insert({
      match_id: m.id,
      event_type: 'kickoff',
      title: 'Partida iniciada!',
      body: 'Time da casa comeca com a bola no meio-campo.',
    });

    // ── Pre-load engine cache: static data that doesn't change during the match ──
    try {
      const { data: allMatchParts } = await supabase
        .from('match_participants')
        .select('id, player_profile_id, club_id')
        .eq('match_id', m.id).eq('role_type', 'player');

      const profileIds = (allMatchParts || []).filter((p: any) => p.player_profile_id).map((p: any) => p.player_profile_id);

      // Initialize match energy from player_profiles.energy_current/energy_max
      if (profileIds.length > 0) {
        const { data: energyProfiles } = await supabase
          .from('player_profiles')
          .select('id, energy_current, energy_max')
          .in('id', profileIds);
        if (energyProfiles && energyProfiles.length > 0) {
          const energyMap = new Map(energyProfiles.map((p: any) => [p.id, p]));
          const energyUpdates: Promise<any>[] = [];
          for (const part of (allMatchParts || [])) {
            if (!part.player_profile_id) continue;
            const profile = energyMap.get(part.player_profile_id) as any;
            const energyPct = profile
              ? Math.round((Number(profile.energy_current ?? 100) / Math.max(1, Number(profile.energy_max ?? 100))) * 100)
              : 100;
            energyUpdates.push(
              supabase.from('match_participants').update({ match_energy: energyPct }).eq('id', part.id)
            );
          }
          if (energyUpdates.length > 0) await Promise.all(energyUpdates);
          console.log(`[ENGINE] Initialized match energy for ${energyUpdates.length} players`);
        }
      }

      const roleFields = 'captain_player_id, free_kick_taker_id, corner_right_taker_id, corner_left_taker_id, throw_in_right_taker_id, throw_in_left_taker_id';
      const [attrRes, homeSettingsRes, awaySettingsRes, homeLineupFormRes, awayLineupFormRes, homeCoachRes, awayCoachRes] = await Promise.all([
        profileIds.length > 0
          ? supabase.from('player_attributes').select('*').in('player_profile_id', profileIds)
          : Promise.resolve({ data: [] }),
        supabase.from('club_settings').select('default_formation, play_style').eq('club_id', m.home_club_id).maybeSingle(),
        supabase.from('club_settings').select('default_formation, play_style').eq('club_id', m.away_club_id).maybeSingle(),
        // Read formation from lineup (where the user actually sets it)
        m.home_lineup_id
          ? supabase.from('lineups').select(`${roleFields}, formation`).eq('id', m.home_lineup_id).maybeSingle()
          : supabase.from('lineups').select(`${roleFields}, formation`).eq('club_id', m.home_club_id).eq('is_active', true).maybeSingle(),
        m.away_lineup_id
          ? supabase.from('lineups').select(`${roleFields}, formation`).eq('id', m.away_lineup_id).maybeSingle()
          : supabase.from('lineups').select(`${roleFields}, formation`).eq('club_id', m.away_club_id).eq('is_active', true).maybeSingle(),
        supabase.rpc('get_coach_bonuses', { p_club_id: m.home_club_id }).then((r: any) => r).catch(() => ({ data: [] })),
        supabase.rpc('get_coach_bonuses', { p_club_id: m.away_club_id }).then((r: any) => r).catch(() => ({ data: [] })),
      ]);

      // Formation priority: lineup.formation > club_settings.default_formation > '4-4-2'
      const homeForm = homeLineupFormRes.data?.formation || homeSettingsRes.data?.default_formation || '4-4-2';
      const awayForm = awayLineupFormRes.data?.formation || awaySettingsRes.data?.default_formation || '4-4-2';

      const engineCache = {
        attrByProfile: Object.fromEntries((attrRes.data || []).map((r: any) => [r.player_profile_id, r])),
        clubSettings: {
          homeFormation: homeForm,
          awayFormation: awayForm,
          homePlayStyle: homeSettingsRes.data?.play_style || 'balanced',
          awayPlayStyle: awaySettingsRes.data?.play_style || 'balanced',
        },
        lineupRoles: {
          home: homeLineupFormRes.data || null,
          away: awayLineupFormRes.data || null,
        },
        coachBonuses: {
          home: homeCoachRes.data || [],
          away: awayCoachRes.data || [],
        },
      };

      await supabase.from('matches').update({ engine_cache: engineCache }).eq('id', m.id);
      console.log(`[ENGINE] Pre-loaded engine cache: ${profileIds.length} attrs, 2 settings, 2 coach bonuses`);
    } catch (e) {
      console.error(`[ENGINE] Failed to pre-load engine cache:`, e);
    }

    started.push(m.id);
  }

  return started;
}

async function processDueMatches(supabase: any, functionUrl: string, matchId?: string | null) {
  const started = matchId ? [] : await autoStartDueMatches(supabase, matchId);
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
      const result = await executeTickForMatch(supabase, String(dueMatchId), false);
      if (result?.status === 'busy') {
        busy += 1;
        continue;
      }
      if (result?.status === 'waiting') {
        continue;
      }
      advanced += 1;
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

async function executeTickForMatch(supabase: any, match_id: string, forceTick: boolean): Promise<any> {
  const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).eq('status', 'live').single();
  if (!match) return { error: 'Match not found or not live', httpStatus: 404 };

  let { data: activeTurn } = await supabase.from('match_turns').select('*').eq('match_id', match_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
  if (!activeTurn) return { error: 'No active turn', httpStatus: 400 };

  const now = new Date();
  const endsAt = new Date(activeTurn.ends_at);
  if (!forceTick && now < endsAt) return { status: 'waiting', remaining_ms: endsAt.getTime() - now.getTime() };

  // ── Concurrency lock: only one request processes a turn at a time ──
  const processingToken = crypto.randomUUID();
  const { data: claimedTurns } = await supabase.rpc('claim_match_turn_for_processing', {
    p_match_id: match_id,
    p_processing_token: processingToken,
    p_now: new Date().toISOString(),
    p_stale_after: '15 seconds',
  });
  if (!claimedTurns || claimedTurns.length === 0) {
    return { status: 'busy' };
  }
  // Use the claimed turn data (most up-to-date)
  activeTurn = claimedTurns[0];

  try {

  // ── Tick-level cache: hydrate from engine_cache if available ──
  const tickCache: TickCache = {};
  if (match.engine_cache && typeof match.engine_cache === 'object') {
    const ec = match.engine_cache as any;
    if (ec.attrByProfile) tickCache.attrByProfile = ec.attrByProfile;
    if (ec.clubSettings) tickCache.clubSettings = ec.clubSettings;
    if (ec.lineupRoles) tickCache.lineupRoles = ec.lineupRoles;
    if (ec.coachBonuses) tickCache.coachBonuses = ec.coachBonuses;
  }

  // ── Compute loose ball position if ball is loose (parallel with next phase queries) ──
  let looseBallPos: { x: number; y: number } | null = null;
  const isLooseBallTurn = !activeTurn.ball_holder_participant_id;
  // Fire loose ball query early (will be awaited later)
  const looseBallEventsPromise = isLooseBallTurn
    ? supabase.from('match_event_logs')
        .select('event_type, payload, body')
        .eq('match_id', match_id)
        .in('event_type', ['loose_ball', 'block', 'shot_missed', 'blocked', 'loose_ball_phase', 'ball_inertia', 'ball_stopped', 'loose_ball_recovered', 'possession_change'])
        .order('created_at', { ascending: false })
        .limit(1)
    : null;

  // Helper to resolve loose ball position (called when needed)
  const resolveLooseBallPos = async () => {
    if (!isLooseBallTurn) return;
    const { data: lastEvents } = await looseBallEventsPromise!;
    if (lastEvents && lastEvents.length > 0) {
      const evt = lastEvents[0];
      const payload = evt.payload as any;
      if (payload?.x != null && payload?.y != null) {
        looseBallPos = { x: Number(payload.x), y: Number(payload.y) };
      } else if (payload?.ball_x != null && payload?.ball_y != null) {
        looseBallPos = { x: Number(payload.ball_x), y: Number(payload.ball_y) };
      } else if (evt.body) {
        const coordMatch = evt.body.match(/\((\d+),\s*(\d+)\)/);
        if (coordMatch) {
          looseBallPos = { x: Number(coordMatch[1]), y: Number(coordMatch[2]) };
        }
      }
    }
    if (!looseBallPos) {
      const { data: prevActions } = await supabase
        .from('match_actions')
        .select('target_x, target_y, action_type')
        .eq('match_id', match_id)
        .eq('status', 'used')
        .in('action_type', ['pass_low', 'pass_high', 'pass_launch', 'shoot_controlled', 'shoot_power'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (prevActions?.[0]?.target_x != null) {
        looseBallPos = { x: Number(prevActions[0].target_x), y: Number(prevActions[0].target_y) };
      }
    }
    if (looseBallPos) console.log(`[ENGINE] Loose ball position: (${looseBallPos.x.toFixed(1)}, ${looseBallPos.y.toFixed(1)})`);
  };

  // ── POSITIONING PHASES ──
  if (isPositioningPhase(activeTurn.phase)) {
    // Load participants, actions, and loose ball position in parallel
    const [participantsResult, actionsResult] = await Promise.all([
      tickCache.enrichedParticipants
        ? supabase.from('match_participants').select('id, pos_x, pos_y, is_sent_off').eq('match_id', match_id).eq('role_type', 'player')
        : supabase.from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player'),
      supabase.from('match_actions').select('*').eq('match_turn_id', activeTurn.id).eq('status', 'pending').order('created_at', { ascending: false }),
    ]);
    await resolveLooseBallPos();
    let participants: any[];
    if (tickCache.enrichedParticipants) {
      const posMap = new Map((participantsResult.data || []).map((p: any) => [p.id, p]));
      participants = tickCache.enrichedParticipants.map((p: any) => {
        const fresh: any = posMap.get(p.id);
        return fresh ? { ...p, pos_x: fresh.pos_x, pos_y: fresh.pos_y, is_sent_off: fresh.is_sent_off } : p;
      });
    } else {
      participants = await enrichParticipantsWithSlotPosition(supabase, participantsResult.data || []);
      tickCache.enrichedParticipants = participants;
    }
    const rawActions = actionsResult.data;

    const possClubId = activeTurn.possession_club_id;
    const isAttackPhase = activeTurn.phase === 'positioning_attack';

    // Dedup: keep highest-priority action per participant (human > bot)
    const priorityByCtrl: Record<string, number> = { player: 3, manager: 2, bot: 1 };
    const sortedMoveRaw = [...(rawActions || [])].filter(a => a.action_type === 'move').sort((a, b) => {
      const pa = priorityByCtrl[a.controlled_by_type] ?? 0;
      const pb = priorityByCtrl[b.controlled_by_type] ?? 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    const seen = new Set<string>();
    const moveActions = sortedMoveRaw.filter(a => {
      if (seen.has(a.participant_id)) return false;
      seen.add(a.participant_id);
      return true;
    });

    // Determine if this is a kickoff (ball holder at center)
    const bhId = activeTurn.ball_holder_participant_id;
    const submittedParticipantIds = new Set<string>((rawActions || []).map((a: any) => a.participant_id));
    await generateBotActions(
      supabase,
      match_id,
      activeTurn.id,
      participants || [],
      submittedParticipantIds,
      bhId,
      possClubId,
      !bhId,
      activeTurn.phase,
      match,
      tickCache,
      activeTurn.set_piece_type,
      looseBallPos,
    );

    const bh = bhId ? (participants || []).find((p: any) => p.id === bhId) : null;
    const isKickoff = bh && Math.abs(Number(bh.pos_x ?? 50) - 50) < 5 && Math.abs(Number(bh.pos_y ?? 50) - 50) < 5;

    // Apply move actions (collected for batch RPC)
    const positioningBatch: Array<{id: string, x: number, y: number}> = [];
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

      // Kickoff constraints: half-field + center circle exclusion
      if (isKickoff) {
        const isHomeRaw = part.club_id === match.home_club_id;
        const isSecondHalfPos = (match.current_half ?? 1) >= 2;
        const isHome = isSecondHalfPos ? !isHomeRaw : isHomeRaw;
        if (isHome) targetX = Math.min(targetX, 49);
        else targetX = Math.max(targetX, 51);
        // Center circle exclusion for defending team
        const isDefending = part.club_id !== possClubId;
        if (isDefending) {
          const CENTER_CIRCLE_R = 10;
          const distToCenter = Math.sqrt((targetX - 50) ** 2 + (targetY - 50) ** 2);
          if (distToCenter < CENTER_CIRCLE_R) {
            const angle = Math.atan2(targetY - 50, targetX - 50);
            targetX = 50 + Math.cos(angle) * (CENTER_CIRCLE_R + 1);
            targetY = 50 + Math.sin(angle) * (CENTER_CIRCLE_R + 1);
            if (isHome) targetX = Math.min(targetX, 49);
            else targetX = Math.max(targetX, 51);
          }
        }
      }

      // Free kick / corner / throw-in: defending team must stay 10% away from ball
      const setPieceType = activeTurn.set_piece_type;
      if (setPieceType && setPieceType !== 'kickoff') {
        const isDefending = part.club_id !== possClubId;
        if (isDefending && bhId) {
          const bhPart = (participants || []).find((p: any) => p.id === bhId);
          const ballX = bhPart ? Number(bhPart.pos_x ?? 50) : 50;
          const ballY = bhPart ? Number(bhPart.pos_y ?? 50) : 50;
          const FREE_KICK_EXCLUSION_R = 10; // ~9.15m in real football
          const distToBall = Math.sqrt((targetX - ballX) ** 2 + (targetY - ballY) ** 2);
          if (distToBall < FREE_KICK_EXCLUSION_R) {
            // Push away from ball
            const angle = Math.atan2(targetY - ballY, targetX - ballX);
            targetX = ballX + Math.cos(angle) * (FREE_KICK_EXCLUSION_R + 1);
            targetY = ballY + Math.sin(angle) * (FREE_KICK_EXCLUSION_R + 1);
          }
        }
      }

      // Clamp to field
      targetX = Math.max(1, Math.min(99, targetX));
      targetY = Math.max(1, Math.min(99, targetY));

      positioningBatch.push({ id: part.id, x: targetX, y: targetY });
      console.log(`[ENGINE] Positioning move: ${part.id.slice(0,8)} → (${targetX.toFixed(1)},${targetY.toFixed(1)})`);
    }
    if (positioningBatch.length > 0) {
      await supabase.rpc('batch_update_participant_positions', { p_updates: positioningBatch });
    }

    // Batch: mark actions used + resolve turn + create next turn + log event (all in parallel)
    const actionIds = moveActions.map(a => a.id);
    const nextPhaseStart = new Date().toISOString();
    const nextPhase = isAttackPhase ? 'positioning_defense' : 'ball_holder';
    const nextPhaseEnd = new Date(Date.now() + (isAttackPhase ? POSITIONING_PHASE_DURATION_MS : PHASE_DURATION_MS)).toISOString();

    await Promise.all([
      actionIds.length > 0 ? supabase.from('match_actions').update({ status: 'used' }).in('id', actionIds) : Promise.resolve(),
      supabase.from('match_turns').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', activeTurn.id),
      supabase.from('matches').update({ current_phase: nextPhase }).eq('id', match_id),
      supabase.from('match_turns').insert({
        match_id, turn_number: activeTurn.turn_number,
        phase: nextPhase,
        possession_club_id: possClubId,
        ball_holder_participant_id: bhId,
        started_at: nextPhaseStart, ends_at: nextPhaseEnd,
        status: 'active',
        set_piece_type: activeTurn.set_piece_type ?? null,
      }),
      supabase.from('match_event_logs').insert({
        match_id, event_type: 'positioning',
        title: isAttackPhase ? '📍 Posicionamento — Ataque concluído' : '📍 Posicionamento concluído',
        body: isAttackPhase ? 'Agora a defesa posiciona seus jogadores.' : 'A partida continua!',
      }),
    ]);

    return { status: 'advanced' };
  }

  // Parallelize: load participants + turnRows + looseBallPos simultaneously
  const isResolution = activeTurn.phase === 'resolution';
  let participants: any[];

  if (tickCache.enrichedParticipants) {
    const [{ data: freshParts }, turnRowsRes] = await Promise.all([
      supabase.from('match_participants').select('id, pos_x, pos_y, is_sent_off').eq('match_id', match_id).eq('role_type', 'player') as Promise<{ data: any[] | null }>,
      isResolution
        ? supabase.from('match_turns').select('id, phase').eq('match_id', match_id).eq('turn_number', activeTurn.turn_number)
        : Promise.resolve({ data: null }),
    ]) as [{ data: any[] | null }, any];
    await resolveLooseBallPos();
    var turnRowsResult: any = turnRowsRes;
    const posMap = new Map((freshParts || []).map((p: any) => [p.id, p]));
    participants = tickCache.enrichedParticipants.map((p: any) => {
      const fresh = posMap.get(p.id);
      return fresh ? { ...p, pos_x: fresh.pos_x, pos_y: fresh.pos_y, is_sent_off: fresh.is_sent_off } : p;
    });
  } else {
    const [{ data: rawParticipants2 }, turnRowsRes] = await Promise.all([
      supabase.from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player'),
      isResolution
        ? supabase.from('match_turns').select('id, phase').eq('match_id', match_id).eq('turn_number', activeTurn.turn_number)
        : Promise.resolve({ data: null }),
    ]);
    await resolveLooseBallPos();
    var turnRowsResult: any = turnRowsRes;
    if (isResolution) {
      // Full enrichment only needed for resolution (slot positions, etc.)
      participants = await enrichParticipantsWithSlotPosition(supabase, rawParticipants2 || []);
      tickCache.enrichedParticipants = participants;
    } else {
      // Non-resolution phases: skip expensive enrichment, raw participants suffice for bot generation
      participants = rawParticipants2 || [];
      // Store raw participants in cache (will be replaced with enriched version at resolution)
      tickCache.enrichedParticipants = participants;
    }
  }

  const possClubId = activeTurn.possession_club_id;
  const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
  const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);

  // Load lineup tactical roles for set piece taker assignments (only needed for resolution)
  let lineupRolesCache: { home: LineupRoles | null; away: LineupRoles | null } | undefined;
  if (isResolution) {
    if (tickCache.lineupRoles) {
      lineupRolesCache = tickCache.lineupRoles;
    } else if (match.home_lineup_id || match.away_lineup_id) {
      const roleFields = 'captain_player_id, free_kick_taker_id, corner_right_taker_id, corner_left_taker_id, throw_in_right_taker_id, throw_in_left_taker_id';
      const [homeLineupRes, awayLineupRes] = await Promise.all([
        match.home_lineup_id ? supabase.from('lineups').select(roleFields).eq('id', match.home_lineup_id).maybeSingle() : Promise.resolve({ data: null }),
        match.away_lineup_id ? supabase.from('lineups').select(roleFields).eq('id', match.away_lineup_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      lineupRolesCache = { home: homeLineupRes.data || null, away: awayLineupRes.data || null };
      tickCache.lineupRoles = lineupRolesCache;
    }
  }

  // Coach bonus helper for resolveAction (reads from tickCache)
  const getCoachBonus = (clubId: string, skillType: string): number => {
    const bonuses = clubId === match.home_club_id ? (tickCache.coachBonuses?.home || []) : (tickCache.coachBonuses?.away || []);
    const b = bonuses.find((x: any) => x.skill_type === skillType);
    return b?.bonus_value ?? 0;
  };

  const ballHolder = activeTurn.ball_holder_participant_id
    ? (participants || []).find(p => p.id === activeTurn.ball_holder_participant_id)
    : null;

  // Safety: if ball holder was sent off, trigger loose ball
  if (ballHolder && ballHolder.is_sent_off) {
    const looseX = Number(ballHolder.pos_x ?? 50);
    const looseY = Number(ballHolder.pos_y ?? 50);
    await supabase.from('match_turns').update({ ball_holder_participant_id: null, ball_x: looseX, ball_y: looseY }).eq('id', activeTurn.id);
    activeTurn.ball_holder_participant_id = null;
    console.log(`[ENGINE] Ball holder ${ballHolder.id} was sent off — loose ball at (${looseX}, ${looseY})`);
  }

  const isLooseBall = !activeTurn.ball_holder_participant_id;

  // Pre-load actions for this turn (used by both bot generation and early deviation)
  let nonResolutionActions: any[] | null = null;
  if (!isResolution) {
    const { data: nrActions } = await supabase.from('match_actions').select('*').eq('match_turn_id', activeTurn.id).eq('status', 'pending');
    nonResolutionActions = nrActions || [];
    const submittedParticipantIds = new Set<string>((nonResolutionActions || []).map((a: any) => a.participant_id));
    await generateBotActions(
      supabase,
      match_id,
      activeTurn.id,
      participants || [],
      submittedParticipantIds,
      activeTurn.ball_holder_participant_id,
      possClubId,
      isLooseBall,
      activeTurn.phase,
      match,
      tickCache,
      activeTurn.set_piece_type,
      looseBallPos,
    );
    // Refresh actions after bot generation to include newly created bot actions (needed for early deviation)
    if (activeTurn.phase === 'ball_holder') {
      const { data: refreshedActions } = await supabase.from('match_actions').select('*').eq('match_turn_id', activeTurn.id).eq('status', 'pending');
      nonResolutionActions = refreshedActions || [];
    }
  }

  // ── RESOLUTION ──
  let newPossessionClubId = possClubId;
  let homeScore = match.home_score;
  let awayScore = match.away_score;
  let nextBallHolderParticipantId = ballHolder?.id || null;
  let ballEndPos: { x: number; y: number } | null = null;
  const lastTouchClubId = possClubId;
  let nextSetPieceType: string | null = null;
  const eventsToLog: any[] = [];
  const deferredPositionUpdates: Array<{id: string, pos_x: number, pos_y: number}> = [];

  if (isResolution) {
    console.log(`[ENGINE] Resolution phase: turn=${match.current_turn_number} ballHolder=${activeTurn.ball_holder_participant_id?.slice(0,8) ?? 'NONE'} possession=${possClubId?.slice(0,8) ?? 'NONE'}`);
    const turnRows = turnRowsResult?.data;

    const allTurnIds = (turnRows || []).map((t: any) => t.id);

    // ── Bot AI fallback: generate actions for inactive players ──
    {
      const { data: existingActions } = await supabase
        .from('match_actions').select('participant_id, match_turn_id').in('match_turn_id', allTurnIds).eq('status', 'pending');
      const submittedIds = new Set<string>((existingActions || []).map((a: any) => a.participant_id));
      const turnPhaseMap = new Map((turnRows || []).map((t: any) => [t.id, t.phase]));

      // Generate bot actions for each phase that had a turn — skip if all bots already have actions
      for (const turnRow of (turnRows || [])) {
        const existingActionsForTurn = (existingActions || []).filter(
          (a: any) => a.match_turn_id === turnRow.id
        );
        const participantsWithActions = new Set(existingActionsForTurn.map((a: any) => a.participant_id));

        // Only generate for bots that don't have actions yet
        const botsNeedingActions = (participants || []).filter((p: any) => {
          if (p.role_type !== 'player') return false;
          if (participantsWithActions.has(p.id)) return false;
          return true;
        });

        if (botsNeedingActions.length > 0) {
          await generateBotActions(
            supabase, match_id, turnRow.id, participants || [],
            submittedIds, activeTurn.ball_holder_participant_id,
            possClubId, isLooseBall, turnRow.phase, match,
            tickCache, activeTurn.set_piece_type, looseBallPos,
          );
        }
      }
    }

    // Load actions + player attributes in parallel
    const profileIds = (participants || []).filter(p => p.player_profile_id).map(p => p.player_profile_id);
    const [{ data: rawActions }, attrLoadResult] = await Promise.all([
      supabase.from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending')
        .order('created_at', { ascending: false }),
      (!tickCache.attrByProfile && profileIds.length > 0)
        ? supabase.from('player_attributes').select('*').in('player_profile_id', profileIds)
        : Promise.resolve({ data: null }),
    ]);
    // Pre-fill attr cache from parallel load
    if (!tickCache.attrByProfile && attrLoadResult?.data) {
      const attrMap: Record<string, any> = {};
      for (const row of attrLoadResult.data) attrMap[row.player_profile_id] = row;
      tickCache.attrByProfile = attrMap;
    }

    // Dedup: keep latest action per participant, BUT allow ball holder to have
    // BOTH a pass/shoot (from phase 1) AND a move (from phase 2)
    // CRITICAL: human actions (player/manager) ALWAYS override ALL bot actions for that participant
    const priorityByController: Record<string, number> = { player: 3, manager: 2, bot: 1 };

    // Step 1: Find all participants that have at least one human action
    const humanControlledParticipants = new Set<string>();
    for (const a of (rawActions || [])) {
      if (a.controlled_by_type === 'player' || a.controlled_by_type === 'manager') {
        humanControlledParticipants.add(a.participant_id);
      }
    }

    // Step 2: Filter out ALL bot actions for participants that have human actions
    const filteredRaw = (rawActions || []).filter((a: any) => {
      if (a.controlled_by_type === 'bot' && humanControlledParticipants.has(a.participant_id)) {
        return false; // Human controls this participant — discard bot action entirely
      }
      return true;
    });

    // Step 3: Sort remaining by priority (human first), then by created_at desc
    const sortedRaw = [...filteredRaw].sort((a, b) => {
      const pa = priorityByController[a.controlled_by_type] ?? 0;
      const pb = priorityByController[b.controlled_by_type] ?? 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    // Step 4: Dedup — BH can have ball action + move; others get one action
    const seenParticipants = new Map<string, { types: string[]; actions: any[] }>();
    const allActions: any[] = [];

    for (const a of sortedRaw) {
      const existing = seenParticipants.get(a.participant_id);
      const isBH = a.participant_id === activeTurn.ball_holder_participant_id;
      if (isBH) {
        const isBallAction = isBallActionType(a.action_type);
        const isMoveAction = a.action_type === 'move';
        if (existing) {
          const hasBallAction = existing.types.some(t => isBallActionType(t));
          const hasMoveAction = existing.types.some(t => t === 'move');
          if (isBallAction && hasBallAction) continue;
          if (isMoveAction && hasMoveAction) continue;
          if (!isBallAction && !isMoveAction) continue;
          existing.types.push(a.action_type);
          existing.actions.push(a);
          allActions.push(a);
          continue;
        }
        seenParticipants.set(a.participant_id, { types: [a.action_type], actions: [a] });
        allActions.push(a);
      } else {
        if (existing) continue;
        seenParticipants.set(a.participant_id, { types: [a.action_type], actions: [a] });
        allActions.push(a);
      }
    }

    // ── Load player attributes for physics (use cache if available) ──
    let attrByProfile: Record<string, any> = {};
    if (tickCache.attrByProfile) {
      attrByProfile = tickCache.attrByProfile;
    } else {
      const profileIds = (participants || []).filter(p => p.player_profile_id).map(p => p.player_profile_id);
      const { data: attrRows } = profileIds.length > 0
        ? await supabase.from('player_attributes').select('*').in('player_profile_id', profileIds)
        : { data: [] };
      for (const row of (attrRows || [])) {
        attrByProfile[row.player_profile_id] = row;
      }
      tickCache.attrByProfile = attrByProfile;
    }
    const getAttrs = (participant: any) => {
      const raw = participant?.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
      const energyPct = Number(participant?.match_energy ?? 100);
      const penalty = getEnergyPenalty(energyPct);
      const apply = (val: number) => Math.max(10, Math.round(val * (1 - penalty)));
      return {
        aceleracao: apply(Number(raw?.aceleracao ?? 40)),
        agilidade: apply(Number(raw?.agilidade ?? 40)),
        velocidade: apply(Number(raw?.velocidade ?? 40)),
        forca: apply(Number(raw?.forca ?? 40)),
        stamina: Number(raw?.stamina ?? 40), // stamina NOT penalized (controls drain rate)
        passe_baixo: apply(Number(raw?.passe_baixo ?? 40)),
        passe_alto: apply(Number(raw?.passe_alto ?? 40)),
        forca_chute: apply(Number(raw?.forca_chute ?? 40)),
        acuracia_chute: apply(Number(raw?.acuracia_chute ?? 40)),
        controle_bola: apply(Number(raw?.controle_bola ?? 40)),
        um_toque: apply(Number(raw?.um_toque ?? 40)),
        cabeceio: apply(Number(raw?.cabeceio ?? 40)),
      };
    };

    // ── Apply accuracy deviation to ball actions before resolution ──
    if (ballHolder) {
      const bhAction = allActions.find(a => a.participant_id === ballHolder.id);
      if (bhAction && isBallActionType(bhAction.action_type) && bhAction.target_x != null && bhAction.target_y != null) {
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
            eventsToLog.push({
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
      a.participant_id === ballHolder.id && isBallActionType(a.action_type));

    console.log(`[ENGINE] Processing ${allActions.length} actions (from ${(rawActions || []).length} raw) bhHasBallAction=${bhHasBallAction}`);
    const resolutionMoveBatch: Array<{id: string, x: number, y: number}> = [];
    for (const a of allActions) {
      console.log(`[ENGINE] Action: ${a.participant_id.slice(0,8)} ${a.action_type} → (${Number(a.target_x ?? 0).toFixed(1)},${Number(a.target_y ?? 0).toFixed(1)}) target_part=${a.target_participant_id?.slice(0,8) ?? 'none'}`);
      if ((a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null) {
        // Skip ball holder's move if they have a ball action — defer it after ball resolution
        if (a.participant_id === ballHolder?.id && a.action_type === 'move' && bhHasBallAction) {
          console.log(`[ENGINE] Deferring BH move until after ball resolution`);
          continue;
        }
        const part = (participants || []).find(p => p.id === a.participant_id);
        const startX = Number(part?.pos_x ?? 50);
        const startY = Number(part?.pos_y ?? 50);
        let finalX = Number(a.target_x);
        let finalY = Number(a.target_y);

        // ── Apply physics movement limits ──
        const attrs = getAttrs(part);
        let maxRange = computeMaxMoveRange(attrs, match.current_turn_number ?? 1);
        // Ball holder conducting (move only, no pass/shoot) gets 15% penalty
        if (a.participant_id === ballHolder?.id && a.action_type === 'move' && !bhHasBallAction) {
          maxRange *= 0.85;
        }
        // One-touch turn: movement scaled by ball speed (faster ball = less reaction time)
        const oneTouchAction = allActions.find((act: any) => act.payload && typeof act.payload === 'object' && (act.payload as any).one_touch_executed);
        if (oneTouchAction) {
          const originType = (oneTouchAction.payload as any).origin_action_type || 'pass_low';
          const otSpeedFactor =
            (originType === 'shoot_power' || originType === 'header_power') ? 0.25 :
            (originType === 'shoot_controlled' || originType === 'header_controlled') ? 0.35 :
            originType === 'pass_launch' ? 0.5 :
            (originType === 'pass_high' || originType === 'header_high') ? 0.65 :
            1.0; // pass_low / header_low / move
          // Scale: ballSpeedFactor 1.0 → 50% range, 0.25 → 12.5% range
          maxRange *= otSpeedFactor * 0.5;
        }
        const dx = finalX - startX;
        const dy = finalY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRange) {
          const scale = maxRange / dist;
          finalX = startX + dx * scale;
          finalY = startY + dy * scale;
        }

        console.log(`[ENGINE] Player ${a.participant_id.slice(0,8)} ${a.action_type}: (${startX.toFixed(1)},${startY.toFixed(1)}) → (${finalX.toFixed(1)},${finalY.toFixed(1)}) dist=${dist.toFixed(1)} maxRange=${maxRange.toFixed(1)} | vel=${attrs.velocidade} accel=${attrs.aceleracao} agil=${attrs.agilidade} stam=${attrs.stamina} forca=${attrs.forca}`);

        resolutionMoveBatch.push({ id: a.participant_id, x: finalX, y: finalY });
      }
    }
    if (resolutionMoveBatch.length > 0) {
      await supabase.rpc('batch_update_participant_positions', { p_updates: resolutionMoveBatch });
    }

    if (ballHolder) {
      // Find the ball holder's BALL action (pass/shoot preferred, fallback to move)
      const ballHolderAction = allActions
        .find(a => a.participant_id === ballHolder.id && isBallActionType(a.action_type))
        || allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');

      if (ballHolderAction) {
        const result = resolveAction(ballHolderAction.action_type, ballHolderAction, null, allActions, participants || [], possClubId || '', attrByProfile, undefined, match.current_turn_number ?? 1, eventsToLog, getCoachBonus, activeTurn.set_piece_type);

        // Log GK save attempt if there was one
        if (result.gkSaveAttempt) {
          const gka = result.gkSaveAttempt;
          if (gka.saved) {
            eventsToLog.push({
              match_id, event_type: 'gk_save',
              title: `🧤 Goleiro defendeu! (${gka.chance})`,
              body: `Goleiro fez a defesa com ${gka.chance} de chance.`,
              payload: { gk_participant_id: gka.gkParticipantId, gk_club_id: gka.gkClubId, save_chance: gka.chance, result: 'saved' },
            });
          } else {
            eventsToLog.push({
              match_id, event_type: 'gk_save_failed',
              title: `🧤 Goleiro tentou defender (${gka.chance}) — não conseguiu!`,
              body: `Goleiro tentou a defesa com ${gka.chance} de chance, mas a bola passou.`,
              payload: { gk_participant_id: gka.gkParticipantId, gk_club_id: gka.gkClubId, save_chance: gka.chance, result: 'failed' },
            });
          }
        }

        if (result.goal) {
          // Check if the shot is actually on target
          const isOverGoal = ballHolderAction.payload && typeof ballHolderAction.payload === 'object' && (ballHolderAction.payload as any).over_goal;
          const shotTargetY = Number(ballHolderAction.target_y ?? 50);
          const isOnTarget = shotTargetY >= 38 && shotTargetY <= 62 && !isOverGoal;

          if (isOnTarget) {
            if (possClubId === match.home_club_id) homeScore++;
            else awayScore++;

            eventsToLog.push({
              match_id, event_type: 'goal',
              title: `⚽ GOL! ${homeScore} – ${awayScore}`,
              body: `Turno ${match.current_turn_number}`,
              payload: {
                scorer_participant_id: ballHolder.id,
                scorer_club_id: possClubId,
                assister_participant_id: null,
                goal_type: 'shot',
              },
            });

            newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
            nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
            nextSetPieceType = 'kickoff';
          } else {
            // Shot missed — ball goes out of bounds
            nextBallHolderParticipantId = null;
            ballEndPos = { x: Number(ballHolderAction.target_x ?? 50), y: shotTargetY };
            eventsToLog.push({
              match_id, event_type: 'shot_missed',
              title: isOverGoal ? '💨 Chute por cima do gol!' : '💨 Chute para fora!',
              body: isOverGoal ? 'A bola foi por cima do gol.' : 'A bola saiu pela linha de fundo.',
              payload: {
                shooter_participant_id: ballHolder.id,
              },
            });
            console.log(`[ENGINE] Shot missed: overGoal=${isOverGoal} targetY=${shotTargetY} (goal range: 38-62)`);
          }
        } else if (result.looseBallPos) {
          // Shot/pass blocked — ball deflects to random position
          nextBallHolderParticipantId = null;
          eventsToLog.push({
            match_id, event_type: result.event || 'blocked',
            title: result.description,
            body: `Bola espirrou para (${result.looseBallPos.x.toFixed(0)},${result.looseBallPos.y.toFixed(0)})`,
          });
        } else if (result.newBallHolderId) {
          nextBallHolderParticipantId = result.newBallHolderId;
          newPossessionClubId = result.newPossessionClubId || possClubId;

          // Skip duplicate event for GK save (already logged above as gk_save)
          if (!result.gkSaveAttempt?.saved) {
            const resolvedEventType = result.possession_change ? 'possession_change' : (result.event === 'tackle' ? 'tackle' : 'pass_complete');
            const resolvedPayload: Record<string, any> = {};
            if (resolvedEventType === 'tackle') {
              resolvedPayload.tackler_participant_id = result.newBallHolderId;
              resolvedPayload.tackled_participant_id = ballHolder.id;
            }
            eventsToLog.push({
              match_id, event_type: resolvedEventType,
              title: result.possession_change ? `🔄 Troca de posse` : result.description,
              body: result.description,
              ...(Object.keys(resolvedPayload).length > 0 ? { payload: resolvedPayload } : {}),
            });
          }
        } else if (result.foul && result.foulPosition) {
          // Check if foul is inside penalty area
          const foulX = result.foulPosition.x;
          const foulY = result.foulPosition.y;
          const isHomeAttacking = possClubId === match.home_club_id;
          const inPenaltyArea = isHomeAttacking
            ? (foulX >= 82 && foulY >= 20 && foulY <= 80)
            : (foulX <= 18 && foulY >= 20 && foulY <= 80);

          if (inPenaltyArea) {
            // PENALTY!
            const penaltyX = isHomeAttacking ? 88 : 12;
            const penaltyY = 50;
            nextBallHolderParticipantId = ballHolder.id;
            deferredPositionUpdates.push({ id: ballHolder.id, pos_x: penaltyX, pos_y: penaltyY });
            eventsToLog.push({
              match_id, event_type: 'penalty', title: '🟥 PÊNALTI!', body: 'Falta dentro da área! Pênalti marcado.',
              payload: {
                fouler_participant_id: result.failedContestParticipantId,
                fouled_participant_id: ballHolder.id,
              },
            });
            nextSetPieceType = 'penalty';
            ballEndPos = { x: penaltyX, y: penaltyY };
          } else {
            // Check for designated free kick taker
            const fkRoles = lineupRolesCache ? (possClubId === match.home_club_id ? lineupRolesCache.home : lineupRolesCache.away) : null;
            const fkTaker = fkRoles ? findParticipantByProfileId(participants || [], fkRoles.free_kick_taker_id) : null;
            const freeKickTakerId = fkTaker ? fkTaker.id : ballHolder.id;
            nextBallHolderParticipantId = freeKickTakerId;
            deferredPositionUpdates.push({ id: freeKickTakerId, pos_x: foulX, pos_y: foulY });
            eventsToLog.push({
              match_id, event_type: 'foul', title: result.description, body: 'Falta cometida! Tiro livre para o time atacante.',
              payload: {
                fouler_participant_id: result.failedContestParticipantId,
                fouled_participant_id: ballHolder.id,
              },
            });
            nextSetPieceType = 'free_kick';
            ballEndPos = { x: foulX, y: foulY };

            // Push defending players out of the exclusion zone (10 units from ball)
            const FREE_KICK_EXCLUSION = 10;
            const defClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
            for (const p of (participants || [])) {
              if (p.club_id !== defClubId || p.role_type !== 'player' || p.is_sent_off) continue;
              if (p.id === result.failedContestParticipantId) continue; // fouler handled separately
              const px = Number(p.pos_x ?? 50);
              const py = Number(p.pos_y ?? 50);
              const distToFoul = Math.sqrt((px - foulX) ** 2 + (py - foulY) ** 2);
              if (distToFoul < FREE_KICK_EXCLUSION) {
                const angle = Math.atan2(py - foulY, px - foulX);
                const newX = Math.max(1, Math.min(99, foulX + Math.cos(angle) * (FREE_KICK_EXCLUSION + 1)));
                const newY = Math.max(1, Math.min(99, foulY + Math.sin(angle) * (FREE_KICK_EXCLUSION + 1)));
                deferredPositionUpdates.push({ id: p.id, pos_x: newX, pos_y: newY });
              }
            }
          }
          if (result.failedContestLog) {
            eventsToLog.push({
              match_id, event_type: 'foul_detail', title: result.failedContestLog, body: 'O defensor cometeu falta.',
            });
          }
          // ── Yellow / Red card processing ──
          if (result.card === 'yellow' && result.failedContestParticipantId) {
            const foulerParticipant = participants?.find((p: any) => p.id === result.failedContestParticipantId);
            let foulerName = 'Jogador';
            if (foulerParticipant?.player_profile_id) {
              const { data: profileData } = await supabase.from('player_profiles').select('display_name').eq('id', foulerParticipant.player_profile_id).single();
              if (profileData?.display_name) foulerName = profileData.display_name;
            }
            // Increment yellow cards
            const prevYellows = Number(foulerParticipant?.yellow_cards ?? 0);
            const newYellows = prevYellows + 1;
            const updateData: Record<string, any> = { yellow_cards: newYellows };
            if (newYellows >= 2) {
              updateData.is_sent_off = true;
            }
            await supabase.from('match_participants').update(updateData).eq('id', result.failedContestParticipantId);
            // Update local participant cache
            if (foulerParticipant) {
              foulerParticipant.yellow_cards = newYellows;
              if (newYellows >= 2) foulerParticipant.is_sent_off = true;
            }
            eventsToLog.push({
              match_id, event_type: 'yellow_card',
              title: '🟨 Cartão Amarelo!',
              body: `${foulerName} recebeu cartão amarelo.`,
              payload: { player_participant_id: result.failedContestParticipantId, player_name: foulerName },
            });
            if (newYellows >= 2) {
              eventsToLog.push({
                match_id, event_type: 'red_card',
                title: '🟥 Cartão Vermelho! Segundo amarelo!',
                body: `${foulerName} recebeu o segundo amarelo e foi expulso!`,
                payload: { player_participant_id: result.failedContestParticipantId, player_name: foulerName },
              });
            }
          }
        } else if (result.event === 'dribble') {
          // Tackle failed, dribble succeeded
          nextBallHolderParticipantId = ballHolder.id;
          eventsToLog.push({
            match_id, event_type: 'dribble',
            title: result.description,
            body: 'O desarme falhou e o jogador seguiu com a bola.',
          });
          // Log the failed contest too
          if (result.failedContestLog) {
            eventsToLog.push({
              match_id, event_type: 'tackle_failed',
              title: result.failedContestLog,
              body: 'O defensor perdeu o equilíbrio e terá penalidade de velocidade.',
            });
          }
          // Apply movement penalty to failed tackler: reduce their effective movement by 25%
          if (result.failedContestParticipantId) {
            const failedPart = (participants || []).find((p: any) => p.id === result.failedContestParticipantId);
            if (failedPart) {
              const failMoveAct = allActions.find((a: any) => a.participant_id === failedPart.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null);
              if (failMoveAct) {
                // Reduce their movement by 25% — move them only 75% of the way
                const startX = Number(failedPart.pos_x ?? 50);
                const startY = Number(failedPart.pos_y ?? 50);
                const penaltyX = startX + (Number(failMoveAct.target_x) - startX) * 0.75;
                const penaltyY = startY + (Number(failMoveAct.target_y) - startY) * 0.75;
                deferredPositionUpdates.push({ id: failedPart.id, pos_x: penaltyX, pos_y: penaltyY });
                console.log(`[ENGINE] Failed tackle penalty: ${failedPart.id.slice(0,8)} movement reduced by 25%`);
              }
            }
          }
        } else if (isPassType(ballHolderAction.action_type) || isHeaderPassType(ballHolderAction.action_type)) {
          // RULE: resolveAction already processed interceptions from opponents.
          // Here we only match SAME-TEAM receivers (teammates trying to receive the pass).
          // Opponent 'receive' actions were already contested inside resolveAction.
          const teammateReceivers = allActions.filter((a: any) => {
            if (a.participant_id === ballHolder.id) return false;
            if (a.action_type !== 'receive') return false;
            if (a.target_x == null || a.target_y == null) return false;
            const p = (participants || []).find((pp: any) => pp.id === a.participant_id);
            return p && p.club_id === possClubId; // Only same-team receivers
          });

          if (teammateReceivers.length > 0) {
            // Find the teammate receiver closest to the pass destination
            let bestDist = Infinity;
            let bestId: string | null = null;
            for (const rcv of teammateReceivers) {
              const dist = Math.sqrt(
                (Number(rcv.target_x) - ballHolderAction.target_x) ** 2 +
                (Number(rcv.target_y) - ballHolderAction.target_y) ** 2
              );
              if (dist < bestDist) { bestDist = dist; bestId = rcv.participant_id; }
            }
            if (bestId) {
              nextBallHolderParticipantId = bestId;
              // Same-team receiver — no possession change
            } else {
              nextBallHolderParticipantId = null;
            }
          } else {
            // No teammate did receive — ball is loose at the pass destination
            nextBallHolderParticipantId = null;
            const looseDest = { x: Number(ballHolderAction.target_x ?? 50), y: Number(ballHolderAction.target_y ?? 50) };
            ballEndPos = looseDest;
            eventsToLog.push({ match_id, event_type: 'loose_ball', title: '⚽ Bola solta!', body: `Ninguém dominou a bola.`, payload: { x: looseDest.x, y: looseDest.y } });
          }
        } else if (ballHolderAction.action_type === 'move') {
          nextBallHolderParticipantId = ballHolder.id;
        }

        // Offside check — NOT applied on throw-ins, goal kicks, or corners (FIFA rules)
        const noOffsideSetPieces = new Set(['throw_in', 'goal_kick', 'corner']);
        const skipOffside = activeTurn.set_piece_type && noOffsideSetPieces.has(activeTurn.set_piece_type);
        if (!skipOffside && ballHolderAction && (isPassType(ballHolderAction.action_type) || isHeaderPassType(ballHolderAction.action_type)) && nextBallHolderParticipantId && nextBallHolderParticipantId !== ballHolder.id) {
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
            // Check for designated free kick taker on the defending team
            const offsideFkRoles = lineupRolesCache ? (defClub === match.home_club_id ? lineupRolesCache.home : lineupRolesCache.away) : null;
            const offsideFkDesignated = offsideFkRoles ? findParticipantByProfileId(defPlayersForFK, offsideFkRoles.free_kick_taker_id) : null;
            const fkTaker = offsideFkDesignated || defPlayersForFK[0];
            if (fkTaker) {
              deferredPositionUpdates.push({ id: fkTaker.id, pos_x: offsideX, pos_y: offsideY });
              nextBallHolderParticipantId = fkTaker.id;
            } else {
              nextBallHolderParticipantId = null;
            }
            newPossessionClubId = defClub;
            nextSetPieceType = 'free_kick';
            ballEndPos = { x: offsideX, y: offsideY };
            eventsToLog.push({
              match_id, event_type: 'offside', title: '🚩 Impedimento!', body: 'Jogador em posição irregular. Tiro livre indireto.',
            });
          }
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

      const looseBallClaimer = findLooseBallClaimer(allActions, participants || [], attrByProfile, match.current_turn_number ?? 1, ballEndPos as { x: number; y: number } | null);

      if (looseBallClaimer) {
        nextBallHolderParticipantId = looseBallClaimer.id;
        newPossessionClubId = looseBallClaimer.club_id;

        eventsToLog.push({
          match_id,
          event_type: looseBallClaimer.club_id === possClubId ? 'loose_ball_recovered' : 'possession_change',
          title: looseBallClaimer.club_id === possClubId ? '🤲 Bola recuperada!' : '🔄 Bola roubada!',
          body: 'Quem chegou primeiro na bola solta ficou com a posse.',
        });
      } else {
        nextBallHolderParticipantId = null;
        if (wasAlreadyLoose) {
          eventsToLog.push({
            match_id, event_type: 'ball_stopped',
            title: '⚽ Bola parada',
            body: 'A bola perdeu a inércia e está parada no campo.',
          });
        } else {
          const prevBhAction = allActions.find(a => isBallActionType(a.action_type));
          let inertiaBallX = ballEndPos ? (ballEndPos as { x: number; y: number }).x : 50;
          let inertiaBallY = ballEndPos ? (ballEndPos as { x: number; y: number }).y : 50;
          if (prevBhAction && prevBhAction.target_x != null && prevBhAction.target_y != null && ballHolder) {
            const startX = Number(ballHolder.pos_x ?? 50);
            const startY = Number(ballHolder.pos_y ?? 50);
            const dirX = Number(prevBhAction.target_x) - startX;
            const dirY = Number(prevBhAction.target_y) - startY;
            // Don't clamp — allow ball to go out of bounds so detectOutOfBounds handles it
            inertiaBallX = Number(prevBhAction.target_x) + dirX * 0.15;
            inertiaBallY = Number(prevBhAction.target_y) + dirY * 0.15;
          }
          ballEndPos = { x: inertiaBallX, y: inertiaBallY };
          eventsToLog.push({
            match_id, event_type: 'ball_inertia',
            title: '⚽ Bola continua rolando...',
            body: 'Ninguém alcançou a bola. Ela continua na mesma direção por inércia.',
            payload: { x: inertiaBallX, y: inertiaBallY, ball_x: inertiaBallX, ball_y: inertiaBallY },
          });
        }
      }
    }

    // ── Apply deferred ball holder move (after ball resolution) ──
    if (bhHasBallAction && ballHolder) {
      const bhMoveAction = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
      if (bhMoveAction?.target_x != null && bhMoveAction?.target_y != null) {
        const bhAttrs = getAttrs(ballHolder);
        let bhMaxRange = computeMaxMoveRange(bhAttrs, match.current_turn_number ?? 1) * 0.35; // BH restricted move
        // One-touch turn: movement scaled by ball speed
        const otAct = allActions.find((act: any) => act.payload && typeof act.payload === 'object' && (act.payload as any).one_touch_executed);
        if (otAct) {
          const oType = (otAct.payload as any).origin_action_type || 'pass_low';
          const otSF =
            (oType === 'shoot_power' || oType === 'header_power') ? 0.25 :
            (oType === 'shoot_controlled' || oType === 'header_controlled') ? 0.35 :
            oType === 'pass_launch' ? 0.5 :
            (oType === 'pass_high' || oType === 'header_high') ? 0.65 :
            1.0;
          bhMaxRange *= otSF * 0.5;
        }
        const bhStartX = Number(ballHolder.pos_x ?? 50);
        const bhStartY = Number(ballHolder.pos_y ?? 50);
        let bhFinalX = Number(bhMoveAction.target_x);
        let bhFinalY = Number(bhMoveAction.target_y);
        const bhDx = bhFinalX - bhStartX;
        const bhDy = bhFinalY - bhStartY;
        const bhDist = Math.sqrt(bhDx * bhDx + bhDy * bhDy);
        if (bhDist > bhMaxRange) {
          const scale = bhMaxRange / bhDist;
          bhFinalX = bhStartX + bhDx * scale;
          bhFinalY = bhStartY + bhDy * scale;
        }
        deferredPositionUpdates.push({ id: ballHolder.id, pos_x: bhFinalX, pos_y: bhFinalY });
        console.log(`[ENGINE] Deferred BH move applied: (${bhFinalX.toFixed(1)},${bhFinalY.toFixed(1)}) maxRange=${bhMaxRange.toFixed(1)}`);
      }
    }

    const allRawIds = (rawActions || []).map((a: any) => a.id);
    if (allRawIds.length > 0) {
      const usedIds = allActions.map((a: any) => a.id);
      const overriddenIds = allRawIds.filter((id: any) => !usedIds.includes(id));
      const actionStatusUpdates: Promise<any>[] = [];
      if (usedIds.length > 0) actionStatusUpdates.push(supabase.from('match_actions').update({ status: 'used' }).in('id', usedIds));
      if (overriddenIds.length > 0) actionStatusUpdates.push(supabase.from('match_actions').update({ status: 'overridden' }).in('id', overriddenIds));
      if (actionStatusUpdates.length > 0) await Promise.all(actionStatusUpdates);
    }

    // ── Compute ball end position for out-of-bounds check ──
    if (!ballEndPos) {
      if (nextBallHolderParticipantId) {
        const holder = (participants || []).find((p: any) => p.id === nextBallHolderParticipantId);
        if (holder) {
          const moveAct = allActions.find((a: any) => a.participant_id === holder.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block'));
          ballEndPos = {
            x: Number(moveAct?.target_x ?? holder.pos_x ?? 50),
            y: Number(moveAct?.target_y ?? holder.pos_y ?? 50),
          };
        }
      } else if (ballHolder) {
        // Loose ball — ball is at the pass/shot target
        const bhAction = allActions.find((a: any) => a.participant_id === ballHolder.id && isBallActionType(a.action_type));
        if (bhAction?.target_x != null && bhAction?.target_y != null) {
          ballEndPos = { x: Number(bhAction.target_x), y: Number(bhAction.target_y) };
        }
      }
    }

    // ── Goal from pass/move ending in goal area (before OOB) ──
    if (nextBallHolderParticipantId === null && ballEndPos) {
      const inHomeGoal = ballEndPos.x <= 1 && ballEndPos.y >= 38 && ballEndPos.y <= 62;
      const inAwayGoal = ballEndPos.x >= 99 && ballEndPos.y >= 38 && ballEndPos.y <= 62;
      if (inHomeGoal || inAwayGoal) {
        const ballAction = ballHolder
          ? allActions.find(a => a.participant_id === ballHolder.id && (isBallActionType(a.action_type) || a.action_type === 'move'))
          : null;
        const isOverGoal = Boolean(ballAction?.payload && typeof ballAction.payload === 'object' && (ballAction.payload as any).over_goal) || doesAerialBallGoOverGoal(ballAction, Number(ballHolder?.pos_x ?? 50));
        if (!isOverGoal) {
          // Goal logic: in 2nd half, goals are flipped (sides swapped)
          const isSecondHalfGoal = (match.current_half ?? 1) >= 2;
          const rightGoalScorer = isSecondHalfGoal ? 'away' : 'home'; // who scores when ball enters right goal
          if (inAwayGoal) {
            // Ball in right goal (x>=99)
            if (rightGoalScorer === 'home') homeScore++; else awayScore++;
          } else {
            // Ball in left goal (x<=1)
            if (rightGoalScorer === 'home') awayScore++; else homeScore++;
          }
          const ballGoalAction = ballHolder
            ? allActions.find(a => a.participant_id === ballHolder.id && isBallActionType(a.action_type))
            : null;
          const ballGoalType = ballGoalAction && (isShootType(ballGoalAction.action_type) || isHeaderShootType(ballGoalAction.action_type)) ? 'shot'
            : (ballGoalAction && isHeaderType(ballGoalAction.action_type) ? 'header'
            : (ballGoalAction && (ballGoalAction.action_type === 'pass_high' || ballGoalAction.action_type === 'pass_launch') ? 'header' : 'shot'));
          // Own goal: ball went into the goal defended by the team with possession
          const rightGoalDefender = isSecondHalfGoal ? match.home_club_id : match.away_club_id;
          const leftGoalDefender = isSecondHalfGoal ? match.away_club_id : match.home_club_id;
          const isBallGoalOwnGoal = (inAwayGoal && possClubId === rightGoalDefender)
            || (inHomeGoal && possClubId === leftGoalDefender);
          eventsToLog.push({
            match_id, event_type: 'goal',
            title: isBallGoalOwnGoal ? `⚽ GOL CONTRA! ${homeScore} – ${awayScore}` : `⚽ GOL! ${homeScore} – ${awayScore}`,
            body: `Turno ${match.current_turn_number}${isBallGoalOwnGoal ? ' - Gol contra!' : ' - Bola no fundo da rede!'}`,
            payload: {
              scorer_participant_id: ballHolder?.id || null,
              scorer_club_id: isBallGoalOwnGoal ? (possClubId === match.home_club_id ? match.away_club_id : match.home_club_id) : possClubId,
              assister_participant_id: null,
              goal_type: isBallGoalOwnGoal ? 'own_goal' : ballGoalType,
            },
          });
          // Team that conceded gets the kickoff
          const concedingClubId = inAwayGoal ? rightGoalDefender : leftGoalDefender;
          newPossessionClubId = concedingClubId;
          nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
          nextSetPieceType = 'kickoff';
        }
      }
    }

    if (ballHolder && nextBallHolderParticipantId === ballHolder.id) {
      const bhMoveAct = allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');
      if (bhMoveAct?.target_x != null && bhMoveAct?.target_y != null) {
        const moveEndX = Number(bhMoveAct.target_x);
        const moveEndY = Number(bhMoveAct.target_y);
        const inHomeGoal = moveEndX <= 2 && moveEndY >= 38 && moveEndY <= 62;
        const inAwayGoal = moveEndX >= 98 && moveEndY >= 38 && moveEndY <= 62;
        if (inHomeGoal || inAwayGoal) {
          const isSecondHalfGoal2 = (match.current_half ?? 1) >= 2;
          const rightScorer2 = isSecondHalfGoal2 ? 'away' : 'home';
          if (inAwayGoal) { if (rightScorer2 === 'home') homeScore++; else awayScore++; }
          else { if (rightScorer2 === 'home') awayScore++; else homeScore++; }
          eventsToLog.push({
            match_id, event_type: 'goal', title: `⚽ GOL! ${homeScore} – ${awayScore}`, body: `Turno ${match.current_turn_number} - Gol de condução!`,
            payload: {
              scorer_participant_id: ballHolder.id,
              scorer_club_id: possClubId,
              assister_participant_id: null,
              goal_type: 'dribble',
            },
          });
          newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
          nextBallHolderParticipantId = await pickCenterKickoffPlayer(supabase, match_id, newPossessionClubId, participants || []);
          nextSetPieceType = 'kickoff';
        }
      }
    }

    const goalScored = homeScore > match.home_score || awayScore > match.away_score;
    if (ballEndPos && !goalScored && nextBallHolderParticipantId === null) {
      const oob = detectOutOfBounds(ballEndPos.x, ballEndPos.y, lastTouchClubId || match.home_club_id, match);
      if (oob) {
        const restart = await handleSetPiece(supabase, match_id, oob, participants || [], match, allActions, lineupRolesCache);
        if (restart) {
          nextBallHolderParticipantId = restart.playerId;
          newPossessionClubId = restart.clubId;
          nextSetPieceType = oob.type;
          eventsToLog.push({
            match_id, event_type: oob.type,
            title: restart.title,
            body: restart.body,
          });
        }
      }
    }

    // ── Batch: flush deferred position updates + event logs ──
    const batchOps: Promise<any>[] = [];
    if (deferredPositionUpdates.length > 0) {
      const deferredBatch = deferredPositionUpdates.map(u => ({ id: u.id, x: u.pos_x, y: u.pos_y }));
      batchOps.push(supabase.rpc('batch_update_participant_positions', { p_updates: deferredBatch }));
    }
    if (eventsToLog.length > 0) {
      batchOps.push(supabase.from('match_event_logs').insert(eventsToLog));
    }
    if (batchOps.length > 0) await Promise.all(batchOps);

    // ── Energy drain: compute and apply for all players ──
    {
      const energyUpdates: Array<{id: string, energy: number}> = [];
      for (const p of (participants || [])) {
        if (p.role_type !== 'player' || p.is_sent_off) continue;
        const oldX = Number(p.pos_x ?? 50);
        const oldY = Number(p.pos_y ?? 50);
        // Find new position from resolution moves or deferred updates
        const moveAction = allActions.find((a: any) => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block'));
        const newX = moveAction?.target_x != null ? Number(moveAction.target_x) : oldX;
        const newY = moveAction?.target_y != null ? Number(moveAction.target_y) : oldY;
        const distMoved = Math.sqrt((newX - oldX) ** 2 + (newY - oldY) ** 2);

        // Find ball action if this player is the BH
        const ballAction = allActions.find((a: any) => a.participant_id === p.id &&
          ['pass_low','pass_high','pass_launch','shoot_controlled','shoot_power',
           'header_low','header_high','header_controlled','header_power'].includes(a.action_type));
        const actionType = ballAction?.action_type || moveAction?.action_type || 'no_action';

        const pAttrs = getAttrs(p);
        const rawStamina = Number(p.player_profile_id ? (attrByProfile[p.player_profile_id]?.stamina ?? 40) : 40);
        const maxRange = computeMaxMoveRange(pAttrs, match.current_turn_number ?? 1);
        const slotPos = (p._slot_position || p.slot_position || '').replace(/[0-9]/g, '').toUpperCase();
        const isGK = isGKPosition(slotPos);

        const drain = computeEnergyDrain(rawStamina, distMoved, maxRange, actionType, isGK);
        const currentEnergy = Number(p.match_energy ?? 100);
        const newEnergy = Math.max(0, Math.round((currentEnergy - drain) * 100) / 100);

        if (newEnergy !== currentEnergy) {
          energyUpdates.push({ id: p.id, energy: newEnergy });
          // Update in-memory for snapshot and next tick
          p.match_energy = newEnergy;
        }
      }
      if (energyUpdates.length > 0) {
        // Batch update energy using the same RPC (position unchanged, only energy)
        const energyBatch = energyUpdates.map(u => ({ id: u.id, x: -1, y: -1, energy: u.energy }));
        // Use direct updates since we don't want to change positions
        const energyOps = energyUpdates.map(u =>
          supabase.from('match_participants').update({ match_energy: u.energy }).eq('id', u.id)
        );
        await Promise.all(energyOps);
      }
    }

    // ── Save turn snapshot for replay ──
    try {
      const snapshotPlayers = (participants || []).filter((p: any) => p.role_type === 'player').map((p: any) => {
        // Find this player's move action to get their final position
        const moveAction = allActions.find((a: any) => a.participant_id === p.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block'));
        const finalX = moveAction?.target_x != null ? Number(moveAction.target_x) : Number(p.pos_x ?? 50);
        const finalY = moveAction?.target_y != null ? Number(moveAction.target_y) : Number(p.pos_y ?? 50);
        return {
          id: p.id,
          club_id: p.club_id,
          pos_x: finalX,
          pos_y: finalY,
          jersey_number: p.jersey_number || null,
          player_name: p.player_name || null,
          field_pos: p._slot_position || p.slot_position || null,
          is_bot: p.is_bot,
        };
      });

      // Get the ball position
      const snapshotBallHolder = nextBallHolderParticipantId
        ? snapshotPlayers.find((p: any) => p.id === nextBallHolderParticipantId)
        : null;
      const snapshotBallPos = snapshotBallHolder
        ? { x: snapshotBallHolder.pos_x, y: snapshotBallHolder.pos_y }
        : (ballEndPos || { x: 50, y: 50 });

      // Get recent events for this turn
      const { data: turnEvents } = await supabase
        .from('match_event_logs')
        .select('event_type, title, body')
        .eq('match_id', match_id)
        .order('created_at', { ascending: false })
        .limit(5);

      await supabase.from('match_snapshots').insert({
        match_id,
        turn_number: match.current_turn_number,
        snapshot: {
          players: snapshotPlayers,
          ball: snapshotBallPos,
          ball_holder_id: nextBallHolderParticipantId,
          possession_club_id: newPossessionClubId,
          home_score: homeScore,
          away_score: awayScore,
          events: (turnEvents || []).reverse(),
        },
      });
    } catch (snapErr) {
      console.error('[ENGINE] Snapshot save failed:', snapErr);
    }

    const newTurnNumber = match.current_turn_number + 1;

    await supabase.from('match_turns')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', activeTurn.id);

    // ── Real-time clock: halftime / end-of-match check ──
    const currentHalf = match.current_half || 1;
    const halfElapsed = match.half_started_at
      ? Date.now() - new Date(match.half_started_at).getTime()
      : 0;
    const isTimeUp = halfElapsed >= HALF_DURATION_MS;
    const injuryTurns = match.injury_time_turns || 0;
    const injuryStartTurn = match.injury_time_start_turn || null;

    // Determine if we should end the half
    let shouldEndHalf = false;
    if (isTimeUp && injuryTurns === 0) {
      // First detection that time is up — set injury time
      const extraTurns = 1 + Math.floor(Math.random() * MAX_INJURY_TIME_TURNS);
      await supabase.from('matches').update({
        injury_time_turns: extraTurns,
        injury_time_start_turn: match.current_turn_number,
      }).eq('id', match_id);
      console.log(`[ENGINE] Injury time started: ${extraTurns} extra turns from turn ${match.current_turn_number} (half ${currentHalf})`);
    } else if (isTimeUp && injuryTurns > 0 && injuryStartTurn !== null) {
      // Check if injury time turns have been played
      if (match.current_turn_number >= injuryStartTurn + injuryTurns) {
        shouldEndHalf = true;
      }
    }

    // Safety cap: prevent infinite games
    if (newTurnNumber > MAX_TURNS_SAFETY) {
      shouldEndHalf = true;
      console.log(`[ENGINE] Safety cap reached (${MAX_TURNS_SAFETY} turns), forcing end`);
    }

    if (shouldEndHalf && currentHalf === 1) {
      // ── HALFTIME ──
      const matchMinute = computeMatchMinute(match);
      await supabase.from('match_event_logs').insert({
        match_id, event_type: 'halftime',
        title: `⏸ Intervalo! ${homeScore} – ${awayScore}`,
        body: `Fim do primeiro tempo (${matchMinute}'). Intervalo de 5 minutos.`,
      });

      // Create a halftime pause turn
      const halftimeStart = new Date().toISOString();
      const halftimeEnd = new Date(Date.now() + HALFTIME_DURATION_MS).toISOString();
      // Second half clock starts after halftime
      const secondHalfStartAt = halftimeEnd;

      // Swap possession for second half kickoff
      const secondHalfPossession = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
      const secondHalfKicker = await pickCenterKickoffPlayer(supabase, match_id, secondHalfPossession, participants || []);

      await supabase.from('matches').update({
        current_turn_number: newTurnNumber,
        current_phase: 'positioning_attack',
        possession_club_id: secondHalfPossession,
        home_score: homeScore, away_score: awayScore,
        current_half: 2,
        half_started_at: secondHalfStartAt,
        injury_time_turns: 0,
        injury_time_start_turn: null,
      }).eq('id', match_id);

      await supabase.from('match_turns').insert({
        match_id, turn_number: newTurnNumber,
        phase: 'positioning_attack',
        possession_club_id: secondHalfPossession,
        ball_holder_participant_id: secondHalfKicker,
        started_at: halftimeStart, ends_at: halftimeEnd,
        status: 'active',
        set_piece_type: 'kickoff',
      });

      // Reset all players to formation positions (field inverted for second half)
      {
        let homeFormation = '4-4-2';
        let awayFormation = '4-4-2';
        if (tickCache.clubSettings) {
          homeFormation = tickCache.clubSettings.homeFormation;
          awayFormation = tickCache.clubSettings.awayFormation;
        } else {
          const [{ data: hs }, { data: as2 }] = await Promise.all([
            supabase.from('club_settings').select('default_formation').eq('club_id', match.home_club_id).maybeSingle(),
            supabase.from('club_settings').select('default_formation').eq('club_id', match.away_club_id).maybeSingle(),
          ]);
          homeFormation = hs?.default_formation || '4-4-2';
          awayFormation = as2?.default_formation || '4-4-2';
        }

        // Position normalizer + compatibility (same as positionExistingPlayers)
        const normP = (pos: string): string => {
          const c = pos.replace(/[0-9]/g, '').toUpperCase();
          const M: Record<string, string> = {
            'GK':'GK','GOL':'GK','CB':'CB','ZAG':'CB','LB':'LB','LE':'LB','RB':'RB','LD':'RB',
            'LWB':'LWB','ALE':'LWB','RWB':'RWB','ALD':'RWB',
            'CDM':'CDM','DM':'CDM','VOL':'CDM','CM':'CM','MC':'CM','CAM':'CAM','MEI':'CAM',
            'LM':'LM','ME':'LM','RM':'RM','MD':'RM','LW':'LW','PE':'LW','RW':'RW','PD':'RW',
            'ST':'ST','ATA':'ST','CF':'CF','SA':'CF',
          };
          return M[c] || c;
        };
        const CG2: Record<string, string[]> = {
          'GK':['GK'],'CB':['CB'],'LB':['LB','LWB'],'RB':['RB','RWB'],
          'LWB':['LWB','LB'],'RWB':['RWB','RB'],
          'CDM':['CDM','CM'],'CM':['CM','CDM','CAM'],'CAM':['CAM','CM'],
          'LM':['LM','LW'],'RM':['RM','RW'],'LW':['LW','LM'],'RW':['RW','RM'],
          'ST':['ST','CF'],'CF':['CF','ST'],
        };
        const pc = (a: string, b: string): boolean => {
          const ca = normP(a), cb = normP(b);
          if (ca === cb) return true;
          return CG2[ca]?.includes(cb) || false;
        };

        const halftimeBatch: Array<{id: string, x: number, y: number}> = [];
        const buildHalftimeBatch = (clubId: string, formation: string, isHome: boolean) => {
          const teamParts = (participants || []).filter((p: any) => p.club_id === clubId && p.role_type === 'player' && p.id !== secondHalfKicker);
          // Second half: home plays on right, away on left (inverted from first half)
          const effectiveIsHome = !isHome;
          const positions = getFormationForFill(formation, effectiveIsHome);
          const usedIdx = new Set<number>();
          const assigned = new Set<string>();

          for (const p of teamParts) {
            const slotPos = (p._slot_position || p.slot_position || '').toUpperCase();
            let bestIdx = -1;
            for (let i = 0; i < positions.length; i++) {
              if (usedIdx.has(i)) continue;
              if (pc(slotPos || 'CM', positions[i].pos)) { bestIdx = i; break; }
            }
            if (bestIdx >= 0) {
              usedIdx.add(bestIdx);
              assigned.add(p.id);
              let x = positions[bestIdx].x;
              x = effectiveIsHome ? Math.min(x, 48) : Math.max(x, 52);
              halftimeBatch.push({ id: p.id, x, y: positions[bestIdx].y });
            }
          }
          for (const p of teamParts) {
            if (assigned.has(p.id)) continue;
            for (let i = 0; i < positions.length; i++) {
              if (usedIdx.has(i)) continue;
              usedIdx.add(i);
              let x = positions[i].x;
              x = effectiveIsHome ? Math.min(x, 48) : Math.max(x, 52);
              halftimeBatch.push({ id: p.id, x, y: positions[i].y });
              break;
            }
          }
        };
        buildHalftimeBatch(match.home_club_id, homeFormation, true);
        buildHalftimeBatch(match.away_club_id, awayFormation, false);

        // Position the kickoff player at center
        if (secondHalfKicker) {
          halftimeBatch.push({ id: secondHalfKicker, x: 50, y: 50 });
        }

        if (halftimeBatch.length > 0) {
          await supabase.rpc('batch_update_participant_positions', { p_updates: halftimeBatch });
        }
        console.log(`[ENGINE] Second half: reset ${halftimeBatch.length} players to formation positions (field inverted)`);
      }

      // Halftime energy recovery
      {
        const recoveryOps = (participants || [])
          .filter((p: any) => p.role_type === 'player' && !p.is_sent_off)
          .map((p: any) => {
            const currentEnergy = Number(p.match_energy ?? 100);
            const newEnergy = Math.min(100, currentEnergy + ENERGY_HALFTIME_RECOVERY);
            p.match_energy = newEnergy;
            return supabase.from('match_participants').update({ match_energy: newEnergy }).eq('id', p.id);
          });
        if (recoveryOps.length > 0) await Promise.all(recoveryOps);
        console.log(`[ENGINE] Halftime: ${recoveryOps.length} players recovered ${ENERGY_HALFTIME_RECOVERY}% energy`);
      }

      await supabase.from('match_event_logs').insert({
        match_id, event_type: 'second_half',
        title: '⚽ Segundo tempo!',
        body: 'Posicionamento para o início do segundo tempo.',
      });
    } else if (shouldEndHalf && currentHalf === 2) {
      // ── FULL TIME ──
      const matchMinute = computeMatchMinute(match);
      await supabase.from('matches').update({
        status: 'finished', finished_at: new Date().toISOString(),
        home_score: homeScore, away_score: awayScore,
      }).eq('id', match_id);

      await supabase.from('match_event_logs').insert({
        match_id, event_type: 'final_whistle',
        title: `🏁 Apito final! ${homeScore} – ${awayScore}`,
        body: `Partida encerrada aos ${matchMinute}'.`,
      });

      // Trigger standings update for league matches
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/league-scheduler`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ action: 'update_standings', match_id }),
        });
      } catch (e) {
        console.error(`[ENGINE] Failed to update standings for match ${match_id}:`, e);
      }
    } else {
      // ── Post-goal reset: move all players to formation positions ──
      if (nextSetPieceType === 'kickoff') {
        const isTestMatch = !match.home_lineup_id && !match.away_lineup_id;
        let homeFormation = 'test-home';
        let awayFormation = 'test-away';
        if (!isTestMatch) {
          if (tickCache.clubSettings) {
            homeFormation = tickCache.clubSettings.homeFormation;
            awayFormation = tickCache.clubSettings.awayFormation;
          } else {
            const [{ data: homeSettings }, { data: awaySettings }] = await Promise.all([
              supabase.from('club_settings').select('default_formation').eq('club_id', match.home_club_id).maybeSingle(),
              supabase.from('club_settings').select('default_formation').eq('club_id', match.away_club_id).maybeSingle(),
            ]);
            homeFormation = homeSettings?.default_formation || '4-4-2';
            awayFormation = awaySettings?.default_formation || '4-4-2';
            tickCache.clubSettings = { homeFormation, awayFormation };
          }
        }

        const isSecondHalf = (match.current_half ?? 1) >= 2;
        const resetBatch: Array<{id: string, x: number, y: number}> = [];
        // Position compatibility (EN + PT-BR support)
        const normPos = (pos: string): string => {
          const c = pos.replace(/[0-9]/g, '').toUpperCase();
          const M: Record<string, string> = {
            'GK':'GK','GOL':'GK','CB':'CB','ZAG':'CB','LB':'LB','LE':'LB','RB':'RB','LD':'RB',
            'LWB':'LWB','ALE':'LWB','RWB':'RWB','ALD':'RWB',
            'CDM':'CDM','DM':'CDM','VOL':'CDM','CM':'CM','MC':'CM','CAM':'CAM','MEI':'CAM',
            'LM':'LM','ME':'LM','RM':'RM','MD':'RM','LW':'LW','PE':'LW','RW':'RW','PD':'RW',
            'ST':'ST','ATA':'ST','CF':'CF','SA':'CF',
          };
          return M[c] || c;
        };
        const CG: Record<string, string[]> = {
          'GK':['GK'],'CB':['CB'],'LB':['LB','LWB'],'RB':['RB','RWB'],
          'LWB':['LWB','LB'],'RWB':['RWB','RB'],
          'CDM':['CDM','CM'],'CM':['CM','CDM','CAM'],'CAM':['CAM','CM'],
          'LM':['LM','LW'],'RM':['RM','RW'],'LW':['LW','LM'],'RW':['RW','RM'],
          'ST':['ST','CF'],'CF':['CF','ST'],
        };
        const posCompat = (slotPos: string, formPos: string): boolean => {
          const a = normPos(slotPos), b = normPos(formPos);
          if (a === b) return true;
          return CG[a]?.includes(b) || false;
        };
        const buildResetBatch = (clubId: string, formation: string, isHome: boolean) => {
          const teamParts = (participants || []).filter((p: any) => p.club_id === clubId && p.role_type === 'player' && p.id !== nextBallHolderParticipantId);
          const effectiveIsHome = isSecondHalf ? !isHome : isHome;
          const positions = getFormationForFill(formation, effectiveIsHome);
          const usedIndices = new Set<number>();
          const assigned = new Set<string>();

          // First pass: match by slot position
          for (const p of teamParts) {
            const slotPos = (p._slot_position || p.slot_position || '').replace(/[0-9]/g, '').toUpperCase();
            let bestIdx = -1;
            for (let i = 0; i < positions.length; i++) {
              if (usedIndices.has(i)) continue;
              if (posCompat(slotPos || 'CM', positions[i].pos)) { bestIdx = i; break; }
            }
            if (bestIdx >= 0) {
              usedIndices.add(bestIdx);
              assigned.add(p.id);
              let x = positions[bestIdx].x;
              x = effectiveIsHome ? Math.min(x, 48) : Math.max(x, 52);
              resetBatch.push({ id: p.id, x, y: positions[bestIdx].y });
            }
          }
          // Second pass: remaining players to remaining slots
          for (const p of teamParts) {
            if (assigned.has(p.id)) continue;
            for (let i = 0; i < positions.length; i++) {
              if (usedIndices.has(i)) continue;
              usedIndices.add(i);
              let x = positions[i].x;
              x = effectiveIsHome ? Math.min(x, 48) : Math.max(x, 52);
              resetBatch.push({ id: p.id, x, y: positions[i].y });
              break;
            }
          }
        };
        buildResetBatch(match.home_club_id, homeFormation, true);
        buildResetBatch(match.away_club_id, awayFormation, false);
        if (resetBatch.length > 0) {
          await supabase.rpc('batch_update_participant_positions', { p_updates: resetBatch });
        }
        console.log(`[ENGINE] Post-goal reset: all players moved to formation positions`);
      }

      const nextPhaseStart = new Date().toISOString();
      const isNextLooseBall = nextBallHolderParticipantId === null;

      // Penalty: skip positioning, go directly to ball_holder phase
      const isPenalty = nextSetPieceType === 'penalty';
      const hasDeadBallRestart = !isNextLooseBall && Boolean(nextSetPieceType) && !isPenalty;
      const usePositioning = hasDeadBallRestart;
      const nextPhase = isPenalty ? 'ball_holder' : (isNextLooseBall ? 'attacking_support' : (usePositioning ? 'positioning_attack' : 'ball_holder'));
      const nextPhaseDuration = usePositioning ? POSITIONING_PHASE_DURATION_MS : PHASE_DURATION_MS;
      const nextPhaseEnd = new Date(Date.now() + nextPhaseDuration).toISOString();

      await supabase.from('matches').update({
        current_turn_number: newTurnNumber,
        current_phase: nextPhase,
        possession_club_id: newPossessionClubId,
        home_score: homeScore, away_score: awayScore,
      }).eq('id', match_id);

      const { data: insertedTurn } = await supabase.from('match_turns').insert({
        match_id, turn_number: newTurnNumber,
        phase: nextPhase,
        possession_club_id: newPossessionClubId,
        ball_holder_participant_id: nextBallHolderParticipantId,
        started_at: nextPhaseStart, ends_at: nextPhaseEnd,
        status: 'active',
        set_piece_type: nextSetPieceType || null,
      }).select('id').single();

      // ── One-touch auto-action (same approach as 11x11 engine) ──
      if (nextBallHolderParticipantId && insertedTurn?.id) {
        const oneTouchAction = allActions.find(a =>
          a.participant_id === nextBallHolderParticipantId &&
          a.action_type === 'receive' &&
          a.payload && typeof a.payload === 'object' && (a.payload as any).one_touch === true
        );
        if (oneTouchAction) {
          const otPayload = oneTouchAction.payload as any;
          if (otPayload.next_action_type) {
            await supabase.from('match_actions').insert({
              match_id, match_turn_id: insertedTurn.id,
              participant_id: nextBallHolderParticipantId,
              controlled_by_type: oneTouchAction.controlled_by_type || 'bot',
              controlled_by_user_id: oneTouchAction.controlled_by_user_id || null,
              action_type: otPayload.next_action_type,
              target_x: otPayload.next_target_x ?? null,
              target_y: otPayload.next_target_y ?? null,
              target_participant_id: otPayload.next_target_participant_id || null,
              payload: { one_touch_executed: true, origin_action_type: otPayload.origin_action_type || 'pass_low' },
              status: 'pending',
            });
            // Shorten ball_holder phase to 2s since action is pre-determined
            const oneTouchEnd = new Date(Date.now() + 2000).toISOString();
            await supabase.from('match_turns').update({ ends_at: oneTouchEnd }).eq('id', insertedTurn.id);
            console.log(`[ENGINE] One-touch auto-action: ${otPayload.next_action_type} (phase shortened to 2s)`);
            await supabase.from('match_event_logs').insert({ match_id, event_type: 'one_touch', title: '⚡ Toque de primeira!', body: `Jogada de primeira: ${otPayload.next_action_type}` });
          }
        }
      }

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
      } else if (isPenalty) {
        await supabase.from('match_event_logs').insert({
          match_id, event_type: 'penalty_kick',
          title: '🎯 Cobrança de pênalti',
          body: 'O jogador que sofreu a falta cobra o pênalti.',
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

      // Re-use pre-loaded actions instead of re-querying
      const bhActionsFromCache = (nonResolutionActions || [])
        .filter((a: any) => a.participant_id === ballHolder.id)
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const bhAction = bhActionsFromCache[0];
      if (bhAction && isBallActionType(bhAction.action_type) && bhAction.target_x != null && bhAction.target_y != null) {
        const raw = ballHolder.player_profile_id ? devAttrByProfile[ballHolder.player_profile_id] : null;
        const devAttrs: Record<string, number> = {
          passe_baixo: Number(raw?.passe_baixo ?? 40),
          passe_alto: Number(raw?.passe_alto ?? 40),
          forca_chute: Number(raw?.forca_chute ?? 40),
          acuracia_chute: Number(raw?.acuracia_chute ?? 40),
          cabeceio: Number(raw?.cabeceio ?? 40),
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
      set_piece_type: activeTurn.set_piece_type ?? null,
    });
  }

  return { status: 'advanced' };

  } finally {
    // ── Release concurrency lock ──
    try {
      await supabase.rpc('release_match_turn_processing', {
        p_turn_id: activeTurn.id,
        p_processing_token: processingToken,
      });
    } catch (_e) { /* best-effort release; stale lock auto-expires after 15s */ }
  }
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

      // Trigger standings update for league matches
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/league-scheduler`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ action: 'update_standings', match_id }),
        });
      } catch (e) {
        console.error(`[ENGINE] Failed to update standings for match ${match_id}:`, e);
      }

      return new Response(JSON.stringify({ status: 'finished', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── AUTO-START ───
    if (action === 'auto_start' || !action) {
      const started = await autoStartDueMatches(supabase, match_id);
      return jsonResponse({ started, started_count: started.length, server_now: Date.now() });
    }

    if (action === 'process_due_matches') {
      const functionUrl = `${supabaseUrl}/functions/v1/match-engine-lab`;
      const result = await processDueMatches(supabase, functionUrl, match_id);
      return jsonResponse({ ...result, server_now: Date.now() });
    }
    if (action === 'tick' && match_id) {
      const result = await executeTickForMatch(supabase, match_id, forceTick);
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), { status: result.httpStatus || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ...result, server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      const { participant_id, action_type, target_participant_id, target_x, target_y, payload: actionPayload } = body;

      let activeTurn: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data } = await supabase
          .from('match_turns').select('id, phase, possession_club_id, ball_holder_participant_id').eq('match_id', match_id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).single();
        if (data) { activeTurn = data; break; }
        if (attempt < 2) await new Promise(r => setTimeout(r, 300));
      }

      if (!activeTurn) {
        return new Response(JSON.stringify({ error: 'No active turn', recoverable: true }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Load participant, manager profile, and all participants in parallel
      const [{ data: participant }, { data: managerProfile }, { data: allParts }] = await Promise.all([
        supabase.from('match_participants')
          .select('*, matches!inner(home_club_id, away_club_id)')
          .eq('id', participant_id).single(),
        supabase.from('manager_profiles').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('match_participants')
          .select('id, club_id, connected_user_id, role_type')
          .eq('match_id', match_id).eq('role_type', 'player'),
      ]);

      const isOwnParticipant = participant?.connected_user_id === user.id;

      // Check if the user manages the participant's specific club (supports multi-club managers)
      const isManagerOfClub = managerProfile?.id
        ? (await supabase.from('clubs').select('id').eq('id', participant?.club_id).eq('manager_profile_id', managerProfile.id).maybeSingle()).data !== null
        : false;
      const isTestMatch = (allParts || []).length <= 4;
      const isManagerOfMatch = isTestMatch && managerProfile?.id
        ? (await supabase.from('clubs').select('id').eq('manager_profile_id', managerProfile.id)
            .in('id', [(participant as any)?.matches?.home_club_id, (participant as any)?.matches?.away_club_id].filter(Boolean))
            .maybeSingle()).data !== null
        : false;

      if (!isOwnParticipant && !isManagerOfClub && !isManagerOfMatch) {
        return new Response(JSON.stringify({ error: 'Not authorized to control this participant' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const byType = isOwnParticipant ? 'player' : 'manager';

      // Delete any existing pending action of the same type for this participant in this turn
      // This prevents duplicate moves when the player changes their mind
      const isBallAction = ['pass_low','pass_high','pass_launch','shoot_controlled','shoot_power',
        'header_low','header_high','header_controlled','header_power'].includes(action_type);
      const isMoveLike = action_type === 'move' || action_type === 'receive' || action_type === 'block';
      if (isMoveLike) {
        await supabase.from('match_actions').delete()
          .eq('match_turn_id', activeTurn.id)
          .eq('participant_id', participant_id)
          .in('action_type', ['move', 'receive', 'block'])
          .eq('status', 'pending');
      } else if (isBallAction) {
        await supabase.from('match_actions').delete()
          .eq('match_turn_id', activeTurn.id)
          .eq('participant_id', participant_id)
          .in('action_type', ['pass_low','pass_high','pass_launch','shoot_controlled','shoot_power',
            'header_low','header_high','header_controlled','header_power'])
          .eq('status', 'pending');
      }

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
        payload: actionPayload || null,
      });

      // ── Auto-advance: if all human players in this phase have acted, skip the timer ──
      try {
        const phase = activeTurn.phase;
        const possClubId = activeTurn.possession_club_id;
        const bhPartId = activeTurn.ball_holder_participant_id;

        // Reuse allParts from auth check (already has club_id, connected_user_id, role_type)
        // Include both directly connected players AND manager-controlled players (same club)
        const managerControlledClubId = isManagerOfClub ? participant?.club_id : null;
        const humanParts = (allParts || []).filter((p: any) =>
          p.connected_user_id || (managerControlledClubId && p.club_id === managerControlledClubId)
        );

        let expectedHumans: any[] = [];
        if (phase === 'ball_holder') {
          // Only the ball holder
          expectedHumans = humanParts.filter((p: any) => p.id === bhPartId);
        } else if (phase === 'attacking_support' || phase === 'positioning_attack') {
          // Attacking team (same club as possession), excluding BH for attacking_support
          expectedHumans = humanParts.filter((p: any) =>
            p.club_id === possClubId && (phase === 'positioning_attack' || p.id !== bhPartId)
          );
        } else if (phase === 'defending_response' || phase === 'positioning_defense') {
          // Defending team (opposite club)
          expectedHumans = humanParts.filter((p: any) => p.club_id !== possClubId);
        }

        if (expectedHumans.length > 0) {
          // Check how many have already submitted actions in this turn
          const expectedIds = expectedHumans.map((p: any) => p.id);
          const { data: existingActions } = await supabase
            .from('match_actions')
            .select('participant_id')
            .eq('match_turn_id', activeTurn.id)
            .in('participant_id', expectedIds)
            .eq('status', 'pending');

          const actedIds = new Set((existingActions || []).map((a: any) => a.participant_id));
          const allActed = expectedIds.every((id: string) => actedIds.has(id));

          if (allActed) {
            // All humans acted — advance ends_at to now + 1s (small buffer for realtime propagation)
            const advancedEnd = new Date(Date.now() + 1000).toISOString();
            await supabase.from('match_turns').update({ ends_at: advancedEnd })
              .eq('id', activeTurn.id).eq('status', 'active');
            console.log(`[ENGINE] Auto-advance: all ${expectedHumans.length} humans acted in ${phase}, skipping timer`);
          }
        }
      } catch (e) {
        // Non-critical — if auto-advance fails, the normal timer still works
        console.error('[ENGINE] Auto-advance check failed:', e);
      }

      return new Response(JSON.stringify({ status: 'action_submitted', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


