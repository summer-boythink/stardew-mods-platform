import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { IconButton } from './Button';
import { useLocale } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';
import { PixelSprite } from './PixelSprite';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error' | 'gold';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Shows a close button when an onDismiss handler is also provided. */
  dismissible?: boolean;
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * Inline notice for feedback that should stay in the layout. Errors use
 * role="alert"; other variants use role="status" unless overridden.
 */
export function Alert({
  variant = 'info',
  title,
  icon,
  action,
  dismissible = false,
  onDismiss,
  dismissLabel,
  className,
  children,
  ...rest
}: AlertProps) {
  const { t } = useLocale();
  const defaultRole = variant === 'error' ? 'alert' : 'status';
  const { role = defaultRole, ...divProps } = rest;

  const defaultIcon =
    variant === 'gold' ? (
      <PixelSprite name="coin" size={20} />
    ) : (
      <PixelIcon
        name={
          variant === 'success'
            ? 'check'
            : variant === 'warning' || variant === 'error'
              ? 'alert'
              : 'info'
        }
        size={18}
      />
    );

  return (
    <div
      className={cx('pv-alert', `pv-alert--${variant}`, className)}
      role={role}
      {...divProps}
    >
      <span className="pv-alert__icon" aria-hidden="true">
        {icon ?? defaultIcon}
      </span>
      <div className="pv-alert__content">
        {title ? <p className="pv-alert__title">{title}</p> : null}
        {children ? <div className="pv-alert__body">{children}</div> : null}
      </div>
      {action ? <div className="pv-alert__action">{action}</div> : null}
      {dismissible && onDismiss ? (
        <IconButton
          label={dismissLabel ?? t('dismissMessage')}
          variant="ghost"
          size="sm"
          className="pv-alert__close"
          onClick={onDismiss}
        >
          <PixelIcon name="close" size={14} />
        </IconButton>
      ) : null}
    </div>
  );
}
