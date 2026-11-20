import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Pagination,
  Panel,
  PixelIcon,
  PixelSprite,
  Select,
  Skeleton,
  Spinner,
  TextField,
  ToggleGroup,
} from '@pixelvale/ui';
import { Link } from 'react-router-dom';
import { apiListPublicMods } from '../api/client';
import { ModCard } from '../components/ModCard';
import { MOD_CATEGORIES, type ModRecord } from '../types';

type SortKey = 'newest' | 'popular' | 'biggest';

const SORT_OPTIONS = [
  { value: 'newest', label: '最新发布' },
  { value: 'popular', label: '下载最多' },
  { value: 'biggest', label: '体积最大' },
];

const CATEGORY_ITEMS = [
  { value: '', label: '全部' },
  ...MOD_CATEGORIES.map((category) => ({ value: category, label: category })),
];

export function HomePage(): JSX.Element {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<ModRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const resultsRef = useRef<HTMLElement>(null);

  const pageSize = 12;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiListPublicMods({ q, category: category || undefined, sort, page, pageSize })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
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
  }, [q, category, sort, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const changePage = (next: number): void => {
    setPage(next);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const resetFilters = (): void => {
    setQInput('');
    setQ('');
    setCategory('');
    setPage(1);
  };

  const hasFilters = q !== '' || category !== '';

  return (
    <div className="page-stack">
      <Panel ornate padded={false} className="hero-panel">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <PixelIcon name="sparkle" size={14} />
              Stardew Valley · Mod 集市
            </p>
            <h1 className="hero-title">
              星露谷 <span>Mod 花帖</span>
            </h1>
            <p className="hero-lede">
              把心爱的 Mod 像干花一样夹进帖子里。上传包含多个 Mod
              的文件夹、压缩包或单个文件，平台会自动解析 manifest、分类整理，
              再收进你的个人谷仓、团队手帖，或者摆上完全公开的集市。
            </p>
            <div className="hero-actions">
              <Link to="/upload" className="pv-btn pv-btn--primary pv-btn--lg">
                <PixelIcon name="upload" size={18} />
                <span className="pv-btn__label">上传我的 Mod</span>
              </Link>
              <Link to="/teams" className="pv-btn pv-btn--lg">
                <PixelIcon name="heart" size={18} />
                <span className="pv-btn__label">创建团队空间</span>
              </Link>
            </div>
            <ul className="hero-facts" aria-label="平台特点">
              <li>
                <PixelIcon name="check" size={14} /> 自动解析 manifest
              </li>
              <li>
                <PixelIcon name="check" size={14} /> 个人 / 团队 / 公开
              </li>
              <li>
                <PixelIcon name="check" size={14} /> 电脑手机都能逛
              </li>
            </ul>
          </div>

          <div className="hero-scene" aria-hidden="true">
            <div className="hero-plot">
              <div className="hero-plot__sky">
                <span className="hero-plot__sun" />
                <span className="hero-plot__cloud hero-plot__cloud--one" />
                <span className="hero-plot__cloud hero-plot__cloud--two" />
              </div>
              <div className="hero-plot__soil">
                <span className="hero-plot__furrow hero-plot__furrow--one" />
                <span className="hero-plot__furrow hero-plot__furrow--two" />
                <PixelSprite
                  name="pumpkin"
                  size={64}
                  className="hero-plot__crop hero-plot__crop--pumpkin"
                />
                <PixelSprite
                  name="strawberry"
                  size={38}
                  className="hero-plot__crop hero-plot__crop--berry"
                />
                <PixelSprite
                  name="parsnip"
                  size={36}
                  className="hero-plot__crop hero-plot__crop--parsnip"
                />
                <PixelSprite
                  name="watering-can"
                  size={42}
                  className="hero-plot__crop hero-plot__crop--can"
                />
              </div>
            </div>
            <div className="hero-steps">
              <p className="hero-steps__title">第一次赶集？</p>
              <ol>
                <li>
                  <span className="hero-steps__num">1</span>
                  注册并登录
                </li>
                <li>
                  <span className="hero-steps__num">2</span>
                  选择空间上传
                </li>
                <li>
                  <span className="hero-steps__num">3</span>
                  自动整理分享
                </li>
              </ol>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="集市公告板"
        subtitle="搜一搜 Mod 名、作者、UniqueID 或标签"
        icon={<PixelIcon name="leaf" size={18} />}
        actions={<Badge variant="gold">共 {total} 份</Badge>}
        className="board-panel"
      >
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQ(qInput.trim());
          }}
        >
          <TextField
            className="search-row__field"
            leadingIcon={<PixelIcon name="search" size={16} />}
            placeholder="搜索 Mod 名 / 作者 / UniqueID / 标签…"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            enterKeyHint="search"
            aria-label="搜索 Mod"
          />
          <Button type="submit" variant="primary" leftIcon={<PixelIcon name="search" size={16} />}>
            搜索
          </Button>
          <Select
            className="search-row__sort"
            options={SORT_OPTIONS}
            value={sort}
            onValueChange={(value) => {
              setSort(value as SortKey);
              setPage(1);
            }}
            aria-label="排序方式"
          />
        </form>

        <div className="filter-block">
          <span className="filter-block__label">
            <PixelIcon name="leaf" size={14} />
            分类
          </span>
          <ToggleGroup
            items={CATEGORY_ITEMS}
            value={[category]}
            onValueChange={(value) => {
              setCategory(value[0] ?? '');
              setPage(1);
            }}
            label="按分类筛选"
            size="sm"
            className="category-filter"
          />
        </div>

        {hasFilters ? (
          <div className="active-filters">
            <span>正在查看：</span>
            {q ? <Badge variant="info">关键词「{q}」</Badge> : null}
            {category ? <Badge variant="success">{category}</Badge> : null}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              清除筛选
            </Button>
          </div>
        ) : null}
      </Panel>

      <section className="results-section" ref={resultsRef} aria-labelledby="results-title">
        <div className="results-head">
          <h2 id="results-title" className="results-title">
            {loading ? '正在翻找谷仓…' : hasFilters ? '筛选结果' : '最新上架'}
          </h2>
          {loading ? <Spinner size="sm" showLabel label="加载中" /> : null}
          {!loading && !error ? (
            <span className="results-count">
              共 {total} 份 · 第 {page} / {totalPages} 页
            </span>
          ) : null}
        </div>

        {error ? (
          <Alert
            variant="error"
            title="集市暂时没有开门"
            action={
              <Button variant="default" size="sm" onClick={() => setReloadKey((value) => value + 1)}>
                重试
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        {loading ? (
          <div className="mod-grid" aria-busy="true" aria-label="正在加载 Mod">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="mod-card mod-card--skeleton" key={index}>
                <Skeleton variant="block" height={156} />
                <div className="mod-card__body">
                  <Skeleton lines={2} />
                  <Skeleton lines={2} width="80%" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <Panel>
            <EmptyState
              title={hasFilters ? '没有找到符合条件的 Mod' : '广场还空着'}
              description={
                hasFilters
                  ? '换个关键词或分类试试，也可以清除筛选看看全部。'
                  : '来做第一个把 Mod 摆上集市的人吧。'
              }
              illustration={<PixelSprite name="parsnip" size={40} />}
              action={
                hasFilters ? (
                  <Button variant="default" onClick={resetFilters}>
                    清除筛选
                  </Button>
                ) : (
                  <Link to="/upload" className="pv-btn pv-btn--primary pv-btn--md">
                    去上传第一份 Mod
                  </Link>
                )
              }
            />
          </Panel>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="mod-grid">
            {items.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>
        ) : null}

        {!loading && !error && totalPages > 1 ? (
          <div className="pager-row">
            <span className="pager-row__info">
              第 {page} / {totalPages} 页 · 共 {total} 份
            </span>
            <Pagination
              page={page}
              pageCount={totalPages}
              onPageChange={changePage}
              label="Mod 广场分页"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
