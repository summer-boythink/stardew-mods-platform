import { describe, expect, test } from 'bun:test';
import { issueCaptcha, verifyCaptcha } from '../src/services/captchaService';
import { checkLimits, clearFails, recordFail } from '../src/utils/attempts';

describe('captcha（图形验证码）', () => {
  test('签发→正确核销→复用被拒（一次性）', () => {
    process.env.E2E_CAPTCHA_PEEK = '1';
    const c = issueCaptcha();
    try {
      expect(c.captchaId.length).toBeGreaterThan(10);
      expect(c.svg).toContain('<svg');
      expect(c.code?.length).toBe(4);
      expect(verifyCaptcha(c.captchaId, c.code ?? '').ok).toBe(true);
      // 用过即焚：第二次用同一 id 必失败
      const reuse = verifyCaptcha(c.captchaId, c.code ?? '');
      expect(reuse.ok).toBe(false);
    } finally {
      delete process.env.E2E_CAPTCHA_PEEK;
    }
  });

  test('填错同样焚毁，且返回 mismatch', () => {
    const c = issueCaptcha();
    const bad = verifyCaptcha(c.captchaId, 'zzzz');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('mismatch');
    // 已焚毁：即使之后填对也过期
    expect(verifyCaptcha(c.captchaId, 'zzzz').ok).toBe(false);
  });

  test('缺失参数与未知 id', () => {
    expect(verifyCaptcha('', '').ok).toBe(false);
    expect(verifyCaptcha('no-such-id', 'abcd').ok).toBe(false);
  });

  test('过期验证码被拒', async () => {
    process.env.E2E_CAPTCHA_PEEK = '1';
    process.env.CAPTCHA_TTL_MS = '40';
    const c = issueCaptcha();
    try {
      await new Promise((r) => setTimeout(r, 80));
      const res = verifyCaptcha(c.captchaId, c.code ?? '');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('expired');
    } finally {
      delete process.env.E2E_CAPTCHA_PEEK;
      delete process.env.CAPTCHA_TTL_MS;
    }
  });
});

describe('attempts（登录防爆破计数）', () => {
  test('5 次失败锁定，第 6 次 locked；成功清零', () => {
    const key = `ut:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 4; i += 1) recordFail(key);
    const before = checkLimits([key], 5);
    expect(before.locked).toBe(false);
    expect(before.remaining).toBe(1);
    recordFail(key);
    const locked = checkLimits([key], 5);
    expect(locked.locked).toBe(true);
    expect(locked.remaining).toBe(0);
    expect(locked.retryAfterSec).toBeGreaterThan(0);
    clearFails(key);
    expect(checkLimits([key], 5).locked).toBe(false);
  });

  test('多维度联合：任一超限即锁', () => {
    const a = `ut-a:${Date.now()}`;
    const b = `ut-b:${Date.now()}`;
    for (let i = 0; i < 5; i += 1) recordFail(a);
    expect(checkLimits([a, b], 5).locked).toBe(true);
    clearFails(a);
    clearFails(b);
  });
});
