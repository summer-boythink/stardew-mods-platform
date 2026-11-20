import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config, tmpDir } from '../config';
import type { AppDatabase } from '../db';
import type { ModSource, ModSourceProvider } from '../types';
import { HttpError } from '../utils/errors';

/**
 * Server-side importer for the three community sites.
 *
 * Only official, documented APIs are used. There is no HTML scraping and no
 * bypass of author permissions:
 * - Nexus Mods v3 API (download links: Premium / direct-download enabled files)
 * - CurseForge for Studios API (mod distribution must be allowed by the author)
 * - ModDrop: its public API does not expose a file-download endpoint, so the
 *   UI offers a manual download/upload fallback instead of scraping.
 */


export type ImportProvider = ModSourceProvider;

export interface ImportTarget {
  provider: ImportProvider;
  pageUrl: string;
  modId: string;
  slug?: string;
  fileId?: string;
}

export interface ImportPreview {
  provider: ImportProvider;
  sourceUrl: string;
  modId: string;
  fileId: string | null;
  fileVersionId: string | null;
  title: string;
  author: string;
  version: string;
  description: string;
  category: string | null;
  tags: string[];
  fileName: string;
  fileSize: number;
  imageUrl: string | null;
  downloadable: boolean;
  reason: string | null;
}

export interface ImportProviderStatus {
  provider: ImportProvider;
  label: string;
  supported: boolean;
  configured: boolean;
  hint: string;
}

export interface DownloadPlan {
  url: string;
  headers: Record<string, string>;
  fileName: string;
  fileSize: number;
}

export interface DownloadedImport {
  directory: string;
  filePath: string;
  fileName: string;
  size: number;
}

function isAllowedDownloadUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  if (value.startsWith('https://')) return true;
  return config.importAllowInsecure && value.startsWith('http://');
}

export function getImportProviders(): ImportProviderStatus[] {
  return [
    {
      provider: 'nexus',
      label: 'Nexus Mods',
      supported: true,
      configured: Boolean(config.nexusApiKey),
      hint: config.nexusApiKey
        ? '已配置服务端 API Key；可下载有权限的文件。'
        : '未配置 NEXUS_API_KEY：可以解析元数据，但无法下载。',
    },
    {
      provider: 'curseforge',
      label: 'CurseForge',
      supported: true,
      configured: Boolean(config.curseForgeApiKey),
      hint: config.curseForgeApiKey
        ? '已配置服务端 API Key；仅作者允许第三方下载的 Mod 可用。'
        : '未配置 CURSEFORGE_API_KEY：无法解析或下载。',
    },
    {
      provider: 'moddrop',
      label: 'ModDrop',
      supported: false,
      configured: false,
      hint: 'ModDrop 公共 API 暂未提供文件下载端点；请使用 ModDrop 客户端/网页下载后上传。',
    },
  ];
}

