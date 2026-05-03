import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export type EquipSide = 'left' | 'right';
export type EquipSleeve = 'long' | 'short';
export type EquipLimb = 'left' | 'right' | 'both';
export type EquipChoice = EquipSide | EquipSleeve | EquipLimb;
export type EquipChoiceKind = 'arm' | 'sleeve' | 'limbArms' | 'limbLegs';

// Per-kind layout: which options to show, which i18n key prefix to read
// labels/hints from, and a sensible default. Two-option kinds use the
// existing 'equip_side' / 'equip_sleeve' namespaces; the new three-option
// kinds for compression-top / compression-tights have their own.
const KIND_CONFIG: Record<EquipChoiceKind, {
  options: EquipChoice[];
  namespace: string;
  default: EquipChoice;
}> = {
  arm:       { options: ['left', 'right'],          namespace: 'equip_side',      default: 'right' },
  sleeve:    { options: ['long', 'short'],          namespace: 'equip_sleeve',    default: 'long'  },
  limbArms:  { options: ['both', 'right', 'left'],  namespace: 'equip_limb_arms', default: 'both'  },
  limbLegs:  { options: ['both', 'right', 'left'],  namespace: 'equip_limb_legs', default: 'both'  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  kind: EquipChoiceKind;
  defaultValue?: EquipChoice;
  onConfirm: (value: EquipChoice) => void | Promise<void>;
  busy?: boolean;
}

// Two- or three-option picker shown at equip time. Compression top / tights
// add the 'both' option so the player can apply the cosmetic to one limb or
// to both. The picked value goes through to equip_store_item's p_side.
export function EquipSideDialog({ open, onOpenChange, itemName, kind, defaultValue, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const config = KIND_CONFIG[kind];
  const [value, setValue] = useState<EquipChoice>(defaultValue ?? config.default);

  useEffect(() => {
    if (open) setValue(defaultValue ?? config.default);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValue, kind]);

  const ns = config.namespace;
  const cols = config.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${ns}.title`)}</DialogTitle>
          <DialogDescription>{t(`${ns}.subtitle`, { item: itemName })}</DialogDescription>
        </DialogHeader>

        <div className={`grid ${cols} gap-3`}>
          {config.options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setValue(opt)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                value === opt ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'
              }`}
            >
              <p className="font-display font-bold text-sm">{t(`${ns}.${opt}`)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{t(`${ns}.${opt}_hint`)}</p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('equip_side.cancel')}
          </Button>
          <Button onClick={() => onConfirm(value)} disabled={busy}>
            {busy ? t('equip_side.equipping') : t('equip_side.equip')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
