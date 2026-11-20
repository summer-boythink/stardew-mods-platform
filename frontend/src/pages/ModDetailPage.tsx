import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Panel,
  PixelIcon,
  Select,
  Skeleton,
  TagInput,
  TextField,
  TreeView,
  useToast,
  type TreeNode,
} from '@pixelvale/ui';
import { useNavigate, useParams } from 'react-router-dom';
import { apiDeleteMod, apiGetMod, apiUpdateMod, modPreviewUrl } from '../api/client';
import { AuthedImage } from '../components/AuthedImage';
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
import { TextArea } from '../components/TextArea';
import { useAuth } from '../context/AuthContext';
import {
  MOD_CATEGORIES,
  formatBytes,
  formatDate,
  type FileTreeNode,
  type ModRecord,
} from '../types';

const CATEGORY_OPTIONS = MOD_CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));

function buildTreeNodes(nodes: FileTreeNode[], depth = 0): TreeNode[] {
  const visible: TreeNode[] = nodes.slice(0, 200).map((node): TreeNode => {
    const children =
      node.children && node.children.length > 0
        ? buildTreeNodes(node.children, depth + 1)
        : undefined;
    return {
      id: node.path,
      label: (
        <span className="tree-label">
          <span className="tree-label__name">{node.name}</span>
          {!node.isDir ? (
            <span className="tree-label__size">{formatBytes(node.size)}</span>
          ) : null}
        </span>
      ),
      icon: node.isDir ? (
        <PixelIcon name="leaf" size={13} />
      ) : (
        <PixelIcon name="file" size={13} />
      ),
      children,
    };
  });

  if (nodes.length > 200) {
    visible.push({
      id: `${nodes[0]?.path ?? 'tree'}-more-${depth}`,
      label: `……仅展示前 200 项（还有 ${nodes.length - 200} 项）`,
      disabled: true,
    });
  }
  return visible;
}

