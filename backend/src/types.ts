/**
 * 后端内部类型：从 shared 透出，避免 backend 直接依赖 workspace 协议带来的安装复杂度。
 * 与 shared/src/index.ts 保持一致（字段增减时两边同步修改）。
 */

export type StorageScope = 'personal' | 'team' | 'public';
export type ModVisibility = 'private' | 'team' | 'public';

export type ModCategory =
  | 'SMAPI框架'
  | 'Content Patcher'
  | '美化贴图'
  | '功能玩法'
  | '农场地图'
  | '人物肖像'
  | '汉化'
  | '工具辅助'
  | '合集包'
  | '其他';

export const MOD_CATEGORIES: ModCategory[] = [
  'SMAPI框架',
  'Content Patcher',
  '美化贴图',
  '功能玩法',
  '农场地图',
  '人物肖像',
  '汉化',
  '工具辅助',
  '合集包',
  '其他',
];

export interface SmapiManifest {
  Name?: string;
  Author?: string;
  Version?: string;
  Description?: string;
  UniqueID?: string;
  MinimumApiVersion?: string;
  UpdateKeys?: string[];
  ContentPackFor?: {
    ID?: string;
    MinimumVersion?: string;
  } | null;
  Dependencies?: Array<{
    ID?: string;
    MinimumVersion?: string | null;
    IsRequired?: boolean;
  }>;
  [key: string]: unknown;
}

export interface ParsedModInfo {
  name: string;
  author: string;
  version: string;
  description: string;
  uniqueId: string;
  category: ModCategory;
  tags: string[];
  manifestPath: string;
  fileCount: number;
  hasManifest: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children?: FileTreeNode[];
}

export interface ModRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: ModCategory;
  tags: string[];
  scope: StorageScope;
  visibility: ModVisibility;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  teamName: string | null;
  subMods: ParsedModInfo[];
  fileName: string;
  fileSize: number;
  fileCount: number;
  fileTree: FileTreeNode[];
  previewImages: string[];
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

export interface TeamMemberRecord {
  teamId: string;
  userId: string;
  username: string;
  joinedAt: string;
  role: 'owner' | 'member';
}

export interface QuotaInfo {
  scope: StorageScope;
  teamId: string | null;
  teamName: string | null;
  usedBytes: number;
  limitBytes: number;
  modCount: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

export function modCategoryFromManifest(manifest: SmapiManifest, fileNames: string[]): ModCategory {
  const cpId = manifest?.ContentPackFor?.ID?.toLowerCase() ?? '';
  const name = `${manifest?.Name ?? ''}`.toLowerCase();
  const desc = `${manifest?.Description ?? ''}`.toLowerCase();
  const deps = (manifest?.Dependencies ?? []).map((d) => `${d?.ID ?? ''}`.toLowerCase());
  const joinedFiles = fileNames.join('\n').toLowerCase();
  const hay = `${name}\n${desc}\n${joinedFiles}`;
  if (cpId.includes('contentpatcher') || deps.some((d) => d.includes('contentpatcher'))) {
    if (hay.includes('portrait') || hay.includes('肖像') || hay.includes('立绘')) return '人物肖像';
    if (hay.includes('farm') && (hay.includes('map') || hay.includes('地图') || hay.includes('农场'))) return '农场地图';
    if (
      hay.includes('.png') ||
      hay.includes('美化') ||
      hay.includes('贴图') ||
      hay.includes('recolor') ||
      hay.includes('retexture')
    ) {
      return '美化贴图';
    }
    return 'Content Patcher';
  }
  if (hay.includes('chinese') || hay.includes('translation') || hay.includes('汉化') || name.includes('汉化')) return '汉化';
  if (hay.includes('farm') && hay.includes('map')) return '农场地图';
  if (hay.includes('portrait') || hay.includes('肖像') || hay.includes('立绘')) return '人物肖像';
  if (
    hay.includes('.xnb') ||
    hay.includes('recolor') ||
    hay.includes('retexture') ||
    hay.includes('美化') ||
    hay.includes('贴图')
  ) {
    return '美化贴图';
  }
  if (hay.includes('smapi') && (hay.includes('api') || name.length < 30)) {
    if (hay.includes('framework') || hay.includes('框架')) return 'SMAPI框架';
  }
  if (
    hay.includes('helper') ||
    hay.includes('menu') ||
    hay.includes('ui') ||
    hay.includes('工具') ||
    hay.includes('辅助')
  ) {
    return '工具辅助';
  }
  return '功能玩法';
}
