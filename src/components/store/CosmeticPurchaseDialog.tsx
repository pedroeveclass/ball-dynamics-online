// Purchase-time configurator for the V2 cosmetic prototypes (tattoo,
// face paint, brinco, headband, bandana, pulseira prata/ouro, cordão
// prata/ouro, óculos, modo sem camisa). Renders a live PlayerAvatarV2
// preview alongside variant / color / side pickers so the buyer sees
// exactly what they'll get before paying.
//
// Each kind declares which controls to expose and which props get
// piped into the preview. Confirm hands the picked values back as a
// flat record the caller can push straight into purchase_store_item.

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatarV2 } from '@/components/PlayerAvatarV2';
import { DEFAULT_APPEARANCE, type PlayerAppearance } from '@/lib/avatar';

export type CosmeticKind =
  | 'tattoo' | 'face_paint' | 'glasses' | 'earring'
  | 'headband' | 'bandana'
  | 'cordao_prata' | 'cordao_ouro'
  | 'pulseira_prata' | 'pulseira_ouro'
  | 'shirtless';

export interface PurchaseValues {
  color?: string;            // → p_color
  color2?: string;           // → p_face_paint_color2 for the 2-color brasil paint
  side?: 'left' | 'right' | 'both'; // → p_side
  tattoo_design?: string;    // → p_tattoo_design
  accessory_variant?: string; // → p_accessory_variant
  face_paint_design?: string; // → p_face_paint_design
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CosmeticKind;
  itemName: string;
  // Player's current appearance, used to seed the preview avatar so the
  // face still matches the buyer.
  appearance?: PlayerAppearance | null;
  // Player's current kit colors, used so the preview shows the body in
  // the same uniform the player actually wears.
  clubPrimaryColor?: string | null;
  clubSecondaryColor?: string | null;
  position?: string | null;
  jerseyPattern?: string | null;
  onConfirm: (values: PurchaseValues) => void | Promise<void>;
  busy?: boolean;
}

const TATTOO_DESIGNS: Array<{ id: string; label: string }> = [
  { id: 'tribal', label: 'Tribal' },
  { id: 'cross',  label: 'Cruz' },
  { id: 'heart',  label: 'Coração' },
  { id: 'anchor', label: 'Âncora' },
  { id: 'star',   label: 'Estrela' },
];

const FACE_PAINT_DESIGNS: Array<{ id: string; label: string; needs2: boolean }> = [
  { id: 'brasil',      label: 'Brasil (2 cores)', needs2: true  },
  { id: 'horizontal',  label: 'Faixa horizontal', needs2: false },
  { id: 'two_stripes', label: 'War paint',        needs2: false },
  { id: 'wings',       label: 'Asas',             needs2: false },
];

const GLASSES_VARIANTS: Array<{ id: string; label: string }> = [
  { id: 'sunglasses',     label: 'Óculos de Sol' },
  { id: 'wayfarers',      label: 'Wayfarer' },
  { id: 'round',          label: 'Redondo Fino' },
  { id: 'prescription01', label: 'Redondo Grosso' },
  { id: 'prescription02', label: 'Quadrado' },
  { id: 'kurt',           label: 'Kurt' },
  { id: 'eyepatch',       label: 'Tapa-olho' },
];

const COLOR_PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#0ea5e9', '#3b82f6',
  '#a855f7', '#ec4899', '#71717a', '#92400e',
];

function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('');
  return null;
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-display font-semibold">{label}</p>
      <div className="grid grid-cols-6 gap-1">
        {COLOR_PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={p}
            className={`h-7 w-full rounded border-2 transition-all ${value.toLowerCase() === p ? 'border-tactical scale-105' : 'border-border hover:border-foreground/40'}`}
            style={{ backgroundColor: p }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input type="color" value={normalizeHex(value) ?? '#ef4444'} onChange={e => onChange(e.target.value)} className="h-8 w-10 p-1" />
        <Input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="#ef4444" className="flex-1 font-mono text-xs h-8" maxLength={7} />
      </div>
    </div>
  );
}

