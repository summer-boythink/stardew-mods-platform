/**
 * 登录/注册防爆破：滑动窗口计数器（内存版）。
 * - key 示例：`login:ip:1.2.3.4` / `login:acct:张三` / `register:ip:1.2.3.4`
 * - value 为失败时间戳数组；读时惰性裁剪窗口外记录
 * - 单机部署足够；多实例部署时请换 Redis（接口保持 timestamp[] 语义即可迁移）
 */

const buckets = new Map<string, number[]>();

function windowMs(): number {
  const raw = Number(process.env.LOGIN_WINDOW_MS ?? 60 * 60 * 1000);
  return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60 * 1000;
}

export function loginMaxFails(): number {
  const raw = Number(process.env.LOGIN_MAX_FAILS ?? 5);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

function prune(key: string, now: number): number[] {
  const win = windowMs();
  const arr = buckets.get(key) ?? [];
  const kept = arr.filter((t) => now - t < win);
  if (kept.length === 0) buckets.delete(key);
  else buckets.set(key, kept);
  return kept;
}

/** 记录一次失败 */
export function recordFail(key: string): number {
  const now = Date.now();
  const arr = prune(key, now);
  arr.push(now);
  // 长度兜底，避免异常循环调用撑爆内存
  buckets.set(key, arr.slice(-loginMaxFails() * 4));
  return arr.length;
}

/** 当前窗口内失败次数 */
export function failCount(key: string): number {
  return prune(key, Date.now()).length;
}

/** 成功后清零（登录成功即洗白，避免正常用户被误锁） */
export function clearFails(key: string): void {
  buckets.delete(key);
}

/**
 * 多维度联合判定：任一维度达到上限即锁定。
 * 返回剩余可试次数与锁定剩余秒数。
 */
export function checkLimits(keys: string[], limit: number): { locked: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const win = windowMs();
  let worst = 0;
  let oldestInWindow = 0;
  for (const k of keys) {
    const arr = prune(k, now);
    worst = Math.max(worst, arr.length);
    if (arr.length >= limit && arr.length > 0) {
      oldestInWindow = oldestInWindow === 0 ? arr[0] : Math.min(oldestInWindow, arr[0]);
    }
  }
  const remaining = Math.max(0, limit - worst);
  if (worst < limit) return { locked: false, remaining, retryAfterSec: 0 };
  const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + win - now) / 1000));
  return { locked: true, remaining: 0, retryAfterSec };
}

// 兜底定时清理；unref 避免拖住进程退出
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k] of buckets) prune(k, now);
}, 10 * 60 * 1000);
if (typeof sweep === 'object' && typeof (sweep as unknown as { unref?: () => void }).unref === 'function') {
  (sweep as unknown as { unref: () => void }).unref();
}
