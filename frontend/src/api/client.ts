import type { ModRecord, PagedResult, QuotaInfo, TeamDetail, TeamRecord } from '../types';

const TOKEN_KEY = 'stardew_token';

/**
 * 后端地址：来自前端 .env / .env.local 的 VITE_API_BASE（.env.local 优先）。
 * - 默认 `/api`：dev 走 vite 代理、生产走同源；
 * - 手机联调可设为 `http://192.168.1.10:4000/api` 直连后端。
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').replace(/\/+$/, '');

function withBase(path: string): string {
  if (path.startsWith('/api')) return `${API_BASE}${path.slice(4)}`;
  return path;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下忽略 */
  }
}

export class ApiError extends Error {
  status: number;
  existingId?: string;
  retryAfter?: number;
  remaining?: number;
  /** 409 重复上传时：当前用户是否有权覆盖该记录 */
  canOverwrite?: boolean;
  constructor(
    status: number,
    message: string,
    extra?: { existingId?: string; retryAfter?: number; remaining?: number; canOverwrite?: boolean },
  ) {
    super(message);
    this.status = status;
    this.existingId = extra?.existingId;
    this.retryAfter = extra?.retryAfter;
    this.remaining = extra?.remaining;
    this.canOverwrite = extra?.canOverwrite;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `请求失败（${res.status}）`;
  let existingId: string | undefined;
  let retryAfter: number | undefined;
  let remaining: number | undefined;
  let canOverwrite: boolean | undefined;
  try {
    const data = (await res.json()) as {
      error?: string;
      existingId?: string;
      retryAfter?: number;
      remaining?: number;
      canOverwrite?: boolean;
    };
    if (data?.error) message = data.error;
    if (data?.existingId) existingId = data.existingId;
    if (typeof data?.retryAfter === 'number') retryAfter = data.retryAfter;
    if (typeof data?.remaining === 'number') remaining = data.remaining;
    if (typeof data?.canOverwrite === 'boolean') canOverwrite = data.canOverwrite;
  } catch {
    /* 非 JSON 响应 */
  }
  return new ApiError(res.status, message, { existingId, retryAfter, remaining, canOverwrite });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(withBase(path), { ...init, headers });
  } catch {
    // fetch 在网络层失败（后端未启动、断网、代理断开等），给出可自诊断的提示
    throw new ApiError(0, '无法连接后端服务，请确认后端已启动（网络错误）');
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 后端探活：上传/登录前可用它提前发现“后端没启动” */
export async function apiHealth(): Promise<{ ok: boolean }> {
  return request('/api/health');
}

/* ---------- Auth ---------- */

export interface CaptchaData {
  captchaId: string;
  svg: string;
}

export async function apiCaptcha(): Promise<CaptchaData> {
  return request('/api/auth/captcha');
}

export async function apiRegister(
  username: string,
  password: string,
  confirmPassword: string,
  captchaId: string,
  captcha: string,
): Promise<{ token: string; user: { id: string; username: string } }> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, confirmPassword, captchaId, captcha }),
  });
}

export async function apiLogin(
  username: string,
  password: string,
  captchaId: string,
  captcha: string,
): Promise<{ token: string; user: { id: string; username: string } }> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captchaId, captcha }),
  });
}

export async function apiMe(): Promise<{ id: string; username: string; createdAt: string }> {
  return request('/api/auth/me');
}

/* ---------- Mods ---------- */

export interface ListParams {
  q?: string;
  category?: string;
  sort?: 'newest' | 'popular' | 'biggest';
  page?: number;
  pageSize?: number;
}

export async function apiListPublicMods(params: ListParams = {}): Promise<PagedResult<ModRecord>> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.sort) sp.set('sort', params.sort);
  sp.set('page', String(params.page ?? 1));
  sp.set('pageSize', String(params.pageSize ?? 12));
  return request(`/api/mods?${sp.toString()}`);
}

export async function apiMyMods(params: { q?: string; page?: number; pageSize?: number } = {}): Promise<PagedResult<ModRecord>> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  sp.set('page', String(params.page ?? 1));
  sp.set('pageSize', String(params.pageSize ?? 12));
  return request(`/api/mods/mine?${sp.toString()}`);
}

export async function apiTeamMods(teamId: string, page = 1, pageSize = 12): Promise<PagedResult<ModRecord>> {
  return request(`/api/mods/team/${encodeURIComponent(teamId)}?page=${page}&pageSize=${pageSize}`);
}

export async function apiGetMod(id: string): Promise<ModRecord> {
  return request(`/api/mods/${encodeURIComponent(id)}`);
}

export interface UploadOptions {
  files: File[];
  scope: 'personal' | 'team' | 'public';
  teamId?: string;
  visibility?: 'private' | 'team' | 'public';
  title?: string;
  description?: string;
  category?: string;
  tags?: string;
  /** 拆分发布：压缩包/文件夹含多个 Mod 时，每个 Mod 单独一条记录 */
  split?: boolean;
  /** 遇到重复直接覆盖（默认 false 时返回 409 让前端询问） */
  overwrite?: boolean;
  /** 仅覆盖这些已存在记录 id（前端确认弹窗后回传） */
  overwriteIds?: string[];
  onProgress?: (percent: number) => void;
}

