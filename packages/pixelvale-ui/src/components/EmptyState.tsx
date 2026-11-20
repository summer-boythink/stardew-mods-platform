import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { PixelIcon } from './PixelIcon';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  action?: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * Centered placeholder for empty collections, with a decorative illustration
 * and an optional action. The illustration is hidden from assistive technology.
 */
export function EmptyState({
  title,
  description,
  illustration,
  action,
  size = 'md',
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={cx('pv-empty-state', `pv-empty-state--${size}`, className)} {...rest}>
      <div className="pv-empty-state__art" aria-hidden="true">
        {illustration ?? <PixelIcon name="leaf" size={size === 'sm' ? 26 : 34} />}
      </div>
      <p className="pv-empty-state__title">{title}</p>
      {description ? <p className="pv-empty-state__description">{description}</p> : null}
      {action ? <div className="pv-empty-state__action">{action}</div> : null}
    </div>
  );
}
