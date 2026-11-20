import { describe, expect, test } from 'bun:test';
import {
  attachImportSource,
  parseImportTarget,
  pickCurseForgeFile,
  sanitizeFileName,
} from '../src/services/modImport';
import { AppDatabase } from '../src/db';
import type { ModRecord } from '../src/types';

describe('parseImportTarget（外部 Mod 链接解析）', () => {
  test('Nexus 页面链接与简写', () => {
    expect(parseImportTarget('https://www.nexusmods.com/stardewvalley/mods/2400?tab=files')).toMatchObject({
      provider: 'nexus',
      modId: '2400',
      pageUrl: 'https://www.nexusmods.com/stardewvalley/mods/2400',
    });
    expect(parseImportTarget('nexus:2400')).toMatchObject({ provider: 'nexus', modId: '2400' });
    expect(parseImportTarget('nxm://stardewvalley/mods/2400?key=x&expires=1')).toMatchObject({
      provider: 'nexus',
      modId: '2400',
    });
  });

  test('拒绝非 Stardew 的 Nexus 链接', () => {
    expect(() => parseImportTarget('https://www.nexusmods.com/skyrimspecialedition/mods/123')).toThrow();
  });

  test('CurseForge 数字项目、slug 与指定文件', () => {
    expect(parseImportTarget('https://www.curseforge.com/projects/309243/files/123')).toMatchObject({
      provider: 'curseforge',
      modId: '309243',
      fileId: '123',
    });
    expect(
      parseImportTarget('https://www.curseforge.com/stardewvalley/mods/content-patcher/files/5875670'),
    ).toMatchObject({
      provider: 'curseforge',
      slug: 'content-patcher',
      fileId: '5875670',
    });
    expect(parseImportTarget('https://www.curseforge.com/stardewvalley/utility/smapi')).toMatchObject({
      provider: 'curseforge',
      slug: 'smapi',
    });
    expect(parseImportTarget('curseforge:309243')).toMatchObject({
      provider: 'curseforge',
      modId: '309243',
    });
  });

  test('ModDrop 页面与简写（仅识别，下载由 UI 提示手动）', () => {
    expect(
      parseImportTarget('https://www.moddrop.com/stardew-valley/mods/470174-stardew-valley-expanded'),
    ).toMatchObject({ provider: 'moddrop', modId: '470174' });
    expect(parseImportTarget('moddrop:470174')).toMatchObject({ provider: 'moddrop', modId: '470174' });
  });

  test('未知链接给出可读错误', () => {
    expect(() => parseImportTarget('https://example.com/mod/1')).toThrow();
    expect(() => parseImportTarget('')).toThrow();
  });
});

describe('sanitizeFileName', () => {
  test('去掉路径与非法字符，保留中文和安全扩展名', () => {
    expect(sanitizeFileName('../../春日 美化:包.zip')).toBe('春日 美化_包.zip');
    const long = `${'a'.repeat(300)}.zip`;
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(160);
    expect(sanitizeFileName('')).toBe('mod-download.zip');
  });
});

describe('pickCurseForgeFile', () => {
  test('优先 mainFileId，其次最新的正式版', () => {
    const files = [
      { id: 1, releaseType: 1, fileDate: '2024-01-01', fileLength: 10, isAvailable: true },
      { id: 2, releaseType: 2, fileDate: '2025-01-01', fileLength: 20, isAvailable: true },
      { id: 3, releaseType: 1, fileDate: '2023-01-01', fileLength: 30, isAvailable: true },
    ];
    expect(pickCurseForgeFile({ mainFileId: 2, latestFiles: files })?.id).toBe(2);
    expect(pickCurseForgeFile({ mainFileId: 0, latestFiles: files })?.id).toBe(1);
    expect(pickCurseForgeFile({ mainFileId: 0, latestFiles: files }, 3)?.id).toBe(3);
    expect(pickCurseForgeFile({ mainFileId: 0, latestFiles: [] })).toBe(null);
  });

  test('跳过不可用文件', () => {
    const file = pickCurseForgeFile({
      mainFileId: 0,
      latestFiles: [
        { id: 1, releaseType: 1, fileDate: '2025-01-01', fileLength: 10, isAvailable: false },
        { id: 2, releaseType: 1, fileDate: '2024-01-01', fileLength: 20, isAvailable: true },
      ],
    });
    expect(file?.id).toBe(2);
  });
});


describe('attachImportSource（导入来源写回）', () => {
  test('单条与拆分结果都写入 source，并保留 replaced 标记', () => {
    const db = new AppDatabase(':memory:');
    const now = new Date().toISOString();
    const make = (id: string): ModRecord => ({
      id,
      slug: id,
      title: id,
      description: '',
      category: '功能玩法',
      tags: [],
      scope: 'personal',
      visibility: 'private',
      ownerId: 'u1',
      ownerName: 'u1',
      teamId: null,
      teamName: null,
      subMods: [],
      fileName: 'a.zip',
      fileSize: 1,
      fileCount: 1,
      fileTree: [],
      previewImages: [],
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    db.insertMod(make('single'));
    db.insertMod(make('split-a'));
    db.insertMod(make('split-b'));
    const source = {
      provider: 'nexus' as const,
      url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
      modId: '2400',
      fileVersionId: '123',
    };

    const single = attachImportSource(db, { id: 'single', replaced: true }, source);
    expect(single.replaced).toBe(true);
    expect((single.source as typeof source).provider).toBe('nexus');

    const split = attachImportSource(
      db,
      { mode: 'split', created: [{ id: 'split-a' }, { id: 'split-b', replaced: true }], skipped: [] },
      source,
    );
    const created = split.created as Array<{ id: string; source?: unknown; replaced?: boolean }>;
    expect(created[0]?.source).toMatchObject({ provider: 'nexus' });
    expect(created[1]?.replaced).toBe(true);
    db.close();
  });
});
