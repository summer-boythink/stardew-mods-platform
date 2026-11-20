import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Panel,
  PixelIcon,
  PixelSprite,
  Skeleton,
  TextField,
  useToast,
} from '@pixelvale/ui';
import { Link } from 'react-router-dom';
import { apiDeleteMod, apiMyMods, apiQuota, apiUpdateMod } from '../api/client';
import { AuthedImage } from '../components/AuthedImage';
import { AppPagination } from '../components/AppPagination';
import { useConfirm } from '../components/Feedback';
import { DownloadButton } from '../components/DownloadButton';
import {
  CategoryBadge,
  ModFallbackArt,
  ModMeta,
  SourceBadge,
  VisibilityBadge,
} from '../components/ModBits';
import { PageHeading } from '../components/PageHeading';
import { QuotaBar } from '../components/QuotaBar';
import { useAuth } from '../context/AuthContext';
import { formatDate, type ModRecord, type QuotaInfo } from '../types';

const PAGE_SIZE = 12;

export function MyModsPage(): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<ModRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loadKey, setLoadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const reload = (): void => setLoadKey((value) => value + 1);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      apiMyMods({ q: q || undefined, page, pageSize: PAGE_SIZE }),
      // A quota failure must not hide the mod list; it is a secondary widget.
      apiQuota().catch(() => null),
    ])
      .then(([result, quotaInfo]) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        if (quotaInfo) setQuota(quotaInfo);
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
  }, [user, q, page, loadKey]);

  if (!user) {
    return (
      <div className="page-stack">
        <PageHeading eyebrow="我的谷仓" title="我的空间" description="登录后查看你上传的所有 Mod。" />
        <Panel>
          <div className="upload-login-empty">
            <PixelSprite name="parsnip" size={56} />
            <h2>先登录，才能打开你的谷仓</h2>
            <p>登录后可以查看配额、公开或取消公开 Mod，也可以继续上传新的内容。</p>
            <Link to="/auth" className="pv-btn pv-btn--primary pv-btn--lg">
              去登录 / 注册
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const togglePublic = async (mod: ModRecord): Promise<void> => {
    const next = mod.visibility === 'public' ? (mod.teamId ? 'team' : 'private') : 'public';
    const makingPublic = next === 'public';
    const ok = await confirm({
      title: makingPublic ? '公开这份 Mod？' : '取消公开？',
      description: makingPublic
        ? `「${mod.title}」会出现在 Mod 广场，任何人都能查看和下载。`
        : `「${mod.title}」会从广场隐藏，${next === 'team' ? '仅团队成员可见' : '仅自己可见'}。`,
      confirmLabel: makingPublic ? '公开到广场' : '取消公开',
      destructive: !makingPublic,
    });
    if (!ok) return;
    try {
      await apiUpdateMod(mod.id, { visibility: next });
      toast({
        variant: 'success',
        title: makingPublic ? '已公开到广场' : '已取消公开',
        description: mod.title,
      });
      reload();
    } catch (e) {
      toast({
        variant: 'error',
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    }
  };

  const remove = async (mod: ModRecord): Promise<void> => {
    const ok = await confirm({
      title: '删除这份 Mod？',
      description: (
        <div className="confirm-copy">
          <p>
            「<strong>{mod.title}</strong>」的文件与记录都会被删除，不可恢复。
          </p>
          <p>如果只是想隐藏，可以改用「取消公开」。</p>
        </div>
      ),
      confirmLabel: '确认删除',
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiDeleteMod(mod.id);
      toast({ variant: 'success', title: '已删除', description: mod.title });
      if (items.length === 1 && page > 1) setPage((value) => value - 1);
      else reload();
    } catch (e) {
      toast({
        variant: 'error',
        title: '删除失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    }
  };

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="我的谷仓"
        title="我的空间"
        description="个人空间默认私有，也可以把喜欢的作品公开到广场。"
        actions={
          <Link to="/upload" className="pv-btn pv-btn--primary">
            <PixelIcon name="upload" size={16} />
            <span className="pv-btn__label">去上传</span>
          </Link>
        }
      />

      {quota ? (
        <Panel
          title="谷仓容量"
          subtitle="公开 Mod 仍计入上传者所在空间的配额"
          icon={<PixelIcon name="leaf" size={18} />}
          headingLevel={2}
          className="quota-panel"
        >
          <QuotaBar quota={quota} />
        </Panel>
      ) : null}

      <Panel
        id="my-mods-list"
        title="我上传的 Mod"
        subtitle={q ? `搜索「${q}」` : '按上传时间倒序排列'}
        icon={<PixelIcon name="file" size={18} />}
        headingLevel={2}
        actions={<Badge variant="gold">共 {total} 份</Badge>}
      >
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQ(queryInput.trim());
          }}
        >
          <TextField
            className="search-row__field"
            leadingIcon={<PixelIcon name="search" size={16} />}
            placeholder="搜索我的 Mod…"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            aria-label="搜索我的 Mod"
          />
          <Button type="submit" variant="primary">
            搜索
          </Button>
          {q ? (
            <Button
              variant="ghost"
              onClick={() => {
                setQueryInput('');
                setQ('');
                setPage(1);
              }}
            >
              清除
            </Button>
          ) : null}
        </form>

        {error ? (
          <Alert
            variant="error"
            title="加载失败"
            action={
              <Button size="sm" onClick={reload}>
                重试
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        {loading ? (
          <div className="mine-list" aria-busy="true" aria-label="正在加载我的 Mod">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="mod-row mod-row--skeleton" key={index}>
                <Skeleton variant="block" width={132} height={96} />
                <div className="mod-row__body">
                  <Skeleton lines={2} />
                  <Skeleton lines={2} width="65%" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title={q ? '没有找到匹配的 Mod' : '谷仓还是空的'}
            description={
              q ? '换个关键词试试，或清除搜索查看全部。' : '上传第一份 Mod，平台会自动整理好。'
            }
            illustration={<PixelSprite name="watering-can" size={40} />}
            action={
              q ? (
                <Button
                  onClick={() => {
                    setQueryInput('');
                    setQ('');
                    setPage(1);
                  }}
                >
                  清除搜索
                </Button>
              ) : (
                <Link to="/upload" className="pv-btn pv-btn--primary">
                  去上传
                </Link>
              )
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="mine-list">
            {items.map((mod) => (
              <div className="mod-row" key={mod.id}>
                <Link
                  to={`/mods/${mod.id}`}
                  className="mod-row__cover"
                  aria-label={`查看 ${mod.title}`}
                >
                  {mod.previewImages[0] ? (
                    <AuthedImage
                      mod={mod}
                      file={mod.previewImages[0]}
                      alt={`${mod.title} 预览图`}
                      fallback={<ModFallbackArt category={mod.category} compact />}
                    />
                  ) : (
                    <ModFallbackArt category={mod.category} compact />
                  )}
                </Link>

                <div className="mod-row__body">
                  <div className="mod-row__heading">
                    <Link to={`/mods/${mod.id}`} className="mod-row__title">
                      {mod.title}
                    </Link>
                    <div className="mod-row__badges">
                      <CategoryBadge category={mod.category} />
                      <VisibilityBadge visibility={mod.visibility} teamName={mod.teamName} />
                      {mod.subMods.length > 1 ? (
                        <Badge variant="gold">合集 ×{mod.subMods.length}</Badge>
                      ) : null}
                      <SourceBadge source={mod.source} />
                    </div>
                  </div>

                  <p className="mod-row__desc">
                    {mod.description || '暂无介绍'}
                  </p>

                  <ModMeta mod={mod} />

                  {mod.tags.length > 0 ? (
                    <div className="mod-row__tags">
                      {mod.tags.slice(0, 6).map((tag) => (
                        <Badge key={tag}>#{tag}</Badge>
                      ))}
                    </div>
                  ) : null}

                  <p className="mod-row__dates">
                    上传于 {formatDate(mod.createdAt)}
                    {mod.updatedAt !== mod.createdAt ? ` · 更新于 ${formatDate(mod.updatedAt)}` : ''}
                  </p>
                </div>

                <div className="mod-row__actions">
                  <DownloadButton
                    mod={mod}
                    size="sm"
                    onError={(message) =>
                      toast({ variant: 'error', title: '下载失败', description: message })
                    }
                  />
                  <Button size="sm" variant={mod.visibility === 'public' ? 'default' : 'gold'} onClick={() => void togglePublic(mod)}>
                    {mod.visibility === 'public' ? '取消公开' : '公开'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(mod)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error ? (
          <AppPagination
            page={page}
            pageCount={totalPages}
            total={total}
            onPageChange={setPage}
            label="我的 Mod 分页"
            scrollTargetId="my-mods-list"
          />
        ) : null}
      </Panel>
    </div>
  );
}
