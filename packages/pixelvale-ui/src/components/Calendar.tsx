import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DAY_MS = 86_400_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function parseDate(value?: string): DateParts | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseMonth(value?: string): { year: number; month: number } | null {
  if (!value) return null;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function toDateObject(value: string): Date {
  const parts = parseDate(value);
  if (!parts) return new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDays(value: string, delta: number): string {
  const parts = parseDate(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
  return dateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addMonths(value: string, delta: number): string {
  const parts = parseDate(value);
  if (!parts) return value;
  const targetIndex = parts.year * 12 + parts.month - 1 + delta;
  const year = Math.floor(targetIndex / 12);
  const month = (targetIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return dateString(year, month, Math.min(parts.day, lastDay));
}

function shiftMonth(value: string, delta: number): string {
  const parts = parseMonth(value);
  if (!parts) return value;
  const targetIndex = parts.year * 12 + parts.month - 1 + delta;
  return `${String(Math.floor(targetIndex / 12)).padStart(4, '0')}-${pad2(
    (targetIndex % 12) + 1,
  )}`;
}

function localToday(): string {
  const now = new Date();
  return dateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function weekOffset(value: string, weekStartsOn: number): number {
  const date = toDateObject(value);
  return (date.getUTCDay() - weekStartsOn + 7) % 7;
}

export type CalendarWeekStart = 0 | 1;

export interface CalendarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  /** Selected date as YYYY-MM-DD. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (date: string) => void;
  /** Visible month as YYYY-MM. */
  month?: string;
  defaultMonth?: string;
  onMonthChange?: (month: string) => void;
  min?: string;
  max?: string;
  /** Deterministic "today" for tests and demos. Defaults to the local date. */
  today?: string;
  label?: string;
  disabled?: boolean;
  showOutsideDays?: boolean;
  weekStartsOn?: CalendarWeekStart;
}

/**
 * Date grid with month navigation, roving tabindex, arrow/Page/Home/End keys,
 * min/max bounds, ISO-string state, and locale-aware month/weekday labels.
 */
export function Calendar({
  value,
  defaultValue,
  onValueChange,
  month,
  defaultMonth,
  onMonthChange,
  min,
  max,
  today,
  label,
  disabled = false,
  showOutsideDays = true,
  weekStartsOn = 0,
  className,
  ...rest
}: CalendarProps) {
  const generatedId = useId();
  const monthLabelId = `pv-calendar-${generatedId}-month`;
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldFocusRef = useRef(false);
  const { locale, t } = useLocale();
  const { play } = useSound();

  const todayValue = parseDate(today) ? (today as string) : localToday();
  const minValue = parseDate(min) ? (min as string) : undefined;
  const maxValue = parseDate(max) ? (max as string) : undefined;
  const initialSelected = parseDate(value ?? defaultValue)
    ? ((value ?? defaultValue) as string)
    : '';
  const initialMonth = parseMonth(month ?? defaultMonth)
    ? ((month ?? defaultMonth) as string)
    : initialSelected
      ? initialSelected.slice(0, 7)
      : todayValue.slice(0, 7);

  const isDisabledDate = (candidate: string) =>
    disabled ||
    Boolean(minValue && candidate < minValue) ||
    Boolean(maxValue && candidate > maxValue);

  const chooseFocusDate = (targetMonth: string, preferred = initialSelected) => {
    if (preferred.startsWith(targetMonth) && !isDisabledDate(preferred)) {
      return preferred;
    }
    if (todayValue.startsWith(targetMonth) && !isDisabledDate(todayValue)) {
      return todayValue;
    }
    const monthMeta = parseMonth(targetMonth);
    if (!monthMeta) return `${targetMonth}-01`;
    const days = new Date(Date.UTC(monthMeta.year, monthMeta.month, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) {
      const candidate = dateString(monthMeta.year, monthMeta.month, day);
      if (!isDisabledDate(candidate)) return candidate;
    }
    return `${targetMonth}-01`;
  };

  const [selected, setSelected] = useControllableState<string>({
    value: value === undefined ? undefined : parseDate(value) ? value : '',
    defaultValue: parseDate(defaultValue) ? (defaultValue as string) : '',
    onChange: onValueChange,
  });
  const [visibleMonth, setVisibleMonth] = useControllableState<string>({
    value: month === undefined ? undefined : parseMonth(month) ? month : initialMonth,
    defaultValue: initialMonth,
    onChange: onMonthChange,
  });
  const [focusDate, setFocusDate] = useState(() => chooseFocusDate(initialMonth));

  const selectedValue = parseDate(selected) ? selected : '';
  const currentMonth = parseMonth(visibleMonth) ? visibleMonth : todayValue.slice(0, 7);
  const monthMeta = parseMonth(currentMonth);
  const year = monthMeta?.year ?? 1970;
  const monthIndex = (monthMeta?.month ?? 1) - 1;

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, monthIndex, 1))),
    [locale, year, monthIndex],
  );

  const weekdays = useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    const long = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    });
    const baseSunday = Date.UTC(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(baseSunday + ((weekStartsOn + index) % 7) * DAY_MS);
      return { short: short.format(date), long: long.format(date) };
    });
  }, [locale, weekStartsOn]);

  const days = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const offset = (firstWeekday - weekStartsOn + 7) % 7;
    const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
    const startDate = new Date(firstOfMonth.getTime() - offset * DAY_MS);
    const start = dateString(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      startDate.getUTCDate(),
    );
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(start, index);
      const parts = parseDate(date);
      return {
        date,
        day: parts?.day ?? 1,
        inMonth: parts?.year === year && parts?.month === monthIndex + 1,
        label: new Intl.DateTimeFormat(locale, {
          dateStyle: 'full',
          timeZone: 'UTC',
        }).format(toDateObject(date)),
      };
    });
  }, [locale, year, monthIndex, weekStartsOn]);

  const tabbableDate =
    [focusDate, selectedValue, todayValue].find(
      (candidate) => candidate.startsWith(currentMonth) && !isDisabledDate(candidate),
    ) ??
    days.find((day) => day.inMonth && !isDisabledDate(day.date))?.date ??
    '';

  useEffect(() => {
    if (!selectedValue) return;
    const targetMonth = selectedValue.slice(0, 7);
    if (targetMonth !== currentMonth) setVisibleMonth(targetMonth);
    // Only follow changes to the selected value; browsing is independent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValue]);

  useEffect(() => {
    if (!focusDate.startsWith(currentMonth)) {
      setFocusDate(chooseFocusDate(currentMonth, selectedValue));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    dayRefs.current.get(focusDate)?.focus();
    shouldFocusRef.current = false;
  }, [focusDate, currentMonth]);

  const moveFocus = (target: string) => {
    if (isDisabledDate(target)) return;
    if (target.slice(0, 7) !== currentMonth) setVisibleMonth(target.slice(0, 7));
    if (target !== focusDate) {
      setFocusDate(target);
      shouldFocusRef.current = true;
    }
  };

  const selectDate = (target: string) => {
    if (isDisabledDate(target)) return;
    setSelected(target);
    if (target.slice(0, 7) !== currentMonth) {
      setVisibleMonth(target.slice(0, 7));
    }
    setFocusDate(target);
    play('click');
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    if (disabled) return;
    let target: string | null = null;

    switch (event.key) {
      case 'ArrowLeft':
        target = addDays(date, -1);
        break;
      case 'ArrowRight':
        target = addDays(date, 1);
        break;
      case 'ArrowUp':
        target = addDays(date, -7);
        break;
      case 'ArrowDown':
        target = addDays(date, 7);
        break;
      case 'Home':
        target = addDays(date, -weekOffset(date, weekStartsOn));
        break;
      case 'End':
        target = addDays(date, 6 - weekOffset(date, weekStartsOn));
        break;
      case 'PageUp':
        target = addMonths(date, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        target = addMonths(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    if (target) moveFocus(target);
  };

  const shiftVisibleMonth = (delta: number) => {
    if (disabled) return;
    const targetMonth = shiftMonth(currentMonth, delta);
    setVisibleMonth(targetMonth);
    setFocusDate(chooseFocusDate(targetMonth, selectedValue));
    play('click');
  };

  const goToToday = () => {
    if (isDisabledDate(todayValue)) return;
    setSelected(todayValue);
    setVisibleMonth(todayValue.slice(0, 7));
    setFocusDate(todayValue);
    shouldFocusRef.current = true;
    play('click');
  };

  const weekRows = Array.from({ length: 6 }, (_, row) =>
    days.slice(row * 7, row * 7 + 7),
  );

  return (
    <div
      className={cx('pv-calendar', disabled && 'pv-calendar--disabled', className)}
      role="group"
      aria-label={label ?? t('calendar')}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      <div className="pv-calendar__header">
        <button
          type="button"
          className="pv-calendar__nav"
          aria-label={t('previousMonth')}
          disabled={disabled}
          onClick={() => shiftVisibleMonth(-1)}
        >
          <PixelIcon name="chevron-left" size={16} />
        </button>

        <p id={monthLabelId} className="pv-calendar__month" aria-live="polite">
          {monthTitle}
        </p>

        <button
          type="button"
          className="pv-calendar__today"
          disabled={isDisabledDate(todayValue)}
          onClick={goToToday}
        >
          {t('today')}
        </button>

        <button
          type="button"
          className="pv-calendar__nav"
          aria-label={t('nextMonth')}
          disabled={disabled}
          onClick={() => shiftVisibleMonth(1)}
        >
          <PixelIcon name="chevron-right" size={16} />
        </button>
      </div>

      <table className="pv-calendar__grid" role="grid" aria-labelledby={monthLabelId}>
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th scope="col" key={weekday.short}>
                <abbr title={weekday.long}>{weekday.short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weekRows.map((week) => (
            <tr key={week[0]?.date}>
              {week.map((day) => {
                const isSelected = day.date === selectedValue;
                const isToday = day.date === todayValue;
                const isDisabled = isDisabledDate(day.date);
                const hiddenOutside = !day.inMonth && !showOutsideDays;

                return (
                  <td key={day.date} role="gridcell">
                    {hiddenOutside ? null : (
                      <button
                        ref={(node) => {
                          if (node) dayRefs.current.set(day.date, node);
                          else dayRefs.current.delete(day.date);
                        }}
                        type="button"
                        className="pv-calendar__day"
                        data-selected={isSelected ? 'true' : undefined}
                        data-today={isToday ? 'true' : undefined}
                        data-outside={!day.inMonth ? 'true' : undefined}
                        aria-label={day.label}
                        aria-pressed={isSelected}
                        aria-current={isToday ? 'date' : undefined}
                        tabIndex={day.date === tabbableDate ? 0 : -1}
                        disabled={isDisabled}
                        onClick={() => selectDate(day.date)}
                        onKeyDown={(event) => handleDayKeyDown(event, day.date)}
                      >
                        {day.day}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
