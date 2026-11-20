import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export type TabsVariant = 'parchment' | 'wood';

export interface TabsProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  items: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name for the tab list. */
  label?: string;
  variant?: TabsVariant;
}

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  variant = 'parchment',
  className,
  ...rest
}: TabsProps) {
  const { t } = useLocale();
  const firstEnabled = items.find((item) => !item.disabled)?.value ?? '';
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue: defaultValue ?? firstEnabled,
    onChange: onValueChange,
  });

  const { play } = useSound();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const rawIndex = items.findIndex((item) => item.value === current);
  const currentIndex = rawIndex >= 0 && !items[rawIndex]?.disabled ? rawIndex : -1;
  const effectiveValue = currentIndex >= 0 ? current : firstEnabled;

  const moveFocus = (from: number, direction: 1 | -1) => {
    if (items.length === 0) return;
    let index = from;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      const candidate = items[index];
      if (candidate && !candidate.disabled) {
        tabRefs.current[index]?.focus();
        setCurrent(candidate.value);
        play('click');
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case 'Home': {
        event.preventDefault();
        const first = items.findIndex((item) => !item.disabled);
        if (first >= 0) {
          tabRefs.current[first]?.focus();
          setCurrent(items[first]?.value ?? '');
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        for (let i = items.length - 1; i >= 0; i -= 1) {
          const item = items[i];
          if (item && !item.disabled) {
            tabRefs.current[i]?.focus();
            setCurrent(item.value);
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label ?? t('sections')}
      aria-orientation="horizontal"
      className={cx('pv-tabs', `pv-tabs--${variant}`, className)}
      {...rest}
    >
      {items.map((item, index) => {
        const selected = item.value === effectiveValue;
        return (
          <button
            key={item.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={cx('pv-tab', selected && 'pv-tab--active')}
            onClick={() => {
              if (item.disabled) return;
              setCurrent(item.value);
              play('click');
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.icon ? (
              <span className="pv-tab__icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
            {item.badge ? <span className="pv-tab__badge">{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
