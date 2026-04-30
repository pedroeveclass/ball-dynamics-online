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
}: PlayerAvatarProps) {
  const effective = appearance ?? DEFAULT_APPEARANCE;
  const isCoach = outfit === 'coach';
  // Coach outfit is hardcoded black regardless of the club the coach manages,
  // so ignore the incoming club colors for clothing purposes.
  const primary = isCoach ? COACH_SHIRT : (clubPrimaryColor || DEFAULT_PRIMARY);
  const secondary = isCoach ? COACH_SHIRT_DETAIL : (clubSecondaryColor || DEFAULT_SECONDARY);
  const shirtText = readableForeground(primary);
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
  const viewBox = isBack
    ? '0 114 200 286'
    : `0 ${-FRONT_HEAD_PAD} 200 ${400 + FRONT_HEAD_PAD}`;
  const backCropId = `avBackCrop_${clipId}`;

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
        {isBack && (
          <defs>
            <clipPath id={backCropId}>
              {/* In user-space (post-transform) coords: keep only y >= 114. */}
              <rect x="0" y="114" width="200" height="286" />
            </clipPath>
          </defs>
        )}
        <g clipPath={isBack ? `url(#${backCropId})` : undefined}>
          <g transform={`translate(100 400) scale(${scale}) translate(-100 -400)`}>
            {isBack ? (
              <BackBody
                appearance={effective}
                primary={primary}
                secondary={secondary}
                shirtText={shirtText}
                playerName={playerName}
                jerseyNumber={jerseyNumber}
                crestUrl={clubCrestUrl}
                outfit={outfit}
              />
            ) : (
              <FrontBody
                faceDataUri={faceDataUri}
                primary={primary}
                secondary={secondary}
                skinTone={effective.skinTone}
                shirtText={shirtText}
                crestUrl={clubCrestUrl}
                jerseyNumber={jerseyNumber}
                clipId={`avClip_${clipId}`}
                hasLongHair={isLongHair(effective.hair)}
                hasBigBeard={isBigBeard(effective.facialHair)}
                outfit={outfit}
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}

// ── Compact soccer cleat — roughly 28 wide × 10 tall, centered around x=82.
// Drawn as the left cleat; mirror horizontally for the right foot.
// Includes 4 small studs (travas) peeking below the sole for the cleat look.
function Cleat({ primary, secondary, mirror = false }: { primary: string; secondary: string; mirror?: boolean }) {
  return (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* Sole outline */}
      <path d="M 71 388 Q 68 388 68 385 L 68 382 Q 68 378 72 378 L 92 378 Q 96 378 96 381 L 96 385 Q 96 388 93 388 Z" fill="#0a0a0a" />
      {/* Upper shoe */}
      <path d="M 71 383 Q 71 379 74 379 L 91 379 Q 95 379 95 382 L 95 384 L 71 384 Z" fill="#222" />
      {/* Laces patch */}
      <path d="M 75 380 L 89 380 L 91 383 L 74 383 Z" fill="#2f2f2f" />
      <line x1="76" y1="381" x2="89" y2="381" stroke="#555" strokeWidth="0.5" />
      {/* Side stripe (team secondary) */}
      <path d="M 70 385 L 94 385 L 93 387 L 71 387 Z" fill={secondary} opacity="0.85" />
      {/* Toe accent (team primary) */}
      <path d="M 91 379 Q 95 379 96 382 L 95 384 L 91 384 Z" fill={primary} opacity="0.9" />
      {/* Studs (travas) — 4 small bumps under the sole */}
      <ellipse cx="73" cy="389.5" rx="1.6" ry="1.4" fill="#000" />
      <ellipse cx="80" cy="389.5" rx="1.6" ry="1.4" fill="#000" />
      <ellipse cx="87" cy="389.5" rx="1.6" ry="1.4" fill="#000" />
      <ellipse cx="93" cy="389.5" rx="1.6" ry="1.4" fill="#000" />
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

// ── Front body: DiceBear portrait scaled small and CLIPPED at the collar
// so only head + neck + collar top survive. Everything from the collar
// downward (shoulders, torso, arms, body) is drawn by us for full control
// over proportions and team identity (crest, number). ──
function FrontBody({
  faceDataUri,
  primary,
  secondary,
  skinTone,
  shirtText,
  crestUrl,
  jerseyNumber,
  clipId,
  hasLongHair,
  hasBigBeard,
  outfit,
}: {
  faceDataUri: string;
  primary: string;
  secondary: string;
  skinTone: string;
  shirtText: string;
  crestUrl: string | null | undefined;
  jerseyNumber: number | null | undefined;
  clipId: string;
  hasLongHair: boolean;
  hasBigBeard: boolean;
  outfit: AvatarOutfit;
}) {
  const skin = `#${skinTone}`;
  const isCoach = outfit === 'coach';

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
          <Cleat primary={primary} secondary={secondary} />
          <Cleat primary={primary} secondary={secondary} mirror />
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
      ) : (
        <>
          <Arm primary={primary} secondary={secondary} skin={skin} />
          <Arm primary={primary} secondary={secondary} skin={skin} mirror />
        </>
      )}

      {/* ── Torso: athletic V-taper. Top sits at the new shoulder line (y=114)
          and is narrower so it blends cleanly with DiceBear's neck/collar
          above. Bottom (62-138 = 76 px) matches the shorts width. ── */}
      <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" fill={primary} />
      {/* Side shadows for depth — sit fully inside the shirt edges */}
      <path d="M 64 118 L 70 118 L 72 232 L 66 232 Z" fill="#000" opacity="0.14" />
      <path d="M 130 118 L 136 118 L 134 232 L 128 232 Z" fill="#000" opacity="0.14" />
      {/* Chest centerline shadow (subtle) */}
      <path d="M 99 132 L 101 132 L 101 230 L 99 230 Z" fill="#000" opacity={isCoach ? 0.35 : 0.07} />
      {/* Shirt hem */}
      <line x1="62" y1="234" x2="138" y2="234" stroke="#000" strokeWidth="1" opacity="0.18" />

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
              fontWeight="900" fontSize="18" fill={shirtText}>
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
  shirtText,
  playerName,
  jerseyNumber,
  crestUrl,
  outfit,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  shirtText: string;
  playerName: string | null | undefined;
  jerseyNumber: number | null | undefined;
  crestUrl: string | null | undefined;
  outfit: AvatarOutfit;
}) {
  const skin = `#${appearance.skinTone}`;
  const hair = `#${appearance.hairColor}`;
  const isBald = appearance.hair === 'noHair';
  const isCoach = outfit === 'coach';
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
      {/* ── Feet ── */}
      {isCoach ? (
        <>
          <DressShoe mirror />
          <DressShoe />
        </>
      ) : (
        <>
          <Cleat primary={primary} secondary={secondary} mirror />
          <Cleat primary={primary} secondary={secondary} />
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
      ) : (
        <>
          <Arm primary={primary} secondary={secondary} skin={skin} />
          <Arm primary={primary} secondary={secondary} skin={skin} mirror />
        </>
      )}

      {/* ── Torso (same as front so toggling reads coherent) ── */}
      <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" fill={primary} />
      <path d="M 64 118 L 70 118 L 72 232 L 66 232 Z" fill="#000" opacity="0.14" />
      <path d="M 130 118 L 136 118 L 134 232 L 128 232 Z" fill="#000" opacity="0.14" />
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
          fill={shirtText}
          textLength={Math.min(80, shirtBackName.length * 8)}
          lengthAdjust="spacingAndGlyphs"
        >
          {shirtBackName}
        </text>
      )}

      {!isCoach && jerseyNumber != null && (
        <text x="100" y="190" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="42" fill={shirtText}>
          {jerseyNumber}
        </text>
      )}

      {!isCoach && crestUrl && crestUrl.startsWith('http') && (
        <image href={crestUrl} x="128" y="132" width="14" height="14" preserveAspectRatio="xMidYMid meet" />
      )}

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

      {/* Floating name label intentionally removed: back view is cropped to
          shirt-and-below (viewBox starts at y=114), so a label at y=9 would be
          outside the visible canvas. The jersey back already shows the first
          name, and callers render the full name in surrounding page UI. */}
    </>
  );
}
