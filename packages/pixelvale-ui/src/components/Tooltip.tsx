import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { usePortalHost } from './PixelValeProvider';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  placement?: TooltipPlacement;
  /** Delay before showing on hover, in milliseconds. Focus shows immediately. */
  delay?: number;
  disabled?: boolean;
  className?: string;
}

interface TooltipChildProps {
  'aria-describedby'?: string;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
  arrowX: number;
}

const VIEWPORT_PADDING = 8;
const GAP = 10;

// Only one tooltip may be open across the app. Focus and hover can otherwise
// leave an old keyboard tooltip floating while the mouse explores elsewhere.
let activeTooltipOwner: symbol | null = null;
let activeTooltipDismiss: (() => void) | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 120,
  disabled = false,
  className,
}: TooltipProps) {
  const id = `pv-tooltip-${useId()}`;
  const instanceId = useRef(Symbol('pv-tooltip'));
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const portalHost = usePortalHost();

  const clearTimers = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const releaseSingleton = () => {
    if (activeTooltipOwner === instanceId.current) {
      activeTooltipOwner = null;
      activeTooltipDismiss = null;
    }
  };

  const hideNow = () => {
    clearTimers();
    setVisible(false);
    setPosition(null);
    releaseSingleton();
  };

  const claimSingleton = () => {
    if (activeTooltipOwner && activeTooltipOwner !== instanceId.current) {
      const dismiss = activeTooltipDismiss;
      activeTooltipOwner = null;
      activeTooltipDismiss = null;
      dismiss?.();
    }
    activeTooltipOwner = instanceId.current;
    activeTooltipDismiss = hideNow;
  };

  const reveal = () => {
    claimSingleton();
    setVisible(true);
  };

  const show = (immediate: boolean) => {
    if (disabled || content === null || content === undefined) return;
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (visible) return;
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);

    if (immediate) {
      reveal();
    } else {
      showTimer.current = window.setTimeout(
        () => {
          reveal();
          showTimer.current = null;
        },
        Math.max(0, delay),
      );
    }
  };

  const hide = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (!visible) return;
    if (hideTimer.current !== null) return;
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      setPosition(null);
      hideTimer.current = null;
    }, 60);
  };

  useEffect(() => {
    if (disabled) hideNow();
  }, [disabled]);

  useEffect(() => {
    return () => {
      clearTimers();
      releaseSingleton();
    };
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;

    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tip = tipRef.current?.getBoundingClientRect();
      if (!anchor || !tip) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let resolved = placement;

      if (placement === 'top' && anchor.top - tip.height - GAP < VIEWPORT_PADDING) {
        resolved = 'bottom';
      } else if (
        placement === 'bottom' &&
        anchor.bottom + tip.height + GAP > viewportHeight - VIEWPORT_PADDING
      ) {
        resolved = 'top';
      } else if (
        placement === 'left' &&
        anchor.left - tip.width - GAP < VIEWPORT_PADDING
      ) {
        resolved = 'right';
      } else if (
        placement === 'right' &&
        anchor.right + tip.width + GAP > viewportWidth - VIEWPORT_PADDING
      ) {
        resolved = 'left';
      }

      let top = 0;
      let left = 0;
      if (resolved === 'top') {
        top = anchor.top - tip.height - GAP;
        left = anchor.left + anchor.width / 2 - tip.width / 2;
      } else if (resolved === 'bottom') {
        top = anchor.bottom + GAP;
        left = anchor.left + anchor.width / 2 - tip.width / 2;
      } else if (resolved === 'left') {
        top = anchor.top + anchor.height / 2 - tip.height / 2;
        left = anchor.left - tip.width - GAP;
      } else {
        top = anchor.top + anchor.height / 2 - tip.height / 2;
        left = anchor.right + GAP;
      }

      left = clamp(left, VIEWPORT_PADDING, viewportWidth - tip.width - VIEWPORT_PADDING);
      top = clamp(top, VIEWPORT_PADDING, viewportHeight - tip.height - VIEWPORT_PADDING);

      const anchorCenter = anchor.left + anchor.width / 2;
      const arrowX =
        resolved === 'left' || resolved === 'right'
          ? tip.height / 2
          : clamp(anchorCenter - left, 12, Math.max(12, tip.width - 12));

      setPosition({ top, left, placement: resolved, arrowX });
    };

    update();
    window.addEventListener('resize', update);
    const hideOnScroll = () => hideNow();
    window.addEventListener('scroll', hideOnScroll, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', hideOnScroll, true);
    };
  }, [visible, placement]);

  const child = Children.only(children) as ReactElement<TooltipChildProps>;
  const existingDescription = child.props['aria-describedby'];
  const describedBy = [existingDescription, visible ? id : null]
    .filter(Boolean)
    .join(' ');

  const trigger = cloneElement(child, {
    'aria-describedby': describedBy || undefined,
  } as Partial<TooltipChildProps>);

  return (
    <>
      <span
        ref={anchorRef}
        className={cx('pv-tooltip-anchor', className)}
        onPointerEnter={() => show(false)}
        onPointerLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hideNow();
        }}
      >
        {trigger}
      </span>
      {visible && portalHost
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              className="pv-tooltip"
              data-placement={position?.placement ?? placement}
              style={
                {
                  top: position?.top ?? 0,
                  left: position?.left ?? 0,
                  opacity: position ? 1 : 0,
                  '--pv-arrow-x': `${position?.arrowX ?? 0}px`,
                } as CSSProperties
              }
            >
              {content}
            </div>,
            portalHost,
          )
        : null}
    </>
  );
}
