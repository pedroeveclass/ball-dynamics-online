import { Joyride, EventData, EVENTS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLocalTour } from '@/hooks/useLocalTour';
import { TOUR_STYLES } from './joyrideStyles';

interface Props { enabled: boolean; hasCategories: boolean }

export function ForumManagerIntroTour({ enabled, hasCategories }: Props) {
  const { t } = useTranslation('tour');
  const { shouldRun, markSeen } = useLocalTour('forum_intro_manager');

  const renderStep = (titleKey: string, bodyKey: string) => (
    <div className="text-left">
      <p className="font-display font-bold text-base mb-2">{t(titleKey)}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{t(bodyKey)}</p>
    </div>
  );

  const steps: Step[] = [
    { target: '[data-tour="forum-header"]', content: renderStep('forum_intro_manager.step1.title', 'forum_intro_manager.step1.body'), placement: 'bottom', skipBeacon: true },
    ...(hasCategories
      ? [{ target: '[data-tour="forum-categories"]', content: renderStep('forum_intro_manager.step2.title', 'forum_intro_manager.step2.body'), placement: 'bottom' as const, skipBeacon: true }]
      : []),
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
