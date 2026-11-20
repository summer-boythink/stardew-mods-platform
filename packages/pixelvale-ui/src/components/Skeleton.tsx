import type { CSSProperties, HTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  variant?: 'text' | 'block';
  /** Number of text bars, clamped to 1–12. Ignored for block skeletons. */
  lines?: number;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  animated?: boolean;
}

/**
 * Decorative loading placeholder. The whole block is aria-hidden; expose a
 * separate live region or aria-busy state on the surrounding container.
 */
export function Skeleton({
  variant = 'text',
  lines = 1,
  width,
  height,
  animated = true,
  className,
  style,
  ...rest
}: SkeletonProps) {
  const requestedLines = Number.isFinite(lines) ? Math.floor(lines) : 1;
  const count = variant === 'block' ? 1 : Math.min(12, Math.max(1, requestedLines));
  const barStyle = height === undefined ? undefined : { height };

  return (
    <div
      className={cx(
        'pv-skeleton',
        `pv-skeleton--${variant}`,
        animated && 'pv-skeleton--animated',
        className,
      )}
      style={{ width, ...style }}
      {...rest}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="pv-skeleton__bar"
          style={
            index === count - 1 && count > 1 ? { ...barStyle, width: '62%' } : barStyle
          }
        />
      ))}
    </div>
  );
}
