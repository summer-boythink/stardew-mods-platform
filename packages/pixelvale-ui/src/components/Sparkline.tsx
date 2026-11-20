import type { CSSProperties, HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useLocale } from './PixelValeProvider';

export type SparklineTone = 'green' | 'gold' | 'blue' | 'red' | 'neutral';

export interface SparklineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  values: readonly number[];
  variant?: 'line' | 'bars';
  /** Rendered chart height in CSS pixels. */
  height?: number;
  width?: CSSProperties['width'];
  tone?: SparklineTone;
  label?: string;
  ariaLabel?: string;
  showLast?: boolean;
}

/**
 * Dependency-free miniature chart. It filters non-finite samples, keeps the last
 * 64 values, and exposes a textual summary for screen readers.
 */
export function Sparkline({
  values,
  variant = 'line',
  height = 44,
  width = '100%',
  tone = 'green',
  label,
  ariaLabel,
  showLast = true,
  className,
  style,
  'aria-label': restAriaLabel,
  ...rest
}: SparklineProps) {
  const { locale, t } = useLocale();
  const clean = values.filter((value) => Number.isFinite(value)).slice(-64);
  const safeHeight = Math.min(200, Math.max(16, Math.round(height)));
  const last = clean.length > 0 ? clean[clean.length - 1] : undefined;
  const lastText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(last ?? 0);
  const summary =
    ariaLabel ??
    restAriaLabel ??
    (clean.length > 0
      ? label
        ? t('dataSummaryLabel', {
            label,
            count: clean.length,
            last: lastText,
          })
        : t('dataSummary', { count: clean.length, last: lastText })
      : label
        ? t('noDataLabel', { label })
        : t('noData'));

  const min = clean.length > 0 ? Math.min(...clean) : 0;
  const max = clean.length > 0 ? Math.max(...clean) : 0;
  const span = max - min;

  const points = clean.map((value, index) => {
    const x = clean.length === 1 ? 50 : 1 + (index / (clean.length - 1)) * 98;
    const normalized = span === 0 ? 0.5 : (value - min) / span;
    const y = 2 + (1 - normalized) * 28;
    return { x, y };
  });

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1]?.x.toFixed(2)} 31 L${points[0]?.x.toFixed(2)} 31 Z`
      : '';

  const barWidth =
    clean.length === 1
      ? 20
      : clean.length > 0
        ? Math.max(0.7, 98 / clean.length - 0.8)
        : 0;

  return (
    <div
      className={cx('pv-sparkline', `pv-sparkline--${tone}`, className)}
      style={{ width, ...style }}
      {...rest}
    >
      <svg
        className="pv-sparkline__svg"
        viewBox="0 0 100 32"
        height={safeHeight}
        width="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        focusable="false"
      >
        <line className="pv-sparkline__baseline" x1="0" y1="31" x2="100" y2="31" />
        {clean.length === 0 ? null : variant === 'bars' ? (
          clean.map((value, index) => {
            const normalized = span === 0 ? 0.5 : (value - min) / span;
            const barHeight = Math.max(1.5, normalized * 29);
            const x =
              clean.length === 1
                ? 40
                : 1 + index * (98 / clean.length) + (98 / clean.length - barWidth) / 2;
            return (
              <rect
                key={index}
                className={cx(
                  'pv-sparkline__bar',
                  index === clean.length - 1 && 'pv-sparkline__bar--last',
                )}
                x={x}
                y={31 - barHeight}
                width={barWidth}
                height={barHeight}
              />
            );
          })
        ) : (
          <>
            <path className="pv-sparkline__area" d={areaPath} />
            <path
              className="pv-sparkline__line"
              d={linePath}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            {showLast && points.length > 0 ? (
              <rect
                className="pv-sparkline__last"
                x={(points[points.length - 1]?.x ?? 50) - 1.2}
                y={(points[points.length - 1]?.y ?? 16) - 1.2}
                width="2.4"
                height="2.4"
              />
            ) : null}
          </>
        )}
      </svg>
    </div>
  );
}
