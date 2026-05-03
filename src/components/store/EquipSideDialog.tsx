import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export type EquipSide = 'left' | 'right';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  defaultSide?: EquipSide;
  // Called with the chosen side. Caller is responsible for invoking the
  // equip RPC after this resolves.
  onConfirm: (side: EquipSide) => void | Promise<void>;
  busy?: boolean;
}

// Asks the player which arm the side-aware cosmetic should be worn on.
// Used at equip time for items like Munhequeira and Biceps Band where the
// avatar paints a single accessory on one arm. Caneleira / Luva de Inverno
// don't need this — they're symmetric.
export function EquipSideDialog({ open, onOpenChange, itemName, defaultSide, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const [side, setSide] = useState<EquipSide>(defaultSide ?? 'right');

  useEffect(() => {
    if (open) setSide(defaultSide ?? 'right');
  }, [open, defaultSide]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('equip_side.title')}</DialogTitle>
          <DialogDescription>{t('equip_side.subtitle', { item: itemName })}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {(['left', 'right'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                side === s ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'
              }`}
            >
              <p className="font-display font-bold text-base">
                {s === 'left' ? t('equip_side.left') : t('equip_side.right')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {s === 'left' ? t('equip_side.left_hint') : t('equip_side.right_hint')}
              </p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('equip_side.cancel')}
          </Button>
          <Button onClick={() => onConfirm(side)} disabled={busy}>
            {busy ? t('equip_side.equipping') : t('equip_side.equip')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
