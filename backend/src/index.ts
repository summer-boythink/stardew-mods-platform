import fs from 'node:fs';
import { createApp } from './app';
import { config, dbFile, storageDir, tmpDir } from './config';
import { getDb } from './db';
import { ensureStorageDirs } from './services/storageService';

function main(): void {
  ensureStorageDirs([config.dataDir, storageDir(), tmpDir()]);
  // 预创建空库文件，避免首次写时目录缺失
  if (!fs.existsSync(dbFile())) {
    fs.writeFileSync(dbFile(), JSON.stringify({ users: [], teams: [], members: [], mods: [] }, null, 2), 'utf-8');
  }
  getDb(dbFile());

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

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
    console.log(`[backend] data dir: ${config.dataDir}`);
  });
}

main();
