import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { COUNTRIES, getCountryName } from '@/lib/countries';
import { CountryFlag } from '@/components/CountryFlag';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

const CONFEDERATION_ORDER = ['CONMEBOL', 'UEFA', 'CONCACAF', 'CAF', 'AFC', 'OFC'] as const;

export function CountrySelect({ value, onChange, className, placeholder, disabled }: CountrySelectProps) {
  const { t } = useTranslation('common');
  const { current } = useAppLanguage();
  const ph = placeholder ?? t('country.select_placeholder');

  // Group by confederation; sort each group by localized name
  const grouped = CONFEDERATION_ORDER.map(conf => ({
    conf,
    items: COUNTRIES
      .filter(c => c.confederation === conf)
      .sort((a, b) => getCountryName(a, current).localeCompare(getCountryName(b, current))),
  })).filter(g => g.items.length > 0);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={ph}>
          {value && (
            <span className="flex items-center gap-2">
              <CountryFlag code={value} size="xs" />
              <span>{getCountryName(COUNTRIES.find(c => c.code === value)!, current)}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {grouped.map(group => (
          <SelectGroup key={group.conf}>
            <SelectLabel>{group.conf}</SelectLabel>
            {group.items.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2">
                  <CountryFlag code={c.code} size="xs" />
                  <span>{getCountryName(c, current)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
