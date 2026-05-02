import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean }

export function ManagerMarketIntroTour({ enabled }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('manager_market_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="market-header"]', content: renderStep('manager_market_intro.step1.title', 'manager_market_intro.step1.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="market-demand"]', content: renderStep('manager_market_intro.step2.title', 'manager_market_intro.step2.body'), placement: 'center', skipBeacon: true },
    { target: '[data-tour="market-list"]', content: renderStep('manager_market_intro.step3.title', 'manager_market_intro.step3.body'), placement: 'top', skipBeacon: true },
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
