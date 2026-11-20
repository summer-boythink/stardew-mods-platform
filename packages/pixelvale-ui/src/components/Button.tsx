import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useSound } from './PixelValeProvider';

export type ButtonVariant = 'default' | 'primary' | 'gold' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'default',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    onClick,
    type = 'button',
    ...rest
  },
  ref,
) {
  const { play } = useSound();
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'pv-btn',
        `pv-btn--${variant}`,
        `pv-btn--${size}`,
        fullWidth && 'pv-btn--full',
        loading && 'pv-btn--loading',
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (isDisabled) {
          event.preventDefault();
          return;
        }
        play('click');
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? (
        <span className="pv-btn__spinner" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : (
        leftIcon && (
          <span className="pv-btn__icon" aria-hidden="true">
            {leftIcon}
          </span>
        )
      )}
      <span className="pv-btn__label">{children}</span>
      {!loading && rightIcon ? (
        <span className="pv-btn__icon pv-btn__icon--right" aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
});

export type IconButtonVariant = 'default' | 'wood' | 'ghost' | 'danger';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  /** Required accessible name for the icon-only button. */
  label: string;
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      children,
      variant = 'default',
      size = 'md',
      className,
      onClick,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const { play } = useSound();

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cx(
          'pv-icon-btn',
          `pv-icon-btn--${variant}`,
          `pv-icon-btn--${size}`,
          className,
        )}
        onClick={(event) => {
          play('click');
          onClick?.(event);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