/** 拆分模式中跳过的子 Mod 及原因 */
export interface UploadSkippedItem {
  name: string;
  reason: string;
  existingId?: string;
  canOverwrite?: boolean;
}

/** 拆分模式响应：一次上传产生多条记录（被覆盖的条目带 replaced=true） */
export interface SplitUploadResult {
  mode: 'split';
  created: Array<ModRecord & { replaced?: boolean }>;
  skipped: UploadSkippedItem[];
}

/** 单条模式响应：一条记录（覆盖更新时 replaced=true） */
export type SingleUploadResult = ModRecord & { mode?: 'single'; replaced?: boolean };

export type UploadResult = SingleUploadResult | SplitUploadResult;

export function isSplitResult(r: UploadResult): r is SplitUploadResult {
  return (r as SplitUploadResult).mode === 'split' && Array.isArray((r as SplitUploadResult).created);
}

/**
 * 上传 Mod：用 XMLHttpRequest 以支持进度条（fetch 尚无上传进度）。
 * files 为 File[]；相对路径通过 webkitRelativePath 或 name 还原。
 */
export function apiUploadMod(opts: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of opts.files) fd.append('files', f, f.name);
    const relPaths = opts.files.map((f) => {
      const anyF = f as File & { webkitRelativePath?: string };
      return (anyF.webkitRelativePath || f.name).replace(/\\/g, '/');
    });
    fd.append('relativePaths', JSON.stringify(relPaths));
    fd.append('scope', opts.scope);
    if (opts.teamId) fd.append('teamId', opts.teamId);
    if (opts.visibility) fd.append('visibility', opts.visibility);
    if (opts.title) fd.append('title', opts.title);
    if (opts.description) fd.append('description', opts.description);
    if (opts.category) fd.append('category', opts.category);
    if (opts.tags) fd.append('tags', opts.tags);
    fd.append('split', opts.split ? '1' : '0');
    if (opts.overwrite) fd.append('overwrite', '1');
    if (opts.overwriteIds && opts.overwriteIds.length > 0) {
      fd.append('overwriteIds', JSON.stringify(opts.overwriteIds.slice(0, 200)));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', withBase('/api/mods/upload'));
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}') as UploadResult & {
          error?: string;
          existingId?: string;
          canOverwrite?: boolean;
        };
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          reject(
            new ApiError(xhr.status, data.error || `上传失败（${xhr.status}）`, {
              existingId: data.existingId,
              canOverwrite: data.canOverwrite,
            }),
          );
        }
      } catch {
        reject(new ApiError(xhr.status, `上传失败（${xhr.status}）`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, '网络连接失败：上传被中断。请确认后端服务已启动、网络稳定后重试'));
    xhr.ontimeout = () => reject(new ApiError(0, '上传超时，请检查网络后重试'));
    xhr.send(fd);
  });
}

export async function apiUpdateMod(
  id: string,
  patch: { title?: string; description?: string; category?: string; tags?: string[]; visibility?: string },
): Promise<ModRecord> {
  return request(`/api/mods/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteMod(id: string): Promise<{ ok: boolean }> {
  return request(`/api/mods/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function modDownloadUrl(id: string): string {
  return withBase(`/api/mods/${encodeURIComponent(id)}/download`);
}

export function modPreviewUrl(modId: string, file: string): string {
  return withBase(`/api/mods/${encodeURIComponent(modId)}/preview/${encodeURIComponent(file)}`);
}

/**
 * 带鉴权下载私有/团队 Mod：
 * 浏览器直接点 <a href> 不会携带 Authorization 头，私有 Mod 会 403，
 * 因此先带 Token fetch 成 Blob，再用临时链接触发保存。
 * （代价是文件会先进入内存；公开 Mod 请直接用 modDownloadUrl 由浏览器流式下载）
 */
export async function downloadModFile(id: string, fileName?: string): Promise<void> {
  const token = getToken();
  const res = await fetch(modDownloadUrl(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'mod-download.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，确保各浏览器完成下载启动
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 拉取需要鉴权的图片（私有/团队 Mod 预览图）为 object URL */
export async function fetchAuthedObjectUrl(url: string): Promise<string> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/* ---------- Teams ---------- */

export async function apiMyTeams(): Promise<TeamRecord[]> {
  return request('/api/teams/mine');
}

export async function apiCreateTeam(name: string, description: string): Promise<TeamRecord> {
  return request('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function apiTeamDetail(id: string): Promise<TeamDetail> {
  return request(`/api/teams/${encodeURIComponent(id)}`);
}

export async function apiInviteMember(teamId: string, username: string): Promise<{ teamId: string; userId: string; username: string }> {
  return request(`/api/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
}

export async function apiRemoveMember(teamId: string, userId: string): Promise<{ ok: boolean }> {
  return request(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export async function apiDeleteTeam(teamId: string): Promise<{ ok: boolean; removedMods: number }> {
  return request(`/api/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
}

/* ---------- Storage ---------- */

export async function apiQuota(): Promise<QuotaInfo> {
  return request('/api/storage/quota');
}
