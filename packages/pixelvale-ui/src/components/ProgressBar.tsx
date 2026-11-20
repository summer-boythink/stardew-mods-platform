import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { useLocale } from './PixelValeProvider';
import { PixelSprite } from './PixelSprite';

export type ProgressVariant = 'health' | 'energy' | 'xp' | 'gold' | 'neutral';

export interface ProgressBarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  value: number;
  max?: number;
  variant?: ProgressVariant;
  label?: ReactNode;
  showValue?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 100,
  variant = 'neutral',
  label,
  showValue = false,
  size = 'md',
  className,
  ...rest
}: ProgressBarProps) {
  const { t } = useLocale();
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(safeMax, Math.max(0, Number.isFinite(value) ? value : 0));
  const percentage = (clamped / safeMax) * 100;

  const { 'aria-label': ariaLabel, ...divProps } = rest;

  return (
    <div
      className={cx(
        'pv-progress',
        `pv-progress--${variant}`,
        `pv-progress--${size}`,
        className,
      )}
      {...divProps}
    >
      {label || showValue ? (
        <div className="pv-progress__meta">
          {label ? <span className="pv-progress__label">{label}</span> : null}
          {showValue ? (
            <span className="pv-progress__value">
              {Math.round(clamped)} / {Math.round(safeMax)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="pv-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(clamped)}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : t('progress'))}
      >
        <span
          className="pv-progress__fill"
          style={{ '--pv-progress-value': `${percentage}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}

function useAnimatedNumber(target: number, animate: boolean): number {
  const reducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (!animate || reducedMotion) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;

    const distance = Math.abs(target - from);
    const duration = Math.min(900, Math.max(260, Math.log10(distance + 1) * 280));
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let frame = 0;

    const tick = (time: number) => {
      const elapsed = time - startedAt;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);

      displayRef.current = next;
      setDisplay(next);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        displayRef.current = target;
        setDisplay(target);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate, reducedMotion]);

  return display;
}

export interface CoinDisplayProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children'
> {
  value: number;
  /** Small uppercase caption rendered before the amount. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  locale?: string;
}

function createCoinFormatter(locale: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  }
}

export function CoinDisplay({
  value,
  label,
  size = 'md',
  animate = true,
  locale,
  className,
  ...rest
}: CoinDisplayProps) {
  const { locale: uiLocale, t } = useLocale();
  const displayValue = useAnimatedNumber(value, animate);
  const formatter = createCoinFormatter(
    locale ?? (uiLocale === 'zh-CN' ? 'zh-CN' : 'en-US'),
  );
  const formatted = formatter.format(displayValue);

  return (
    <span
      className={cx('pv-coin', `pv-coin--${size}`, className)}
      title={`${formatter.format(value)} ${t('gold')}`}
      {...rest}
    >
      <span key={value} className="pv-coin__sprite" aria-hidden="true">
        <PixelSprite name="coin" size={size === 'lg' ? 28 : size === 'sm' ? 16 : 20} />
      </span>
      {label ? <span className="pv-coin__label">{label}</span> : null}
      <span className="pv-coin__value">{formatted}</span>
      <span className="pv-sr-only"> {t('gold')}</span>
    </span>
  );
}
