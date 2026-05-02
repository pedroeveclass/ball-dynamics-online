import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean }

export function ManagerFinanceIntroTour({ enabled }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('manager_finance_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="finance-revenue"]', content: renderStep('manager_finance_intro.step1.title', 'manager_finance_intro.step1.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="finance-expenses"]', content: renderStep('manager_finance_intro.step2.title', 'manager_finance_intro.step2.body'), placement: 'top', skipBeacon: true },
    { target: '[data-tour="finance-summary"]', content: renderStep('manager_finance_intro.step3.title', 'manager_finance_intro.step3.body'), placement: 'top', skipBeacon: true },
  ];

  const handleCallback = (data: CallBackProps) => {
    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(data.status)) markSeen();
  };

  if (!enabled || !shouldRun) return null;
  return (
    <Joyride steps={steps} run={shouldRun} continuous showSkipButton showProgress disableOverlayClose
      callback={handleCallback}
      locale={{ back: t('common.back'), close: t('common.close'), last: t('common.done'), next: t('common.next'), skip: t('common.skip') }}
      styles={TOUR_STYLES} />
  );
}
