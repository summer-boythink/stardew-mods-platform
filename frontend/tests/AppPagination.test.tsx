import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppPagination } from '../src/components/AppPagination';

describe('AppPagination（桌面 + 手机双分页）', () => {
  test('同时输出桌面页码与手机大按钮分页', () => {
    const html = renderToStaticMarkup(
      <AppPagination
        page={2}
        pageCount={8}
        total={96}
        label="测试分页"
        onPageChange={() => undefined}
      />,
    );
    expect(html).toContain('pager-row--desktop');
    expect(html).toContain('pv-pagination');
    expect(html).toContain('mobile-pager');
    expect(html).toContain('上一页');
    expect(html).toContain('下一页');
    expect(html).toContain('第 <strong>2</strong> / 8 页');
    expect(html).toContain('共 96 份');
  });

  test('第一页禁用上一页，最后一页禁用下一页', () => {
    const first = renderToStaticMarkup(
      <AppPagination
        page={1}
        pageCount={3}
        total={20}
        label="测试分页"
        onPageChange={() => undefined}
      />,
    );
    expect(first).toContain('disabled');

    const last = renderToStaticMarkup(
      <AppPagination
        page={3}
        pageCount={3}
        total={20}
        label="测试分页"
        onPageChange={() => undefined}
      />,
    );
    expect(last).toContain('disabled');
  });

  test('只有一页时不渲染分页', () => {
    const html = renderToStaticMarkup(
      <AppPagination
        page={1}
        pageCount={1}
        total={3}
        label="测试分页"
        onPageChange={() => undefined}
      />,
    );
    expect(html).toBe('');
  });
});