/** Parse a supported mod page URL or a shorthand such as `nexus:2400`. */
export function parseImportTarget(input: string): ImportTarget {
  const raw = input.trim();
  if (!raw) throw new HttpError(400, '请粘贴 Mod 页面链接');
  if (raw.length > 1000) throw new HttpError(400, '链接过长');

  const shorthand = /^(nexus|curseforge|moddrop):(\d+)$/i.exec(raw);
  if (shorthand) {
    const provider = shorthand[1].toLowerCase() as ImportProvider;
    const modId = shorthand[2];
    return {
      provider,
      modId,
      pageUrl: canonicalPageUrl(provider, modId, null),
    };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HttpError(400, '链接格式不正确');
  }

  const host = url.hostname.toLowerCase();

  if (url.protocol === 'nxm:') {
    const segments = url.pathname.split('/').filter(Boolean);
    const modIndex = segments.findIndex((s) => s.toLowerCase() === 'mods');
    const modId = modIndex >= 0 ? segments[modIndex + 1] : '';
    if (host.toLowerCase() !== 'stardewvalley' || !/^\d+$/.test(modId)) {
      throw new HttpError(400, '仅支持 Stardew Valley 的 Nexus Mod 链接');
    }
    return {
      provider: 'nexus',
      modId,
      pageUrl: canonicalPageUrl('nexus', modId, null),
    };
  }

  if (!/^https?:$/.test(url.protocol)) throw new HttpError(400, '只支持 http(s) 链接');

  if (host === 'nexusmods.com' || host.endsWith('.nexusmods.com')) {
    const segments = url.pathname.split('/').filter(Boolean);
    const modIndex = segments.findIndex((s) => s.toLowerCase() === 'mods');
    const game = modIndex > 0 ? segments[modIndex - 1].toLowerCase() : '';
    const modId = modIndex >= 0 ? segments[modIndex + 1] : '';
    if (game !== 'stardewvalley') {
      throw new HttpError(400, '仅支持 Stardew Valley 的 Nexus Mod 链接');
    }
    if (!/^\d+$/.test(modId)) throw new HttpError(400, '链接里找不到 Nexus Mod ID');
    return {
      provider: 'nexus',
      modId,
      pageUrl: canonicalPageUrl('nexus', modId, null),
    };
  }

  if (host === 'curseforge.com' || host.endsWith('.curseforge.com')) {
    const segments = url.pathname.split('/').filter(Boolean);
    const filesIndex = segments.findIndex((s) => s.toLowerCase() === 'files');
    const fileId =
      filesIndex >= 0 && /^\d+$/.test(segments[filesIndex + 1] ?? '')
        ? segments[filesIndex + 1]
        : undefined;

    const projectsIndex = segments.findIndex((s) => s.toLowerCase() === 'projects');
    if (projectsIndex >= 0 && /^\d+$/.test(segments[projectsIndex + 1] ?? '')) {
      const modId = segments[projectsIndex + 1];
      return {
        provider: 'curseforge',
        modId,
        fileId,
        pageUrl: canonicalPageUrl('curseforge', modId, null),
      };
    }

    const gameIndex = segments.findIndex((s) => s.toLowerCase() === 'stardewvalley');
    if (gameIndex < 0) {
      throw new HttpError(400, '仅支持 Stardew Valley 的 CurseForge 链接');
    }
    const afterGame = segments.slice(gameIndex + 1);
    const localFilesIndex = afterGame.findIndex((s) => s.toLowerCase() === 'files');
    const projectSegments = localFilesIndex >= 0 ? afterGame.slice(0, localFilesIndex) : afterGame;
    const slug = projectSegments[projectSegments.length - 1];
    if (!slug) throw new HttpError(400, '链接里找不到 CurseForge 项目');
    if (/^\d+$/.test(slug)) {
      return {
        provider: 'curseforge',
        modId: slug,
        fileId,
        pageUrl: canonicalPageUrl('curseforge', slug, null),
      };
    }
    return {
      provider: 'curseforge',
      modId: '',
      slug: decodeURIComponent(slug),
      fileId,
      pageUrl: url.origin + url.pathname,
    };
  }

  if (host === 'moddrop.com' || host.endsWith('.moddrop.com')) {
    const segments = url.pathname.split('/').filter(Boolean);
    const modsIndex = segments.findIndex((s) => s.toLowerCase() === 'mods');
    const tail = modsIndex >= 0 ? segments[modsIndex + 1] : '';
    const match = /^(\d+)/.exec(tail ?? '');
    if (!match) throw new HttpError(400, '链接里找不到 ModDrop Mod ID');
    return {
      provider: 'moddrop',
      modId: match[1],
      pageUrl: url.origin + url.pathname,
    };
  }

  throw new HttpError(400, '请粘贴 Nexus Mods / CurseForge / ModDrop 的 Stardew Valley Mod 页面链接');
}

function canonicalPageUrl(provider: ImportProvider, modId: string, slug: string | null): string {
  if (provider === 'nexus') return `https://www.nexusmods.com/stardewvalley/mods/${modId}`;
  if (provider === 'curseforge') return `https://www.curseforge.com/projects/${modId}`;
  return slug ? `https://www.moddrop.com/stardew-valley/mods/${slug}` : `https://www.moddrop.com/stardew-valley/mods/${modId}`;
}

