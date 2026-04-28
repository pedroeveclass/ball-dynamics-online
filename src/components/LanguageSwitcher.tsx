import { Languages } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';

const LANG_OPTIONS = [
  { code: 'pt' as const, label: 'Português', flag: 'BR' },
  { code: 'en' as const, label: 'English', flag: 'GB' },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { current, change } = useAppLanguage();
  const { t } = useTranslation('common');
  const active = LANG_OPTIONS.find(l => l.code === current) ?? LANG_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className="text-muted-foreground hover:text-foreground gap-1.5"
          title={t('language.label')}
        >
          {compact ? (
            <Languages className="h-4 w-4" />
          ) : (
            <>
              <CountryFlag code={active.flag} size="xs" />
              <span className="text-xs font-display font-semibold uppercase">{active.code}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANG_OPTIONS.map(l => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => void change(l.code)}
            className={current === l.code ? 'bg-accent' : ''}
          >
            <CountryFlag code={l.flag} size="xs" className="mr-2" />
            <span>{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
