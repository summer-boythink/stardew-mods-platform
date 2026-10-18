import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/auth';

export interface AuthedUser {
  id: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/** 可选鉴权：有 token 则解析，无 token 也不报错（用于公开列表带上本人信息） */
export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, username: payload.username };
  } catch {
    // token 失效时视为游客，不阻断公开访问
  }
  next();
}
