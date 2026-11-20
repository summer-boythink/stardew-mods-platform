import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Panel,
  PixelIcon,
  PixelSprite,
  ProgressBar,
  Select,
  Spinner,
  Steps,
  Tabs,
  TagInput,
  TextField,
  useToast,
} from '@pixelvale/ui';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiError,
  apiHealth,
  apiImportMod,
  apiImportProviders,
  apiMyTeams,
  apiQuota,
  apiResolveImport,
  apiUploadMod,
  isSplitResult,
  type ImportPreview,
  type ImportProviderStatus,
  type SingleUploadResult,
  type SplitUploadResult,
  type UploadResult,
} from '../api/client';
import { useConfirm } from '../components/Feedback';
import { ImportFromSite } from '../components/ImportFromSite';
import { SourceBadge } from '../components/ModBits';
import { PageHeading } from '../components/PageHeading';
import { TextArea } from '../components/TextArea';
import { UploadDropzone, type PickedFiles } from '../components/UploadDropzone';
import { useAuth } from '../context/AuthContext';
import {
  MOD_CATEGORIES,
  formatBytes,
  type QuotaInfo,
  type TeamRecord,
} from '../types';
import { mergeSplitResults, overwritableItems } from '../utils/mergeSplit';

type Scope = 'personal' | 'team' | 'public';
type Visibility = 'private' | 'team' | 'public';

const SCOPE_OPTIONS = [
  { value: 'personal', label: '个人空间（默认私有）' },
  { value: 'team', label: '团队空间（成员共享）' },
  { value: 'public', label: '完全公开（广场展示）' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: '自动推断' },
  ...MOD_CATEGORIES.map((category) => ({ value: category, label: category })),
];

const STEPS = [
  { value: 'pick', label: '选择内容', description: '文件 / 压缩包 / 文件夹' },
  { value: 'config', label: '选择空间', description: '个人 / 团队 / 公开' },
  { value: 'upload', label: '上传整理', description: '解析 manifest' },
  { value: 'done', label: '完成', description: '查看或继续上传' },
];

function visibilityOptions(scope: Scope): { value: Visibility; label: string }[] {
  if (scope === 'personal') {
    return [
      { value: 'private', label: '仅自己可见' },
      { value: 'public', label: '公开到广场' },
    ];
  }
  if (scope === 'team') {
    return [
      { value: 'team', label: '团队成员可见' },
      { value: 'public', label: '公开到广场' },
    ];
  }
  return [{ value: 'public', label: '公开到广场' }];
}

function percent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

