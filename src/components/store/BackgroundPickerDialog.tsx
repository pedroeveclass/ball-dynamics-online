import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import type { BackgroundVariant } from '@/lib/cosmetics';

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#0ea5e9', '#3b82f6',
  '#a855f7', '#ec4899', '#71717a', '#92400e',
];

const MODE_TO_DEFAULT_VARIANT: Record<string, BackgroundVariant> = {
  solid: 'solid',
  gradient: 'gradient_diagonal',
  pattern: 'stripes_vertical',
  image: 'image',
};

const PATTERN_VARIANTS: BackgroundVariant[] = [
  'stripes_vertical', 'stripes_horizontal', 'stripes_diagonal', 'checker', 'dots',
];
const GRADIENT_VARIANTS: BackgroundVariant[] = [
  'gradient_vertical', 'gradient_horizontal', 'gradient_diagonal',
];

type Mode = 'solid' | 'gradient' | 'pattern' | 'image';

interface ConfirmPayload {
  variant: BackgroundVariant;
  color: string | null;
  color2: string | null;
  imageUrl: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onConfirm: (payload: ConfirmPayload) => void | Promise<void>;
  busy?: boolean;
}

function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('');
  return null;
}

function previewStyle(variant: BackgroundVariant, a: string, b: string, imageUrl: string | null): React.CSSProperties {
  switch (variant) {
    case 'solid': return { backgroundColor: a };
    case 'gradient_vertical': return { backgroundImage: `linear-gradient(to bottom, ${a}, ${b})` };
    case 'gradient_horizontal': return { backgroundImage: `linear-gradient(to right, ${a}, ${b})` };
    case 'gradient_diagonal': return { backgroundImage: `linear-gradient(135deg, ${a}, ${b})` };
    case 'stripes_vertical': return { backgroundImage: `repeating-linear-gradient(to right, ${a} 0 14px, ${b} 14px 28px)` };
    case 'stripes_horizontal': return { backgroundImage: `repeating-linear-gradient(to bottom, ${a} 0 14px, ${b} 14px 28px)` };
    case 'stripes_diagonal': return { backgroundImage: `repeating-linear-gradient(45deg, ${a} 0 14px, ${b} 14px 28px)` };
    case 'checker': return {
      backgroundColor: a,
      backgroundImage:
        `linear-gradient(45deg, ${b} 25%, transparent 25%), ` +
        `linear-gradient(-45deg, ${b} 25%, transparent 25%), ` +
        `linear-gradient(45deg, transparent 75%, ${b} 75%), ` +
        `linear-gradient(-45deg, transparent 75%, ${b} 75%)`,
      backgroundSize: '24px 24px',
      backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
    };
    case 'dots': return {
      backgroundColor: a,
      backgroundImage: `radial-gradient(circle, ${b} 2.5px, transparent 2.5px)`,
      backgroundSize: '18px 18px',
    };
    case 'image': return imageUrl ? {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    } : { backgroundColor: '#f3f4f6' };
    default: return {};
  }
}

