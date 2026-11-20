import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { useLocale, usePortalHost, useSound } from './PixelValeProvider';
import { IconButton } from './Button';
import { PixelIcon } from './PixelIcon';
import { PixelSprite } from './PixelSprite';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'gold';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** Auto-dismiss delay in milliseconds. Use 0 to keep it on screen. */
  duration?: number;
}

export interface ToastApi {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
  variant: ToastVariant;
  duration: number;
  leaving: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);

function sanitizeLimit(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
}

function sanitizeDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'gold') {
    return <PixelSprite name="coin" size={24} />;
  }
  const icon =
    variant === 'success'
      ? 'check'
      : variant === 'warning' || variant === 'error'
        ? 'alert'
        : 'info';
  return <PixelIcon name={icon} size={20} />;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Maximum visible toasts before old ones politely leave. Defaults to 4. */
  max?: number;
  /** Default auto-dismiss delay in milliseconds. Defaults to 4200. */
  defaultDuration?: number;
}

export function ToastProvider({
  children,
  max = 4,
  defaultDuration = 4200,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);
  const autoTimers = useRef(new Map<number, number>());
  const removeTimers = useRef(new Map<number, number>());
  const leavingRef = useRef(new Set<number>());
  const portalHost = usePortalHost();
  const { play } = useSound();
  const { t } = useLocale();
  const maxRef = useRef(max);
  const defaultDurationRef = useRef(defaultDuration);

  useEffect(() => {
    maxRef.current = sanitizeLimit(max);
  }, [max]);

  useEffect(() => {
    defaultDurationRef.current = defaultDuration;
  }, [defaultDuration]);

  const beginDismiss = useCallback((id: number) => {
    const auto = autoTimers.current.get(id);
    if (auto !== undefined) {
      window.clearTimeout(auto);
      autoTimers.current.delete(id);
    }

    if (leavingRef.current.has(id)) return;
    leavingRef.current.add(id);

    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
    );

    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      leavingRef.current.delete(id);
      removeTimers.current.delete(id);
    }, 190);
    removeTimers.current.set(id, timer);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      beginDismiss(id);
    },
    [beginDismiss],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      idRef.current += 1;
      const id = idRef.current;
      const duration = sanitizeDuration(
        typeof options.duration === 'number'
          ? options.duration
          : defaultDurationRef.current,
      );
      const variant = options.variant ?? 'info';
      const record: ToastRecord = {
        ...options,
        id,
        variant,
        duration,
        leaving: false,
      };

      setToasts((current) => [...current, record]);

      if (duration > 0) {
        const timer = window.setTimeout(() => beginDismiss(id), duration);
        autoTimers.current.set(id, timer);
      }

      if (variant === 'success') play('success');
      else if (variant === 'error') play('error');
      else if (variant === 'gold') play('coin');

      return id;
    },
    [beginDismiss, play],
  );

  useEffect(() => {
    const limit = sanitizeLimit(max);
    if (toasts.length <= limit) return;
    for (const item of toasts.slice(0, toasts.length - limit)) {
      beginDismiss(item.id);
    }
  }, [toasts, max, beginDismiss]);

  useEffect(() => {
    return () => {
      for (const timer of autoTimers.current.values()) window.clearTimeout(timer);
      for (const timer of removeTimers.current.values()) window.clearTimeout(timer);
      autoTimers.current.clear();
      removeTimers.current.clear();
      leavingRef.current.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portalHost
        ? createPortal(
            <div
              className="pv-toast-viewport"
              role="region"
              aria-label={t('notifications')}
            >
              {toasts.map((item) => (
                <div
                  key={item.id}
                  className={cx(
                    'pv-toast',
                    `pv-toast--${item.variant}`,
                    item.leaving && 'pv-toast--leaving',
                  )}
                  role="status"
                >
                  <span className="pv-toast__icon" aria-hidden="true">
                    <ToastIcon variant={item.variant} />
                  </span>
                  <div className="pv-toast__content">
                    <p className="pv-toast__title">{item.title}</p>
                    {item.description ? (
                      <p className="pv-toast__description">{item.description}</p>
                    ) : null}
                  </div>
                  <IconButton
                    label={t('dismissNotification')}
                    variant="ghost"
                    size="sm"
                    className="pv-toast__close"
                    onClick={() => dismiss(item.id)}
                  >
                    <PixelIcon name="close" size={14} />
                  </IconButton>
                  {item.duration > 0 && !item.leaving ? (
                    <span
                      className="pv-toast__progress"
                      aria-hidden="true"
                      style={{ animationDuration: `${item.duration}ms` }}
                    />
                  ) : null}
                </div>
              ))}
            </div>,
            portalHost,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }
  return value;
}
