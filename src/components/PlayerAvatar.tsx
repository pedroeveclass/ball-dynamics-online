import { useId, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import { PlayerAppearance, DEFAULT_APPEARANCE, heightScale, readableForeground, firstName, isLongHair, isBigBeard } from '@/lib/avatar';

export type AvatarVariant = 'face' | 'full-front' | 'full-back';
export type AvatarOutfit = 'player' | 'coach';

interface PlayerAvatarProps {
  appearance: PlayerAppearance | null | undefined;
  variant?: AvatarVariant;
  height?: string | null;
  clubPrimaryColor?: string | null;
  clubSecondaryColor?: string | null;
  clubCrestUrl?: string | null;
  playerName?: string | null;
  jerseyNumber?: number | null;
  className?: string;
  fallbackSeed?: string;
  outfit?: AvatarOutfit;
  // ── Optional uniform fields, sourced from `club_uniforms`. When set, the
  // jersey is painted with the actual kit (pattern + 2 colors + number color)
  // instead of just the club's primary color. `clubPrimaryColor`/`clubSecondaryColor`
  // remain the fallback for callers that don't pass an explicit uniform.
  uniformPattern?: string | null;        // 'solid' | 'stripe_vertical_double' | 'bicolor_diagonal' | …
  uniformStripeColor?: string | null;    // pattern's secondary color
  uniformNumberColor?: string | null;    // jersey number color (back & front)
  // When true, the avatar wears long sleeves and dark-gray gloves to read as
  // a goalkeeper. Caller is expected to also feed in the GK kit colors via
  // uniformPattern/uniformStripeColor (uniform_number = 3 in club_uniforms).
  isGoalkeeper?: boolean;
  // When true together with variant='full-back', renders just the jersey
  // (torso + name + number + crest), dropping head/arms/legs/shorts/feet so
  // the kit reads as a hanging shirt. Ignored for any other variant.
  backShirtOnly?: boolean;
  // Cosmetic equipment colors picked by the player at store-purchase time.
  // Boots take three independent colors:
  //   bootsColor          = main upper / body
  //   bootsColorSecondary = sole + outline
  //   bootsColorStuds     = pins under the sole
  // Each falls back independently to the cleat's default art when null.
  // gloveColor replaces the dark-gray fill of the goalkeeper glove.
  bootsColor?: string | null;
  bootsColorSecondary?: string | null;
  bootsColorStuds?: string | null;
  gloveColor?: string | null;
  // When true, the avatar renders gloves on the arm even for outfielders.
  // Driven by the "Luva de Inverno" cosmetic. For GKs it just unlocks the
  // alternate color + sleeve choice.
  hasWinterGlove?: boolean;
  // Sleeve length picked at equip time for the winter glove.
  // 'long' = full sleeve from shoulder to glove (default GK look).
  // 'short' = bare arm + just the glove on the hand.
  // Null falls back to 'long' for back-compat.
  winterGloveSleeve?: 'long' | 'short' | null;
  // Wristband (Munhequeira) — single-arm cosmetic. side picks which.
  wristbandColor?: string | null;
  wristbandSide?: 'left' | 'right' | null;
  // Biceps band — single-arm cosmetic, same model as wristband.
  bicepsBandColor?: string | null;
  bicepsBandSide?: 'left' | 'right' | null;
  // Caneleira (shin guards) — square pad on each shin.
  shinGuardColor?: string | null;
  // Long-socks toggle (Meião Comprido). When true, the avatar swaps the
  // short ankle sock for a tall sock that reaches up to the top of the
  // shin guard. Color stays the kit's secondary — no picker.
  hasLongSocks?: boolean;
}

const DEFAULT_PRIMARY = '#2a5a8a';
const DEFAULT_SECONDARY = '#ffffff';

// Coach formal attire palette — hardcoded black dress shirt, black pants,
// black dress shoes. Shared across every coach regardless of the club
// they manage so the role reads unambiguously on the pitch sidelines.
const COACH_SHIRT = '#111111';
const COACH_SHIRT_DETAIL = '#2a2a2a';
const COACH_PANTS = '#0d0d0d';
const COACH_SHOE = '#050505';

// Build avataaars options from PlayerAppearance. IDs must match DiceBear
// avataaars v9 schema exactly; probabilities must be forced to 100 when the
// player picked a specific option (schema defaults are 10 for accessories
// and facialHair, which is why those were invisible before).
function buildAvataaarsOptions(a: PlayerAppearance, clubPrimaryHex: string, seed: string, outfit: AvatarOutfit) {
  // Coach: black dress shirt (DiceBear blazerAndShirt gives a formal collar
  // hint at the neck, which is the only slice of DiceBear clothing our clip
  // leaves visible). Player: regular crew-neck sport jersey in club color.
  const isCoach = outfit === 'coach';
  const shirtHex = isCoach ? '111111' : clubPrimaryHex.replace('#', '');
  const isBald = a.hair === 'noHair';
  const hasFacialHair = a.facialHair && a.facialHair !== 'none';
  const hasAccessory = a.accessories && a.accessories !== 'none';

  const options: Record<string, unknown> = {
    seed,
    skinColor: [a.skinTone],
    hairColor: [a.hairColor],
    eyebrows: [a.eyebrows],
    eyes: [a.eyes],
    mouth: [a.mouth],
    nose: [a.nose || 'default'],
    clothing: [isCoach ? 'blazerAndShirt' : 'shirtCrewNeck'],
    clothesColor: [shirtHex],
    backgroundColor: ['transparent'],
  };

  if (isBald) {
    options.topProbability = 0;
  } else {
    options.top = [a.hair];
    options.topProbability = 100;
  }

  if (hasFacialHair) {
    options.facialHair = [a.facialHair];
    options.facialHairColor = [a.facialHairColor ?? a.hairColor];
    options.facialHairProbability = 100;
  } else {
    options.facialHairProbability = 0;
  }

  if (hasAccessory) {
    options.accessories = [a.accessories];
    options.accessoriesProbability = 100;
  } else {
    options.accessoriesProbability = 0;
  }

  return options as any;
}

export function PlayerAvatar({
  appearance,
  variant = 'face',
  height,
  clubPrimaryColor,
  clubSecondaryColor,
  clubCrestUrl,
  playerName,
  jerseyNumber,
  className,
  fallbackSeed,
  outfit = 'player',
  uniformPattern,
  uniformStripeColor,
  uniformNumberColor,
  isGoalkeeper = false,
  backShirtOnly = false,
  bootsColor = null,
  bootsColorSecondary = null,
  bootsColorStuds = null,
  gloveColor = null,
  hasWinterGlove = false,
  winterGloveSleeve = null,
  wristbandColor = null,
  wristbandSide = null,
  bicepsBandColor = null,
  bicepsBandSide = null,
  shinGuardColor = null,
  hasLongSocks = false,
}: PlayerAvatarProps) {
  const effective = appearance ?? DEFAULT_APPEARANCE;
  const isCoach = outfit === 'coach';
  // Coach outfit overrides any GK rendering — coaches are never goalkeepers.
  const isGK = !isCoach && isGoalkeeper;
  // Whether the avatar should show a gloved arm at all (long or short).
  // GKs always do; outfielders only when they bought the winter-glove
  // cosmetic. Coaches never (their blazer arm is its own treatment).
  const wearGloves = !isCoach && (isGK || hasWinterGlove);
  // True when the winter-glove cosmetic was equipped with the short-sleeve
  // option. Bare arm + glove only — wins over the long-sleeve render path.
  const shortSleeveGlove = !isCoach && hasWinterGlove && winterGloveSleeve === 'short';
  // Coach outfit is hardcoded black regardless of the club the coach manages,
  // so ignore the incoming club colors for clothing purposes.
  const primary = isCoach ? COACH_SHIRT : (clubPrimaryColor || DEFAULT_PRIMARY);
  const secondary = isCoach ? COACH_SHIRT_DETAIL : (clubSecondaryColor || DEFAULT_SECONDARY);
  const stripe = uniformStripeColor || secondary;
  const numberHex = isCoach
    ? readableForeground(primary)
    : (uniformNumberColor || readableForeground(primary));
  const pattern = isCoach ? 'solid' : (uniformPattern || 'solid');
  const seed = fallbackSeed ?? 'player';
  const clipId = useId().replace(/:/g, '_');

  const faceDataUri = useMemo(() => {
    const avatar = createAvatar(avataaars, buildAvataaarsOptions(effective, primary, seed, outfit));
    return avatar.toDataUri();
  }, [effective, primary, seed, outfit]);

  if (variant === 'face') {
    return (
      <div className={`relative overflow-hidden rounded-full ${className ?? ''}`}>
        <img src={faceDataUri} alt={playerName ?? 'Jogador'} className="w-full h-full object-cover" draggable={false} />
      </div>
    );
  }

  const scale = heightScale(height);
  const isBack = variant === 'full-back';
  const shirtOnly = isBack && backShirtOnly;

  // Back view crops out head + neck. Viewbox starts at y=114 so the shirt
  // fills the container, AND a clipPath at y>=114 is applied AFTER the
  // height-scale transform so that short players (scale<1, which pushes the
  // head down) and long-haired players (whose hair back extends below y=114
  // in source coords) never leak their head/hair into the cropped region.
  // Without the post-scale clip, a "Muito Baixo" player's head bottom would
  // land at y≈127 and be visible inside the 0:114:200:286 viewBox, and long
  // hair would drape down to y≈146 in normal height — both bugs that the
  // viewBox-swap alone could not catch.
  //
  // Front view: the height transform is anchored at the feet (y=400) and
  // scaled outward — so for tall archetypes (scale>1) the head extends ABOVE
  // y=0 in source coords (e.g. scale 1.12 → top ≈ -54). To avoid cropping
  // the top of the head, we widen the front viewBox upward by 60 units. The
  // value is fixed (not dynamic) so short and tall players keep the SAME
  // pixel scale in the same container — i.e. tall players still look
  // visibly taller, they just no longer get their head sliced off.
  const FRONT_HEAD_PAD = 60;
  // Shirt-only back view tightens the viewBox to just the torso (with a hair
  // of breathing room above for the collar shadow and below for the bottom
  // hem). Full back stays the original 0:114:200:286 frame so non-shirt-only
  // callers keep their layout unchanged.
  const viewBox = shirtOnly
    ? '48 108 104 134'
    : isBack
      ? '0 114 200 286'
      : `0 ${-FRONT_HEAD_PAD} 200 ${400 + FRONT_HEAD_PAD}`;
  const backCropId = `avBackCrop_${clipId}`;

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
        {isBack && !shirtOnly && (
          <defs>
            <clipPath id={backCropId}>
              {/* In user-space (post-transform) coords: keep only y >= 114. */}
              <rect x="0" y="114" width="200" height="286" />
            </clipPath>
          </defs>
        )}
        <g clipPath={isBack && !shirtOnly ? `url(#${backCropId})` : undefined}>
          <g transform={shirtOnly ? undefined : `translate(100 400) scale(${scale}) translate(-100 -400)`}>
            {isBack ? (
              <BackBody
                appearance={effective}
                primary={primary}
                secondary={secondary}
                stripe={stripe}
                pattern={pattern}
                numberHex={numberHex}
                playerName={playerName}
                jerseyNumber={jerseyNumber}
                crestUrl={clubCrestUrl}
                outfit={outfit}
                wearGloves={wearGloves}
                shortSleeveGlove={shortSleeveGlove}
                clipId={clipId}
                shirtOnly={shirtOnly}
                bootsColor={bootsColor}
                bootsColorSecondary={bootsColorSecondary}
                bootsColorStuds={bootsColorStuds}
                gloveColor={gloveColor}
                wristbandColor={wristbandColor}
                wristbandSide={wristbandSide}
                bicepsBandColor={bicepsBandColor}
                bicepsBandSide={bicepsBandSide}
                shinGuardColor={shinGuardColor}
                hasLongSocks={hasLongSocks}
              />
            ) : (
              <FrontBody
                faceDataUri={faceDataUri}
                primary={primary}
                secondary={secondary}
                stripe={stripe}
                pattern={pattern}
                numberHex={numberHex}
                skinTone={effective.skinTone}
                crestUrl={clubCrestUrl}
                jerseyNumber={jerseyNumber}
                clipId={`avClip_${clipId}`}
                hasLongHair={isLongHair(effective.hair)}
                hasBigBeard={isBigBeard(effective.facialHair)}
                outfit={outfit}
                wearGloves={wearGloves}
                shortSleeveGlove={shortSleeveGlove}
                bootsColor={bootsColor}
                bootsColorSecondary={bootsColorSecondary}
                bootsColorStuds={bootsColorStuds}
                gloveColor={gloveColor}
                wristbandColor={wristbandColor}
                wristbandSide={wristbandSide}
                bicepsBandColor={bicepsBandColor}
                bicepsBandSide={bicepsBandSide}
                shinGuardColor={shinGuardColor}
                hasLongSocks={hasLongSocks}
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}

// ── Repeating pattern <pattern> defs for striped jerseys.
// Mirrors the renderer in ManagerLineupPage so the avatar matches the kit
// editor preview byte-for-byte. `solid`, `bicolor_*` and `stripe_*_unique`
// don't return a <pattern> — they're drawn as overlay shapes inside the
// torso clip.
function getRepeatingPatternDef(pattern: string, shirt: string, stripe: string, id: string) {
  switch (pattern) {
    case 'stripe_vertical_single':
      return (<pattern id={id} width="20" height="96" patternUnits="userSpaceOnUse">
        <rect width="10" height="96" fill={shirt} /><rect x="10" width="10" height="96" fill={stripe} />
      </pattern>);
    case 'stripe_vertical_double':
      return (<pattern id={id} width="24" height="96" patternUnits="userSpaceOnUse">
        <rect width="8" height="96" fill={shirt} /><rect x="8" width="4" height="96" fill={stripe} />
        <rect x="12" width="8" height="96" fill={shirt} /><rect x="20" width="4" height="96" fill={stripe} />
      </pattern>);
    case 'stripe_vertical_triple':
      return (<pattern id={id} width="18" height="96" patternUnits="userSpaceOnUse">
        <rect width="4" height="96" fill={shirt} /><rect x="4" width="2" height="96" fill={stripe} />
        <rect x="6" width="4" height="96" fill={shirt} /><rect x="10" width="2" height="96" fill={stripe} />
        <rect x="12" width="4" height="96" fill={shirt} /><rect x="16" width="2" height="96" fill={stripe} />
      </pattern>);
    case 'stripe_horizontal_single':
      return (<pattern id={id} width="80" height="20" patternUnits="userSpaceOnUse">
        <rect width="80" height="10" fill={shirt} /><rect y="10" width="80" height="10" fill={stripe} />
      </pattern>);
    case 'stripe_horizontal_double':
      return (<pattern id={id} width="80" height="24" patternUnits="userSpaceOnUse">
        <rect width="80" height="8" fill={shirt} /><rect y="8" width="80" height="4" fill={stripe} />
        <rect y="12" width="80" height="8" fill={shirt} /><rect y="20" width="80" height="4" fill={stripe} />
      </pattern>);
    case 'stripe_horizontal_triple':
      return (<pattern id={id} width="80" height="18" patternUnits="userSpaceOnUse">
        <rect width="80" height="4" fill={shirt} /><rect y="4" width="80" height="2" fill={stripe} />
        <rect y="6" width="80" height="4" fill={shirt} /><rect y="10" width="80" height="2" fill={stripe} />
        <rect y="12" width="80" height="4" fill={shirt} /><rect y="16" width="80" height="2" fill={stripe} />
      </pattern>);
    case 'stripe_diagonal_single':
      return (<pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="14" fill={shirt} /><rect x="7" width="7" height="14" fill={stripe} />
      </pattern>);
    case 'stripe_diagonal_double':
      return (<pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="18" fill={shirt} /><rect x="6" width="3" height="18" fill={stripe} />
        <rect x="9" width="6" height="18" fill={shirt} /><rect x="15" width="3" height="18" fill={stripe} />
      </pattern>);
    case 'stripe_diagonal_triple':
      return (<pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="3" height="18" fill={shirt} /><rect x="3" width="3" height="18" fill={stripe} />
        <rect x="6" width="3" height="18" fill={shirt} /><rect x="9" width="3" height="18" fill={stripe} />
        <rect x="12" width="3" height="18" fill={shirt} /><rect x="15" width="3" height="18" fill={stripe} />
      </pattern>);
    default:
      return null;
  }
}

// ── Torso fill (front or back). Renders the kit base color, then layers the
// pattern (stripes/bicolor/unique stripe) clipped to the torso shape, then
// the side + center shadows the avatar already had for depth. Sleeves and
// shorts are drawn separately by the parent body component.
function TorsoPaint({
  primary,
  stripe,
  pattern,
  isCoach,
  patternId,
  torsoClipId,
}: {
  primary: string;
  stripe: string;
  pattern: string;
  isCoach: boolean;
  patternId: string;
  torsoClipId: string;
}) {
  // Torso bounding box used by all overlays.
  const X = 58, Y = 114, W = 84, H = 121;
  const isBicolor = pattern.startsWith('bicolor');
  const isUnique = pattern.endsWith('_unique');
  const isRepeating = !isBicolor && !isUnique && pattern !== 'solid';

  return (
    <>
      <defs>
        <clipPath id={torsoClipId}>
          <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" />
        </clipPath>
        {isRepeating && getRepeatingPatternDef(pattern, primary, stripe, patternId)}
      </defs>
      {/* Shape outline (catches anti-aliased edges so the curve stays clean) */}
      <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" fill={primary} />
      {/* Pattern fill, clipped to the torso shape */}
      <g clipPath={`url(#${torsoClipId})`}>
        {isBicolor ? (
          <>
            <rect x={X} y={Y} width={W} height={H} fill={primary} />
            {pattern === 'bicolor_horizontal' && (
              <rect x={X} y={Y + H / 2} width={W} height={H / 2} fill={stripe} />
            )}
            {pattern === 'bicolor_vertical' && (
              <rect x={X + W / 2} y={Y} width={W / 2} height={H} fill={stripe} />
            )}
            {pattern === 'bicolor_diagonal' && (
              <polygon points={`${X},${Y + H} ${X + W},${Y} ${X + W},${Y + H}`} fill={stripe} />
            )}
          </>
        ) : isUnique ? (
          <>
            <rect x={X} y={Y} width={W} height={H} fill={primary} />
            {pattern === 'stripe_vertical_unique' && (
              <rect x={X + W / 2 - 8} y={Y} width="16" height={H} fill={stripe} />
            )}
            {pattern === 'stripe_horizontal_unique' && (
              <rect x={X} y={Y + H / 2 - 7} width={W} height="14" fill={stripe} />
            )}
            {pattern === 'stripe_diagonal_unique' && (
              <polygon points={`${X},${Y + H - 16} ${X},${Y + H} ${X + W},${Y} ${X + W},${Y + 16}`} fill={stripe} />
            )}
          </>
        ) : isRepeating ? (
          <rect x={X} y={Y} width={W} height={H} fill={`url(#${patternId})`} />
        ) : (
          <rect x={X} y={Y} width={W} height={H} fill={primary} />
        )}
      </g>
      {/* Side + center shadows on top of the painted torso */}
      <path d="M 64 118 L 70 118 L 72 232 L 66 232 Z" fill="#000" opacity="0.14" />
      <path d="M 130 118 L 136 118 L 134 232 L 128 232 Z" fill="#000" opacity="0.14" />
      <path d="M 99 132 L 101 132 L 101 230 L 99 230 Z" fill="#000" opacity={isCoach ? 0.35 : 0.07} />
      <line x1="62" y1="234" x2="138" y2="234" stroke="#000" strokeWidth="1" opacity="0.18" />
    </>
  );
}

// ── Compact soccer cleat — roughly 28 wide × 10 tall, centered around x=82.
// Drawn as the left cleat; mirror horizontally for the right foot.
// Includes 4 small studs (travas) peeking below the sole for the cleat look.
function Cleat({
  primary, secondary, mirror = false,
  bootsColor, bootsColorSecondary, bootsColorStuds,
}: {
  primary: string; secondary: string; mirror?: boolean;
  bootsColor?: string | null; bootsColorSecondary?: string | null; bootsColorStuds?: string | null;
}) {
  // Cleats now take three independent custom colors. Each falls back
  // independently — picking only the upper still leaves the sole / studs
  // on their default art. The kit-side stripe stays the club secondary so
  // the player still visibly belongs to their club regardless of choice.
  const body = bootsColor || '#222';
  const sole = bootsColorSecondary || '#0a0a0a';
  const toe = bootsColor || primary;
  const stud = bootsColorStuds || '#000';
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Sole outline */}
      <path d="M 71 388 Q 68 388 68 385 L 68 382 Q 68 378 72 378 L 92 378 Q 96 378 96 381 L 96 385 Q 96 388 93 388 Z" fill={sole} />
      {/* Upper shoe */}
      <path d="M 71 383 Q 71 379 74 379 L 91 379 Q 95 379 95 382 L 95 384 L 71 384 Z" fill={body} />
      {/* Laces patch (always black for contrast) */}
      <path d="M 75 380 L 89 380 L 91 383 L 74 383 Z" fill="#000" />
      <line x1="76" y1="381" x2="89" y2="381" stroke="#000" strokeWidth="0.5" />
      {/* Side stripe (team secondary) */}
      <path d="M 70 385 L 94 385 L 93 387 L 71 387 Z" fill={secondary} opacity="0.85" />
      {/* Toe accent (team primary or custom boots color) */}
      <path d="M 91 379 Q 95 379 96 382 L 95 384 L 91 384 Z" fill={toe} opacity="0.9" />
      {/* Studs (travas) — 4 small bumps under the sole */}
      <ellipse cx="73" cy="389.5" rx="1.6" ry="1.4" fill={stud} />
      <ellipse cx="80" cy="389.5" rx="1.6" ry="1.4" fill={stud} />
      <ellipse cx="87" cy="389.5" rx="1.6" ry="1.4" fill={stud} />
      <ellipse cx="93" cy="389.5" rx="1.6" ry="1.4" fill={stud} />
    </g>
  );
}

// ── Coach dress shoe — plain black oxford with rounded toe, no studs/stripes.
function DressShoe({ mirror = false }: { mirror?: boolean }) {
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Sole */}
      <path d="M 66 388 Q 66 384 70 384 L 98 384 Q 102 384 102 388 L 100 392 Q 100 394 96 394 L 70 394 Q 66 394 66 390 Z" fill={COACH_SHOE} />
      {/* Upper */}
      <path d="M 70 384 Q 70 380 74 380 L 94 380 Q 100 380 100 384 L 100 388 L 70 388 Z" fill={COACH_SHIRT} />
      {/* Toe cap highlight */}
      <path d="M 88 381 L 96 381 Q 100 381 100 384 L 100 386 L 88 386 Z" fill={COACH_SHIRT_DETAIL} opacity="0.7" />
      {/* Heel seam */}
      <line x1="72" y1="383" x2="86" y2="383" stroke="#333" strokeWidth="0.4" opacity="0.7" />
    </g>
  );
}

