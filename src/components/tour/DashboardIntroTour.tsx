import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useLocalTour } from '@/hooks/useLocalTour';

export function DashboardIntroTour() {
  const { t } = useTranslation('tour');
  const { playerProfile } = useAuth();
  const { shouldRun, markSeen } = useLocalTour('dashboard_intro');

  const firstName = (playerProfile?.full_name || '').split(' ')[0] || '';

  const steps: Step[] = [
    {
      target: '[data-tour="dashboard-header"]',
      content: (
        <div className="text-left">
          <p className="font-display font-bold text-base mb-2">
            {t('dashboard_intro.step1.title', { name: firstName })}
          </p>
          <p className="text-sm leading-relaxed">{t('dashboard_intro.step1.body')}</p>
        </div>
      ),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="dashboard-energy"]',
      content: (
        <div className="text-left">
          <p className="font-display font-bold text-base mb-2">
            {t('dashboard_intro.step2.title')}
          </p>
          <p className="text-sm leading-relaxed">{t('dashboard_intro.step2.body')}</p>
        </div>
      ),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="dashboard-stats"]',
      content: (
        <div className="text-left">
          <p className="font-display font-bold text-base mb-2">
            {t('dashboard_intro.step3.title')}
          </p>
          <p className="text-sm leading-relaxed">{t('dashboard_intro.step3.body')}</p>
        </div>
      ),
      placement: 'bottom',
      skipBeacon: true,
    },
    {
      target: '[data-tour="nav-club"]',
      content: (
        <div className="text-left">
          <p className="font-display font-bold text-base mb-2">
            {t('dashboard_intro.step4.title')}
          </p>
          <p className="text-sm leading-relaxed">{t('dashboard_intro.step4.body')}</p>
        </div>
      ),
      placement: 'right',
      skipBeacon: true,
    },
  ];

  const handleCallback = (data: CallBackProps) => {
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(data.status)) {
      markSeen();
    }
  };

  if (!shouldRun || !playerProfile) return null;

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
