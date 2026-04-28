import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PlayerAppearance,
  DEFAULT_APPEARANCE,
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_STYLES,
  EYEBROWS,
  EYES,
  MOUTHS,
  FACIAL_HAIR,
  Option,
  avatarOptionLabel,
} from '@/lib/avatar';
import { PlayerAvatar, type AvatarOutfit } from './PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface AvatarCreatorProps {
  initial?: PlayerAppearance | null;
  playerName?: string | null;
  clubPrimaryColor?: string | null;
  clubSecondaryColor?: string | null;
  clubCrestUrl?: string | null;
  jerseyNumber?: number | null;
  height?: string | null;
  onConfirm: (appearance: PlayerAppearance) => void;
  confirmLabel?: string;
  submitting?: boolean;
  outfit?: AvatarOutfit;
}

// Accessories are intentionally NOT shown here — they'll become purchasable
// gadgets in the store (hat, glasses, etc.) and apply on top of the saved
// appearance via the `gadgets` array. Only core traits live in the creator.
// Section labels resolve through i18n (`common:avatar_creator.sections.<key>`)
// at render time, so PT/EN follow the active language.
type SectionKey = 'skinTone' | 'hair' | 'hairColor' | 'eyebrows' | 'eyes' | 'mouth' | 'facialHair';
type Section =
  | { key: 'skinTone'; options: Option[]; mode: 'swatch' }
  | { key: 'hair'; options: Option[]; mode: 'list' }
  | { key: 'hairColor'; options: Option[]; mode: 'swatch' }
  | { key: 'eyebrows'; options: Option[]; mode: 'list' }
  | { key: 'eyes'; options: Option[]; mode: 'list' }
  | { key: 'mouth'; options: Option[]; mode: 'list' }
  | { key: 'facialHair'; options: Option[]; mode: 'list'; nullable: true };

const SECTIONS: Section[] = [
  { key: 'skinTone', options: SKIN_TONES, mode: 'swatch' },
  { key: 'hair', options: HAIR_STYLES, mode: 'list' },
  { key: 'hairColor', options: HAIR_COLORS, mode: 'swatch' },
  { key: 'eyebrows', options: EYEBROWS, mode: 'list' },
  { key: 'eyes', options: EYES, mode: 'list' },
  { key: 'mouth', options: MOUTHS, mode: 'list' },
  { key: 'facialHair', options: FACIAL_HAIR, mode: 'list', nullable: true },
];

// Maps Section.key → avatar i18n category
const SECTION_TO_CATEGORY: Record<string, import('@/lib/avatar').AvatarCategory> = {
  skinTone: 'skin_tones',
  hair: 'hair_styles',
  hairColor: 'hair_colors',
  eyebrows: 'eyebrows',
  eyes: 'eyes',
  mouth: 'mouths',
  facialHair: 'facial_hair',
};

export function AvatarCreator({
  initial,
  playerName,
  clubPrimaryColor,
  clubSecondaryColor,
  clubCrestUrl,
  jerseyNumber,
  height,
  onConfirm,
  confirmLabel,
  submitting,
  outfit = 'player',
}: AvatarCreatorProps) {
  const { t } = useTranslation('common');
  const resolvedConfirmLabel = confirmLabel ?? t('avatar_creator.default_confirm');
  const sectionLabel = (key: SectionKey): string => t(`avatar_creator.sections.${key}`);
  const [app, setApp] = useState<PlayerAppearance>(initial ?? DEFAULT_APPEARANCE);
  const [activeSection, setActiveSection] = useState<Section['key']>('skinTone');
  const [previewVariant, setPreviewVariant] = useState<'full-front' | 'full-back' | 'face'>('full-front');

  const setField = <K extends keyof PlayerAppearance>(key: K, value: PlayerAppearance[K]) => {
    setApp(prev => ({ ...prev, [key]: value }));
  };

  const currentSection = SECTIONS.find(s => s.key === activeSection)!;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-full bg-primary/5 rounded-lg p-4 flex items-center justify-center" style={{ aspectRatio: previewVariant === 'face' ? '1 / 1' : '1 / 2', maxHeight: 460 }}>
          <PlayerAvatar
            appearance={app}
            variant={previewVariant}
            height={height}
            clubPrimaryColor={clubPrimaryColor}
            clubSecondaryColor={clubSecondaryColor}
            clubCrestUrl={clubCrestUrl}
            playerName={playerName}
            jerseyNumber={jerseyNumber}
            outfit={outfit}
            className="w-full h-full"
          />
        </div>
        <div className="flex gap-1">
          {(['face', 'full-front', 'full-back'] as const).map(v => (
            <button
              key={v}
              onClick={() => setPreviewVariant(v)}
              className={`px-3 py-1.5 rounded text-xs font-display font-semibold transition-colors ${
                previewVariant === v ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {v === 'face' ? t('avatar_creator.preview.face') : v === 'full-front' ? t('avatar_creator.preview.front') : t('avatar_creator.preview.back')}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Section tabs */}
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold border transition-colors ${
                activeSection === s.key
                  ? 'border-tactical bg-tactical/10 text-tactical'
                  : 'border-border text-muted-foreground hover:border-tactical/40'
              }`}
            >
              {sectionLabel(s.key)}
            </button>
          ))}
        </div>

        {/* Options grid */}
        <div className="rounded-lg bg-card border border-border p-4">
          <Label className="text-xs text-muted-foreground mb-3 block">{sectionLabel(currentSection.key)}</Label>
          {currentSection.mode === 'swatch' ? (
            <div className="flex flex-wrap gap-2">
              {currentSection.options.map(opt => {
                const selected = app[currentSection.key] === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setField(currentSection.key as any, opt.id as any)}
                    title={avatarOptionLabel(SECTION_TO_CATEGORY[currentSection.key], opt.id, opt.label)}
                    className={`h-10 w-10 rounded-full border-2 transition-all ${selected ? 'border-tactical scale-110' : 'border-border hover:border-tactical/50'}`}
                    style={{ backgroundColor: `#${opt.id}` }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {currentSection.options.map(opt => {
                const isNullable = 'nullable' in currentSection && currentSection.nullable;
                const current = app[currentSection.key as keyof PlayerAppearance];
                const isNone = opt.id === 'none';
                const selected = isNullable && isNone ? current == null : current === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (isNullable && isNone) {
                        setField(currentSection.key as any, null as any);
                      } else {
                        setField(currentSection.key as any, opt.id as any);
                      }
                    }}
                    className={`px-3 py-2 rounded-md text-xs font-display font-semibold border transition-colors text-left ${
                      selected
                        ? 'border-tactical bg-tactical/10 text-tactical'
                        : 'border-border text-muted-foreground hover:border-tactical/40'
                    }`}
                  >
                    {avatarOptionLabel(SECTION_TO_CATEGORY[currentSection.key], opt.id, opt.label)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Button
          onClick={() => onConfirm(app)}
          disabled={submitting}
          className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display"
        >
          {submitting ? t('avatar_creator.saving') : resolvedConfirmLabel}
        </Button>
      </div>
    </div>
  );
}