export function sanitizeFileName(input: string, fallback = 'mod-download.zip'): string {
  const base = path
    .basename(String(input || '').replace(/\\/g, '/'))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (!base) return fallback;
  if (base.length <= 160) return base;
  const ext = path.extname(base).slice(0, 20);
  return `${base.slice(0, Math.max(1, 160 - ext.length))}${ext}`;
}

function cleanNexusText(raw: string): string {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[\/?(?:b|i|u|s|size|color|font|center|left|right|quote|spoiler|list|\*|url|img)[^\]]*\]/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\ufeff/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 700);
}

function textOf(value: unknown, max = 300): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function abortAfter(timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function requestUpstream(url: string, init: RequestInit = {}): Promise<Response> {
  const abort = abortAfter(config.importTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, '上游请求超时，请稍后重试');
    }
    throw new HttpError(502, '无法连接 Mod 网站，请检查网络或稍后重试');
  } finally {
    abort.done();
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return textOf(parsed.detail ?? parsed.message ?? parsed.error ?? parsed.title ?? raw, 220);
    } catch {
      return textOf(raw, 220);
    }
  } catch {
    return '';
  }
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<T> {
  const res = await requestUpstream(url, { headers });
  if (!res.ok) {
    const detail = await errorDetail(res);
    throw new HttpError(
      res.status >= 500 ? 502 : res.status,
      `${label} 接口返回 ${res.status}${detail ? `：${detail}` : ''}`,
    );
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Nexus Mods                                                          */
/* ------------------------------------------------------------------ */

function nexusHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Application-Name': config.nexusAppName,
    'Application-Version': config.nexusAppVersion,
    'User-Agent': `${config.nexusAppName}/${config.nexusAppVersion}`,
  };
  if (config.nexusApiKey) headers.apikey = config.nexusApiKey;
  return headers;
}

interface NexusModResponse {
  data: {
    name: string;
    description?: string;
    version?: string;
    author?: string;
    category?: { name?: string };
    tags?: Array<{ name?: string }>;
    primary_image?: { url?: string };
    gallery_images?: Array<{ url?: string }>;
    main_file_version?: { game_scoped_id?: string; id?: string } | null;
  };
}

interface NexusFileVersionResponse {
  data: {
    name?: string;
    size_in_bytes?: number;
    file?: { name?: string };
    security_scan_status?: string;
  };
}

interface NexusDownloadLinksResponse {
  data?: {
    links?: Array<{ url?: string }>;
  };
}

async function resolveNexus(target: ImportTarget): Promise<ImportPreview> {
  const modBody = await fetchJson<NexusModResponse>(
    `${config.nexusApiBase}/games/stardewvalley/mods/${encodeURIComponent(target.modId)}`,
    nexusHeaders(),
    'Nexus Mods',
  );
  const mod = modBody.data;
  const fileVersionId = mod.main_file_version?.game_scoped_id ?? mod.main_file_version?.id ?? null;
  if (!fileVersionId) {
    throw new HttpError(422, '这个 Nexus Mod 没有主文件，请到原页面选择文件后手动上传');
  }

  let fileName = sanitizeFileName(`${mod.name}-${mod.version ?? ''}.zip`);
  let fileSize = 0;
  let downloadable = Boolean(config.nexusApiKey);
  let reason = downloadable
    ? null
    : '服务端未配置 NEXUS_API_KEY，只能解析元数据，无法申请下载链接。';

  if (downloadable) {
    try {
      const fileBody = await fetchJson<NexusFileVersionResponse>(
        `${config.nexusApiBase}/games/stardewvalley/mod-file-versions/${encodeURIComponent(fileVersionId)}`,
        nexusHeaders(),
        'Nexus Mods',
      );
      const file = fileBody.data;
      fileName = sanitizeFileName(file.file?.name || file.name || fileName);
      fileSize = Number(file.size_in_bytes) || 0;
      const scan = String(file.security_scan_status ?? '').toLowerCase();
      if (scan.includes('quarantin') || scan.includes('fail')) {
        downloadable = false;
        reason = 'Nexus 安全扫描未通过或文件被隔离，无法自动下载。';
      }
    } catch (error) {
      // Invalid/missing API key still lets us show metadata; download will fail.
      downloadable = false;
      reason =
        error instanceof HttpError
          ? `Nexus 文件信息读取失败：${error.message}`
          : 'Nexus 文件信息读取失败，请稍后重试。';
    }
  }

  return {
    provider: 'nexus',
    sourceUrl: `https://www.nexusmods.com/stardewvalley/mods/${target.modId}`,
    modId: target.modId,
    fileId: null,
    fileVersionId,
    title: textOf(mod.name, 120) || `Nexus Mod ${target.modId}`,
    author: textOf(mod.author, 80) || '未知作者',
    version: textOf(mod.version, 40),
    description: cleanNexusText(mod.description ?? ''),
    category: textOf(mod.category?.name, 60) || null,
    tags: (mod.tags ?? [])
      .map((tag) => textOf(tag.name, 40))
      .filter(Boolean)
      .slice(0, 8),
    fileName,
    fileSize,
    imageUrl: mod.primary_image?.url ?? mod.gallery_images?.[0]?.url ?? null,
    downloadable,
    reason,
  };
}

