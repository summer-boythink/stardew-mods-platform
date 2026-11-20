import type { PixelValeTheme } from '@pixelvale/ui';

export type AppTheme = PixelValeTheme;

export const APP_THEME_ORDER: AppTheme[] = ['day', 'autumn', 'night'];

const THEME_KEY = 'stardew_pv_theme';

export const THEME_META: Record<
  AppTheme,
  { label: string; icon: 'sun' | 'leaf' | 'moon'; nextLabel: string }
> = {
  day: { label: '白天', icon: 'sun', nextLabel: '秋日' },
  autumn: { label: '秋日', icon: 'leaf', nextLabel: '夜晚' },
  night: { label: '夜晚', icon: 'moon', nextLabel: '白天' },
};

export function nextTheme(theme: AppTheme): AppTheme {
  const index = APP_THEME_ORDER.indexOf(theme);
  return APP_THEME_ORDER[(index + 1) % APP_THEME_ORDER.length] ?? 'day';
}

export function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'day' || stored === 'autumn' || stored === 'night') return stored;
  } catch {
    /* private mode */
  }
  return 'day';
}

export function storeTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}
