import i18n from '@/i18n';

// Render a localized title for a match event row.
// Strategy:
//   1. Look up `match_events:by_type.<event_type>` with payload-derived params.
//   2. If no key exists for this event_type, fall back to the engine-emitted
//      `event.title` (currently PT, written by match-engine-lab).
//
// This is intentionally additive — we don't change what the engine emits.
// PT users keep seeing the PT titles via the fallback even when no key exists.

export interface MatchEventLike {
  event_type?: string | null;
  title?: string | null;
  body?: string | null;
  payload?: Record<string, unknown> | null;
}

export function renderMatchEventTitle(event: MatchEventLike): string {
  const type = event.event_type;
  if (!type) return event.title || '';

  const p = (event.payload as Record<string, any>) || {};
  // Common payload-derived params we expose to translation strings.
  const params: Record<string, string | number> = {
    home: p.home_score ?? '',
    away: p.away_score ?? '',
    chance: p.chance ?? '',
    amount: p.amount ?? '',
  };

  const translated = i18n.t(`match_events:by_type.${type}`, { ...params, defaultValue: '' });
  return translated || event.title || '';
}

export function renderMatchEventBody(event: MatchEventLike): string {
  const type = event.event_type;
  if (type) {
    // For event types whose body is a fixed string (no payload params), the
    // localized version lives at `match_events:bodies.<event_type>`.
    // Highly dynamic bodies (gol de condução turno X, x/y coordinates,
    // chances, fouler names) keep their engine-emitted PT — they include
    // values we can't reconstruct safely on the client without payload
    // changes engine-side.
    const translated = i18n.t(`match_events:bodies.${type}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return event.body || '';
}
