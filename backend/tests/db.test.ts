import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../src/db';
import type { ModRecord, TeamRecord, UserRecord } from '../src/types';

function freshDb(): AppDatabase {
  return new AppDatabase(':memory:');
}

function makeUser(id: string, username: string): UserRecord {
  return { id, username, passwordHash: 'h', createdAt: new Date().toISOString() };
}

function makeTeam(id: string, ownerId: string): TeamRecord {
  return { id, name: `team-${id}`, description: '', ownerId, ownerName: ownerId, createdAt: new Date().toISOString() };
}

function makeMod(over: Partial<ModRecord>): ModRecord {
  const now = new Date().toISOString();
  return {
    id: over.id ?? 'mod-1',
    slug: 'demo',
    title: '演示',
    description: '',
    category: '功能玩法',
    tags: ['a'],
    scope: 'personal',
    visibility: 'private',
    ownerId: 'u1',
    ownerName: 'u1',
    teamId: null,
    teamName: null,
    subMods: [
      {
        name: '演示',
        author: 't',
        version: '1.0.0',
        description: '',
        uniqueId: 'T.Demo',
        category: '功能玩法',
        tags: [],
        manifestPath: 'manifest.json',
        fileCount: 1,
        hasManifest: true,
      },
    ],
    fileName: 'a.zip',
    fileSize: 100,
    fileCount: 1,
    fileTree: [],
    previewImages: ['p.png'],
    downloadCount: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('AppDatabase（SQLite 数据层）', () => {
  test('用户唯一性：并发同名（不同大小写）只能成功一次', () => {
    const db = freshDb();
    expect(db.createUser(makeUser('u1', 'Alice'))).toBe(true);
    expect(db.createUser(makeUser('u2', 'alice'))).toBe(false);
    expect(db.createUser(makeUser('u3', 'ALICE'))).toBe(false);
    expect(db.findUserByUsername('aLiCe')?.id).toBe('u1');
    db.close();
  });

  test('团队成员：重复加入被拒绝（复合主键）', () => {
    const db = freshDb();
    db.createUser(makeUser('u1', 'owner'));
    db.createUser(makeUser('u2', 'member'));
    db.createTeam(makeTeam('t1', 'u1'), {
      teamId: 't1',
      userId: 'u1',
      username: 'owner',
      joinedAt: new Date().toISOString(),
      role: 'owner',
    });
    const add = (uid: string): boolean =>
      db.addMember({ teamId: 't1', userId: uid, username: uid, joinedAt: new Date().toISOString(), role: 'member' });
    expect(add('u2')).toBe(true);
    expect(add('u2')).toBe(false);
    expect(db.listMembers('t1').length).toBe(2);
    db.close();
  });

  test('查重按计费空间隔离（个人 vs 团队）', () => {
    const db = freshDb();
    db.insertMod(makeMod({ id: 'm1', ownerId: 'u1', teamId: null }));
    // 个人空间命中
    expect(db.findDuplicateMod(['t.demo'], 'u1', null)?.id).toBe('m1');
    // 其他用户看不到
    expect(db.findDuplicateMod(['t.demo'], 'u2', null)).toBe(null);
    // 团队空间不受个人记录影响
    expect(db.findDuplicateMod(['t.demo'], 'u1', 'team-x')).toBe(null);
    db.close();
  });

  test('配额统计语义与旧版一致', () => {
    const db = freshDb();
    db.insertMod(makeMod({ id: 'm1', ownerId: 'u1', scope: 'personal', fileSize: 100 }));
    db.insertMod(makeMod({ id: 'm2', ownerId: 'u1', scope: 'public', fileSize: 200 }));
    db.insertMod(makeMod({ id: 'm3', ownerId: 'u1', scope: 'team', teamId: 't1', fileSize: 400 }));
    db.insertMod(makeMod({ id: 'm4', ownerId: 'u2', scope: 'public', fileSize: 999 }));
    const personal = db.usageOf('personal', 'u1', null);
    expect(personal.bytes).toBe(300);
    expect(personal.count).toBe(2);
    const team = db.usageOf('team', 'u1', 't1');
    expect(team.bytes).toBe(400);
    expect(team.count).toBe(1);
    db.close();
  });

  test('覆盖更新：保留 id/创建时间/下载数，只替换内容字段', () => {
    const db = freshDb();
    const original = makeMod({ id: 'm1', ownerId: 'u1' });
    db.insertMod(original);
    db.incrementDownload('m1');
    db.incrementDownload('m1');
    const updatedAt = new Date().toISOString();
    const updated = db.updateMod('m1', { fileName: 'new.zip', fileSize: 555, title: '新版', updatedAt });
    expect(updated?.id).toBe('m1');
    expect(updated?.fileName).toBe('new.zip');
    expect(updated?.fileSize).toBe(555);
    expect(updated?.title).toBe('新版');
    expect(updated?.downloadCount).toBe(2);
    expect(updated?.createdAt).toBe(original.createdAt);
    db.close();
  });

  test('解散团队级联删除并返回 Mod id', () => {
    const db = freshDb();
    db.createUser(makeUser('u1', 'owner'));
    db.createTeam(makeTeam('t1', 'u1'), {
      teamId: 't1',
      userId: 'u1',
      username: 'owner',
      joinedAt: new Date().toISOString(),
      role: 'owner',
    });
    db.insertMod(makeMod({ id: 'tm1', teamId: 't1', scope: 'team', fileName: 'x.zip' }));
    db.insertMod(makeMod({ id: 'tm2', teamId: 't1', scope: 'team', fileName: 'y.zip' }));
    db.insertMod(makeMod({ id: 'keep', teamId: null }));
    const removed = db.deleteTeamCascade('t1');
    expect(removed.sort()).toEqual(['tm1', 'tm2']);
    expect(db.getTeam('t1')).toBe(null);
    expect(db.getMod('tm1')).toBe(null);
    expect(db.getMod('keep')?.id).toBe('keep');
    expect(db.listMembers('t1').length).toBe(0);
    db.close();
  });

  test('事务：异常时整体回滚', () => {
    const db = freshDb();
    expect(() =>
      db.tx(() => {
        db.insertMod(makeMod({ id: 'will-rollback' }));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.getMod('will-rollback')).toBe(null);
    db.close();
  });

  test('首次启动自动从旧 db.json 迁移并备份', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stardew-dbmig-'));
    const legacy = {
      users: [
        { id: 'u-legacy', username: '老农夫', passwordHash: 'hash', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      teams: [
        { id: 't-legacy', name: '老团队', description: '', ownerId: 'u-legacy', ownerName: '老农夫', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      members: [
        { teamId: 't-legacy', userId: 'u-legacy', username: '老农夫', joinedAt: '2026-01-01T00:00:00.000Z', role: 'owner' },
      ],
      mods: [makeMod({ id: 'm-legacy', ownerId: 'u-legacy', title: '老数据Mod' })],
    };
    fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(legacy), 'utf-8');

    const db = new AppDatabase(path.join(dir, 'app.db'));
    expect(db.findUserByUsername('老农夫')?.id).toBe('u-legacy');
    expect(db.getTeam('t-legacy')?.name).toBe('老团队');
    expect(db.getMod('m-legacy')?.title).toBe('老数据Mod');
    // 原 db.json 已重命名为 .bak
    expect(fs.existsSync(path.join(dir, 'db.json'))).toBe(false);
    const baks = fs.readdirSync(dir).filter((f) => f.includes('db.json.migrated-') && f.endsWith('.bak'));
    expect(baks.length).toBe(1);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('已有数据时不会重复导入 db.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stardew-dbmig2-'));
    const dbFile = path.join(dir, 'app.db');
    // 1. 先建库并写入数据（此时还没有 db.json）
    const db = new AppDatabase(dbFile);
    db.createUser(makeUser('u1', 'first'));
    db.close();
    // 2. 之后才出现旧的 db.json（模拟历史环境）
    fs.writeFileSync(
      path.join(dir, 'db.json'),
      JSON.stringify({ users: [{ id: 'u2', username: 'second', passwordHash: 'h', createdAt: '2026-01-01T00:00:00.000Z' }] }),
      'utf-8',
    );
    // 3. 重启：库中已有数据，db.json 不应被导入，也不应被改名
    const db2 = new AppDatabase(dbFile);
    expect(db2.findUserByUsername('second')).toBe(null);
    expect(db2.findUserByUsername('first')?.id).toBe('u1');
    expect(fs.existsSync(path.join(dir, 'db.json'))).toBe(true);
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
