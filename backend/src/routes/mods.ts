import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { config, dbFile, tmpDir } from '../config';
import { getDb } from '../db';
import { authOptional, authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { analyzeStagedUpload, type StagedFile } from '../services/modParser';
import {
  modStoragePath,
  newModId,
  persistFolderAsZip,
  persistOriginalFile,
  persistPreviews,
  previewAbsPath,
  quotaLimit,
  removeModStorage,
  usageOf,
} from '../services/storageService';
import type { ModCategory, ModRecord, ModVisibility, StorageScope } from '../types';
import { MOD_CATEGORIES } from '../types';
import { clampPage, clampPageSize, parseTags, updateModSchema, uploadFieldsSchema } from '../utils/validation';
import { contentDisposition, slugify } from '../utils/text';

const router = Router();

const upload = multer({
  dest: tmpDir(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 2000,
    fields: 30,
  },
});

function canViewMod(mod: ModRecord, userId?: string, isMember = false): boolean {
  if (mod.visibility === 'public') return true;
  if (!userId) return false;
  if (mod.ownerId === userId) return true;
  if (mod.visibility === 'team' && mod.teamId && isMember) return true;
  return false;
}

/**
 * 上传 Mod（核心接口）
 * multipart 字段：
 * - files / file: 文件（单个 zip / 单个 mod / 文件夹多文件）
 * - relativePaths: JSON 数组，与文件顺序对齐（文件夹上传时为 webkitRelativePath）
 * - scope: personal | team | public
 * - teamId?: 团队 id（scope=team 时必填）
 * - visibility?: private | team | public（不传按 scope 给默认）
 * - title/description/category/tags?: 用户覆盖自动整理结果
 */
router.post(
  '/upload',
  authRequired,
  // multer 自带类型与 express 4/5 混装时可能出现 RequestHandler 重载不匹配，运行时无影响，这里转 any 隔离
  upload.array('files', 2000) as unknown as import('express').RequestHandler,
  asyncHandler(async (req, res) => {
  const workRoot = path.join(tmpDir(), `work-${uuidv4()}`);
  let stagedTmp: string[] = [];
  try {
    const fieldsParsed = uploadFieldsSchema.safeParse(req.body);
    if (!fieldsParsed.success) {
      res.status(400).json({ error: fieldsParsed.error.issues[0]?.message ?? '参数错误' });
      return;
    }
    const fields = fieldsParsed.data;
    let files = (req.files ?? []) as Express.Multer.File[];
    // 兼容字段名为 file 的单文件上传
    if (files.length === 0 && (req as unknown as { file?: Express.Multer.File }).file) {
      files = [(req as unknown as { file?: Express.Multer.File }).file as Express.Multer.File];
    }
    if (files.length === 0) {
      res.status(400).json({ error: '请选择要上传的文件（支持单个 Mod、.zip 压缩包或整个文件夹）' });
      return;
    }

    let relPaths: string[] = [];
    try {
      const raw = (req.body?.relativePaths as string | undefined) ?? '';
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) relPaths = arr.map((s) => String(s));
      }
    } catch {
      relPaths = [];
    }

    const staged: StagedFile[] = files.map((f, i) => ({
      absPath: f.path,
      relativePath: (relPaths[i] || f.originalname || `file-${i}`).replace(/\\/g, '/'),
      size: f.size,
    }));
    stagedTmp = staged.map((s) => s.absPath);

    const userId = req.user?.id as string;
    const username = req.user?.username as string;
    const db = getDb(dbFile());
    const data = db.read();

    // ---- 作用域与可见性归一化 ----
    let scope: StorageScope = fields.scope;
    let teamId: string | null = fields.teamId ? fields.teamId : null;
    let teamName: string | null = null;
    let visibility: ModVisibility;
    if (scope === 'team') {
      if (!teamId) {
        res.status(400).json({ error: '团队存储需要选择团队' });
        return;
      }
      const team = data.teams.find((t) => t.id === teamId);
      if (!team) {
        res.status(404).json({ error: '团队不存在' });
        return;
      }
      const member = data.members.some((m) => m.teamId === teamId && m.userId === userId);
      if (!member) {
        res.status(403).json({ error: '仅团队成员可上传到团队空间' });
        return;
      }
      teamName = team.name;
      visibility = fields.visibility === 'public' ? 'public' : 'team';
    } else if (scope === 'public') {
      if (teamId) {
        const team = data.teams.find((t) => t.id === teamId);
        if (!team) {
          res.status(404).json({ error: '团队不存在' });
          return;
        }
        const member = data.members.some((m) => m.teamId === teamId && m.userId === userId);
        if (!member) {
          res.status(403).json({ error: '仅团队成员可使用该团队名义发布' });
          return;
        }
        teamName = team.name;
      } else {
        teamId = null;
      }
      visibility = 'public';
    } else {
      scope = 'personal';
      teamId = null;
      visibility = fields.visibility === 'public' ? 'public' : 'private';
    }

    // ---- 配额预检（用待上传总和估算）----
    const billing: 'personal' | 'team' = teamId ? 'team' : 'personal';
    const limit = quotaLimit(billing);
    const used = usageOf(data, billing, userId, teamId);
    const stagedTotal = staged.reduce((s, f) => s + f.size, 0);
    if (stagedTotal <= 0) {
      res.status(400).json({ error: '上传文件为空' });
      return;
    }
    if (used.bytes + stagedTotal > limit) {
      res.status(413).json({ error: `空间不足：已用 ${Math.round(used.bytes / 1048576)}MB / 上限 ${Math.round(limit / 1073741824)}GB` });
      return;
    }

    // ---- 自动整理：解析 manifest / 分类 / 文件树 ----
    let analyzed;
    try {
      analyzed = analyzeStagedUpload(staged, workRoot);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : '解析上传内容失败' });
      return;
    }
    if (analyzed.fileCount === 0) {
      res.status(400).json({ error: '未发现有效文件（压缩包可能为空或路径非法）' });
      return;
    }

    // ---- 去重：同一计费空间下 UniqueID 冲突则拒绝 ----
    const incomingIds = analyzed.subMods.map((m) => m.uniqueId.trim().toLowerCase()).filter(Boolean);
    if (incomingIds.length > 0) {
      const dup = data.mods.find((m) => {
        const sameBilling = teamId ? m.teamId === teamId : !m.teamId && m.ownerId === userId;
        if (!sameBilling) return false;
        const existingIds = m.subMods.map((s) => (s.uniqueId || '').toLowerCase()).filter(Boolean);
        return incomingIds.some((id) => existingIds.includes(id));
      });
      if (dup) {
        res.status(409).json({ error: `该 Mod 已存在（${dup.title}），请勿重复上传`, existingId: dup.id });
        return;
      }
    }

    const title = (fields.title || analyzed.suggestedTitle || '未命名Mod').slice(0, 120);
    const description = (fields.description || analyzed.suggestedDescription || '').slice(0, 2000);
    const category: ModCategory =
      (fields.category as ModCategory | undefined) && (MOD_CATEGORIES as string[]).includes(fields.category as string)
        ? (fields.category as ModCategory)
        : analyzed.suggestedCategory;
    const userTags = parseTags(fields.tags);
    const tags = Array.from(new Set([...userTags, ...analyzed.suggestedTags])).slice(0, 12);

    const modId = newModId();
    let storedFileName: string;
    let fileSize: number;
    if (staged.length === 1) {
      // 单个 zip 或单个 Mod 文件：原样存储（下载即原文件）
      const r = persistOriginalFile(modId, staged[0].absPath, path.basename(staged[0].relativePath));
      storedFileName = r.storedFileName;
      fileSize = r.fileSize;
    } else {
      // 文件夹多文件：打包为 archive.zip 供一键下载
      const r = persistFolderAsZip(modId, analyzed.workDir);
      storedFileName = r.storedFileName;
      fileSize = r.fileSize;
    }

    const previewImages = persistPreviews(modId, analyzed.workDir, analyzed.previewImages);

    const now = new Date().toISOString();
    const record: ModRecord = {
      id: modId,
      slug: `${slugify(title)}-${modId.slice(0, 8)}`,
      title,
      description,
      category,
      tags,
      scope,
      visibility,
      ownerId: userId,
      ownerName: username,
      teamId,
      teamName,
      subMods: analyzed.subMods,
      fileName: storedFileName,
      fileSize,
      fileCount: analyzed.fileCount,
      fileTree: analyzed.fileTree,
      previewImages,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    // 原子复核：去重 + 配额 + 写入在同一个同步 mutate 内完成，
    // 避免并发上传绕过预检查（预检查仅用于提前给出友好错误）
    const outcome = await db.mutate((d): { kind: 'ok' } | { kind: 'dup'; id: string; title: string } | { kind: 'quota' } => {
      const currentUsage = usageOf(d, billing, userId, teamId);
      if (currentUsage.bytes + fileSize > limit) return { kind: 'quota' };
      if (incomingIds.length > 0) {
        const existing = d.mods.find((m) => {
          const sameBilling = teamId ? m.teamId === teamId : !m.teamId && m.ownerId === userId;
          if (!sameBilling) return false;
          const existingIds = m.subMods.map((s) => (s.uniqueId || '').toLowerCase()).filter(Boolean);
          return incomingIds.some((sid) => existingIds.includes(sid));
        });
        if (existing) return { kind: 'dup', id: existing.id, title: existing.title };
      }
      d.mods.push(record);
      return { kind: 'ok' };
    });
    if (outcome.kind === 'quota') {
      removeModStorage(modId);
      res.status(413).json({ error: '空间不足，打包后体积超出配额' });
      return;
    }
    if (outcome.kind === 'dup') {
      removeModStorage(modId);
      res.status(409).json({ error: `该 Mod 已存在（${outcome.title}），请勿重复上传`, existingId: outcome.id });
      return;
    }
    res.status(201).json(record);
  } catch (e) {
    // 记完整日志供排查，客户端只给通用文案（避免泄露内部路径）
    console.error('[upload]', e);
    res.status(500).json({ error: '上传失败，请稍后重试' });
  } finally {
    // 清理临时文件（上传 tmp + 分析 workRoot）
    try {
      fs.rmSync(workRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    for (const p of stagedTmp) {
      try {
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  }),
);

/** 公开市场列表 */
router.get('/', authOptional, (req, res) => {
  const db = getDb(dbFile());
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const category = String(req.query.category ?? '').trim();
  const sort = String(req.query.sort ?? 'newest');
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);

  let items = db.read().mods.filter((m) => m.visibility === 'public');
  if (category && (MOD_CATEGORIES as string[]).includes(category)) {
    items = items.filter((m) => m.category === category);
  }
  if (q) {
    items = items.filter((m) => {
      const hay =
        `${m.title}\n${m.description}\n${m.ownerName}\n${m.teamName ?? ''}\n${m.tags.join(' ')}\n${m.subMods.map((s) => `${s.name} ${s.author} ${s.uniqueId}`).join('\n')}`.toLowerCase();
      return q.split(/\s+/).every((kw) => hay.includes(kw));
    });
  }
  if (sort === 'popular') items = [...items].sort((a, b) => b.downloadCount - a.downloadCount);
  else if (sort === 'biggest') items = [...items].sort((a, b) => b.fileSize - a.fileSize);
  else items = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const total = items.length;
  const paged = items.slice((page - 1) * pageSize, page * pageSize).map((m) => ({ ...m, fileTree: [] }));
  res.json({ items: paged, total, page, pageSize });
});

/** 我的上传 */
router.get('/mine', authRequired, (req, res) => {
  const db = getDb(dbFile());
  const userId = req.user?.id as string;
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);
  let items = db.read().mods.filter((m) => m.ownerId === userId);
  if (q) {
    items = items.filter((m) => `${m.title}\n${m.description}\n${m.tags.join(' ')}`.toLowerCase().includes(q));
  }
  items = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const total = items.length;
  res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
});

/** 团队 Mod 列表 */
router.get('/team/:teamId', authRequired, (req, res) => {
  const db = getDb(dbFile());
  const userId = req.user?.id as string;
  const teamId = req.params.teamId;
  const member = db.read().members.some((m) => m.teamId === teamId && m.userId === userId);
  if (!member) {
    res.status(403).json({ error: '仅团队成员可查看' });
    return;
  }
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);
  const items = db
    .read()
    .mods.filter((m) => m.teamId === teamId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const total = items.length;
  res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
});

/** Mod 详情 */
router.get('/:id', authOptional, (req, res) => {
  const db = getDb(dbFile());
  const mod = db.read().mods.find((m) => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id;
  const member = !!(userId && mod.teamId && db.read().members.some((m) => m.teamId === mod.teamId && m.userId === userId));
  if (!canViewMod(mod, userId, member)) {
    res.status(403).json({ error: '无权查看该 Mod' });
    return;
  }
  res.json(mod);
});

/** 编辑 Mod 元信息 */
router.patch(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
  const parsed = updateModSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    return;
  }
  const db = getDb(dbFile());
  const mod = db.read().mods.find((m) => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id as string;
  const team = mod.teamId ? db.read().teams.find((t) => t.id === mod.teamId) : null;
  const isUploader = mod.ownerId === userId;
  const isTeamOwner = !!team && team.ownerId === userId;
  if (!isUploader && !isTeamOwner) {
    res.status(403).json({ error: '仅上传者或团队创建者可编辑' });
    return;
  }
  const patch = parsed.data;
  // 可见性约束：个人空间不可设为 team；团队空间不可设为 private
  if (patch.visibility) {
    if (!mod.teamId && patch.visibility === 'team') {
      res.status(400).json({ error: '个人 Mod 不能设为团队可见' });
      return;
    }
    if (mod.teamId && patch.visibility === 'private') {
      res.status(400).json({ error: '团队 Mod 不能设为私有，请用团队可见' });
      return;
    }
  }
  await db.mutate((d) => {
    const target = d.mods.find((m) => m.id === req.params.id);
    if (!target) return;
    if (patch.title !== undefined) {
      target.title = patch.title;
      target.slug = `${slugify(patch.title)}-${target.id.slice(0, 8)}`;
    }
    if (patch.description !== undefined) target.description = patch.description;
    if (patch.category !== undefined) target.category = patch.category as ModCategory;
    if (patch.tags !== undefined) target.tags = patch.tags.slice(0, 12);
    if (patch.visibility !== undefined) {
      target.visibility = patch.visibility;
      // scope 与 visibility 保持一致语义：public 可见即 public 空间展示
      if (patch.visibility === 'public') target.scope = 'public';
      else if (target.teamId) target.scope = 'team';
      else target.scope = 'personal';
    }
    target.updatedAt = new Date().toISOString();
  });
  const updated = getDb(dbFile()).read().mods.find((m) => m.id === req.params.id);
  res.json(updated);
  }),
);

