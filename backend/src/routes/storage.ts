import { Router } from 'express';
import { config, dbFile } from '../config';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { quotaLimit, usageOf } from '../services/storageService';
import { formatBytes } from '../types';

const router = Router();

router.use(authRequired);

/** 我的配额：个人空间 + 我加入的所有团队空间 */
router.get('/quota', (req, res) => {
  const db = getDb(dbFile());
  const userId = req.user?.id as string;
  const data = db.read();
  const personal = usageOf(data, 'personal', userId, null);
  const myMembers = data.members.filter((m) => m.userId === userId);
  const teams = myMembers
    .map((m) => {
      const team = data.teams.find((t) => t.id === m.teamId);
      if (!team) return null;
      const u = usageOf(data, 'team', userId, team.id);
      return {
        scope: 'team' as const,
        teamId: team.id,
        teamName: team.name,
        usedBytes: u.bytes,
        usedHuman: formatBytes(u.bytes),
        limitBytes: quotaLimit('team'),
        limitHuman: formatBytes(quotaLimit('team')),
        modCount: u.count,
        role: m.role,
      };
    })
    .filter(Boolean);
  res.json({
    personal: {
      scope: 'personal' as const,
      teamId: null,
      teamName: null,
      usedBytes: personal.bytes,
      usedHuman: formatBytes(personal.bytes),
      limitBytes: quotaLimit('personal'),
      limitHuman: formatBytes(quotaLimit('personal')),
      modCount: personal.count,
    },
    teams,
    serverLimits: {
      maxUploadBytes: config.maxUploadBytes,
      maxUploadHuman: formatBytes(config.maxUploadBytes),
    },
  });
});

export default router;
