interface RatingChipProps {
  rating: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Color scale matches Sofascore convention:
//  < 5.5 red, 5.5-6.4 orange, 6.5-6.9 yellow, 7.0-7.9 green, ≥ 8.0 blue
function ratingColor(r: number): { bg: string; fg: string } {
  if (r >= 8.0) return { bg: '#1e6cd6', fg: '#ffffff' };
  if (r >= 7.0) return { bg: '#37b24d', fg: '#ffffff' };
  if (r >= 6.5) return { bg: '#f5d040', fg: '#1a1a1a' };
  if (r >= 5.5) return { bg: '#f08c2c', fg: '#ffffff' };
  return { bg: '#d62f2f', fg: '#ffffff' };
}

export function RatingChip({ rating, size = 'md', className }: RatingChipProps) {
  if (rating === null || rating === undefined) {
    return (
      <span className={`inline-flex items-center justify-center rounded bg-muted text-muted-foreground font-display text-xs px-1.5 ${className ?? ''}`}>
        —
      </span>
    );
  }
  const { bg, fg } = ratingColor(rating);
  const sizeCls =
    size === 'sm' ? 'text-[10px] px-1.5 h-5 min-w-7' :
    size === 'lg' ? 'text-base px-2 h-8 min-w-12' :
    'text-xs px-1.5 h-6 min-w-9';
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-display font-bold tabular-nums ${sizeCls} ${className ?? ''}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {rating.toFixed(1)}
    </span>
  );
}
