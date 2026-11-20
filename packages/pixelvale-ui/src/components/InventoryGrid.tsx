import {
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { Badge } from './Panel';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelSprite, type PixelSpriteName } from './PixelSprite';
import { Tooltip } from './Tooltip';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface ItemDefinition {
  id: string;
  name: string;
  sprite: PixelSpriteName;
  description?: string;
  category?: string;
  rarity?: ItemRarity;
  sellPrice?: number;
  edible?: boolean;
}

export interface InventoryEntry {
  item: ItemDefinition;
  quantity: number;
}

const RARITY_KEY = {
  common: 'rarityCommon',
  uncommon: 'rarityUncommon',
  rare: 'rarityRare',
  legendary: 'rarityLegendary',
} as const;

export interface ItemDetailsProps extends HTMLAttributes<HTMLDivElement> {
  item: ItemDefinition;
  quantity?: number;
  compact?: boolean;
}

export function ItemDetails({
  item,
  quantity,
  compact = false,
  className,
  ...rest
}: ItemDetailsProps) {
  const rarity = item.rarity ?? 'common';
  const { t } = useLocale();

  return (
    <div
      className={cx('pv-item-details', compact && 'pv-item-details--compact', className)}
      {...rest}
    >
      <div className="pv-item-details__top">
        <span className="pv-item-details__sprite" data-rarity={rarity}>
          <PixelSprite name={item.sprite} size={compact ? 32 : 52} />
        </span>
        <div className="pv-item-details__headings">
          <p className="pv-item-details__name" data-rarity={rarity}>
            {item.name}
          </p>
          <div className="pv-item-details__tags">
            {item.category ? <Badge variant="default">{item.category}</Badge> : null}
            {rarity !== 'common' ? (
              <Badge variant={rarity === 'legendary' ? 'gold' : 'info'}>
                {t(RARITY_KEY[rarity])}
              </Badge>
            ) : null}
            {item.edible ? <Badge variant="success">{t('edible')}</Badge> : null}
          </div>
        </div>
      </div>
      {item.description ? (
        <p className="pv-item-details__description">{item.description}</p>
      ) : null}
      <div className="pv-item-details__meta">
        {typeof item.sellPrice === 'number' ? (
          <span className="pv-item-details__price">
            <PixelSprite name="coin" size={16} />
            <span>{item.sellPrice}g</span>
            <span className="pv-item-details__price-label">{t('each')}</span>
          </span>
        ) : (
          <span />
        )}
        {typeof quantity === 'number' ? (
          <span className="pv-item-details__quantity">× {quantity}</span>
        ) : null}
      </div>
    </div>
  );
}

export interface InventoryGridProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onSelect'
> {
  items: readonly InventoryEntry[];
  columns?: number;
  rows?: number;
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectedChange?: (id: string) => void;
  /** Show rich item tooltips on hover and focus. Defaults to true. */
  showTooltips?: boolean;
  label?: string;
}

export function InventoryGrid({
  items,
  columns = 6,
  rows = 3,
  selectedId,
  defaultSelectedId,
  onSelectedChange,
  showTooltips = true,
  label,
  className,
  style,
  ...rest
}: InventoryGridProps) {
  const safeColumns = Math.max(1, Math.min(12, Math.floor(columns)));
  const safeRows = Math.max(1, Math.min(12, Math.floor(rows)));
  const slotCount = Math.max(safeColumns * safeRows, items.length);

  const [selected, setSelected] = useControllableState<string | null>({
    value: selectedId,
    defaultValue: defaultSelectedId ?? items[0]?.item.id ?? null,
    onChange: (id) => {
      if (id) onSelectedChange?.(id);
    },
  });

  const { play } = useSound();
  const { t } = useLocale();
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const effectiveSelected = items.some((entry) => entry.item.id === selected)
    ? selected
    : (items[0]?.item.id ?? null);

  const selectSilently = (id: string) => {
    if (id !== selected) setSelected(id);
  };

  const selectLoudly = (id: string) => {
    setSelected(id);
    play('click');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;

    switch (event.key) {
      case 'ArrowRight':
        next = index + 1;
        break;
      case 'ArrowLeft':
        next = index - 1;
        break;
      case 'ArrowDown':
        next = index + safeColumns;
        break;
      case 'ArrowUp':
        next = index - safeColumns;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    if (next < 0 || next >= items.length) return;

    const target = items[next];
    if (!target) return;
    selectLoudly(target.item.id);
    slotRefs.current[next]?.focus();
  };

  const emptySlots = Math.max(0, slotCount - items.length);

  return (
    <div
      role="listbox"
      aria-label={label ?? t('inventory')}
      className={cx('pv-inventory', className)}
      style={
        {
          ...style,
          '--pv-inventory-columns': safeColumns,
        } as CSSProperties
      }
      {...rest}
    >
      {items.map((entry, index) => {
        const id = entry.item.id;
        const isSelected = id === effectiveSelected;
        const rarity = entry.item.rarity ?? 'common';
        const cell = (
          <button
            ref={(node) => {
              slotRefs.current[index] = node;
            }}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-label={t('itemQuantity', {
              name: entry.item.name,
              count: entry.quantity,
            })}
            tabIndex={isSelected ? 0 : -1}
            className="pv-slot"
            data-rarity={rarity}
            onClick={() => selectLoudly(id)}
            onFocus={() => selectSilently(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <PixelSprite name={entry.item.sprite} size={44} className="pv-slot__sprite" />
            {entry.quantity > 1 ? (
              <span className="pv-slot__quantity" aria-hidden="true">
                {entry.quantity > 999 ? '999' : entry.quantity}
              </span>
            ) : null}
          </button>
        );

        return (
          <div key={`${id}-${index}`} className="pv-inventory__cell" role="presentation">
            {showTooltips ? (
              <Tooltip
                content={
                  <ItemDetails item={entry.item} quantity={entry.quantity} compact />
                }
                placement="top"
              >
                {cell}
              </Tooltip>
            ) : (
              cell
            )}
          </div>
        );
      })}
      {Array.from({ length: emptySlots }, (_, index) => (
        <div key={`empty-${index}`} className="pv-slot pv-slot--empty" aria-hidden="true">
          <span className="pv-slot__empty-mark" />
        </div>
      ))}
    </div>
  );
}
