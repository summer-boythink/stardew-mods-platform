import { describe, expect, test } from 'bun:test';
import { APP_THEME_ORDER, nextTheme } from '../src/theme';

describe('theme cycle', () => {
  test('cycles day -> autumn -> night -> day', () => {
    expect(nextTheme('day')).toBe('autumn');
    expect(nextTheme('autumn')).toBe('night');
    expect(nextTheme('night')).toBe('day');
  });

  test('every registered theme has a next theme', () => {
    for (const theme of APP_THEME_ORDER) {
      expect(APP_THEME_ORDER).toContain(nextTheme(theme));
    }
  });
});
