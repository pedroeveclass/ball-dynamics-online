import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export type EquipSide = 'left' | 'right';
export type EquipSleeve = 'long' | 'short';
export type EquipChoice = EquipSide | EquipSleeve;
export type EquipChoiceKind = 'arm' | 'sleeve';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  // 'arm' = left/right (wristband, biceps band).
  // 'sleeve' = long/short (winter glove).
  kind: EquipChoiceKind;
  defaultValue?: EquipChoice;
  onConfirm: (value: EquipChoice) => void | Promise<void>;
  busy?: boolean;
}

// Two-option picker shown at equip time for cosmetics that come in
// variants — left/right for single-arm bands, long/short for the winter
// glove sleeve. The picked value is sent through to the equip RPC's
// p_side parameter (the column accepts both string sets).
export function EquipSideDialog({ open, onOpenChange, itemName, kind, defaultValue, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const fallback: EquipChoice = kind === 'arm' ? 'right' : 'long';
  const [value, setValue] = useState<EquipChoice>(defaultValue ?? fallback);

  useEffect(() => {
    if (open) setValue(defaultValue ?? fallback);
    // We intentionally don't depend on `fallback` (which is recomputed each
    // render) — only the open/defaultValue/kind transitions reset state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValue, kind]);

  const options: EquipChoice[] = kind === 'arm' ? ['left', 'right'] : ['long', 'short'];
  const titleKey = kind === 'arm' ? 'equip_side.title' : 'equip_sleeve.title';
  const subtitleKey = kind === 'arm' ? 'equip_side.subtitle' : 'equip_sleeve.subtitle';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(subtitleKey, { item: itemName })}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {options.map(opt => {
            const labelKey = kind === 'arm' ? `equip_side.${opt}` : `equip_sleeve.${opt}`;
            const hintKey = kind === 'arm' ? `equip_side.${opt}_hint` : `equip_sleeve.${opt}_hint`;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setValue(opt)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  value === opt ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'
                }`}
              >
                <p className="font-display font-bold text-base">{t(labelKey)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t(hintKey)}</p>
              </button>
            );
          })}
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
