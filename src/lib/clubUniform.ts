import { supabase } from '@/integrations/supabase/client';

export interface ClubUniform {
  uniform_number: number;
  shirt_color: string;
  number_color: string;
  pattern: string;
  stripe_color: string;
}

// Fetch the home (1) + away (2) + goalkeeper (3) kits for a club. Returns a
// map keyed by uniform_number so callers pick the right one based on context
// (typically uniform 1 for outfield + 3 for the goalkeeper).
export async function fetchClubUniforms(clubId: string): Promise<Record<number, ClubUniform>> {
  if (!clubId) return {};
  const { data } = await supabase
    .from('club_uniforms')
    .select('uniform_number, shirt_color, number_color, pattern, stripe_color')
    .eq('club_id', clubId);
  const map: Record<number, ClubUniform> = {};
  for (const row of (data || []) as ClubUniform[]) map[row.uniform_number] = row;
  return map;
}

// Pick the right kit for a player based on their primary position.
// GK → uniform 3 (goalkeeper kit). Everyone else → uniform 1 (home kit).
export function pickUniformForPlayer(
  uniforms: Record<number, ClubUniform>,
  primaryPosition: string | null | undefined,
): ClubUniform | null {
  const isGK = (primaryPosition || '').toUpperCase() === 'GK';
  return uniforms[isGK ? 3 : 1] || uniforms[1] || null;
}
