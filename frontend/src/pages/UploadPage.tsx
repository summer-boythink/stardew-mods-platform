import { useEffect, useState } from 'react';
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
import { UploadDropzone, type PickedFiles } from '../components/UploadDropzone';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';
import { MOD_CATEGORIES, formatBytes, type ModRecord, type QuotaInfo, type TeamRecord } from '../types';
import { mergeSplitResults, overwritableItems } from '../utils/mergeSplit';

export function UploadPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<PickedFiles | null>(null);
  const [scope, setScope] = useState<'personal' | 'team' | 'public'>('personal');
  const [teamId, setTeamId] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [split, setSplit] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
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
    if (scope === 'personal') setVisibility((v) => (v === 'team' ? 'private' : v));
    if (scope === 'team') setVisibility((v) => (v === 'private' ? 'team' : v));
    if (scope === 'public') setVisibility('public');
  }, [scope]);

  if (!user) {
    return (
      <div className="page">
        <ICard>
          <p>
            请先 <Link to="/auth">登录 / 注册</Link> 后再上传 Mod。
          </p>
        </ICard>
      </div>
    );
  }

  const refreshQuota = (): void => {
    apiQuota().then(setQuota).catch(() => {});
  };

  /** 发起一次上传请求（overwriteIds 用于覆盖确认后的重试） */
  const doUpload = (extra: { overwriteIds?: string[]; overwrite?: boolean } = {}): Promise<UploadResult> => {
    if (!picked) throw new Error('未选择文件');
    return apiUploadMod({
      files: picked.files,
      scope,
      teamId: teamId || undefined,
      visibility,
      split,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      category: category || undefined,
      tags: tags.trim() || undefined,
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
    const totalBytes = picked.files.reduce((s, f) => s + f.size, 0);
    if (quota && totalBytes > quota.serverLimits.maxUploadBytes) {
      setError(`所选内容共 ${formatBytes(totalBytes)}，超过单次上传上限 ${quota.serverLimits.maxUploadHuman}，请拆分成多次上传`);
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
        // 拆分模式下若有可覆盖的重复项 → 弹窗询问是否覆盖
        const overwritable = overwritableItems(result);
        if (overwritable.length > 0) {
          const names = overwritable.slice(0, 3).map((s) => s.name).join('、');
          const more = overwritable.length > 3 ? ` 等 ${overwritable.length} 个` : '';
          const ok = window.confirm(
            `有 ${overwritable.length} 个 Mod 已存在（${names}${more}）。\n\n是否覆盖这些已有记录？\n覆盖会替换它们的文件与信息（发布时间、下载次数和可见性保持不变），其余已上传的不会重复上传。`,
          );
          if (ok) {
            setProgress(0);
            const second = await doUpload({ overwriteIds: overwritable.map((s) => s.existingId as string) });
            if (isSplitResult(second)) setSplitResult(mergeSplitResults(result, second));
          }
        }
      } else {
        setDone(result);
        setProgress(100);
      }
      refreshQuota();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, '上传失败');
      // 单条模式的重复上传（409）→ 弹窗询问是否覆盖
      if (err.status === 409 && err.existingId) {
        if (err.canOverwrite === false) {
          setError(`${err.message}（该记录由其他成员上传，无法覆盖）`);
        } else {
          const ok = window.confirm(
            `${err.message}\n\n是否覆盖已有记录？\n覆盖会替换其文件与信息（发布时间、下载次数和可见性保持不变）。`,
          );
          if (ok) {
            try {
              setProgress(0);
              const retry = await doUpload({ overwriteIds: [err.existingId] });
              if (!isSplitResult(retry)) {
                setDone(retry);
                setProgress(100);
                refreshQuota();
              }
            } catch (e2) {
              setError(e2 instanceof Error ? e2.message : '覆盖上传失败，请重试');
            }
          } else {
            setError('已取消覆盖，未上传任何内容');
          }
        }
      } else {
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">＋ 上传 Mod（自动整理）</h2>
      <div className="two-col">
        <div>
          <ICard>
            <h3>1. 选择内容</h3>
            <UploadDropzone onPick={setPicked} disabled={uploading} />
          </ICard>
          <ICard>
            <h3>2. 存放位置与发布方式</h3>
            <div className="form-grid">
              <label>
                存储空间
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  <option value="personal">🏠 个人空间（默认私有）</option>
                  <option value="team">👥 团队空间（成员共享）</option>
                  <option value="public">🌍 完全公开（广场展示）</option>
                </select>
              </label>
              {(scope === 'team' || scope === 'public') && (
                <label>
                  归属团队{scope === 'team' ? '（必填）' : '（可选：以团队名义发布）'}
                  <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">— {scope === 'team' ? '请选择团队' : '不归属团队（个人名义公开）'} —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                谁可以看
                <select
                  className="input"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  disabled={scope === 'public'}
                >
                  {scope === 'personal' && (
                    <>
                      <option value="private">🔒 仅自己</option>
                      <option value="public">🌍 公开</option>
                    </>
                  )}
                  {scope === 'team' && (
                    <>
                      <option value="team">👥 团队成员</option>
                      <option value="public">🌍 公开</option>
                    </>
                  )}
                  {scope === 'public' && <option value="public">🌍 公开</option>}
                </select>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                <span>
                  拆分发布：压缩包 / 文件夹内含多个 Mod 时，每个 Mod 单独发布
                  <span className="muted">（不勾选则合并为一个「合集包」；选择多个 zip 时也适用）</span>
                </span>
              </label>
            </div>
            {quota && (
              <p className="muted">
                个人 {quota.personal.usedHuman}/{quota.personal.limitHuman}
                {teamId && quota.teams.find((t) => t.teamId === teamId)
                  ? ` · 团队 ${quota.teams.find((t) => t.teamId === teamId)?.usedHuman}/${quota.teams.find((t) => t.teamId === teamId)?.limitHuman}`
                  : ''}
              </p>
            )}
          </ICard>
        </div>
        <div>
          <ICard>
            <h3>3. 信息补充（可选，不填则自动识别）</h3>
            <div className="form-grid">
              <label>
                标题
                <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="不填则用 manifest 的 Name（拆分模式下自动用每个子 Mod 的名字）" />
              </label>
              <label>
                分类（不填自动推断）
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">自动推断</option>
                  {MOD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标签（逗号分隔，最多 12 个）
                <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="美化, 春季, 农场" />
              </label>
              <label>
                介绍
                <textarea className="input textarea" value={description} maxLength={2000} rows={5} onChange={(e) => setDescription(e.target.value)} placeholder="不填则用 manifest 的 Description；合集包会自动汇总子 Mod 名单" />
              </label>
            </div>
          </ICard>
          <ICard>
            <h3>4. 开始上传</h3>
            {uploading && (
              <div className="progress">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
                <span>{progress}%</span>
              </div>
            )}
            {error && <div className="state-error">{error}</div>}
            {done && (
              <div className="state-ok">
                ✅ {done.replaced ? '已覆盖更新' : '上传成功'}并已自动整理：<strong>{done.title}</strong>（
                {done.subMods.length} 个 Mod · {done.category}）
                <div className="row-gap">
                  <IButton islandType="primary" onClick={() => navigate(`/mods/${done.id}`)}>
                    查看 Mod 详情
                  </IButton>
                </div>
              </div>
            )}
            {splitResult && (
              <div className="state-ok">
                ✅ 拆分发布完成：成功 {splitResult.created.length} 个
                {splitResult.skipped.length > 0 ? `，跳过 ${splitResult.skipped.length} 个` : ''}
                <ul className="member-list" style={{ marginTop: 8 }}>
                  {splitResult.created.map((m) => (
                    <li key={m.id}>
                      <Link to={`/mods/${m.id}`}>{m.title}</Link>
                      <span className="muted">
                        {m.replaced ? '已覆盖更新' : '新发布'} · {m.fileCount} 个文件
                      </span>
                    </li>
                  ))}
                  {splitResult.skipped.map((s, i) => (
                    <li key={`${s.existingId ?? s.name}-${i}`}>
                      <span>⏭ {s.name}</span>
                      <span className="muted">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="row-gap">
              <IButton islandType="primary" loading={uploading} onClick={() => void submit()}>
                {uploading ? '上传整理中…' : '🚀 上传并自动整理'}
              </IButton>
            </div>
            <p className="muted">
              压缩包会自动拆出所有 manifest.json；文件夹上传会保留目录结构并打包供下载；遇到重复 Mod
              会询问你是否覆盖。选择多个压缩包可一次上传，勾选「拆分发布」则每个 Mod 独立成一条记录。
            </p>
          </ICard>
        </div>
      </div>
    </div>
  );
}
