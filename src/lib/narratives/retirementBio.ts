import ptNarratives from '@/i18n/locales/pt/narratives.json';
import enNarratives from '@/i18n/locales/en/narratives.json';
import { supabase } from '@/integrations/supabase/client';

// ── Career-fact extractor for retirement bio ──
// Aggregates the player's player_match_stats + player_awards +
// narratives milestones, plus origin trait, and compiles into a single
// flat fact bundle the templates can fill.

const TRAIT_PHRASES_PT: Record<string, string> = {
  raca: 'a raça e a entrega',
  frieza: 'a frieza nos momentos decisivos',
  tecnica: 'a técnica refinada',
  lideranca: 'a liderança natural',
  irreverencia: 'a irreverência em campo',
};
const TRAIT_PHRASES_EN: Record<string, string> = {
  raca: 'grit and commitment',
  frieza: 'cool head in decisive moments',
  tecnica: 'refined technique',
  lideranca: 'natural leadership',
  irreverencia: 'on-pitch swagger',
};

interface CareerFacts {
  name: string;
  age: number;
  primaryPosition: string | null;
  primaryClub: string | null;
  clubsCount: number;
  clubsList: string[];

  careerMatches: number;
  careerGoals: number;
  careerAssists: number;
  careerCleanSheets: number;
  careerHatTricks: number;
  careerYellow: number;
  careerRed: number;

  awards: { type: string; club: string | null; metric: number; season: number | null }[];
  hasMVP: boolean;
  hasGoldenBoot: boolean;
  hasGoldenGlove: boolean;
  hasTopAssists: boolean;
  hasTopTackles: boolean;

  titles: number;
  runnerUps: number;
  relegations: number;

  originTrait: string | null;
}

