import { Router, type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbFile } from '../config';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { captchaFailureMessage, issueCaptcha, verifyCaptcha } from '../services/captchaService';
import { hashPassword, signToken, verifyPassword } from '../utils/auth';
import { checkLimits, clearFails, loginMaxFails, recordFail } from '../utils/attempts';
import { loginSchema, registerSchema } from '../utils/validation';

const router = Router();

/** 登录失败计数 key：IP 维度 + 账号维度（双重防爆破，任一超限即锁） */
function loginKeys(ip: string, username: string): [string, string] {
  return [`login:ip:${ip}`, `login:acct:${username.trim().toLowerCase()}`];
}

function clientIp(req: Request): string {
  return req.ip ?? 'unknown';
}

/** 图形验证码：前端 Auth 页展示，提交时带回 captchaId + captcha */
router.get('/captcha', (_req, res) => {
  res.json(issueCaptcha());
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
      return;
    }
    const { username, password, captchaId, captcha } = parsed.data;

    // 先验验证码（失败不计数，避免正常用户被误伤；验证码一次性，用过即焚）
    const captchaCheck = verifyCaptcha(captchaId, captcha);
    if (!captchaCheck.ok) {
      res.status(400).json({ error: captchaFailureMessage(captchaCheck.reason) });
      return;
    }

    // 注册防批量：同 IP 每小时最多成功注册 10 个账号
    const regKey = `register:ip:${clientIp(req)}`;
    const regLimit = checkLimits([regKey], 10);
    if (regLimit.locked) {
      res.status(429).json({ error: '当前网络注册过于频繁，请稍后再试', retryAfter: regLimit.retryAfterSec });
      return;
    }

    const db = getDb(dbFile());
    // 快速失败路径（避免无谓的 bcrypt 开销）
    if (db.read().users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({ error: '用户名已存在' });
      return;
    }
    const passwordHash = await hashPassword(password);
    const user = { id: uuidv4(), username, passwordHash, createdAt: new Date().toISOString() };

    // 原子写入：查重与 push 在同一个同步 mutate 内完成，防止并发注册产生同名账号
    const created = await db.mutate((d) => {
      if (d.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return false;
      d.users.push(user);
      return true;
    });
    if (!created) {
      res.status(409).json({ error: '用户名已存在' });
      return;
    }
    // 成功注册才计入 IP 配额（配合上方 checkLimits，实现 10 个/小时/IP）
    recordFail(regKey);
    const token = signToken(user.id, user.username);
    res.status(201).json({ token, user: { id: user.id, username: user.username } });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
      return;
    }
    const { username, password, captchaId, captcha } = parsed.data;
    const maxFails = loginMaxFails();
    const keys = loginKeys(clientIp(req), username);

    // 1. 先查锁定：被锁直接 429，不再验密码（防爆破的核心）
    const preCheck = checkLimits(keys, maxFails);
    if (preCheck.locked) {
      res.status(429).json({
        error: '登录失败次数过多，请 1 小时后再试',
        retryAfter: preCheck.retryAfterSec,
      });
      return;
    }

    // 2. 再验图形验证码（失败不计入登录次数，但验证码一次性，用过即焚）
    const captchaCheck = verifyCaptcha(captchaId, captcha);
    if (!captchaCheck.ok) {
      res.status(400).json({ error: captchaFailureMessage(captchaCheck.reason) });
      return;
    }

    // 3. 验账号密码（统一提示，不泄露账号是否存在）
    const db = getDb(dbFile());
    const user = db.read().users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      for (const k of keys) recordFail(k);
      const after = checkLimits(keys, maxFails);
      if (after.locked) {
        res.status(429).json({
          error: '登录失败次数过多，请 1 小时后再试',
          retryAfter: after.retryAfterSec,
        });
        return;
      }
      res.status(401).json({
        error: `用户名或密码错误（本小时还剩 ${after.remaining} 次尝试机会）`,
        remaining: after.remaining,
      });
      return;
    }

    // 4. 成功：清零双维度计数，洗白
    for (const k of keys) clearFails(k);
    const token = signToken(user.id, user.username);
    res.json({ token, user: { id: user.id, username: user.username } });
  }),
);

router.get('/me', authRequired, (req, res) => {
  const db = getDb(dbFile());
  const user = db.read().users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(401).json({ error: '用户不存在' });
    return;
  }
  res.json({ id: user.id, username: user.username, createdAt: user.createdAt });
});

export default router;