// ── Coach long sleeve — black blazer arm from shoulder to wrist, skin hand.
function CoachArm({ skin, mirror = false }: { skin: string; mirror?: boolean }) {
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Full blazer sleeve from shoulder (y=114) to cuff (y=234). */}
      <path d="M 40 118 Q 36 124 36 136 L 38 232 Q 38 236 42 236 L 58 236 Q 62 236 62 232 L 60 124 Q 60 116 52 114 Q 44 114 40 118 Z"
            fill={COACH_SHIRT} />
      {/* Sleeve side shadow for a bit of form */}
      <path d="M 38 150 L 42 150 L 41 228 L 38 228 Z" fill="#000" opacity="0.25" />
      {/* Cuff */}
      <rect x="39" y="230" width="22" height="3" fill={COACH_SHIRT_DETAIL} />
      {/* Skin hand peeking out of the cuff */}
      <path d="M 42 236 L 58 236 Q 60 240 58 246 Q 56 252 50 252 Q 44 252 42 246 Q 40 240 42 236 Z" fill={skin} />
    </g>
  );
}

// ── Arm hanging at side of the body — sleeve (team color) + skin forearm + hand.
// Shoulder at y ≈ 114 (matches torso top which now continues from a smaller
// DiceBear collar). Left arm natural; mirror for right.
function Arm({ primary, secondary, skin, mirror = false }: { primary: string; secondary: string; skin: string; mirror?: boolean }) {
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Shoulder cap (deltoid) — rounded bump at top */}
      <path d="M 40 118 Q 36 124 36 136 L 40 158 L 60 158 L 60 124 Q 60 116 52 114 Q 44 114 40 118 Z" fill={primary} />
      {/* Sleeve hem (darker line marking where skin begins) */}
      <line x1="37" y1="158" x2="60" y2="158" stroke={secondary} strokeWidth="1" opacity="0.85" />
      {/* Upper skin arm (bicep) — starts where sleeve ends */}
      <path d="M 40 158 L 60 158 L 60 198 Q 60 200 54 200 L 44 200 Q 40 200 40 198 Z" fill={skin} />
      {/* Forearm — slightly tapered */}
      <path d="M 42 200 L 56 200 L 56 234 Q 56 236 52 236 L 48 236 Q 44 236 44 234 Z" fill={skin} />
      {/* Hand */}
      <path d="M 44 236 L 56 236 Q 58 239 57 244 Q 55 250 50 250 Q 45 250 43 244 Q 42 239 44 236 Z" fill={skin} />
    </g>
  );
}

