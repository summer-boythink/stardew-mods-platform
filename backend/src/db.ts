import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import type { ModRecord, TeamMemberRecord, TeamRecord, UserRecord } from './types';

/**
 * SQLite 数据访问层（bun:sqlite，同步 API + WAL + 事务）
 *
 * 相比此前 JSON 文件库的关键改进：
 * - 唯一约束由数据库保证（用户名、团队成员），并发注册/邀请不可能产生重复
 * - 多步操作（查重 + 配额 + 写入）放进同一个 IMMEDIATE 事务，原子完成
 * - WAL 模式，读写并发安全，写入不再全量重写文件
 * - 首次启动自动从旧 db.json 迁移数据（迁移后自动备份为 .bak）
 */

/* ---------- 行结构与映射 ---------- */

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

interface TeamRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  owner_name: string;
  created_at: string;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  username: string;
  joined_at: string;
  role: string;
}

interface ModRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  scope: string;
  visibility: string;
  owner_id: string;
  owner_name: string;
  team_id: string | null;
  team_name: string | null;
  sub_mods: string;
  file_name: string;
  file_size: number;
  file_count: number;
  file_tree: string;
  preview_images: string;
  download_count: number;
  created_at: string;
  updated_at: string;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function toUser(row: UserRow): UserRecord {
  return { id: row.id, username: row.username, passwordHash: row.password_hash, createdAt: row.created_at };
}

function toTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
  };
}

function toMember(row: MemberRow): TeamMemberRecord {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    username: row.username,
    joinedAt: row.joined_at,
    role: row.role === 'owner' ? 'owner' : 'member',
  };
}

function toMod(row: ModRow): ModRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category as ModRecord['category'],
    tags: safeParse<string[]>(row.tags, []),
    scope: row.scope as ModRecord['scope'],
    visibility: row.visibility as ModRecord['visibility'],
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    teamId: row.team_id,
    teamName: row.team_name,
    subMods: safeParse<ModRecord['subMods']>(row.sub_mods, []),
    fileName: row.file_name,
    fileSize: row.file_size,
    fileCount: row.file_count,
    fileTree: safeParse<ModRecord['fileTree']>(row.file_tree, []),
    previewImages: safeParse<string[]>(row.preview_images, []),
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** updateMod 允许修改的字段（其余字段如 id/ownerId/createdAt 不可通过此接口改动） */
export type ModPatch = Partial<
  Pick<
    ModRecord,
    | 'slug'
    | 'title'
    | 'description'
    | 'category'
    | 'tags'
    | 'scope'
    | 'visibility'
    | 'teamId'
    | 'teamName'
    | 'subMods'
    | 'fileName'
    | 'fileSize'
    | 'fileCount'
    | 'fileTree'
    | 'previewImages'
    | 'updatedAt'
  >
>;

export interface UsageSummary {
  bytes: number;
  count: number;
}

export interface ModListFilter {
  visibility?: 'public' | 'private' | 'team';
  ownerId?: string;
  teamId?: string;
}

type RunResult = { changes: number; lastInsertRowid: number | bigint };

/** 旧 JSON 库的结构（仅用于一次性迁移） */
interface LegacyJsonShape {
  users?: UserRecord[];
  teams?: TeamRecord[];
  members?: TeamMemberRecord[];
  mods?: ModRecord[];
}

