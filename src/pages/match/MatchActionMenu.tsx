import React from 'react';
import type { Participant, MatchAction, PendingInterceptChoice, MatchData } from './types';
import { ACTION_LABELS, isShootAction, isAnyShootAction, isHeaderAction, getBallZoneAtProgress } from './constants';
import i18n from '@/i18n';

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
  activeBallHolderId?: string | null;
}

export const MatchActionMenu = React.memo(function MatchActionMenu(props: MatchActionMenuProps) {
  const {
    actions, menuPos, containerRect, showActionMenu, submittingAction,
    onSelect, participants, ballTrajectoryAction, ballTrajectoryHolder,
    pendingInterceptChoice, match, activeBallHolderId,
  } = props;

  if (actions.length === 0) return null;

  // Edge-aware positioning (Pedro 2026-05-01): default places the menu to the
  // RIGHT of the player and vertically centered. When the player is near the
  // right sideline, the menu spilled off-screen and the user couldn't read /
  // click the lower options. We measure the menu's footprint vs the field
  // container and flip horizontally / clamp vertically so the menu always fits.
  const MENU_WIDTH = 140; // matches min-w-[140px]
  const MENU_ROW_HEIGHT = 22; // px per option (approximate; py-1 + line-height)
  const menuHeightApprox = Math.max(48, actions.length * MENU_ROW_HEIGHT + 12);

  const playerLeft = menuPos.left - containerRect.left;
  const playerTop = menuPos.top - containerRect.top;

  // Default: 16px to the RIGHT of the player anchor.
  let left = playerLeft + 16;
  // If that would overflow on the right, place to the LEFT of the player anchor.
  if (left + MENU_WIDTH > containerRect.width - 8) {
    left = playerLeft - MENU_WIDTH - 16;
  }
  // Last-resort clamp so the menu never starts off-screen on the left.
  if (left < 8) left = 8;

  // Vertical anchor: -10 (slightly above the player center) then translateY(-50%)
  // means the menu's vertical center sits ~10px above the anchor. Clamp the
  // RESULT (post-translate) to keep the whole menu inside the container.
  let top = playerTop - 10;
  const halfH = menuHeightApprox / 2;
  if (top - halfH < 8) top = halfH + 8;
  if (top + halfH > containerRect.height - 8) top = containerRect.height - halfH - 8;

  const menuPlayer = participants.find(p => p.id === showActionMenu);
  const isGK = menuPlayer?.field_pos === 'GK' || menuPlayer?.slot_position === 'GK' || menuPlayer?.pickup_slot_id === 'GK';
  const isBH = activeBallHolderId === showActionMenu;
  const isGKBH = isGK && isBH;

  // Determine intercept zone for label context
  const pic = pendingInterceptChoice;
  const interceptZone = (pic?.participantId === showActionMenu && pic?.trajectoryActionType)
    ? getBallZoneAtProgress(pic.trajectoryActionType, pic.trajectoryProgress ?? 0.5)
    : 'green';

  return (
    <div
      className="absolute z-50 bg-[hsl(45,30%,90%)] border border-[hsl(45,20%,60%)] rounded shadow-lg py-1 min-w-[140px]"
      style={{ left, top, transform: 'translateY(-50%)' }}
    >
      {actions.map(a => {
        let label = ACTION_LABELS[a] || a;
        let icon = '';

        // ── Base icons ──
        if (a === 'move') icon = '\u2197';
        else if (a === 'no_action') icon = '\u2298';

        // ── Pass actions ──
        else if (a === 'pass_low') { icon = '\u27A1'; if (isGKBH) label = i18n.t('match_room:actions_special.gk_pass_short'); }
        else if (a === 'pass_high') { icon = '\u2934'; if (isGKBH) label = i18n.t('match_room:actions_special.gk_pass_medium'); }
        else if (a === 'pass_launch') { icon = '\uD83D\uDE80'; if (isGKBH) label = i18n.t('match_room:actions_special.gk_pass_long'); }

        // ── Shoot actions ──
        else if (a === 'shoot_controlled') icon = '\uD83C\uDFAF';
        else if (a === 'shoot_power') icon = '\uD83D\uDCA5';

        // ── Header actions ──
        else if (a === 'header_low') icon = '\uD83E\uDD1D\u27A1';
        else if (a === 'header_high') icon = '\uD83E\uDD1D\u2934';
        else if (a === 'header_controlled') icon = '\uD83E\uDD1D\uD83C\uDFAF';
        else if (a === 'header_power') icon = '\uD83E\uDD1D\uD83D\uDCA5';

        // ── Block (GK: Espalmar / outfield: Bloquear) ──
        else if (a === 'block') {
          if (isGK) { label = i18n.t('match_room:actions_special.gk_block'); icon = '\uD83E\uDDE4'; }
          else { label = i18n.t('match_room:actions.block'); icon = '\uD83D\uDEE1\uFE0F'; }
        }

        // ── Receive (context-dependent label) ──
        else if (a === 'receive') {
          icon = '\uD83E\uDD32';
          const bhAction = ballTrajectoryAction;
          const bhPlayer = ballTrajectoryHolder;
          if (bhAction && bhPlayer && menuPlayer) {
            const isOpponent = menuPlayer.club_id !== bhPlayer.club_id;
            if (bhAction.action_type === 'move' && isOpponent) {
              label = i18n.t('match_room:actions_special.tackle'); icon = '\uD83E\uDDB5';
            } else if (isAnyShootAction(bhAction.action_type) && isGK) {
              label = i18n.t('match_room:actions_special.gk_catch'); icon = '\uD83E\uDDE4';
            }
          }
        }
        // ── Receive hard (Carrinho) — aggressive tackle variant ──
        else if (a === 'receive_hard') {
          label = i18n.t('match_room:actions_special.tackle');
          icon = '\uD83E\uDDB5\uD83D\uDCA5'; // 🦵💥
        }

        // ── One-touch suffix (1a) ──
        const isOneTouchOption = pic?.participantId === showActionMenu &&
          (a === 'pass_low' || a === 'pass_high' || a === 'pass_launch' || a === 'shoot_controlled' || a === 'shoot_power' ||
           a === 'header_low' || a === 'header_high' || a === 'header_controlled' || a === 'header_power');
        if (isOneTouchOption) {
          label = `${label} ${i18n.t('match_room:actions_special.one_touch_suffix')}`;
          icon = `\u26A1${icon}`;
        }

        // Keyboard shortcut hint — matches the hotkeys in MatchRoomPage.
        const SHORTCUT_MAP: Record<string, string> = {
          pass_low: 'Q', pass_high: 'W', pass_launch: 'E',
          shoot_controlled: 'R', shoot_power: 'T',
          header_low: 'A', header_high: 'S',
          header_controlled: 'D', header_power: 'F',
          move: 'X', receive: 'C', receive_hard: 'V', block: 'B',
          no_action: 'Z',
        };
        const shortcut = SHORTCUT_MAP[a];

        return (
          <button
            key={a}
            onClick={() => onSelect(a, showActionMenu)}
            className="w-full text-left px-3 py-1 text-xs font-display font-bold text-[hsl(220,20%,20%)] hover:bg-[hsl(45,30%,80%)] transition-colors flex items-center gap-2"
          >
            <span className="text-[10px]">{icon}</span>
            <span className="flex-1">{label}</span>
            {shortcut && (
              <span className="text-[9px] font-mono text-[hsl(220,20%,45%)] tabular-nums">
                {shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
