import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#0ea5e9', '#3b82f6',
  '#a855f7', '#ec4899', '#71717a', '#92400e',
];

// Each slot is one customizable surface on the item. A wristband uses 1
// slot; cleats use 3 (upper, sole/contour, studs). The dialog renders one
// row of swatches + hex input per slot.
export interface ColorSlot {
  id: string;
  label: string;
  hint?: string;
  defaultValue?: string;
}

export type ColorValues = Record<string, string>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  // Optional slot definition. Defaults to a single slot named 'color' so
  // existing single-color callers keep working.
  slots?: ColorSlot[];
  // Called with a normalized record of slot id → lowercase #rrggbb. The
  // caller is responsible for triggering the actual purchase RPC.
  onConfirm: (values: ColorValues) => void | Promise<void>;
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

function ColorSlotPicker({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-display font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={p}
            className={`h-8 w-full rounded-md border-2 transition-all ${
              value.toLowerCase() === p ? 'border-tactical scale-105' : 'border-border hover:border-foreground/40'
            }`}
            style={{ backgroundColor: p }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={normalizeHex(value) ?? '#ef4444'}
          onChange={e => onChange(e.target.value)}
          className="h-9 w-12 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#ef4444"
          className="flex-1 font-mono text-sm h-9"
          maxLength={7}
        />
        <div
          className="h-9 w-9 rounded-md border border-border shrink-0"
          style={{ backgroundColor: normalizeHex(value) ?? 'transparent' }}
        />
      </div>
    </div>
  );
}

export function ItemColorPickerDialog({ open, onOpenChange, itemName, slots, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const effectiveSlots: ColorSlot[] = slots && slots.length > 0
    ? slots
    : [{ id: 'color', label: t('color_picker.default_label'), defaultValue: '#ef4444' }];

  const [values, setValues] = useState<ColorValues>(() => {
    const init: ColorValues = {};
    for (const s of effectiveSlots) init[s.id] = s.defaultValue ?? '#ef4444';
    return init;
  });

  // Reset to slot defaults each time the dialog re-opens so a previous pick
  // from a different item doesn't leak into the next purchase.
  useEffect(() => {
    if (open) {
      const init: ColorValues = {};
      for (const s of effectiveSlots) init[s.id] = s.defaultValue ?? '#ef4444';
      setValues(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allValid = effectiveSlots.every(s => normalizeHex(values[s.id] ?? '') != null);
  const isMulti = effectiveSlots.length > 1;

  const handleConfirm = () => {
    const out: ColorValues = {};
    for (const s of effectiveSlots) {
      out[s.id] = normalizeHex(values[s.id] ?? '') ?? '#ef4444';
    }
    onConfirm(out);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className={isMulti ? 'max-w-2xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{t('color_picker.title')}</DialogTitle>
          <DialogDescription>
            {t(isMulti ? 'color_picker.subtitle_multi' : 'color_picker.subtitle', { item: itemName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {effectiveSlots.map(s => (
            <ColorSlotPicker
              key={s.id}
              label={s.label}
              hint={s.hint}
              value={values[s.id] ?? '#ef4444'}
              onChange={v => setValues(prev => ({ ...prev, [s.id]: v }))}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('color_picker.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !allValid}>
            {busy ? t('color_picker.confirming') : t('color_picker.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
