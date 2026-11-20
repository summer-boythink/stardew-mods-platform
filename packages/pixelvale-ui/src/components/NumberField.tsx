import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface NumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'
> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  hint?: string;
  error?: string;
  unit?: ReactNode;
  onValueChange?: (value: number) => void;
  decrementLabel?: string;
  incrementLabel?: string;
}

function roundFloat(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Numeric spinbutton with a free-text draft. Values commit on blur/Enter, and
 * ArrowUp/Down, Shift+Arrow, PageUp/PageDown, Home, and End are supported.
 * A hidden input keeps native form submission on the committed value.
 */
export function NumberField({
  value,
  defaultValue,
  min,
  max,
  step = 1,
  label,
  hint,
  error,
  unit,
  onValueChange,
  decrementLabel,
  incrementLabel,
  id,
  name,
  form,
  className,
  disabled = false,
  readOnly = false,
  onBlur,
  onFocus,
  onKeyDown,
  'aria-describedby': describedBy,
  ...inputProps
}: NumberFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-number-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const helpId = error ? errorId : hintId;
  const helpAria = [describedBy, helpId].filter(Boolean).join(' ') || undefined;

  const rangeMin = typeof min === 'number' && Number.isFinite(min) ? min : -Infinity;
  const rawMax = typeof max === 'number' && Number.isFinite(max) ? max : Infinity;
  const rangeMax = rawMax >= rangeMin ? rawMax : rangeMin;
  const safeStep =
    typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 1;

  const clampValue = (candidate: number) => {
    const lower = Math.max(candidate, rangeMin);
    return roundFloat(Math.min(lower, rangeMax));
  };

  const initial = clampValue(
    (typeof defaultValue === 'number' ? defaultValue : undefined) ??
      (typeof value === 'number' ? value : undefined) ??
      0,
  );

  const [current, setCurrent] = useControllableState<number>({
    value,
    defaultValue: initial,
    onChange: onValueChange,
  });

  const [draft, setDraft] = useState(() => String(initial));
  const [editing, setEditing] = useState(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  const parsedDraft = Number(draft.trim());
  const effectiveCurrent =
    editing && draft.trim() !== '' && Number.isFinite(parsedDraft)
      ? clampValue(parsedDraft)
      : current;
  const { play } = useSound();
  const { t } = useLocale();

  useEffect(() => {
    if (!editing) setDraft(String(current));
  }, [current, editing]);

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? currentRef.current : Number(trimmed);

    if (!Number.isFinite(parsed)) {
      setDraft(String(currentRef.current));
      return currentRef.current;
    }

    const next = clampValue(parsed);
    currentRef.current = next;
    setCurrent(next);
    setDraft(String(next));
    return next;
  };

  const stepBy = (delta: number) => {
    const base = Number.isFinite(effectiveCurrent) ? effectiveCurrent : 0;
    const next = clampValue(base + delta);
    if (next === base) return;
    currentRef.current = next;
    setCurrent(next);
    setDraft(String(next));
    play('toggle');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        stepBy(safeStep * (event.shiftKey ? 5 : 1));
        break;
      case 'ArrowDown':
        event.preventDefault();
        stepBy(-safeStep * (event.shiftKey ? 5 : 1));
        break;
      case 'PageUp':
        event.preventDefault();
        stepBy(safeStep * 10);
        break;
      case 'PageDown':
        event.preventDefault();
        stepBy(-safeStep * 10);
        break;
      case 'Home':
        if (Number.isFinite(rangeMin)) {
          event.preventDefault();
          stepBy(rangeMin - effectiveCurrent);
        }
        break;
      case 'End':
        if (Number.isFinite(rangeMax)) {
          event.preventDefault();
          stepBy(rangeMax - effectiveCurrent);
        }
        break;
      case 'Enter':
        commitDraft(draft);
        break;
      case 'Escape':
        event.preventDefault();
        setDraft(String(currentRef.current));
        break;
      default:
        break;
    }
  };

  const labelText = typeof label === 'string' ? label : t('value');
  const decrementText = decrementLabel ?? t('decrease', { label: labelText });
  const incrementText = incrementLabel ?? t('increase', { label: labelText });
  const atMin = Number.isFinite(rangeMin) && effectiveCurrent <= rangeMin;
  const atMax = Number.isFinite(rangeMax) && effectiveCurrent >= rangeMax;

  return (
    <div
      className={cx(
        'pv-number-field',
        error && 'pv-number-field--error',
        disabled && 'pv-number-field--disabled',
        className,
      )}
    >
      {label ? (
        <label className="pv-number-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="pv-number-field__control">
        <button
          type="button"
          className="pv-number-field__button"
          aria-label={decrementText}
          disabled={disabled || atMin}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(-safeStep)}
        >
          <PixelIcon name="minus" size={16} />
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          autoComplete="off"
          spellCheck={false}
          className="pv-number-field__input"
          value={draft}
          disabled={disabled}
          readOnly={readOnly}
          form={form}
          aria-valuemin={Number.isFinite(rangeMin) ? rangeMin : undefined}
          aria-valuemax={Number.isFinite(rangeMax) ? rangeMax : undefined}
          aria-valuenow={Number.isFinite(effectiveCurrent) ? effectiveCurrent : undefined}
          aria-valuetext={
            typeof unit === 'string'
              ? `${effectiveCurrent} ${unit}`
              : String(effectiveCurrent)
          }
          aria-describedby={helpAria}
          onFocus={(event) => {
            setEditing(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setEditing(false);
            commitDraft(draft);
            onBlur?.(event);
          }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          {...inputProps}
        />
        {unit ? (
          <span className="pv-number-field__unit" aria-hidden="true">
            {unit}
          </span>
        ) : null}
        <button
          type="button"
          className="pv-number-field__button"
          aria-label={incrementText}
          disabled={disabled || atMax}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(safeStep)}
        >
          <PixelIcon name="plus" size={16} />
        </button>
      </div>
      {name ? (
        <input type="hidden" name={name} form={form} value={String(current)} />
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="pv-number-field__help pv-number-field__help--error"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-number-field__help">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
