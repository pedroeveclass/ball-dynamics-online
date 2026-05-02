import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

// Curated palette — covers the most common kit/equipment colors so 1-click
// picks are fast. Custom shades remain available via the hex input below.
const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#0ea5e9', '#3b82f6',
  '#a855f7', '#ec4899', '#71717a', '#92400e',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  defaultColor?: string;
  // Called with a normalized lowercase #rrggbb string. The caller is
  // responsible for triggering the actual purchase RPC after this resolves.
  onConfirm: (color: string) => void | Promise<void>;
  busy?: boolean;
}

function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return '#' + v.slice(1).split('').map(c => c + c).join('');
  }
  return null;
}

export function ItemColorPickerDialog({ open, onOpenChange, itemName, defaultColor, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const [color, setColor] = useState<string>(defaultColor ?? '#ef4444');

  // Reset to the caller's default each time the dialog re-opens so the
  // previous pick from a different item doesn't leak into the next purchase.
  useEffect(() => {
    if (open) setColor(defaultColor ?? '#ef4444');
  }, [open, defaultColor]);

  const handleConfirm = () => {
    const normalized = normalizeHex(color) ?? '#ef4444';
    onConfirm(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('color_picker.title')}</DialogTitle>
          <DialogDescription>
            {t('color_picker.subtitle', { item: itemName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preset swatches */}
          <div className="grid grid-cols-6 gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setColor(p)}
                aria-label={p}
                className={`h-9 w-full rounded-md border-2 transition-all ${
                  color.toLowerCase() === p ? 'border-tactical scale-105' : 'border-border hover:border-foreground/40'
                }`}
                style={{ backgroundColor: p }}
              />
            ))}
          </div>

          {/* Custom hex input + native picker */}
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={normalizeHex(color) ?? '#ef4444'}
              onChange={e => setColor(e.target.value)}
              className="h-10 w-14 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={color}
              onChange={e => setColor(e.target.value)}
              placeholder="#ef4444"
              className="flex-1 font-mono text-sm"
              maxLength={7}
            />
            <div
              className="h-10 w-10 rounded-md border border-border shrink-0"
              style={{ backgroundColor: normalizeHex(color) ?? 'transparent' }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('color_picker.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !normalizeHex(color)}>
            {busy ? t('color_picker.confirming') : t('color_picker.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
