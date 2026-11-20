import {
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { PixelIcon } from './PixelIcon';

export interface AccordionItem {
  value: string;
  title: ReactNode;
  content: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  items: readonly AccordionItem[];
  /** Controlled list of open item values. */
  value?: readonly string[];
  /** Initially open item values. */
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  /** Allow more than one section to stay open. Defaults to false. */
  multiple?: boolean;
  /** Semantic heading level for the item triggers. Defaults to 4. */
  headingLevel?: 3 | 4 | 5 | 6;
}

/**
 * Single- or multi-open disclosure list. Headers are real buttons that support
 * arrow-key navigation; collapsed panels are inert, aria-hidden, and visibility
 * hidden so focus can never enter content that is not on screen.
 */
export function Accordion({
  items,
  value,
  defaultValue,
  onValueChange,
  multiple = false,
  headingLevel = 4,
  className,
  ...rest
}: AccordionProps) {
  const generatedId = useId();
  const [openValues, setOpenValues] = useControllableState<string[]>({
    value: value ? [...value] : undefined,
    defaultValue: defaultValue ? [...defaultValue] : [],
    onChange: onValueChange,
  });
  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const Heading = `h${headingLevel}` as 'h3' | 'h4' | 'h5' | 'h6';
  const openSet = new Set(openValues);

  const toggle = (itemValue: string) => {
    setOpenValues((current) => {
      const isOpen = current.includes(itemValue);
      if (isOpen) return current.filter((entry) => entry !== itemValue);
      return multiple ? [...current, itemValue] : [itemValue];
    });
  };

  const moveFocus = (from: number, direction: 1 | -1) => {
    if (items.length === 0) return;
    let index = from;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index]?.disabled) {
        headerRefs.current[index]?.focus();
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case 'Home': {
        event.preventDefault();
        const first = items.findIndex((item) => !item.disabled);
        if (first >= 0) headerRefs.current[first]?.focus();
        break;
      }
      case 'End': {
        event.preventDefault();
        for (let candidate = items.length - 1; candidate >= 0; candidate -= 1) {
          if (!items[candidate]?.disabled) {
            headerRefs.current[candidate]?.focus();
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className={cx('pv-accordion', className)} {...rest}>
      {items.map((item, index) => {
        const isOpen = openSet.has(item.value);
        const triggerId = `pv-accordion-${generatedId}-${index}-trigger`;
        const panelId = `pv-accordion-${generatedId}-${index}-panel`;

        return (
          <div
            key={item.value}
            className="pv-accordion__item"
            data-open={isOpen}
            data-disabled={item.disabled || undefined}
          >
            <Heading className="pv-accordion__heading">
              <button
                ref={(node) => {
                  headerRefs.current[index] = node;
                }}
                id={triggerId}
                type="button"
                className="pv-accordion__trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                disabled={item.disabled}
                onClick={() => toggle(item.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {item.icon ? (
                  <span className="pv-accordion__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="pv-accordion__title">{item.title}</span>
                {item.badge ? (
                  <span className="pv-accordion__badge">{item.badge}</span>
                ) : null}
                <span className="pv-accordion__chevron" aria-hidden="true">
                  <PixelIcon name="chevron-down" size={16} />
                </span>
              </button>
            </Heading>
            <div
              id={panelId}
              className="pv-accordion__panel"
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={!isOpen || undefined}
              ref={(node) => {
                if (!node) return;
                if (isOpen) node.removeAttribute('inert');
                else node.setAttribute('inert', '');
              }}
            >
              <div className="pv-accordion__panel-inner">
                <div className="pv-accordion__content">{item.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