// Single small color row — palette swatches + native picker + hex input.
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-display font-semibold text-muted-foreground">{label}</p>
      <div className="grid grid-cols-12 gap-1">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={p}
            className={`h-6 w-full rounded border-2 transition-all ${value.toLowerCase() === p ? 'border-tactical scale-110' : 'border-border hover:border-foreground/40'}`}
            style={{ backgroundColor: p }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={normalizeHex(value) ?? '#ef4444'}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-10 p-0.5 cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#ef4444"
          className="flex-1 font-mono text-xs h-8"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// Picker for the visual-background cosmetic. Buyer chooses a mode (solid /
// gradient / pattern / image), then the inputs adapt: 1 color, 2 colors +
// direction, pattern subtype, or a file upload. Re-buy is required to
// change variant or photo afterwards.
export function BackgroundPickerDialog({ open, onOpenChange, itemName, onConfirm, busy }: Props) {
  const { t } = useTranslation('store');
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('solid');
  const [variant, setVariant] = useState<BackgroundVariant>('solid');
  const [color, setColor] = useState('#0ea5e9');
  const [color2, setColor2] = useState('#22c55e');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode('solid');
      setVariant('solid');
      setColor('#0ea5e9');
      setColor2('#22c55e');
      setImageUrl(null);
    }
  }, [open]);

  const handleModeChange = (m: Mode) => {
    setMode(m);
    setVariant(MODE_TO_DEFAULT_VARIANT[m]);
  };

  const handleFile = async (file: File) => {
    if (!user) { toast.error(t('color_picker.login_required')); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t('background.file_too_big')); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error(t('background.bad_type'));
      return;
    }
    setUploading(true);
    try {
      // Path is `<user_id>/<unique>.<ext>` so the storage RLS policy passes
      // (first folder segment must equal auth.uid()). Unique suffix prevents
      // overwriting older purchases when the user re-buys.
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('player-backgrounds')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadErr) { toast.error(uploadErr.message); return; }
      const { data: pub } = supabase.storage.from('player-backgrounds').getPublicUrl(path);
      setImageUrl(pub.publicUrl);
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    const safeA = normalizeHex(color) ?? '#0ea5e9';
    const safeB = normalizeHex(color2) ?? '#22c55e';
    if (variant === 'image') {
      if (!imageUrl) { toast.error(t('background.upload_first')); return; }
      onConfirm({ variant: 'image', color: null, color2: null, imageUrl });
    } else if (variant === 'solid') {
      onConfirm({ variant: 'solid', color: safeA, color2: null, imageUrl: null });
    } else {
      onConfirm({ variant, color: safeA, color2: safeB, imageUrl: null });
    }
  };

  const previewA = normalizeHex(color) ?? '#0ea5e9';
  const previewB = normalizeHex(color2) ?? '#22c55e';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy && !uploading) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('background.title')}</DialogTitle>
          <DialogDescription>{t('background.subtitle', { item: itemName })}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left side: mode selector + inputs */}
          <div className="space-y-4">
            {/* Mode tabs */}
            <div className="grid grid-cols-4 gap-1">
              {(['solid', 'gradient', 'pattern', 'image'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  className={`p-2 rounded-md border-2 text-xs font-display font-semibold transition-all ${mode === m ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'}`}
                >
                  {t(`background.mode_${m}`)}
                </button>
              ))}
            </div>

            {/* Mode-specific inputs */}
            {mode === 'solid' && (
              <ColorRow label={t('background.color')} value={color} onChange={setColor} />
            )}

            {mode === 'gradient' && (
              <>
                <div className="grid grid-cols-3 gap-1">
                  {GRADIENT_VARIANTS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={`p-2 rounded-md border-2 text-[11px] font-display font-semibold transition-all ${variant === v ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'}`}
                    >
                      {t(`background.variant_${v}`)}
                    </button>
                  ))}
                </div>
                <ColorRow label={t('background.color_a')} value={color} onChange={setColor} />
                <ColorRow label={t('background.color_b')} value={color2} onChange={setColor2} />
              </>
            )}

            {mode === 'pattern' && (
              <>
                <div className="grid grid-cols-3 gap-1">
                  {PATTERN_VARIANTS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={`p-2 rounded-md border-2 text-[11px] font-display font-semibold transition-all ${variant === v ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'}`}
                    >
                      {t(`background.variant_${v}`)}
                    </button>
                  ))}
                </div>
                <ColorRow label={t('background.color_a')} value={color} onChange={setColor} />
                <ColorRow label={t('background.color_b')} value={color2} onChange={setColor2} />
              </>
            )}

            {mode === 'image' && (
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-24 border-dashed flex flex-col items-center justify-center"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-xs mt-1">{t('background.uploading')}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-xs mt-1">{imageUrl ? t('background.replace_image') : t('background.upload_image')}</span>
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground">{t('background.image_hint')}</p>
              </div>
            )}
          </div>

          {/* Right side: preview */}
          <div>
            <p className="text-xs font-display font-semibold text-muted-foreground mb-2">{t('background.preview')}</p>
            <div
              className="rounded-lg border border-border w-full aspect-[2/3] flex items-end justify-center p-2"
              style={previewStyle(variant, previewA, previewB, imageUrl)}
            >
              <span className="text-[10px] bg-black/40 text-white px-2 py-0.5 rounded">{t(`background.variant_${variant}`)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || uploading}>
            {t('color_picker.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={busy || uploading || (variant === 'image' && !imageUrl)}>
            {busy ? t('color_picker.confirming') : t('color_picker.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
