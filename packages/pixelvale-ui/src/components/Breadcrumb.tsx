import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useLocale } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface BreadcrumbItem {
  /** Stable key; the index is used when omitted. */
  id?: string;
  label: ReactNode;
  href?: string;
  /** Renders a button instead of an anchor when no href is given. */
  onClick?: () => void;
  /** Marks the current page. Defaults to the final item. */
  current?: boolean;
  icon?: ReactNode;
}

export interface BreadcrumbProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  items: readonly BreadcrumbItem[];
  /** Accessible name for the navigation landmark. */
  label?: string;
  separator?: ReactNode;
}

/**
 * Semantic breadcrumb trail. The last item is the current page by default,
 * separators are decorative, and intermediate items can be links or buttons.
 */
export function Breadcrumb({
  items,
  label,
  separator,
  className,
  ...rest
}: BreadcrumbProps) {
  const { t } = useLocale();

  if (items.length === 0) return null;

  return (
    <nav
      className={cx('pv-breadcrumb', className)}
      aria-label={label ?? t('breadcrumb')}
      {...rest}
    >
      <ol className="pv-breadcrumb__list">
        {items.map((item, index) => {
          const isCurrent = item.current ?? index === items.length - 1;
          const content = (
            <>
              {item.icon ? (
                <span className="pv-breadcrumb__icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className="pv-breadcrumb__label">{item.label}</span>
            </>
          );

          return (
            <li className="pv-breadcrumb__item" key={item.id ?? index}>
              {index > 0 ? (
                <span className="pv-breadcrumb__separator" aria-hidden="true">
                  {separator ?? <PixelIcon name="chevron-right" size={12} />}
                </span>
              ) : null}
              {isCurrent ? (
                <span className="pv-breadcrumb__current" aria-current="page">
                  {content}
                </span>
              ) : item.href ? (
                <a className="pv-breadcrumb__link" href={item.href}>
                  {content}
                </a>
              ) : item.onClick ? (
                <button
                  type="button"
                  className="pv-breadcrumb__link pv-breadcrumb__button"
                  onClick={item.onClick}
                >
                  {content}
                </button>
              ) : (
                <span className="pv-breadcrumb__link pv-breadcrumb__link--static">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
