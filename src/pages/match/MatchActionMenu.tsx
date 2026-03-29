import React from 'react';
import type { Participant, MatchAction, PendingInterceptChoice, MatchData } from './types';
import { ACTION_LABELS, isShootAction } from './constants';

// ─── MatchActionMenu (extracted, memoized) ─────────────────────
export interface MatchActionMenuProps {
  actions: string[];
  menuPos: { left: number; top: number };
  containerRect: DOMRect;
  showActionMenu: string;
  submittingAction: boolean;
  onSelect: (actionType: string, participantId: string) => void;
  participants: Participant[];
  ballTrajectoryAction: MatchAction | null;
  ballTrajectoryHolder: Participant | null;
  pendingInterceptChoice: PendingInterceptChoice | null;
  match: MatchData;
}

export const MatchActionMenu = React.memo(function MatchActionMenu(props: MatchActionMenuProps) {
  const {
    actions, menuPos, containerRect, showActionMenu, submittingAction,
    onSelect, participants, ballTrajectoryAction, ballTrajectoryHolder,
    pendingInterceptChoice, match,
  } = props;

  if (actions.length === 0) return null;

  const left = menuPos.left - containerRect.left + 16;
  const top = menuPos.top - containerRect.top - 10;

  return (
    <div
      className="absolute z-50 bg-[hsl(45,30%,90%)] border border-[hsl(45,20%,60%)] rounded shadow-lg py-1 min-w-[140px]"
      style={{ left, top, transform: 'translateY(-50%)' }}
    >
      {actions.map(a => {
        let label = ACTION_LABELS[a];
        let icon = '';
        if (a === 'move') icon = '\u2197';
        else if (a === 'pass_low') icon = '\u27A1';
        else if (a === 'pass_high') icon = '\u2934';
        else if (a === 'pass_launch') icon = '\uD83D\uDE80';
        else if (a === 'shoot_controlled') icon = '\uD83C\uDFAF';
        else if (a === 'shoot_power') icon = '\uD83D\uDCA5';
        else if (a === 'no_action') icon = '\u2298';
        else if (a === 'block') {
          const menuPlayer = participants.find(p => p.id === showActionMenu);
          const isGK = menuPlayer?.field_pos === 'GK' || menuPlayer?.slot_position === 'GK';
          if (isGK) {
            label = 'ESPALMAR';
            icon = '\uD83E\uDDE4';
          } else {
            label = 'BLOQUEAR';
            icon = '\uD83D\uDEE1\uFE0F';
          }
        }
        else if (a === 'receive') {
          icon = '\uD83E\uDD32';
          const menuPlayer = participants.find(p => p.id === showActionMenu);
          const bhAction = ballTrajectoryAction;
          const bhPlayer = ballTrajectoryHolder;
          if (bhAction && bhPlayer && menuPlayer) {
            const isOpponent = menuPlayer.club_id !== bhPlayer.club_id;
            if (bhAction.action_type === 'move' && isOpponent) {
              label = 'DESARME';
              icon = '\uD83E\uDDB5';
            } else if (isShootAction(bhAction.action_type)) {
              // When receive appears alongside block for GK on shoots, it means "Agarrar" (catch)
              const isGK = menuPlayer.field_pos === 'GK' || menuPlayer?.slot_position === 'GK';
              if (isGK) {
                label = 'AGARRAR';
                icon = '\uD83E\uDDE4';
              }
            }
          }
        }
        const isOneTouchOption = pendingInterceptChoice?.participantId === showActionMenu &&
          (a === 'pass_low' || a === 'pass_high' || a === 'pass_launch' || a === 'shoot_controlled' || a === 'shoot_power');
        if (isOneTouchOption) {
          const baseLabel = ACTION_LABELS[a] || a;
          label = `${baseLabel} (1a)`;
          if (a === 'pass_low') icon = '\u26A1\u27A1';
          else if (a === 'pass_high') icon = '\u26A1\u2934';
          else if (a === 'pass_launch') icon = '\u26A1\uD83D\uDE80';
          else if (a === 'shoot_controlled') icon = '\u26A1\uD83C\uDFAF';
          else if (a === 'shoot_power') icon = '\u26A1\uD83D\uDCA5';
        }
        return (
          <button
            key={a}
            disabled={submittingAction}
            onClick={() => onSelect(a, showActionMenu)}
            className="w-full text-left px-3 py-1 text-xs font-display font-bold text-[hsl(220,20%,20%)] hover:bg-[hsl(45,30%,80%)] transition-colors flex items-center gap-2"
          >
            <span className="text-[10px]">{icon}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
});
