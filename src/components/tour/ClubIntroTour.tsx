import { Joyride, CallBackProps, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface ClubIntroTourProps {
  /** Only fires once the player has a club AND the lineup card is rendered (so the lineup spotlight has a target). */
  enabled: boolean;
  clubName: string;
}

export function ClubIntroTour({ enabled, clubName }: ClubIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('club_intro');

  const renderStep = (titleKey: string, bodyKey: string, params?: Record<string, string | number>) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey, params)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey, params)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="club-header"]',
      content: renderStep('club_intro.step1.title', 'club_intro.step1.body', { clubName }),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="club-manager"]',
      content: renderStep('club_intro.step2.title', 'club_intro.step2.body'),
      placement: 'left',
      skipBeacon: true,
    },
    {
      target: '[data-tour="club-stats"]',
      content: renderStep('club_intro.step3.title', 'club_intro.step3.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="club-lineup"]',
      content: renderStep('club_intro.step4.title', 'club_intro.step4.body'),
      placement: 'top',
      skipBeacon: true,
    },
    {
      target: '[data-tour="club-roster"]',
      content: renderStep('club_intro.step5.title', 'club_intro.step5.body'),
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
