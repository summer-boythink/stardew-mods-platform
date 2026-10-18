import { describe, expect, test } from 'bun:test';
import type { ModRecord, SplitUploadResult } from '../src/api/client';
import { mergeSplitResults, overwritableItems } from '../src/utils/mergeSplit';

function makeMod(id: string, title = id): ModRecord {
  const now = new Date().toISOString();
  return {
    id,
    slug: id,
    title,
    description: '',
    category: '功能玩法',
    tags: [],
    scope: 'public',
    visibility: 'public',
    ownerId: 'u1',
    ownerName: 'u1',
    teamId: null,
    teamName: null,
    subMods: [],
    fileName: 'archive.zip',
    fileSize: 1,
    fileCount: 1,
    fileTree: [],
    previewImages: [],
    downloadCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('mergeSplitResults（拆分上传两轮结果合并）', () => {
  test('第二轮覆盖的条目：不再出现在跳过列表，创建列表取最新', () => {
    const first: SplitUploadResult = {
      mode: 'split',
      created: [makeMod('new-1', '新建1')],
      skipped: [{ name: '旧A', reason: '已存在，已跳过（可确认覆盖）', existingId: 'old-a', canOverwrite: true }],
    };
    const second: SplitUploadResult = {
      mode: 'split',
      created: [{ ...makeMod('old-a', '旧A覆盖版'), replaced: true }],
      skipped: [
        // 第一轮创建的 new-1 在第二轮会被报"已存在"，应被忽略
        { name: '新建1', reason: '已存在，已跳过', existingId: 'new-1', canOverwrite: true },
      ],
    };
    const merged = mergeSplitResults(first, second);
    expect(merged.created.map((m) => m.id).sort()).toEqual(['new-1', 'old-a']);
    expect(merged.created.find((m) => m.id === 'old-a')?.title).toBe('旧A覆盖版');
    expect(merged.skipped).toHaveLength(0);
  });

  test('第二轮仍跳过的条目保留，且去重', () => {
    const skipA = { name: 'A', reason: '已存在且由他人上传，无法覆盖', existingId: 'x-1', canOverwrite: false };
    const first: SplitUploadResult = { mode: 'split', created: [], skipped: [skipA] };
    const second: SplitUploadResult = { mode: 'split', created: [], skipped: [skipA] };
    const merged = mergeSplitResults(first, second);
    expect(merged.skipped).toHaveLength(1);
  });

  test('overwritableItems：只挑有权限且有 id 的条目', () => {
    const result: SplitUploadResult = {
      mode: 'split',
      created: [],
      skipped: [
        { name: 'A', reason: '', existingId: '1', canOverwrite: true },
        { name: 'B', reason: '', existingId: '2', canOverwrite: false },
        { name: 'C', reason: '空间不足', canOverwrite: false },
      ],
    };
    expect(overwritableItems(result).map((s) => s.existingId)).toEqual(['1']);
  });
});
