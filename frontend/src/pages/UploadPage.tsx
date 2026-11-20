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
  Steps,
  TagInput,
  TextField,
  useToast,
} from '@pixelvale/ui';
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiError,
  apiHealth,
  apiMyTeams,
  apiQuota,
  apiUploadMod,
  isSplitResult,
  type SingleUploadResult,
  type SplitUploadResult,
  type UploadResult,
} from '../api/client';
import { useConfirm } from '../components/Feedback';
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

  useEffect(() => {
    if (!user) return;
    apiMyTeams().then(setTeams).catch(() => {});
    apiQuota().then(setQuota).catch(() => {});
  }, [user]);

  useEffect(() => {
    // 切换 scope 时给可见性一个合理默认
    if (scope === 'personal') setVisibility((value) => (value === 'team' ? 'private' : value));
    if (scope === 'team') setVisibility((value) => (value === 'private' ? 'team' : value));
    if (scope === 'public') setVisibility('public');
  }, [scope]);

  const selectedTeamQuota = useMemo(
    () => quota?.teams.find((team) => team.teamId === teamId) ?? null,
    [quota, teamId],
  );

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
            const second = await doUpload({
              overwriteIds: overwritable.map((item) => item.existingId as string),
            });
            if (isSplitResult(second)) {
              const merged = mergeSplitResults(result, second);
              setSplitResult(merged);
              toast({
                variant: 'success',
                title: '拆分发布完成',
                description: `成功 ${merged.created.length} 个，跳过 ${merged.skipped.length} 个。`,
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
          title: result.replaced ? '已覆盖更新' : '上传成功',
          description: `${result.title} · ${result.subMods.length} 个 Mod · ${result.category}`,
        });
      }
      refreshQuota();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, '上传失败');
      if (apiErr.status === 409 && apiErr.existingId) {
        if (apiErr.canOverwrite === false) {
          setError(`${apiErr.message}（该记录由其他成员上传，无法覆盖）`);
        } else {
          const ok = await confirm({
            title: '这个 Mod 已经在谷仓里了',
            description: (
              <div className="confirm-copy">
                <p>{apiErr.message}</p>
                <p>
                  覆盖会替换它的文件与信息，但保留发布时间、下载次数和可见性。
                </p>
              </div>
            ),
            confirmLabel: '覆盖更新',
            cancelLabel: '取消上传',
          });
          if (ok) {
            try {
              setProgress(0);
              const retry = await doUpload({ overwriteIds: [apiErr.existingId] });
              if (!isSplitResult(retry)) {
                setDone(retry);
                setProgress(100);
                refreshQuota();
                toast({
                  variant: 'success',
                  title: '已覆盖更新',
                  description: retry.title,
                });
              }
            } catch (retryError) {
              setError(
                retryError instanceof Error ? retryError.message : '覆盖上传失败，请重试',
              );
            }
          } else {
            setError('已取消覆盖，未上传任何内容');
          }
        }
      } else {
        setError(apiErr.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const currentStep = uploading
    ? 'upload'
    : done || splitResult
      ? 'done'
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
        description="选好文件后，平台会自动解析 manifest、推断分类、生成文件树和预览图。"
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
            subtitle="单个文件、.zip 压缩包或整个文件夹都可以"
            icon={<PixelIcon name="upload" size={18} />}
            headingLevel={2}
          >
            <UploadDropzone onPick={handlePick} disabled={uploading} />
            <p className="panel-note">
              .rar / .7z 请先转成 .zip；超大文件请分批上传。文件夹上传会保留目录结构并打包供下载。
            </p>
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
                options={SCOPE_OPTIONS}
                value={scope}
                onValueChange={(value) => setScope(value as Scope)}
                disabled={uploading}
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
                  disabled={uploading}
                  hint={
                    teams.length === 0
                      ? '还没有团队，可先到「团队」页创建一个。'
                      : '以团队名义发布时，仍占用该团队的配额。'
                  }
                />
              ) : null}

              <Select
                label="谁可以看"
                options={visibilityOptions(scope)}
                value={visibility}
                onValueChange={(value) => setVisibility(value as Visibility)}
                disabled={scope === 'public' || uploading}
              />

              <Checkbox
                checked={split}
                onCheckedChange={setSplit}
                disabled={uploading}
                label="拆分发布"
                description="压缩包 / 文件夹内含多个 Mod 时，每个 Mod 单独成一条记录；不勾选则合并为「合集包」。选择多个 zip 时同样适用。"
              />

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
                disabled={uploading}
              />

              <Select
                label="分类"
                options={CATEGORY_OPTIONS}
                value={category}
                onValueChange={setCategory}
                disabled={uploading}
                hint="留空时根据 manifest、文件名和依赖关系自动推断。"
              />

              <TagInput
                label="标签"
                value={tags}
                onValueChange={setTags}
                maxTags={12}
                maxLength={18}
                disabled={uploading}
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
                disabled={uploading}
              />
            </div>
          </Panel>

          <Panel
            title="4. 开始上传"
            subtitle="上传期间请不要关闭页面"
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

            {error ? (
              <Alert variant="error" title="上传没有完成" dismissible onDismiss={() => setError('')}>
                {error}
              </Alert>
            ) : null}

            {done ? (
              <Alert
                variant="success"
                title={done.replaced ? '已覆盖更新并整理完成' : '上传成功并自动整理'}
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
                loading={uploading}
                disabled={uploading}
                leftIcon={<PixelIcon name="upload" size={18} />}
                onClick={() => void submit()}
              >
                {uploading ? '上传整理中…' : '上传并自动整理'}
              </Button>
              {done ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPicked(null);
                    resetResult();
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
                  }}
                >
                  继续上传
                </Button>
              ) : null}
            </div>

            <p className="panel-note">
              压缩包会自动拆出所有 manifest.json；文件树最多展示 1200 个节点，预览图最多 6 张。
              遇到重复 Mod 会先询问是否覆盖。
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
