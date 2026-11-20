import {
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'value' | 'defaultValue' | 'onChange'
> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  showValue?: boolean;
  onValueChange?: (value: number) => void;
  formatValue?: (value: number) => string;
}

export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = false,
  onValueChange,
  formatValue,
  id,
  className,
  disabled,
  style,
  ...rest
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-slider-${generatedId}`;
  const labelId = `${inputId}-label`;
  const safeMax = max > min ? max : min + 1;
  const initial = defaultValue ?? value ?? Math.round(min + (safeMax - min) / 2);
  const [current, setCurrent] = useControllableState<number>({
    value,
    defaultValue: initial,
    onChange: onValueChange,
  });

  const percentage = ((current - min) / (safeMax - min)) * 100;
  const display = formatValue
    ? formatValue(current)
    : Number.isInteger(current)
      ? String(current)
      : current.toFixed(1);

  return (
    <div className={cx('pv-slider', className)}>
      {label || showValue ? (
        <div className="pv-slider__meta">
          {label ? (
            <label id={labelId} className="pv-slider__label" htmlFor={inputId}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {showValue ? <span className="pv-slider__value">{display}</span> : null}
        </div>
      ) : null}
      <input
        id={inputId}
        type="range"
        className="pv-slider__input"
        min={min}
        max={safeMax}
        step={step}
        value={current}
        disabled={disabled}
        aria-labelledby={label ? labelId : undefined}
        aria-valuetext={showValue ? display : undefined}
        style={
          {
            ...style,
            '--pv-slider-pct': `${Math.min(100, Math.max(0, percentage))}%`,
          } as CSSProperties
        }
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) setCurrent(next);
        }}
        {...rest}
      />
    </div>
  );
}
