import { useId, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import { PlayerAppearance, DEFAULT_APPEARANCE, heightScale, readableForeground, firstName } from '@/lib/avatar';

export type AvatarVariant = 'face' | 'full-front' | 'full-back';

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
}

const DEFAULT_PRIMARY = '#2a5a8a';
const DEFAULT_SECONDARY = '#ffffff';

// Build avataaars options from PlayerAppearance. IDs must match DiceBear
// avataaars v9 schema exactly; probabilities must be forced to 100 when the
// player picked a specific option (schema defaults are 10 for accessories
// and facialHair, which is why those were invisible before).
function buildAvataaarsOptions(a: PlayerAppearance, clubPrimaryHex: string, seed: string) {
  const shirtHex = clubPrimaryHex.replace('#', '');
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
    clothing: ['shirtCrewNeck'],
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
}: PlayerAvatarProps) {
  const effective = appearance ?? DEFAULT_APPEARANCE;
  const primary = clubPrimaryColor || DEFAULT_PRIMARY;
  const secondary = clubSecondaryColor || DEFAULT_SECONDARY;
  const shirtText = readableForeground(primary);
  const seed = fallbackSeed ?? 'player';
  const clipId = useId().replace(/:/g, '_');

  const faceDataUri = useMemo(() => {
    const avatar = createAvatar(avataaars, buildAvataaarsOptions(effective, primary, seed));
    return avatar.toDataUri();
  }, [effective, primary, seed]);

  if (variant === 'face') {
    return (
      <div className={`relative overflow-hidden rounded-full ${className ?? ''}`}>
        <img src={faceDataUri} alt={playerName ?? 'Jogador'} className="w-full h-full object-cover" draggable={false} />
      </div>
    );
  }

  const scale = heightScale(height);
  const isBack = variant === 'full-back';

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
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
            />
          )}
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
}: {
  faceDataUri: string;
  primary: string;
  secondary: string;
  skinTone: string;
  shirtText: string;
  crestUrl: string | null | undefined;
  jerseyNumber: number | null | undefined;
  clipId: string;
}) {
  const skin = `#${skinTone}`;

  return (
    <>
      {/* ── Feet first: cleats ── */}
      <Cleat primary={primary} secondary={secondary} />
      <Cleat primary={primary} secondary={secondary} mirror />

      {/* ── Socks (shorter and slightly narrower) ── */}
      <rect x="73" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
      <rect x="109" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
      <line x1="72" y1="366" x2="90" y2="366" stroke={primary} strokeWidth="1" opacity="0.5" />
      <line x1="110" y1="366" x2="128" y2="366" stroke={primary} strokeWidth="1" opacity="0.5" />

      {/* ── Legs (tapered, athletic) ── */}
      <path d="M 72 285 L 92 285 L 91 359 L 73 359 Z" fill={skin} />
      <path d="M 108 286 L 128 285 L 127 359 L 109 359 Z" fill={skin} />
      <ellipse cx="82" cy="325" rx="8" ry="2.5" fill="#000" opacity="0.08" />
      <ellipse cx="118" cy="325" rx="8" ry="2.5" fill="#000" opacity="0.08" />

      {/* ── Shorts ── */}
      <path d="M 65 235 L 133 235 Q 137 235 137 240 L 135 290 L 100 287 L 65 290 L 63 240 Q 63 235 67 235 Z"
            fill={secondary} stroke={primary} strokeWidth="1.5" />
      <line x1="100" y1="235" x2="100" y2="288" stroke={primary} strokeWidth="1.5" opacity="0.55" />

      {/* ── Arms hanging at sides (shoulders at y ≈ 130 matching torso top) ── */}
      <Arm primary={primary} secondary={secondary} skin={skin} />
      <Arm primary={primary} secondary={secondary} skin={skin} mirror />

      {/* ── Torso: athletic V-taper. Top sits at the new shoulder line (y=114)
          and is narrower so it blends cleanly with DiceBear's neck/collar
          above. Bottom (62-138 = 76 px) matches the shorts width. ── */}
      <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" fill={primary} />
      {/* Side shadows for depth — sit fully inside the shirt edges */}
      <path d="M 64 118 L 70 118 L 72 232 L 66 232 Z" fill="#000" opacity="0.14" />
      <path d="M 130 118 L 136 118 L 134 232 L 128 232 Z" fill="#000" opacity="0.14" />
      {/* Chest centerline shadow (subtle) */}
      <path d="M 99 132 L 101 132 L 101 230 L 99 230 Z" fill="#000" opacity="0.07" />
      {/* Shirt hem */}
      <line x1="62" y1="234" x2="138" y2="234" stroke="#000" strokeWidth="1" opacity="0.18" />

      {/* ── Crest on left chest ── */}
      {crestUrl && crestUrl.startsWith('http') ? (
        <image href={crestUrl} x="62" y="155" width="22" height="22" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <rect x="75" y="140" width="20" height="20" fill={secondary} opacity="0.55" rx="2" />
      )}

      {/* ── Jersey number on right chest ── */}
      {jerseyNumber != null && (
        <text x="118" y="158" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="20" fill={shirtText}>
          {jerseyNumber}
        </text>
      )}

      {/* ── DiceBear portrait: show only head + neck (clip y <= 116), so the
          wider DiceBear shirt never competes with our custom shoulders below.
          The transition from DiceBear's narrow neck to our custom torso at
          y=114 reads naturally as "neck widening into shoulders". ── */}
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="200" height="116" />
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
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  shirtText: string;
  playerName: string | null | undefined;
  jerseyNumber: number | null | undefined;
  crestUrl: string | null | undefined;
}) {
  const skin = `#${appearance.skinTone}`;
  const hair = `#${appearance.hairColor}`;
  const isBald = appearance.hair === 'noHair';
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
      <Cleat primary={primary} secondary={secondary} mirror />
      <Cleat primary={primary} secondary={secondary} />

      {/* ── Socks (same as front) ── */}
      <rect x="73" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />
      <rect x="109" y="360" width="18" height="16" fill={secondary} stroke={primary} strokeWidth="1.5" />

      {/* ── Legs (same as front) ── */}
      <path d="M 72 285 L 92 285 L 91 359 L 73 359 Z" fill={skin} />
      <path d="M 108 286 L 128 285 L 127 359 L 109 359 Z" fill={skin} />

      {/* ── Shorts (same as front) ── */}
      <path d="M 65 235 L 133 235 Q 137 235 137 240 L 135 290 L 100 287 L 65 290 L 63 240 Q 63 235 67 235 Z"
            fill={secondary} stroke={primary} strokeWidth="1.5" />
      <line x1="100" y1="235" x2="100" y2="288" stroke={primary} strokeWidth="1.5" opacity="0.55" />

      {/* ── Arms ── */}
      <Arm primary={primary} secondary={secondary} skin={skin} />
      <Arm primary={primary} secondary={secondary} skin={skin} mirror />

      {/* ── Torso (same as front so toggling reads coherent) ── */}
      <path d="M 58 116 Q 58 114 62 114 L 138 114 Q 142 114 142 116 L 136 235 L 64 235 Z" fill={primary} />
      <path d="M 64 118 L 70 118 L 72 232 L 66 232 Z" fill="#000" opacity="0.14" />
      <path d="M 130 118 L 136 118 L 134 232 L 128 232 Z" fill="#000" opacity="0.14" />
      {/* Collar/yoke shadow line on the back */}
      <path d="M 80 114 Q 100 122 120 114 L 118 118 Q 100 126 82 118 Z" fill="#000" opacity="0.22" />

      {/* ── First name across the top of the shirt back ── */}
      {shirtBackName && (
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

      {/* ── Big jersey number centered on the back ── */}
      {jerseyNumber != null && (
        <text x="100" y="190" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="42" fill={shirtText}>
          {jerseyNumber}
        </text>
      )}

      {/* ── Small crest on the upper-right back ── */}
      {crestUrl && crestUrl.startsWith('http') && (
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

      {/* Full name floating above (back view keeps label like before) */}
      {playerName && (
        <text x="100" y="9" textAnchor="middle" fontFamily="Arial Black, sans-serif"
              fontWeight="900" fontSize="11" fill="currentColor">
          {playerName}
        </text>
      )}
    </>
  );
}
