import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface MatchesIntroTourProps {
  /** Only fires once the page is past loading state. */
  enabled: boolean;
  /** When false, the league-fixture step is skipped (no card to spotlight). */
  hasLeagueFixture: boolean;
}

export function MatchesIntroTour({ enabled, hasLeagueFixture }: MatchesIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('matches_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="matches-list"]',
      content: renderStep('matches_intro.step1.title', 'matches_intro.step1.body'),
      placement: 'top',
      skipBeacon: true,
    },
    ...(hasLeagueFixture
      ? [{
          target: '[data-tour="matches-next-league"]',
          content: renderStep('matches_intro.step2.title', 'matches_intro.step2.body'),
          placement: 'bottom' as const,
          skipBeacon: true,
        }]
      : []),
    {
      target: '[data-tour="matches-test-button"]',
      content: renderStep('matches_intro.step3.title', 'matches_intro.step3.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
  ];

  const handleCallback = (data: CallBackProps) => {
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(data.status)) {
      markSeen();
    }
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
