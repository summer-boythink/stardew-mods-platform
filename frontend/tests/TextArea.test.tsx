import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextArea } from '../src/components/TextArea';

describe('TextArea（像素风格多行输入）', () => {
  test('label 与 textarea 通过 id 关联', () => {
    const html = renderToStaticMarkup(<TextArea label="介绍" defaultValue="hi" />);
    expect(html).toContain('<label');
    expect(html).toContain('介绍');
    expect(html).toContain('<textarea');
    expect(html).toContain('for="');
    expect(html).toContain('id="');
  });

  test('错误信息使用 role=alert 并标记 aria-invalid', () => {
    const html = renderToStaticMarkup(<TextArea label="介绍" error="内容太长" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('内容太长');
  });

  test('hint 通过 aria-describedby 提供说明', () => {
    const html = renderToStaticMarkup(<TextArea label="介绍" hint="最多 2000 字" />);
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('最多 2000 字');
  });
});