async function prepareNexusDownload(preview: ImportPreview): Promise<DownloadPlan> {
  if (!config.nexusApiKey) {
    throw new HttpError(503, '服务端未配置 NEXUS_API_KEY，无法自动下载 Nexus Mod');
  }
  const fileVersionId = preview.fileVersionId;
  if (!fileVersionId) throw new HttpError(422, 'Nexus 文件版本信息缺失');
  const body = await (async () => {
    try {
      return await fetchJson<NexusDownloadLinksResponse>(
        `${config.nexusApiBase}/games/stardewvalley/mod-file-versions/${encodeURIComponent(fileVersionId)}/download-link`,
        nexusHeaders(),
        'Nexus 下载',
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        throw new HttpError(
          403,
          'Nexus 拒绝下载：需要服务端 API Key 具备 Premium 下载权限，或作者为文件开启了直接下载；免费账号请在 Nexus 网页下载后手动上传。',
        );
      }
      throw error;
    }
  })();

  const url = body.data?.links?.map((link) => link.url).find((candidate) => isAllowedDownloadUrl(candidate));
  if (!url) throw new HttpError(502, 'Nexus 没有返回可用的下载地址');
  return {
    url,
    headers: {
      'Application-Name': config.nexusAppName,
      'Application-Version': config.nexusAppVersion,
      'User-Agent': `${config.nexusAppName}/${config.nexusAppVersion}`,
    },
    fileName: preview.fileName,
    fileSize: preview.fileSize,
  };
}

/* ------------------------------------------------------------------ */
/* CurseForge                                                          */
/* ------------------------------------------------------------------ */

interface CurseForgeFile {
  id: number;
  displayName?: string | null;
  fileName?: string | null;
  fileDate?: string;
  fileLength?: number;
  releaseType?: number;
  isAvailable?: boolean;
  downloadUrl?: string | null;
}

interface CurseForgeMod {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  summary?: string;
  mainFileId?: number;
  allowModDistribution?: boolean;
  isAvailable?: boolean;
  authors?: Array<{ name?: string }>;
  categories?: Array<{ name?: string }>;
  logo?: { thumbnailUrl?: string; url?: string };
  screenshots?: Array<{ thumbnailUrl?: string; url?: string }>;
  latestFiles?: CurseForgeFile[];
}

interface CurseForgeGame {
  id: number;
  name: string;
  slug: string;
}

let curseForgeGameCache: number | null = null;
const curseForgeGameValidation = new Map<number, boolean>();

function curseForgeHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'x-api-key': config.curseForgeApiKey,
    'User-Agent': `${config.nexusAppName}/${config.nexusAppVersion}`,
  };
}

async function curseForgeJson<T>(url: string, label: string): Promise<T> {
  if (!config.curseForgeApiKey) {
    throw new HttpError(503, '服务端未配置 CURSEFORGE_API_KEY，无法访问 CurseForge');
  }
  return fetchJson<T>(url, curseForgeHeaders(), label);
}

