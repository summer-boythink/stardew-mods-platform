import { Avatar, Badge, PixelIcon, PixelSprite, type BadgeVariant, type PixelSpriteName } from '@pixelvale/ui';
import { formatBytes, formatDateShort, type ModCategory, type ModRecord, type ModVisibility } from '../types';

const CATEGORY_VARIANT: Record<ModCategory, BadgeVariant> = {
  SMAPI框架: 'info',
  'Content Patcher': 'info',
  美化贴图: 'success',
  功能玩法: 'default',
  农场地图: 'warning',
  人物肖像: 'warning',
  汉化: 'info',
  工具辅助: 'default',
  合集包: 'gold',
  其他: 'default',
};

const CATEGORY_SPRITE: Record<ModCategory, PixelSpriteName> = {
  SMAPI框架: 'gem',
  'Content Patcher': 'wood',
  美化贴图: 'strawberry',
  功能玩法: 'parsnip',
  农场地图: 'pumpkin',
  人物肖像: 'apple',
  汉化: 'fish',
  工具辅助: 'watering-can',
  合集包: 'coin',
  其他: 'stone',
};

export function categoryVariant(category: ModCategory): BadgeVariant {
  return CATEGORY_VARIANT[category] ?? 'default';
}

export function categorySprite(category: ModCategory): PixelSpriteName {
  return CATEGORY_SPRITE[category] ?? 'stone';
}

export function CategoryBadge({ category }: { category: ModCategory }): JSX.Element {
  return <Badge variant={categoryVariant(category)}>{category}</Badge>;
}

const VISIBILITY_META: Record<
  ModVisibility,
  { label: string; variant: BadgeVariant }
> = {
  private: { label: '私有', variant: 'default' },
  team: { label: '团队', variant: 'info' },
  public: { label: '公开', variant: 'success' },
};

export function VisibilityBadge({
  visibility,
  teamName,
}: {
  visibility: ModVisibility;
  teamName?: string | null;
}): JSX.Element {
  const meta = VISIBILITY_META[visibility];
  return (
    <Badge variant={meta.variant}>
      {meta.label}
      {visibility === 'team' && teamName ? ` · ${teamName}` : ''}
    </Badge>
  );
}

export function OwnerAvatar({ name }: { name: string }): JSX.Element {
  return <Avatar name={name} size="sm" className="owner-avatar" />;
}

/** Compact metadata row shared by cards, lists and the detail page. */
export function ModMeta({
  mod,
  showDate = true,
}: {
  mod: ModRecord;
  showDate?: boolean;
}): JSX.Element {
  const owner = mod.teamName ?? mod.ownerName;
  return (
    <div className="mod-meta">
      <span className="mod-meta__owner">
        <OwnerAvatar name={owner} />
        <span>{owner}</span>
      </span>
      <span className="mod-meta__item">
        <PixelIcon name="arrow-right" size={13} className="icon-download" />
        {mod.downloadCount}
      </span>
      <span className="mod-meta__item">
        <PixelIcon name="file" size={13} />
        {formatBytes(mod.fileSize)}
      </span>
      {showDate ? (
        <span className="mod-meta__item">
          <PixelIcon name="clock" size={13} />
          {formatDateShort(mod.createdAt)}
        </span>
      ) : null}
    </div>
  );
}

/** The pixel crop used when a mod has no screenshot. */
export function ModFallbackArt({
  category,
  compact = false,
}: {
  category: ModCategory;
  compact?: boolean;
}): JSX.Element {
  return (
    <span className="mod-cover__fallback">
      <PixelSprite name={categorySprite(category)} size={compact ? 38 : 66} />
      <span className="mod-cover__fallback-label">{category}</span>
    </span>
  );
}
