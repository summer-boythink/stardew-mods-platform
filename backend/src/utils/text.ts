import path from 'node:path';

/** slug 化标题，用于 URL 友好展示（中文保留，空格转横线） */
export function slugify(input: string, fallback = 'mod'): string {
  const base = (input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || fallback;
}

/** 下载文件名 Content-Disposition（兼容中文） */
export function contentDisposition(filename: string): string {
  const safe = path.basename(filename).replace(/["\r\n]/g, '');
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encoded}`;
}

/** 从一堆文件名中提取关键词做 tags 补充 */
export function keywordsFromText(text: string, limit = 6): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'mod', 'stardew', 'valley', 'content', 'patcher']);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 18 && !stop.has(w));
  const uniq: string[] = [];
  for (const w of words) {
    if (!uniq.includes(w)) uniq.push(w);
    if (uniq.length >= limit) break;
  }
  return uniq;
}
