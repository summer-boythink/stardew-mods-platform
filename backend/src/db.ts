import fs from 'node:fs';
import path from 'node:path';
import type { ModRecord, TeamMemberRecord, TeamRecord, UserRecord } from './types';

export interface DatabaseShape {
  users: UserRecord[];
  teams: TeamRecord[];
  members: TeamMemberRecord[];
  mods: ModRecord[];
}

export type { ModRecord, TeamMemberRecord, TeamRecord, UserRecord };

const EMPTY: DatabaseShape = { users: [], teams: [], members: [], mods: [] };

/**
 * 极简文件数据库：
 * - 启动时全量读入内存，写时原子落盘（tmp + rename）
 * - 用 promise 链串行化写操作，避免并发覆盖
 * - 数据量（用户/Mod 元数据）适合中小型交流平台，无需外部数据库
 */
export class JsonDb {
  private file: string;
  private data: DatabaseShape;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
    this.data = this.load();
  }

  private load(): DatabaseShape {
    try {
      if (!fs.existsSync(this.file)) return structuredClone(EMPTY);
      const raw = fs.readFileSync(this.file, 'utf-8');
      if (!raw.trim()) return structuredClone(EMPTY);
      const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        teams: Array.isArray(parsed.teams) ? parsed.teams : [],
        members: Array.isArray(parsed.members) ? parsed.members : [],
        mods: Array.isArray(parsed.mods) ? parsed.mods : [],
      };
    } catch {
      // 文件损坏时不直接覆盖，先备份再用空库启动，避免丢数据还不自知
      try {
        const backup = `${this.file}.corrupt.${Date.now()}.bak`;
        fs.copyFileSync(this.file, backup);
      } catch {
        /* ignore */
      }
      return structuredClone(EMPTY);
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    const run = async () => {
      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, snapshot, 'utf-8');
      fs.renameSync(tmp, this.file);
    };
    this.writeChain = this.writeChain.then(run, run);
    return this.writeChain;
  }

  read(): DatabaseShape {
    return this.data;
  }

  async mutate(fn: (data: DatabaseShape) => void): Promise<void> {
    fn(this.data);
    await this.persist();
  }
}

let singleton: JsonDb | null = null;

export function getDb(file: string): JsonDb {
  if (!singleton) singleton = new JsonDb(file);
  return singleton;
}

/** 仅供测试：重置单例 */
export function __resetDbSingleton(): void {
  singleton = null;
}