export async function extractCareerFacts(playerProfileId: string): Promise<CareerFacts | null> {
  const { data: profile } = await supabase
    .from('player_profiles')
    .select('full_name, age, primary_position, club_id, origin_trait')
    .eq('id', playerProfileId)
    .maybeSingle();
  if (!profile) return null;

  // Career stats from player_match_stats
  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('club_id, goals, assists, clean_sheet, yellow_cards, red_cards')
    .eq('player_profile_id', playerProfileId);

  let careerMatches = 0;
  let careerGoals = 0;
  let careerAssists = 0;
  let careerCleanSheets = 0;
  let careerHatTricks = 0;
  let careerYellow = 0;
  let careerRed = 0;
  const clubGames = new Map<string, number>();

  for (const s of (stats ?? []) as any[]) {
    careerMatches += 1;
    careerGoals += s.goals ?? 0;
    careerAssists += s.assists ?? 0;
    if (s.clean_sheet) careerCleanSheets += 1;
    if ((s.goals ?? 0) >= 3) careerHatTricks += 1;
    careerYellow += s.yellow_cards ?? 0;
    careerRed += s.red_cards ?? 0;
    if (s.club_id) clubGames.set(s.club_id, (clubGames.get(s.club_id) ?? 0) + 1);
  }

  // Resolve clubs played for, sorted by match count desc
  const clubIds = Array.from(clubGames.keys());
  const { data: clubs } = clubIds.length > 0
    ? await supabase.from('clubs').select('id, name').in('id', clubIds)
    : { data: [] as any[] };
  const clubName = new Map<string, string>();
  for (const c of clubs ?? []) clubName.set(c.id, c.name);
  const clubsList = clubIds
    .sort((a, b) => (clubGames.get(b) ?? 0) - (clubGames.get(a) ?? 0))
    .map(id => clubName.get(id) ?? '')
    .filter(Boolean);

  // Awards
  const { data: awardsData } = await supabase
    .from('player_awards')
    .select('award_type, club_id, metric_value, season_number')
    .eq('player_profile_id', playerProfileId);
  const awards = (awardsData ?? []).map((a: any) => ({
    type: a.award_type,
    club: clubName.get(a.club_id) ?? null,
    metric: Number(a.metric_value ?? 0),
    season: a.season_number ?? null,
  }));

  // Title-related milestones from narratives
  const { data: milestones } = await supabase
    .from('narratives')
    .select('milestone_type')
    .eq('entity_type', 'player')
    .eq('entity_id', playerProfileId)
    .eq('scope', 'milestone');
  let titles = 0; let runnerUps = 0; let relegations = 0;
  for (const m of (milestones ?? []) as any[]) {
    if (m.milestone_type === 'first_title') titles += 1;
    if (m.milestone_type === 'second_title') titles += 1;
    if (m.milestone_type === 'third_title') titles += 1;
    if (m.milestone_type === 'first_runner_up') runnerUps += 1;
    if (m.milestone_type === 'first_relegation') relegations += 1;
  }

  return {
    name: (profile as any).full_name,
    age: (profile as any).age,
    primaryPosition: (profile as any).primary_position,
    primaryClub: clubsList[0] ?? null,
    clubsCount: clubsList.length,
    clubsList,
    careerMatches,
    careerGoals,
    careerAssists,
    careerCleanSheets,
    careerHatTricks,
    careerYellow,
    careerRed,
    awards,
    hasMVP: awards.some(a => a.type === 'season_mvp'),
    hasGoldenBoot: awards.some(a => a.type === 'season_top_scorer'),
    hasGoldenGlove: awards.some(a => a.type === 'season_golden_glove'),
    hasTopAssists: awards.some(a => a.type === 'season_top_assists'),
    hasTopTackles: awards.some(a => a.type === 'season_top_tackles'),
    titles,
    runnerUps,
    relegations,
    originTrait: (profile as any).origin_trait ?? null,
  };
}

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPhrases(f: CareerFacts, lang: 'pt' | 'en'): { traitPhrase: string; achievementsPhrase: string; momentsPhrase: string; clubsPhrase: string } {
  const traitMap = lang === 'pt' ? TRAIT_PHRASES_PT : TRAIT_PHRASES_EN;
  const traitPhrase = f.originTrait && traitMap[f.originTrait]
    ? traitMap[f.originTrait]
    : (lang === 'pt' ? 'a regularidade técnica' : 'technical consistency');

  const achievementsPt: string[] = [];
  const achievementsEn: string[] = [];
  if (f.titles >= 3) { achievementsPt.push(`${f.titles}× campeão`); achievementsEn.push(`${f.titles}× champion`); }
  else if (f.titles === 2) { achievementsPt.push('Bicampeão'); achievementsEn.push('Two-time champion'); }
  else if (f.titles === 1) { achievementsPt.push('Campeão da Liga'); achievementsEn.push('League champion'); }
  if (f.hasMVP) { achievementsPt.push('MVP da temporada'); achievementsEn.push('Season MVP'); }
  if (f.hasGoldenBoot) { achievementsPt.push('Chuteira de Ouro'); achievementsEn.push('Golden Boot'); }
  if (f.hasGoldenGlove) { achievementsPt.push('Luva de Ouro'); achievementsEn.push('Golden Glove'); }
  if (f.hasTopAssists) { achievementsPt.push('Líder de Assistências'); achievementsEn.push('Top Assists leader'); }
  if (f.hasTopTackles) { achievementsPt.push('Líder de Desarmes'); achievementsEn.push('Top Tackles leader'); }

  const achievementsPhrase = (lang === 'pt' ? achievementsPt : achievementsEn).length > 0
    ? (lang === 'pt' ? `Conquistou ${(achievementsPt.join(', '))}.` : `Won ${(achievementsEn.join(', '))}.`)
    : '';

  // Moments: hat-tricks
  let momentsPhrase = '';
  if (f.careerHatTricks > 0) {
    momentsPhrase = lang === 'pt'
      ? `Foram ${f.careerHatTricks} hat-trick(s) registrado(s) na carreira.`
      : `Recorded ${f.careerHatTricks} career hat-trick(s).`;
  }

  // Clubs phrase for templates that mention multiple clubs
  let clubsPhrase = '';
  if (f.clubsList.length > 1) {
    const head = f.clubsList.slice(0, -1).join(', ');
    const tail = f.clubsList[f.clubsList.length - 1];
    clubsPhrase = lang === 'pt'
      ? `Defendeu ${head}${head ? ' e ' : ''}${tail}`
      : `Played for ${head}${head ? ' and ' : ''}${tail}`;
  } else if (f.clubsList.length === 1) {
    clubsPhrase = lang === 'pt'
      ? `Defendeu o ${f.clubsList[0]}`
      : `Played for ${f.clubsList[0]}`;
  } else {
    clubsPhrase = lang === 'pt'
      ? 'Trajetória discreta como agente livre'
      : 'A discreet free-agent journey';
  }

  return { traitPhrase, achievementsPhrase, momentsPhrase, clubsPhrase };
}

function fillTemplate(t: string, vars: Record<string, string | number | null>): string {
  let out = t;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v == null ? '' : String(v));
  }
  return out.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function templatesFor(lang: 'pt' | 'en'): string[] {
  const data = (lang === 'en' ? enNarratives : ptNarratives) as any;
  const tpls = data?.originStory?.retirement_templates ?? {};
  return Object.values(tpls) as string[];
}

export function assembleRetirementBio(facts: CareerFacts, lang: 'pt' | 'en'): string {
  const tpl = pickRandom(templatesFor(lang));
  const phrases = buildPhrases(facts, lang);
  return fillTemplate(tpl, {
    name: facts.name,
    age: facts.age,
    career_matches: facts.careerMatches,
    career_goals: facts.careerGoals,
    career_assists: facts.careerAssists,
    clubs_count: facts.clubsCount,
    primary_club: facts.primaryClub ?? '',
    trait_phrase: phrases.traitPhrase,
    achievements_phrase: phrases.achievementsPhrase,
    moments_phrase: phrases.momentsPhrase,
    clubs_phrase: phrases.clubsPhrase,
  });
}

export async function buildRetirementBioBilingual(playerProfileId: string): Promise<{
  body_pt: string;
  body_en: string;
  facts: CareerFacts;
} | null> {
  const facts = await extractCareerFacts(playerProfileId);
  if (!facts) return null;
  return {
    body_pt: assembleRetirementBio(facts, 'pt'),
    body_en: assembleRetirementBio(facts, 'en'),
    facts,
  };
}
