import { useState } from 'react';

interface ClubCrestProps {
  crestUrl: string | null | undefined;
  primaryColor: string;
  secondaryColor: string;
  shortName: string;
  className?: string;
  textClassName?: string;
}

// Renders a club crest with the same fallback convention used for player avatars:
//   - null / undefined       → colored box with short_name
//   - 'emoji:<character>'    → big emoji on the colored box
//   - 'https://…'            → <img>, falling back to the colored box if it errors
export function ClubCrest({ crestUrl, primaryColor, secondaryColor, shortName, className, textClassName }: ClubCrestProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const isEmoji = typeof crestUrl === 'string' && crestUrl.startsWith('emoji:');
  const isImage = !isEmoji && typeof crestUrl === 'string' && /^https?:\/\//.test(crestUrl);
  const emoji = isEmoji ? crestUrl!.slice('emoji:'.length) : null;

  if (isImage && !imgFailed) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${className ?? ''}`}
        style={{ backgroundColor: primaryColor }}
      >
        <img
          src={crestUrl!}
          alt={shortName}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  if (isEmoji && emoji) {
    return (
      <div
        className={`flex items-center justify-center ${className ?? ''}`}
        style={{ backgroundColor: primaryColor }}
      >
        <span className="leading-none" style={{ fontSize: '70%' }}>{emoji}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center font-display font-extrabold ${className ?? ''} ${textClassName ?? ''}`}
      style={{ backgroundColor: primaryColor, color: secondaryColor }}
    >
      {shortName?.substring(0, 3) ?? '???'}
    </div>
  );
}
