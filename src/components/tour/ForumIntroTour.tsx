import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { useAuth } from '@/hooks/useAuth';

interface ForumIntroTourProps {
  enabled: boolean;
  /** Category grid only renders on the main /forum page; new-topic button only when logged-in. */
  hasCategories: boolean;
  hasNewTopicButton: boolean;
}

export function ForumIntroTour({ enabled, hasCategories, hasNewTopicButton }: ForumIntroTourProps) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('forum_intro');
  const { managerProfile } = useAuth();

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    {
      target: '[data-tour="forum-header"]',
      content: renderStep('forum_intro.step1.title', 'forum_intro.step1.body'),
      placement: 'bottom',
      skipBeacon: true,
    },
    ...(hasCategories
      ? [{
          target: '[data-tour="forum-categories"]',
          content: renderStep('forum_intro.step2.title', 'forum_intro.step2.body'),
          placement: 'bottom' as const,
          skipBeacon: true,
        }]
      : []),
    ...(hasNewTopicButton
      ? [{
          target: '[data-tour="forum-new-topic"]',
          content: renderStep('forum_intro.step3.title', 'forum_intro.step3.body'),
          placement: 'bottom' as const,
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

  // Player tour: don't run when a manager profile is active — managers see ForumManagerIntroTour instead.
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
