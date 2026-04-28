import i18n from '@/i18n';

// Notification rows can carry either:
//   - new style: i18n_key + i18n_params (renders via i18next)
//   - legacy:    title + body (already PT, written by older triggers/RPCs)
// Both shapes coexist forever — the renderer transparently picks
// whichever is present.
//
// Standardized keys live in `notification_messages.json` (PT/EN).
// Each key has `.title` and `.body` subkeys; params interpolate into
// either via `{{name}}` placeholders.

export const NOTIFICATION_KEYS = {
  WELCOME: 'welcome',
  TRAINING_AVAILABLE: 'training_available',
  FORUM_COMMENT: 'forum_comment',
  AGREEMENT_PROPOSED: 'agreement_proposed',
  EXIT_REJECTED: 'exit_rejected',
  FIRED: 'fired',
  MUTUAL_EXIT_ACCEPTED: 'mutual_exit_accepted',
  STORE_GIFT: 'store_gift',
  CONTRACT_OFFER: 'contract_offer',
  CONTRACT_ACCEPTED: 'contract_accepted',
  MATCH_SCHEDULED: 'match_scheduled',
} as const;

export type NotificationKey = typeof NOTIFICATION_KEYS[keyof typeof NOTIFICATION_KEYS];

export interface RenderableNotification {
  title?: string | null;
  body?: string | null;
  i18n_key?: string | null;
  i18n_params?: Record<string, unknown> | null;
}

export function renderNotificationTitle(n: RenderableNotification): string {
  if (n.i18n_key) {
    const k = `notification_messages:${n.i18n_key}.title`;
    const v = i18n.t(k, { ...(n.i18n_params || {}), defaultValue: '' });
    if (v) return v as string;
  }
  return n.title || '';
}

export function renderNotificationBody(n: RenderableNotification): string {
  if (n.i18n_key) {
    const k = `notification_messages:${n.i18n_key}.body`;
    const v = i18n.t(k, { ...(n.i18n_params || {}), defaultValue: '' });
    if (v) return v as string;
  }
  return n.body || '';
}
