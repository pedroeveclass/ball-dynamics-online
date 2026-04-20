import { useEffect, useState } from 'react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { resolveCharAvatar, type ResolvedCharAvatar } from '@/lib/charAvatar';

interface UserAvatarProps {
  avatarUrl?: string | null;
  /**
   * Optional "use character avatar" reference. When set, takes precedence
   * over avatarUrl and renders the selected character's <PlayerAvatar />
   * so appearance / club color edits reflow automatically.
   * Shape: "player:<uuid>" or "manager:<uuid>".
   */
  charRef?: string | null;
  username?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  bgClass?: string;
  fgClass?: string;
}

const SIZES = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-16 w-16 text-xl',
};

export function UserAvatar({ avatarUrl, charRef, username, size = 'sm', className = '', bgClass = 'bg-primary', fgClass = 'text-primary-foreground' }: UserAvatarProps) {
  const sizeClass = SIZES[size];
  const [resolved, setResolved] = useState<ResolvedCharAvatar | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!charRef) {
      setResolved(null);
      return () => { cancelled = true; };
    }
    setResolving(true);
    resolveCharAvatar(charRef).then(r => {
      if (!cancelled) {
        setResolved(r);
        setResolving(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setResolved(null);
        setResolving(false);
      }
    });
    return () => { cancelled = true; };
  }, [charRef]);

  // 1) Character-based avatar takes priority when available.
  if (charRef && resolved) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden bg-card flex items-center justify-center ${className}`}>
        <PlayerAvatar
          appearance={resolved.appearance}
          variant="face"
          clubPrimaryColor={resolved.clubPrimaryColor}
          clubSecondaryColor={resolved.clubSecondaryColor}
          playerName={resolved.fullName}
          fallbackSeed={resolved.id}
          className="h-full w-full"
        />
      </div>
    );
  }

  // 2) While the char ref is resolving, show a neutral placeholder so the
  //    UI doesn't flicker between initial → char.
  if (charRef && resolving) {
    return (
      <div className={`${sizeClass} rounded-full ${bgClass} flex items-center justify-center animate-pulse ${className}`} />
    );
  }

  // 3) If the char ref failed to resolve (character deleted, wrong id),
  //    gracefully fall through to the legacy avatar_url / initial below.

  if (avatarUrl?.startsWith('emoji:')) {
    const emoji = avatarUrl.replace('emoji:', '');
    return (
      <div className={`${sizeClass} rounded-full ${bgClass} flex items-center justify-center ${className}`}>
        <span className={size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-base'}>{emoji}</span>
      </div>
    );
  }

  if (avatarUrl && (() => {
    try { const u = new URL(avatarUrl); return u.protocol === 'https:' || u.protocol === 'http:'; }
    catch { return false; }
  })()) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden ${className}`}>
        <img src={avatarUrl} alt={username || 'Avatar'} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-full ${bgClass} flex items-center justify-center ${className}`}>
      <span className={`${fgClass} font-display font-bold`}>
        {username?.[0]?.toUpperCase() || '?'}
      </span>
    </div>
  );
}
