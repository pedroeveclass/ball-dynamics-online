import { useMemo } from 'react';
import { composePlayerSvg, type ComposeOptions } from '@/lib/avatarV2';
import { DEFAULT_APPEARANCE, readableForeground, type PlayerAppearance } from '@/lib/avatar';

// Phase 1 of the new SVG-body avatar. Renders the composed body
// (pernas → bracos → meião → chuteira → bermuda → camiseta →
// cabeça + overlays) tinted with team colors and the player's
// chosen skin tone. Head still uses the new cabeca SVG (bald +
// brown beard placeholder) until Phase 4 brings face customization.
//
// Lives side by side with PlayerAvatar so we can swap pages in one
// at a time and validate visually before deleting the old one.

export type AvatarV2Variant = 'face' | 'full-front';

interface PlayerAvatarV2Props {
  appearance: PlayerAppearance | null | undefined;
  variant?: AvatarV2Variant;
  clubPrimaryColor?: string | null;
  clubSecondaryColor?: string | null;
  clubCrestUrl?: string | null;
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
  hasShinGuard?: boolean;
  shinGuardColor?: string;
  sockHeight?: 'alto' | 'baixo';
  cleatColor?: string | null;
  gloveColor?: string | null;
  hasWinterGlove?: boolean;
  bicepsBandColor?: string | null;
  bicepsBandSide?: 'left' | 'right';
  wristbandColor?: string | null;
  wristbandSide?: 'left' | 'right';
  secondSkinShirtColor?: string | null;
  secondSkinShirtSide?: 'left' | 'right' | 'both';
  secondSkinPantsColor?: string | null;
  secondSkinPantsSide?: 'left' | 'right' | 'both';
  fallbackSeed?: string;
  hideShirt?: boolean;
  outfit?: 'player' | 'coach';
  jerseyPattern?: string | null;
  // Cosmetic prototypes (sandbox / future store items)
  tattooDesign?: string | null;
  tattooSide?: 'left' | 'right';
  tattooColor?: string;
  facePaintDesign?: string | null;
  facePaintColor?: string;
  facePaintColor2?: string;
  hasEarring?: boolean;
  earringSide?: 'left' | 'right' | 'both';
  earringColor?: string;
  hasHeadband?: boolean;
  headbandColor?: string;
  hasNecklace?: boolean;
  necklaceColor?: string;
  hasBracelet?: boolean;
  braceletSide?: 'left' | 'right';
  braceletColor?: string;
  hasBandana?: boolean;
  bandanaColor?: string;
  className?: string;
}

const DEFAULT_PRIMARY = '#2a5a8a';
const DEFAULT_SECONDARY = '#ffffff';

export function PlayerAvatarV2({
  appearance,
  variant = 'full-front',
  clubPrimaryColor,
  clubSecondaryColor,
  clubCrestUrl,
  jerseyNumber,
  position,
  isCaptain,
  hasShinGuard,
  shinGuardColor,
  sockHeight = 'alto',
  cleatColor,
  gloveColor,
  hasWinterGlove,
  bicepsBandColor,
  bicepsBandSide = 'left',
  wristbandColor,
  wristbandSide = 'left',
  secondSkinShirtColor,
  secondSkinShirtSide = 'both',
  secondSkinPantsColor,
  secondSkinPantsSide = 'both',
  fallbackSeed,
  hideShirt,
  outfit = 'player',
  jerseyPattern,
  tattooDesign,
  tattooSide,
  tattooColor,
  facePaintDesign,
  facePaintColor,
  facePaintColor2,
  hasEarring,
  earringSide,
  earringColor,
  hasHeadband,
  headbandColor,
  hasNecklace,
  necklaceColor,
  hasBracelet,
  braceletSide,
  braceletColor,
  hasBandana,
  bandanaColor,
  className,
}: PlayerAvatarV2Props) {
  const a = appearance ?? DEFAULT_APPEARANCE;
  const primary = clubPrimaryColor || DEFAULT_PRIMARY;
  const secondary = clubSecondaryColor || DEFAULT_SECONDARY;
  const numberColor = readableForeground(primary);

  const svgString = useMemo<string>(() => {
    const opts: ComposeOptions = {
      skinTone: a.skinTone,
      primaryColor: primary,
      secondaryColor: secondary,
      appearance: a,
      seed: fallbackSeed ?? 'avatarV2',
      position,
      isCaptain,
      sockHeight,
      hasShinGuard,
      shinGuardColor,
      cleatColor,
      gloveColor,
      hasWinterGlove,
      bicepsBandColor,
      bicepsBandSide,
      wristbandColor,
      wristbandSide,
      secondSkinShirtColor,
      secondSkinShirtSide,
      secondSkinPantsColor,
      secondSkinPantsSide,
      jerseyNumber,
      crestUrl: clubCrestUrl,
      numberColor,
      hideShirt,
      outfit,
      jerseyPattern,
      tattooDesign,
      tattooSide,
      tattooColor,
      facePaintDesign,
      facePaintColor,
      facePaintColor2,
      hasEarring,
      earringSide,
      earringColor,
      hasHeadband,
      headbandColor,
      hasNecklace,
      necklaceColor,
      hasBracelet,
      braceletSide,
      braceletColor,
      hasBandana,
      bandanaColor,
    };
    return composePlayerSvg(opts);
  }, [
    a, primary, secondary, fallbackSeed, position, isCaptain, sockHeight,
    hasShinGuard, shinGuardColor, cleatColor, gloveColor, hasWinterGlove,
    bicepsBandColor, bicepsBandSide, wristbandColor, wristbandSide,
    secondSkinShirtColor, secondSkinShirtSide,
    secondSkinPantsColor, secondSkinPantsSide,
    jerseyNumber, clubCrestUrl, numberColor, hideShirt, outfit, jerseyPattern,
    tattooDesign, tattooSide, tattooColor,
    facePaintDesign, facePaintColor, facePaintColor2,
    hasEarring, earringSide, earringColor,
    hasHeadband, headbandColor, hasNecklace, necklaceColor,
    hasBracelet, braceletSide, braceletColor,
    hasBandana, bandanaColor,
  ]);

  // Face variant: clip the composed SVG to the head region only.
  // Head spans roughly y=80–380 in the 1024×1536 source.
  if (variant === 'face') {
    return (
      <div
        className={className}
        style={{ aspectRatio: '1 / 1', overflow: 'hidden' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="350 60 320 340"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          dangerouslySetInnerHTML={{ __html: extractInner(svgString) }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ aspectRatio: '1024 / 1536' }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}

// Pull just the inner contents (between the outer <svg> tags) so
// we can re-wrap with a different viewBox for the face variant.
function extractInner(svg: string): string {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
}
