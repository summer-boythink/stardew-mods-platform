import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiListPublicMods } from '../api/client';
import { ModCard } from '../components/ModCard';
import { IButton, ICard } from '../components/island';
import { MOD_CATEGORIES, type ModRecord } from '../types';

type SortKey = 'newest' | 'popular' | 'biggest';

export function HomePage(): JSX.Element {
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ModRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pageSize = 12;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiListPublicMods({ q, category: category || undefined, sort, page, pageSize })
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
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
  }, [q, category, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page">
      <ICard>
        <div className="hero">
          <div>
            <h1 className="hero-title"><span className="sakura-mark">❀</span> 星露谷 Mod 花帖 <span className="sakura-mark">❀</span></h1>
            <p className="hero-sub">
              把心爱的 Mod 像干花一样夹进帖子里吧——<br />
              上传包含多个 Mod 的文件夹、压缩包或单个 Mod，平台自动解析 manifest、分类整理；
              个人小抽屉、团队共享手帖、完全公开的花展，电脑手机都能逛。
            </p>
            <div className="hero-actions">
              <Link to="/upload">
                <IButton islandType="primary">＋ 上传我的 Mod</IButton>
              </Link>
              <Link to="/teams">
                <IButton>👥 创建团队空间</IButton>
              </Link>
            </div>
          </div>
          <div className="hero-steps" aria-label="使用流程">
            <div>🌸 一、注册登录</div>
            <div>🌸 二、选空间上传</div>
            <div>🌸 三、自动整理分享</div>
          </div>
        </div>
      </ICard>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(qInput.trim());
        }}
      >
        <input
          className="input"
          placeholder="搜索 Mod 名 / 作者 / UniqueID / 标签…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          enterKeyHint="search"
        />
        <IButton islandType="primary">搜索</IButton>
      </form>

      <div className="filter-row">
        <div className="chip-row" role="tablist" aria-label="分类筛选">
          <button className={`chip${category === '' ? ' active' : ''}`} onClick={() => { setCategory(''); setPage(1); }}>
            全部
          </button>
          {MOD_CATEGORIES.map((c) => (
            <button key={c} className={`chip${category === c ? ' active' : ''}`} onClick={() => { setCategory(c); setPage(1); }}>
              {c}
            </button>
          ))}
        </div>
        <select className="input select" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }} aria-label="排序">
          <option value="newest">最新发布</option>
          <option value="popular">下载最多</option>
          <option value="biggest">体积最大</option>
        </select>
      </div>

      {loading && <div className="state-hint">正在加载 Mod 广场…</div>}
      {error && <div className="state-error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="state-hint">还没有公开 Mod，来做第一个分享的人吧 🌱（<Link to="/upload">去上传</Link>）</div>
      )}

      <div className="mod-grid">
        {items.map((m) => (
          <ModCard key={m.id} mod={m} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <IButton disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </IButton>
          <span>
            {page} / {totalPages}（共 {total} 个）
          </span>
          <IButton disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            下一页
          </IButton>
        </div>
      )}
    </div>
  );
}