export function UploadPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [picked, setPicked] = useState<PickedFiles | null>(null);
  const [scope, setScope] = useState<Scope>('personal');
  const [teamId, setTeamId] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [split, setSplit] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<SingleUploadResult | null>(null);
  const [splitResult, setSplitResult] = useState<SplitUploadResult | null>(null);
  const [entryMode, setEntryMode] = useState<'file' | 'import'>('file');
  const [importUrl, setImportUrl] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [providers, setProviders] = useState<ImportProviderStatus[]>([]);
  const [resolving, setResolving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    if (!user) return;
    apiMyTeams().then(setTeams).catch(() => {});
    apiQuota().then(setQuota).catch(() => {});
    apiImportProviders().then(setProviders).catch(() => {});
  }, [user]);

  useEffect(() => {
    // 切换 scope 时给可见性一个合理默认
    if (scope === 'personal') setVisibility((value) => (value === 'team' ? 'private' : value));
    if (scope === 'team') setVisibility((value) => (value === 'private' ? 'team' : value));
    if (scope === 'public') setVisibility('public');
  }, [scope]);

  useEffect(() => {
    // 自动导入只进入私有/团队空间；公开分享必须走手动上传并确认授权。
    if (entryMode !== 'import') return;
    if (scope === 'public') setScope('personal');
    if (visibility === 'public') setVisibility('private');
  }, [entryMode, scope, visibility]);

  const selectedTeamQuota = useMemo(
    () => quota?.teams.find((team) => team.teamId === teamId) ?? null,
    [quota, teamId],
  );

  const busy = uploading || importing;

  if (!user) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="谷仓入库"
          title="上传 Mod"
          description="登录后才能把 Mod 收进个人谷仓或团队手帖。"
        />
        <Panel>
          <div className="upload-login-empty">
            <PixelSprite name="watering-can" size={56} />
            <h2>先领取一张谷仓通行证</h2>
            <p>登录 / 注册后即可上传包含多个 Mod 的文件夹、.zip 压缩包或单个 Mod 文件。</p>
            <Link to="/auth" className="pv-btn pv-btn--primary pv-btn--lg">
              去登录 / 注册
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const refreshQuota = (): void => {
    apiQuota().then(setQuota).catch(() => {});
  };

  const resetResult = (): void => {
    setDone(null);
    setSplitResult(null);
    setError('');
    setProgress(0);
  };

  const handlePick = (next: PickedFiles | null): void => {
    setPicked(next);
    resetResult();
  };

  /** 发起一次上传请求（overwriteIds 用于覆盖确认后的重试） */
  const doUpload = (extra: { overwriteIds?: string[]; overwrite?: boolean } = {}): Promise<UploadResult> => {
    if (!picked) throw new Error('未选择文件');
    return apiUploadMod({
      files: picked.files,
      scope,
      teamId: scope === 'personal' ? undefined : teamId || undefined,
      visibility,
      split,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      category: category || undefined,
      tags: tags.length > 0 ? tags.join(',') : undefined,
      overwriteIds: extra.overwriteIds,
      overwrite: extra.overwrite,
      onProgress: setProgress,
    });
  };

  /** 发起一次导入请求（overwriteIds 用于覆盖确认后的重试） */
  const doImport = (extra: { overwriteIds?: string[]; overwrite?: boolean } = {}): Promise<UploadResult> => {
    if (!importPreview) throw new Error('请先解析 Mod 链接');
    return apiImportMod({
      url: importUrl.trim(),
      scope,
      teamId: scope === 'personal' ? undefined : teamId || undefined,
      visibility,
      split,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      category: category || undefined,
      tags: tags.length > 0 ? tags.join(',') : undefined,
      overwriteIds: extra.overwriteIds,
      overwrite: extra.overwrite,
    });
  };

  const resolveLink = async (): Promise<void> => {
    const value = importUrl.trim();
    if (!value) {
      setImportError('请粘贴 Mod 页面链接');
      return;
    }
    setResolving(true);
    setImportError('');
    setImportPreview(null);
    resetResult();
    try {
      const preview = await apiResolveImport(value);
      setImportPreview(preview);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '链接解析失败，请稍后重试');
    } finally {
      setResolving(false);
    }
  };

  const changeImportUrl = (value: string): void => {
    setImportUrl(value);
    setImportPreview(null);
    setImportError('');
    resetResult();
  };

  const switchEntryMode = (next: string): void => {
    const mode = next === 'import' ? 'import' : 'file';
    setEntryMode(mode);
    setError('');
    setImportError('');
    resetResult();
    setDone(null);
    setSplitResult(null);
  };

  const applyResult = async (
    result: UploadResult,
    retry: (overwriteIds: string[]) => Promise<UploadResult>,
    label: '上传' | '导入',
  ): Promise<void> => {
    if (isSplitResult(result)) {
      setSplitResult(result);
      const overwritable = overwritableItems(result);
      if (overwritable.length > 0) {
        const names = overwritable.slice(0, 3).map((item) => item.name).join('、');
        const more = overwritable.length > 3 ? ` 等 ${overwritable.length} 个` : '';
        const ok = await confirm({
          title: `发现 ${overwritable.length} 个重复 Mod`,
          description: (
            <div className="confirm-copy">
              <p>
                以下 Mod 已存在于当前空间：<strong>{names}</strong>
                {more}。
              </p>
              <p>
                覆盖会替换它们的文件与信息，但保留发布时间、下载次数和可见性；其余已上传的内容不会重复上传。
              </p>
            </div>
          ),
          confirmLabel: '覆盖这些记录',
          cancelLabel: '保留原记录',
        });
        if (ok) {
          setProgress(0);
          const second = await retry(overwritable.map((item) => item.existingId as string));
          if (isSplitResult(second)) {
            const merged = mergeSplitResults(result, second);
            setSplitResult(merged);
            toast({
              variant: 'success',
              title: '拆分发布完成',
              description: `成功 ${merged.created.length} 个，跳过 ${merged.skipped.length} 个。`,
            });
          } else {
            setDone(second);
            setProgress(100);
            toast({
              variant: 'success',
              title: `${label}成功`,
              description: second.title,
            });
          }
        } else {
          toast({
            variant: 'info',
            title: '已保留原有记录',
            description: '第一轮能发布的内容已经保存，重复项未覆盖。',
          });
        }
      } else {
        toast({
          variant: 'success',
          title: '拆分发布完成',
          description: `成功 ${result.created.length} 个，跳过 ${result.skipped.length} 个。`,
        });
      }
    } else {
      setDone(result);
      setProgress(100);
      toast({
        variant: 'success',
        title: result.replaced ? '已覆盖更新' : `${label}成功`,
        description: `${result.title} · ${result.subMods.length} 个 Mod · ${result.category}`,
      });
    }
    refreshQuota();
  };

  const handleConflict = async (
    err: unknown,
    retry: (overwriteIds: string[]) => Promise<UploadResult>,
    label: '上传' | '导入',
  ): Promise<void> => {
    const apiErr = err instanceof ApiError ? err : new ApiError(0, `${label}失败`);
    if (apiErr.status === 409 && apiErr.existingId) {
      if (apiErr.canOverwrite === false) {
        setError(`${apiErr.message}（该记录由其他成员上传，无法覆盖）`);
        return;
      }
      const ok = await confirm({
        title: '这个 Mod 已经在谷仓里了',
        description: (
          <div className="confirm-copy">
            <p>{apiErr.message}</p>
            <p>覆盖会替换它的文件与信息，但保留发布时间、下载次数和可见性。</p>
          </div>
        ),
        confirmLabel: '覆盖更新',
        cancelLabel: `取消${label}`,
      });
      if (!ok) {
        setError(`已取消覆盖，未${label === '上传' ? '上传' : '导入'}任何内容`);
        return;
      }
      try {
        setProgress(0);
        const retryResult = await retry([apiErr.existingId]);
        await applyResult(retryResult, retry, label);
      } catch (retryError) {
        setError(
          retryError instanceof Error
            ? retryError.message
            : `覆盖${label}失败，请重试`,
        );
      }
      return;
    }
    setError(apiErr.message);
  };

  const submit = async (): Promise<void> => {
    setError('');
    setDone(null);
    setSplitResult(null);
    if (!picked || picked.files.length === 0) {
      setError('请先选择要上传的文件、压缩包或文件夹');
      return;
    }
    if (scope === 'team' && !teamId) {
      setError('团队存储需要先选择一个团队');
      return;
    }

    // 体积前置校验：避免白传几百 MB 才被后端拒绝
    const totalBytes = picked.files.reduce((sum, file) => sum + file.size, 0);
    if (quota && totalBytes > quota.serverLimits.maxUploadBytes) {
      setError(
        `所选内容共 ${formatBytes(totalBytes)}，超过单次上传上限 ${quota.serverLimits.maxUploadHuman}，请拆分成多次上传`,
      );
      return;
    }

    // 上传前探活：后端未启动时立刻给出明确提示，而不是传一半才报网络错误
    try {
      await apiHealth();
    } catch {
      setError('无法连接后端服务，上传已取消。请先启动后端（默认 http://localhost:4000）再重试');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const result = await doUpload({});
      await applyResult(result, (ids) => doUpload({ overwriteIds: ids }), '上传');
    } catch (err) {
      await handleConflict(err, (ids) => doUpload({ overwriteIds: ids }), '上传');
    } finally {
      setUploading(false);
    }
  };

  const submitImport = async (): Promise<void> => {
    setError('');
    setDone(null);
    setSplitResult(null);
    if (!importPreview) {
      setError('请先粘贴 Mod 页面链接并点击「解析链接」');
      return;
    }
    if (!importPreview.downloadable) {
      setError(importPreview.reason || '当前来源不可自动下载，请手动上传文件');
      return;
    }
    if (scope === 'team' && !teamId) {
      setError('团队存储需要先选择一个团队');
      return;
    }
    try {
      await apiHealth();
    } catch {
      setError('无法连接后端服务，导入已取消。请先启动后端（默认 http://localhost:4000）再重试');
      return;
    }

    setImporting(true);
    setProgress(0);
    try {
      const result = await doImport({});
      await applyResult(result, (ids) => doImport({ overwriteIds: ids }), '导入');
    } catch (err) {
      await handleConflict(err, (ids) => doImport({ overwriteIds: ids }), '导入');
    } finally {
      setImporting(false);
    }
  };

  const currentStep = busy
    ? 'upload'
    : done || splitResult
      ? 'done'
      : entryMode === 'import'
        ? importPreview
          ? 'config'
          : 'pick'
        : picked
          ? 'config'
          : 'pick';

  const personalPct = quota ? percent(quota.personal.usedBytes, quota.personal.limitBytes) : 0;
  const teamPct = selectedTeamQuota
    ? percent(selectedTeamQuota.usedBytes, selectedTeamQuota.limitBytes)
    : 0;

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="谷仓入库"
        title="上传 Mod"
        description="上传文件，或粘贴 Nexus / CurseForge 链接；平台会自动解析 manifest、推断分类并整理归档。"
        actions={
          <Link to="/mine" className="pv-btn pv-btn--default">
            <PixelIcon name="file" size={16} />
            <span className="pv-btn__label">查看我的空间</span>
          </Link>
        }
      />

      <Panel className="steps-panel" padded>
        <Steps steps={STEPS} current={currentStep} label="上传步骤" />
      </Panel>

      <div className="upload-grid">
        <div className="upload-column">
          <Panel
            title="1. 选择内容"
            subtitle={
              entryMode === 'file'
                ? '单个文件、.zip 压缩包或整个文件夹都可以'
                : '从 Nexus Mods / CurseForge 官方 API 导入'
            }
            icon={<PixelIcon name={entryMode === 'file' ? 'upload' : 'sparkle'} size={18} />}
            headingLevel={2}
          >
            <Tabs
              items={[
                { value: 'file', label: '上传文件', disabled: busy || resolving },
                { value: 'import', label: '从网站导入', disabled: busy || resolving },
              ]}
              value={entryMode}
              onValueChange={switchEntryMode}
              label="选择 Mod 来源"
            />

            {entryMode === 'file' ? (
              <>
                <UploadDropzone onPick={handlePick} disabled={busy} />
                <p className="panel-note">
                  .rar / .7z 请先转成 .zip；超大文件请分批上传。文件夹上传会保留目录结构并打包供下载。
                </p>
              </>
            ) : (
              <ImportFromSite
                url={importUrl}
                onUrlChange={changeImportUrl}
                providers={providers}
                preview={importPreview}
                resolving={resolving}
                error={importError}
                onResolve={() => void resolveLink()}
              />
            )}
          </Panel>

          <Panel
            title="2. 存放位置"
            subtitle="决定 Mod 进入哪个谷仓、谁能看到"
            icon={<PixelIcon name="leaf" size={18} />}
            headingLevel={2}
          >
            <div className="form-stack">
              <Select
                label="存储空间"
                options={
                  entryMode === 'import'
                    ? SCOPE_OPTIONS.filter((option) => option.value !== 'public')
                    : SCOPE_OPTIONS
                }
                value={scope}
                onValueChange={(value) => setScope(value as Scope)}
                disabled={busy}
              />

              {scope === 'team' || scope === 'public' ? (
                <Select
                  label={scope === 'team' ? '选择团队（必填）' : '归属团队（可选）'}
                  options={[
                    {
                      value: '',
                      label: scope === 'team' ? '— 请选择团队 —' : '— 不归属团队，以个人名义公开 —',
                    },
                    ...teams.map((team) => ({ value: team.id, label: team.name })),
                  ]}
                  value={teamId}
                  onValueChange={setTeamId}
                  disabled={busy}
                  hint={
                    teams.length === 0
                      ? '还没有团队，可先到「团队」页创建一个。'
                      : '以团队名义发布时，仍占用该团队的配额。'
                  }
                />
              ) : null}

              <Select
                label="谁可以看"
                options={
                  entryMode === 'import'
                    ? visibilityOptions(scope).filter((option) => option.value !== 'public')
                    : visibilityOptions(scope)
                }
                value={visibility}
                onValueChange={(value) => setVisibility(value as Visibility)}
                disabled={scope === 'public' || uploading}
              />

              <Checkbox
                checked={split}
                onCheckedChange={setSplit}
                disabled={busy}
                label="拆分发布"
                description="压缩包 / 文件夹内含多个 Mod 时，每个 Mod 单独成一条记录；不勾选则合并为「合集包」。选择多个 zip 时同样适用。"
              />

              {entryMode === 'import' ? (
                <Alert variant="info" title="自动导入仅进入私有空间">
                  从外部站点导入的 Mod 只会存入个人或团队私有空间，避免未经授权公开转载。
                  如需公开分享，请确认作者许可后使用「上传文件」。团队空间仍对成员可见。
                </Alert>
              ) : null}

              {quota ? (
                <div className="upload-quota">
                  <div className="upload-quota__row">
                    <span>
                      <PixelSprite name="parsnip" size={18} /> 个人空间 {quota.personal.usedHuman} /{' '}
                      {quota.personal.limitHuman}
                    </span>
                    <Badge variant={personalPct >= 90 ? 'danger' : 'success'}>{personalPct}%</Badge>
                  </div>
                  <ProgressBar
                    value={quota.personal.usedBytes}
                    max={quota.personal.limitBytes || 1}
                    variant={personalPct >= 90 ? 'health' : 'energy'}
                    size="sm"
                    aria-label={`个人空间已使用 ${personalPct}%`}
                  />
                  {selectedTeamQuota ? (
                    <>
                      <div className="upload-quota__row">
                        <span>
                          <PixelIcon name="heart" size={15} /> {selectedTeamQuota.teamName}{' '}
                          {selectedTeamQuota.usedHuman} / {selectedTeamQuota.limitHuman}
                        </span>
                        <Badge variant={teamPct >= 90 ? 'danger' : 'info'}>{teamPct}%</Badge>
                      </div>
                      <ProgressBar
                        value={selectedTeamQuota.usedBytes}
                        max={selectedTeamQuota.limitBytes || 1}
                        variant={teamPct >= 90 ? 'health' : 'xp'}
                        size="sm"
                        aria-label={`团队空间已使用 ${teamPct}%`}
                      />
                    </>
                  ) : null}
                  <p className="panel-note">
                    单次上传上限 {quota.serverLimits.maxUploadHuman}。公开 Mod 仍计入上传者所在空间配额。
                  </p>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="upload-column">
          <Panel
            title="3. 信息补充"
            subtitle="留空会自动使用 manifest 中的信息"
            icon={<PixelIcon name="file" size={18} />}
            headingLevel={2}
          >
            <div className="form-stack">
              <TextField
                label="标题"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="不填则用 manifest 的 Name（拆分时自动用子 Mod 名字）"
                disabled={busy}
              />

              <Select
                label="分类"
                options={CATEGORY_OPTIONS}
                value={category}
                onValueChange={setCategory}
                disabled={busy}
                hint="留空时根据 manifest、文件名和依赖关系自动推断。"
              />

              <TagInput
                label="标签"
                value={tags}
                onValueChange={setTags}
                maxTags={12}
                maxLength={18}
                disabled={busy}
                placeholder="输入后按回车或逗号，例如：美化、春季、农场"
                hint="最多 12 个标签，便于在广场被搜到。"
              />

              <TextArea
                label="介绍"
                value={description}
                maxLength={2000}
                rows={5}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="不填则用 manifest 的 Description；合集包会自动汇总子 Mod 名单。"
                hint={`${description.length} / 2000`}
                disabled={busy}
              />
            </div>
          </Panel>

          <Panel
            title={entryMode === 'import' ? '4. 开始导入' : '4. 开始上传'}
            subtitle={
              entryMode === 'import'
                ? '服务端下载并整理期间请不要关闭页面'
                : '上传期间请不要关闭页面'
            }
            icon={<PixelIcon name="sparkle" size={18} />}
            headingLevel={2}
            className="upload-submit-panel"
          >
            {uploading ? (
              <ProgressBar
                value={progress}
                max={100}
                variant="xp"
                label={`上传中… ${progress}%`}
                className="upload-progress"
              />
            ) : null}
            {importing ? (
              <div className="import-loading import-loading--submit">
                <Spinner size="md" showLabel label="正在从原站下载并自动整理…" />
                <span>下载完成后会复用平台的上传整理流程，期间请不要关闭页面。</span>
              </div>
            ) : null}

            {error ? (
              <Alert
                variant="error"
                title={entryMode === 'import' ? '导入没有完成' : '上传没有完成'}
                dismissible
                onDismiss={() => setError('')}
              >
                {error}
              </Alert>
            ) : null}

            {done ? (
              <Alert
                variant="success"
                title={
                  done.replaced
                    ? '已覆盖更新并整理完成'
                    : entryMode === 'import'
                      ? '导入成功并自动整理'
                      : '上传成功并自动整理'
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/mods/${done.id}`)}
                  >
                    查看详情
                  </Button>
                }
              >
                <strong>{done.title}</strong> · {done.subMods.length} 个 Mod · {done.category} ·{' '}
                {formatBytes(done.fileSize)}
                {done.source ? (
                  <span className="result-source">
                    <SourceBadge source={done.source} />
                  </span>
                ) : null}
              </Alert>
            ) : null}

            {splitResult ? (
              <div className="split-result">
                <Alert
                  variant="success"
                  title={`拆分发布完成：成功 ${splitResult.created.length} 个${
                    splitResult.skipped.length > 0 ? `，跳过 ${splitResult.skipped.length} 个` : ''
                  }`}
                />
                {splitResult.created.length > 0 ? (
                  <ul className="result-list">
                    {splitResult.created.map((mod) => (
                      <li key={mod.id}>
                        <Link to={`/mods/${mod.id}`}>{mod.title}</Link>
                        <span className="result-list__meta">
                          <Badge variant={mod.replaced ? 'gold' : 'success'}>
                            {mod.replaced ? '已覆盖' : '新发布'}
                          </Badge>
                          {mod.fileCount} 个文件
                          <SourceBadge source={mod.source} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {splitResult.skipped.length > 0 ? (
                  <ul className="result-list result-list--skipped">
                    {splitResult.skipped.map((item, index) => (
                      <li key={`${item.existingId ?? item.name}-${index}`}>
                        <span>{item.name}</span>
                        <span className="result-list__meta">
                          <Badge variant="warning">跳过</Badge>
                          {item.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="submit-actions">
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                disabled={
                  busy ||
                  (entryMode === 'import' && (!importPreview || !importPreview.downloadable))
                }
                leftIcon={
                  <PixelIcon name={entryMode === 'import' ? 'sparkle' : 'upload'} size={18} />
                }
                onClick={() => void (entryMode === 'import' ? submitImport() : submit())}
              >
                {busy
                  ? entryMode === 'import'
                    ? '下载导入中…'
                    : '上传整理中…'
                  : entryMode === 'import'
                    ? '导入并自动整理'
                    : '上传并自动整理'}
              </Button>
              {done ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (entryMode === 'import') {
                      setImportUrl('');
                      setImportPreview(null);
                      setImportError('');
                    } else {
                      setPicked(null);
                    }
                    resetResult();
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
                  }}
                >
                  继续{entryMode === 'import' ? '导入' : '上传'}
                </Button>
              ) : null}
            </div>

            <p className="panel-note">
              {entryMode === 'import'
                ? '仅通过官方 API 下载；遇到重复 Mod 会先询问是否覆盖。作者关闭第三方下载或文件被隔离时，会自动回退为手动上传提示。'
                : '压缩包会自动拆出所有 manifest.json；文件树最多展示 1200 个节点，预览图最多 6 张。遇到重复 Mod 会先询问是否覆盖。'}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
