import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { config } from '../config';
import {
  modCategoryFromManifest,
  type FileTreeNode,
  type ModCategory,
  type ParsedModInfo,
  type SmapiManifest,
} from '../types';
import { keywordsFromText } from '../utils/text';

export interface StagedFile {
  /** 磁盘临时路径 */
  absPath: string;
  /** 用户原始相对路径（如 ModA/manifest.json，单文件时为文件名） */
  relativePath: string;
  size: number;
}

export interface AnalyzeResult {
  subMods: ParsedModInfo[];
  fileTree: FileTreeNode[];
  fileCount: number;
  totalBytes: number;
  /** 相对分析根目录的预览图路径 */
  previewImages: string[];
  /** 所有相对路径（小写拼接前） */
  allRelPaths: string[];
  /** 解压/还原后的根目录（调用方负责清理） */
  workDir: string;
  /** 是否来自 zip */
  fromZip: boolean;
  /** 建议标题/描述/分类 */
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: ModCategory;
  suggestedTags: string[];
}

const MANIFEST_NAME = 'manifest.json';
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const MAX_TREE_NODES = 1200;

/** 归一化 zip/相对路径，拦截路径穿越，返回 posix 相对路径或 null */
export function sanitizeRelativePath(input: string): string | null {
  if (!input) return null;
  // 统一分隔符，去掉盘符与开头的 / \
  let p = input.replace(/\\/g, '/').trim();
  p = p.replace(/^[A-Za-z]:/, '');
  p = p.replace(/^\/+/, '');
  if (!p || p === '.' || p === '/') return null;
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    // Windows 非法字符与控制字符过滤（保留中文）
    const clean = seg.replace(/[\0-\x1f<>:"|?*]/g, '').trim();
    if (!clean || clean === '.' || clean === '..') return null;
    parts.push(clean);
  }
  if (parts.length === 0) return null;
  const joined = parts.join('/');
  if (joined.length > 400) return null;
  return joined;
}

function isManifestName(base: string): boolean {
  return base.toLowerCase() === MANIFEST_NAME;
}

function readManifestFile(absPath: string): SmapiManifest | null {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return null;
    let raw = fs.readFileSync(absPath, 'utf-8');
    // 去 BOM
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    raw = raw.trim();
    if (!raw.startsWith('{')) return null;
    return JSON.parse(raw) as SmapiManifest;
  } catch {
    return null;
  }
}

interface FileEntry {
  abs: string;
  rel: string;
  size: number;
}

function listFilesRecursive(root: string, relBase = ''): FileEntry[] {
  const out: FileEntry[] = [];
  const stack: string[] = [relBase];
  // 迭代避免深递归爆栈
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    const abs = path.join(root, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(root, childRel);
      if (e.isDirectory()) {
        if (out.length + stack.length > config.maxExtractedFiles) return out;
        stack.push(childRel);
      } else if (e.isFile()) {
        try {
          const st = fs.statSync(childAbs);
          out.push({ abs: childAbs, rel: childRel, size: st.size });
          if (out.length > config.maxExtractedFiles) return out;
        } catch {
          continue;
        }
      }
    }
  }
  return out;
}

export function buildFileTree(entries: FileEntry[]): FileTreeNode[] {
  interface MutableNode extends FileTreeNode {
    children?: MutableNode[];
  }
  const root: MutableNode[] = [];
  let count = 0;
  const findOrCreate = (siblings: MutableNode[], name: string, rel: string, isDir: boolean, size: number): MutableNode => {
    let node = siblings.find((n) => n.name === name && n.isDir === isDir);
    if (!node) {
      node = { name, path: rel, isDir, size, ...(isDir ? { children: [] } : {}) };
      siblings.push(node);
      count += 1;
    }
    return node;
  };

  const sorted = [...entries].sort((a, b) => a.rel.localeCompare(b.rel));
  for (const e of sorted) {
    if (count > MAX_TREE_NODES) break;
    const segs = e.rel.split('/');
    let siblings = root;
    let cur = '';
    for (let i = 0; i < segs.length; i += 1) {
      const isLast = i === segs.length - 1;
      cur = cur ? `${cur}/${segs[i]}` : segs[i];
      const node = findOrCreate(siblings, segs[i], cur, !isLast, isLast ? e.size : 0);
      if (!isLast) {
        siblings = node.children as MutableNode[];
      } else if (!node.isDir) {
        node.size = e.size;
      }
    }
  }

  const sortRec = (nodes: MutableNode[]): void => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.children) sortRec(n.children);
  };
  sortRec(root);
  return root;
}

