import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { attrLabel, attrDescription } from '@/lib/attributes';
import { cn } from '@/lib/utils';

interface AttributeInfoProps {
  attrKey: string;
  className?: string;
}

// Small "i" icon that opens a short tooltip explaining what the attribute
// does in-match. Stops click propagation so it can sit safely inside a
// larger trigger (e.g. the training popover button on PlayerAttributesPage).
export function AttributeInfo({ attrKey, className }: AttributeInfoProps) {
  const description = attrDescription(attrKey);
  if (!description) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={attrLabel(attrKey)}
          onClick={(e) => { e.stopPropagation(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 cursor-pointer',
            className,
          )}
        >
          <Info className="h-3 w-3" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-3"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-sm font-bold text-foreground mb-1">{attrLabel(attrKey)}</p>
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      </PopoverContent>
    </Popover>
  );
}
