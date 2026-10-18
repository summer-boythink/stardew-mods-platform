import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import authRoutes from './routes/auth';
import modsRoutes from './routes/mods';
import storageRoutes from './routes/storage';
import teamsRoutes from './routes/teams';
import { errorHandler, notFound } from './middleware/errorHandler';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // 反代部署时 TRUST_PROXY=1，req.ip 取真实客户端 IP（登录限流依赖它）
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors());
  app.use(morgan('tiny'));
  app.use(express.json({ limit: '1mb' }));

  // 外层限流：认证接口防爆破，验证码防刷，上传防滥用
  // （登录 5 次/小时的精确语义由 routes/auth 内 attempts 实现，这里是兜底）
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7' });
  const captchaLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    message: { error: '验证码获取过于频繁，请稍后再试' },
  });
  const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: 'draft-7' });
  app.use('/api/auth', authLimiter);
  app.use('/api/auth/captcha', captchaLimiter);
  app.use('/api/mods/upload', uploadLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'stardew-mods-platform', time: new Date().toISOString() });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/mods', modsRoutes);
  app.use('/api/storage', storageRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
