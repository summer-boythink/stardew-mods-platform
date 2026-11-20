import { Button, Pagination } from '@pixelvale/ui';

export interface AppPaginationProps {
  page: number;
  pageCount: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
  /** Optional element to bring into view after the page changes. */
  scrollTargetId?: string;
}

/**
 * Desktop gets the full numbered Pixelvale pagination. Phones get two large
 * previous/next buttons instead of nine 28px targets, which keeps the control
 * inside a 320px viewport and avoids horizontal overflow on long result sets.
 */
export function AppPagination({
  page,
  pageCount,
  total,
  label,
  onPageChange,
  scrollTargetId,
}: AppPaginationProps): JSX.Element | null {
  if (pageCount <= 1) return null;

  const goToPage = (next: number): void => {
    onPageChange(next);
    if (!scrollTargetId) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => {
      document.getElementById(scrollTargetId)?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <>
      <div className="pager-row pager-row--desktop">
        <span className="pager-row__info">
          第 {page} / {pageCount} 页 · 共 {total} 份
        </span>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={goToPage}
          label={label}
        />
      </div>

      <nav className="mobile-pager" aria-label={label}>
        <Button
          variant="default"
          size="sm"
          disabled={page <= 1}
          onClick={() => goToPage(Math.max(1, page - 1))}
        >
          上一页
        </Button>
        <span className="mobile-pager__info">
          <span className="mobile-pager__page">
            第 <strong>{page}</strong> / {pageCount} 页
          </span>
          <small>共 {total} 份</small>
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goToPage(Math.min(pageCount, page + 1))}
        >
          下一页
        </Button>
      </nav>
    </>
  );
}
