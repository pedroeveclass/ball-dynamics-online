import { supabase } from '@/integrations/supabase/client';

export interface ClubUniform {
  uniform_number: number;
  shirt_color: string;
  number_color: string;
  pattern: string;
  stripe_color: string;
}

// Fetch the home (1) + away (2) + goalkeeper home (3) + goalkeeper
// away (4) kits for a club. Returns a map keyed by uniform_number so
// callers pick the right one based on context.
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

// Pick the right kit for a player based on their primary position
// AND the requested kit variant (1 = home, 2 = away). For GKs the
// variant maps to uniform 3 (home GK) or 4 (away GK). For outfield
// players the variant maps to uniforms 1/2 directly. Falls back to
// uniform 1 if the requested kit isn't seeded.
export function pickUniformForPlayer(
  uniforms: Record<number, ClubUniform>,
  primaryPosition: string | null | undefined,
  kitVariant: 1 | 2 = 1,
): ClubUniform | null {
  const isGK = (primaryPosition || '').toUpperCase() === 'GK';
  if (isGK) {
    const gkNumber = kitVariant === 2 ? 4 : 3;
    return uniforms[gkNumber] || uniforms[3] || uniforms[1] || null;
  }
  return uniforms[kitVariant] || uniforms[1] || null;
}
