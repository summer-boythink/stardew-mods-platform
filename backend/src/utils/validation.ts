import { z } from 'zod';
import { MOD_CATEGORIES } from '../types';

export const usernameSchema = z
  .string()
  .trim()
  .min(2, '用户名至少 2 个字符')
  .max(24, '用户名最多 24 个字符')
  .regex(/^[A-Za-z0-9_\u4e00-\u9fa5-]+$/, '用户名仅支持中英文、数字、下划线、中划线');

export const passwordSchema = z.string().min(6, '密码至少 6 位').max(72, '密码过长');

const captchaFields = {
  captchaId: z.string().trim().min(1, '请填写图形验证码').max(128, '验证码参数异常'),
  captcha: z.string().trim().min(1, '请填写图形验证码').max(12, '验证码格式错误'),
};

/** 注册：用户名 + 双密码（必须一致） + 图形验证码 */
export const registerSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(72, '密码过长'),
    ...captchaFields,
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: '两次输入的密码不一致' });
    }
  });

/** 登录：用户名 + 密码 + 图形验证码（密码只判空，不泄露长度策略） */
export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(24, '用户名格式错误'),
  password: z.string().min(1, '请输入密码').max(72, '密码过长'),
  ...captchaFields,
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, '团队名至少 2 个字符').max(40, '团队名最多 40 个字符'),
  description: z.string().trim().max(500, '团队介绍最多 500 字').default(''),
});

export const uploadFieldsSchema = z.object({
  scope: z.enum(['personal', 'team', 'public']).default('personal'),
  teamId: z.string().trim().max(64).optional().default(''),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  title: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.enum([...MOD_CATEGORIES] as [string, ...string[]]).optional(),
  tags: z.string().trim().max(500).optional().default(''),
  /** '1' 时：压缩包/文件夹含多个 Mod 则拆分为多个独立记录（否则合并为合集包） */
  split: z.enum(['0', '1']).optional().default('0'),
  /** '1' 时：遇到重复 Mod 直接覆盖（无需 overwriteIds） */
  overwrite: z.enum(['0', '1']).optional().default('0'),
  /** JSON 数组：仅覆盖这些已存在记录 id（前端确认弹窗后回传） */
  overwriteIds: z.string().max(20000).optional().default(''),
});

export const updateModSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.enum([...MOD_CATEGORIES] as [string, ...string[]]).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
});

export function parseTags(input: string | string[] | undefined): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input.join(',') : input;
  return raw
    .split(/[,，、\s]+/)
    .map((t) => t.trim().replace(/^#/, '').slice(0, 24))
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 12);
}

export function clampPage(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}

export function clampPageSize(value: unknown, fallback = 12): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(60, Math.max(1, Math.floor(n)));
}
