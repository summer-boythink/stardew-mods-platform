import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

export interface StatProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
}

/**
 * Compact metric block for farm snapshots and dashboards. It keeps the label
 * and hint small while giving the value a strong pixel headline.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
  ...rest
}: StatProps) {
  return (
    <div className={cx('pv-stat', `pv-stat--${tone}`, className)} {...rest}>
      {icon ? (
        <span className="pv-stat__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="pv-stat__body">
        <span className="pv-stat__label">{label}</span>
        <strong className="pv-stat__value">{value}</strong>
        {hint ? <span className="pv-stat__hint">{hint}</span> : null}
      </div>
    </div>
  );
}
