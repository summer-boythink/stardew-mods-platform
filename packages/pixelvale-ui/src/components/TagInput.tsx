import {
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

const TAG_SEPARATOR = /[,，]/;

function cleanTag(raw: string, maxLength?: number): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  if (maxLength === undefined) return collapsed;
  return Array.from(collapsed).slice(0, maxLength).join('');
}

export interface TagInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (tags: string[]) => void;
  label?: ReactNode;
  hint?: string;
  error?: string;
  placeholder?: string;
  id?: string;
  /** Renders hidden inputs so every tag participates in native forms. */
  name?: string;
  disabled?: boolean;
  maxTags?: number;
  /** Maximum characters per tag. */
  maxLength?: number;
  limitMessage?: string;
}

/**
 * Comma- or Enter-separated tag editor. It handles IME composition, Chinese
 * and Latin commas, duplicate rejection, per-tag length limits, Backspace
 * removal, form submission, and focus return after a tag is removed.
 */
export function TagInput({
  value,
  defaultValue,
  onValueChange,
  label,
  hint,
  error,
  placeholder,
  id,
  name,
  disabled = false,
  maxTags,
  maxLength,
  limitMessage,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  ...rest
}: TagInputProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-tag-input-${generatedId}`;
  const labelId = `${inputId}-label`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const limitId = `${inputId}-limit`;
  const helpId = error ? errorId : hintId;

  const maxTagCount =
    typeof maxTags === 'number' && Number.isFinite(maxTags)
      ? Math.max(0, Math.floor(maxTags))
      : undefined;
  const maxTagLength =
    typeof maxLength === 'number' && Number.isFinite(maxLength)
      ? Math.max(1, Math.floor(maxLength))
      : undefined;

  const [current, setCurrent] = useControllableState<string[]>({
    value,
    defaultValue: defaultValue ?? [],
    onChange: onValueChange,
  });
  const [draft, setDraft] = useState('');
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { play } = useSound();
  const { t } = useLocale();

  const atLimit = maxTagCount !== undefined && current.length >= maxTagCount;
  const helpAria =
    [describedBy, error ? errorId : atLimit ? limitId : helpId]
      .filter(Boolean)
      .join(' ') || undefined;

  const commitTags = (rawValues: readonly string[]) => {
    if (disabled) return;
    let next = current;
    let changed = false;

    for (const raw of rawValues.flatMap((candidate) => candidate.split(TAG_SEPARATOR))) {
      const tag = cleanTag(raw, maxTagLength);
      if (!tag || next.includes(tag)) continue;
      if (maxTagCount !== undefined && next.length >= maxTagCount) break;
      if (!changed) next = [...current];
      next.push(tag);
      changed = true;
    }

    if (changed) {
      setCurrent(next);
      play('click');
    }
  };

  const removeAt = (index: number) => {
    if (disabled) return;
    setCurrent(current.filter((_, itemIndex) => itemIndex !== index));
    play('toggle');
    inputRef.current?.focus();
  };

  const handleChange = (next: string) => {
    if (composingRef.current) {
      setDraft(next);
      return;
    }

    if (!TAG_SEPARATOR.test(next)) {
      setDraft(next);
      return;
    }

    const segments = next.split(TAG_SEPARATOR);
    const trailing = segments.pop() ?? '';
    commitTags(segments);
    setDraft(trailing);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return;

    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      commitTags([draft]);
      setDraft('');
      return;
    }

    if (event.key === 'Backspace' && draft.length === 0 && current.length > 0) {
      event.preventDefault();
      removeAt(current.length - 1);
    }
  };

  const handleControlMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button')) return;
    event.preventDefault();
    inputRef.current?.focus();
  };

  return (
    <div
      className={cx(
        'pv-tag-input',
        disabled && 'pv-tag-input--disabled',
        error && 'pv-tag-input--invalid',
        className,
      )}
      {...rest}
    >
      {label ? (
        <label id={labelId} className="pv-tag-input__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <div className="pv-tag-input__control" onMouseDown={handleControlMouseDown}>
        {current.length > 0 ? (
          <ul className="pv-tag-input__tags" aria-label={t('tagsSelected')}>
            {current.map((tag, index) => (
              <li className="pv-tag-input__tag" key={`${tag}-${index}`}>
                <span className="pv-tag-input__tag-text">{tag}</span>
                <button
                  type="button"
                  className="pv-tag-input__remove"
                  aria-label={t('removeTag', { tag })}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeAt(index)}
                >
                  <PixelIcon name="close" size={10} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="pv-tag-input__input"
          value={draft}
          placeholder={placeholder ?? t('addTag')}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (ariaLabel ?? t('addTag')) : undefined}
          aria-describedby={helpAria}
          aria-invalid={error ? true : undefined}
          onChange={(event) => handleChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
        />
      </div>

      {error ? (
        <p
          id={errorId}
          className="pv-tag-input__help pv-tag-input__help--error"
          role="alert"
        >
          {error}
        </p>
      ) : atLimit && maxTagCount !== undefined ? (
        <p id={limitId} className="pv-tag-input__help pv-tag-input__help--limit">
          {limitMessage ?? t('tagLimit', { count: maxTagCount })}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-tag-input__help">
          {hint}
        </p>
      ) : null}

      {name
        ? current.map((tag, index) => (
            <input
              key={`${name}-${tag}-${index}`}
              type="hidden"
              name={name}
              value={tag}
            />
          ))
        : null}
    </div>
  );
}
