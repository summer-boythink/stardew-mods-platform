import type { NextFunction, Request, Response } from 'express';

/** 统一错误中间件：保证所有报错都是 JSON 且不泄露堆栈 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // multer 文件过大等错误
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE' || code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(413).json({ error: '上传文件过大或字段异常（单次上限 500MB）' });
      return;
    }
  }
  const message = err instanceof Error ? err.message : '服务器内部错误';
  // 业务错误约定以特定前缀/状态抛出时已经直接 res，这里兜底 500
  if (res.headersSent) return;
  res.status(500).json({ error: message || '服务器内部错误' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: '接口不存在' });
}
