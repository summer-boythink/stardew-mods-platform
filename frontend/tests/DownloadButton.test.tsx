import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DownloadButton } from '../src/components/DownloadButton';
import type { ModRecord } from '../src/types';

function makeMod(over: Partial<ModRecord>): ModRecord {
  return {
    id: 'm-1',
    slug: 'demo',
    title: '演示 Mod',
    description: '',
    category: '功能玩法',
    tags: [],
    scope: 'personal',
    visibility: 'private',
    ownerId: 'u-1',
    ownerName: 'owner',
    teamId: null,
    teamName: null,
    subMods: [],
    fileName: 'archive.zip',
    fileSize: 100,
    fileCount: 1,
    fileTree: [],
    previewImages: [],
    downloadCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * 回归防护：私有/团队 Mod 不能用 <a href> 下载（浏览器不会带 Authorization 头 → 403），
 * 必须渲染成走 fetch+Blob 的 button；公开 Mod 保持普通链接（流式下载）。
 */
describe('DownloadButton（下载鉴权适配）', () => {
  test('公开 Mod 渲染为普通链接', () => {
    const html = renderToStaticMarkup(<DownloadButton mod={makeMod({ visibility: 'public' })} />);
    expect(html).toContain('<a');
    expect(html).toContain('/api/mods/m-1/download');
    expect(html).not.toContain('<button');
  });

  test('私有 Mod 渲染为 button（带 Token 拉取），不是裸链接', () => {
    const html = renderToStaticMarkup(<DownloadButton mod={makeMod({ visibility: 'private' })} />);
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('<a');
  });

  test('团队 Mod 同样走 button 鉴权路径', () => {
    const html = renderToStaticMarkup(<DownloadButton mod={makeMod({ visibility: 'team' })} />);
    expect(html).toContain('<button');
  });
});
