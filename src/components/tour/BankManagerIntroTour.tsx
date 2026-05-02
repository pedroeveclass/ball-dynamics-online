import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean; canTakeLoan: boolean }

export function BankManagerIntroTour({ enabled, canTakeLoan }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('bank_intro_manager');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="bank-stats"]', content: renderStep('bank_intro_manager.step1.title', 'bank_intro_manager.step1.body'), placement: 'bottom', skipBeacon: true },
    ...(canTakeLoan
      ? [{ target: '[data-tour="bank-request"]', content: renderStep('bank_intro_manager.step2.title', 'bank_intro_manager.step2.body'), placement: 'top' as const, skipBeacon: true }]
      : []),
  ];

  const handleCallback = (data: EventData) => {
    if (data.type === EVENTS.TOUR_END) markSeen();
  };

  if (!enabled || !shouldRun || steps.length === 0) return null;
  return (
    <Joyride steps={steps} run={shouldRun} continuous showSkipButton showProgress disableOverlayClose
      onEvent={handleCallback}
      locale={{ back: t('common.back'), close: t('common.close'), last: t('common.done'), next: t('common.next'), skip: t('common.skip') }}
      styles={TOUR_STYLES} />
  );
}
