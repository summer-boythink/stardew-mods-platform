import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useSound } from './PixelValeProvider';

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<
  HTMLAttributes<HTMLFieldSetElement>,
  'onChange'
> {
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: ReactNode;
  hint?: string;
  error?: string;
  orientation?: 'vertical' | 'horizontal';
  name?: string;
  disabled?: boolean;
}

/**
 * Native radio inputs styled as parchment cards. Native fieldsets, names, and
 * keyboard behavior are preserved; descriptions are part of each option label.
 */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  hint,
  error,
  orientation = 'vertical',
  name,
  disabled = false,
  className,
  ...rest
}: RadioGroupProps) {
  const generatedId = useId();
  const groupName = name ?? `pv-radio-${generatedId}`;
  const hintId = hint ? `${groupName}-hint` : undefined;
  const errorId = error ? `${groupName}-error` : undefined;
  const helpId = error ? errorId : hintId;
  const { play } = useSound();

  const [current, setCurrent] = useControllableState<string>({
    value,
    defaultValue: defaultValue ?? '',
    onChange: onValueChange,
  });

  return (
    <fieldset
      className={cx(
        'pv-radio-group',
        `pv-radio-group--${orientation}`,
        error && 'pv-radio-group--error',
        className,
      )}
      disabled={disabled}
      aria-describedby={helpId}
      aria-invalid={error ? true : undefined}
      {...rest}
    >
      {label ? <legend className="pv-radio-group__legend">{label}</legend> : null}
      <div className="pv-radio-group__options">
        {options.map((option) => {
          const isDisabled = disabled || option.disabled;
          return (
            <label
              key={option.value}
              className={cx(
                'pv-radio',
                current === option.value && 'pv-radio--checked',
                isDisabled && 'pv-radio--disabled',
              )}
            >
              <input
                type="radio"
                className="pv-radio__input"
                name={groupName}
                value={option.value}
                checked={current === option.value}
                disabled={isDisabled}
                onChange={() => {
                  setCurrent(option.value);
                  play('toggle');
                }}
              />
              <span className="pv-radio__mark" aria-hidden="true" />
              {option.icon ? (
                <span className="pv-radio__icon" aria-hidden="true">
                  {option.icon}
                </span>
              ) : null}
              <span className="pv-radio__text">
                <span className="pv-radio__label">{option.label}</span>
                {option.description ? (
                  <span className="pv-radio__description">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="pv-radio-group__help pv-radio-group__help--error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-radio-group__help">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
