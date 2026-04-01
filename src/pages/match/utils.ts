import { getFormationPositions } from '@/lib/formations';
import type { MatchAction, MatchData, ClubInfo, Participant, PlayerProfileSummary, LineupSlotSummary } from './types';
import { ACTION_PHASE_ORDER } from './constants';
import { DEFAULT_FORMATION } from '@/lib/formations';

export function filterEffectiveTurnActions(actions: MatchAction[], optimisticHumanActionedIds?: Set<string>): MatchAction[] {
  const humanActionedIds = new Set(optimisticHumanActionedIds || []);
  const nonOverriddenActions = actions.filter(action => action.status !== 'overridden');

  for (const action of nonOverriddenActions) {
    if (action.controlled_by_type === 'player' || action.controlled_by_type === 'manager') {
      humanActionedIds.add(action.participant_id);
    }
  }

  return nonOverriddenActions.filter(action => {
    if (action.controlled_by_type === 'bot' && humanActionedIds.has(action.participant_id)) {
      return false;
    }
    return true;
  });
}

export function dedupeAndSortTurnActions(actions: MatchAction[]): MatchAction[] {
  const priorityByController: Record<string, number> = { player: 3, manager: 2, bot: 1 };
  const dedupedByParticipantAndPhase = new Map<string, MatchAction>();

  for (const action of filterEffectiveTurnActions(actions)) {
    const key = `${action.turn_phase ?? 'unknown'}:${action.participant_id}`;
    const existing = dedupedByParticipantAndPhase.get(key);

    if (!existing) {
      dedupedByParticipantAndPhase.set(key, action);
      continue;
    }

    const existingPriority = priorityByController[existing.controlled_by_type] ?? 0;
    const nextPriority = priorityByController[action.controlled_by_type] ?? 0;
    const existingCreatedAt = new Date(existing.created_at || 0).getTime();
    const nextCreatedAt = new Date(action.created_at || 0).getTime();

    if (nextPriority > existingPriority || (nextPriority === existingPriority && nextCreatedAt >= existingCreatedAt)) {
      dedupedByParticipantAndPhase.set(key, action);
    }
  }

  return Array.from(dedupedByParticipantAndPhase.values()).sort((a, b) => {
    const phaseDiff = (ACTION_PHASE_ORDER[a.turn_phase || 'resolution'] ?? 99) - (ACTION_PHASE_ORDER[b.turn_phase || 'resolution'] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

export function buildParticipantLayout(
  parts: Participant[],
  matchData: MatchData,
  homeClub: ClubInfo | null,
  awayClub: ClubInfo | null,
  playerMap: Map<string, PlayerProfileSummary>,
  slotMap: Map<string, LineupSlotSummary>,
  matchId: string,
): Participant[] {
  // GK is ALWAYS determined by lineup slot or player primary_position.
  // No implicit/position-based fallback — every team has a GK in their lineup.

  const enriched: Participant[] = parts.map(participant => ({
    ...participant,
    player_name: participant.player_profile_id ? playerMap.get(participant.player_profile_id)?.full_name ?? undefined : undefined,
    overall: participant.player_profile_id ? playerMap.get(participant.player_profile_id)?.overall ?? undefined : undefined,
    slot_position: participant.lineup_slot_id ? slotMap.get(participant.lineup_slot_id)?.slot_position ?? undefined : undefined,
  }));

  const homeParts = enriched.filter(participant => participant.club_id === matchData.home_club_id && participant.role_type === 'player');
  const awayParts = enriched.filter(participant => participant.club_id === matchData.away_club_id && participant.role_type === 'player');
  const isTestMatch = !matchData.home_lineup_id && !matchData.away_lineup_id;
  const isKickoffStart = (matchData.current_turn_number ?? 0) <= 1;

  const explicitGoalkeeperIds = new Set(
    enriched
      .filter(participant =>
        participant.slot_position === 'GK'
        || (participant.player_profile_id && playerMap.get(participant.player_profile_id)?.primary_position === 'GK')
      )
      .map(participant => participant.id)
  );

  const isGoalkeeper = (participant: Participant) =>
    explicitGoalkeeperIds.has(participant.id);

  const assignPositions = (list: Participant[], formation: string, isHome: boolean): Participant[] => {
    const positions = getFormationPositions(formation, isHome, isKickoffStart);
    const sorted = [...list].sort((a, b) => {
      // GK ALWAYS first — highest priority, overrides sort_order
      const aIsGK = isGoalkeeper(a);
      const bIsGK = isGoalkeeper(b);
      if (aIsGK && !bIsGK) return -1;
      if (!aIsGK && bIsGK) return 1;
      // Then by sort_order
      const aSortOrder = a.lineup_slot_id ? slotMap.get(a.lineup_slot_id)?.sort_order ?? null : null;
      const bSortOrder = b.lineup_slot_id ? slotMap.get(b.lineup_slot_id)?.sort_order ?? null : null;
      if (aSortOrder != null && bSortOrder != null && aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
      if (aSortOrder != null && bSortOrder == null) return -1;
      if (aSortOrder == null && bSortOrder != null) return 1;
      return a.id.localeCompare(b.id);
    });

    return sorted.map((participant, index) => {
      let fieldX = participant.pos_x ?? positions[index]?.x ?? (isHome ? 30 : 70);
      if (isKickoffStart) fieldX = isHome ? Math.min(fieldX, 48) : Math.max(fieldX, 52);
      return {
        ...participant,
        field_x: fieldX,
        field_y: participant.pos_y ?? positions[index]?.y ?? 50,
        field_pos: isGoalkeeper(participant)
          ? 'GK'
          : participant.slot_position
          || (participant.player_profile_id ? playerMap.get(participant.player_profile_id)?.primary_position ?? undefined : undefined)
          || positions[index]?.pos
          || '?',
        jersey_number: index + 1,
      };
    });
  };

  const ensureEleven = (list: Participant[], formation: string, isHome: boolean, clubId: string): Participant[] => {
    // Cap at 11 to prevent duplicates from race conditions
    const capped = list.length > 11 ? list.slice(0, 11) : list;
    const positioned = assignPositions(capped, formation, isHome);
    if (isTestMatch) return positioned;
    const positions = getFormationPositions(formation, isHome, isKickoffStart);
    for (let index = positioned.length; index < 11; index++) {
      positioned.push({
        id: `virtual-${isHome ? 'home' : 'away'}-${index}`,
        match_id: matchId,
        player_profile_id: null,
        club_id: clubId,
        lineup_slot_id: null,
        role_type: 'player',
        is_bot: true,
        connected_user_id: null,
        pos_x: null,
        pos_y: null,
        field_x: positions[index]?.x ?? (isHome ? 30 : 70),
        field_y: positions[index]?.y ?? 50,
        field_pos: positions[index]?.pos ?? '?',
        jersey_number: index + 1,
      });
    }
    return positioned;
  };

  const homeFormation = homeClub?.formation || DEFAULT_FORMATION;
  const awayFormation = awayClub?.formation || DEFAULT_FORMATION;
  const homeWithPos = ensureEleven(homeParts, isTestMatch ? 'test-home' : homeFormation, true, matchData.home_club_id);
  const awayWithPos = ensureEleven(awayParts, isTestMatch ? 'test-away' : awayFormation, false, matchData.away_club_id);
  const managersAndSpecs = enriched.filter(participant => participant.role_type !== 'player');

  return [...homeWithPos, ...awayWithPos, ...managersAndSpecs];
}

export function buildParticipantAttrsMap(parts: Participant[], attrRows: any[]) {
  const attrsByProfile = new Map((attrRows || []).map(row => [row.player_profile_id, row]));
  const nextMap: Record<string, any> = {};

  for (const participant of parts) {
    if (!participant.player_profile_id) continue;
    const attrs = attrsByProfile.get(participant.player_profile_id);
    if (attrs) nextMap[participant.id] = attrs;
  }

  return nextMap;
}
