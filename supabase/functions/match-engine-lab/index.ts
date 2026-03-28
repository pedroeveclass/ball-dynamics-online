import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHASE_DURATION_MS = 10000;
const POSITIONING_PHASE_DURATION_MS = 10000;
const RESOLUTION_PHASE_DURATION_MS = 3000;
const HALFTIME_PAUSE_MS = 5 * 60 * 1000; // 5 minutes halftime
const MAX_TURNS = 144;
const TURNS_PER_HALF = 72;
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

function pickImplicitGoalkeeperId(teamParts: any[]): string | null {
  if (teamParts.length === 0) return null;
  const avgX = teamParts.reduce((sum: number, part: any) => sum + Number(part.pos_x ?? 50), 0) / teamParts.length;
  const isHomeLike = avgX <= 50;
  const sorted = [...teamParts].sort((a: any, b: any) => {
    const ax = Number(a.pos_x ?? 50);
    const bx = Number(b.pos_x ?? 50);
    const xDiff = isHomeLike ? ax - bx : bx - ax;
    if (xDiff !== 0) return xDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0]?.id ?? null;
}

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
    const implicitGKId = explicitGK?.id || pickImplicitGoalkeeperId(teamParts);
    if (implicitGKId) gkIdByClub.set(clubId, implicitGKId);
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
      // Find the closest formation position based on coordinates
      const px = Number(p.pos_x);
      const py = Number(p.pos_y);
      const formSlots = FORMATION_POSITIONS['4-4-2']; // default
      let bestDist = Infinity;
      let bestPos = 'CM';
      for (const slot of formSlots) {
        const sx = p.club_id === participants.find((pp: any) => pp.club_id === p.club_id)?.club_id
          ? slot.x : 100 - slot.x; // approximate home/away
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

// ─── Tactical Role System ────────────────────────────────────
type TacticalRole = 'goalkeeper' | 'centerBack' | 'fullBack' | 'defensiveMid' | 'centralMid' | 'attackingMid' | 'wideMid' | 'winger' | 'striker';

function getPositionRole(slotPos: string): TacticalRole {
  const pos = (slotPos || '').toUpperCase();
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

  // Get the bot's position — try _slot_position, then primary_position from profile
  const slotPos = (bot._slot_position || bot.slot_position || '').replace(/[0-9]/g, '').toUpperCase();

  // If we have a slot position, match it to the formation (works for any team size)
  if (slotPos) {
    // Find all players on this team with the same position (to handle duplicates like CB, CB)
    const teamPartsOfSamePos = participants.filter(
      (p: any) => p.club_id === bot.club_id &&
        (p._slot_position || p.slot_position || '').replace(/[0-9]/g, '').toUpperCase() === slotPos &&
        p.role_type === 'player'
    ).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
    const indexInPos = Math.max(0, teamPartsOfSamePos.findIndex((p: any) => p.id === bot.id));

    // Find matching formation slots for this position
    const matchingSlots = formSlots
      .map((s, i) => ({ ...s, slotIndex: i }))
      .filter(s => s.pos.toUpperCase() === slotPos);

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
  const maxSpeed = 10 + normalizeAttr(attrs.velocidade) * 14;
  const staminaDecay = 1.0 - (Math.max(0, turnNumber - 20) / 40) * (1 - normalizeAttr(attrs.stamina)) * 0.15;
  let totalDist = 0;
  let vel = 0;
  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    vel = vel * (1 - accelFactor) + (maxSpeed / NUM_SUBSTEPS) * staminaDecay * accelFactor;
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
interface TickCache {
  clubSettings?: { homeFormation: string; awayFormation: string };
  attrByProfile?: Record<string, any>;
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
) {
  const botsToAct: any[] = [];

  for (const p of participants) {
    if (p.role_type !== 'player') continue;
    if (p.is_sent_off) continue;
    if (submittedParticipantIds.has(p.id)) continue;

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

  // Load formations (use cache if available)
  let homeFormation = '4-4-2';
  let awayFormation = '4-4-2';
  if (tickCache?.clubSettings) {
    homeFormation = tickCache.clubSettings.homeFormation;
    awayFormation = tickCache.clubSettings.awayFormation;
  } else if (match) {
    const clubIds = [match.home_club_id, match.away_club_id].filter(Boolean);
    if (clubIds.length > 0) {
      const { data: settings } = await supabase.from('club_settings').select('club_id, default_formation').in('club_id', clubIds);
      for (const s of (settings || [])) {
        if (s.club_id === match.home_club_id && s.default_formation) homeFormation = s.default_formation;
        if (s.club_id === match.away_club_id && s.default_formation) awayFormation = s.default_formation;
      }
    }
    if (tickCache) tickCache.clubSettings = { homeFormation, awayFormation };
  }

  // Helper: get ball position
  const getBallPos = (): { x: number; y: number } => {
    if (ballHolderId) {
      const bh = participants.find((p: any) => p.id === ballHolderId);
      if (bh) return { x: Number(bh.pos_x ?? 50), y: Number(bh.pos_y ?? 50) };
    }
    return { x: 50, y: 50 };
  };
  const ballPos = getBallPos();

  const actions: any[] = [];

  // Query ball holder's action type for defending_response decisions (block vs receive)
  let bhActionType: string | null = null;
  if (phase === 'defending_response' && ballHolderId) {
    const { data: bhActions } = await supabase
      .from('match_actions')
      .select('action_type')
      .eq('match_id', matchId)
      .eq('participant_id', ballHolderId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (bhActions && bhActions.length > 0) {
      bhActionType = bhActions[0].action_type;
    }
  }

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

  for (const bot of botsToAct) {
    const posX = Number(bot.pos_x ?? 50);
    const posY = Number(bot.pos_y ?? 50);
    const isBH = bot.id === ballHolderId;
    const isHome = bot.club_id === homeClubId;
    const formation = isHome ? homeFormation : awayFormation;
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

    const teammates = participants.filter(
      (p: any) => p.club_id === bot.club_id && p.id !== bot.id && p.role_type === 'player'
    );
    const opponents = participants.filter(
      (p: any) => p.club_id !== bot.club_id && p.role_type === 'player'
    );

    // ── Ball Holder Decision ──
    if (isBH && phase === 'ball_holder') {
      const goalX = isHome ? 100 : 0;
      const goalY = 40 + Math.random() * 20;
      const distToGoal = Math.sqrt((posX - goalX) ** 2 + (posY - 50) ** 2);

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
        // CDM: distribute — short passes or long balls to free attackers
        const passResult = pickBestPassTarget(bot, role, teammates, isHome, ballPos, opponents);
        if (passResult) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: passResult.actionType,
            target_x: Number(passResult.target.pos_x ?? 50), target_y: Number(passResult.target.pos_y ?? 50),
            target_participant_id: passResult.target.id, status: 'pending',
          });
        } else {
          const moveX = isHome ? Math.min(55, posX + 3) : Math.max(45, posX - 3);
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'move',
            target_x: moveX, target_y: posY + (Math.random() - 0.5) * 4, status: 'pending',
          });
        }
      } else if (role === 'centralMid' || role === 'attackingMid' || role === 'wideMid') {
        // Midfielders: shoot if close, dribble if space, pass forward
        if (distToGoal < 30 && Math.random() < 0.35) {
          const shootType = Math.random() < 0.6 ? 'shoot_controlled' : 'shoot_power';
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: shootType,
            target_x: goalX, target_y: goalY, status: 'pending',
          });
        } else {
          // Check if space to dribble
          const nearestOpp = opponents.reduce((best: any, opp: any) => {
            const d = Math.sqrt((posX - Number(opp.pos_x ?? 50)) ** 2 + (posY - Number(opp.pos_y ?? 50)) ** 2);
            return d < (best?.dist ?? 999) ? { opp, dist: d } : best;
          }, null as any);

          if (nearestOpp && nearestOpp.dist > 12 && Math.random() < 0.3) {
            // Space to dribble forward
            const moveX = isHome ? Math.min(98, posX + 6 + Math.random() * 4) : Math.max(2, posX - 6 - Math.random() * 4);
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: moveX, target_y: posY + (Math.random() - 0.5) * 6, status: 'pending',
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
              const moveX = isHome ? Math.min(98, posX + 4) : Math.max(2, posX - 4);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: moveX, target_y: posY + (Math.random() - 0.5) * 5, status: 'pending',
              });
            }
          }
        }
      } else if (role === 'winger') {
        // Winger: shoot if near goal, cut inside, or cross
        if (distToGoal < 25 && Math.random() < 0.5) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: Math.random() < 0.5 ? 'shoot_controlled' : 'shoot_power',
            target_x: goalX, target_y: goalY, status: 'pending',
          });
        } else if (distToGoal < 35 && Math.random() < 0.3) {
          // Cross to striker
          const strikers = teammates.filter(t => {
            const tRole = getPositionRole((t._slot_position || '').toUpperCase());
            return tRole === 'striker';
          });
          if (strikers.length > 0) {
            const st = strikers[Math.floor(Math.random() * strikers.length)];
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'pass_high',
              target_x: Number(st.pos_x ?? 50), target_y: Number(st.pos_y ?? 50),
              target_participant_id: st.id, status: 'pending',
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
            }
          }
        } else {
          // Dribble forward along wing
          const moveX = isHome ? Math.min(98, posX + 5 + Math.random() * 4) : Math.max(2, posX - 5 - Math.random() * 4);
          const cutInside = Math.random() < 0.3;
          const moveY = cutInside ? posY + (posY < 50 ? 8 : -8) : posY + (Math.random() - 0.5) * 4;
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'move',
            target_x: moveX, target_y: Math.max(2, Math.min(98, moveY)), status: 'pending',
          });
        }
      } else if (role === 'striker') {
        // Striker: shoot if close enough, dribble for 1v1, pass if blocked
        if (distToGoal < 25) {
          const shootType = distToGoal < 15 ? (Math.random() < 0.7 ? 'shoot_controlled' : 'shoot_power') : (Math.random() < 0.4 ? 'shoot_controlled' : 'shoot_power');
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: shootType,
            target_x: goalX, target_y: goalY, status: 'pending',
          });
        } else {
          // Check 1v1 situation
          const nearestOpp = opponents.reduce((best: any, opp: any) => {
            const d = Math.sqrt((posX - Number(opp.pos_x ?? 50)) ** 2 + (posY - Number(opp.pos_y ?? 50)) ** 2);
            return d < (best?.dist ?? 999) ? { opp, dist: d } : best;
          }, null as any);

          if (nearestOpp && nearestOpp.dist > 8 && Math.random() < 0.5) {
            // Dribble toward goal
            const moveX = isHome ? Math.min(98, posX + 7 + Math.random() * 5) : Math.max(2, posX - 7 - Math.random() * 5);
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: 'move',
              target_x: moveX, target_y: posY + (Math.random() - 0.5) * 6, status: 'pending',
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
              const moveX = isHome ? Math.min(98, posX + 6) : Math.max(2, posX - 6);
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: 'move',
                target_x: moveX, target_y: posY + (Math.random() - 0.5) * 5, status: 'pending',
              });
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

      if (distToBall < 10 && clubChasers < 2) {
        // Close enough and can chase: try to dominate
        looseBallChasersByClub.set(bot.club_id, clubChasers + 1);
        if (distToBall < 8) {
          actions.push({
            match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
            controlled_by_type: 'bot', action_type: 'receive',
            target_x: ballPos.x, target_y: ballPos.y, status: 'pending',
          });
        } else {
          // Move toward ball
          const targetX = posX + (ballPos.x - posX) * 0.5;
          const targetY = posY + (ballPos.y - posY) * 0.5;
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

        // ── GK: actively try to save if ball is coming toward goal ──
        if (isGK) {
          // Check if ball holder has a shot or pass action heading toward goal
          // GK positions between ball and goal, and if close enough, submits receive
          const ownGoalX = isHome ? 0 : 100;
          const ballToGoalDist = Math.abs(ballPos.x - ownGoalX);
          
          if (ballToGoalDist < 40 && bhDist < maxMoveRange + 5) {
            // Ball is near our goal — try to intercept
            // Position on the ball trajectory toward goal
            const interceptX = isHome ? Math.max(2, Math.min(18, ballPos.x * 0.3)) : Math.max(82, Math.min(98, 100 - (100 - ballPos.x) * 0.3));
            const interceptY = Math.max(25, Math.min(75, ballPos.y));
            const distToIntercept = Math.sqrt((posX - interceptX) ** 2 + (posY - interceptY) ** 2);
            
            if (distToIntercept <= maxMoveRange) {
              // Can reach — GK prefers block (espalmar) 70% for shoots, receive (agarrar) 30%
              const gkActionType = (bhActionType && isShootType(bhActionType) && Math.random() < 0.7) ? 'block' : 'receive';
              actions.push({
                match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
                controlled_by_type: 'bot', action_type: gkActionType,
                target_x: interceptX, target_y: interceptY, status: 'pending',
              });
            } else {
              // Move toward best defensive position
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
        } else if (role === 'centerBack' || role === 'fullBack') {
          // ── Defenders: tackle if close, otherwise mark attackers ──
          if (bhDist <= maxMoveRange) {
            // Close enough to tackle — use block for shoots or early zone of high passes, receive otherwise
            const defActionType = (bhActionType && (isShootType(bhActionType) || ((bhActionType === 'pass_high' || bhActionType === 'pass_launch') && bhDist < 8))) ? 'block' : 'receive';
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: defActionType,
              target_x: ballPos.x, target_y: ballPos.y, status: 'pending',
            });
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
          // ── Midfielders: press if close, tackle if very close ──
          if (bhDist <= maxMoveRange) {
            // Very close — use block for shoots or early zone of high passes, receive otherwise
            const midActionType = (bhActionType && (isShootType(bhActionType) || ((bhActionType === 'pass_high' || bhActionType === 'pass_launch') && bhDist < 8))) ? 'block' : 'receive';
            actions.push({
              match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
              controlled_by_type: 'bot', action_type: midActionType,
              target_x: ballPos.x, target_y: ballPos.y, status: 'pending',
            });
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
      if (isGK) {
        // GK stays back
        const target = computeTacticalTarget(bot, role, ballPos, isHome, true, false, formation, slotIndex);
        actions.push({
          match_id: matchId, match_turn_id: turnId, participant_id: bot.id,
          controlled_by_type: 'bot', action_type: 'move',
          target_x: target.x, target_y: target.y, status: 'pending',
        });
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
            const wallDist = 8; // ~8 units from ball (10-yard rule in scaled coords)
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
          const distToCenter = Math.sqrt((target.x - 50) ** 2 + (target.y - 50) ** 2);
          if (distToCenter < 12) { // center circle radius ~12 units
            // Push outside the circle
            const angle = Math.atan2(target.y - 50, target.x - 50);
            target.x = 50 + Math.cos(angle) * 13;
            target.y = 50 + Math.sin(angle) * 13;
            // Re-enforce half constraint
            if (isHome) target.x = Math.min(target.x, 49);
            else target.x = Math.max(target.x, 51);
          }
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
  for (const action of actions) {
    if ((action.action_type === 'move' || action.action_type === 'receive' || action.action_type === 'block') && action.target_x != null && action.target_y != null) {
      const bot = botsToAct.find(b => b.id === action.participant_id);
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
): DeviationResult {
  const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

  let difficultyMultiplier: number;
  let skillFactor: number;
  let minRandomDeviation: number;

  switch (actionType) {
    case 'pass_low': {
      // Short (<15): ~1u | Medium (20-30): 5-11u | Long (50): ~20u
      difficultyMultiplier = 25;
      skillFactor = normalizeAttr(attrs.passe_baixo ?? 40);
      minRandomDeviation = dist < 15 ? 0.5 : dist < 30 ? 3.0 + (dist / 50) * 6.0 : 6.0 + (dist / 50) * 10.0;
      break;
    }
    case 'pass_high':
      // dist=25: 8-15u | dist=35: 10-18u | dist=50: 15-25u
      difficultyMultiplier = 40;
      skillFactor = normalizeAttr(attrs.passe_alto ?? 40);
      minRandomDeviation = 4.0 + (dist / 50) * 8.0;
      break;
    case 'pass_launch':
      // dist=30: 10-18u | dist=50: 18-30u | dist=70: 30-50u
      difficultyMultiplier = 35;
      skillFactor = (normalizeAttr(attrs.passe_baixo ?? 40) + normalizeAttr(attrs.passe_alto ?? 40)) / 2;
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
  const angle = Math.random() * 2 * Math.PI;
  let actualX = targetX + Math.cos(angle) * deviationRadius;
  let actualY = targetY + Math.sin(angle) * deviationRadius;

  // For shoot_power: if deviation is large, ball goes over the goal
  let overGoal = false;
  if (actionType === 'shoot_power' && deviationRadius > 1.0) {
    if (actualY >= 38 && actualY <= 62) {
      actualY = Math.random() > 0.5 ? 35 - Math.random() * 5 : 65 + Math.random() * 5;
      overGoal = true;
    }
  }

  const deviationDist = Math.sqrt((actualX - targetX) ** 2 + (actualY - targetY) ** 2);

  console.log(`[ENGINE] Deviation: intended=(${targetX.toFixed(1)},${targetY.toFixed(1)}) actual=(${actualX.toFixed(1)},${actualY.toFixed(1)}) deviation=${deviationDist.toFixed(2)} skill=${skillFactor.toFixed(2)} distFactor=${distFactor.toFixed(2)} minRandom=${minRandomDeviation.toFixed(2)} overGoal=${overGoal}`);

  return { actualX, actualY, deviationDist, overGoal };
}

// ─── Height-based interception zones ─────────────────────────────
function getInterceptableRanges(actionType: string, interceptActionType?: string): Array<[number, number]> {
  // Block actions have different interceptable zones than receive
  if (interceptActionType === 'block') {
    switch (actionType) {
      case 'shoot_controlled':
      case 'shoot_power':
      case 'shoot':
        return [[0, 1]]; // entire trajectory is blockable for shoots
      case 'pass_high':
      case 'pass_launch':
        return [[0, 0.2]]; // block-only zone at start of high passes
      case 'pass_low':
        return []; // no block needed for pass_low (use receive instead)
      default:
        return [];
    }
  }
  // Receive actions (default)
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

function isBlockType(t: string): boolean { return t === 'block'; }

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
    const isGK = interceptorRoleType === 'GK';
    if (isGK) {
      return { type: 'block', baseChance: 0.50, defenderRole: 'goalkeeper' };
    }
    return { type: 'block', baseChance: 0.30, defenderRole: 'outfield' };
  }

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
  ballHeightZone?: 'green' | 'yellow' | 'red',
  defenderHeight?: string,
  ballActionType?: string,
): { success: boolean; chance: number; foul: boolean; card?: 'yellow' } {
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
    case 'block':
      if (context.defenderRole === 'goalkeeper') {
        // GK espalmar: easier than agarrar
        attackerSkill = (normalizeAttr(attackerAttrs.acuracia_chute ?? 40) + normalizeAttr(attackerAttrs.forca_chute ?? 40)) / 2;
        defenderSkill = (normalizeAttr(defenderAttrs.reflexo ?? 40) + normalizeAttr(defenderAttrs.posicionamento_gol ?? 40) + normalizeAttr(defenderAttrs.pegada ?? 40)) / 3;
      } else {
        // Outfield block: much harder
        attackerSkill = isShootType(ballActionType || '')
          ? (normalizeAttr(attackerAttrs.forca_chute ?? 40) + normalizeAttr(attackerAttrs.acuracia_chute ?? 40)) / 2
          : (normalizeAttr(attackerAttrs.passe_alto ?? 40) + normalizeAttr(attackerAttrs.passe_baixo ?? 40)) / 2;
        defenderSkill = (normalizeAttr(defenderAttrs.antecipacao ?? 40) + normalizeAttr(defenderAttrs.coragem ?? 40) + normalizeAttr(defenderAttrs.posicionamento_defensivo ?? 40)) / 3;
      }
      break;
  }

  let successChance = context.baseChance * (0.5 + defenderSkill * 0.5) * (1 - attackerSkill * 0.3);

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

function resolveAction(action: string, _attacker: any, _defender: any, allActions: any[], participants: any[], possClubId: string, attrByProfile: Record<string, any>, playerProfilesMap?: Record<string, any>, turnNumber?: number): {
  success: boolean; event: string; description: string;
  possession_change: boolean; goal: boolean;
  newBallHolderId?: string; newPossessionClubId?: string;
  looseBallPos?: { x: number; y: number };
  failedContestParticipantId?: string;
  failedContestLog?: string;
  foul?: boolean;
  foulPosition?: { x: number; y: number };
  card?: 'yellow';
} {
  const getFullAttrs = (participant: any) => {
    const raw = participant?.player_profile_id ? attrByProfile[participant.player_profile_id] : null;
    const result: Record<string, number> = {};
    const keys = ['drible','controle_bola','forca','agilidade','desarme','marcacao','antecipacao',
      'passe_baixo','passe_alto','visao_jogo','tomada_decisao','um_toque','acuracia_chute',
      'forca_chute','curva','coragem','reflexo','posicionamento_gol','um_contra_um','tempo_reacao',
      'cabeceio','pulo','defesa_aerea','posicionamento_defensivo','pegada'];
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
  const interceptors = findInterceptorCandidates(allActions, _attacker, participants, turnNumber, attrByProfile);

  for (const candidate of interceptors) {
    const defAttrs = getFullAttrs(candidate.participant);
    const slotPos = candidate.participant.slot_position || candidate.participant._slot_position || candidate.participant.field_pos || '';
    const isGK = slotPos === 'GK';
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
    const defHeight = getPlayerHeight(candidate.participant);
    const { success, chance, foul, card } = computeInterceptSuccess(context, bhAttrs, defAttrs, ballHeightZone, defHeight, bhActionType);
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
        return { success: false, event: 'saved', description: `🧤 Defesa do goleiro! (${chancePct})`, possession_change: true, goal: false, newBallHolderId: candidate.participant.id, newPossessionClubId: candidate.participant.club_id };
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
    else if (context.type === 'gk_save') console.log(`[ENGINE] 🧤 Goleiro não segurou! (${chancePct})`);
    else console.log(`[ENGINE] ❌ Falhou o domínio! (${chancePct}) Bola continua.`);
  }

  if (isShootType(action)) return { success: true, event: 'goal', description: '⚽ GOL!', possession_change: false, goal: true };
  if (isPassType(action)) return { success: true, event: 'pass_complete', description: '✅ Passe completo', possession_change: false, goal: false };
  if (action === 'move') return { success: true, event: 'move', description: '🔄 Condução', possession_change: false, goal: false };
  return { success: true, event: 'no_action', description: '🔄 Sem ação', possession_change: false, goal: false };
}

function findInterceptorCandidates(allActions: any[], ballHolderAction: any, participants: any[], turnNumber?: number, attrByProfile?: Record<string, any>): Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> {
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
    isShootType(bhActionType) ? (bhActionType === 'shoot_power' ? 0.3 : 0.5) :
    (bhActionType === 'pass_high' || bhActionType === 'pass_launch') ? 0.65 :
    1.0; // pass_low = normal speed

  const interceptors: Array<{ participant: any; progress: number; interceptX: number; interceptY: number }> = [];
  for (const a of allActions) {
    if (a.participant_id === ballHolderAction.participant_id) continue;
    if ((a.action_type !== 'receive' && a.action_type !== 'block') || a.target_x == null || a.target_y == null) continue;
    const actionParticipant = participants.find((p: any) => p.id === a.participant_id);
    if (actionParticipant?.is_sent_off) continue;

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
      // Use per-action interceptable ranges (block vs receive have different zones)
      const interceptableRanges = getInterceptableRanges(bhActionType, a.action_type);
      const isInInterceptableZone = interceptableRanges.some(([lo, hi]) => t >= lo && t <= hi);
      if (isInInterceptableZone) {
        // ── Physical reach validation ──
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
          const adjustedMaxRange = maxRange * ballSpeedFactor;
          const posX = Number(interceptor.pos_x ?? 50);
          const posY = Number(interceptor.pos_y ?? 50);
          const distToIntercept = Math.sqrt((posX - cx) ** 2 + (posY - cy) ** 2);
          if (distToIntercept > adjustedMaxRange) {
            console.log(`[ENGINE] Intercept rejected: player ${interceptor.id} distToIntercept=${distToIntercept.toFixed(1)} > adjustedMaxRange=${adjustedMaxRange.toFixed(1)} (ballSpeed=${ballSpeedFactor})`);
            continue;
          }
        }
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

function findLooseBallClaimer(allActions: any[], participants: any[], attrByProfile?: Record<string, any>, turnNumber?: number): any | null {
  const receiveActions = allActions.filter((a) => (a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null);
  const ranked: Array<{ participant: any; distance: number; createdAt: number }> = [];

  for (const action of receiveActions) {
    const participant = participants.find((p: any) => p.id === action.participant_id);
    if (!participant) continue;

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

  const getSlotPos = (p: any): string => String(slotMap.get(p.lineup_slot_id) || p._slot_position || '');
  const getPlayerFinalPos = (p: any) => {
    const moveAct = allActions.find((ac: any) => ac.participant_id === p.id && (ac.action_type === 'move' || ac.action_type === 'receive' || ac.action_type === 'block'));
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
  match: { home_club_id: string; away_club_id: string },
): boolean {
  if (!receiverParticipant || !passerParticipant) return false;
  if (receiverParticipant.club_id !== possClubId) return false;
  const isHomeAttacking = possClubId === match.home_club_id;
  const receiverX = Number(receiverParticipant.pos_x ?? 50);
  const passerX = Number(passerParticipant.pos_x ?? 50);
  if (isHomeAttacking && receiverX <= passerX) return false;
  if (!isHomeAttacking && receiverX >= passerX) return false;
  if (isHomeAttacking && receiverX < 50) return false;
  if (!isHomeAttacking && receiverX > 50) return false;
  const defenders = participants.filter(p => p.club_id !== possClubId && p.role_type === 'player');
  const sortedX = isHomeAttacking
    ? defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => b - a)
    : defenders.map(d => Number(d.pos_x ?? 50)).sort((a, b) => a - b);
  if (sortedX.length < 2) return false;
  const penultimateX = sortedX[1];
  const isOffside = isHomeAttacking ? receiverX > penultimateX : receiverX < penultimateX;
  if (isOffside) console.log(`[ENGINE] 🚩 OFFSIDE! receiverX=${receiverX.toFixed(1)} penultimateDefX=${penultimateX.toFixed(1)} passerX=${passerX.toFixed(1)}`);
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
    }).eq('id', m.id).eq('status', 'scheduled').lte('scheduled_at', now).select('id').maybeSingle();

    if (!claimedMatch) {
      continue;
    }

    const { data: existingParts } = await supabase
      .from('match_participants')
      .select('id, club_id, role_type, lineup_slot_id, player_profile_id, pos_x, pos_y')
      .eq('match_id', m.id)
      .eq('role_type', 'player');

    const homeParts = (existingParts || []).filter((p: any) => p.club_id === m.home_club_id);
    const awayParts = (existingParts || []).filter((p: any) => p.club_id === m.away_club_id);
    const isTestMatch = !m.home_lineup_id && !m.away_lineup_id;

    if (!isTestMatch) {
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

        // First pass: match players to formation positions by their actual position
        for (const p of parts) {
          const playerPos = (p.lineup_slot_id && slotPosMap.get(p.lineup_slot_id))
            || (p.player_profile_id && profilePosMap.get(p.player_profile_id))
            || '';
          const normalizedPos = playerPos.replace(/[0-9]/g, '').toUpperCase(); // CB2 → CB

          // Find best matching formation position
          let bestIdx = -1;
          for (let i = 0; i < positions.length; i++) {
            if (usedPositionIndices.has(i)) continue;
            if (positions[i].pos.toUpperCase() === normalizedPos) {
              bestIdx = i;
              break;
            }
          }

          if (bestIdx >= 0) {
            usedPositionIndices.add(bestIdx);
            updates.push(
              supabase.from('match_participants').update({ pos_x: positions[bestIdx].x, pos_y: positions[bestIdx].y }).eq('id', p.id)
            );
          }
        }

        // Second pass: assign remaining players to unused positions (by index)
        for (const p of parts) {
          const alreadyAssigned = updates.some((u: any) => false); // check via usedPositionIndices
          const playerPos = (p.lineup_slot_id && slotPosMap.get(p.lineup_slot_id))
            || (p.player_profile_id && profilePosMap.get(p.player_profile_id))
            || '';
          const normalizedPos = playerPos.replace(/[0-9]/g, '').toUpperCase();

          // Check if this player was already matched
          let wasMatched = false;
          for (let i = 0; i < positions.length; i++) {
            if (usedPositionIndices.has(i) && positions[i].pos.toUpperCase() === normalizedPos) {
              wasMatched = true;
              break;
            }
          }
          if (wasMatched) continue;

          // Find first unused position
          for (let i = 0; i < positions.length; i++) {
            if (!usedPositionIndices.has(i)) {
              usedPositionIndices.add(i);
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

  // ── Tick-level cache: avoid reloading the same data multiple times ──
  const tickCache: TickCache = {};

  // ── POSITIONING PHASES ──
  if (isPositioningPhase(activeTurn.phase)) {
    const { data: rawParticipants } = await supabase
      .from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player');
    const participants = await enrichParticipantsWithSlotPosition(supabase, rawParticipants || []);

    const possClubId = activeTurn.possession_club_id;
    const isAttackPhase = activeTurn.phase === 'positioning_attack';

    // Load actions for this phase turn
    const { data: rawActions } = await supabase
      .from('match_actions').select('*')
      .eq('match_turn_id', activeTurn.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

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
    const submittedParticipantIds = new Set<string>((await supabase.from('match_actions').select('participant_id').eq('match_turn_id', activeTurn.id).eq('status', 'pending')).data?.map((row: any) => row.participant_id) || []);
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
    );

    const bh = bhId ? (participants || []).find((p: any) => p.id === bhId) : null;
    const isKickoff = bh && Math.abs(Number(bh.pos_x ?? 50) - 50) < 5 && Math.abs(Number(bh.pos_y ?? 50) - 50) < 5;

    // Apply move actions (batched)
    const positioningUpdates: Promise<any>[] = [];
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

      // GK constraint: keep goalkeeper inside the box
      const partSlotPos = part._slot_position || part.slot_position || '';
      const partIsGK = partSlotPos === 'GK';
      if (partIsGK) {
        const isHome = part.club_id === match.home_club_id;
        if (isHome) {
          targetX = Math.min(targetX, 18);
          targetY = Math.max(20, Math.min(80, targetY));
        } else {
          targetX = Math.max(targetX, 82);
          targetY = Math.max(20, Math.min(80, targetY));
        }
      }

      // Kickoff half-field constraint
      if (isKickoff) {
        const isHome = part.club_id === match.home_club_id;
        if (isHome) targetX = Math.min(targetX, 49);
        else targetX = Math.max(targetX, 51);
      }

      // Clamp to field
      targetX = Math.max(1, Math.min(99, targetX));
      targetY = Math.max(1, Math.min(99, targetY));

      positioningUpdates.push(
        supabase.from('match_participants').update({
          pos_x: targetX, pos_y: targetY,
        }).eq('id', part.id)
      );

      console.log(`[ENGINE] Positioning move: ${part.id.slice(0,8)} → (${targetX.toFixed(1)},${targetY.toFixed(1)})`);
    }
    if (positioningUpdates.length > 0) await Promise.all(positioningUpdates);

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
        set_piece_type: activeTurn.set_piece_type ?? null,
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
        set_piece_type: activeTurn.set_piece_type ?? null,
      });

      await supabase.from('match_event_logs').insert({
        match_id, event_type: 'positioning',
        title: '📍 Posicionamento concluído',
        body: 'A partida continua!',
      });
    }

    return { status: 'advanced' };
  }

  const { data: rawParticipants2 } = await supabase
    .from('match_participants').select('*').eq('match_id', match_id).eq('role_type', 'player');
  const participants = await enrichParticipantsWithSlotPosition(supabase, rawParticipants2 || []);

  const possClubId = activeTurn.possession_club_id;
  const possPlayers = (participants || []).filter(p => p.club_id === possClubId);
  const defPlayers = (participants || []).filter(p => p.club_id !== possClubId);

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

  if (activeTurn.phase !== 'resolution') {
    const submittedParticipantIds = new Set<string>((await supabase.from('match_actions').select('participant_id').eq('match_turn_id', activeTurn.id).eq('status', 'pending')).data?.map((row: any) => row.participant_id) || []);
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

  if (activeTurn.phase === 'resolution') {
    console.log(`[ENGINE] Resolution phase: turn=${match.current_turn_number} ballHolder=${activeTurn.ball_holder_participant_id?.slice(0,8) ?? 'NONE'} possession=${possClubId?.slice(0,8) ?? 'NONE'}`);
    const { data: turnRows } = await supabase
      .from('match_turns')
      .select('id, phase')
      .eq('match_id', match_id)
      .eq('turn_number', activeTurn.turn_number);

    const allTurnIds = (turnRows || []).map((t: any) => t.id);

    // ── Bot AI fallback: generate actions for inactive players ──
    {
      const { data: existingActions } = await supabase
        .from('match_actions').select('participant_id, match_turn_id').in('match_turn_id', allTurnIds).eq('status', 'pending');
      const submittedIds = new Set<string>((existingActions || []).map((a: any) => a.participant_id));
      const turnPhaseMap = new Map((turnRows || []).map((t: any) => [t.id, t.phase]));

      // Generate bot actions for each phase that had a turn
      for (const turnRow of (turnRows || [])) {
        await generateBotActions(
          supabase, match_id, turnRow.id, participants || [],
          submittedIds, activeTurn.ball_holder_participant_id,
          possClubId, isLooseBall, turnRow.phase, match,
          tickCache, activeTurn.set_piece_type,
        );
      }
    }

    const { data: rawActions } = await supabase
      .from('match_actions').select('*').in('match_turn_id', allTurnIds).eq('status', 'pending')
      .order('created_at', { ascending: false });

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
        const isBallAction = isPassType(a.action_type) || isShootType(a.action_type);
        const isMoveAction = a.action_type === 'move';
        if (existing) {
          const hasBallAction = existing.types.some(t => isPassType(t) || isShootType(t));
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
    const resolutionMoveUpdates: Promise<any>[] = [];
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
        const maxRange = computeMaxMoveRange(attrs, match.current_turn_number ?? 1);
        const dx = finalX - startX;
        const dy = finalY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRange) {
          const scale = maxRange / dist;
          finalX = startX + dx * scale;
          finalY = startY + dy * scale;
        }

        console.log(`[ENGINE] Player ${a.participant_id.slice(0,8)} ${a.action_type}: (${startX.toFixed(1)},${startY.toFixed(1)}) → (${finalX.toFixed(1)},${finalY.toFixed(1)}) dist=${dist.toFixed(1)} maxRange=${maxRange.toFixed(1)} | vel=${attrs.velocidade} accel=${attrs.aceleracao} agil=${attrs.agilidade} stam=${attrs.stamina} forca=${attrs.forca}`);

        resolutionMoveUpdates.push(
          supabase.from('match_participants').update({
            pos_x: finalX,
            pos_y: finalY,
          }).eq('id', a.participant_id)
        );
      }
    }
    if (resolutionMoveUpdates.length > 0) await Promise.all(resolutionMoveUpdates);

    if (ballHolder) {
      // Find the ball holder's BALL action (pass/shoot preferred, fallback to move)
      const ballHolderAction = allActions
        .find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)))
        || allActions.find(a => a.participant_id === ballHolder.id && a.action_type === 'move');

      if (ballHolderAction) {
        const result = resolveAction(ballHolderAction.action_type, ballHolderAction, null, allActions, participants || [], possClubId || '', attrByProfile, undefined, match.current_turn_number ?? 1);

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
            await supabase.from('match_event_logs').insert({
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
          await supabase.from('match_event_logs').insert({
            match_id, event_type: result.event || 'blocked',
            title: result.description,
            body: `Bola espirrou para (${result.looseBallPos.x.toFixed(0)},${result.looseBallPos.y.toFixed(0)})`,
          });
        } else if (result.newBallHolderId) {
          nextBallHolderParticipantId = result.newBallHolderId;
          newPossessionClubId = result.newPossessionClubId || possClubId;

          const resolvedEventType = result.possession_change ? 'possession_change' : (result.event === 'tackle' ? 'tackle' : 'pass_complete');
          const resolvedPayload: Record<string, any> = {};
          if (resolvedEventType === 'tackle') {
            resolvedPayload.tackler_participant_id = result.newBallHolderId;
            resolvedPayload.tackled_participant_id = ballHolder.id;
          }
          await supabase.from('match_event_logs').insert({
            match_id, event_type: resolvedEventType,
            title: result.possession_change ? `🔄 Troca de posse` : result.description,
            body: result.description,
            ...(Object.keys(resolvedPayload).length > 0 ? { payload: resolvedPayload } : {}),
          });
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
            await supabase.from('match_participants').update({ pos_x: penaltyX, pos_y: penaltyY }).eq('id', ballHolder.id);
            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'penalty', title: '🟥 PÊNALTI!', body: 'Falta dentro da área! Pênalti marcado.',
              payload: {
                fouler_participant_id: result.failedContestParticipantId,
                fouled_participant_id: ballHolder.id,
              },
            });
            nextSetPieceType = 'penalty';
            ballEndPos = { x: penaltyX, y: penaltyY };
          } else {
            nextBallHolderParticipantId = ballHolder.id;
            await supabase.from('match_participants').update({ pos_x: foulX, pos_y: foulY }).eq('id', ballHolder.id);
            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'foul', title: result.description, body: 'Falta cometida! Tiro livre para o time atacante.',
              payload: {
                fouler_participant_id: result.failedContestParticipantId,
                fouled_participant_id: ballHolder.id,
              },
            });
            nextSetPieceType = 'free_kick';
            ballEndPos = { x: foulX, y: foulY };
          }
          if (result.failedContestLog) {
            await supabase.from('match_event_logs').insert({
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
            await supabase.from('match_event_logs').insert({
              match_id, event_type: 'yellow_card',
              title: '🟨 Cartão Amarelo!',
              body: `${foulerName} recebeu cartão amarelo.`,
              payload: { player_participant_id: result.failedContestParticipantId, player_name: foulerName },
            });
            if (newYellows >= 2) {
              await supabase.from('match_event_logs').insert({
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
              const failMoveAct = allActions.find((a: any) => a.participant_id === failedPart.id && (a.action_type === 'move' || a.action_type === 'receive' || a.action_type === 'block') && a.target_x != null && a.target_y != null);
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
          // RULE: Only players who explicitly did 'receive' can get possession.
          // If nobody did receive on the ball trajectory, it's a loose ball.
          const receiversOnTrajectory = allActions.filter((a: any) =>
            a.participant_id !== ballHolder.id &&
            a.action_type === 'receive' &&
            a.target_x != null && a.target_y != null
          );

          if (receiversOnTrajectory.length > 0) {
            // Find the receiver closest to the pass destination
            let bestDist = Infinity;
            let bestId: string | null = null;
            for (const rcv of receiversOnTrajectory) {
              const dist = Math.sqrt(
                (Number(rcv.target_x) - ballHolderAction.target_x) ** 2 +
                (Number(rcv.target_y) - ballHolderAction.target_y) ** 2
              );
              if (dist < bestDist) { bestDist = dist; bestId = rcv.participant_id; }
            }
            if (bestId) {
              nextBallHolderParticipantId = bestId;
              const receiver = (participants || []).find((p: any) => p.id === bestId);
              if (receiver && receiver.club_id !== possClubId) {
                newPossessionClubId = receiver.club_id;
                await supabase.from('match_event_logs').insert({ match_id, event_type: 'possession_change', title: '🔄 Troca de posse', body: 'Passe interceptado!' });
              }
            } else {
              nextBallHolderParticipantId = null;
            }
          } else {
            // Nobody did receive — ball is loose
            nextBallHolderParticipantId = null;
            await supabase.from('match_event_logs').insert({ match_id, event_type: 'loose_ball', title: '⚽ Bola solta!', body: 'Ninguém dominou a bola.' });
          }
        } else if (ballHolderAction.action_type === 'move') {
          nextBallHolderParticipantId = ballHolder.id;
        }

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
            await supabase.from('match_event_logs').insert({
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

      const looseBallClaimer = findLooseBallClaimer(allActions, participants || [], attrByProfile, match.current_turn_number ?? 1);

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
          let inertiaBallX = ballEndPos ? (ballEndPos as { x: number; y: number }).x : 50;
          let inertiaBallY = ballEndPos ? (ballEndPos as { x: number; y: number }).y : 50;
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
        const bhAttrs = getAttrs(ballHolder);
        const bhMaxRange = computeMaxMoveRange(bhAttrs, match.current_turn_number ?? 1) * 0.35; // BH restricted move
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
        await supabase.from('match_participants').update({
          pos_x: bhFinalX, pos_y: bhFinalY,
        }).eq('id', ballHolder.id);
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
        const bhAction = allActions.find((a: any) => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)));
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
          ? allActions.find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type) || a.action_type === 'move'))
          : null;
        const isOverGoal = Boolean(ballAction?.payload && typeof ballAction.payload === 'object' && (ballAction.payload as any).over_goal) || doesAerialBallGoOverGoal(ballAction, Number(ballHolder?.pos_x ?? 50));
        if (!isOverGoal) {
          if (inAwayGoal) {
            if (possClubId === match.home_club_id) homeScore++; else awayScore++;
          } else {
            if (possClubId === match.away_club_id) awayScore++; else homeScore++;
          }
          const ballGoalAction = ballHolder
            ? allActions.find(a => a.participant_id === ballHolder.id && (isPassType(a.action_type) || isShootType(a.action_type)))
            : null;
          const ballGoalType = ballGoalAction && isShootType(ballGoalAction.action_type) ? 'shot'
            : (ballGoalAction && (ballGoalAction.action_type === 'pass_high' || ballGoalAction.action_type === 'pass_launch') ? 'header' : 'shot');
          const isBallGoalOwnGoal = (inAwayGoal && possClubId !== match.home_club_id && possClubId !== match.away_club_id)
            || (inHomeGoal && possClubId === match.home_club_id);
          await supabase.from('match_event_logs').insert({
            match_id, event_type: 'goal', title: `⚽ GOL! ${homeScore} – ${awayScore}`, body: `Turno ${match.current_turn_number} - Bola no fundo da rede!`,
            payload: {
              scorer_participant_id: ballHolder?.id || null,
              scorer_club_id: possClubId,
              assister_participant_id: null,
              goal_type: isBallGoalOwnGoal ? 'own_goal' : ballGoalType,
            },
          });
          newPossessionClubId = possClubId === match.home_club_id ? match.away_club_id : match.home_club_id;
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
          if (inAwayGoal) {
            if (possClubId === match.home_club_id) homeScore++; else awayScore++;
          } else {
            if (possClubId === match.away_club_id) awayScore++; else homeScore++;
          }
          await supabase.from('match_event_logs').insert({
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
        const restart = await handleSetPiece(supabase, match_id, oob, participants || [], match, allActions);
        if (restart) {
          nextBallHolderParticipantId = restart.playerId;
          newPossessionClubId = restart.clubId;
          nextSetPieceType = oob.type;
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
        set_piece_type: 'kickoff',
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

        const resetTeam = async (clubId: string, formation: string, isHome: boolean) => {
          const teamParts = (participants || []).filter((p: any) => p.club_id === clubId && p.role_type === 'player' && p.id !== nextBallHolderParticipantId);
          const positions = getFormationForFill(formation, isHome);
          const updates: Promise<any>[] = [];
          teamParts.forEach((p: any, i: number) => {
            const pos = positions[i] || { x: isHome ? 30 : 70, y: 50 };
            let x = pos.x;
            // Clamp to own half for kickoff
            x = isHome ? Math.min(x, 48) : Math.max(x, 52);
            updates.push(supabase.from('match_participants').update({ pos_x: x, pos_y: pos.y }).eq('id', p.id));
          });
          await Promise.all(updates);
        };
        await Promise.all([
          resetTeam(match.home_club_id, homeFormation, true),
          resetTeam(match.away_club_id, awayFormation, false),
        ]);
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
              payload: { one_touch_executed: true },
              status: 'pending',
            });
            console.log(`[ENGINE] One-touch auto-action: ${otPayload.next_action_type}`);
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
        payload: actionPayload || null,
      });

      return new Response(JSON.stringify({ status: 'action_submitted', server_now: Date.now() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('match-engine error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


