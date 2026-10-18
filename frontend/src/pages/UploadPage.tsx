import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiMyTeams, apiQuota, apiUploadMod } from '../api/client';
import { UploadDropzone, type PickedFiles } from '../components/UploadDropzone';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';
import { MOD_CATEGORIES, type ModRecord, type QuotaInfo, type TeamRecord } from '../types';

export function UploadPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<PickedFiles | null>(null);
  const [scope, setScope] = useState<'personal' | 'team' | 'public'>('personal');
  const [teamId, setTeamId] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<ModRecord | null>(null);

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

  const submit = async (): Promise<void> => {
    setError('');
    setDone(null);
    if (!picked || picked.files.length === 0) {
      setError('请先选择要上传的文件、压缩包或文件夹');
      return;
    }
    if (scope === 'team' && !teamId) {
      setError('团队存储需要先选择一个团队');
      return;
    }
    if (scope === 'public' && teamId === '' && false) return;
    setUploading(true);
    setProgress(0);
    try {
      const record = await apiUploadMod({
        files: picked.files,
        scope,
        teamId: teamId || undefined,
        visibility,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        category: category || undefined,
        tags: tags.trim() || undefined,
        onProgress: setProgress,
      });
      setDone(record);
      setProgress(100);
    } catch (e) {
      const err = e as ApiError;
      setError(err.message + (err.existingId ? `（已有记录，可前往查看）` : ''));
      if (err.existingId) {
        setDone(null);
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
            <h3>2. 存放位置与可见性</h3>
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
                <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="不填则用 manifest 的 Name" />
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
                ✅ 上传成功并已自动整理：<strong>{done.title}</strong>（{done.subMods.length} 个 Mod · {done.category}）
                <div className="row-gap">
                  <IButton islandType="primary" onClick={() => navigate(`/mods/${done.id}`)}>
                    查看 Mod 详情
                  </IButton>
                </div>
              </div>
            )}
            <div className="row-gap">
              <IButton islandType="primary" loading={uploading} onClick={submit}>
                {uploading ? '上传整理中…' : '🚀 上传并自动整理'}
              </IButton>
            </div>
            <p className="muted">压缩包会自动拆出所有 manifest.json 并识别为{`合集包`}；文件夹上传会保留目录结构并打包供下载。</p>
          </ICard>
        </div>
      </div>
    </div>
  );
}
