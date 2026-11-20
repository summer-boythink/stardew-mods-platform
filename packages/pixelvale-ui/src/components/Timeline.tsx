import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useLocale } from './PixelValeProvider';

export type TimelineTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Human-readable time label, for example "Spring 12". */
  timestamp?: ReactNode;
  /** Optional machine-readable date for the <time> element. */
  dateTime?: string;
  icon?: ReactNode;
  tone?: TimelineTone;
  /** Highlights the current or most recent entry. */
  active?: boolean;
}

export interface TimelineProps extends Omit<
  HTMLAttributes<HTMLOListElement>,
  'children'
> {
  items: readonly TimelineItem[];
  /** Accessible name for the ordered list. */
  label?: string;
}

/**
 * Vertical event trail with pixel markers. Entries stay in an ordered list,
 * timestamps become semantic <time> elements, and the active entry is exposed
 * with aria-current="step".
 */
export function Timeline({ items, label, className, ...rest }: TimelineProps) {
  const { t } = useLocale();

  if (items.length === 0) return null;

  return (
    <ol
      className={cx('pv-timeline', className)}
      aria-label={label ?? t('timeline')}
      {...rest}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="pv-timeline__item"
          data-tone={item.tone ?? 'default'}
          data-active={item.active ? 'true' : undefined}
          aria-current={item.active ? 'step' : undefined}
        >
          <span className="pv-timeline__rail" aria-hidden="true">
            <span className="pv-timeline__marker">
              {item.icon ?? <span className="pv-timeline__dot" />}
            </span>
          </span>

          <div className="pv-timeline__content">
            <div className="pv-timeline__head">
              <p className="pv-timeline__title">{item.title}</p>
              {item.timestamp ? (
                item.dateTime ? (
                  <time className="pv-timeline__time" dateTime={item.dateTime}>
                    {item.timestamp}
                  </time>
                ) : (
                  <span className="pv-timeline__time">{item.timestamp}</span>
                )
              ) : null}
            </div>
            {item.description ? (
              <p className="pv-timeline__description">{item.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
