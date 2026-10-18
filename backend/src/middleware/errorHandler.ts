import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 不会自动捕获 async 处理器里抛出的异常（会导致未处理的 Promise 拒绝）。
 * 统一用它包装所有 async 路由，把异常转发给错误中间件。
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** 统一错误中间件：保证所有报错都是 JSON、状态码语义正确、不泄露内部信息 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    // 已经开始发送响应（如下载中途出错），只能中断连接
    res.destroy();
    return;
  }

  // multer 上传限制类错误：按语义返回友好提示
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: unknown }).code ?? '');
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: '上传文件过大（单次上限 500MB）' });
      return;
    }
    if (
      code === 'LIMIT_FILE_COUNT' ||
      code === 'LIMIT_PART_COUNT' ||
      code === 'LIMIT_FIELD_COUNT' ||
      code === 'LIMIT_FIELD_KEY' ||
      code === 'LIMIT_FIELD_VALUE'
    ) {
      res.status(413).json({ error: '上传内容过多，请分批上传（最多 2000 个文件）' });
      return;
    }
    if (code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: '上传字段异常，请刷新页面重试' });
      return;
    }
  }

  // express.json 解析失败
  if (err instanceof SyntaxError && 'body' in (err as unknown as Record<string, unknown>)) {
    res.status(400).json({ error: '请求体不是合法 JSON' });
    return;
  }

  // 未知错误：服务端记录完整信息用于排查，客户端只返回通用文案（避免泄露内部路径等）
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误，请稍后再试' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: '接口不存在' });
}
