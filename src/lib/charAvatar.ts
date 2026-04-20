// ════════════════════════════════════════════════════════════
// Resolver for "character as profile photo".
//
// `profiles.avatar_char_ref` stores either "player:<uuid>" or
// "manager:<uuid>". This module turns that reference into the
// bits <PlayerAvatar variant="face" /> needs to render:
//   - appearance (from player_profiles.appearance, or seeded by
//     manager_profiles.id if the character is a manager)
//   - club primary/secondary colors (if the character has a club)
//   - a display name (fallback)
//
// Results are cached in-memory per page load so the header and
// any other `<UserAvatar>` on the screen share one fetch.
// ════════════════════════════════════════════════════════════

import { supabase } from '@/integrations/supabase/client';
import type { PlayerAppearance } from '@/lib/avatar';
import { seededAppearance } from '@/lib/avatar';

export type CharRefKind = 'player' | 'manager';

export interface ParsedCharRef {
  kind: CharRefKind;
  id: string;
}

export interface ResolvedCharAvatar {
  kind: CharRefKind;
  id: string;
  fullName: string;
  appearance: PlayerAppearance;
  clubPrimaryColor: string | null;
  clubSecondaryColor: string | null;
}

const cache = new Map<string, Promise<ResolvedCharAvatar | null>>();

export function parseCharRef(ref: string | null | undefined): ParsedCharRef | null {
  if (!ref) return null;
  const [kind, id] = ref.split(':');
  if ((kind !== 'player' && kind !== 'manager') || !id) return null;
  return { kind, id };
}

export function buildCharRef(kind: CharRefKind, id: string): string {
  return `${kind}:${id}`;
}

export function resolveCharAvatar(ref: string | null | undefined): Promise<ResolvedCharAvatar | null> {
  const parsed = parseCharRef(ref);
  if (!parsed) return Promise.resolve(null);
  const key = `${parsed.kind}:${parsed.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const loader = doResolve(parsed);
  cache.set(key, loader);
  // If the fetch fails, drop the cache entry so a later render can retry.
  loader.catch(() => cache.delete(key));
  return loader;
}

export function invalidateCharAvatar(ref: string | null | undefined) {
  const parsed = parseCharRef(ref);
  if (!parsed) return;
  cache.delete(`${parsed.kind}:${parsed.id}`);
}

async function doResolve(parsed: ParsedCharRef): Promise<ResolvedCharAvatar | null> {
  if (parsed.kind === 'player') {
    const { data: player } = await supabase
      .from('player_profiles')
      .select('id, full_name, club_id, appearance' as any)
      .eq('id', parsed.id)
      .maybeSingle();
    if (!player) return null;
    const p = player as any;
    let primary: string | null = null;
    let secondary: string | null = null;
    if (p.club_id) {
      const { data: club } = await supabase
        .from('clubs')
        .select('primary_color, secondary_color')
        .eq('id', p.club_id)
        .maybeSingle();
      primary = (club as any)?.primary_color ?? null;
      secondary = (club as any)?.secondary_color ?? null;
    }
    return {
      kind: 'player',
      id: p.id,
      fullName: p.full_name ?? 'Jogador',
      appearance: (p.appearance as PlayerAppearance) ?? seededAppearance(p.id),
      clubPrimaryColor: primary,
      clubSecondaryColor: secondary,
    };
  }
  // Manager: no persisted appearance — derived from id via seededAppearance().
  const { data: mgr } = await supabase
    .from('manager_profiles')
    .select('id, full_name')
    .eq('id', parsed.id)
    .maybeSingle();
  if (!mgr) return null;
  const m = mgr as any;
  // Manager may own a club — pull its colors so the avatar matches the rest
  // of the UI.
  const { data: club } = await supabase
    .from('clubs')
    .select('primary_color, secondary_color')
    .eq('manager_profile_id', m.id)
    .maybeSingle();
  return {
    kind: 'manager',
    id: m.id,
    fullName: m.full_name ?? 'Treinador',
    appearance: seededAppearance(m.id || m.full_name || 'manager'),
    clubPrimaryColor: (club as any)?.primary_color ?? null,
    clubSecondaryColor: (club as any)?.secondary_color ?? null,
  };
}
