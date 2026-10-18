import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { removeModStorage } from '../services/storageService';
import { createTeamSchema, usernameSchema } from '../utils/validation';

const router = Router();

router.use(authRequired);

/** 创建团队：创建者自动成为 owner */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
      return;
    }
    const db = getDb();
    const userId = req.user?.id as string;
    const username = req.user?.username as string;
    const now = new Date().toISOString();
    const team = {
      id: uuidv4(),
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      ownerId: userId,
      ownerName: username,
      createdAt: now,
    };
    db.createTeam(team, { teamId: team.id, userId, username, joinedAt: now, role: 'owner' });
    res.status(201).json(team);
  }),
);

/** 我加入的团队 */
router.get('/mine', (req, res) => {
  const teams = getDb().listTeamsForUser(req.user?.id as string);
  res.json(teams);
});

/** 团队详情（含成员） */
router.get('/:id', (req, res) => {
  const db = getDb();
  const team = db.getTeam(req.params.id);
  if (!team) {
    res.status(404).json({ error: '团队不存在' });
    return;
  }
  if (!db.isMember(team.id, req.user?.id as string)) {
    res.status(403).json({ error: '仅团队成员可查看' });
    return;
  }
  res.json({ ...team, members: db.listMembers(team.id) });
});

/** 邀请成员：通过用户名添加（简化版，适合朋友间分享） */
router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const nameParsed = usernameSchema.safeParse(req.body?.username);
    if (!nameParsed.success) {
      res.status(400).json({ error: '请提供正确的用户名' });
      return;
    }
    const db = getDb();
    const team = db.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: '团队不存在' });
      return;
    }
    const userId = req.user?.id as string;
    if (!db.isMember(team.id, userId)) {
      res.status(403).json({ error: '仅团队成员可邀请' });
      return;
    }
    const target = db.findUserByUsername(nameParsed.data);
    if (!target) {
      res.status(404).json({ error: '该用户不存在，请先注册' });
      return;
    }
    // 复合主键 + INSERT OR IGNORE：并发重复邀请不可能成功
    const added = db.addMember({
      teamId: team.id,
      userId: target.id,
      username: target.username,
      joinedAt: new Date().toISOString(),
      role: 'member',
    });
    if (!added) {
      res.status(409).json({ error: '该用户已在团队中' });
      return;
    }
    res.status(201).json({ teamId: team.id, userId: target.id, username: target.username });
  }),
);

/** 移除成员 / 退出团队 */
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const team = db.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: '团队不存在' });
      return;
    }
    const myId = req.user?.id as string;
    const targetId = req.params.userId;
    // 允许：队长移除任何人；成员自己退出
    if (team.ownerId !== myId && targetId !== myId) {
      res.status(403).json({ error: '无权限' });
      return;
    }
    if (targetId === team.ownerId) {
      res.status(400).json({ error: '不能移除团队创建者，请先解散团队' });
      return;
    }
    db.removeMember(team.id, targetId);
    res.json({ ok: true });
  }),
);

/** 解散团队（仅创建者，且团队下 Mod 会一并删除） */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const team = db.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: '团队不存在' });
      return;
    }
    if (team.ownerId !== req.user?.id) {
      res.status(403).json({ error: '仅创建者可解散团队' });
      return;
    }
    // 事务内级联删除记录，随后清理物理文件（失败不阻断响应）
    const removedModIds = db.deleteTeamCascade(team.id);
    for (const id of removedModIds) {
      try {
        removeModStorage(id);
      } catch {
        /* ignore */
      }
    }
    res.json({ ok: true, removedMods: removedModIds.length });
  }),
);

export default router;