// ── Goalkeeper arm — long sleeve in the GK kit color all the way to the
// wrist, plus a dark-gray glove (kept gray regardless of skin tone so the
// glove always reads as a glove). Shape mirrors the coach blazer sleeve so
// the silhouette stays coherent.
const GLOVE_COLOR = '#2a2a2a';
function GoalkeeperArm({ primary, secondary, mirror = false, gloveColor }: { primary: string; secondary: string; mirror?: boolean; gloveColor?: string | null }) {
  // When the GK has bought a glove with a custom color, paint the main glove
  // body with it. The highlight stripe inside the glove stays a fixed
  // mid-gray so the shape still reads in 3D against any glove color.
  const glove = gloveColor || GLOVE_COLOR;
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Full long sleeve from shoulder (y=114) down to the cuff (y=234) */}
      <path d="M 40 118 Q 36 124 36 136 L 38 232 Q 38 236 42 236 L 58 236 Q 62 236 62 232 L 60 124 Q 60 116 52 114 Q 44 114 40 118 Z"
            fill={primary} />
      {/* Side shadow for shape */}
      <path d="M 38 150 L 42 150 L 41 228 L 38 228 Z" fill="#000" opacity="0.18" />
      {/* Cuff band (secondary color trim) */}
      <rect x="39" y="230" width="22" height="3" fill={secondary} opacity="0.9" />
      {/* Glove — same outline as the regular hand. Color comes from the
          player's purchased glove (custom hex) or the default dark gray. */}
      <path d="M 42 236 L 58 236 Q 60 240 58 246 Q 56 252 50 252 Q 44 252 42 246 Q 40 240 42 236 Z" fill={glove} />
      <path d="M 44 240 L 56 240 Q 56 244 54 246 L 46 246 Q 44 244 44 240 Z" fill="#444" opacity="0.5" />
    </g>
  );
}

