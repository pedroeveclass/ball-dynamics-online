import { Joyride, CallBackProps, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props {
  enabled: boolean;
  /** Show the "Available Teams" step only when the manager has no club. */
  isManagerWithoutClub: boolean;
}

export function ManagerLeagueIntroTour({ enabled, isManagerWithoutClub }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('manager_league_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="league-tabs"]', content: renderStep('manager_league_intro.step1.title', 'manager_league_intro.step1.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="league-tab-standings"]', content: renderStep('manager_league_intro.step2.title', 'manager_league_intro.step2.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="league-tab-rounds"]', content: renderStep('manager_league_intro.step3.title', 'manager_league_intro.step3.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="league-tab-stats"]', content: renderStep('manager_league_intro.step4.title', 'manager_league_intro.step4.body'), placement: 'bottom', skipBeacon: true },
    ...(isManagerWithoutClub
      ? [{ target: '[data-tour="league-tab-available"]', content: renderStep('manager_league_intro.step5.title', 'manager_league_intro.step5.body'), placement: 'bottom' as const, skipBeacon: true }]
      : []),
  ];

  const handleCallback = (data: CallBackProps) => {
    if (data.type === EVENTS.TOUR_END) markSeen();
  };

  if (!enabled || !shouldRun) return null;
  return (
    <Joyride steps={steps} run={shouldRun} continuous showSkipButton showProgress disableOverlayClose
      callback={handleCallback}
      locale={{ back: t('common.back'), close: t('common.close'), last: t('common.done'), next: t('common.next'), skip: t('common.skip') }}
      styles={TOUR_STYLES} />
  );
}
