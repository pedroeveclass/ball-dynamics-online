import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { useAuth } from '@/hooks/useAuth';

interface BankIntroTourProps {
  enabled: boolean;
  /** Active loan present → spotlight the loan card; absent → skip step 3. */
  hasActiveLoan: boolean;
  /** When false (no income or no contract), the request form is hidden, so step 2 is skipped. */
  canTakeLoan: boolean;
}

export function BankIntroTour({ enabled, hasActiveLoan, canTakeLoan }: BankIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('bank_intro');
  const { managerProfile } = useAuth();

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="bank-stats"]',
      content: renderStep('bank_intro.step1.title', 'bank_intro.step1.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    ...(canTakeLoan
      ? [{
          target: '[data-tour="bank-request"]',
          content: renderStep('bank_intro.step2.title', 'bank_intro.step2.body'),
          placement: 'top' as const,
          skipBeacon: true,
        }]
      : []),
    ...(hasActiveLoan
      ? [{
          target: '[data-tour="bank-loan"]',
          content: renderStep('bank_intro.step3.title', 'bank_intro.step3.body'),
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

  // Player tour: don't run when a manager profile is active — managers see BankManagerIntroTour instead.
  if (!enabled || !shouldRun || steps.length === 0 || !!managerProfile) return null;

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