export function ModDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [mod, setMod] = useState<ModRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setEditing(false);
    apiGetMod(id)
      .then((record) => {
        if (cancelled) return;
        setMod(record);
        setTitle(record.title);
        setDescription(record.description);
        setCategory(record.category);
        setTags(record.tags);
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

  const treeNodes = useMemo(
    () => (mod ? buildTreeNodes(mod.fileTree) : []),
    [mod],
  );
  const defaultExpanded = useMemo(
    () =>
      treeNodes
        .filter((node) => node.children && node.children.length > 0)
        .slice(0, 2)
        .map((node) => node.id),
    [treeNodes],
  );

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton lines={2} width="45%" />
        <Panel>
          <Skeleton lines={4} />
        </Panel>
        <Panel>
          <Skeleton lines={3} />
        </Panel>
      </div>
    );
  }

  if (error || !mod) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="Mod 详情"
          title="没有找到这份 Mod"
          breadcrumb={[
            { id: 'home', label: '广场', onClick: () => navigate('/') },
            { id: 'current', label: 'Mod 详情' },
          ]}
        />
        <Alert
          variant="error"
          title={error ? '加载失败' : '记录不存在'}
          action={
            <Button onClick={() => navigate('/')}>回到广场</Button>
          }
        >
          {error || '这份 Mod 可能已被删除，或者你没有查看权限。'}
        </Alert>
      </div>
    );
  }

  const showEdit = Boolean(user && user.id === mod.ownerId);

  const resetForm = (): void => {
    setTitle(mod.title);
    setDescription(mod.description);
    setCategory(mod.category);
    setTags(mod.tags);
  };

  const save = async (): Promise<void> => {
    if (!title.trim()) {
      toast({ variant: 'warning', title: '标题不能为空' });
      return;
    }
    setSaving(true);
    try {
      const updated = await apiUpdateMod(mod.id, {
        title: title.trim(),
        description,
        category: category || undefined,
        tags,
      });
      setMod(updated);
      setTitle(updated.title);
      setDescription(updated.description);
      setCategory(updated.category);
      setTags(updated.tags);
      setEditing(false);
      toast({ variant: 'success', title: '信息已保存', description: updated.title });
    } catch (e) {
      toast({
        variant: 'error',
        title: '保存失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    const ok = await confirm({
      title: '删除这份 Mod？',
      description: (
        <div className="confirm-copy">
          <p>
            「<strong>{mod.title}</strong>」的文件与记录都会被删除，不可恢复。
          </p>
        </div>
      ),
      confirmLabel: '确认删除',
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiDeleteMod(mod.id);
      toast({ variant: 'success', title: '已删除', description: mod.title });
      navigate('/mine');
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
        breadcrumb={[
          { id: 'home', label: '广场', onClick: () => navigate('/') },
          { id: 'category', label: mod.category },
          { id: 'current', label: mod.title },
        ]}
        eyebrow={
          <span className="detail-badges">
            <CategoryBadge category={mod.category} />
            <VisibilityBadge visibility={mod.visibility} teamName={mod.teamName} />
            {mod.subMods.length > 1 ? (
              <Badge variant="gold">合集 ×{mod.subMods.length}</Badge>
            ) : null}
            <SourceBadge source={mod.source} />
          </span>
        }
        title={mod.title}
        description={
          <span>
            {mod.teamName ? `${mod.teamName} · ` : ''}
            {mod.ownerName} 上传 · {formatBytes(mod.fileSize)} · {mod.fileCount} 个文件 ·{' '}
            {mod.downloadCount} 次下载 · 更新于 {formatDate(mod.updatedAt)}
          </span>
        }
        actions={
          <>
            <DownloadButton
              mod={mod}
              label={`下载${mod.fileName.toLowerCase().endsWith('.zip') ? ' .zip' : ''}`}
              onError={(message) =>
                toast({ variant: 'error', title: '下载失败', description: message })
              }
            />
            {showEdit && !editing ? (
              <Button variant="gold" onClick={() => setEditing(true)}>
                编辑信息
              </Button>
            ) : null}
            {showEdit && !editing ? (
              <Button variant="danger" onClick={() => void remove()}>
                删除
              </Button>
            ) : null}
          </>
        }
      />

      {!editing ? (
        <Panel
          title="介绍与预览"
          subtitle={mod.description ? '上传者留下的说明' : '上传者没有留下说明'}
          icon={<PixelIcon name="file" size={18} />}
          headingLevel={2}
        >
          <p className="detail-desc">{mod.description || '暂无介绍'}</p>

          {mod.tags.length > 0 ? (
            <div className="detail-tags">
              {mod.tags.map((tag) => (
                <Badge key={tag}>#{tag}</Badge>
              ))}
            </div>
          ) : null}

          {mod.previewImages.length > 0 ? (
            <div className="preview-grid">
              {mod.previewImages.map((file) =>
                mod.visibility === 'public' ? (
                  <a
                    key={file}
                    href={modPreviewUrl(mod.id, file)}
                    target="_blank"
                    rel="noreferrer"
                    className="preview-card"
                    aria-label="在新窗口查看原图"
                  >
                    <AuthedImage
                      mod={mod}
                      file={file}
                      alt={`${mod.title} 预览图`}
                      fallback={<ModFallbackArt category={mod.category} compact />}
                    />
                  </a>
                ) : (
                  <span className="preview-card" key={file}>
                    <AuthedImage
                      mod={mod}
                      file={file}
                      alt={`${mod.title} 预览图`}
                      fallback={<ModFallbackArt category={mod.category} compact />}
                    />
                  </span>
                ),
              )}
            </div>
          ) : (
            <div className="preview-empty">
              <ModFallbackArt category={mod.category} />
              <p>这份 Mod 没有附带预览图。</p>
            </div>
          )}
        </Panel>
      ) : (
        <Panel
          title="编辑 Mod 信息"
          subtitle="修改后立即生效，不会替换 Mod 文件"
          icon={<PixelIcon name="file" size={18} />}
          headingLevel={2}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <TextField
              label="标题"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            <Select
              label="分类"
              options={CATEGORY_OPTIONS}
              value={category}
              onValueChange={setCategory}
            />
            <TagInput
              label="标签"
              value={tags}
              onValueChange={setTags}
              maxTags={12}
              maxLength={18}
              hint="回车或逗号添加，最多 12 个。"
            />
            <TextArea
              label="介绍"
              value={description}
              maxLength={2000}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
              hint={`${description.length} / 2000`}
            />
            <div className="submit-actions">
              <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                保存修改
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  resetForm();
                  setEditing(false);
                }}
              >
                取消
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        title="自动整理结果"
        subtitle={`包含 ${mod.subMods.length} 个 Mod · 来自 manifest.json 与文件内容的自动识别`}
        icon={<PixelIcon name="sparkle" size={18} />}
        headingLevel={2}
      >
        {mod.subMods.length === 0 ? (
          <p className="muted">没有解析到 manifest 信息。</p>
        ) : (
          <div className="submod-list">
            {mod.subMods.map((sub, index) => (
              <div className="submod-card" key={`${sub.manifestPath}-${index}`}>
                <div className="submod-card__head">
                  <strong>{sub.name}</strong>
                  <div className="submod-card__badges">
                    <CategoryBadge category={sub.category} />
                    {sub.hasManifest ? (
                      <Badge variant="success">manifest</Badge>
                    ) : (
                      <Badge variant="warning">按文件收录</Badge>
                    )}
                  </div>
                </div>
                <p className="submod-card__meta">
                  v{sub.version} · {sub.author} · {sub.fileCount} 个文件
                </p>
                <p className="submod-card__desc">{sub.description || '（无描述）'}</p>
                <p className="submod-card__path mono">
                  {sub.hasManifest ? sub.manifestPath : `（无 manifest）${sub.manifestPath}`}
                </p>
                {sub.uniqueId ? (
                  <p className="submod-card__path mono">UniqueID: {sub.uniqueId}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="文件结构"
        subtitle="展开目录查看压缩包里的内容"
        icon={<PixelIcon name="file" size={18} />}
        headingLevel={2}
      >
        {mod.fileTree.length === 0 ? (
          <p className="muted">无文件树信息</p>
        ) : (
          <TreeView
            key={mod.id}
            nodes={treeNodes}
            defaultExpanded={defaultExpanded}
            label={`${mod.title} 的文件结构`}
          />
        )}
      </Panel>

      <div className="detail-back">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← 返回广场
        </Button>
        <ModMeta mod={mod} />
      </div>
    </div>
  );
}
