import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export type PaginationSize = 'sm' | 'md';
export type PageToken = number | 'ellipsis';

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Controlled current page, starting at 1. */
  page?: number;
  /** Initial page for uncontrolled usage. Defaults to 1. */
  defaultPage?: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  /** Number of pages shown on each side of the current page. Defaults to 1. */
  siblingCount?: number;
  /** Accessible name for the navigation landmark. */
  label?: string;
  size?: PaginationSize;
  disabled?: boolean;
  hideOnSinglePage?: boolean;
}

/**
 * Builds a compact page list: first and last pages, the current page plus its
 * siblings, and a single ellipsis wherever the sequence skips.
 */
export function buildPageTokens(
  page: number,
  pageCount: number,
  siblingCount = 1,
): PageToken[] {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];

  const total = Math.max(1, Math.floor(pageCount));
  const current = Math.min(total, Math.max(1, Math.round(page)));
  const siblings = Math.min(2, Math.max(0, Math.floor(siblingCount)));
  const visible = new Set<number>([1, total, current]);

  for (let step = 1; step <= siblings; step += 1) {
    if (current - step >= 1) visible.add(current - step);
    if (current + step <= total) visible.add(current + step);
  }

  if (current - siblings <= 3) {
    for (let candidate = 2; candidate <= Math.min(total, 3 + siblings); candidate += 1) {
      visible.add(candidate);
    }
  }

  if (current + siblings >= total - 2) {
    for (
      let candidate = Math.max(1, total - (3 + siblings));
      candidate < total;
      candidate += 1
    ) {
      visible.add(candidate);
    }
  }

  const pages = Array.from(visible).sort((left, right) => left - right);
  const tokens: PageToken[] = [];
  let previous = 0;

  for (const candidate of pages) {
    if (previous > 0 && candidate - previous > 1) tokens.push('ellipsis');
    tokens.push(candidate);
    previous = candidate;
  }

  return tokens;
}

/**
 * Accessible page navigation with controlled or uncontrolled state. Page
 * buttons use aria-current, and arrows disable at the first and last page.
 */
export function Pagination({
  page,
  defaultPage = 1,
  pageCount,
  onPageChange,
  siblingCount = 1,
  label,
  size = 'md',
  disabled = false,
  hideOnSinglePage = false,
  className,
  ...rest
}: PaginationProps) {
  const { t } = useLocale();
  const { play } = useSound();
  const safePageCount = Number.isFinite(pageCount)
    ? Math.max(0, Math.floor(pageCount))
    : 0;
  const lastPage = Math.max(1, safePageCount);

  const clampPage = (candidate: number) =>
    Math.min(
      lastPage,
      Math.max(1, Math.round(Number.isFinite(candidate) ? candidate : 1)),
    );

  const [current, setCurrent] = useControllableState<number>({
    value: page === undefined ? undefined : clampPage(page),
    defaultValue: clampPage(defaultPage),
    onChange: onPageChange,
  });

  if (safePageCount < 1 || (hideOnSinglePage && safePageCount === 1)) return null;

  const activePage = clampPage(current);
  const tokens = buildPageTokens(activePage, safePageCount, siblingCount);

  const goTo = (next: number) => {
    if (disabled) return;
    const target = clampPage(next);
    if (target === activePage) return;
    setCurrent(target);
    play('click');
  };

  return (
    <nav
      className={cx('pv-pagination', `pv-pagination--${size}`, className)}
      aria-label={label ?? t('pagination')}
      {...rest}
    >
      <ul className="pv-pagination__list">
        <li>
          <button
            type="button"
            className="pv-pagination__arrow"
            aria-label={t('previousPage')}
            disabled={disabled || activePage <= 1}
            onClick={() => goTo(activePage - 1)}
          >
            <PixelIcon name="chevron-left" size={16} />
          </button>
        </li>

        {tokens.map((token, index) =>
          token === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} className="pv-pagination__gap">
              <span aria-hidden="true">…</span>
            </li>
          ) : (
            <li key={token}>
              <button
                type="button"
                className="pv-pagination__page"
                aria-label={t('pageNumber', { page: token })}
                aria-current={token === activePage ? 'page' : undefined}
                disabled={disabled}
                onClick={() => goTo(token)}
              >
                {token}
              </button>
            </li>
          ),
        )}

        <li>
          <button
            type="button"
            className="pv-pagination__arrow"
            aria-label={t('nextPage')}
            disabled={disabled || activePage >= lastPage}
            onClick={() => goTo(activePage + 1)}
          >
            <PixelIcon name="chevron-right" size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
