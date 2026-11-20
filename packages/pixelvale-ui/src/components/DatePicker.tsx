import {
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { Calendar, type CalendarWeekStart } from './Calendar';
import { PixelIcon } from './PixelIcon';
import { Popover } from './Popover';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value?: string): string | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

function localToday(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(
    now.getMonth() + 1,
  ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export interface DatePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (date: string) => void;
  min?: string;
  max?: string;
  today?: string;
  label?: ReactNode;
  hint?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  name?: string;
  id?: string;
  weekStartsOn?: CalendarWeekStart;
}

/**
 * Text-field-like date picker built on Popover and Calendar. Selecting a day
 * closes the panel and returns focus to the trigger; the ISO value can be
 * cleared and participates in native forms through a hidden input.
 */
export function DatePicker({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  today,
  label,
  hint,
  error,
  placeholder,
  disabled = false,
  clearable = true,
  name,
  id,
  weekStartsOn = 0,
  className,
  'aria-describedby': describedBy,
  ...rest
}: DatePickerProps) {
  const generatedId = useId();
  const triggerId = id ?? `pv-date-picker-${generatedId}`;
  const labelId = `${triggerId}-label`;
  const hintId = hint ? `${triggerId}-hint` : undefined;
  const errorId = error ? `${triggerId}-error` : undefined;
  const helpId = error ? errorId : hintId;
  const helpAria = [describedBy, helpId].filter(Boolean).join(' ') || undefined;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { locale, t } = useLocale();
  const { play } = useSound();

  const [current, setCurrent] = useControllableState<string>({
    value: value === undefined ? undefined : (parseDate(value) ?? ''),
    defaultValue: parseDate(defaultValue) ?? '',
    onChange: onValueChange,
  });
  const selected = parseDate(current) ?? '';
  const todayValue = parseDate(today) ? (today as string) : localToday();
  const [visibleMonth, setVisibleMonth] = useState(
    selected ? selected.slice(0, 7) : todayValue.slice(0, 7),
  );

  useEffect(() => {
    if (selected) setVisibleMonth(selected.slice(0, 7));
  }, [selected]);

  const formatted = selected
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${selected}T00:00:00Z`))
    : (placeholder ?? t('selectDate'));

  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const trigger = (
    <button
      ref={triggerRef}
      id={triggerId}
      type="button"
      className="pv-date-picker__trigger"
      disabled={disabled}
      aria-describedby={helpAria}
      aria-invalid={error ? true : undefined}
    >
      <span className="pv-date-picker__icon" aria-hidden="true">
        <PixelIcon name="calendar" size={16} />
      </span>
      <span
        className={cx(
          'pv-date-picker__value',
          !selected && 'pv-date-picker__value--placeholder',
        )}
      >
        {formatted}
      </span>
      <span className="pv-date-picker__chevron" aria-hidden="true">
        <PixelIcon name="chevron-down" size={14} />
      </span>
    </button>
  );

  return (
    <div
      className={cx(
        'pv-date-picker',
        disabled && 'pv-date-picker--disabled',
        error && 'pv-date-picker--invalid',
        className,
      )}
      {...rest}
    >
      {label ? (
        <label id={labelId} className="pv-date-picker__label" htmlFor={triggerId}>
          {label}
        </label>
      ) : null}

      <div className="pv-date-picker__field">
        <Popover
          label={typeof label === 'string' ? label : t('chooseDate')}
          trigger={trigger}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          align="start"
          width={360}
        >
          <Calendar
            today={todayValue}
            value={selected}
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            min={min}
            max={max}
            weekStartsOn={weekStartsOn}
            onValueChange={(date) => {
              setCurrent(date);
              setVisibleMonth(date.slice(0, 7));
              closeToTrigger();
            }}
          />
        </Popover>

        {clearable && selected ? (
          <button
            type="button"
            className="pv-date-picker__clear"
            aria-label={t('clearDate')}
            disabled={disabled}
            onClick={() => {
              setCurrent('');
              play('toggle');
              triggerRef.current?.focus();
            }}
          >
            <PixelIcon name="close" size={12} />
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          id={errorId}
          className="pv-date-picker__help pv-date-picker__help--error"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-date-picker__help">
          {hint}
        </p>
      ) : null}

      {name ? <input type="hidden" name={name} value={selected} /> : null}
    </div>
  );
}
