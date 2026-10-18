/** 前端类型（与后端/共享保持一致） */

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

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TeamRecord {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  username: string;
  joinedAt: string;
  role: 'owner' | 'member';
}

export interface TeamDetail extends TeamRecord {
  members: TeamMember[];
}

export interface QuotaInfo {
  personal: {
    scope: 'personal';
    teamId: null;
    teamName: null;
    usedBytes: number;
    usedHuman: string;
    limitBytes: number;
    limitHuman: string;
    modCount: number;
  };
  teams: Array<{
    scope: 'team';
    teamId: string;
    teamName: string;
    usedBytes: number;
    usedHuman: string;
    limitBytes: number;
    limitHuman: string;
    modCount: number;
    role: 'owner' | 'member';
  }>;
  serverLimits: { maxUploadBytes: number; maxUploadHuman: string };
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

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}
