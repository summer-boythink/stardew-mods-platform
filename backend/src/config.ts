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
