import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ORIGIN_SCREEN_1_QUESTIONS,
  ORIGIN_SCREEN_2_QUESTIONS,
  ORIGIN_OPTION_KEYS,
  isCompleteOriginAnswers,
  type OriginAnswers,
  type OriginQuestionKey,
} from '@/lib/narratives/originStory';

// ── OriginQuestionScreen ──
// Renders three questions for a single onboarding screen. No buttons —
// the caller wires up navigation. Used both inside OnboardingPlayerPage
// (as two steps among the existing flow) and inside the standalone
// backfill page below.
export function OriginQuestionScreen({
  questions,
  answers,
  onAnswerChange,
  headerKey,
}: {
  questions: readonly OriginQuestionKey[];
  answers: Partial<OriginAnswers>;
  onAnswerChange: (q: OriginQuestionKey, v: string) => void;
  headerKey: 'screen1' | 'screen2';
}) {
  const { t } = useTranslation('narratives');

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-tactical" />
          <h2 className="font-display text-lg font-bold text-foreground">
            {t(`originStory.onboarding.${headerKey}_title`)}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(`originStory.onboarding.${headerKey}_subtitle`)}
        </p>
      </div>

      <div className="space-y-5">
        {questions.map(q => {
          const options = ORIGIN_OPTION_KEYS[q];
          const selected = answers[q];
          return (
            <div key={q} className="space-y-2">
              <p className="font-display text-sm font-semibold text-foreground">
                {t(`originStory.questions.${q}`)}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {options.map(opt => {
                  const isActive = selected === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onAnswerChange(q, opt)}
                      className={`px-3 py-2.5 rounded-md border text-left text-sm transition-colors ${
                        isActive
                          ? 'border-tactical bg-tactical/10 text-tactical font-semibold'
                          : 'border-border text-muted-foreground hover:border-tactical/40 hover:text-foreground'
                      }`}
                    >
                      {t(`originStory.options.${q}.${opt}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── OriginQuestionsStandalone ──
// Self-contained 2-screen flow with its own back/next/submit buttons.
// Used by PlayerOriginPage to retrofit existing players who don't yet
// have origin answers.
export function OriginQuestionsStandalone({
  onSubmit,
  submitting,
  submitLabel,
}: {
  onSubmit: (answers: OriginAnswers) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const { t } = useTranslation(['narratives', 'common']);
  const [screen, setScreen] = useState<1 | 2>(1);
  const [answers, setAnswers] = useState<Partial<OriginAnswers>>({});

  const setAnswer = (q: OriginQuestionKey, v: string) => {
    setAnswers(prev => ({ ...prev, [q]: v }));
  };

  const screen1Complete = ORIGIN_SCREEN_1_QUESTIONS.every(q => !!answers[q]);
  const screen2Complete = ORIGIN_SCREEN_2_QUESTIONS.every(q => !!answers[q]);

  const handleSubmit = async () => {
    if (!isCompleteOriginAnswers(answers)) return;
    await onSubmit(answers);
  };

  return (
    <div className="space-y-5">
      <OriginQuestionScreen
        questions={screen === 1 ? ORIGIN_SCREEN_1_QUESTIONS : ORIGIN_SCREEN_2_QUESTIONS}
        answers={answers}
        onAnswerChange={setAnswer}
        headerKey={screen === 1 ? 'screen1' : 'screen2'}
      />

      <div className="flex justify-between pt-2">
        {screen === 2 ? (
          <Button variant="ghost" onClick={() => setScreen(1)} disabled={submitting} className="text-muted-foreground">
            <ChevronLeft className="h-4 w-4 mr-1" /> {t('common:actions.back')}
          </Button>
        ) : <div />}

        {screen === 1 ? (
          <Button
            onClick={() => setScreen(2)}
            disabled={!screen1Complete}
            className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
          >
            {t('common:actions.next')} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!screen2Complete || submitting}
            className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display"
          >
            <Check className="h-4 w-4 mr-1" />
            {submitLabel || t('narratives:originStory.section.complete_cta')}
          </Button>
        )}
      </div>
    </div>
  );
}