// ── Short-sleeve glove arm: the regular bare-skin Arm but the hand is
// painted as a glove (chosen color) with a small cuff line denoting where
// the glove begins. Used by the winter-glove cosmetic when the player
// picked "manga curta" — gives the goalie-glove look without the long
// sleeve so it reads as a fashion accessory rather than a kit.
function ShortSleeveGloveArm({ primary, secondary, skin, gloveColor, mirror = false }: { primary: string; secondary: string; skin: string; gloveColor: string | null; mirror?: boolean }) {
  const glove = gloveColor || GLOVE_COLOR;
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Shoulder cap (kit color) */}
      <path d="M 40 118 Q 36 124 36 136 L 40 158 L 60 158 L 60 124 Q 60 116 52 114 Q 44 114 40 118 Z" fill={primary} />
      {/* Sleeve hem (secondary trim) */}
      <line x1="37" y1="158" x2="60" y2="158" stroke={secondary} strokeWidth="1" opacity="0.85" />
      {/* Bicep + forearm (bare skin) */}
      <path d="M 40 158 L 60 158 L 60 198 Q 60 200 54 200 L 44 200 Q 40 200 40 198 Z" fill={skin} />
      <path d="M 42 200 L 56 200 L 56 234 Q 56 236 52 236 L 48 236 Q 44 236 44 234 Z" fill={skin} />
      {/* Glove cuff strip — sells the "the glove starts here" boundary so it
          doesn't look like dyed skin */}
      <rect x="42" y="234" width="14" height="2.5" fill={glove} />
      {/* Hand replaced by glove */}
      <path d="M 44 236 L 56 236 Q 58 239 57 244 Q 55 250 50 250 Q 45 250 43 244 Q 42 239 44 236 Z" fill={glove} />
      {/* Glove highlight for shape */}
      <path d="M 46 240 L 54 240 Q 54 243 52 244 L 48 244 Q 46 243 46 240 Z" fill="#fff" opacity="0.18" />
    </g>
  );
}

