import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Pagination,
  Panel,
  PixelIcon,
  PixelSprite,
  Skeleton,
  TextField,
  useToast,
} from '@pixelvale/ui';
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
import { useConfirm } from '../components/Feedback';
import { CategoryBadge, ModMeta, VisibilityBadge } from '../components/ModBits';
import { PageHeading } from '../components/PageHeading';
import { TextArea } from '../components/TextArea';
import { useAuth } from '../context/AuthContext';
import {
  formatDate,
  type ModRecord,
  type PagedResult,
  type TeamDetail,
  type TeamRecord,
} from '../types';

const PAGE_SIZE = 12;

export function TeamPage(): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [activeId, setActiveId] = useState('');
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [mods, setMods] = useState<PagedResult<ModRecord> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKey, setDetailKey] = useState(0);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyMember, setBusyMember] = useState('');

  const loadTeams = useCallback(async (preferredId?: string): Promise<void> => {
    setTeamsLoading(true);
    try {
      const list = await apiMyTeams();
      setTeams(list);
      setActiveId((current) => {
        const candidate = preferredId ?? current;
        if (candidate && list.some((team) => team.id === candidate)) return candidate;
        return list[0]?.id ?? '';
      });
      if (list.length === 0) {
        setDetail(null);
        setMods(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '团队列表加载失败');
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadTeams();
  }, [user, loadTeams]);

  useEffect(() => {
    if (!activeId) return;
    // Clear the previous team while the newly selected one is loading. Page
    // changes keep the header visible, so only activeId clears it.
    setDetail(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      setMods(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setErr('');
    setMods(null);
    Promise.all([apiTeamDetail(activeId), apiTeamMods(activeId, page, PAGE_SIZE)])
      .then(([teamDetail, teamMods]) => {
        if (cancelled) return;
        setDetail(teamDetail);
        setMods(teamMods);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, page, detailKey]);

  if (!user) {
    return (
      <div className="page-stack">
        <PageHeading eyebrow="团队手帖" title="团队空间" description="和伙伴一起整理、共享 Mod。" />
        <Panel>
          <div className="upload-login-empty">
            <PixelSprite name="strawberry" size={56} />
            <h2>先登录，再创建团队手帖</h2>
            <p>登录后可以创建团队、邀请成员，共享 10GB 团队空间。</p>
            <Link to="/auth" className="pv-btn pv-btn--primary pv-btn--lg">
              去登录 / 注册
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const selectTeam = (teamId: string): void => {
    if (teamId === activeId) return;
    setActiveId(teamId);
    setPage(1);
  };

  const createTeam = async (): Promise<void> => {
    setErr('');
    if (name.trim().length < 2) {
      setErr('团队名至少 2 个字符');
      return;
    }
    setCreating(true);
    try {
      const team = await apiCreateTeam(name.trim(), desc.trim());
      setName('');
      setDesc('');
      await loadTeams(team.id);
      setActiveId(team.id);
      setPage(1);
      toast({
        variant: 'success',
        title: `团队「${team.name}」创建成功`,
        description: '现在可以邀请成员，或上传团队 Mod。',
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: '创建团队失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    } finally {
      setCreating(false);
    }
  };

  const inviteMember = async (): Promise<void> => {
    setErr('');
    if (!activeId || !invite.trim()) return;
    setInviting(true);
    try {
      const result = await apiInviteMember(activeId, invite.trim());
      setInvite('');
      const fresh = await apiTeamDetail(activeId);
      setDetail(fresh);
      toast({
        variant: 'success',
        title: '邀请成功',
        description: `${result.username} 已加入团队。`,
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: '邀请失败',
        description: e instanceof Error ? e.message : '请确认对方用户名',
      });
    } finally {
      setInviting(false);
    }
  };

  const leaveOrRemove = async (userId: string, username: string): Promise<void> => {
    if (!activeId) return;
    const self = userId === user.id;
    const ok = await confirm({
      title: self ? '退出这个团队？' : `移除成员 ${username}？`,
      description: self
        ? '退出后将无法查看团队 Mod。你上传到团队的内容仍会保留。'
        : `${username} 将无法再查看团队空间与团队 Mod。`,
      confirmLabel: self ? '退出团队' : '移除成员',
      destructive: true,
    });
    if (!ok) return;
    setBusyMember(userId);
    try {
      await apiRemoveMember(activeId, userId);
      if (self) {
        setPage(1);
        await loadTeams();
        toast({ variant: 'info', title: '已退出团队' });
      } else {
        const fresh = await apiTeamDetail(activeId);
        setDetail(fresh);
        toast({ variant: 'success', title: '已移除成员', description: username });
      }
    } catch (e) {
      toast({
        variant: 'error',
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    } finally {
      setBusyMember('');
    }
  };

  const dissolve = async (): Promise<void> => {
    if (!activeId || !detail) return;
    const ok = await confirm({
      title: `解散团队「${detail.name}」？`,
      description: (
        <div className="confirm-copy">
          <p>团队下所有 Mod 文件都会被删除，成员将失去访问权限。</p>
          <p>这个操作不可恢复。</p>
        </div>
      ),
      confirmLabel: '解散团队',
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await apiDeleteTeam(activeId);
      toast({
        variant: 'success',
        title: '团队已解散',
        description: `一并删除 ${result.removedMods} 个团队 Mod。`,
      });
      setActiveId('');
      setDetail(null);
      setMods(null);
      setPage(1);
      await loadTeams();
    } catch (e) {
      toast({
        variant: 'error',
        title: '解散失败',
        description: e instanceof Error ? e.message : '请稍后再试',
      });
    }
  };

  const totalPages = mods ? Math.max(1, Math.ceil(mods.total / PAGE_SIZE)) : 1;

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="团队手帖"
        title="团队空间"
        description="创建团队、邀请伙伴，共享 10GB 团队谷仓。团队 Mod 默认只对成员可见，也可以公开。"
        actions={
          <Link to="/upload" className="pv-btn pv-btn--primary">
            <PixelIcon name="upload" size={16} />
            <span className="pv-btn__label">上传团队 Mod</span>
          </Link>
        }
      />

      {err ? (
        <Alert variant="error" title="出了点问题" dismissible onDismiss={() => setErr('')}>
          {err}
        </Alert>
      ) : null}

      <div className="team-grid">
        <div className="team-column">
          <Panel
            title="我的团队"
            subtitle={`${teams.length} 个团队`}
            icon={<PixelIcon name="heart" size={18} />}
            headingLevel={2}
          >
            {teamsLoading ? (
              <div className="team-list" aria-busy="true" aria-label="正在加载团队">
                <Skeleton lines={2} />
                <Skeleton lines={2} />
              </div>
            ) : teams.length === 0 ? (
              <EmptyState
                size="sm"
                title="还没有加入团队"
                description="在下面创建一个团队，或让伙伴邀请你。"
                illustration={<PixelIcon name="heart" size={28} />}
              />
            ) : (
              <div className="team-list">
                {teams.map((team) => {
                  const active = team.id === activeId;
                  const owner = team.ownerId === user.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={`team-item${active ? ' team-item--active' : ''}`}
                      aria-pressed={active}
                      onClick={() => selectTeam(team.id)}
                    >
                      <span className="team-item__mark" aria-hidden="true">
                        <PixelSprite name={owner ? 'pumpkin' : 'strawberry'} size={22} />
                      </span>
                      <span className="team-item__body">
                        <strong>{team.name}</strong>
                        <span>
                          {team.ownerName} 创建 · {owner ? '创建者' : '成员'}
                        </span>
                      </span>
                      <PixelIcon name="chevron-right" size={14} />
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="创建新团队"
            subtitle="团队空间共享 10GB"
            icon={<PixelIcon name="sparkle" size={18} />}
            headingLevel={2}
          >
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void createTeam();
              }}
            >
              <TextField
                label="团队名"
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="如：农场美化小队"
                hint="2-40 个字符，团队内唯一。"
              />
              <TextArea
                label="团队介绍"
                value={desc}
                maxLength={500}
                rows={3}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="这个团队主要整理哪类 Mod？"
                hint={`${desc.length} / 500`}
              />
              <Button type="submit" variant="primary" loading={creating} disabled={creating}>
                创建团队
              </Button>
            </form>
          </Panel>
        </div>

        <div className="team-column">
          {!activeId && !teamsLoading ? (
            <Panel>
              <EmptyState
                title="选择或创建一个团队"
                description="创建后可以邀请成员、上传团队 Mod，并在这里查看团队手帖。"
                illustration={<PixelSprite name="coin" size={40} />}
              />
            </Panel>
          ) : null}

          {activeId && detailLoading && !detail ? (
            <Panel title="团队详情" headingLevel={2}>
              <Skeleton lines={4} />
            </Panel>
          ) : null}

          {activeId && !detail && !detailLoading ? (
            <Panel>
              <EmptyState
                title="暂时无法打开这个团队"
                description={err || '可能是网络中断，或你已经不在该团队中。'}
                illustration={<PixelSprite name="stone" size={40} />}
                action={
                  <Button
                    onClick={() => {
                      setErr('');
                      setDetailKey((value) => value + 1);
                    }}
                  >
                    重新加载
                  </Button>
                }
              />
            </Panel>
          ) : null}

          {detail ? (
            <>
              <Panel
                title={detail.name}
                subtitle={`${detail.ownerName} 创建 · 创建于 ${formatDate(detail.createdAt)}`}
                icon={<PixelSprite name="pumpkin" size={22} />}
                headingLevel={2}
                actions={<Badge variant="info">{detail.members.length} 位成员</Badge>}
              >
                <p className="team-desc">{detail.description || '这个团队还没有写下介绍。'}</p>

                <ul className="member-list">
                  {detail.members.map((member) => {
                    const self = member.userId === user.id;
                    const canOperate =
                      member.role !== 'owner' && (self || detail.ownerId === user.id);
                    return (
                      <li className="member-row" key={member.userId}>
                        <Avatar name={member.username} size="sm" />
                        <span className="member-row__name">
                          {member.username}
                          {self ? <span className="member-row__self">（你）</span> : null}
                        </span>
                        <Badge variant={member.role === 'owner' ? 'gold' : 'default'}>
                          {member.role === 'owner' ? '创建者' : '成员'}
                        </Badge>
                        {canOperate ? (
                          <Button
                            size="sm"
                            variant={self ? 'ghost' : 'danger'}
                            disabled={busyMember === member.userId}
                            onClick={() => void leaveOrRemove(member.userId, member.username)}
                          >
                            {self ? '退出' : '移除'}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <form
                  className="invite-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void inviteMember();
                  }}
                >
                  <TextField
                    label="邀请成员"
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                    placeholder="输入对方用户名"
                    hint="对方需要先注册账号。"
                  />
                  <Button
                    type="submit"
                    variant="gold"
                    loading={inviting}
                    disabled={inviting || invite.trim().length === 0}
                  >
                    发送邀请
                  </Button>
                </form>

                {detail.ownerId === user.id ? (
                  <div className="danger-zone">
                    <div>
                      <strong>解散团队</strong>
                      <p>删除团队及其下所有 Mod 文件，不可恢复。</p>
                    </div>
                    <Button variant="danger" onClick={() => void dissolve()}>
                      解散团队
                    </Button>
                  </div>
                ) : null}
              </Panel>

              <Panel
                title="团队 Mod"
                subtitle={mods ? `共 ${mods.total} 份` : '正在整理…'}
                icon={<PixelIcon name="file" size={18} />}
                headingLevel={2}
              >
                {!mods && detailLoading ? <Skeleton lines={3} /> : null}
                {mods && mods.items.length === 0 ? (
                  <EmptyState
                    size="sm"
                    title="团队谷仓还是空的"
                    description="上传时选择「团队空间」，Mod 就会出现在这里。"
                    action={
                      <Link to="/upload" className="pv-btn pv-btn--primary pv-btn--sm">
                        去上传
                      </Link>
                    }
                  />
                ) : null}
                {mods && mods.items.length > 0 ? (
                  <div className="team-mod-list">
                    {mods.items.map((mod) => (
                      <Link to={`/mods/${mod.id}`} className="team-mod-row" key={mod.id}>
                        <div className="team-mod-row__head">
                          <strong>{mod.title}</strong>
                          <div className="team-mod-row__badges">
                            <CategoryBadge category={mod.category} />
                            <VisibilityBadge visibility={mod.visibility} teamName={mod.teamName} />
                          </div>
                        </div>
                        <ModMeta mod={mod} />
                      </Link>
                    ))}
                  </div>
                ) : null}
                {mods && totalPages > 1 ? (
                  <div className="pager-row">
                    <span className="pager-row__info">
                      第 {page} / {totalPages} 页
                    </span>
                    <Pagination
                      page={page}
                      pageCount={totalPages}
                      onPageChange={setPage}
                      size="sm"
                      label="团队 Mod 分页"
                    />
                  </div>
                ) : null}
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
