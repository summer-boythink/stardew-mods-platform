import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, Dialog, PixelIcon, ToastProvider } from '@pixelvale/ui';

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  /** Text on the confirm button. Defaults to 确定. */
  confirmLabel?: string;
  /** Text on the cancel button. Defaults to 取消. */
  cancelLabel?: string;
  /** Uses the red danger button and focuses Cancel first. */
  destructive?: boolean;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction>(() => Promise.resolve(false));

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * App-wide confirm dialog + toast host.
 *
 * Native `window.confirm` / `window.alert` break the pixel theme and block the
 * event loop; this provider keeps the same promise-based ergonomics while using
 * Pixelvale's focus-trapped Dialog.
 */
export function FeedbackProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback<ConfirmFunction>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A second request supersedes the first; never leave a promise hanging.
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  useEffect(() => {
    return () => {
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, []);

  const destructive = pending?.destructive ?? false;

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastProvider max={4} defaultDuration={4200}>
        {children}
      </ToastProvider>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={pending?.title}
        icon={
          <PixelIcon name={destructive ? 'alert' : 'info'} size={20} />
        }
        size="sm"
        initialFocusRef={destructive ? cancelRef : confirmRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="ghost"
              onClick={() => settle(false)}
            >
              {pending?.cancelLabel ?? '取消'}
            </Button>
            <Button
              ref={confirmRef}
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? '确定'}
            </Button>
          </>
        }
      >
        <div className="confirm-body">{pending?.description}</div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFunction {
  return useContext(ConfirmContext);
}
