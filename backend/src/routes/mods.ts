import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { config, tmpDir } from '../config';
import { getDb, type AppDatabase, type ModPatch } from '../db';
import { authOptional, authRequired } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { analyzeStagedUpload, buildFileTree, type StagedFile } from '../services/modParser';
import {
  modStoragePath,
  newModId,
  persistFolderAsZip,
  persistOriginalFile,
  persistPreviews,
  persistZoneAsZip,
  previewAbsPath,
  quotaLimit,
  removeModStorage,
  swapModStorage,
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

/** 是否允许覆盖该记录：原上传者本人，或该团队的创建者 */
function canOverwriteMod(db: AppDatabase, mod: ModRecord, userId: string, teamId: string | null): boolean {
  if (mod.ownerId === userId) return true;
  if (teamId && mod.teamId === teamId) {
    const team = db.getTeam(teamId);
    return !!team && team.ownerId === userId;
  }
  return false;
}

/** 覆盖更新时只替换"内容"字段：id/创建时间/下载数/归属与可见性保持原样 */
function contentPatchOf(record: ModRecord, now: string): ModPatch {
  return {
    slug: record.slug,
    title: record.title,
    description: record.description,
    category: record.category,
    tags: record.tags,
    subMods: record.subMods,
    fileName: record.fileName,
    fileSize: record.fileSize,
    fileCount: record.fileCount,
    fileTree: record.fileTree,
    previewImages: record.previewImages,
    updatedAt: now,
  };
}

type PushOutcome =
  | { kind: 'ok' }
  | { kind: 'overwritten'; id: string }
  | { kind: 'quota' }
  | { kind: 'dup'; id: string; title: string; canOverwrite: boolean };

/** 拆分模式下返回的创建记录带 replaced 标记（前端用于展示"已覆盖更新"） */
export type UploadRecord = ModRecord & { replaced?: boolean };

interface SkippedItem {
  name: string;
  reason: string;
  existingId?: string;
  canOverwrite: boolean;
}

/**
 * 上传 Mod（核心接口）
 * multipart 字段：
 * - files: 文件（单个 zip / 多个 zip / 单个 mod / 文件夹多文件）
 * - relativePaths: JSON 数组，与文件顺序对齐（文件夹上传时为 webkitRelativePath）
 * - scope: personal | team | public；teamId；visibility
 * - title/description/category/tags: 用户覆盖自动整理结果
 * - split: '1' 时把含多个 Mod 的内容拆分为多个独立记录
 * - overwrite: '1' 遇到重复直接覆盖；overwriteIds: JSON 数组，仅覆盖指定已存在记录
 */
router.post(
  '/upload',
  authRequired,
  // multer 自带类型与 express 4/5 混装时可能出现 RequestHandler 重载不匹配，运行时无影响，这里转 any 隔离
  upload.array('files', 2000) as unknown as import('express').RequestHandler,
  asyncHandler(async (req, res) => {
    const workRoot = path.join(tmpDir(), `work-${uuidv4()}`);
    let stagedTmp: string[] = [];
    /** 已落盘但尚未被记录消费的新目录（异常/拒绝时统一清理） */
    const pendingDirs = new Set<string>();
    try {
      const fieldsParsed = uploadFieldsSchema.safeParse(req.body);
      if (!fieldsParsed.success) {
        res.status(400).json({ error: fieldsParsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const fields = fieldsParsed.data;
      let files = (req.files ?? []) as Express.Multer.File[];
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
      const db = getDb();

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
        const team = db.getTeam(teamId);
        if (!team) {
          res.status(404).json({ error: '团队不存在' });
          return;
        }
        if (!db.isMember(teamId, userId)) {
          res.status(403).json({ error: '仅团队成员可上传到团队空间' });
          return;
        }
        teamName = team.name;
        visibility = fields.visibility === 'public' ? 'public' : 'team';
      } else if (scope === 'public') {
        if (teamId) {
          const team = db.getTeam(teamId);
          if (!team) {
            res.status(404).json({ error: '团队不存在' });
            return;
          }
          if (!db.isMember(teamId, userId)) {
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

      // ---- 配额预检（快速失败；最终以事务内复核为准）----
      const billing: 'personal' | 'team' = teamId ? 'team' : 'personal';
      const limit = quotaLimit(billing);
      const stagedTotal = staged.reduce((s, f) => s + f.size, 0);
      if (stagedTotal <= 0) {
        res.status(400).json({ error: '上传文件为空' });
        return;
      }
      const usedPre = db.usageOf(billing, userId, teamId);
      if (usedPre.bytes + stagedTotal > limit) {
        res.status(413).json({
          error: `空间不足：已用 ${Math.round(usedPre.bytes / 1048576)}MB / 上限 ${Math.round(limit / 1073741824)}GB`,
        });
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

      // ---- 覆盖参数 ----
      const overwriteFlag = fields.overwrite === '1';
      const overwriteIds = new Set<string>();
      try {
        const arr = JSON.parse(fields.overwriteIds || '[]') as unknown;
        if (Array.isArray(arr)) for (const v of arr.slice(0, 200)) overwriteIds.add(String(v));
      } catch {
        /* 忽略非法 JSON */
      }
      const wantOverwriteFor = (existingId: string): boolean => overwriteFlag || overwriteIds.has(existingId);

      const incomingIds = analyzed.subMods.map((m) => m.uniqueId.trim().toLowerCase()).filter(Boolean);

      /* ================= 拆分模式：每个子 Mod 一条独立记录 ================= */
      if (fields.split === '1' && analyzed.subMods.length > 1) {
        const created: UploadRecord[] = [];
        const skipped: SkippedItem[] = [];

        for (const sub of analyzed.subMods) {
          const rootDir = sub.manifestPath.includes('/')
            ? sub.manifestPath.slice(0, sub.manifestPath.lastIndexOf('/'))
            : '';
          const prefix = rootDir ? `${rootDir}/` : '';
          const subEntries = analyzed.entries.filter((e) => (prefix ? e.rel.startsWith(prefix) : true));
          if (subEntries.length === 0) continue;

          const subIds = [sub.uniqueId.trim().toLowerCase()].filter(Boolean);
          const dupPre = subIds.length ? db.findDuplicateMod(subIds, userId, teamId) : null;
          if (dupPre) {
            const canOver = canOverwriteMod(db, dupPre, userId, teamId);
            if (!(canOver && wantOverwriteFor(dupPre.id))) {
              skipped.push({
                name: sub.name,
                reason: canOver ? '已存在，已跳过（可确认覆盖）' : '已存在且由他人上传，无法覆盖',
                existingId: dupPre.id,
                canOverwrite: canOver,
              });
              continue;
            }
          }

          const subModId = newModId();
          pendingDirs.add(subModId);
          const zoneName = rootDir ? rootDir.split('/').pop() || sub.name : sub.name || 'mod';
          const zr = persistZoneAsZip(subModId, analyzed.workDir, rootDir, zoneName);
          const zoneImgs = analyzed.previewImages.filter((p) => (prefix ? p.startsWith(prefix) : true));
          const previewImages = persistPreviews(subModId, analyzed.workDir, zoneImgs);
          const subTree = buildFileTree(subEntries.map((e) => ({ abs: '', rel: e.rel, size: e.size })));
          const now = new Date().toISOString();
          const subTitle = (sub.name || '未命名Mod').slice(0, 120);
          const record: ModRecord = {
            id: subModId,
            slug: `${slugify(subTitle)}-${subModId.slice(0, 8)}`,
            title: subTitle,
            description: (sub.description || '').slice(0, 2000),
            category: sub.category,
            tags: sub.tags.slice(0, 12),
            scope,
            visibility,
            ownerId: userId,
            ownerName: username,
            teamId,
            teamName,
            subMods: [sub],
            fileName: zr.storedFileName,
            fileSize: zr.fileSize,
            fileCount: subEntries.length,
            fileTree: subTree,
            previewImages,
            downloadCount: 0,
            createdAt: now,
            updatedAt: now,
          };

          // 事务内复核（查重 + 配额 + 写入原子完成）
          const outcome = db.tx((): PushOutcome => {
            const dupNow = subIds.length ? db.findDuplicateMod(subIds, userId, teamId) : null;
            if (dupNow) {
              const canOver = canOverwriteMod(db, dupNow, userId, teamId);
              if (canOver && wantOverwriteFor(dupNow.id)) {
                const usage = db.usageOf(billing, userId, teamId);
                if (usage.bytes - dupNow.fileSize + zr.fileSize > limit) return { kind: 'quota' };
                db.updateMod(dupNow.id, contentPatchOf(record, now));
                return { kind: 'overwritten', id: dupNow.id };
              }
              return { kind: 'dup', id: dupNow.id, title: dupNow.title, canOverwrite: canOver };
            }
            const usage = db.usageOf(billing, userId, teamId);
            if (usage.bytes + zr.fileSize > limit) return { kind: 'quota' };
            db.insertMod(record);
            return { kind: 'ok' };
          });

          if (outcome.kind === 'ok') {
            pendingDirs.delete(subModId);
            created.push(record);
          } else if (outcome.kind === 'overwritten') {
            swapModStorage(outcome.id, subModId);
            pendingDirs.delete(subModId);
            const final = db.getMod(outcome.id);
            if (final) created.push({ ...final, replaced: true });
          } else {
            // 保留在 pendingDirs，交给 finally 清理存储目录
            if (outcome.kind === 'quota') {
              skipped.push({ name: sub.name, reason: '空间不足，已跳过', canOverwrite: false });
            } else {
              skipped.push({
                name: sub.name,
                reason: outcome.canOverwrite ? '已存在，已跳过（可确认覆盖）' : '已存在且由他人上传，无法覆盖',
                existingId: outcome.id,
                canOverwrite: outcome.canOverwrite,
              });
            }
          }
        }

        res.status(created.length > 0 ? 201 : 200).json({ mode: 'split', created, skipped });
        return;
      }

      /* ================= 单条模式：合并为一个记录（合集包 / 单个 Mod） ================= */
      const dupPre = incomingIds.length ? db.findDuplicateMod(incomingIds, userId, teamId) : null;
      if (dupPre) {
        const canOver = canOverwriteMod(db, dupPre, userId, teamId);
        if (!wantOverwriteFor(dupPre.id)) {
          res.status(409).json({
            error: `该 Mod 已存在（${dupPre.title}），请勿重复上传`,
            existingId: dupPre.id,
            canOverwrite: canOver,
          });
          return;
        }
        if (!canOver) {
          res.status(403).json({
            error: '该 Mod 由其他成员上传，仅原上传者或团队创建者可覆盖',
            existingId: dupPre.id,
          });
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
      pendingDirs.add(modId);
      let storedFileName: string;
      let fileSize: number;
      if (staged.length === 1) {
        // 单个 zip 或单个 Mod 文件：原样存储（下载即原文件）
        const r = persistOriginalFile(modId, staged[0].absPath, path.basename(staged[0].relativePath));
        storedFileName = r.storedFileName;
        fileSize = r.fileSize;
      } else {
        // 文件夹 / 多个 zip：打包为 archive.zip 供一键下载
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

      // 事务内复核（查重 + 配额 + 写入/覆盖原子完成）
      const outcome = db.tx((): PushOutcome => {
        const dupNow = incomingIds.length ? db.findDuplicateMod(incomingIds, userId, teamId) : null;
        if (dupNow) {
          const canOver = canOverwriteMod(db, dupNow, userId, teamId);
          if (canOver && wantOverwriteFor(dupNow.id)) {
            const usage = db.usageOf(billing, userId, teamId);
            if (usage.bytes - dupNow.fileSize + fileSize > limit) return { kind: 'quota' };
            db.updateMod(dupNow.id, contentPatchOf(record, now));
            return { kind: 'overwritten', id: dupNow.id };
          }
          return { kind: 'dup', id: dupNow.id, title: dupNow.title, canOverwrite: canOver };
        }
        const usage = db.usageOf(billing, userId, teamId);
        if (usage.bytes + fileSize > limit) return { kind: 'quota' };
        db.insertMod(record);
        return { kind: 'ok' };
      });

      if (outcome.kind === 'ok') {
        pendingDirs.delete(modId);
        res.status(201).json({ ...record, mode: 'single' });
        return;
      }
      if (outcome.kind === 'overwritten') {
        swapModStorage(outcome.id, modId);
        pendingDirs.delete(modId);
        const final = db.getMod(outcome.id);
        res.json({ ...(final ?? record), mode: 'single', replaced: true });
        return;
      }
      if (outcome.kind === 'quota') {
        res.status(413).json({ error: '空间不足，打包后体积超出配额' });
        return;
      }
      // 竞态路径：复核时才发现重复（如两次并发上传同一内容）
      res.status(409).json({
        error: `该 Mod 已存在（${outcome.title}），请勿重复上传`,
        existingId: outcome.id,
        canOverwrite: outcome.canOverwrite,
      });
    } catch (e) {
      // 记完整日志供排查，客户端只给通用文案（避免泄露内部路径）
      console.error('[upload]', e);
      res.status(500).json({ error: '上传失败，请稍后重试' });
    } finally {
      // 清理：未被记录消费的新目录 + 临时上传文件 + 分析工作目录
      for (const id of pendingDirs) {
        try {
          removeModStorage(id);
        } catch {
          /* ignore */
        }
      }
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
  const db = getDb();
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const category = String(req.query.category ?? '').trim();
  const sort = String(req.query.sort ?? 'newest');
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);

  let items = db.listMods({ visibility: 'public' });
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

  const total = items.length;
  const paged = items.slice((page - 1) * pageSize, page * pageSize).map((m) => ({ ...m, fileTree: [] }));
  res.json({ items: paged, total, page, pageSize });
});

/** 我的上传 */
router.get('/mine', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user?.id as string;
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);
  let items = db.listMods({ ownerId: userId });
  if (q) {
    items = items.filter((m) => `${m.title}\n${m.description}\n${m.tags.join(' ')}`.toLowerCase().includes(q));
  }
  const total = items.length;
  res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
});

/** 团队 Mod 列表 */
router.get('/team/:teamId', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user?.id as string;
  const teamId = req.params.teamId;
  if (!db.isMember(teamId, userId)) {
    res.status(403).json({ error: '仅团队成员可查看' });
    return;
  }
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);
  const items = db.listMods({ teamId });
  const total = items.length;
  res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
});

/** Mod 详情 */
router.get('/:id', authOptional, (req, res) => {
  const db = getDb();
  const mod = db.getMod(req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id;
  const member = !!(userId && mod.teamId && db.isMember(mod.teamId, userId));
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
    const db = getDb();
    const mod = db.getMod(req.params.id);
    if (!mod) {
      res.status(404).json({ error: 'Mod 不存在' });
      return;
    }
    const userId = req.user?.id as string;
    const team = mod.teamId ? db.getTeam(mod.teamId) : null;
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
    const dbPatch: ModPatch = {};
    if (patch.title !== undefined) {
      dbPatch.title = patch.title;
      dbPatch.slug = `${slugify(patch.title)}-${mod.id.slice(0, 8)}`;
    }
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.category !== undefined) dbPatch.category = patch.category as ModCategory;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags.slice(0, 12);
    if (patch.visibility !== undefined) {
      dbPatch.visibility = patch.visibility;
      // scope 与 visibility 保持一致语义：public 可见即 public 空间展示
      if (patch.visibility === 'public') dbPatch.scope = 'public';
      else if (mod.teamId) dbPatch.scope = 'team';
      else dbPatch.scope = 'personal';
    }
    dbPatch.updatedAt = new Date().toISOString();
    const updated = db.updateMod(mod.id, dbPatch);
    res.json(updated);
  }),
);

/** 删除 Mod */
router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const mod = db.getMod(req.params.id);
    if (!mod) {
      res.status(404).json({ error: 'Mod 不存在' });
      return;
    }
    const userId = req.user?.id as string;
    const team = mod.teamId ? db.getTeam(mod.teamId) : null;
    const isUploader = mod.ownerId === userId;
    const isTeamOwner = !!team && team.ownerId === userId;
    if (!isUploader && !isTeamOwner) {
      res.status(403).json({ error: '仅上传者或团队创建者可删除' });
      return;
    }
    db.deleteMod(mod.id);
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
    const db = getDb();
    const mod = db.getMod(req.params.id);
    if (!mod) {
      res.status(404).json({ error: 'Mod 不存在' });
      return;
    }
    const userId = req.user?.id;
    const member = !!(userId && mod.teamId && db.isMember(mod.teamId, userId));
    if (!canViewMod(mod, userId, member)) {
      res.status(403).json({ error: '无权下载该 Mod' });
      return;
    }
    const abs = path.join(modStoragePath(mod.id), mod.fileName);
    if (!fs.existsSync(abs)) {
      res.status(410).json({ error: '文件已丢失，请联系上传者' });
      return;
    }
    db.incrementDownload(mod.id);
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
  const db = getDb();
  const mod = db.getMod(req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'Mod 不存在' });
    return;
  }
  const userId = req.user?.id;
  const member = !!(userId && mod.teamId && db.isMember(mod.teamId, userId));
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
