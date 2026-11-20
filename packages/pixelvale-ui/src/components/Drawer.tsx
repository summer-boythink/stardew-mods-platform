import { cx } from '../lib/cx';
import { Dialog, type DialogProps } from './Dialog';

export type DrawerSide = 'left' | 'right';
export type DrawerWidth = 'sm' | 'md' | 'lg';

export interface DrawerProps extends Omit<DialogProps, 'size' | 'overlayClassName'> {
  /** Which edge the sheet slides in from. Defaults to right. */
  side?: DrawerSide;
  /** Preferred drawer width. The sheet is always capped at the viewport. */
  width?: DrawerWidth;
}

/**
 * Side sheet built on the same focus trap, inert background, scroll lock and
 * Escape handling as Dialog. The only differences are placement and animation.
 */
export function Drawer({
  side = 'right',
  width = 'md',
  className,
  ...props
}: DrawerProps) {
  return (
    <Dialog
      {...props}
      className={cx('pv-drawer', `pv-drawer--${side}`, `pv-drawer--${width}`, className)}
      overlayClassName={cx(
        'pv-overlay--drawer',
        side === 'left' && 'pv-overlay--drawer--left',
      )}
    />
  );
}
