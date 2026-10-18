import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { IButton, ICard } from '../src/components/island';

/**
 * 回归防护：animal-island-ui 的 Button
 * - `type` 是外观变体（default/primary/...），HTML 按钮类型必须走 `htmlType`（库默认 "button"）
 * - 如果提交按钮没有 htmlType="submit"，表单点击将静默无响应（历史 bug，勿回退）
 */
describe('IButton（表单提交适配层）', () => {
  test('htmlType="submit" 渲染为 type="submit"，带 primary 样式', () => {
    const html = renderToStaticMarkup(
      <form>
        <IButton islandType="primary" htmlType="submit">
          注册并登录
        </IButton>
      </form>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('btn-primary');
  });

  test('默认不误触发提交：渲染为 type="button"', () => {
    const html = renderToStaticMarkup(<IButton>取消</IButton>);
    expect(html).toContain('type="button"');
    expect(html).not.toContain('type="submit"');
  });

  test('ghost 变体走布尔 prop，仍为 type="button"', () => {
    const html = renderToStaticMarkup(<IButton islandType="ghost">退出</IButton>);
    expect(html).toContain('type="button"');
    expect(html).toContain('ghost');
  });

  test('loading 时禁用，防止重复提交', () => {
    const html = renderToStaticMarkup(
      <IButton islandType="primary" htmlType="submit" loading>
        注册并登录
      </IButton>,
    );
    expect(html).toContain('disabled');
  });

  test('不使用不存在的 variant（secondary 会丢样式）', () => {
    const html = renderToStaticMarkup(<IButton>普通</IButton>);
    expect(html).not.toContain('secondary');
    expect(html).toContain('btn-default');
  });
});

describe('ICard（卡片适配层）', () => {
  test('使用库内置合法色 app-pink', () => {
    const html = renderToStaticMarkup(
      <ICard>
        <span>hi</span>
      </ICard>,
    );
    expect(html).toContain('app-pink');
  });
});
