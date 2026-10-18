import { createApp } from './app';
import { config, dbPath, storageDir, tmpDir } from './config';
import { getDb, initDb } from './db';
import { ensureStorageDirs } from './services/storageService';

function main(): void {
  ensureStorageDirs([config.dataDir, storageDir(), tmpDir()]);

  // 初始化 SQLite（首次启动自动建表；检测到旧 db.json 会自动迁移并备份）
  const db = initDb(dbPath());

  if (config.jwtSecret === 'dev-only-secret-change-me') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[fatal] 生产环境禁止使用默认 JWT_SECRET，请设置环境变量 JWT_SECRET 后重启。');
      process.exit(1);
    }
    console.warn('[warn] 正在使用默认 JWT_SECRET，仅适合本地开发；生产请设置环境变量 JWT_SECRET');
  }

  // 最后兜底：个别漏网的异步异常记录日志，避免直接拖垮服务进程
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
  });

  // 优雅退出：关闭数据库（WAL 落盘）后再结束
  const shutdown = (signal: string): void => {
    console.log(`[backend] ${signal} received, shutting down…`);
    try {
      getDb().close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
    console.log(`[backend] data dir: ${config.dataDir}`);
    console.log(`[backend] sqlite: ${dbPath()}`);
  });
}

main();