// ── Wristband (Munhequeira): a thin band hugging the wrist on one arm.
// `side` is FROM THE PLAYER'S PERSPECTIVE — 'left' means the player's left
// arm, which renders on the viewer's right (so we mirror). 'right' means
// the player's right arm, which is the natural unmirrored render.
// Drawn AFTER arms so it sits on top of the sleeve / cuff without being
// covered.
function Wristband({ color, side, wearGloves }: { color: string | null; side: 'left' | 'right' | null; wearGloves: boolean }) {
  if (!color || !side) return null;
  const mirror = side === 'left';
  // GK / winter-glove sleeves end at y=234 (cuff sits y=230-233). Bare arm
  // ends at the wrist around y=234. The band sits at y=229-234 right above
  // the cuff/wrist line. Width 16 + x=42 hugs the forearm bottom (which
  // ends at x=42..56) so it reads as wrapping the wrist, not a sleeve.
  const y = wearGloves ? 228 : 229;
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      <rect x="42" y={y} width="16" height="5" fill={color} rx="1" />
      <rect x="42" y={y + 0.8} width="16" height="1" fill="#fff" opacity="0.25" />
    </g>
  );
}

// ── Biceps band: a thinner strap higher on the arm, around the bicep.
// `side` follows the same player-perspective convention as Wristband.
function BicepsBand({ color, side, wearGloves }: { color: string | null; side: 'left' | 'right' | null; wearGloves: boolean }) {
  if (!color || !side) return null;
  const mirror = side === 'left';
  // Sleeve hem of the regular Arm sits at y=158 (skin starts there). Bicep
  // is roughly y=160-200. The band sits just below the sleeve at y=164.
  // For wearGloves arms (long sleeve from shoulder), the band overlays the
  // sleeve — still reads correctly because it's a different color.
  const y = wearGloves ? 164 : 162;
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      <rect x="38" y={y} width="24" height="6" fill={color} rx="1" />
      <rect x="38" y={y + 1} width="24" height="1.2" fill="#fff" opacity="0.22" />
    </g>
  );
}

// ── Shin guards (Caneleira): a square pad strapped over each shin, in the
// chosen color. Drawn BEFORE socks so the sock top still covers the lower
// edge of the pad like a real guard. Positioned just above the sock band.
function ShinGuards({ color, isCoach }: { color: string | null; isCoach: boolean }) {
  if (!color || isCoach) return null;
  // Front-of-leg coordinates: legs span x=72..92 (left) and 108..128 (right).
  // Sock top sits at y=360. Pad goes from y=320 to y=358 (38 tall, 16 wide).
  return (
    <>
      {/* Left shin pad */}
      <rect x="74" y="320" width="16" height="38" fill={color} rx="2" />
      {/* Strap shadow at top + bottom for a "buckled" look */}
      <rect x="74" y="322" width="16" height="2" fill="#000" opacity="0.18" />
      <rect x="74" y="354" width="16" height="2" fill="#000" opacity="0.18" />
      {/* Right shin pad (mirrored across x=100) */}
      <rect x="110" y="320" width="16" height="38" fill={color} rx="2" />
      <rect x="110" y="322" width="16" height="2" fill="#000" opacity="0.18" />
      <rect x="110" y="354" width="16" height="2" fill="#000" opacity="0.18" />
    </>
  );
}

