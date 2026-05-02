import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface LeagueIntroTourProps {
  /** Only fires when the player landed on the "join" tab as a free agent and the joinable cards are present in the DOM. */
  enabled: boolean;
}

export function LeagueIntroTour({ enabled }: LeagueIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('league_join_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="league-tabs"]',
      content: renderStep('league_intro.step1.title', 'league_intro.step1.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="league-join-intro"]',
      content: renderStep('league_intro.step2.title', 'league_intro.step2.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="league-join-first-card"]',
      content: renderStep('league_intro.step3.title', 'league_intro.step3.body'),
      placement: 'auto',
      skipBeacon: true,
    },
    {
      target: '[data-tour="league-join-first-card"]',
      content: renderStep('league_intro.step4.title', 'league_intro.step4.body'),
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
