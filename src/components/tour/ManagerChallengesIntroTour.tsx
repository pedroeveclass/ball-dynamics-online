import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean; hasNextLeagueMatch: boolean }

export function ManagerChallengesIntroTour({ enabled, hasNextLeagueMatch }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('manager_challenges_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="challenges-actions"]', content: renderStep('manager_challenges_intro.step1.title', 'manager_challenges_intro.step1.body'), placement: 'bottom', skipBeacon: true },
    ...(hasNextLeagueMatch
      ? [{ target: '[data-tour="challenges-next-league"]', content: renderStep('manager_challenges_intro.step2.title', 'manager_challenges_intro.step2.body'), placement: 'bottom' as const, skipBeacon: true }]
      : []),
    { target: '[data-tour="challenges-tabs"]', content: renderStep('manager_challenges_intro.step3.title', 'manager_challenges_intro.step3.body'), placement: 'top', skipBeacon: true },
  ];

  const handleCallback = (data: EventData) => {
    if (data.type === EVENTS.TOUR_END) markSeen();
  };

  if (!enabled || !shouldRun) return null;
  return (
    <Joyride steps={steps} run={shouldRun} continuous showSkipButton showProgress disableOverlayClose
      onEvent={handleCallback}
      locale={{ back: t('common.back'), close: t('common.close'), last: t('common.done'), next: t('common.next'), skip: t('common.skip') }}
      styles={TOUR_STYLES} />
  );
}
