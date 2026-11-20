import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface CarouselItem {
  id: string;
  content: ReactNode;
  /** Optional accessible name for the slide. */
  label?: string;
}

export interface CarouselProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  items: readonly CarouselItem[];
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  label?: string;
  loop?: boolean;
  showArrows?: boolean;
  showDots?: boolean;
  showCounter?: boolean;
}

/**
 * Controlled or uncontrolled slide deck. Inactive slides are inert and
 * aria-hidden, controls are real buttons, and the counter announces changes.
 */
export function Carousel({
  items,
  index,
  defaultIndex = 0,
  onIndexChange,
  label,
  loop = false,
  showArrows = true,
  showDots = true,
  showCounter = true,
  className,
  ...rest
}: CarouselProps) {
  const { t } = useLocale();
  const { play } = useSound();
  const [current, setCurrent] = useControllableState<number>({
    value: index,
    defaultValue: defaultIndex,
    onChange: onIndexChange,
  });

  if (items.length === 0) return null;

  const active = Math.min(items.length - 1, Math.max(0, Math.round(current)));
  const atStart = active === 0;
  const atEnd = active === items.length - 1;

  const goTo = (target: number) => {
    if (items.length < 2) return;
    const next = loop
      ? ((target % items.length) + items.length) % items.length
      : Math.min(items.length - 1, Math.max(0, target));
    if (next === active) return;
    setCurrent(next);
    play('click');
  };

  return (
    <div
      className={cx('pv-carousel', className)}
      role="region"
      aria-roledescription={t('carousel')}
      aria-label={label ?? t('carousel')}
      {...rest}
    >
      <div className="pv-carousel__viewport">
        <div
          className="pv-carousel__track"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {items.map((item, slideIndex) => {
            const isActive = slideIndex === active;
            return (
              <div
                className="pv-carousel__slide"
                key={item.id}
                role="group"
                aria-roledescription={t('slide')}
                aria-label={
                  item.label ??
                  t('slideOf', {
                    index: slideIndex + 1,
                    total: items.length,
                  })
                }
                aria-hidden={isActive ? undefined : true}
                // React 18 typings omit `inert`; the empty string still sets the
                // attribute, which is supported by every current browser.
                {...(!isActive ? { inert: '' } : {})}
              >
                {item.content}
              </div>
            );
          })}
        </div>

        {showArrows && items.length > 1 ? (
          <>
            <button
              type="button"
              className="pv-carousel__arrow pv-carousel__arrow--prev"
              aria-label={t('previousSlide')}
              disabled={!loop && atStart}
              onClick={() => goTo(active - 1)}
            >
              <PixelIcon name="chevron-left" size={18} />
            </button>
            <button
              type="button"
              className="pv-carousel__arrow pv-carousel__arrow--next"
              aria-label={t('nextSlide')}
              disabled={!loop && atEnd}
              onClick={() => goTo(active + 1)}
            >
              <PixelIcon name="chevron-right" size={18} />
            </button>
          </>
        ) : null}
      </div>

      {(showDots && items.length > 1) || showCounter ? (
        <div className="pv-carousel__footer">
          {showDots && items.length > 1 ? (
            <div className="pv-carousel__dots">
              {items.map((item, dotIndex) => (
                <button
                  key={item.id}
                  type="button"
                  className="pv-carousel__dot"
                  aria-label={t('goToSlide', { index: dotIndex + 1 })}
                  aria-current={dotIndex === active ? 'true' : undefined}
                  onClick={() => goTo(dotIndex)}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          {showCounter ? (
            <p className="pv-carousel__counter" aria-live="polite">
              {t('slideOf', { index: active + 1, total: items.length })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
