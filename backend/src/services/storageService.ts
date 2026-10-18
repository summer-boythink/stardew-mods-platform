import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { config, storageDir } from '../config';
import type { DatabaseShape } from '../db';

export function ensureStorageDirs(dirs: string[]): void {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

/** 计算某作用域已用字节与 Mod 数 */
export function usageOf(data: DatabaseShape, scope: 'personal' | 'team', ownerId: string, teamId: string | null): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;
  for (const m of data.mods) {
    if (scope === 'personal') {
      if (m.scope === 'personal' && m.ownerId === ownerId) {
        bytes += m.fileSize;
        count += 1;
      }
      // scope=public 但归属个人的同样占用个人配额
      if (m.scope === 'public' && m.ownerId === ownerId && !m.teamId) {
        bytes += m.fileSize;
        count += 1;
      }
    } else {
      if (m.teamId && teamId && m.teamId === teamId) {
        bytes += m.fileSize;
        count += 1;
      }
    }
  }
  return { bytes, count };
}

export function quotaLimit(scope: 'personal' | 'team'): number {
  return scope === 'personal' ? config.personalQuotaBytes : config.teamQuotaBytes;
}

export function modStoragePath(modId: string): string {
  return path.join(storageDir(), modId);
}

/** 原始上传文件落盘：返回 { storedFileName, storedAbsPath, fileSize } */
export function persistOriginalFile(modId: string, srcAbs: string, originalName: string): { storedFileName: string; storedAbsPath: string; fileSize: number } {
  const dir = modStoragePath(modId);
  fs.mkdirSync(dir, { recursive: true });
  const safeBase = path.basename(originalName).replace(/[\0-\x1f<>:"|?*]/g, '').trim() || 'upload.bin';
  const storedFileName = safeBase.slice(0, 180);
  const dest = path.join(dir, storedFileName);
  fs.copyFileSync(srcAbs, dest);
  const size = fs.statSync(dest).size;
  return { storedFileName, storedAbsPath: dest, fileSize: size };
}

/** 文件夹上传：将 workDir 打包为 archive.zip 存入 mod 目录 */
export function persistFolderAsZip(modId: string, workDir: string): { storedFileName: string; storedAbsPath: string; fileSize: number } {
  const dir = modStoragePath(modId);
  fs.mkdirSync(dir, { recursive: true });
  const zip = new AdmZip();
  // 逐文件添加，避免空目录问题
  const walk = (cur: string, rel: string): void => {
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(cur, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        zip.addFile(`${r}/`, Buffer.alloc(0));
        walk(abs, r);
      } else if (e.isFile()) {
        zip.addLocalFile(abs, rel || undefined, e.name);
      }
    }
  };
  walk(workDir, '');
  const storedFileName = 'archive.zip';
  const dest = path.join(dir, storedFileName);
  zip.writeZip(dest);
  const size = fs.statSync(dest).size;
  return { storedFileName, storedAbsPath: dest, fileSize: size };
}

/** 预览图落盘：将 workDir 下的预览图拷贝到 mod 目录 previews/ */
export function persistPreviews(modId: string, workDir: string, previewRels: string[]): string[] {
  const outDir = path.join(modStoragePath(modId), 'previews');
  fs.mkdirSync(outDir, { recursive: true });
  const saved: string[] = [];
  previewRels.slice(0, 6).forEach((rel, idx) => {
    try {
      const src = path.join(workDir, rel);
      const resolved = path.resolve(src);
      const base = path.resolve(workDir);
      if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) return;
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return;
      const ext = path.extname(rel).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return;
      const destName = `preview-${idx}${ext === '.jpeg' ? '.jpg' : ext}`;
      fs.copyFileSync(src, path.join(outDir, destName));
      saved.push(destName);
    } catch {
      /* 单张失败不影响整体 */
    }
  });
  return saved;
}

export function previewAbsPath(modId: string, fileName: string): string | null {
  const base = path.join(modStoragePath(modId), 'previews');
  const target = path.join(base, path.basename(fileName));
  const resolved = path.resolve(target);
  if (resolved !== path.resolve(base) && !resolved.startsWith(`${path.resolve(base)}${path.sep}`)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function removeModStorage(modId: string): void {
  const dir = modStoragePath(modId);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function newModId(): string {
  return uuidv4();
}