async function findCurseForgeGameId(): Promise<number> {
  if (config.curseForgeGameId && /^\d+$/.test(config.curseForgeGameId)) {
    return Number(config.curseForgeGameId);
  }
  if (curseForgeGameCache) return curseForgeGameCache;

  for (let page = 0; page < 20; page += 1) {
    const body = await curseForgeJson<{ data?: CurseForgeGame[] }>(
      `${config.curseForgeApiBase}/games?index=${page * 50}&pageSize=50`,
      'CurseForge',
    );
    const games = body.data ?? [];
    const found = games.find((game) => {
      const slug = String(game.slug ?? '').toLowerCase();
      const name = String(game.name ?? '').toLowerCase();
      return slug === 'stardewvalley' || slug === 'stardew-valley' || name.includes('stardew valley');
    });
    if (found) {
      curseForgeGameCache = found.id;
      return found.id;
    }
    if (games.length < 50) break;
  }

  throw new HttpError(
    502,
    '无法自动发现 Stardew Valley 的 CurseForge gameId，请配置 CURSEFORGE_GAME_ID 后重试',
  );
}

async function ensureCurseForgeStardewGame(gameId: number): Promise<void> {
  if (config.curseForgeGameId && /^\d+$/.test(config.curseForgeGameId)) {
    if (Number(config.curseForgeGameId) !== gameId) {
      throw new HttpError(400, '这个 CurseForge 项目不属于 Stardew Valley');
    }
    return;
  }
  if (curseForgeGameCache && curseForgeGameCache !== gameId) {
    throw new HttpError(400, '这个 CurseForge 项目不属于 Stardew Valley');
  }
  const cached = curseForgeGameValidation.get(gameId);
  if (cached !== undefined) {
    if (!cached) throw new HttpError(400, '这个 CurseForge 项目不属于 Stardew Valley');
    return;
  }
  const body = await curseForgeJson<{ data?: CurseForgeGame }>(
    `${config.curseForgeApiBase}/games/${gameId}`,
    'CurseForge',
  );
  const game = body.data;
  const ok =
    !!game &&
    (String(game.slug ?? '').toLowerCase().includes('stardew') ||
      String(game.name ?? '').toLowerCase().includes('stardew'));
  curseForgeGameValidation.set(gameId, ok);
  if (!ok) throw new HttpError(400, '这个 CurseForge 项目不属于 Stardew Valley');
  curseForgeGameCache = gameId;
}

export function pickCurseForgeFile(
  mod: Pick<CurseForgeMod, 'latestFiles' | 'mainFileId'>,
  requestedId?: number,
): CurseForgeFile | null {
  const files = Array.isArray(mod.latestFiles) ? mod.latestFiles : [];
  const byId = (id: number | undefined): CurseForgeFile | null =>
    id === undefined ? null : files.find((file) => file.id === id) ?? null;

  if (requestedId !== undefined) return byId(requestedId);
  const main = byId(mod.mainFileId);
  if (main) return main;

  const candidates = files
    .filter((file) => file.isAvailable !== false && (file.fileLength ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const release = (b.releaseType === 1 ? 1 : 0) - (a.releaseType === 1 ? 1 : 0);
      if (release !== 0) return release;
      return new Date(b.fileDate ?? 0).getTime() - new Date(a.fileDate ?? 0).getTime();
    });
  return candidates[0] ?? null;
}

