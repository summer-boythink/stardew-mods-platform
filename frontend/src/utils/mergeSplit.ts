import type { SplitUploadResult, UploadSkippedItem } from '../api/client';
import type { ModRecord } from '../types';

/**
 * 合并两轮拆分上传的结果（第一轮默认跳过重复 → 用户确认覆盖 → 第二轮覆盖）。
 * - created：两轮创建的记录按 id 去重（第二轮覆盖的保留第二轮数据）
 * - skipped：第二轮中「已在第一轮创建」的条目不再显示为跳过；第二轮真正跳过的保留
 */
export function mergeSplitResults(first: SplitUploadResult, second: SplitUploadResult): SplitUploadResult {
  const createdMap = new Map<string, ModRecord>();
  for (const c of first.created) createdMap.set(c.id, c);
  for (const c of second.created) createdMap.set(c.id, c);

  const firstCreatedIds = new Set(first.created.map((c) => c.id));
  const secondCreatedIds = new Set(second.created.map((c) => c.id));

  const skipped: UploadSkippedItem[] = [];
  const seen = new Set<string>();
  const pushSkipped = (s: UploadSkippedItem): void => {
    const key = `${s.existingId ?? s.name}|${s.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    skipped.push(s);
  };

  for (const s of first.skipped) {
    // 第一轮被跳过、第二轮已覆盖 → 不再算跳过
    if (s.existingId && secondCreatedIds.has(s.existingId)) continue;
    pushSkipped(s);
  }
  for (const s of second.skipped) {
    // 第二轮把第一轮已创建的又报成「已存在」→ 忽略，不重复打扰用户
    if (s.existingId && firstCreatedIds.has(s.existingId)) continue;
    pushSkipped(s);
  }

  return { mode: 'split', created: Array.from(createdMap.values()), skipped };
}

/** 拆分结果里还能尝试覆盖的条目（有权限且带 existingId） */
export function overwritableItems(result: SplitUploadResult): UploadSkippedItem[] {
  return result.skipped.filter((s) => !!s.existingId && s.canOverwrite);
}
