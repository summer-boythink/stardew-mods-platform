import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiCreateTeam,
  apiDeleteTeam,
  apiInviteMember,
  apiMyTeams,
  apiRemoveMember,
  apiTeamDetail,
  apiTeamMods,
} from '../api/client';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';
import { formatBytes, type PagedResult, type ModRecord, type TeamDetail, type TeamRecord } from '../types';

export function TeamPage(): JSX.Element {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [mods, setMods] = useState<PagedResult<ModRecord> | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [invite, setInvite] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadTeams = async (selectFirst = false): Promise<void> => {
    setErr('');
    try {
      const list = await apiMyTeams();
      setTeams(list);
      if (selectFirst && list.length > 0 && !activeId) setActiveId(list[0].id);
      else if (list.length === 0) {
        setActiveId('');
        setDetail(null);
        setMods(null);
      } else if (activeId && !list.some((t) => t.id === activeId)) {
        setActiveId(list[0].id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  };

  useEffect(() => {
    if (user) void loadTeams(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!activeId) return;
    setDetail(null);
    setMods(null);
    apiTeamDetail(activeId).then(setDetail).catch((e: Error) => setErr(e.message));
    apiTeamMods(activeId).then(setMods).catch((e: Error) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

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

  const create = async (): Promise<void> => {
    setMsg('');
    setErr('');
    if (name.trim().length < 2) {
      setErr('团队名至少 2 个字符');
      return;
    }
    try {
      const t = await apiCreateTeam(name.trim(), desc.trim());
      setName('');
      setDesc('');
      setMsg(`团队「${t.name}」创建成功`);
      await loadTeams();
      setActiveId(t.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
    }
  };

  const inviteMember = async (): Promise<void> => {
    setMsg('');
    setErr('');
    if (!activeId || !invite.trim()) return;
    try {
      const r = await apiInviteMember(activeId, invite.trim());
      setMsg(`已邀请 ${r.username} 加入团队`);
      setInvite('');
      const d = await apiTeamDetail(activeId);
      setDetail(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '邀请失败');
    }
  };

  const leaveOrRemove = async (userId: string, username: string): Promise<void> => {
    if (!activeId) return;
    const self = userId === user.id;
    if (!window.confirm(self ? '确定退出该团队？' : `确定移除成员 ${username}？`)) return;
    try {
      await apiRemoveMember(activeId, userId);
      if (self) {
        await loadTeams();
      } else if (detail) {
        const d = await apiTeamDetail(activeId);
        setDetail(d);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    }
  };

  const dissolve = async (): Promise<void> => {
    if (!activeId || !detail) return;
    if (!window.confirm(`确定解散团队「${detail.name}」？团队下所有 Mod 文件都会被删除！`)) return;
    try {
      const r = await apiDeleteTeam(activeId);
      setMsg(`已解散团队，一并删除 ${r.removedMods} 个 Mod`);
      setActiveId('');
      setDetail(null);
      setMods(null);
      await loadTeams();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '解散失败');
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">👥 团队空间（共享 10GB）</h2>
      {err && <div className="state-error">{err}</div>}
      {msg && <div className="state-ok">{msg}</div>}
      <div className="two-col">
        <div>
          <ICard>
            <h3>我的团队</h3>
            {teams.length === 0 && <p className="muted">还没有加入任何团队，先创建一个吧 👇</p>}
            <div className="team-list">
              {teams.map((t) => (
                <button key={t.id} className={`team-item${t.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(t.id)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.ownerName} 创建</span>
                </button>
              ))}
            </div>
          </ICard>
          <ICard>
            <h3>创建新团队</h3>
            <div className="form-grid">
              <label>
                团队名
                <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="如：农场美化小队" />
              </label>
              <label>
                介绍
                <input className="input" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} placeholder="这个团队主要整理哪类 Mod？" />
              </label>
            </div>
            <div className="row-gap">
              <IButton islandType="primary" onClick={() => void create()}>
                创建团队
              </IButton>
            </div>
          </ICard>
        </div>
        <div>
          {!detail && <ICard><p className="muted">选择左侧团队查看详情、邀请成员与团队 Mod。</p></ICard>}
          {detail && (
            <>
              <ICard>
                <h3>
                  {detail.name} <span className="muted">（{detail.ownerName} 创建）</span>
                </h3>
                <p className="muted">{detail.description || '暂无介绍'}</p>
                <h4>成员（{detail.members.length}）</h4>
                <ul className="member-list">
                  {detail.members.map((m) => (
                    <li key={m.userId}>
                      <span>
                        {m.role === 'owner' ? '👑' : '🧑‍🌾'} {m.username}
                      </span>
                      <button className="link-btn" onClick={() => void leaveOrRemove(m.userId, m.username)}>
                        {m.userId === user.id ? '退出' : detail.ownerId === user.id ? '移除' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="form-grid">
                  <label>
                    邀请成员（输入对方用户名）
                    <span className="invite-row">
                      <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="对方用户名" />
                      <IButton onClick={() => void inviteMember()}>邀请</IButton>
                    </span>
                  </label>
                </div>
                {detail.ownerId === user.id && (
                  <div className="row-gap">
                    <IButton islandType="ghost" onClick={() => void dissolve()}>
                      解散团队
                    </IButton>
                  </div>
                )}
              </ICard>
              <ICard>
                <h3>团队 Mod（{mods?.total ?? 0}）</h3>
                {!mods && <p className="muted">加载中…</p>}
                {mods && mods.items.length === 0 && (
                  <p className="muted">
                    团队空间还空着，<Link to="/upload">去上传第一个 Mod</Link>（上传时选择「团队空间」即可）。
                  </p>
                )}
                {mods && (
                  <ul className="member-list">
                    {mods.items.map((m) => (
                      <li key={m.id}>
                        <Link to={`/mods/${m.id}`}>{m.title}</Link>
                        <span className="muted">
                          {m.visibility === 'public' ? '🌍' : '👥'} {formatBytes(m.fileSize)} ⬇{m.downloadCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ICard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