// ── Front body: DiceBear portrait scaled small and CLIPPED at the collar
// so only head + neck + collar top survive. Everything from the collar
// downward (shoulders, torso, arms, body) is drawn by us for full control
// over proportions and team identity (crest, number). ──
function FrontBody({
  faceDataUri,
  primary,
  secondary,
  stripe,
  pattern,
  numberHex,
  skinTone,
  crestUrl,
  jerseyNumber,
  clipId,
  hasLongHair,
  hasBigBeard,
  outfit,
  wearGloves,
  shortSleeveGlove,
  bootsColor,
  bootsColorSecondary,
  bootsColorStuds,
  gloveColor,
  wristbandColor,
  wristbandSide,
  bicepsBandColor,
  bicepsBandSide,
  shinGuardColor,
  hasLongSocks,
}: {
  faceDataUri: string;
  primary: string;
  secondary: string;
  stripe: string;
  pattern: string;
  numberHex: string;
  skinTone: string;
  crestUrl: string | null | undefined;
  jerseyNumber: number | null | undefined;
  clipId: string;
  hasLongHair: boolean;
  hasBigBeard: boolean;
  outfit: AvatarOutfit;
  wearGloves: boolean;
  shortSleeveGlove: boolean;
  bootsColor: string | null;
  bootsColorSecondary: string | null;
  bootsColorStuds: string | null;
  gloveColor: string | null;
  wristbandColor: string | null;
  wristbandSide: 'left' | 'right' | null;
  bicepsBandColor: string | null;
  bicepsBandSide: 'left' | 'right' | null;
  shinGuardColor: string | null;
  hasLongSocks: boolean;
}) {
  const skin = `#${skinTone}`;
  const isCoach = outfit === 'coach';
  const torsoClipId = `torsoFront_${clipId}`;
  const patternId = `pat_front_${clipId}`;

  return (
    <>
      {/* ── Feet: dress shoes for coach, cleats for player ── */}
      {isCoach ? (
        <>
          <DressShoe />
          <DressShoe mirror />
        </>
      ) : (
        <>
          <Cleat primary={primary} secondary={secondary} bootsColor={bootsColor} bootsColorSecondary={bootsColorSecondary} bootsColorStuds={bootsColorStuds} />
          <Cleat primary={primary} secondary={secondary} bootsColor={bootsColor} bootsColorSecondary={bootsColorSecondary} bootsColorStuds={bootsColorStuds} mirror />
        </>
      )}

      {/* ── Socks — player only (coach's pants cover this region) ── */}
      {!isCoach && (
        <>
          <rect x="73" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
          <rect x="109" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
          <line x1="72" y1="366" x2="90" y2="366" stroke={primary} strokeWidth="1" opacity="0.5" />
          <line x1="110" y1="366" x2="128" y2="366" stroke={primary} strokeWidth="1" opacity="0.5" />
        </>
      )}

      {/* ── Legs: skin (player) or black trouser legs (coach) ── */}
      {isCoach ? (
        <>
          {/* Left trouser leg — extends slightly past the shoe line */}
          <path d="M 70 235 L 95 235 L 93 384 L 72 384 Z" fill={COACH_PANTS} />
          {/* Right trouser leg */}
          <path d="M 105 235 L 130 235 L 128 384 L 107 384 Z" fill={COACH_PANTS} />
          {/* Center seam for separation */}
          <line x1="100" y1="235" x2="100" y2="380" stroke="#000" strokeWidth="1" opacity="0.55" />
          {/* Subtle side highlights to avoid a flat silhouette */}
          <path d="M 71 240 L 74 240 L 73 380 L 72 380 Z" fill="#333" opacity="0.4" />
          <path d="M 126 240 L 129 240 L 128 380 L 127 380 Z" fill="#333" opacity="0.4" />
        </>
      ) : (
        <>
          <path d="M 72 285 L 92 285 L 91 359 L 73 359 Z" fill={skin} />
          <path d="M 108 286 L 128 285 L 127 359 L 109 359 Z" fill={skin} />
          <ellipse cx="82" cy="325" rx="8" ry="2.5" fill="#000" opacity="0.08" />
          <ellipse cx="118" cy="325" rx="8" ry="2.5" fill="#000" opacity="0.08" />
        </>
      )}

      {/* ── Long-sock extension (Meião Comprido) — covers the lower leg
          from the ankle band up to where the shin guard sits. Rendered
          AFTER legs so the kit-color sock paints over the skin, and
          BEFORE the shin guard so the guard still sits visibly on top. ── */}
      {!isCoach && hasLongSocks && (
        <>
          <rect x="73" y="320" width="18" height="40" fill={secondary} stroke={primary} strokeWidth="1.5" />
          <rect x="109" y="320" width="18" height="40" fill={secondary} stroke={primary} strokeWidth="1.5" />
          {/* Subtle horizontal stitch line at the top of the long sock */}
          <line x1="73" y1="324" x2="91" y2="324" stroke={primary} strokeWidth="1" opacity="0.5" />
          <line x1="109" y1="324" x2="127" y2="324" stroke={primary} strokeWidth="1" opacity="0.5" />
        </>
      )}

      {/* ── Shin guards (Caneleira) — sit on top of the leg skin (or the
          long sock when equipped), above the ankle band, with strap shadows
          for a buckled look. Drawn here so shorts (next) cover any visual
          artifact at the top edge. ── */}
      <ShinGuards color={shinGuardColor} isCoach={isCoach} />

      {/* ── Shorts — player only (coach wears trousers above) ── */}
      {!isCoach && (
        <>
          <path d="M 65 235 L 133 235 Q 137 235 137 240 L 135 290 L 100 287 L 65 290 L 63 240 Q 63 235 67 235 Z"
                fill={secondary} stroke={primary} strokeWidth="1.5" />
          <line x1="100" y1="235" x2="100" y2="288" stroke={primary} strokeWidth="1.5" opacity="0.55" />
        </>
      )}

      {/* ── Arms ── */}
      {isCoach ? (
        <>
          <CoachArm skin={skin} />
          <CoachArm skin={skin} mirror />
        </>
      ) : shortSleeveGlove ? (
        <>
          <ShortSleeveGloveArm primary={primary} secondary={secondary} skin={skin} gloveColor={gloveColor} />
          <ShortSleeveGloveArm primary={primary} secondary={secondary} skin={skin} gloveColor={gloveColor} mirror />
        </>
      ) : wearGloves ? (
        <>
          <GoalkeeperArm primary={primary} secondary={stripe} gloveColor={gloveColor} />
          <GoalkeeperArm primary={primary} secondary={stripe} gloveColor={gloveColor} mirror />
        </>
      ) : (
        <>
          <Arm primary={primary} secondary={secondary} skin={skin} />
          <Arm primary={primary} secondary={secondary} skin={skin} mirror />
        </>
      )}

      {/* ── Single-arm cosmetics drawn after arms so they sit on top of the
          sleeve / cuff. Coaches skip these — accessories don't apply to the
          formal blazer look. ── */}
      {!isCoach && (
        <>
          <Wristband color={wristbandColor} side={wristbandSide} wearGloves={wearGloves && !shortSleeveGlove} />
          <BicepsBand color={bicepsBandColor} side={bicepsBandSide} wearGloves={wearGloves && !shortSleeveGlove} />
        </>
      )}

      {/* ── Torso: athletic V-taper. TorsoPaint clips an internal pattern
          (stripes/bicolor) to the torso shape so non-solid kits read clearly.
          Top sits at the new shoulder line (y=114) and is narrower so it
          blends cleanly with DiceBear's neck/collar above. ── */}
      <TorsoPaint
        primary={primary}
        stripe={stripe}
        pattern={pattern}
        isCoach={isCoach}
        patternId={patternId}
        torsoClipId={torsoClipId}
      />

      {/* ── Coach-only lapels hinting at a blazer silhouette ── */}
      {isCoach && (
        <>
          {/* Left lapel */}
          <path d="M 90 116 L 100 128 L 96 150 L 82 124 Z" fill={COACH_SHIRT_DETAIL} opacity="0.9" />
          {/* Right lapel (mirrored) */}
          <path d="M 110 116 L 100 128 L 104 150 L 118 124 Z" fill={COACH_SHIRT_DETAIL} opacity="0.9" />
          {/* Dress shirt triangle peeking between lapels */}
          <path d="M 96 128 L 104 128 L 102 142 L 98 142 Z" fill="#f5f5f5" />
          {/* Subtle button */}
          <circle cx="100" cy="190" r="1.2" fill="#333" />
          <circle cx="100" cy="210" r="1.2" fill="#333" />
        </>
      )}

      {/* ── Crest + jersey number — player only ── */}
      {!isCoach && (crestUrl && crestUrl.startsWith('http') ? (
        <image href={crestUrl} x="70" y="140" width="25" height="25" preserveAspectRatio="xMidYMid meet" />
      ) : (
        !isCoach && <rect x="75" y="140" width="20" height="20" fill={secondary} opacity="0.55" rx="2" />
      ))}

      {!isCoach && jerseyNumber != null && (
        <text x="116" y="158" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="18" fill={numberHex}>
          {jerseyNumber}
        </text>
      )}

      {/* ── DiceBear portrait: show only head + neck (clip y <= 116), so the
          wider DiceBear shirt never competes with our custom shoulders below.
          The transition from DiceBear's narrow neck to our custom torso at
          y=114 reads naturally as "neck widening into shoulders". ── */}
      {/* Clip tightly to head+neck by default. For big beards we open a narrow
          central window so the beard can hang below the collar without
          covering the crest (y≥140) or jersey number (y≥146). For long hair
          we open two side bands OUTSIDE the torso (torso x=58–142) so the
          hair drapes over the shoulders without bleeding into the shirt
          artwork. */}
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="200" height="116" />
          {hasBigBeard && <rect x="80" y="116" width="40" height="18" />}
          {hasLongHair && (
            <>
              <rect x="20" y="116" width="40" height="44" />
              <rect x="140" y="116" width="40" height="44" />
            </>
          )}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image href={faceDataUri} x="20" y="-5" width="160" height="170" preserveAspectRatio="xMidYMid meet" />
      </g>
    </>
  );
}

