import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface TrainingPlanIntroTourProps {
  /** Only fires once the page is rendered (loading=false), so the grid+save spotlight have targets. */
  enabled: boolean;
}

export function TrainingPlanIntroTour({ enabled }: TrainingPlanIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('training_plan_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="training-grid"]',
      content: renderStep('training_plan_intro.step1.title', 'training_plan_intro.step1.body'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="training-status"]',
      content: renderStep('training_plan_intro.step2.title', 'training_plan_intro.step2.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="training-save"]',
      content: renderStep('training_plan_intro.step3.title', 'training_plan_intro.step3.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
  ];

  const handleCallback = (data: EventData) => {
    if (data.type === EVENTS.TOUR_END) markSeen();
  };

  if (!enabled || !shouldRun) return null;

  return (
    <Joyride
      steps={steps}
      run={shouldRun}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      onEvent={handleCallback}
      locale={{
        back: t('common.back'),
        close: t('common.close'),
        last: t('common.done'),
        next: t('common.next'),
        skip: t('common.skip'),
      }}
      styles={{
        options: {
          primaryColor: 'hsl(var(--tactical))',
          textColor: 'hsl(var(--foreground))',
          backgroundColor: 'hsl(var(--card))',
          arrowColor: 'hsl(var(--card))',
          overlayColor: 'rgba(0, 0, 0, 0.65)',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 8,
          padding: 16,
        },
        buttonNext: {
          borderRadius: 6,
          fontSize: 13,
        },
        buttonBack: {
          fontSize: 13,
        },
        buttonSkip: {
          fontSize: 12,
        },
      }}
    />
  );
}
