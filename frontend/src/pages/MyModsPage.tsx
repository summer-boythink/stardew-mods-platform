import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDeleteMod, apiMyMods, apiQuota, apiUpdateMod } from '../api/client';
import { DownloadButton } from '../components/DownloadButton';
import { QuotaBar } from '../components/QuotaBar';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate, type ModRecord, type QuotaInfo } from '../types';

export function MyModsPage(): JSX.Element {
  const { user } = useAuth();
  const [items, setItems] = useState<ModRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [r, quotaInfo] = await Promise.all([apiMyMods({ q: q.trim() || undefined }), apiQuota()]);
      setItems(r.items);
      setTotal(r.total);
      setQuota(quotaInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="page">
        <ICard>
          <p>
            请先 <Link to="/auth">登录 / 注册</Link>。
          </p>
        </ICard>
      </div>
    );
  }

  const togglePublic = async (m: ModRecord): Promise<void> => {
    const next = m.visibility === 'public' ? (m.teamId ? 'team' : 'private') : 'public';
    if (!window.confirm(next === 'public' ? '确定公开该 Mod？公开后所有人可见可下载。' : '确定取消公开？')) return;
    try {
      await apiUpdateMod(m.id, { visibility: next });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const remove = async (m: ModRecord): Promise<void> => {
    if (!window.confirm(`确定删除「${m.title}」？文件与记录都会被删除，不可恢复。`)) return;
    try {
      await apiDeleteMod(m.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">🏠 我的空间</h2>
      {quota && <QuotaBar quota={quota} />}
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input className="input" placeholder="搜索我的 Mod…" value={q} onChange={(e) => setQ(e.target.value)} />
        <IButton islandType="primary" htmlType="submit">搜索</IButton>
        <Link to="/upload" className="btn">
          ＋ 去上传
        </Link>
      </form>
      {loading && <div className="state-hint">加载中…</div>}
      {error && <div className="state-error">{error}</div>}
      {!loading && !error && items.length === 0 && <div className="state-hint">还没有上传过 Mod 🌱</div>}
      <div className="mine-list">
        {items.map((m) => (
          <ICard key={m.id}>
            <div className="mine-row">
              <div className="mine-info">
                <Link to={`/mods/${m.id}`} className="mine-title">
                  {m.title}
                </Link>
                <div className="muted">
                  {m.category} · {m.subMods.length} 个子 Mod · {formatBytes(m.fileSize)} · ⬇ {m.downloadCount} ·{' '}
                  {m.visibility === 'public' ? '🌍 公开' : m.visibility === 'team' ? `👥 团队（${m.teamName ?? ''}）` : '🔒 私有'} ·{' '}
                  {formatDate(m.createdAt)}
                </div>
                <div className="mod-tags">
                  {m.tags.slice(0, 6).map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mine-actions">
                <DownloadButton mod={m} className="btn" label="⬇ 下载" />
                <IButton onClick={() => void togglePublic(m)}>{m.visibility === 'public' ? '取消公开' : '公开'}</IButton>
                <IButton islandType="ghost" onClick={() => void remove(m)}>
                  删除
                </IButton>
              </div>
            </div>
          </ICard>
        ))}
      </div>
      <p className="muted">共 {total} 个 Mod</p>
    </div>
  );
}
