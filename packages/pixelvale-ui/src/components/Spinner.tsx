import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useLocale } from './PixelValeProvider';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTone = 'default' | 'gold' | 'green' | 'red' | 'blue';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Screen-reader label. Defaults to the localized "Loading". */
  label?: string;
  showLabel?: boolean;
  size?: SpinnerSize;
  tone?: SpinnerTone;
}

/**
 * Pixel loading indicator with a status role. The label stays available to
 * assistive technology even when only the spinner is visible.
 */
export function Spinner({
  label,
  showLabel = false,
  size = 'md',
  tone = 'default',
  className,
  ...rest
}: SpinnerProps) {
  const { t } = useLocale();
  const text = label ?? t('loading');

  return (
    <span
      role="status"
      aria-label={text}
      className={cx(
        'pv-spinner',
        `pv-spinner--${size}`,
        `pv-spinner--${tone}`,
        className,
      )}
      {...rest}
    >
      <span className="pv-spinner__dial" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={cx('pv-spinner__label', !showLabel && 'pv-sr-only')}>{text}</span>
    </span>
  );
}
