import {
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
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export type DropdownMenuItem =
  | {
      type?: 'item';
      id: string;
      label: ReactNode;
      icon?: ReactNode;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect?: () => void;
    }
  | { type: 'separator'; id: string }
  | { type: 'label'; id: string; label: ReactNode };

export interface DropdownMenuProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onSelect'
> {
  items: readonly DropdownMenuItem[];
  /** Visible label for the trigger and accessible name for the menu. */
  label: string;
  triggerIcon?: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  align?: 'start' | 'end';
  /** Preferred menu width in pixels. Clamped to the viewport. */
  menuWidth?: number;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (id: string) => void;
  menuLabel?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

/**
 * Accessible menu button. The menu opens in the Popover top layer when
 * available, focuses the first/last enabled item, closes on Escape, and
 * returns focus to the trigger. A fixed-position fallback covers older browsers.
 */
export function DropdownMenu({
  items,
  label,
  triggerIcon,
  triggerVariant = 'default',
  triggerSize = 'md',
  align = 'start',
  menuWidth = 260,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  onSelect,
  menuLabel,
  className,
  ...rest
}: DropdownMenuProps) {
  const generatedId = useId();
  const menuId = `pv-menu-${generatedId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusTargetRef = useRef<'first' | 'last'>('first');
  const focusedForOpenRef = useRef(false);

  const [open, setOpen] = useControllableState<boolean>({
    value: controlledOpen,
    defaultValue: false,
    onChange: onOpenChange,
  });
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const { play } = useSound();
  const { t } = useLocale();

  const getEnabledItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  const computePosition = (): MenuPosition | null => {
    if (typeof window === 'undefined') return null;
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const padding = 8;
    const requestedWidth = Number.isFinite(menuWidth) ? menuWidth : 260;
    const width = Math.max(
      120,
      Math.min(requestedWidth, window.innerWidth - padding * 2),
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
    const spaceAbove = rect.top - gap - padding;
    const placement = spaceBelow >= 180 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const available = placement === 'bottom' ? spaceBelow : spaceAbove;
    const rawLeft = align === 'end' ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(rawLeft, padding),
      Math.max(padding, window.innerWidth - width - padding),
    );

    return {
      top: placement === 'bottom' ? rect.bottom + gap : rect.top - gap,
      left,
      width,
      maxHeight: Math.min(320, Math.max(100, available)),
      placement,
    };
  };

  const openMenu = (focusTarget: 'first' | 'last') => {
    if (disabled) return;
    focusTargetRef.current = focusTarget;
    setPosition(computePosition());
    setOpen(true);
  };

  const closeMenu = (refocusTrigger: boolean) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  const focusTarget = (target: 'first' | 'last') => {
    const buttons = getEnabledItems();
    const button = target === 'first' ? buttons[0] : buttons[buttons.length - 1];
    (button ?? menuRef.current)?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openMenu('first');
      else focusTarget('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openMenu('last');
      else focusTarget('last');
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    const buttons = getEnabledItems();
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        buttons[(currentIndex + 1 + buttons.length) % buttons.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        buttons[(currentIndex - 1 + buttons.length) % buttons.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
        break;
      default:
        break;
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      focusedForOpenRef.current = false;
      return;
    }

    setPosition(computePosition());
    const menu = menuRef.current;
    if (!menu) return;

    const handleToggle = (event: Event) => {
      const state = (event as Event & { newState?: string }).newState;
      if (state === 'closed') setOpen(false);
    };
    menu.addEventListener('toggle', handleToggle);

    if (typeof menu.showPopover === 'function') {
      try {
        menu.setAttribute('popover', 'manual');
        if (!menu.matches(':popover-open')) menu.showPopover();
      } catch {
        menu.removeAttribute('popover');
      }
    }

    return () => {
      focusedForOpenRef.current = false;
      menu.removeEventListener('toggle', handleToggle);
      try {
        if (menu.matches(':popover-open')) menu.hidePopover();
      } catch {
        // The fixed-position fallback needs no cleanup.
      }
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !position || focusedForOpenRef.current) return;
    focusedForOpenRef.current = true;
    focusTarget(focusTargetRef.current);
  }, [open, position]);

  useLayoutEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) setOpen(false);
    };
    const closeOnScroll = (event: Event) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const closeOnResize = () => setOpen(false);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Window capture runs before a parent Dialog's document handler. Escape
      // should close the menu first, not the whole dialog underneath it.
      event.stopPropagation();
      closeMenu(true);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  const activate = (itemId: string, onItemSelect?: () => void) => {
    play('click');
    onItemSelect?.();
    onSelect?.(itemId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={cx('pv-dropdown', className)}
      data-open={open}
      {...rest}
    >
      <Button
        ref={triggerRef}
        className="pv-dropdown__trigger"
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        leftIcon={triggerIcon}
        rightIcon={<PixelIcon name="chevron-down" size={15} />}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu('first');
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {label}
      </Button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={menuLabel ?? t('menuLabel', { label })}
          className="pv-menu"
          data-placement={position?.placement ?? 'bottom'}
          style={
            {
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              width: position?.width,
              maxHeight: position?.maxHeight,
              visibility: position ? 'visible' : 'hidden',
            } as CSSProperties
          }
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => {
            if (item.type === 'separator') {
              return (
                <div key={item.id} className="pv-menu__separator" role="separator" />
              );
            }

            if (item.type === 'label') {
              return (
                <div key={item.id} className="pv-menu__label" role="presentation">
                  {item.label}
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-keyshortcuts={item.shortcut}
                className={cx('pv-menu__item', item.danger && 'pv-menu__item--danger')}
                disabled={item.disabled}
                onClick={() => activate(item.id, item.onSelect)}
              >
                {item.icon ? (
                  <span className="pv-menu__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : (
                  <span className="pv-menu__icon" aria-hidden="true" />
                )}
                <span className="pv-menu__item-label">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="pv-menu__shortcut" aria-hidden="true">
                    {item.shortcut}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
