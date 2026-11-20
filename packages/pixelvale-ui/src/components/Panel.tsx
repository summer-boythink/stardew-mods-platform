import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Remove the body padding when the content needs to sit flush with the frame. */
  padded?: boolean;
  /** Decorative corner nails. */
  ornate?: boolean;
  /** Semantic heading level for the panel title. Defaults to 2. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  footer,
  padded = true,
  ornate = false,
  headingLevel = 2,
  className,
  children,
  ...rest
}: PanelProps) {
  const generatedId = useId();
  const titleId = `pv-panel-${generatedId}-title`;
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  return (
    <div
      className={cx('pv-panel', ornate && 'pv-panel--ornate', className)}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title || subtitle || actions || icon ? (
        <div className="pv-panel__header">
          <div className="pv-panel__heading">
            {icon ? <span className="pv-panel__icon">{icon}</span> : null}
            <div className="pv-panel__heading-text">
              {title ? (
                <Heading id={titleId} className="pv-panel__title">
                  {title}
                </Heading>
              ) : null}
              {subtitle ? <p className="pv-panel__subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="pv-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx('pv-panel__body', !padded && 'pv-panel__body--flush')}>
        {children}
      </div>
      {footer ? <div className="pv-panel__footer">{footer}</div> : null}
    </div>
  );
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
}

export function Badge({
  variant = 'default',
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cx('pv-badge', `pv-badge--${variant}`, className)} {...rest}>
      {icon ? (
        <span className="pv-badge__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
}

export function Divider({ label, className, ...rest }: DividerProps) {
  return (
    <div
      className={cx('pv-divider', className)}
      role="separator"
      aria-label={typeof label === 'string' ? label : undefined}
      {...rest}
    >
      <span className="pv-divider__line" aria-hidden="true" />
      {label ? (
        <span className="pv-divider__label">{label}</span>
      ) : (
        <span className="pv-divider__gem" aria-hidden="true" />
      )}
      <span className="pv-divider__line" aria-hidden="true" />
    </div>
  );
}
