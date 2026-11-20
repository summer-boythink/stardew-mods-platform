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

export interface ComboboxOption {
  value: string;
  label: string;
  description?: ReactNode;
  /** Extra text included in filtering without being displayed. */
  keywords?: string;
  disabled?: boolean;
}

export interface ComboboxProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  options: readonly ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  label?: ReactNode;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  /** Renders a hidden input so the selected value participates in native forms. */
  name?: string;
  id?: string;
  emptyMessage?: string;
  clearable?: boolean;
}

interface MenuPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

/**
 * Searchable single-select combobox. Filtering is local, keyboard navigation
 * uses aria-activedescendant, and the listbox is progressively lifted into the
 * Popover top layer so it cannot be clipped by a panel or drawer.
 */
export function Combobox({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  label,
  hint,
  error,
  disabled = false,
  required = false,
  name,
  id,
  emptyMessage,
  clearable = false,
  className,
  onBlur,
  ...rest
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? `pv-combobox-${generatedId}`;
  const labelId = `${inputId}-label`;
  const listId = `${inputId}-listbox`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const helpId = error ? errorId : hintId;
  const optionId = (index: number) => `${inputId}-option-${index}`;
  const { 'aria-label': ariaLabel, ...rootProps } = rest;

  const [current, setCurrent] = useControllableState<string>({
    value,
    defaultValue: defaultValue ?? '',
    onChange: onValueChange,
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const { play } = useSound();
  const { t } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const suppressFocusOpenRef = useRef(false);

  const selectedOption = options.find((option) => option.value === current);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered =
    typing && normalizedQuery.length > 0
      ? options.filter((option) => {
          const haystack = `${option.label} ${option.keywords ?? ''} ${
            typeof option.description === 'string' ? option.description : ''
          }`;
          return haystack.toLocaleLowerCase().includes(normalizedQuery);
        })
      : options;

  const firstEnabledIndex = filtered.findIndex((option) => !option.disabled);
  const effectiveActiveIndex =
    activeIndex >= 0 && activeIndex < filtered.length && !filtered[activeIndex]?.disabled
      ? activeIndex
      : firstEnabledIndex;

  const displayValue = typing ? query : (selectedOption?.label ?? '');

  const computePlacement = (): MenuPlacement | null => {
    if (typeof window === 'undefined') return null;
    const input = inputRef.current;
    if (!input) return null;

    const rect = input.getBoundingClientRect();
    const gap = 6;
    const padding = 8;
    const width = Math.max(200, Math.min(rect.width, window.innerWidth - 16));
    const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
    const spaceAbove = rect.top - gap - padding;
    const nextPlacement =
      spaceBelow >= 180 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const available = nextPlacement === 'bottom' ? spaceBelow : spaceAbove;
    const left = Math.min(
      Math.max(rect.left, padding),
      Math.max(padding, window.innerWidth - width - padding),
    );

    return {
      top: nextPlacement === 'bottom' ? rect.bottom + gap : rect.top - gap,
      left,
      width,
      maxHeight: Math.min(280, Math.max(100, available)),
      placement: nextPlacement,
    };
  };

  const openMenu = (focus: 'first' | 'last' | 'selected' = 'selected') => {
    if (disabled) return;
    setPlacement(computePlacement());
    setOpen(true);
    const selectedIndex = filtered.findIndex(
      (option) => option.value === current && !option.disabled,
    );
    const target =
      focus === 'last'
        ? filtered.reduce(
            (last, option, index) => (!option.disabled ? index : last),
            firstEnabledIndex,
          )
        : focus === 'first'
          ? firstEnabledIndex
          : selectedIndex >= 0
            ? selectedIndex
            : firstEnabledIndex;
    setActiveIndex(target);
    play('open');
  };

  const closeMenu = () => {
    setOpen(false);
    setTyping(false);
    setQuery('');
  };

  const moveActive = (direction: 1 | -1) => {
    if (filtered.length === 0) return;
    let index = effectiveActiveIndex;
    for (let step = 0; step < filtered.length; step += 1) {
      index = (index + direction + filtered.length) % filtered.length;
      if (!filtered[index]?.disabled) {
        setActiveIndex(index);
        return;
      }
    }
  };

  const choose = (index: number) => {
    const option = filtered[index];
    if (!option || option.disabled) return;
    setCurrent(option.value);
    setTyping(false);
    setQuery('');
    setOpen(false);
    play('click');
  };

  const clear = () => {
    setCurrent('');
    setTyping(false);
    setQuery('');
    setOpen(false);

    const input = inputRef.current;
    if (!input) return;
    if (document.activeElement === input) {
      input.select();
      return;
    }
    suppressFocusOpenRef.current = true;
    input.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu('first');
        else moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu('last');
        else moveActive(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(firstEnabledIndex);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          for (let index = filtered.length - 1; index >= 0; index -= 1) {
            if (!filtered[index]?.disabled) {
              setActiveIndex(index);
              break;
            }
          }
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (open) choose(effectiveActiveIndex);
        else openMenu('selected');
        break;
      case 'Tab':
        if (open) closeMenu();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex(
      (option) => option.value === current && !option.disabled,
    );
    setActiveIndex(
      selectedIndex >= 0
        ? selectedIndex
        : filtered.findIndex((option) => !option.disabled),
    );
    // Filtered is derived from these inputs.
  }, [open, query, typing, options, current]);

  useEffect(() => {
    if (!open || effectiveActiveIndex < 0) return;
    const node = optionRefs.current[effectiveActiveIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [open, effectiveActiveIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const updateMenuPlacement = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        closeMenu();
        return;
      }
      const next = computePlacement();
      if (!next) return;
      setPlacement((previous) =>
        previous &&
        previous.top === next.top &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.maxHeight === next.maxHeight &&
        previous.placement === next.placement
          ? previous
          : next,
      );
    };
    const handleScroll = (event: Event) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      updateMenuPlacement();
    };
    const handleResize = () => updateMenuPlacement();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      play('close');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    setPlacement(computePlacement());
    const menu = menuRef.current;
    if (!menu || typeof menu.showPopover !== 'function') return;

    const handleToggle = (event: Event) => {
      const state = (event as Event & { newState?: string }).newState;
      if (state === 'closed') closeMenu();
    };
    menu.addEventListener('toggle', handleToggle);

    try {
      menu.setAttribute('popover', 'manual');
      if (!menu.matches(':popover-open')) menu.showPopover();
    } catch {
      menu.removeAttribute('popover');
    }

    return () => {
      menu.removeEventListener('toggle', handleToggle);
      try {
        if (menu.matches(':popover-open')) menu.hidePopover();
      } catch {
        // The fixed-position fallback needs no cleanup.
      }
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cx('pv-combobox', disabled && 'pv-combobox--disabled', className)}
      onBlur={(event) => {
        onBlur?.(event);
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeMenu();
        }
      }}
      {...rootProps}
    >
      {label ? (
        <label id={labelId} className="pv-combobox__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="pv-combobox__control">
        <span className="pv-combobox__icon" aria-hidden="true">
          <PixelIcon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          className="pv-combobox__input"
          value={displayValue}
          placeholder={placeholder ?? t('searchPlaceholder')}
          disabled={disabled}
          required={required}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && effectiveActiveIndex >= 0 ? optionId(effectiveActiveIndex) : undefined
          }
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (ariaLabel ?? t('searchOptions')) : undefined}
          aria-describedby={helpId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setTyping(true);
            setQuery(event.currentTarget.value);
            if (!open) openMenu('first');
          }}
          onFocus={(event) => {
            if (disabled) return;
            if (suppressFocusOpenRef.current) {
              suppressFocusOpenRef.current = false;
              return;
            }
            if (!open) openMenu('selected');
            setTyping(false);
            setQuery('');
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (disabled) return;
            if (!open) openMenu('selected');
            if (!typing) event.currentTarget.select();
          }}
          onKeyDown={handleKeyDown}
        />
        {clearable && (current || typing) ? (
          <button
            type="button"
            className="pv-combobox__clear"
            aria-label={t('clearSelection')}
            tabIndex={disabled ? -1 : 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
          >
            <PixelIcon name="close" size={13} />
          </button>
        ) : (
          <span className="pv-combobox__chevron" aria-hidden="true">
            <PixelIcon name="chevron-down" size={15} />
          </span>
        )}
      </div>
      {error ? (
        <p
          id={errorId}
          className="pv-combobox__help pv-combobox__help--error"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="pv-combobox__help">
          {hint}
        </p>
      ) : null}

      {open ? (
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={
            typeof label === 'string' ? t('labelOptions', { label }) : t('options')
          }
          className="pv-combobox__menu"
          data-placement={placement?.placement ?? 'bottom'}
          style={
            {
              top: placement?.top ?? -9999,
              left: placement?.left ?? -9999,
              width: placement?.width,
              maxHeight: placement?.maxHeight,
              visibility: placement ? 'visible' : 'hidden',
            } as CSSProperties
          }
        >
          {filtered.length === 0 ? (
            <li className="pv-combobox__empty" role="presentation">
              {emptyMessage ?? t('noMatches')}
            </li>
          ) : (
            filtered.map((option, index) => {
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
                  data-active={index === effectiveActiveIndex}
                  className={cx(
                    'pv-combobox__option',
                    option.disabled && 'pv-combobox__option--disabled',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!option.disabled) setActiveIndex(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <span className="pv-combobox__option-text">
                    <span className="pv-combobox__option-label">{option.label}</span>
                    {option.description ? (
                      <span className="pv-combobox__option-description">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <span className="pv-combobox__check" aria-hidden="true">
                      <PixelIcon name="check" size={14} />
                    </span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