function collectPreviewImages(entries: FileEntry[], limit = 6): string[] {
  const imgs = entries.filter((e) => IMAGE_EXTS.has(path.extname(e.rel).toLowerCase()));
  // 优先含 preview/screenshot/cover/title 关键词的
  const score = (rel: string): number => {
    const l = rel.toLowerCase();
    let s = 0;
    if (l.includes('preview') || l.includes('screenshot') || l.includes('cover') || l.includes('title') || l.includes('预览')) s -= 10;
    // 根目录附近的图片优先
    s += rel.split('/').length;
    return s;
  };
  return imgs
    .sort((a, b) => score(a.rel) - score(b.rel))
    .slice(0, limit)
    .map((e) => e.rel);
}

function toParsedMod(manifest: SmapiManifest | null, manifestRel: string, filesUnder: FileEntry[]): ParsedModInfo {
  const dirPrefix = manifestRel.includes('/') ? manifestRel.slice(0, manifestRel.lastIndexOf('/')) : '';
  const under = dirPrefix ? filesUnder.filter((f) => f.rel === manifestRel || f.rel.startsWith(`${dirPrefix}/`)) : filesUnder;
  const names = under.map((f) => f.rel);
  const fallbackName =
    dirPrefix.split('/').pop() || manifest?.Name || manifestRel.split('/').pop() || '未命名Mod';
  const category: ModCategory = manifest
    ? modCategoryFromManifest(manifest, names)
    : inferCategoryWithoutManifest(names);
  const tags = Array.from(
    new Set([
      ...(manifest?.UpdateKeys ?? []).map((k) => String(k).split(':')[0]).filter(Boolean).slice(0, 3),
      ...keywordsFromText(`${manifest?.Name ?? ''} ${manifest?.Description ?? ''}`, 4),
    ]),
  ).slice(0, 8);
  return {
    name: String(manifest?.Name ?? fallbackName).slice(0, 120) || '未命名Mod',
    author: String(manifest?.Author ?? '未知作者').slice(0, 60),
    version: String(manifest?.Version ?? '1.0.0').slice(0, 30),
    description: String(manifest?.Description ?? '').slice(0, 1000),
    uniqueId: String(manifest?.UniqueID ?? '').slice(0, 120),
    category,
    tags,
    manifestPath: manifestRel,
    fileCount: under.length,
    hasManifest: manifest !== null,
  };
}

function inferCategoryWithoutManifest(relPaths: string[]): ModCategory {
  const hay = relPaths.join('\n').toLowerCase();
  if (hay.includes('.xnb')) return '美化贴图';
  if (relPaths.some((p) => IMAGE_EXTS.has(path.extname(p).toLowerCase())) && relPaths.length <= 30) return '美化贴图';
  if (hay.includes('汉化') || hay.includes('chinese') || hay.includes('translation')) return '汉化';
  if (hay.endsWith('.dll') || hay.includes('.dll')) return '功能玩法';
  return '其他';
}

/** 分析已还原到磁盘的目录（调用方保证 workDir 存在） */
export function analyzeDirectory(workDir: string): Omit<AnalyzeResult, 'workDir' | 'fromZip'> {
  const entries = listFilesRecursive(workDir);
  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  const fileTree = buildFileTree(entries);
  const previewImages = collectPreviewImages(entries);
  const allRelPaths = entries.map((e) => e.rel);

  const manifestEntries = entries.filter((e) => isManifestName(path.basename(e.rel)));
  let subMods: ParsedModInfo[];
  if (manifestEntries.length === 0) {
    subMods = [toParsedMod(null, allRelPaths[0] ?? 'files', entries)];
  } else {
    // 去重：同一目录只取第一个 manifest（大小写变体）
    const seenDir = new Set<string>();
    subMods = [];
    const sorted = [...manifestEntries].sort((a, b) => a.rel.localeCompare(b.rel));
    for (const m of sorted) {
      const dir = m.rel.includes('/') ? m.rel.slice(0, m.rel.lastIndexOf('/')) : '';
      if (seenDir.has(dir)) continue;
      seenDir.add(dir);
      const manifest = readManifestFile(m.abs);
      if (!manifest) continue;
      subMods.push(toParsedMod(manifest, m.rel, entries));
      if (subMods.length >= 200) break;
    }
    if (subMods.length === 0) {
      subMods = [toParsedMod(null, allRelPaths[0] ?? 'files', entries)];
    }
  }

  const primary = subMods[0];
  const suggestedCategory: ModCategory = subMods.length > 1 ? '合集包' : primary.category;
  const suggestedTitle = subMods.length > 1 ? primary.name.replace(/\s*[\d._-]+$/, '') || primary.name : primary.name;
  const suggestedDescription =
    primary.description ||
    (subMods.length > 1
      ? `包含 ${subMods.length} 个 Mod 的合集包：${subMods.map((m) => m.name).slice(0, 8).join('、')}`
      : '');
  const suggestedTags = Array.from(new Set(subMods.flatMap((m) => m.tags))).slice(0, 12);

  return {
    subMods,
    fileTree,
    fileCount: entries.length,
    totalBytes,
    previewImages,
    allRelPaths,
    suggestedTitle,
    suggestedDescription,
    suggestedCategory,
    suggestedTags,
  };
}

