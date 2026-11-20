import { randomUUID } from 'node:crypto';
import path from 'node:path';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: num('PORT', 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  dataDir: process.env.DATA_DIR ?? path.resolve(__dirname, '..', 'data'),
  /** 单次上传上限（默认 500MB） */
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 500 * 1024 * 1024),
  /** 个人空间配额（默认 2GB） */
  personalQuotaBytes: num('PERSONAL_QUOTA_BYTES', 2 * 1024 * 1024 * 1024),
  /** 团队空间配额（默认 10GB） */
  teamQuotaBytes: num('TEAM_QUOTA_BYTES', 10 * 1024 * 1024 * 1024),
  /** zip 炸弹防护：解压后上限（默认 1GB） */
  maxExtractedBytes: num('MAX_EXTRACTED_BYTES', 1024 * 1024 * 1024),
  maxExtractedFiles: num('MAX_EXTRACTED_FILES', 20000),
  /**
   * 从 Nexus / CurseForge 自动导入 Mod：
   * - Nexus Mods v3 API Key（公开部署前请按 Nexus API AUP 注册应用）
   * - CurseForge for Studios API Key
   * 不配置时对应来源会显示为不可用，绝不会退回网页抓取。
   */
  nexusApiKey: process.env.NEXUS_API_KEY?.trim() ?? '',
  /** 可覆盖上游 API 地址（开发/集成测试用；默认官方地址） */
  nexusApiBase: (process.env.NEXUS_API_BASE?.trim() || 'https://api.nexusmods.com/v3').replace(/\/+$/, ''),

  nexusAppName: process.env.NEXUS_APPLICATION_NAME?.trim() || 'Stardew Mods Platform',
  nexusAppVersion: process.env.NEXUS_APPLICATION_VERSION?.trim() || '1.0.0',
  curseForgeApiKey: process.env.CURSEFORGE_API_KEY?.trim() ?? '',
  curseForgeApiBase: (process.env.CURSEFORGE_API_BASE?.trim() || 'https://api.curseforge.com/v1').replace(/\/+$/, ''),

  /** 可选：Stardew Valley 在 CurseForge 的 gameId；留空自动发现 */
  curseForgeGameId: process.env.CURSEFORGE_GAME_ID?.trim() ?? '',
  /** 自动导入单文件上限，最终还会受 maxUploadBytes 限制 */
  importMaxBytes: num('IMPORT_MAX_BYTES', 500 * 1024 * 1024),
  /** 下载与上游 API 请求超时（默认 5 分钟） */
  importTimeoutMs: num('IMPORT_TIMEOUT_MS', 5 * 60 * 1000),
  /** 回环调用现有上传接口的超时（默认 10 分钟） */
  importUploadTimeoutMs: num('IMPORT_UPLOAD_TIMEOUT_MS', 10 * 60 * 1000),
  /** 仅开发/集成测试：允许下载链接使用 http/本机地址。生产勿开。 */
  importAllowInsecure: process.env.IMPORT_ALLOW_INSECURE === '1',
  /** 进程内随机令牌：让服务端自己的回环上传跳过按 IP 的外部上传限流。 */
  importInternalToken: randomUUID(),
  /**
   * 反向代理信任（nginx 等后面部署时设为 1，让 req.ip 取到真实客户端 IP，
   * 登录限流才准确；直连部署保持 0，避免 X-Forwarded-For 伪造绕过 IP 限流）
   */
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : 0,
};

export function storageDir(): string {
  return path.join(config.dataDir, 'storage');
}

export function tmpDir(): string {
  return path.join(config.dataDir, 'tmp');
}

/** SQLite 数据库文件路径（app.db 为当前主库；旧版为 db.json，首次启动自动迁移） */
export function dbPath(): string {
  return path.join(config.dataDir, 'app.db');
}
