import { useState } from 'react';
import { Badge } from '@pixelvale/ui';
import { Link } from 'react-router-dom';
import { modPreviewUrl } from '../api/client';
import type { ModRecord } from '../types';
import { CategoryBadge, ModFallbackArt, ModMeta } from './ModBits';

export function ModCard({ mod }: { mod: ModRecord }): JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = mod.previewImages[0]
    ? modPreviewUrl(mod.id, mod.previewImages[0])
    : null;

  return (
    <Link to={`/mods/${mod.id}`} className="mod-card">
      <div className="mod-card__cover">
        {cover && !coverFailed ? (
          <img
            src={cover}
            alt={`${mod.title} 预览图`}
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <ModFallbackArt category={mod.category} />
        )}
        <span className="mod-card__category">
          <CategoryBadge category={mod.category} />
        </span>
        {mod.subMods.length > 1 ? (
          <span className="mod-card__pack">
            <Badge variant="gold">合集 ×{mod.subMods.length}</Badge>
          </span>
        ) : null}
      </div>

      <div className="mod-card__body">
        <h3 className="mod-card__title">{mod.title}</h3>
        <p className="mod-card__desc">{mod.description || '这位农夫还没有写下介绍。'}</p>

        {mod.tags.length > 0 ? (
          <div className="mod-card__tags">
            {mod.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="default">
                #{tag}
              </Badge>
            ))}
            {mod.tags.length > 3 ? (
              <span className="mod-card__tag-more">+{mod.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}

        <ModMeta mod={mod} showDate={false} />
      </div>
    </Link>
  );
}
