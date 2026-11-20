import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useSound } from './PixelValeProvider';

export interface ToggleGroupItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ToggleGroupProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  items: readonly ToggleGroupItem[];
  /** Accessible name for the group. */
  label: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  /** Allow more than one option to stay pressed. Defaults to false. */
  multiple?: boolean;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

/**
 * Compact pressed-button group. In single mode it behaves like a segmented
 * control; in multiple mode it works as a toolbar of independent toggles.
 * Arrow keys move focus without changing selection.
 */
export function ToggleGroup({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  multiple = false,
  size = 'md',
  fullWidth = false,
  className,
  ...rest
}: ToggleGroupProps) {
  const [current, setCurrent] = useControllableState<string[]>({
    value: value ? [...value] : undefined,
    defaultValue: defaultValue ? [...defaultValue] : [],
    onChange: onValueChange,
  });
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const { play } = useSound();
  const selected = new Set(current);

  const tabbableIndex = (() => {
    const selectedEnabled = items.findIndex(
      (item) => selected.has(item.value) && !item.disabled,
    );
    return selectedEnabled >= 0
      ? selectedEnabled
      : items.findIndex((item) => !item.disabled);
  })();

  const toggle = (itemValue: string) => {
    const isSelected = selected.has(itemValue);
    if (!multiple && isSelected) return;

    const next = multiple
      ? isSelected
        ? current.filter((entry) => entry !== itemValue)
        : [...current, itemValue]
      : [itemValue];

    setCurrent(next);
    play('toggle');
  };

  const moveFocus = (from: number, direction: 1 | -1) => {
    if (items.length === 0) return;
    let index = from;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index]?.disabled) {
        refs.current[index]?.focus();
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
        if (first >= 0) refs.current[first]?.focus();
        break;
      }
      case 'End': {
        event.preventDefault();
        for (let candidate = items.length - 1; candidate >= 0; candidate -= 1) {
          if (!items[candidate]?.disabled) {
            refs.current[candidate]?.focus();
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
      className={cx(
        'pv-toggle-group',
        `pv-toggle-group--${size}`,
        fullWidth && 'pv-toggle-group--full',
        className,
      )}
      role="group"
      aria-label={label}
      {...rest}
    >
      {items.map((item, index) => {
        const isSelected = selected.has(item.value);
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            className="pv-toggle"
            aria-pressed={isSelected}
            tabIndex={index === tabbableIndex ? 0 : -1}
            disabled={item.disabled}
            onClick={() => toggle(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.icon ? (
              <span className="pv-toggle__icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
