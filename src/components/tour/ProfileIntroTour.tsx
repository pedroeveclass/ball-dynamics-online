import { Joyride, CallBackProps, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface ProfileIntroTourProps {
  /** Only fires once the page is past loading state, so all spotlights have targets. */
  enabled: boolean;
}

export function ProfileIntroTour({ enabled }: ProfileIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('profile_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="profile-card"]',
      content: renderStep('profile_intro.step1.title', 'profile_intro.step1.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="profile-visual"]',
      content: renderStep('profile_intro.step2.title', 'profile_intro.step2.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="profile-attrs-overview"]',
      content: renderStep('profile_intro.step3.title', 'profile_intro.step3.body'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="profile-positions"]',
      content: renderStep('profile_intro.step4.title', 'profile_intro.step4.body'),
      placement: 'top',
      skipBeacon: true,
    },
  ];

  const handleCallback = (data: CallBackProps) => {
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
      callback={handleCallback}
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
