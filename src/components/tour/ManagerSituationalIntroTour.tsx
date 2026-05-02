import { Joyride, CallBackProps, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean }

export function ManagerSituationalIntroTour({ enabled }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('manager_situational_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="situational-header"]', content: renderStep('manager_situational_intro.step1.title', 'manager_situational_intro.step1.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="situational-grid"]', content: renderStep('manager_situational_intro.step2.title', 'manager_situational_intro.step2.body'), placement: 'top', skipBeacon: true },
    { target: '[data-tour="situational-viz"]', content: renderStep('manager_situational_intro.step3.title', 'manager_situational_intro.step3.body'), placement: 'bottom', skipBeacon: true },
    { target: '[data-tour="situational-knobs"]', content: renderStep('manager_situational_intro.step4.title', 'manager_situational_intro.step4.body'), placement: 'top', skipBeacon: true },
    { target: '[data-tour="situational-setpieces"]', content: renderStep('manager_situational_intro.step5.title', 'manager_situational_intro.step5.body'), placement: 'bottom', skipBeacon: true },
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
