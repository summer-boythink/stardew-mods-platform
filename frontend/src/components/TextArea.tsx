import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: string;
  error?: string;
}

/**
 * Pixel-framed textarea matching Pixelvale's TextField. The library ships no
 * multiline field, so this keeps the same border, inset shadow, label and help
 * semantics without reaching into private class names.
 */
export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: TextAreaProps): JSX.Element {
  const generatedId = useId();
  const areaId = id ?? `app-textarea-${generatedId}`;
  const hintId = hint ? `${areaId}-hint` : undefined;
  const errorId = error ? `${areaId}-error` : undefined;
  const helpId = error ? errorId : hintId;
  const helpAria = [describedBy, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={['app-textarea', error ? 'app-textarea--error' : '', className].filter(Boolean).join(' ')}>
      {label ? (
        <label className="app-textarea__label" htmlFor={areaId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={areaId}
        className="app-textarea__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={helpAria}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="app-textarea__help app-textarea__help--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="app-textarea__help">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
