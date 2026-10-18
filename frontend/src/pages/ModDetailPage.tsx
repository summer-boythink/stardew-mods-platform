import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDeleteMod, apiGetMod, apiUpdateMod, modPreviewUrl } from '../api/client';
import { AuthedImage } from '../components/AuthedImage';
import { DownloadButton } from '../components/DownloadButton';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';
import { MOD_CATEGORIES, formatBytes, formatDate, type FileTreeNode, type ModRecord } from '../types';

function Tree({ nodes, depth = 0 }: { nodes: FileTreeNode[]; depth?: number }): JSX.Element {
  if (depth > 6) return <></>;
  return (
    <ul className="tree">
      {nodes.slice(0, 200).map((n) => (
        <li key={n.path}>
          <span>
            {n.isDir ? '📁' : '📄'} {n.name}
            {!n.isDir && <em className="muted"> ({formatBytes(n.size)})</em>}
          </span>
          {n.children && n.children.length > 0 && <Tree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
      {nodes.length > 200 && <li className="muted">……仅展示前 200 项</li>}
    </ul>
  );
}

export function ModDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mod, setMod] = useState<ModRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGetMod(id)
      .then((m) => {
        if (cancelled) return;
        setMod(m);
        setTitle(m.title);
        setDescription(m.description);
        setCategory(m.category);
        setTags(m.tags.join(', '));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="page"><div className="state-hint">加载中…</div></div>;
  if (error) {
    return (
      <div className="page">
        <div className="state-error">{error}</div>
        <Link to="/">← 返回广场</Link>
      </div>
    );
  }
  if (!mod) return <div className="page"><div className="state-hint">Mod 不存在</div></div>;

  // 上传者可编辑；团队创建者的编辑入口简化归到后端二次校验（403 时前端提示）
  const showEdit = !!user && user.id === mod.ownerId;

  const save = async (): Promise<void> => {
    if (!mod) return;
    setSaving(true);
    try {
      const updated = await apiUpdateMod(mod.id, {
        title: title.trim() || undefined,
        description,
        category: category || undefined,
        tags: tags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean),
      });
      setMod(updated);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!mod) return;
    if (!window.confirm(`确定删除「${mod.title}」吗？不可恢复。`)) return;
    try {
      await apiDeleteMod(mod.id);
      navigate('/mine');
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="page">
      <Link to="/" className="back-link">← 返回广场</Link>
      <ICard>
        <div className="detail-head">
          <div>
            <span className="mod-cat">{mod.category}</span>
            {mod.visibility === 'public' ? <span className="pill">🌍 公开</span> : mod.visibility === 'team' ? <span className="pill">👥 团队</span> : <span className="pill">🔒 私有</span>}
            {mod.subMods.length > 1 && <span className="pill">📦 合集包 ×{mod.subMods.length}</span>}
            <h1 className="detail-title">{mod.title}</h1>
            <div className="muted">
              👩‍🌾 {mod.teamName ?? mod.ownerName} · {formatBytes(mod.fileSize)} · {mod.fileCount} 个文件 · ⬇ {mod.downloadCount} · 更新于 {formatDate(mod.updatedAt)}
            </div>
            <div className="mod-tags">
              {mod.tags.map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </div>
          </div>
          <div className="detail-actions">
            <DownloadButton
              mod={mod}
              label={`⬇ 下载${mod.fileName.toLowerCase().endsWith('.zip') ? ' .zip' : ''}`}
            />
            {showEdit && !editing && <IButton onClick={() => setEditing(true)}>编辑信息</IButton>}
            {showEdit && <IButton islandType="ghost" onClick={() => void remove()}>删除</IButton>}
          </div>
        </div>
        {!editing ? (
          <p className="detail-desc">{mod.description || '暂无介绍'}</p>
        ) : (
          <div className="form-grid">
            <label>标题<input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>分类
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {MOD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </label>
            <label>标签（逗号分隔）<input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
            <label>介绍<textarea className="input textarea" rows={4} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></label>
            <div className="row-gap">
              <IButton islandType="primary" loading={saving} onClick={() => void save()}>保存</IButton>
              <IButton islandType="ghost" onClick={() => { setEditing(false); setTitle(mod.title); setDescription(mod.description); setCategory(mod.category); setTags(mod.tags.join(', ')); }}>取消</IButton>
            </div>
          </div>
        )}
        {mod.previewImages.length > 0 && (
          <div className="preview-row">
            {mod.previewImages.map((p) =>
              // 公开 Mod 可以点开原图；私有/团队 Mod 的直链不带 Token 会 403，故不加外链
              mod.visibility === 'public' ? (
                <a key={p} href={modPreviewUrl(mod.id, p)} target="_blank" rel="noreferrer">
                  <AuthedImage mod={mod} file={p} alt="Mod 预览图" />
                </a>
              ) : (
                <AuthedImage key={p} mod={mod} file={p} alt="Mod 预览图" />
              ),
            )}
          </div>
        )}
      </ICard>

      <ICard>
        <h3>📦 自动整理结果：包含 {mod.subMods.length} 个 Mod</h3>
        <div className="submods">
          {mod.subMods.map((s, i) => (
            <div key={`${s.manifestPath}-${i}`} className="submod">
              <strong>{s.name}</strong> <span className="muted">v{s.version} · {s.author}</span>
              <div className="muted">{s.description || '（无描述）'}</div>
              <div className="muted mono">{s.hasManifest ? s.manifestPath : `（无 manifest，按文件收录：${s.manifestPath}）`} · {s.fileCount} 文件 · {s.category}</div>
              {s.uniqueId && <div className="muted mono">UniqueID: {s.uniqueId}</div>}
            </div>
          ))}
        </div>
      </ICard>

      <ICard>
        <h3>🗂 文件结构</h3>
        {mod.fileTree.length === 0 ? <p className="muted">无文件树信息</p> : <Tree nodes={mod.fileTree} />}
      </ICard>
    </div>
  );
}
