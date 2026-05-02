import type { Styles } from 'react-joyride';

/** Shared visual config so every tour looks the same and we change in one place. */
export const TOUR_STYLES: Partial<Styles> = {
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
};
