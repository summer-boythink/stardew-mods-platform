import { useEffect, useState, type HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useLocale } from './PixelValeProvider';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';

const STATUS_KEY = {
  online: 'statusOnline',
  away: 'statusAway',
  busy: 'statusBusy',
  offline: 'statusOffline',
} as const;

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';

  // CJK names read better as two characters than a single initial.
  if (/^[\u3400-\u9fff·\s]+$/.test(trimmed) && /[\u3400-\u9fff]/.test(trimmed)) {
    return Array.from(trimmed).slice(0, 2).join('');
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? '')
    .join('');
}

export interface AvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  name: string;
  src?: string;
  /** Overrides the image accessible name. Pass an empty string for decorative images. */
  alt?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
}

/**
 * Pixel-framed avatar with a graceful initials fallback. Images are decoded
 * lazily and don't send a referrer; a failed load falls back to the initials.
 */
export function Avatar({
  name,
  src,
  alt,
  size = 'md',
  status,
  className,
  ...rest
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const { t } = useLocale();

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cx('pv-avatar', `pv-avatar--${size}`, className)}
      title={name}
      {...rest}
    >
      {showImage ? (
        <img
          className="pv-avatar__image"
          src={src}
          alt={alt ?? name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pv-avatar__fallback" role="img" aria-label={name}>
          {getInitials(name)}
        </span>
      )}
      {status ? (
        <>
          <span
            className={cx('pv-avatar__status', `pv-avatar__status--${status}`)}
            aria-hidden="true"
          />
          <span className="pv-sr-only">{t(STATUS_KEY[status])}</span>
        </>
      ) : null}
    </div>
  );
}
