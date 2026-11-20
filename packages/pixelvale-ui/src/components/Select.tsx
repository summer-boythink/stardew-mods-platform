import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface SelectOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  label?: ReactNode;
  hint?: string;
  disabled?: boolean;
  /** Renders a hidden input so the value participates in native forms. */
  name?: string;
  id?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  label,
  hint,
  disabled = false,
  name,
  id,
  className,
  onBlur,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `pv-select-${generatedId}`;
  const labelId = `${triggerId}-label`;
  const listId = `${triggerId}-listbox`;
  const hintId = hint ? `${triggerId}-hint` : undefined;
  const optionId = (index: number) => `${triggerId}-option-${index}`;

  const { 'aria-label': ariaLabel, ...rootProps } = rest;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPlacement, setMenuPlacement] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const [current, setCurrent] = useControllableState<string>({
    value,
    defaultValue: defaultValue ?? '',
    onChange: onValueChange,
  });

  const { play } = useSound();
  const { t } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const selectedIndex = options.findIndex((option) => option.value === current);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const firstEnabledIndex = options.findIndex((option) => !option.disabled);

  const openMenu = () => {
    if (disabled) return;
    const initial =
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabledIndex;

    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (triggerRect && typeof window !== 'undefined') {
      const gap = 6;
      const padding = 8;
      const spaceBelow = window.innerHeight - triggerRect.bottom - gap - padding;
      const spaceAbove = triggerRect.top - gap - padding;
      const nextPlacement =
        spaceBelow >= 220 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
      const available = nextPlacement === 'bottom' ? spaceBelow : spaceAbove;
      const width = Math.max(triggerRect.width, 200);
      const left = Math.min(
        Math.max(triggerRect.left, padding),
        Math.max(padding, window.innerWidth - width - padding),
      );

      setMenuPlacement({
        top:
          nextPlacement === 'bottom' ? triggerRect.bottom + gap : triggerRect.top - gap,
        left,
        width,
        maxHeight: Math.min(280, Math.max(120, available)),
        placement: nextPlacement,
      });
    }

    setActiveIndex(initial);
    setOpen(true);
    play('open');
  };

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    setCurrent(option.value);
    setOpen(false);
    play('click');
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let index = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) {
        setActiveIndex(index);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu();
        else moveActive(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          const first = options.findIndex((option) => !option.disabled);
          if (first >= 0) setActiveIndex(first);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          for (let index = options.length - 1; index >= 0; index -= 1) {
            if (!options[index]?.disabled) {
              setActiveIndex(index);
              break;
            }
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openMenu();
        else choose(activeIndex);
        break;
      case 'Tab':
        if (open) closeMenu(false);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const insideControl = rootRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideControl && !insideMenu) setOpen(false);
    };

    const closeOnScroll = (event: Event) => {
      // The option list may scroll on its own; only viewport movement closes it.
      if (
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Close the listbox before an enclosing Dialog sees the same Escape.
      event.stopPropagation();
      closeMenu(true);
      play('close');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnViewportChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu || typeof menu.showPopover !== 'function') return;

    // Progressive enhancement: the popover attribute lifts the menu into the
    // top layer so ancestor overflow and transforms cannot clip it. Browsers
    // without the Popover API keep the fixed-position fallback.
    const handleToggle = (event: Event) => {
      const state = (event as Event & { newState?: string }).newState;
      if (state === 'closed') setOpen(false);
    };

    menu.addEventListener('toggle', handleToggle);

    try {
      menu.setAttribute('popover', 'manual');
      if (!menu.matches(':popover-open')) menu.showPopover();
    } catch {
      // If the top layer is unavailable, keep the fixed-position fallback.
      menu.removeAttribute('popover');
    }

    return () => {
      menu.removeEventListener('toggle', handleToggle);
      try {
        if (menu.matches(':popover-open')) menu.hidePopover();
      } catch {
        // Nothing to clean up.
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = optionRefs.current[activeIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  return (
    <div
      ref={rootRef}
      className={cx('pv-select', disabled && 'pv-select--disabled', className)}
      onBlur={(event) => {
        onBlur?.(event);
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      {...rootProps}
    >
      {label ? (
        <label id={labelId} className="pv-select__label" htmlFor={triggerId}>
          {label}
        </label>
      ) : null}
      <div className="pv-select__control">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (ariaLabel ?? t('chooseOption')) : undefined}
          aria-describedby={hintId}
          className="pv-select__trigger"
          disabled={disabled}
          onClick={() => {
            if (open) closeMenu(false);
            else openMenu();
          }}
          onKeyDown={handleKeyDown}
        >
          <span
            className={cx(
              'pv-select__value',
              !selectedOption && 'pv-select__value--placeholder',
            )}
          >
            {selectedOption
              ? selectedOption.label
              : (placeholder ?? t('selectPlaceholder'))}
          </span>
          <span className="pv-select__chevron" aria-hidden="true">
            <PixelIcon name="chevron-down" size={16} />
          </span>
        </button>
        {open ? (
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={!label ? (ariaLabel ?? t('options')) : undefined}
            className="pv-select__menu"
            data-placement={menuPlacement?.placement ?? 'bottom'}
            style={
              {
                top: menuPlacement?.top ?? -9999,
                left: menuPlacement?.left ?? -9999,
                width: menuPlacement?.width,
                maxHeight: menuPlacement?.maxHeight,
              } as CSSProperties
            }
            onMouseDown={(event) => {
              const target = event.target;
              if (target instanceof Element && target.closest('[role="option"]')) {
                event.preventDefault();
              }
            }}
          >
            {options.length === 0 ? (
              <li className="pv-select__empty">{t('noOptions')}</li>
            ) : (
              options.map((option, index) => {
                const selected = option.value === current;
                return (
                  <li
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    data-active={index === activeIndex}
                    className={cx(
                      'pv-select__option',
                      option.disabled && 'pv-select__option--disabled',
                    )}
                    onMouseEnter={() => {
                      if (!option.disabled) setActiveIndex(index);
                    }}
                    onClick={() => choose(index)}
                  >
                    <span className="pv-select__option-text">
                      <span>{option.label}</span>
                      {option.description ? (
                        <span className="pv-select__option-description">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span className="pv-select__check" aria-hidden="true">
                        <PixelIcon name="check" size={14} />
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="pv-select__hint">
          {hint}
        </p>
      ) : null}
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
