import { randomUUID } from 'node:crypto';
import svgCaptcha from 'svg-captcha';

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

const store = new Map<string, CaptchaEntry>();

function ttlMs(): number {
  const raw = Number(process.env.CAPTCHA_TTL_MS ?? 5 * 60 * 1000);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * 60 * 1000;
}

/** 惰性清理过期项，防止内存缓慢增长 */
function purge(): void {
  if (store.size === 0) return;
  const now = Date.now();
  for (const [id, e] of store) {
    if (e.expiresAt <= now) store.delete(id);
  }
  // 极端兜底：条目过多时删最旧的（Map 保持插入序）
  const MAX = 5000;
  while (store.size > MAX) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

// 兜底定时清理；unref 避免在测试/脚本环境中拖住进程退出
const sweep = setInterval(purge, 60 * 1000);
if (typeof sweep === 'object' && typeof (sweep as unknown as { unref?: () => void }).unref === 'function') {
  (sweep as unknown as { unref: () => void }).unref();
}

export interface IssuedCaptcha {
  captchaId: string;
  svg: string;
  /** 仅测试环境（E2E_CAPTCHA_PEEK=1）返回，生产永远不返回 */
  code?: string;
}

/** 签发一次性图形验证码（4 位，排除易混淆字符） */
export function issueCaptcha(): IssuedCaptcha {
  purge();
  const c = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1iIl',
    noise: 3,
    color: true,
    background: '#fff7fa',
    width: 128,
    height: 48,
    fontSize: 44,
  });
  const captchaId = randomUUID();
  store.set(captchaId, { code: c.text.toLowerCase(), expiresAt: Date.now() + ttlMs() });
  const out: IssuedCaptcha = { captchaId, svg: c.data };
  if (process.env.E2E_CAPTCHA_PEEK === '1') out.code = c.text;
  return out;
}

export type CaptchaFailure = 'missing' | 'expired' | 'mismatch';

/**
 * 校验验证码（一次性：无论成功失败，用过即焚，防止撞库复用）。
 * 返回 ok 或失败原因，由路由层翻译成中文提示。
 */
export function verifyCaptcha(captchaId: string, input: string): { ok: true } | { ok: false; reason: CaptchaFailure } {
  const id = (captchaId ?? '').trim();
  const code = (input ?? '').trim().toLowerCase();
  const entry = id ? store.get(id) : undefined;
  if (id) store.delete(id);
  if (!id || !code) return { ok: false, reason: 'missing' };
  if (!entry) return { ok: false, reason: 'expired' };
  if (Date.now() > entry.expiresAt) return { ok: false, reason: 'expired' };
  if (entry.code !== code) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

export function captchaFailureMessage(reason: CaptchaFailure): string {
  if (reason === 'missing') return '请填写图形验证码';
  if (reason === 'expired') return '验证码已过期，请重新获取';
  return '验证码错误，请重新获取';
}
