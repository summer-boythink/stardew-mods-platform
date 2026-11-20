import {
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  max?: number;
  label?: ReactNode;
  readOnly?: boolean;
  disabled?: boolean;
  /** Clicking the selected star clears the rating back to zero. */
  allowClear?: boolean;
  size?: RatingSize;
  showValue?: boolean;
}

/**
 * Star rating with radiogroup semantics. Arrow keys move the selection, Space
 * or Enter selects the focused star, and hover only previews the fill.
 */
export function Rating({
  value,
  defaultValue,
  onValueChange,
  max = 5,
  label,
  readOnly = false,
  disabled = false,
  allowClear = false,
  size = 'md',
  showValue = false,
  className,
  'aria-label': ariaLabel,
  ...rest
}: RatingProps) {
  const generatedId = useId();
  const labelId = `pv-rating-${generatedId}-label`;
  const safeMax = Math.min(10, Math.max(1, Math.round(max)));
  const clamp = (candidate: number) =>
    Math.min(
      safeMax,
      Math.max(0, Math.round(Number.isFinite(candidate) ? candidate : 0)),
    );

  const [current, setCurrent] = useControllableState<number>({
    value,
    defaultValue: clamp(defaultValue ?? 0),
    onChange: onValueChange,
  });
  const [hover, setHover] = useState<number | null>(null);
  const { t } = useLocale();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const { play } = useSound();

  const displayValue = clamp(current);
  const fillValue = hover ?? displayValue;
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 23 : 19;
  const stars = Array.from({ length: safeMax }, (_, index) => index + 1);
  const tabbableIndex = displayValue > 0 ? displayValue - 1 : 0;

  const update = (next: number, focus: boolean) => {
    const clamped = clamp(next);
    if (clamped !== displayValue) {
      setCurrent(clamped);
      play('toggle');
    }
    if (focus && clamped > 0) refs.current[clamped - 1]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, star: number) => {
    if (readOnly || disabled) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        update(displayValue === 0 ? 1 : Math.min(safeMax, star + 1), true);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        update(displayValue === 0 ? 1 : Math.max(1, star - 1), true);
        break;
      case 'Home':
        event.preventDefault();
        update(1, true);
        break;
      case 'End':
        event.preventDefault();
        update(safeMax, true);
        break;
      default:
        break;
    }
  };

  const starRow = (
    <span className="pv-rating__stars">
      {stars.map((star) => {
        const filled = star <= fillValue;
        if (readOnly) {
          return (
            <span
              key={star}
              className="pv-rating__star pv-rating__star--static"
              data-filled={filled}
              aria-hidden="true"
            >
              <PixelIcon name={filled ? 'star-filled' : 'star'} size={iconSize} />
            </span>
          );
        }

        return (
          <button
            key={star}
            ref={(node) => {
              refs.current[star - 1] = node;
            }}
            type="button"
            role="radio"
            aria-checked={displayValue === star}
            aria-label={t(star === 1 ? 'star' : 'stars', { count: star })}
            tabIndex={star - 1 === tabbableIndex ? 0 : -1}
            className="pv-rating__star"
            data-filled={filled}
            disabled={disabled}
            onClick={() => {
              const next = allowClear && displayValue === star ? 0 : star;
              if (next === 0) setHover(null);
              update(next, false);
            }}
            onKeyDown={(event) => handleKeyDown(event, star)}
            onMouseEnter={() => {
              if (!disabled) setHover(star);
            }}
          >
            <PixelIcon name={filled ? 'star-filled' : 'star'} size={iconSize} />
          </button>
        );
      })}
    </span>
  );

  const valueText = (
    <span className="pv-rating__value" aria-hidden="true">
      {displayValue} / {safeMax}
    </span>
  );

  if (readOnly) {
    const readOnlyLabel =
      ariaLabel ??
      (typeof label === 'string'
        ? t('ratingSummaryLabel', {
            label,
            value: displayValue,
            max: safeMax,
          })
        : t('ratingSummary', { value: displayValue, max: safeMax }));

    return (
      <div
        className={cx(
          'pv-rating',
          `pv-rating--${size}`,
          'pv-rating--readonly',
          className,
        )}
        role="img"
        aria-label={readOnlyLabel}
        {...rest}
      >
        {label ? <span className="pv-rating__label">{label}</span> : null}
        {starRow}
        {showValue ? valueText : null}
      </div>
    );
  }

  return (
    <div
      className={cx('pv-rating', `pv-rating--${size}`, className)}
      role="radiogroup"
      aria-labelledby={label ? labelId : undefined}
      aria-label={!label ? (ariaLabel ?? t('rating')) : undefined}
      aria-disabled={disabled || undefined}
      onMouseLeave={() => setHover(null)}
      {...rest}
    >
      {label ? (
        <span id={labelId} className="pv-rating__label">
          {label}
        </span>
      ) : null}
      {starRow}
      {showValue ? valueText : null}
    </div>
  );
}
