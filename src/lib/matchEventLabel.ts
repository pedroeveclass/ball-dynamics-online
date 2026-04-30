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
  if (!type) return event.body || '';

  const p = (event.payload as Record<string, any>) || {};

  // Common payload-derived params we expose to translation strings.
  const params: Record<string, string | number> = {
    chance: p.chance ?? '',
    next_action_type: p.next_action_type ?? '',
    turn_number: p.turn_number ?? '',
    amount: p.amount ?? '',
  };

  // 1. If the engine attached `payload.message_key`, prefer it. Lets the
  //    engine pin the exact body translation per event without relying on
  //    body-by-event_type tables. Params come from payload too.
  const explicitKey = typeof p.message_key === 'string' ? p.message_key : null;
  if (explicitKey) {
    const explicitParams = (p.message_params && typeof p.message_params === 'object')
      ? p.message_params as Record<string, string | number>
      : params;
    const translated = i18n.t(explicitKey, { ...params, ...explicitParams, defaultValue: '' });
    if (translated) return translated;
  }

  // 2. Some event_types share the same `event_type` but emit different
  //    bodies depending on payload. Resolve those to a sub-key first so
  //    each variant can carry its own translation.
  let key = `match_events:bodies.${type}`;
  if (type === 'pass_failed') {
    const reason = p.failure_reason;
    if (reason === 'offside') key = 'match_events:bodies.pass_failed_offside';
    else if (reason === 'receive_failed') key = 'match_events:bodies.pass_failed_receive';
  }

  const translated = i18n.t(key, { ...params, defaultValue: '' });
  if (translated) return translated;
  return event.body || '';
}
