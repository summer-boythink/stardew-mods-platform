import { Link } from 'react-router-dom';
import { modPreviewUrl } from '../api/client';
import { formatBytes, formatDate, type ModRecord } from '../types';

export function ModCard({ mod }: { mod: ModRecord }): JSX.Element {
  const cover = mod.previewImages[0] ? modPreviewUrl(mod.id, mod.previewImages[0]) : null;
  return (
    <Link to={`/mods/${mod.id}`} className="mod-card">
      <div className="mod-cover">
        {cover ? (
          <img src={cover} alt={mod.title} loading="lazy" />
        ) : (
          <div className="mod-cover-fallback" aria-hidden>
            {mod.category === '合集包' ? '📦' : mod.category === '美化贴图' ? '🎨' : mod.category === '汉化' ? '🌐' : '🌟'}
          </div>
        )}
        <span className="mod-cat">{mod.category}</span>
      </div>
      <div className="mod-body">
        <h3 className="mod-title">{mod.title}</h3>
        <p className="mod-desc">{mod.description || '暂无介绍'}</p>
        <div className="mod-tags">
          {mod.tags.slice(0, 4).map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
          {mod.subMods.length > 1 && <span className="tag tag-pack">📦 {mod.subMods.length}合1</span>}
        </div>
        <div className="mod-meta">
          <span>👩‍🌾 {mod.teamName ?? mod.ownerName}</span>
          <span>⬇ {mod.downloadCount}</span>
          <span>{formatBytes(mod.fileSize)}</span>
        </div>
        <div className="mod-time">{formatDate(mod.createdAt)}</div>
      </div>
    </Link>
  );
}