// ── Back body: custom-drawn (DiceBear has no back view). Same proportions
// and placement as the front so the figure feels coherent when toggling. ──
function BackBody({
  appearance,
  primary,
  secondary,
  stripe,
  pattern,
  numberHex,
  playerName,
  jerseyNumber,
  crestUrl,
  outfit,
  wearGloves,
  shortSleeveGlove,
  clipId,
  shirtOnly,
  bootsColor,
  bootsColorSecondary,
  bootsColorStuds,
  gloveColor,
  wristbandColor,
  wristbandSide,
  bicepsBandColor,
  bicepsBandSide,
  shinGuardColor,
  hasLongSocks,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  stripe: string;
  pattern: string;
  numberHex: string;
  playerName: string | null | undefined;
  jerseyNumber: number | null | undefined;
  crestUrl: string | null | undefined;
  outfit: AvatarOutfit;
  wearGloves: boolean;
  shortSleeveGlove: boolean;
  clipId: string;
  shirtOnly: boolean;
  wristbandColor: string | null;
  wristbandSide: 'left' | 'right' | null;
  bicepsBandColor: string | null;
  bicepsBandSide: 'left' | 'right' | null;
  shinGuardColor: string | null;
  bootsColor: string | null;
  bootsColorSecondary: string | null;
  bootsColorStuds: string | null;
  gloveColor: string | null;
}) {
  const skin = `#${appearance.skinTone}`;
  const hair = `#${appearance.hairColor}`;
  const isBald = appearance.hair === 'noHair';
  const isCoach = outfit === 'coach';
  const torsoClipId = `torsoBack_${clipId}`;
  const patternId = `pat_back_${clipId}`;
  const isLong = appearance.hair.startsWith('straight')
    || appearance.hair === 'longButNotTooLong'
    || appearance.hair === 'curly'
    || appearance.hair === 'miaWallace'
    || appearance.hair === 'bob'
    || appearance.hair === 'bun'
    || appearance.hair === 'frida';

  const shirtBackName = firstName(playerName).toUpperCase().slice(0, 12);

  return (
    <>
      {/* In shirt-only mode we skip everything except the torso, the back
          collar shadow, and the name/number/crest tags so the result reads as
          a clean hanging jersey. */}
      {!shirtOnly && (
        <>
          {/* ── Feet ── */}
          {isCoach ? (
            <>
              <DressShoe mirror />
              <DressShoe />
            </>
          ) : (
            <>
              <Cleat primary={primary} secondary={secondary} bootsColor={bootsColor} bootsColorSecondary={bootsColorSecondary} bootsColorStuds={bootsColorStuds} mirror />
              <Cleat primary={primary} secondary={secondary} bootsColor={bootsColor} bootsColorSecondary={bootsColorSecondary} bootsColorStuds={bootsColorStuds} />
            </>
          )}

          {/* ── Socks — player only ── */}
          {!isCoach && (
            <>
              <rect x="73" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
              <rect x="109" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
            </>
          )}

          {/* ── Legs / trousers ── */}
          {isCoach ? (
            <>
              <path d="M 70 235 L 95 235 L 93 384 L 72 384 Z" fill={COACH_PANTS} />
              <path d="M 105 235 L 130 235 L 128 384 L 107 384 Z" fill={COACH_PANTS} />
              <line x1="100" y1="235" x2="100" y2="380" stroke="#000" strokeWidth="1" opacity="0.55" />
            </>
          ) : (
            <>
              <path d="M 72 285 L 92 285 L 91 359 L 73 359 Z" fill={skin} />
              <path d="M 108 286 L 128 285 L 127 359 L 109 359 Z" fill={skin} />
            </>
          )}

          {/* Long-sock extension on the back too */}
          {!isCoach && hasLongSocks && (
            <>
              <rect x="73" y="320" width="18" height="40" fill={secondary} stroke={primary} strokeWidth="1.5" />
              <rect x="109" y="320" width="18" height="40" fill={secondary} stroke={primary} strokeWidth="1.5" />
              <line x1="73" y1="324" x2="91" y2="324" stroke={primary} strokeWidth="1" opacity="0.5" />
              <line x1="109" y1="324" x2="127" y2="324" stroke={primary} strokeWidth="1" opacity="0.5" />
            </>
          )}

          {/* Shin guards visible on the back of the leg too */}
          <ShinGuards color={shinGuardColor} isCoach={isCoach} />

          {/* ── Shorts — player only ── */}
          {!isCoach && (
            <>
              <path d="M 65 235 L 133 235 Q 137 235 137 240 L 135 290 L 100 287 L 65 290 L 63 240 Q 63 235 67 235 Z"
                    fill={secondary} stroke={primary} strokeWidth="1.5" />
              <line x1="100" y1="235" x2="100" y2="288" stroke={primary} strokeWidth="1.5" opacity="0.55" />
            </>
          )}

          {/* ── Arms ── */}
          {isCoach ? (
            <>
              <CoachArm skin={skin} />
              <CoachArm skin={skin} mirror />
            </>
          ) : shortSleeveGlove ? (
            <>
              <ShortSleeveGloveArm primary={primary} secondary={secondary} skin={skin} gloveColor={gloveColor} />
              <ShortSleeveGloveArm primary={primary} secondary={secondary} skin={skin} gloveColor={gloveColor} mirror />
            </>
          ) : wearGloves ? (
            <>
              <GoalkeeperArm primary={primary} secondary={stripe} gloveColor={gloveColor} />
              <GoalkeeperArm primary={primary} secondary={stripe} gloveColor={gloveColor} mirror />
            </>
          ) : (
            <>
              <Arm primary={primary} secondary={secondary} skin={skin} />
              <Arm primary={primary} secondary={secondary} skin={skin} mirror />
            </>
          )}

          {/* Single-arm cosmetics on the back as well */}
          {!isCoach && (
            <>
              <Wristband color={wristbandColor} side={wristbandSide} wearGloves={wearGloves && !shortSleeveGlove} />
              <BicepsBand color={bicepsBandColor} side={bicepsBandSide} wearGloves={wearGloves && !shortSleeveGlove} />
            </>
          )}
        </>
      )}

      {/* ── Torso (same as front so toggling reads coherent). TorsoPaint
          handles solid/striped/bicolor kits. ── */}
      <TorsoPaint
        primary={primary}
        stripe={stripe}
        pattern={pattern}
        isCoach={isCoach}
        patternId={patternId}
        torsoClipId={torsoClipId}
      />
      {/* Collar/yoke shadow line on the back */}
      <path d="M 80 114 Q 100 122 120 114 L 118 118 Q 100 126 82 118 Z" fill="#000" opacity="0.22" />
      {/* Coach-only back center seam */}
      {isCoach && <line x1="100" y1="116" x2="100" y2="234" stroke="#000" strokeWidth="0.8" opacity="0.35" />}

      {/* ── First name + jersey number + crest — player only ── */}
      {!isCoach && shirtBackName && (
        <text
          x="100"
          y="138"
          textAnchor="middle"
          fontFamily="Arial Black, sans-serif"
          fontWeight="900"
          fontSize="11"
          letterSpacing="0.5"
          fill={numberHex}
          textLength={Math.min(80, shirtBackName.length * 8)}
          lengthAdjust="spacingAndGlyphs"
        >
          {shirtBackName}
        </text>
      )}

      {!isCoach && jerseyNumber != null && (
        <text x="100" y="190" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="42" fill={numberHex}>
          {jerseyNumber}
        </text>
      )}

      {!isCoach && crestUrl && crestUrl.startsWith('http') && (
        <image href={crestUrl} x="128" y="132" width="14" height="14" preserveAspectRatio="xMidYMid meet" />
      )}

      {!shirtOnly && (
        <>
          {/* ── Neck (wider, more athletic) ── */}
          <rect x="87" y="88" width="25" height="28" fill={skin} />
          {/* Neck shadow on the shirt collar line */}
          <path d="M 86 114 L 114 114 L 116 119 L 84 119 Z" fill="#000" opacity="0.25" />

          {/* ── Back of head: egg-shaped (rounded crown, tapering toward nape)
              instead of a perfect circle. Hair covers almost all of it so it
              doesn't read "bald". ── */}
          <path
            d="M 64 48 Q 64 12 100 12 Q 136 12 136 48 Q 136 84 126 90 L 74 90 Q 64 84 64 48 Z"
            fill={skin}
          />
          {!isBald && (
            <>
              {/* Hair cap covers nearly the entire back of the head, leaving only
                  a thin strip at the nape and tiny ear edges on the sides. */}
              <path
                d={isLong
                  ? 'M 60 48 Q 60 10 100 10 Q 140 10 140 48 L 140 140 Q 140 146 132 146 L 68 146 Q 60 146 60 140 Z'
                  : 'M 66 48 Q 66 12 100 12 Q 134 12 134 48 Q 134 84 126 88 L 74 88 Q 66 84 66 48 Z'
                }
                fill={hair}
              />
              {/* Top highlight */}
              <path
                d={isLong
                  ? 'M 74 24 Q 100 12 126 24 L 120 34 Q 100 24 80 34 Z'
                  : 'M 76 22 Q 100 14 124 22 L 118 30 Q 100 22 82 30 Z'
                }
                fill="#fff"
                opacity="0.1"
              />
              {/* Nape (hairline strip between hair and neck) — same hair tone, gives edge */}
              {!isLong && (
                <path d="M 74 86 Q 100 92 126 86 L 124 90 Q 100 94 76 90 Z" fill={hair} opacity="0.8" />
              )}
            </>
          )}
          {/* Ears peeking past the hair on the sides */}
          <ellipse cx="65" cy="56" rx="3" ry="6" fill={skin} />
          <ellipse cx="135" cy="56" rx="3" ry="6" fill={skin} />
        </>
      )}

      {/* Floating name label intentionally removed: back view is cropped to
          shirt-and-below (viewBox starts at y=114), so a label at y=9 would be
          outside the visible canvas. The jersey back already shows the first
          name, and callers render the full name in surrounding page UI. */}
    </>
  );
}
