// Resolve the in-app route for a notification click.
// Prefers the explicit `link` stored on the row; falls back to a type-based heuristic
// so legacy notifications (inserted before the `link` column existed) still navigate somewhere sensible.
const TYPE_FALLBACK: Record<string, string> = {
  match: '/player/matches',
  training: '/player/attributes',
  contract: '/player/contract',
  transfer: '/player/offers',
  finance: '/manager/finance',
  energy: '/player',
  league: '/league',
  system: '/notifications',
};

export function getNotificationLink(n: { link?: string | null; type?: string | null }): string {
  if (n.link && n.link.startsWith('/')) return n.link;
  if (n.type && TYPE_FALLBACK[n.type]) return TYPE_FALLBACK[n.type];
  return '/notifications';
}