/** 安全解压 zip（防 zip 炸弹 + 路径穿越） */
export function extractZipSafely(zipPath: string, destDir: string): { entries: number; bytes: number } {
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  if (zipEntries.length > config.maxExtractedFiles) {
    throw new Error(`压缩包文件过多（${zipEntries.length}），已拒绝解压`);
  }
  let total = 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const entry of zipEntries) {
    const sanitized = sanitizeRelativePath(entry.entryName);
    // 空目录项直接跳过（adm-zip 会自动建目录）
    if (!sanitized) {
      if (!entry.isDirectory) continue;
      continue;
    }
    const target = path.join(destDir, sanitized);
    const resolved = path.resolve(target);
    const destResolved = path.resolve(destDir);
    if (resolved !== destResolved && !resolved.startsWith(`${destResolved}${path.sep}`)) {
      throw new Error('压缩包包含非法路径，已拒绝解压');
    }
    if (entry.isDirectory) {
      fs.mkdirSync(resolved, { recursive: true });
      continue;
    }
    // 解压前先按 zip 头声明的未压缩体积拦截，避免 getData() 先把超大内容解进内存（zip 炸弹）
    const declared = Number(entry.header?.size);
    const declaredSafe = Number.isFinite(declared) && declared > 0 ? declared : 0;
    if (declaredSafe > config.maxExtractedBytes || total + declaredSafe > config.maxExtractedBytes) {
      throw new Error('解压后体积过大，已拒绝（疑似 zip 炸弹）');
    }
    const data = entry.getData();
    total += data.length;
    if (total > config.maxExtractedBytes) {
      // header 声明值可能被伪造为 0，解压后再兜底校验一次
      throw new Error('解压后体积过大，已拒绝（疑似 zip 炸弹）');
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, data);
    count += 1;
    if (count > config.maxExtractedFiles) {
      throw new Error('解压后文件过多，已拒绝');
    }
  }
  return { entries: count, bytes: total };
}

function isZipName(name: string): boolean {
  return name.toLowerCase().endsWith('.zip');
}

/**
 * 统一分析上传内容，支持三种形态：
 * 1. 单个 zip → 解压后分析
 * 2. 单个非 zip 文件（单个 mod：dll/zip 外的 json/png/xnb 等）
 * 3. 文件夹上传（多个文件 + 相对路径）→ 按相对路径还原后分析
 * 返回的 workDir 由调用方清理（成功后 переносится 或删除）。
 */
export function analyzeStagedUpload(staged: StagedFile[], workRoot: string): AnalyzeResult {
  if (staged.length === 0) throw new Error('没有可分析的文件');
  fs.mkdirSync(workRoot, { recursive: true });

  // 情况 1：单个 zip
  if (staged.length === 1 && isZipName(staged[0].relativePath)) {
    const dest = path.join(workRoot, 'extracted');
    extractZipSafely(staged[0].absPath, dest);
    const analyzed = analyzeDirectory(dest);
    return { ...analyzed, workDir: dest, fromZip: true };
  }

  // 情况 2/3：还原文件树后分析
  const dest = path.join(workRoot, 'extracted');
  fs.mkdirSync(dest, { recursive: true });
  let totalBytes = 0;
  for (const f of staged) {
    const sanitized = sanitizeRelativePath(f.relativePath);
    if (!sanitized) continue;
    const target = path.join(dest, sanitized);
    const resolved = path.resolve(target);
    const destResolved = path.resolve(dest);
    if (resolved !== destResolved && !resolved.startsWith(`${destResolved}${path.sep}`)) continue;
    totalBytes += f.size;
    if (totalBytes > config.maxExtractedBytes) throw new Error('上传内容总体积过大');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.copyFileSync(f.absPath, resolved);
  }
  const analyzed = analyzeDirectory(dest);
  // 单个非 zip 文件时，用文件名补标题
  if (staged.length === 1 && !isZipName(staged[0].relativePath) && analyzed.subMods[0] && !analyzed.subMods[0].hasManifest) {
    const base = path.basename(staged[0].relativePath, path.extname(staged[0].relativePath));
    if (base) {
      analyzed.suggestedTitle = base.slice(0, 120);
      analyzed.subMods[0].name = base.slice(0, 120);
    }
  }
  return { ...analyzed, workDir: dest, fromZip: false };
}
