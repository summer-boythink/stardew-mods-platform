import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label?: ReactNode;
  description?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  label,
  description,
  onCheckedChange,
  onChange,
  id,
  className,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-checkbox-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const { play } = useSound();

  return (
    <div className={cx('pv-check-field', className)}>
      <label className="pv-check" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          className="pv-check__input"
          aria-describedby={descriptionId}
          onChange={(event) => {
            play('toggle');
            onCheckedChange?.(event.currentTarget.checked);
            onChange?.(event);
          }}
          {...rest}
        />
        <span className="pv-check__box" aria-hidden="true">
          <PixelIcon name="check" size={16} />
        </span>
        {label || description ? (
          <span className="pv-check__text">
            {label ? <span className="pv-check__label">{label}</span> : null}
            {description ? (
              <span id={descriptionId} className="pv-check__description">
                {description}
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label?: ReactNode;
  description?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  label,
  description,
  onCheckedChange,
  onChange,
  id,
  className,
  ...rest
}: SwitchProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-switch-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const { play } = useSound();

  return (
    <div className={cx('pv-check-field', className)}>
      <label className="pv-switch-field" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          className="pv-check__input"
          aria-describedby={descriptionId}
          onChange={(event) => {
            play('toggle');
            onCheckedChange?.(event.currentTarget.checked);
            onChange?.(event);
          }}
          {...rest}
        />
        <span className="pv-switch" aria-hidden="true">
          <span className="pv-switch__knob" />
        </span>
        {label || description ? (
          <span className="pv-check__text">
            {label ? <span className="pv-check__label">{label}</span> : null}
            {description ? (
              <span id={descriptionId} className="pv-check__description">
                {description}
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
    </div>
  );
}