/** 删除 Mod */
router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
  const db = getDb(dbFile());
  const mod = db.read().mods.find((m) => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id as string;
  const team = mod.teamId ? db.read().teams.find((t) => t.id === mod.teamId) : null;
  const isUploader = mod.ownerId === userId;
  const isTeamOwner = !!team && team.ownerId === userId;
  if (!isUploader && !isTeamOwner) {
    res.status(403).json({ error: '仅上传者或团队创建者可删除' });
    return;
  }
  await db.mutate((d) => {
    d.mods = d.mods.filter((m) => m.id !== req.params.id);
  });
  try {
    removeModStorage(mod.id);
  } catch {
    /* ignore */
  }
  res.json({ ok: true });
  }),
);

/** 下载 Mod 文件 */
router.get(
  '/:id/download',
  authOptional,
  asyncHandler(async (req, res) => {
  const db = getDb(dbFile());
  const mod = db.read().mods.find((m) => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id;
  const member = !!(userId && mod.teamId && db.read().members.some((m) => m.teamId === mod.teamId && m.userId === userId));
  if (!canViewMod(mod, userId, member)) {
    res.status(403).json({ error: '无权下载该 Mod' });
    return;
  }
  const abs = path.join(modStoragePath(mod.id), mod.fileName);
  if (!fs.existsSync(abs)) {
    res.status(410).json({ error: '文件已丢失，请联系上传者' });
    return;
  }
  await db.mutate((d) => {
    const t = d.mods.find((m) => m.id === mod.id);
    if (t) t.downloadCount += 1;
  });
  res.setHeader('Content-Type', mime.lookup(mod.fileName) || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(mod.fileName));
  res.setHeader('Content-Length', String(fs.statSync(abs).size));
  const stream = fs.createReadStream(abs);
  // 读取中出错（如文件被并发删除）不能让 'error' 事件裸奔，否则会变成进程级异常
  stream.on('error', (err) => {
    console.error('[download] stream error', err);
    if (!res.headersSent) res.status(500).json({ error: '读取文件失败' });
    else res.destroy();
  });
  stream.pipe(res);
  }),
);

/** 预览图 */
router.get('/:id/preview/:file', authOptional, (req, res) => {
  const db = getDb(dbFile());
  const mod = db.read().mods.find((m) => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id;
  const member = !!(userId && mod.teamId && db.read().members.some((m) => m.teamId === mod.teamId && m.userId === userId));
  if (!canViewMod(mod, userId, member)) {
    res.status(403).json({ error: '无权查看' });
    return;
  }
  if (!mod.previewImages.includes(req.params.file)) {
    res.status(404).json({ error: '预览图不存在' });
    return;
  }
  const abs = previewAbsPath(mod.id, req.params.file);
  if (!abs) {
    res.status(404).json({ error: '预览图不存在' });
    return;
  }
  res.setHeader('Content-Type', mime.lookup(abs) || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(abs);
  stream.on('error', (err) => {
    console.error('[preview] stream error', err);
    if (!res.headersSent) res.status(500).json({ error: '读取预览图失败' });
    else res.destroy();
  });
  stream.pipe(res);
});

export default router;
