import fs from 'node:fs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  attachImportSource,
  downloadImportFile,
  getImportProviders,
  prepareDownload,
  resolveImport,
} from '../services/modImport';
import { quotaLimit } from '../services/storageService';
import type { ModSource } from '../types';
import { signToken } from '../utils/auth';
import { HttpError } from '../utils/errors';

const router = Router();

const resolveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  message: { error: '链接解析过于频繁，请稍后再试' },
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  message: { error: '自动导入过于频繁，请稍后再试' },
});

const resolveSchema = z.object({
  url: z.string().trim().min(1).max(1000),
});

const importSchema = z.object({
  url: z.string().trim().min(1).max(1000),
  scope: z.enum(['personal', 'team', 'public']).default('personal'),
  teamId: z.string().trim().max(64).nullish(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  title: z.string().trim().max(120).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().trim().max(40).optional(),
  tags: z.union([z.string().max(600), z.array(z.string().max(40)).max(12)]).optional(),
  split: z.boolean().optional(),
  overwrite: z.boolean().optional(),
  overwriteIds: z.array(z.string().max(64)).max(200).optional(),
});

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '参数错误');
  }
  return parsed.data;
}

/** Provider availability is public: it only reveals whether keys are configured. */
router.get('/providers', (_req, res) => {
  res.json({ providers: getImportProviders() });
});

router.post(
  '/resolve',
  resolveLimiter,
  authRequired,
  asyncHandler(async (req, res) => {
    const fields = parseBody(resolveSchema, req.body);
    const preview = await resolveImport(fields.url);
    res.json({ preview });
  }),
);

/**
 * Download from the provider, then reuse the existing `/api/mods/upload`
 * endpoint over loopback. This keeps dedupe, quota, overwrite, split, parser,
 * preview extraction and storage behavior identical to a manual upload.
 */
router.post(
  '/',
  importLimiter,
  authRequired,
  asyncHandler(async (req, res) => {
    const fields = parseBody(importSchema, req.body);
    const user = req.user;
    if (!user) throw new HttpError(401, '请先登录');

    // Auto-import is a download/storage convenience, not a redistribution
    // channel. Public sharing requires a manual upload and author permission.
    if (fields.scope === 'public' || fields.visibility === 'public') {
      throw new HttpError(
        403,
        '自动导入仅支持个人/团队私有存储；公开分享请确认作者授权后使用「上传文件」',
      );
    }

    const db = getDb();
    let teamId = fields.teamId?.trim() || null;
    let billing: 'personal' | 'team' = 'personal';

    if (fields.scope === 'team') {
      if (!teamId) throw new HttpError(400, '团队存储需要选择团队');
      const team = db.getTeam(teamId);
      if (!team) throw new HttpError(404, '团队不存在');
      if (!db.isMember(teamId, user.id)) throw new HttpError(403, '仅团队成员可导入到团队空间');
      billing = 'team';
    } else {
      teamId = null;
      billing = 'personal';
    }

    // Resolve before downloading so metadata and permission errors are cheap.
    const preview = await resolveImport(fields.url);
    if (!preview.downloadable) {
      throw new HttpError(503, preview.reason || '这个来源当前不可自动下载');
    }

    const limit = quotaLimit(billing);
    if (preview.fileSize > 0) {
      const usage = db.usageOf(billing, user.id, teamId);
      if (usage.bytes + preview.fileSize > limit) {
        throw new HttpError(
          413,
          `空间不足：已用 ${Math.round(usage.bytes / 1048576)}MB / 上限 ${Math.round(limit / 1073741824)}GB`,
        );
      }
    }

    const plan = await prepareDownload(preview);
    const downloaded = await downloadImportFile(plan);

    try {
      const form = new FormData();
      form.append('files', Bun.file(downloaded.filePath) as unknown as Blob, downloaded.fileName);
      form.append('relativePaths', JSON.stringify([downloaded.fileName]));
      form.append('scope', fields.scope);
      if (teamId) form.append('teamId', teamId);
      if (fields.visibility) form.append('visibility', fields.visibility);
      if (fields.title) form.append('title', fields.title);
      if (fields.description) form.append('description', fields.description);
      if (fields.category) form.append('category', fields.category);
      if (fields.tags) {
        form.append('tags', Array.isArray(fields.tags) ? fields.tags.join(',') : fields.tags);
      }
      form.append('split', fields.split ? '1' : '0');
      if (fields.overwrite) form.append('overwrite', '1');
      if (fields.overwriteIds && fields.overwriteIds.length > 0) {
        form.append('overwriteIds', JSON.stringify(fields.overwriteIds.slice(0, 200)));
      }

      const token = signToken(user.id, user.username);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), config.importUploadTimeoutMs);
      let uploadRes: Response;
      try {
        uploadRes = await fetch(`http://127.0.0.1:${config.port}/api/mods/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-internal-import': config.importInternalToken,
          },
          body: form,
          signal: abort.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new HttpError(504, '下载完成，但保存到存储服务超时，请稍后重试');
        }
        throw new HttpError(502, '下载完成，但保存到存储服务失败，请稍后重试');
      } finally {
        clearTimeout(timer);
      }

      const raw = await uploadRes.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        /* non-JSON error */
      }
      if (!uploadRes.ok) {
        throw new HttpError(
          uploadRes.status,
          typeof body.error === 'string' ? body.error : `导入保存失败（${uploadRes.status}）`,
          {
            ...(typeof body.existingId === 'string' ? { existingId: body.existingId } : {}),
            ...(typeof body.canOverwrite === 'boolean' ? { canOverwrite: body.canOverwrite } : {}),
          },
        );
      }

      const source: ModSource = {
        provider: preview.provider,
        url: preview.sourceUrl,
        modId: preview.modId,
        fileId: preview.fileId,
        fileVersionId: preview.fileVersionId,
      };
      body = attachImportSource(db, body, source);

      res.status(uploadRes.status).json(body);
    } finally {
      try {
        fs.rmSync(downloaded.directory, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }),
);

export default router;
