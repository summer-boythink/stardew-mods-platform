import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { PixelIcon } from './PixelIcon';
import { useLocale } from './PixelValeProvider';

export interface StepItem {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface StepsProps extends Omit<HTMLAttributes<HTMLOListElement>, 'onChange'> {
  steps: readonly StepItem[];
  /** Value of the current step. Steps before it are marked complete. */
  current: string;
  /** Turning this on makes every step marker an actionable button. */
  onStepClick?: (value: string) => void;
  /** Accessible name for the step list. */
  label?: string;
}

/**
 * Pixel step indicator. It is a plain ordered list by default; providing
 * onStepClick upgrades each enabled marker to a button with aria-current.
 */
export function Steps({
  steps,
  current,
  onStepClick,
  label,
  className,
  'aria-label': ariaLabel,
  ...rest
}: StepsProps) {
  const { t } = useLocale();
  const currentIndex = steps.findIndex((step) => step.value === current);

  return (
    <ol
      className={cx('pv-steps', className)}
      aria-label={label ?? ariaLabel ?? t('progressSteps')}
      {...rest}
    >
      {steps.map((step, index) => {
        const isComplete = currentIndex >= 0 && index < currentIndex;
        const isCurrent = index === currentIndex;
        const state = isCurrent ? 'current' : isComplete ? 'complete' : 'upcoming';

        const body = (
          <>
            <span className="pv-steps__marker" aria-hidden="true">
              {isComplete ? (
                <PixelIcon name="check" size={15} />
              ) : step.icon ? (
                step.icon
              ) : (
                index + 1
              )}
            </span>
            <span className="pv-steps__text">
              <span className="pv-steps__label">{step.label}</span>
              {step.description ? (
                <span className="pv-steps__description">{step.description}</span>
              ) : null}
            </span>
          </>
        );

        return (
          <li
            key={step.value}
            className="pv-steps__item"
            data-state={state}
            data-disabled={step.disabled || undefined}
          >
            {onStepClick ? (
              <button
                type="button"
                className="pv-steps__hit"
                aria-current={isCurrent ? 'step' : undefined}
                disabled={step.disabled}
                onClick={() => onStepClick(step.value)}
              >
                {body}
              </button>
            ) : (
              <div
                className="pv-steps__hit"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