async function resolveCurseForge(target: ImportTarget): Promise<ImportPreview> {
  if (!config.curseForgeApiKey) {
    throw new HttpError(503, '服务端未配置 CURSEFORGE_API_KEY，无法解析 CurseForge 链接');
  }

  let mod: CurseForgeMod;
  if (target.modId) {
    const body = await curseForgeJson<{ data?: CurseForgeMod }>(
      `${config.curseForgeApiBase}/mods/${encodeURIComponent(target.modId)}`,
      'CurseForge',
    );
    if (!body.data) throw new HttpError(404, 'CurseForge 项目不存在');
    mod = body.data;
    await ensureCurseForgeStardewGame(mod.gameId);
  } else {
    const gameId = await findCurseForgeGameId();
    const body = await curseForgeJson<{ data?: CurseForgeMod[] }>(
      `${config.curseForgeApiBase}/mods/search?gameId=${gameId}&slug=${encodeURIComponent(target.slug ?? '')}&pageSize=1`,
      'CurseForge',
    );
    const found = body.data?.[0];
    if (!found) throw new HttpError(404, 'CurseForge 上找不到这个项目');
    mod = found;
    await ensureCurseForgeStardewGame(mod.gameId);
  }

  if (mod.allowModDistribution === false) {
    throw new HttpError(
      403,
      '作者未授权 CurseForge 第三方 API 下载，请前往原页面手动下载后上传',
    );
  }
  if (mod.isAvailable === false) throw new HttpError(404, '这个 CurseForge 项目当前不可用');

  const requestedFileId = target.fileId ? Number(target.fileId) : undefined;
  let file =
    requestedFileId && Number.isFinite(requestedFileId)
      ? await curseForgeJson<{ data?: CurseForgeFile }>(
          `${config.curseForgeApiBase}/mods/${mod.id}/files/${requestedFileId}`,
          'CurseForge',
        ).then((body) => body.data ?? null)
      : pickCurseForgeFile(mod);
  if (!file && mod.mainFileId) {
    file = await curseForgeJson<{ data?: CurseForgeFile }>(
      `${config.curseForgeApiBase}/mods/${mod.id}/files/${mod.mainFileId}`,
      'CurseForge',
    ).then((body) => body.data ?? null);
  }
  if (!file) throw new HttpError(422, '这个 CurseForge 项目没有可下载的主文件');
  if (file.isAvailable === false) throw new HttpError(409, '这个 CurseForge 文件当前不可下载');

  const size = Number(file.fileLength) || 0;
  const fileName = sanitizeFileName(file.fileName || `${mod.slug}.zip`);
  const version = textOf(file.displayName, 60) || textOf(file.fileName, 60);
  const tags = (mod.categories ?? [])
    .map((category) => textOf(category.name, 40))
    .filter(Boolean)
    .slice(0, 8);

  return {
    provider: 'curseforge',
    sourceUrl: `https://www.curseforge.com/projects/${mod.id}`,
    modId: String(mod.id),
    fileId: String(file.id),
    fileVersionId: null,
    title: textOf(mod.name, 120) || `CurseForge ${mod.id}`,
    author: textOf(mod.authors?.[0]?.name, 80) || '未知作者',
    version,
    description: textOf(mod.summary, 700),
    category: textOf(mod.categories?.[0]?.name, 60) || null,
    tags,
    fileName,
    fileSize: size,
    imageUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? mod.screenshots?.[0]?.thumbnailUrl ?? null,
    downloadable: true,
    reason: null,
  };
}

async function prepareCurseForgeDownload(preview: ImportPreview): Promise<DownloadPlan> {
  if (!preview.fileId) throw new HttpError(422, 'CurseForge 文件信息缺失');
  let body: { data?: string | { downloadUrl?: string } };
  try {
    body = await curseForgeJson<{ data?: string | { downloadUrl?: string } }>(
      `${config.curseForgeApiBase}/mods/${encodeURIComponent(preview.modId)}/files/${encodeURIComponent(
        preview.fileId,
      )}/download-url`,
      'CurseForge 下载',
    );
  } catch (error) {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
      throw new HttpError(
        403,
        'CurseForge 拒绝下载：作者可能未授权第三方下载，请前往原页面手动下载后上传',
      );
    }
    throw error;
  }
  const url =
    typeof body.data === 'string'
      ? body.data
      : typeof body.data?.downloadUrl === 'string'
        ? body.data.downloadUrl
        : '';
  if (!isAllowedDownloadUrl(url)) throw new HttpError(502, 'CurseForge 没有返回可用的下载地址');
  return {
    url,
    headers: { 'User-Agent': `${config.nexusAppName}/${config.nexusAppVersion}` },
    fileName: preview.fileName,
    fileSize: preview.fileSize,
  };
}