function SideRow({ value, onChange, allowBoth }: { value: 'left'|'right'|'both'; onChange: (v: 'left'|'right'|'both') => void; allowBoth: boolean }) {
  const opts: Array<['left'|'right'|'both', string]> = allowBoth
    ? [['left', 'Esquerda'], ['right', 'Direita'], ['both', 'Ambos']]
    : [['left', 'Esquerda'], ['right', 'Direita']];
  return (
    <div className="space-y-2">
      <p className="text-xs font-display font-semibold">Lado (do jogador)</p>
      <div className={`grid gap-2 ${allowBoth ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {opts.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`px-3 py-2 rounded border-2 text-xs font-display font-semibold transition-all ${value === id ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VariantGrid<T extends { id: string; label: string }>({
  title, options, value, onChange,
}: { title: string; options: T[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-display font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-2 py-1.5 rounded border-2 text-xs font-display font-semibold transition-all ${value === opt.id ? 'border-tactical bg-tactical/10' : 'border-border hover:border-foreground/30'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CosmeticPurchaseDialog({
  open, onOpenChange, kind, itemName,
  appearance, clubPrimaryColor, clubSecondaryColor, position, jerseyPattern,
  onConfirm, busy,
}: Props) {
  // ── Local state for every possible knob; only the ones the kind
  //    cares about end up in the confirm payload. ──
  const [color, setColor] = useState<string>('#ef4444');
  const [color2, setColor2] = useState<string>('#0066CC');
  const [side, setSide] = useState<'left'|'right'|'both'>('right');
  const [tattooDesign, setTattooDesign] = useState<string>('tribal');
  const [accessoryVariant, setAccessoryVariant] = useState<string>('sunglasses');
  const [facePaintDesign, setFacePaintDesign] = useState<string>('brasil');

  useEffect(() => {
    if (!open) return;
    // Reset to sensible kind-specific defaults each time the dialog opens.
    if (kind === 'tattoo')        { setColor('#1a1a1a'); setSide('right'); setTattooDesign('tribal'); }
    else if (kind === 'face_paint') { setColor('#FFD600'); setColor2('#0066CC'); setFacePaintDesign('brasil'); }
    else if (kind === 'glasses')  { setAccessoryVariant('sunglasses'); }
    else if (kind === 'earring')  { setColor('#FFD600'); setSide('both'); }
    else if (kind === 'headband') { setColor('#D32F2F'); }
    else if (kind === 'bandana')  { setColor('#D32F2F'); }
    else if (kind === 'pulseira_prata' || kind === 'pulseira_ouro') { setSide('right'); }
  }, [open, kind]);

  // ── Live preview props derived from local state. ──
  const previewProps: Partial<React.ComponentProps<typeof PlayerAvatarV2>> = {};
  if (kind === 'tattoo')        { previewProps.tattooDesign = tattooDesign; previewProps.tattooSide = side === 'both' ? 'right' : side; previewProps.tattooColor = color; }
  if (kind === 'face_paint')    { previewProps.facePaintDesign = facePaintDesign; previewProps.facePaintColor = color; previewProps.facePaintColor2 = color2; }
  if (kind === 'glasses')       { /* override appearance.accessories below */ }
  if (kind === 'earring')       { previewProps.hasEarring = true; previewProps.earringColor = color; previewProps.earringSide = side; }
  if (kind === 'headband')      { previewProps.hasHeadband = true; previewProps.headbandColor = color; }
  if (kind === 'bandana')       { previewProps.hasBandana = true; previewProps.bandanaColor = color; }
  if (kind === 'cordao_prata')  { previewProps.hasNecklace = true; previewProps.necklaceColor = '#C9C9C9'; }
  if (kind === 'cordao_ouro')   { previewProps.hasNecklace = true; previewProps.necklaceColor = '#C9A227'; }
  if (kind === 'pulseira_prata') { previewProps.hasBracelet = true; previewProps.braceletColor = '#C9C9C9'; previewProps.braceletSide = side === 'both' ? 'right' : side; }
  if (kind === 'pulseira_ouro')  { previewProps.hasBracelet = true; previewProps.braceletColor = '#C9A227'; previewProps.braceletSide = side === 'both' ? 'right' : side; }
  if (kind === 'shirtless')     { previewProps.hideShirt = true; }

  const previewAppearance: PlayerAppearance = (kind === 'glasses')
    ? { ...((appearance ?? DEFAULT_APPEARANCE)), accessories: accessoryVariant }
    : (appearance ?? DEFAULT_APPEARANCE);

  function handleConfirm() {
    const out: PurchaseValues = {};
    if (kind === 'tattoo')        { out.tattoo_design = tattooDesign; out.color = color; out.side = side === 'both' ? 'right' : side; }
    if (kind === 'face_paint')    { out.face_paint_design = facePaintDesign; out.color = color; out.color2 = color2; }
    if (kind === 'glasses')       { out.accessory_variant = accessoryVariant; }
    if (kind === 'earring')       { out.color = color; out.side = side; }
    if (kind === 'headband')      { out.color = color; }
    if (kind === 'bandana')       { out.color = color; }
    if (kind === 'pulseira_prata' || kind === 'pulseira_ouro') { out.side = side === 'both' ? 'right' : side; }
    // cordão prata/ouro + shirtless → no payload, server uses defaults.
    onConfirm(out);
  }

  const showColor = kind === 'tattoo' || kind === 'face_paint' || kind === 'earring' || kind === 'headband' || kind === 'bandana';
  const showColor2 = kind === 'face_paint' && FACE_PAINT_DESIGNS.find(d => d.id === facePaintDesign)?.needs2;
  const showSide = kind === 'tattoo' || kind === 'earring' || kind === 'pulseira_prata' || kind === 'pulseira_ouro';
  const showVariant = kind === 'tattoo' || kind === 'face_paint' || kind === 'glasses';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{itemName}</DialogTitle>
          <DialogDescription>
            Veja como o item fica antes de finalizar a compra.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Live preview */}
          <div className="bg-muted/30 rounded-md p-2 flex items-center justify-center" style={{ minHeight: 380 }}>
            <div style={{ aspectRatio: '1024 / 1536', height: 380 }}>
              <PlayerAvatarV2
                appearance={previewAppearance}
                variant="full-front"
                clubPrimaryColor={clubPrimaryColor}
                clubSecondaryColor={clubSecondaryColor}
                position={position}
                jerseyPattern={jerseyPattern}
                jerseyNumber={9}
                {...previewProps}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
            {showVariant && kind === 'tattoo' && (
              <VariantGrid title="Desenho" options={TATTOO_DESIGNS} value={tattooDesign} onChange={setTattooDesign} />
            )}
            {showVariant && kind === 'face_paint' && (
              <VariantGrid title="Estilo" options={FACE_PAINT_DESIGNS} value={facePaintDesign} onChange={setFacePaintDesign} />
            )}
            {showVariant && kind === 'glasses' && (
              <VariantGrid title="Modelo" options={GLASSES_VARIANTS} value={accessoryVariant} onChange={setAccessoryVariant} />
            )}
            {showColor && (
              <ColorRow label={kind === 'face_paint' && showColor2 ? 'Cor 1 (amarelo no Brasil)' : 'Cor'} value={color} onChange={setColor} />
            )}
            {showColor2 && (
              <ColorRow label="Cor 2 (azul no Brasil)" value={color2} onChange={setColor2} />
            )}
            {showSide && (
              <SideRow value={side} onChange={setSide} allowBoth={kind === 'earring'} />
            )}
            {(kind === 'cordao_prata' || kind === 'cordao_ouro' || kind === 'shirtless') && (
              <p className="text-sm text-muted-foreground">Sem customização adicional. Confirme abaixo pra comprar.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? 'Comprando...' : 'Comprar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
