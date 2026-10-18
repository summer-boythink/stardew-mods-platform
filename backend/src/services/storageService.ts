import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { config, storageDir } from '../config';

export function ensureStorageDirs(dirs: string[]): void {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
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

/** 把目录打包为 zip（可指定 zip 内的根目录名），落盘到 mod 存储目录 */
function zipDirToModStorage(
  modId: string,
  sourceDir: string,
  entryPrefix: string,
  zipName = 'archive.zip',
): { storedFileName: string; storedAbsPath: string; fileSize: number } {
  const dir = modStoragePath(modId);
  fs.mkdirSync(dir, { recursive: true });
  const zip = new AdmZip();
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
  walk(sourceDir, entryPrefix);
  const dest = path.join(dir, zipName);
  zip.writeZip(dest);
  const size = fs.statSync(dest).size;
  return { storedFileName: zipName, storedAbsPath: dest, fileSize: size };
}

/** 文件夹上传：将 workDir 打包为 archive.zip 存入 mod 目录（重复上传/拆分模式也复用该助手） */
export function persistFolderAsZip(modId: string, workDir: string): { storedFileName: string; storedAbsPath: string; fileSize: number } {
  return zipDirToModStorage(modId, workDir, '');
}

/**
 * 拆分模式：把 workDir 下某个子 Mod 目录（relRoot）单独打包为该 Mod 的 archive.zip。
 * zip 内保留根目录名 zoneName，方便玩家解压后直接放进 Mods 文件夹。
 */
export function persistZoneAsZip(
  modId: string,
  workDir: string,
  relRoot: string,
  zoneName: string,
): { storedFileName: string; storedAbsPath: string; fileSize: number } {
  const sourceDir = relRoot ? path.join(workDir, relRoot) : workDir;
  const safeZone = zoneName.replace(/[\0-\x1f<>:"|?*\\/]/g, '').trim().slice(0, 120) || 'mod';
  return zipDirToModStorage(modId, sourceDir, safeZone);
}

/**
 * 覆盖更新时安全替换存储目录：
 * 先把旧目录挪走（trash），再把新目录改名为旧 id 路径；失败时回滚旧目录。
 * 这样记录的 id 保持不变，下载/预览链接不失效。
 */
export function swapModStorage(targetId: string, sourceNewId: string): void {
  const target = modStoragePath(targetId);
  const source = modStoragePath(sourceNewId);
  const trash = `${target}.old-${Date.now()}`;
  const hadTarget = fs.existsSync(target);
  if (hadTarget) fs.renameSync(target, trash);
  try {
    fs.renameSync(source, target);
  } catch (e) {
    if (hadTarget) fs.renameSync(trash, target);
    throw e;
  }
  fs.rmSync(trash, { recursive: true, force: true });
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