/* ------------------------------------------------------------------ */
/* Download and public API                                             */
/* ------------------------------------------------------------------ */

export async function resolveImport(input: string): Promise<ImportPreview> {
  const target = parseImportTarget(input);
  if (target.provider === 'moddrop') {
    throw new HttpError(
      501,
      'ModDrop 公共 API 未提供文件下载端点；请在 ModDrop 客户端/网页下载后使用「上传文件」导入',
    );
  }
  if (target.provider === 'nexus') return resolveNexus(target);
  return resolveCurseForge(target);
}

export async function prepareDownload(preview: ImportPreview): Promise<DownloadPlan> {
  if (!preview.downloadable) {
    throw new HttpError(503, preview.reason || '这个来源当前不可下载');
  }
  if (preview.provider === 'nexus') return prepareNexusDownload(preview);
  if (preview.provider === 'curseforge') return prepareCurseForgeDownload(preview);
  throw new HttpError(501, 'ModDrop 暂不支持自动下载');
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''));
    } catch {
      return encoded.trim().replace(/^"|"$/g, '');
    }
  }
  const plain = /filename=(?:"([^"]+)"|([^;]+))/i.exec(header);
  return (plain?.[1] ?? plain?.[2] ?? '').trim() || null;
}

export async function downloadImportFile(plan: DownloadPlan): Promise<DownloadedImport> {
  const limit = Math.min(config.importMaxBytes, config.maxUploadBytes);
  if (plan.fileSize > limit) {
    throw new HttpError(413, `文件大小 ${Math.round(plan.fileSize / 1048576)}MB 超过导入上限`);
  }

  const abort = abortAfter(config.importTimeoutMs);
  let response: Response;
  try {
    response = await fetch(plan.url, { headers: plan.headers, signal: abort.signal, redirect: 'follow' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, '下载超时，请稍后重试');
    }
    throw new HttpError(502, '下载文件失败，请检查网络后重试');
  } finally {
    abort.done();
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new HttpError(
      response.status === 403 ? 403 : 502,
      `下载被拒绝（${response.status}）${detail ? `：${detail}` : ''}`,
    );
  }

  const declared = Number(response.headers.get('content-length')) || 0;
  if (declared > limit) throw new HttpError(413, '文件超过导入上限');

  const disposition = fileNameFromDisposition(response.headers.get('content-disposition'));
  const fileName = sanitizeFileName(disposition || plan.fileName || 'mod-download.zip');
  const directory = fs.mkdtempSync(path.join(tmpDir(), 'import-'));
  const filePath = path.join(directory, fileName);
  let received = 0;

  try {
    const body = response.body;
    if (!body) throw new HttpError(502, '下载响应为空');
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > limit) {
          callback(new HttpError(413, '文件超过导入上限（下载已中止）'));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream),
      limiter,
      fs.createWriteStream(filePath),
    );
    if (received === 0) throw new HttpError(400, '下载到的文件为空');
    return { directory, filePath, fileName, size: received };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}


/**
 * Write provenance onto every record created by the import. Kept separate from
 * the route so it is easy to unit test and to preserve the `replaced` flag used
 * by the split-result UI.
 */
export function attachImportSource(
  db: Pick<AppDatabase, 'getMod' | 'setModSource'>,
  body: Record<string, unknown>,
  source: ModSource,
): Record<string, unknown> {
  const withSource = (record: unknown): unknown => {
    if (!record || typeof record !== 'object') return record;
    const current = record as { id?: unknown; replaced?: unknown };
    if (typeof current.id !== 'string') return record;
    const fresh = db.setModSource(current.id, source);
    if (!fresh) return record;
    return current.replaced ? { ...fresh, replaced: true } : fresh;
  };

  if (Array.isArray(body.created)) {
    return { ...body, created: body.created.map(withSource) };
  }
  if (typeof body.id === 'string') {
    return {
      ...(withSource(body) as Record<string, unknown>),
      mode: typeof body.mode === 'string' ? body.mode : 'single',
    };
  }
  return body;
}
