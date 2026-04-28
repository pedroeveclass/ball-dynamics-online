import { cn } from '@/lib/utils';
import { COUNTRIES, getCountryName } from '@/lib/countries';

interface CountryFlagProps {
  code: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  locale?: 'pt' | 'en';
  title?: string;
  className?: string;
}

const SIZE_PX: Record<NonNullable<CountryFlagProps['size']>, { w: number; h: number; cdn: 'w20' | 'w40' | 'w80' | 'w160' }> = {
  xs: { w: 16, h: 12, cdn: 'w20' },
  sm: { w: 20, h: 15, cdn: 'w40' },
  md: { w: 28, h: 21, cdn: 'w40' },
  lg: { w: 48, h: 36, cdn: 'w80' },
};

export function CountryFlag({ code, size = 'sm', showName = false, locale = 'pt', title, className }: CountryFlagProps) {
  const upper = (code || '').toUpperCase();
  const valid = upper.length === 2 && /^[A-Z]{2}$/.test(upper);
  const dims = SIZE_PX[size];
  const country = COUNTRIES.find(c => c.code === upper);
  const name = country ? getCountryName(country, locale) : upper;
  const tooltip = title ?? name;

  if (!valid) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground', className)} title={tooltip}>
        <span
          className="rounded-sm bg-muted/40 inline-block"
          style={{ width: dims.w, height: dims.h }}
          aria-hidden
        />
        {showName && <span className="text-xs">—</span>}
      </span>
    );
  }

  const url = `https://flagcdn.com/${dims.cdn}/${upper.toLowerCase()}.png`;
  const url2x = `https://flagcdn.com/${dims.cdn === 'w20' ? 'w40' : dims.cdn === 'w40' ? 'w80' : dims.cdn === 'w80' ? 'w160' : 'w320'}/${upper.toLowerCase()}.png`;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={tooltip}>
      <img
        src={url}
        srcSet={`${url} 1x, ${url2x} 2x`}
        width={dims.w}
        height={dims.h}
        alt={name}
        loading="lazy"
        decoding="async"
        className="rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
        style={{ objectFit: 'cover' }}
      />
      {showName && <span className="text-xs text-muted-foreground">{name}</span>}
    </span>
  );
}
