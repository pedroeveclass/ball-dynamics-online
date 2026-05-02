import ptNarratives from '@/i18n/locales/pt/narratives.json';
import enNarratives from '@/i18n/locales/en/narratives.json';

// ── Canonical keys for the 6 origin answers ──
// These strings are stored in player_profiles.origin_* columns and
// referenced by the picker to choose template fragments. Keep in sync
// with src/i18n/locales/{pt,en}/narratives.json.

export const ORIGIN_SCENE_KEYS = ['varzea', 'escolinha', 'futsal', 'rua', 'colegio'] as const;
export const ORIGIN_MENTOR_KEYS = ['pai', 'familia', 'irmao', 'idolo', 'sozinho'] as const;
export const ORIGIN_SPARK_KEYS = ['primeiro_gol', 'tv_final', 'primeira_chuteira', 'campeao_moleque', 'volta_derrota'] as const;
export const ORIGIN_OBSTACLE_KEYS = ['dinheiro', 'distancia', 'rejeicoes', 'lesao', 'familia_estudo'] as const;
export const ORIGIN_TRAIT_KEYS = ['raca', 'frieza', 'tecnica', 'lideranca', 'irreverencia'] as const;
export const ORIGIN_DREAM_KEYS = ['liga', 'selecao', 'familia', 'europa', 'idolo_clube'] as const;

export type OriginSceneKey = typeof ORIGIN_SCENE_KEYS[number];
export type OriginMentorKey = typeof ORIGIN_MENTOR_KEYS[number];
export type OriginSparkKey = typeof ORIGIN_SPARK_KEYS[number];
export type OriginObstacleKey = typeof ORIGIN_OBSTACLE_KEYS[number];
export type OriginTraitKey = typeof ORIGIN_TRAIT_KEYS[number];
export type OriginDreamKey = typeof ORIGIN_DREAM_KEYS[number];

export interface OriginAnswers {
  scene: OriginSceneKey;
  mentor: OriginMentorKey;
  spark: OriginSparkKey;
  obstacle: OriginObstacleKey;
  trait: OriginTraitKey;
  dream: OriginDreamKey;
}

export interface OriginAssemblyContext {
  name: string;
  clubName: string | null;
  answers: OriginAnswers;
}

// Pick a random element. Math.random() is fine here — the assembled
// paragraph is persisted to narratives table with ON CONFLICT DO NOTHING,
// so the first generation is canonical and never regenerated.
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getNarrativeData(lang: string) {
  return (lang === 'en' ? enNarratives : ptNarratives) as typeof ptNarratives;
}

// ── Main assembly ──
// Builds a 7-sentence paragraph by picking one variation from each of the
// six dimension buckets, plus a closing variation that depends on whether
// the player has a club (with_club vs free_agent).
export function assembleOriginStoryInLang(ctx: OriginAssemblyContext, lang: 'pt' | 'en'): string {
  const data = getNarrativeData(lang).originStory;
  const { name, clubName, answers } = ctx;

  const scene = pick(data.scenes[answers.scene] as string[]).replace(/\{name\}/g, name);
  const mentor = pick(data.mentors[answers.mentor] as string[]);
  const spark = pick(data.sparks[answers.spark] as string[]);
  const obstacle = pick(data.obstacles[answers.obstacle] as string[]);
  const trait = pick(data.traits[answers.trait] as string[]);
  const dream = pick(data.dreams[answers.dream] as string[]);

  let closing: string;
  if (clubName) {
    closing = pick(data.closings as string[]).replace(/\{club\}/g, clubName);
  } else {
    closing = pick((data as any).closings_free_agent as string[]);
  }

  return [scene, mentor, spark, obstacle, trait, dream, closing].join(' ');
}

// Convenience: build PT and EN bodies in one call. Both are stored on the
// canonical narratives row so the UI can pick by user language without
// regenerating.
export function assembleOriginStoryBilingual(ctx: OriginAssemblyContext): { body_pt: string; body_en: string } {
  return {
    body_pt: assembleOriginStoryInLang(ctx, 'pt'),
    body_en: assembleOriginStoryInLang(ctx, 'en'),
  };
}

// Question-key map for ordering screens in onboarding/backfill. Screen 1
// covers childhood/journey context (scene/mentor/spark); screen 2 covers
// identity/future (obstacle/trait/dream).
export const ORIGIN_SCREEN_1_QUESTIONS = ['scene', 'mentor', 'spark'] as const;
export const ORIGIN_SCREEN_2_QUESTIONS = ['obstacle', 'trait', 'dream'] as const;
export type OriginQuestionKey = 'scene' | 'mentor' | 'spark' | 'obstacle' | 'trait' | 'dream';

export const ORIGIN_OPTION_KEYS: Record<OriginQuestionKey, readonly string[]> = {
  scene: ORIGIN_SCENE_KEYS,
  mentor: ORIGIN_MENTOR_KEYS,
  spark: ORIGIN_SPARK_KEYS,
  obstacle: ORIGIN_OBSTACLE_KEYS,
  trait: ORIGIN_TRAIT_KEYS,
  dream: ORIGIN_DREAM_KEYS,
};

export function isCompleteOriginAnswers(p: Partial<OriginAnswers>): p is OriginAnswers {
  return !!(p.scene && p.mentor && p.spark && p.obstacle && p.trait && p.dream);
}
