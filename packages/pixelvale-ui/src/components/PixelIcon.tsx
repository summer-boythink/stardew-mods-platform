import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/cx';

export type PixelIconName =
  | 'close'
  | 'check'
  | 'plus'
  | 'minus'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-right'
  | 'sun'
  | 'moon'
  | 'volume-on'
  | 'volume-off'
  | 'info'
  | 'alert'
  | 'star'
  | 'star-filled'
  | 'search'
  | 'heart'
  | 'bolt'
  | 'clock'
  | 'leaf'
  | 'sparkle'
  | 'calendar'
  | 'upload'
  | 'file';

const ICONS: Record<PixelIconName, ReactNode> = {
  close: <path d="M6 6 18 18M18 6 6 18" />,
  check: <path d="M4.5 12.5 10 18 19.5 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  'chevron-down': <path d="M6 9 12 15 18 9" />,
  'chevron-up': <path d="M6 15 12 9 18 15" />,
  'chevron-left': <path d="M15 6 9 12 15 18" />,
  'chevron-right': <path d="M9 6 15 12 9 18" />,
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  sun: (
    <>
      <path d="M9 9h6v6H9z" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  moon: <path d="M15.5 4.2A8 8 0 1 0 15.5 19.8 8.7 8.7 0 0 1 15.5 4.2Z" />,
  'volume-on': (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15 9.5l2.5 2.5-2.5 2.5M18.5 7l4 5-4 5" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M16 9l6 6M22 9l-6 6" />
    </>
  ),
  info: (
    <>
      <path d="M12 3 18 5 21 12 18 19 12 21 6 19 3 12 6 5Z" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 22 21H2Z" />
      <path d="M12 9v6M12 18v.5" />
    </>
  ),
  star: (
    <path d="M12 3 14.2 9 20.5 9 15.4 13 17.4 19.7 12 15.8 6.6 19.7 8.6 13 3.5 9 9.8 9Z" />
  ),
  'star-filled': (
    <path
      d="M12 3 14.2 9 20.5 9 15.4 13 17.4 19.7 12 15.8 6.6 19.7 8.6 13 3.5 9 9.8 9Z"
      fill="currentColor"
    />
  ),
  search: (
    <>
      <path d="M10 3 15 5 17 10 15 15 10 17 5 15 3 10 5 5Z" />
      <path d="M15 15 21 21" />
    </>
  ),
  heart: <path d="M12 20 4.5 12.5V8L7 5.5h3L12 8l2-2.5h3L19.5 8v4.5Z" />,
  bolt: <path d="M13 2 5 14h6l-1 8 9-13h-6z" fill="currentColor" />,
  clock: (
    <>
      <path d="M12 3 18 5 21 12 18 19 12 21 6 19 3 12 6 5Z" />
      <path d="M12 7v5h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20C4 11 10 4 20 4c0 10-7 16-16 16Z" />
      <path d="M6 18 16 8" />
    </>
  ),
  sparkle: (
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
  ),
  calendar: (
    <>
      <path d="M4 6h16v15H4z" />
      <path d="M4 10h16M8 3v4M16 3v4" />
      <path d="M8 14h2M12 14h2M16 14h2M8 17h2M12 17h2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v4h16v-4" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
};

export interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  /** When provided the icon is exposed as an image with this accessible name. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function PixelIcon({ name, size = 18, title, className, style }: PixelIconProps) {
  return (
    <svg
      className={cx('pv-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={style}
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
}
