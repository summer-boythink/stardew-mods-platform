import {
  useEffect,
  useId,
  useRef,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { lockBodyScroll } from '../lib/scrollLock';
import { useLatest } from '../lib/useLatest';
import { useLocale, usePortalHost } from './PixelValeProvider';
import { IconButton } from './Button';
import { PixelIcon } from './PixelIcon';

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Allow Escape and backdrop clicks to close the dialog. Defaults to true. */
  dismissable?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  /** Extra class name for the backdrop, useful for sheet/drawer placement. */
  overlayClassName?: string;
  /** Required when no visible title is provided. */
  ariaLabel?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Keeps Escape from closing every nested dialog at once.
const dialogStack: symbol[] = [];

interface InertSnapshot {
  element: HTMLElement;
  hadInert: boolean;
}

let inertLocks = 0;
let inertSnapshots: InertSnapshot[] = [];

/**
 * Make the app shell inert while a dialog is open. The themed portal host is a
 * sibling of the app content, so marking its siblings keeps every overlay
 * (including toasts and stacked dialogs) fully interactive.
 */
function lockBackground(host: HTMLElement): () => void {
  if (inertLocks === 0) {
    const portal = host.closest('.pv-portal');
    const root = portal?.parentElement;
    if (portal && root) {
      for (const child of Array.from(root.children)) {
        if (child === portal || !(child instanceof HTMLElement)) continue;
        inertSnapshots.push({
          element: child,
          hadInert: child.hasAttribute('inert'),
        });
        child.setAttribute('inert', '');
      }
    }
  }
  inertLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    inertLocks = Math.max(0, inertLocks - 1);
    if (inertLocks === 0) {
      for (const snapshot of inertSnapshots) {
        if (!snapshot.hadInert) snapshot.element.removeAttribute('inert');
      }
      inertSnapshots = [];
    }
  };
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  dismissable = true,
  initialFocusRef,
  className,
  overlayClassName,
  ariaLabel,
}: DialogProps) {
  const generatedId = useId();
  const titleId = `pv-dialog-${generatedId}-title`;
  const descriptionId = `pv-dialog-${generatedId}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const portalHost = usePortalHost();
  const { t } = useLocale();
  const onOpenChangeRef = useLatest(onOpenChange);
  const dismissableRef = useLatest(dismissable);

  useEffect(() => {
    if (!open || !portalHost) return;

    const token = Symbol('dialog');
    dialogStack.push(token);

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll();
    const releaseInert = lockBackground(portalHost);

    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusRef?.current;
      const fallback = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (preferred ?? fallback ?? panelRef.current)?.focus();
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;

      if (event.key === 'Escape' && dismissableRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onOpenChangeRef.current?.(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => {
        if (element.hasAttribute('inert') || element.hidden) return false;
        if (element instanceof HTMLInputElement && element.type === 'hidden') {
          return false;
        }
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last?.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      const index = dialogStack.lastIndexOf(token);
      if (index >= 0) dialogStack.splice(index, 1);
      releaseInert();
      releaseScroll();
      if (
        dialogStack.length === 0 &&
        previouslyFocused &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [open, portalHost, initialFocusRef, onOpenChangeRef, dismissableRef]);

  if (!open || !portalHost) return null;

  const requestClose = () => {
    onOpenChangeRef.current?.(false);
  };

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!dismissable) return;
    requestClose();
  };

  return createPortal(
    <div
      className={cx('pv-overlay', overlayClassName)}
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? (ariaLabel ?? t('dialogLabel')) : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx('pv-dialog', 'pv-panel', `pv-dialog--${size}`, className)}
      >
        <header className="pv-dialog__header">
          <div className="pv-dialog__heading">
            {icon ? <span className="pv-dialog__icon">{icon}</span> : null}
            <div>
              {title ? (
                <h2 id={titleId} className="pv-dialog__title">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={descriptionId} className="pv-dialog__description">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {onOpenChange ? (
            <IconButton
              label={t('closeDialog')}
              variant="ghost"
              size="sm"
              className="pv-dialog__close"
              onClick={() => requestClose()}
            >
              <PixelIcon name="close" size={16} />
            </IconButton>
          ) : null}
        </header>
        <div className="pv-dialog__body">{children}</div>
        {footer ? <footer className="pv-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    portalHost,
  );
}
