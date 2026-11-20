import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  label?: ReactNode;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  leadingIcon,
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-field-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const helpId = error ? errorId : hint ? hintId : undefined;
  const helpAria = [describedBy, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('pv-field', error && 'pv-field--error', className)}>
      {label ? (
        <label className="pv-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="pv-field__wrap">
        {leadingIcon ? (
          <span className="pv-field__icon" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        <input
          id={inputId}
          className={cx(
            'pv-field__input',
            leadingIcon ? 'pv-field__input--with-icon' : undefined,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={helpAria}
          {...rest}
        />
      </div>
      {error ? (
        <p id={errorId} className="pv-field__help pv-field__help--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-field__help">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
