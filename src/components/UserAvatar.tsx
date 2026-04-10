interface UserAvatarProps {
  avatarUrl?: string | null;
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

export function UserAvatar({ avatarUrl, username, size = 'sm', className = '', bgClass = 'bg-primary', fgClass = 'text-primary-foreground' }: UserAvatarProps) {
  const sizeClass = SIZES[size];

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