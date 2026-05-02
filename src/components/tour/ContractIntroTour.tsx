import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';

interface ContractIntroTourProps {
  enabled: boolean;
  /** When false, the "request exit" step is skipped (free agents have no contract to leave). */
  hasContract: boolean;
}

export function ContractIntroTour({ enabled, hasContract }: ContractIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('contract_intro');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="contract-summary"]',
      content: renderStep('contract_intro.step1.title', 'contract_intro.step1.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="contract-details"]',
      content: renderStep('contract_intro.step2.title', 'contract_intro.step2.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    ...(hasContract
      ? [{
          target: '[data-tour="contract-exit"]',
          content: renderStep('contract_intro.step3.title', 'contract_intro.step3.body'),
          placement: 'top' as const,
          skipBeacon: true,
        }]
      : []),
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
        tooltip: { borderRadius: 8, padding: 16 },
        buttonNext: { borderRadius: 6, fontSize: 13 },
        buttonBack: { fontSize: 13 },
        buttonSkip: { fontSize: 12 },
      }}
    />
  );
}
