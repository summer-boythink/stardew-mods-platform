import type { ModRecord, PagedResult, QuotaInfo, TeamDetail, TeamRecord } from '../types';

const TOKEN_KEY = 'stardew_token';

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
  constructor(status: number, message: string, extra?: { existingId?: string; retryAfter?: number; remaining?: number }) {
    super(message);
    this.status = status;
    this.existingId = extra?.existingId;
    this.retryAfter = extra?.retryAfter;
    this.remaining = extra?.remaining;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `请求失败（${res.status}）`;
  let existingId: string | undefined;
  let retryAfter: number | undefined;
  let remaining: number | undefined;
  try {
    const data = (await res.json()) as { error?: string; existingId?: string; retryAfter?: number; remaining?: number };
    if (data?.error) message = data.error;
    if (data?.existingId) existingId = data.existingId;
    if (typeof data?.retryAfter === 'number') retryAfter = data.retryAfter;
    if (typeof data?.remaining === 'number') remaining = data.remaining;
  } catch {
    /* 非 JSON 响应 */
  }
  return new ApiError(res.status, message, { existingId, retryAfter, remaining });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  onProgress?: (percent: number) => void;
}

/**
 * 上传 Mod：用 XMLHttpRequest 以支持进度条（fetch 尚无上传进度）。
 * files 为 File[]；相对路径通过 webkitRelativePath 或 name 还原。
 */
export function apiUploadMod(opts: UploadOptions): Promise<ModRecord> {
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

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/mods/upload');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}') as ModRecord & { error?: string; existingId?: string };
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(xhr.status, data.error || `上传失败（${xhr.status}）`, { existingId: data.existingId }));
      } catch {
        reject(new ApiError(xhr.status, `上传失败（${xhr.status}）`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, '网络错误，上传失败'));
    xhr.ontimeout = () => reject(new ApiError(0, '上传超时，请重试'));
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
  return `/api/mods/${encodeURIComponent(id)}/download`;
}

export function modPreviewUrl(modId: string, file: string): string {
  return `/api/mods/${encodeURIComponent(modId)}/preview/${encodeURIComponent(file)}`;
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
