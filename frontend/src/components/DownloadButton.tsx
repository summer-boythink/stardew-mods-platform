import { useState } from 'react';
import { downloadModFile, modDownloadUrl } from '../api/client';
import type { ModRecord } from '../types';

/**
 * 下载按钮：公开 Mod 用普通链接（浏览器流式下载、零内存占用）；
 * 私有/团队 Mod 必须带 Token 请求（<a href> 不会带 Authorization 头，会 403），
 * 走 fetch → Blob → 临时链接保存。
 */
export function DownloadButton({
  mod,
  className = 'btn btn-primary',
  label,
}: {
  mod: ModRecord;
  className?: string;
  label?: React.ReactNode;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const text = label ?? '⬇ 下载';

  if (mod.visibility === 'public') {
    return (
      <a className={className} href={modDownloadUrl(mod.id)}>
        {text}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        downloadModFile(mod.id, mod.fileName)
          .catch((e) => alert(e instanceof Error ? e.message : '下载失败'))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? '下载中…' : text}
    </button>
  );
}
