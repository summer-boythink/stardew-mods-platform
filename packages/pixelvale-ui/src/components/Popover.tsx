import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { usePortalHost, useSound } from './PixelValeProvider';

export type PopoverPlacement = 'top' | 'bottom';
export type PopoverAlign = 'start' | 'center' | 'end';

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  trigger: ReactElement;
  children: ReactNode;
  /** Accessible name for the non-modal dialog panel. */
  label: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  /** Panel width in pixels, clamped to the viewport. Defaults to 300. */
  width?: number;
  /** Gap between anchor and panel. Defaults to 8. */
  offset?: number;
  disabled?: boolean;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  /** Moves focus into the panel when it opens. Defaults to true. */
  autoFocus?: boolean;
  panelClassName?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: PopoverPlacement;
}

const VIEWPORT_PADDING = 8;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Anchored non-modal dialog. It preserves the trigger's click/keyboard
 * handlers, lifts the panel into the Popover top layer when available, flips
 * at the viewport edge, and returns focus to the trigger after Escape.
 */
export function Popover({
  trigger,
  children,
  label,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom',
  align = 'start',
  width = 300,
  offset = 8,
  disabled = false,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  autoFocus = true,
  className,
  panelClassName,
  ...rest
}: PopoverProps) {
  const generatedId = useId();
  const panelId = `pv-popover-${generatedId}`;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const portalHost = usePortalHost();
  const { play } = useSound();

  const [open, setOpen] = useControllableState<boolean>({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  const computePosition = (): PopoverPosition | null => {
    if (typeof window === 'undefined') return null;
    const anchor = anchorRef.current;
    if (!anchor) return null;

    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.max(
      160,
      Math.min(
        Number.isFinite(width) ? width : 300,
        window.innerWidth - VIEWPORT_PADDING * 2,
      ),
    );
    const gap = Math.max(0, offset);
    const spaceBelow = window.innerHeight - rect.bottom - gap - VIEWPORT_PADDING;
    const spaceAbove = rect.top - gap - VIEWPORT_PADDING;
    const nextPlacement: PopoverPlacement =
      placement === 'top'
        ? spaceAbove >= 160 || spaceAbove >= spaceBelow
          ? 'top'
          : 'bottom'
        : spaceBelow >= 160 || spaceBelow >= spaceAbove
          ? 'bottom'
          : 'top';
    const available = nextPlacement === 'bottom' ? spaceBelow : spaceAbove;

    const requestedLeft =
      align === 'start'
        ? rect.left
        : align === 'end'
          ? rect.right - panelWidth
          : rect.left + (rect.width - panelWidth) / 2;
    const left = clamp(
      requestedLeft,
      VIEWPORT_PADDING,
      Math.max(VIEWPORT_PADDING, window.innerWidth - panelWidth - VIEWPORT_PADDING),
    );

    return {
      top: nextPlacement === 'bottom' ? rect.bottom + gap : rect.top - gap,
      left,
      width: panelWidth,
      maxHeight: Math.min(440, Math.max(120, available)),
      placement: nextPlacement,
    };
  };

  const focusTrigger = () => {
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };

  const closePopover = (restoreFocus = false) => {
    if (!open) return;
    setOpen(false);
    play('close');
    if (restoreFocus) focusTrigger();
  };

  const openPopover = () => {
    if (disabled) return;
    setPosition(computePosition());
    setOpen(true);
    play('open');
  };

  const triggerProps = {
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    'aria-haspopup': 'dialog' as const,
    'aria-disabled': disabled || undefined,
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      const original = trigger.props as {
        onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
      };
      original.onClick?.(event);
      if (event.defaultPrevented || disabled) return;
      if (open) closePopover();
      else openPopover();
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      const original = trigger.props as {
        onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
      };
      original.onKeyDown?.(event);
      if (event.defaultPrevented || disabled || open) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openPopover();
      }
    },
  };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const update = () => {
      const next = computePosition();
      if (!next) return;
      setPosition((previous) =>
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
    const handlePointerDown = (event: PointerEvent) => {
      if (!closeOnOutsideClick) return;
      const target = event.target;
      if (
        target instanceof Node &&
        (anchorRef.current?.contains(target) || panelRef.current?.contains(target))
      ) {
        return;
      }
      closePopover();
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (!closeOnOutsideClick) return;
      const next = event.relatedTarget;
      if (
        next instanceof Node &&
        (anchorRef.current?.contains(next) || panelRef.current?.contains(next))
      ) {
        return;
      }
      if (next === null) return;
      closePopover();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePopover(true);
    };
    const handleScroll = (event: Event) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        panelRef.current.contains(event.target)
      ) {
        return;
      }
      update();
    };
    const handleResize = () => update();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusout', handleFocusOut, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, closeOnEscape, closeOnOutsideClick]);

  useLayoutEffect(() => {
    if (!open) return;
    setPosition(computePosition());
    const panel = panelRef.current;
    if (!panel || typeof panel.showPopover !== 'function') return;

    const handleToggle = (event: Event) => {
      const state = (event as Event & { newState?: string }).newState;
      if (state === 'closed') closePopover();
    };
    panel.addEventListener('toggle', handleToggle);

    try {
      panel.setAttribute('popover', 'manual');
      if (!panel.matches(':popover-open')) panel.showPopover();
    } catch {
      panel.removeAttribute('popover');
    }

    return () => {
      panel.removeEventListener('toggle', handleToggle);
      try {
        if (panel.matches(':popover-open')) panel.hidePopover();
      } catch {
        // Fixed-position fallback needs no cleanup.
      }
    };
  }, [open]);

  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (open && !wasOpenRef.current && autoFocus) {
      const panel = panelRef.current;
      if (panel) {
        const focusable = panel.querySelector<HTMLElement>(FOCUSABLE);
        (focusable ?? panel).focus();
      }
    }
    wasOpenRef.current = open;
  }, [open, autoFocus]);

  return (
    <>
      <span
        ref={anchorRef}
        className={cx('pv-popover-anchor', className)}
        data-disabled={disabled ? 'true' : undefined}
        {...rest}
      >
        {cloneElement(trigger, triggerProps)}
      </span>

      {open && portalHost
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              className={cx('pv-popover', panelClassName)}
              data-placement={position?.placement ?? placement}
              style={
                {
                  top: position?.top ?? -9999,
                  left: position?.left ?? -9999,
                  width: position?.width,
                  maxHeight: position?.maxHeight,
                  visibility: position ? 'visible' : 'hidden',
                } as CSSProperties
              }
            >
              {children}
            </div>,
            portalHost,
          )
        : null}
    </>
  );
}
