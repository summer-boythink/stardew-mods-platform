import { useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableSort {
  columnId: string;
  direction: DataTableSortDirection;
}

export type DataTableCellAlign = 'start' | 'center' | 'end';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Enables sorting and supplies the comparable value. */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: DataTableCellAlign;
  width?: string | number;
}

export interface DataTableProps<T> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, index: number) => string;
  caption?: ReactNode;
  /** Accessible name for the scrollable table region. */
  label?: string;
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  emptyMessage?: ReactNode;
  striped?: boolean;
  size?: 'sm' | 'md';
  stickyHeader?: boolean;
}

function columnWidth(width?: string | number): string | undefined {
  if (width === undefined) return undefined;
  return typeof width === 'number' ? `${width}px` : width;
}

/**
 * Semantic, sortable table with a focusable scroll region. Sorting is
 * controlled or uncontrolled, null values sink to the bottom, and ties retain
 * their original row order.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  label,
  sort,
  defaultSort = null,
  onSortChange,
  emptyMessage,
  striped = true,
  size = 'md',
  stickyHeader = false,
  className,
  ...rest
}: DataTableProps<T>) {
  const { locale, t } = useLocale();
  const [currentSort, setCurrentSort] = useControllableState<DataTableSort | null>({
    value: sort,
    defaultValue: defaultSort,
    onChange: onSortChange,
  });

  const collator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    [locale],
  );

  const activeSort = currentSort
    ? columns.some(
        (column) =>
          column.id === currentSort.columnId &&
          column.sortable !== false &&
          Boolean(column.sortValue),
      )
      ? currentSort
      : null
    : null;

  const sortedRows = useMemo(() => {
    const indexedRows = rows.map((row, index) => ({ row, index }));
    if (!activeSort) return indexedRows;
    const column = columns.find((candidate) => candidate.id === activeSort.columnId);
    if (!column?.sortValue) return indexedRows;

    return indexedRows.sort((left, right) => {
      const leftValue = column.sortValue?.(left.row);
      const rightValue = column.sortValue?.(right.row);
      if (leftValue === null || leftValue === undefined) {
        if (rightValue === null || rightValue === undefined) {
          return left.index - right.index;
        }
        return 1;
      }
      if (rightValue === null || rightValue === undefined) return -1;

      const result =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : collator.compare(String(leftValue), String(rightValue));
      return result === 0
        ? left.index - right.index
        : activeSort.direction === 'asc'
          ? result
          : -result;
    });
  }, [activeSort, collator, columns, rows]);

  const toggleSort = (column: DataTableColumn<T>) => {
    if (column.sortable === false || !column.sortValue) return;
    const next: DataTableSort =
      activeSort?.columnId === column.id
        ? {
            columnId: column.id,
            direction: activeSort.direction === 'asc' ? 'desc' : 'asc',
          }
        : { columnId: column.id, direction: 'asc' };
    setCurrentSort(next);
  };

  const regionLabel = label ?? t('table');

  return (
    <div
      className={cx(
        'pv-data-table',
        `pv-data-table--${size}`,
        striped && 'pv-data-table--striped',
        stickyHeader && 'pv-data-table--sticky',
        className,
      )}
      {...rest}
    >
      <div
        className="pv-data-table__scroll"
        role="region"
        aria-label={regionLabel}
        tabIndex={0}
      >
        <table className="pv-data-table__table">
          {caption ? (
            <caption className="pv-data-table__caption">{caption}</caption>
          ) : (
            <caption className="pv-sr-only">{regionLabel}</caption>
          )}
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = column.sortable !== false && Boolean(column.sortValue);
                const isActive = activeSort?.columnId === column.id;
                const ariaSort = sortable
                  ? isActive
                    ? activeSort?.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort}
                    data-align={column.align ?? 'start'}
                    style={
                      {
                        width: columnWidth(column.width),
                      } as CSSProperties
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="pv-data-table__sort"
                        data-active={isActive ? 'true' : undefined}
                        onClick={() => toggleSort(column)}
                      >
                        <span>{column.header}</span>
                        <span className="pv-data-table__sort-icon" aria-hidden="true">
                          <PixelIcon
                            name={
                              isActive && activeSort?.direction === 'asc'
                                ? 'chevron-up'
                                : 'chevron-down'
                            }
                            size={12}
                          />
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td className="pv-data-table__empty" colSpan={columns.length}>
                  {emptyMessage ?? t('noData')}
                </td>
              </tr>
            ) : (
              sortedRows.map(({ row, index: originalIndex }, displayIndex) => (
                <tr key={getRowKey(row, originalIndex)}>
                  {columns.map((column) => (
                    <td key={column.id} data-align={column.align ?? 'start'}>
                      {column.cell(row, displayIndex)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