export class AppDatabase {
  private db: Database;
  private cache = new Map<string, ReturnType<Database['prepare']>>();

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.initSchema();
    if (file !== ':memory:') this.migrateLegacyJsonIfNeeded(file);
  }

  /** 预编译语句缓存（同一 SQL 只 prepare 一次） */
  private stmt(sql: string): ReturnType<Database['prepare']> {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id             TEXT PRIMARY KEY,
        username       TEXT NOT NULL,
        username_lower TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS teams (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id    TEXT NOT NULL,
        owner_name  TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS team_members (
        team_id   TEXT NOT NULL,
        user_id   TEXT NOT NULL,
        username  TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        role      TEXT NOT NULL,
        PRIMARY KEY (team_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS mods (
        id             TEXT PRIMARY KEY,
        slug           TEXT NOT NULL,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        category       TEXT NOT NULL,
        tags           TEXT NOT NULL DEFAULT '[]',
        scope          TEXT NOT NULL,
        visibility     TEXT NOT NULL,
        owner_id       TEXT NOT NULL,
        owner_name     TEXT NOT NULL,
        team_id        TEXT,
        team_name      TEXT,
        sub_mods       TEXT NOT NULL DEFAULT '[]',
        file_name      TEXT NOT NULL,
        file_size      INTEGER NOT NULL DEFAULT 0,
        file_count     INTEGER NOT NULL DEFAULT 0,
        file_tree      TEXT NOT NULL DEFAULT '[]',
        preview_images TEXT NOT NULL DEFAULT '[]',
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mods_visibility ON mods(visibility);
      CREATE INDEX IF NOT EXISTS idx_mods_owner      ON mods(owner_id);
      CREATE INDEX IF NOT EXISTS idx_mods_team       ON mods(team_id);
      CREATE INDEX IF NOT EXISTS idx_members_user    ON team_members(user_id);
    `);
  }

  /**
   * 事务包装：IMMEDIATE 模式立即拿写锁，避免并发写冲突；
   * 支持嵌套（bun:sqlite 自动用 SAVEPOINT 处理）。
   */
  tx<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* 已关闭时忽略 */
    }
  }

  /* ---------- 用户 ---------- */

  /** 创建用户；用户名（不区分大小写）已存在时返回 false（唯一索引兜底并发） */
  createUser(user: UserRecord): boolean {
    try {
      this.stmt(
        'INSERT INTO users (id, username, username_lower, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(user.id, user.username, user.username.toLowerCase(), user.passwordHash, user.createdAt);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE') || msg.includes('constraint')) return false;
      throw e;
    }
  }

  findUserByUsername(username: string): UserRecord | null {
    const row = this.stmt('SELECT * FROM users WHERE username_lower = ?').get(username.toLowerCase()) as
      | UserRow
      | null;
    return row ? toUser(row) : null;
  }

  getUserById(id: string): UserRecord | null {
    const row = this.stmt('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
    return row ? toUser(row) : null;
  }

  /* ---------- 团队 ---------- */

  createTeam(team: TeamRecord, ownerMember: TeamMemberRecord): void {
    this.tx(() => {
      this.stmt(
        'INSERT INTO teams (id, name, description, owner_id, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(team.id, team.name, team.description, team.ownerId, team.ownerName, team.createdAt);
      this.stmt(
        'INSERT INTO team_members (team_id, user_id, username, joined_at, role) VALUES (?, ?, ?, ?, ?)',
      ).run(ownerMember.teamId, ownerMember.userId, ownerMember.username, ownerMember.joinedAt, ownerMember.role);
    });
  }

  getTeam(id: string): TeamRecord | null {
    const row = this.stmt('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | null;
    return row ? toTeam(row) : null;
  }

  listTeamsForUser(userId: string): TeamRecord[] {
    const rows = this.stmt(
      'SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.created_at ASC',
    ).all(userId) as TeamRow[];
    return rows.map(toTeam);
  }

  isMember(teamId: string, userId: string): boolean {
    const row = this.stmt('SELECT 1 AS ok FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
    return !!row;
  }

  listMembers(teamId: string): TeamMemberRecord[] {
    const rows = this.stmt(
      "SELECT * FROM team_members WHERE team_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, joined_at ASC",
    ).all(teamId) as MemberRow[];
    return rows.map(toMember);
  }

  listMemberships(userId: string): TeamMemberRecord[] {
    const rows = this.stmt('SELECT * FROM team_members WHERE user_id = ?').all(userId) as MemberRow[];
    return rows.map(toMember);
  }

  /** 加入成员；已是成员时返回 false（复合主键兜底并发） */
  addMember(member: TeamMemberRecord): boolean {
    const res = this.stmt(
      'INSERT OR IGNORE INTO team_members (team_id, user_id, username, joined_at, role) VALUES (?, ?, ?, ?, ?)',
    ).run(member.teamId, member.userId, member.username, member.joinedAt, member.role) as RunResult;
    return res.changes > 0;
  }

  removeMember(teamId: string, userId: string): void {
    this.stmt('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
  }

  /** 解散团队：删除团队、成员与团队下所有 Mod 记录，返回被删除的 Mod id（供物理文件清理） */
  deleteTeamCascade(teamId: string): string[] {
    return this.tx(() => {
      const rows = this.stmt('SELECT id FROM mods WHERE team_id = ?').all(teamId) as Array<{ id: string }>;
      this.stmt('DELETE FROM mods WHERE team_id = ?').run(teamId);
      this.stmt('DELETE FROM teams WHERE id = ?').run(teamId);
      this.stmt('DELETE FROM team_members WHERE team_id = ?').run(teamId);
      return rows.map((r) => r.id);
    });
  }

  /* ---------- Mod ---------- */

  insertMod(mod: ModRecord): void {
    this.stmt(
      `INSERT INTO mods (
        id, slug, title, description, category, tags, scope, visibility,
        owner_id, owner_name, team_id, team_name, sub_mods,
        file_name, file_size, file_count, file_tree, preview_images,
        download_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mod.id,
      mod.slug,
      mod.title,
      mod.description,
      mod.category,
      JSON.stringify(mod.tags),
      mod.scope,
      mod.visibility,
      mod.ownerId,
      mod.ownerName,
      mod.teamId,
      mod.teamName,
      JSON.stringify(mod.subMods),
      mod.fileName,
      mod.fileSize,
      mod.fileCount,
      JSON.stringify(mod.fileTree),
      JSON.stringify(mod.previewImages),
      mod.downloadCount,
      mod.createdAt,
      mod.updatedAt,
    );
  }

  getMod(id: string): ModRecord | null {
    const row = this.stmt('SELECT * FROM mods WHERE id = ?').get(id) as ModRow | null;
    return row ? toMod(row) : null;
  }

  listMods(filter: ModListFilter = {}): ModRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.visibility) {
      where.push('visibility = ?');
      params.push(filter.visibility);
    }
    if (filter.ownerId) {
      where.push('owner_id = ?');
      params.push(filter.ownerId);
    }
    if (filter.teamId) {
      where.push('team_id = ?');
      params.push(filter.teamId);
    }
    const sql = `SELECT * FROM mods${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
    const rows = this.stmt(sql).all(...(params as never[])) as ModRow[];
    return rows.map(toMod);
  }

  updateMod(id: string, patch: ModPatch): ModRecord | null {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown): void => {
      sets.push(`${col} = ?`);
      values.push(v);
    };
    if (patch.slug !== undefined) set('slug', patch.slug);
    if (patch.title !== undefined) set('title', patch.title);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.category !== undefined) set('category', patch.category);
    if (patch.tags !== undefined) set('tags', JSON.stringify(patch.tags));
    if (patch.scope !== undefined) set('scope', patch.scope);
    if (patch.visibility !== undefined) set('visibility', patch.visibility);
    if (patch.teamId !== undefined) set('team_id', patch.teamId);
    if (patch.teamName !== undefined) set('team_name', patch.teamName);
    if (patch.subMods !== undefined) set('sub_mods', JSON.stringify(patch.subMods));
    if (patch.fileName !== undefined) set('file_name', patch.fileName);
    if (patch.fileSize !== undefined) set('file_size', patch.fileSize);
    if (patch.fileCount !== undefined) set('file_count', patch.fileCount);
    if (patch.fileTree !== undefined) set('file_tree', JSON.stringify(patch.fileTree));
    if (patch.previewImages !== undefined) set('preview_images', JSON.stringify(patch.previewImages));
    if (patch.updatedAt !== undefined) set('updated_at', patch.updatedAt);
    if (sets.length === 0) return this.getMod(id);
    values.push(id);
    this.stmt(`UPDATE mods SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
    return this.getMod(id);
  }

  /** 删除并返回原记录（供调用方清理物理文件） */
  deleteMod(id: string): ModRecord | null {
    return this.tx(() => {
      const mod = this.getMod(id);
      if (!mod) return null;
      this.stmt('DELETE FROM mods WHERE id = ?').run(id);
      return mod;
    });
  }

  incrementDownload(id: string): void {
    this.stmt('UPDATE mods SET download_count = download_count + 1 WHERE id = ?').run(id);
  }

  /**
   * 在指定计费空间内按 UniqueID 查重（大小写不敏感）。
   * 计费空间：团队 = team_id 相同；个人 = owner 相同且不属于任何团队。
   */
  findDuplicateMod(uniqueIdsLower: string[], userId: string, teamId: string | null): ModRecord | null {
    const wanted = uniqueIdsLower.filter(Boolean);
    if (wanted.length === 0) return null;
    const rows = teamId
      ? (this.stmt('SELECT * FROM mods WHERE team_id = ?').all(teamId) as ModRow[])
      : (this.stmt('SELECT * FROM mods WHERE team_id IS NULL AND owner_id = ?').all(userId) as ModRow[]);
    for (const row of rows) {
      const ids = new Set(
        safeParse<ModRecord['subMods']>(row.sub_mods, [])
          .map((s) => (s.uniqueId || '').toLowerCase())
          .filter(Boolean),
      );
      if (wanted.some((id) => ids.has(id))) return toMod(row);
    }
    return null;
  }

  /**
   * 计费空间用量（与旧 JSON 版本语义完全一致）：
   * - personal：本人名下、不属于团队、scope 为 personal/public 的 Mod
   * - team：team_id 匹配的全部 Mod
   */
  usageOf(scope: 'personal' | 'team', ownerId: string, teamId: string | null): UsageSummary {
    if (scope === 'team') {
      const r = this.stmt(
        'SELECT COALESCE(SUM(file_size), 0) AS bytes, COUNT(*) AS count FROM mods WHERE team_id = ?',
      ).get(teamId) as { bytes: number; count: number };
      return { bytes: r.bytes, count: r.count };
    }
    const r = this.stmt(
      "SELECT COALESCE(SUM(file_size), 0) AS bytes, COUNT(*) AS count FROM mods WHERE owner_id = ? AND team_id IS NULL AND scope IN ('personal', 'public')",
    ).get(ownerId) as { bytes: number; count: number };
    return { bytes: r.bytes, count: r.count };
  }

  /* ---------- 旧数据迁移 ---------- */

  private migrateLegacyJsonIfNeeded(file: string): void {
    const jsonPath = path.join(path.dirname(file), 'db.json');
    if (!fs.existsSync(jsonPath)) return;
    const userCount = (this.stmt('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    const modCount = (this.stmt('SELECT COUNT(*) AS c FROM mods').get() as { c: number }).c;
    if (userCount > 0 || modCount > 0) return; // 已有数据，不重复导入

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8').trim();
      if (!raw) throw new Error('文件为空');
      const legacy = JSON.parse(raw) as LegacyJsonShape;
      let imported = { users: 0, teams: 0, members: 0, mods: 0 };
      this.tx(() => {
        for (const u of legacy.users ?? []) {
          if (u?.id && u?.username && u?.passwordHash) {
            if (this.createUser(u)) imported.users += 1;
          }
        }
        for (const t of legacy.teams ?? []) {
          if (t?.id && t?.name && t?.ownerId) {
            this.stmt(
              'INSERT OR IGNORE INTO teams (id, name, description, owner_id, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(t.id, t.name, t.description ?? '', t.ownerId, t.ownerName ?? '', t.createdAt ?? new Date().toISOString());
            imported.teams += 1;
          }
        }
        for (const m of legacy.members ?? []) {
          if (m?.teamId && m?.userId && m?.username) {
            if (this.addMember(m)) imported.members += 1;
          }
        }
        for (const mod of legacy.mods ?? []) {
          if (mod?.id && mod?.ownerId && mod?.fileName) {
            this.insertMod(mod);
            imported.mods += 1;
          }
        }
      });
      const bak = `${jsonPath}.migrated-${Date.now()}.bak`;
      fs.renameSync(jsonPath, bak);
      console.log(
        `[db] 已从旧 db.json 迁移到 SQLite：${imported.users} 用户 / ${imported.teams} 团队 / ${imported.members} 成员 / ${imported.mods} Mod（备份 ${path.basename(bak)}）`,
      );
    } catch (e) {
      console.error('[db] db.json 迁移失败（保留原文件，SQLite 空库启动）：', e);
    }
  }
}

let singleton: AppDatabase | null = null;

/** 获取全局数据库实例（app 启动时调用 initDb 创建） */
export function getDb(): AppDatabase {
  if (!singleton) throw new Error('数据库尚未初始化：请先调用 initDb()');
  return singleton;
}

/** 初始化全局数据库（幂等）；返回实例 */
export function initDb(file: string): AppDatabase {
  if (!singleton) singleton = new AppDatabase(file);
  return singleton;
}

/** 仅测试用：关闭并清空单例 */
export function __resetDbSingleton(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
